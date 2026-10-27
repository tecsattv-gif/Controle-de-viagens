from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Depends, Header, BackgroundTasks
from fastapi.responses import Response, StreamingResponse
import json
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import math
import re
import requests
import bcrypt
import jwt
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Object storage (managed) — used for driver/vehicle photos
# ---------------------------------------------------------------------------
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "controle-viagens"
storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Authentication — email/password (JWT) + Emergent Google session tokens.
# Every data record is scoped to the authenticated user's user_id.
# ---------------------------------------------------------------------------
JWT_SECRET = os.environ.get("JWT_SECRET", "change-me")
JWT_ALG = "HS256"

# ---------------------------------------------------------------------------
# Licensing / activation (trial, device binding, admin-approved payment)
# ---------------------------------------------------------------------------
ADMIN_EMAILS = {e.strip().casefold() for e in (os.environ.get("ADMIN_EMAILS", "") or "").split(",") if e.strip()}
TRIAL_DAYS = 30


def is_admin(user: dict) -> bool:
    return (user.get("email", "") or "").strip().casefold() in ADMIN_EMAILS


class RegisterIn(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = ""
    device_id: Optional[str] = ""


class LoginIn(BaseModel):
    email: str
    password: str
    device_id: Optional[str] = ""


class SessionIn(BaseModel):
    session_id: str
    device_id: Optional[str] = ""


def issue_jwt(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "typ": "password", "iat": now, "exp": now + timedelta(days=7)},
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


def public_user(u: dict) -> dict:
    return {
        "user_id": u["user_id"],
        "email": u.get("email", ""),
        "display_name": u.get("display_name", ""),
        "picture": u.get("picture", ""),
        "providers": u.get("providers", []),
        "app_currency": u.get("app_currency", "EUR"),
        "app_language": u.get("app_language", "pt-BR"),
        "company_name": u.get("company_name", ""),
        "company_logo_path": u.get("company_logo_path", ""),
        **license_public(u),
    }


async def resolve_user_id(token: str) -> Optional[str]:
    # 1) Email/password JWT.
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        if payload.get("typ") == "password" and payload.get("sub"):
            return str(payload["sub"])
    except jwt.PyJWTError:
        pass
    # 2) Emergent Google session token.
    sess = await db.user_sessions.find_one({"session_token": token})
    if sess and sess.get("user_id"):
        exp = sess.get("expires_at")
        if exp:
            exp_dt = datetime.fromisoformat(exp) if isinstance(exp, str) else exp
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if exp_dt < datetime.now(timezone.utc):
                return None
        return str(sess["user_id"])
    return None


async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_device_id: Optional[str] = Header(None, alias="X-Device-Id"),
) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Não autenticado", headers={"WWW-Authenticate": "Bearer"})
    token = authorization.split(" ", 1)[1].strip()
    user_id = await resolve_user_id(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada", headers={"WWW-Authenticate": "Bearer"})
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    # Device binding: a bound account may only be used from its authorized device.
    if not is_admin(user):
        bound = user.get("device_id")
        if bound and x_device_id and x_device_id.strip() != bound:
            raise HTTPException(
                status_code=403,
                detail={"code": "device", "message": "Esta conta está vinculada a outro dispositivo. Peça ao administrador para desvincular."},
            )
    return user


def days_left(u: dict) -> int:
    ends = u.get("trial_ends_at")
    if not ends:
        return 0
    try:
        end_dt = datetime.fromisoformat(ends)
    except ValueError:
        return 0
    if end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=timezone.utc)
    secs = (end_dt - datetime.now(timezone.utc)).total_seconds()
    return max(0, math.ceil(secs / 86400))


def license_public(u: dict) -> dict:
    admin = is_admin(u)
    status = "ATIVO" if admin else (u.get("license_status") or "TESTE")
    return {
        "is_admin": admin,
        "license_status": status,
        "trial_started_at": u.get("trial_started_at"),
        "trial_ends_at": u.get("trial_ends_at"),
        "days_left": 0 if admin else days_left(u),
        "device_bound": bool(u.get("device_id")),
        "payment_method": u.get("payment_method"),
        "payment_submitted_at": u.get("payment_submitted_at"),
        "payment_note": u.get("payment_note", ""),
        "can_write": admin or status in ("ATIVO", "TESTE"),
    }


async def ensure_status(u: dict) -> str:
    """Return the effective license status, persisting a TESTE->EXPIRADO flip."""
    if is_admin(u):
        return "ATIVO"
    status = u.get("license_status") or "TESTE"
    if status == "TESTE":
        ends = u.get("trial_ends_at")
        if ends:
            try:
                end_dt = datetime.fromisoformat(ends)
                if end_dt.tzinfo is None:
                    end_dt = end_dt.replace(tzinfo=timezone.utc)
                if datetime.now(timezone.utc) > end_dt:
                    status = "EXPIRADO"
                    await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"license_status": "EXPIRADO"}})
                    u["license_status"] = "EXPIRADO"
            except ValueError:
                pass
    return status


def check_device_or_raise(u: dict, device_id: Optional[str]):
    if is_admin(u):
        return
    dev = (device_id or "").strip()
    bound = u.get("device_id")
    if bound and dev and dev != bound:
        raise HTTPException(
            status_code=403,
            detail={"code": "device", "message": "Esta conta está vinculada a outro dispositivo. Peça ao administrador para desvincular."},
        )


async def bind_and_init(u: dict, device_id: Optional[str]) -> dict:
    """On first login start the 30-day trial and bind the device (non-admin)."""
    updates = {}
    if not is_admin(u):
        if not u.get("license_status"):
            now = datetime.now(timezone.utc)
            updates["license_status"] = "TESTE"
            updates["trial_started_at"] = now.isoformat()
            updates["trial_ends_at"] = (now + timedelta(days=TRIAL_DAYS)).isoformat()
        dev = (device_id or "").strip()
        if dev and not u.get("device_id"):
            updates["device_id"] = dev
    if updates:
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": updates})
        u.update(updates)
    return u


async def require_write_access(user: dict = Depends(get_current_user)) -> dict:
    if is_admin(user):
        return user
    status = await ensure_status(user)
    if status not in ("ATIVO", "TESTE"):
        raise HTTPException(
            status_code=403,
            detail={"code": "license", "status": status,
                    "message": "Sua versão de teste terminou ou a conta não está ativa. Ative a versão completa para cadastrar ou alterar dados."},
        )
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador.")
    return user


# ---------------------------------------------------------------------------
# Models — Controle de Viagens (trip / kilometer logbook)
# ---------------------------------------------------------------------------
class Toll(BaseModel):
    value: float = 0
    currency: str = "EUR"


class Trip(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # start date yyyy-mm-dd
    end_date: str = ""  # end date yyyy-mm-dd (multi-day trips)
    km_start: int
    km_end: int
    start_time: str = ""  # HH:mm
    end_time: str = ""  # HH:mm
    loading_place: str = ""
    unloading_place: str = ""
    rest_place: str = ""
    rest_stops: List[str] = []
    notes: str = ""
    freight_gross: float = 0
    freight_gross_currency: str = "EUR"
    freight_net: float = 0
    freight_net_currency: str = "EUR"
    freight_paid: float = 0
    freight_paid_currency: str = "EUR"
    freight_payment_date: str = ""  # yyyy-mm-dd (opcional)
    freight_status: str = "Não informado"  # Não informado | A receber | Parcialmente recebido | Pago
    freight_diesel: float = 0
    freight_diesel_currency: str = "EUR"
    freight_arla: float = 0
    freight_arla_currency: str = "EUR"
    tolls: List[Toll] = []
    # Composition / driver snapshot (frozen at creation so old trips are
    # unaffected if a vehicle or driver is edited/deleted later).
    vehicle_id: str = ""
    vehicle_label: str = ""
    driver_id: str = ""
    driver_name: str = ""
    driver_license: str = ""
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None

    @property
    def km(self) -> int:
        return max(0, self.km_end - self.km_start)


class TripCreate(BaseModel):
    date: str
    end_date: str = ""
    km_start: int
    km_end: int
    start_time: str = ""
    end_time: str = ""
    loading_place: str = ""
    unloading_place: str = ""
    rest_place: str = ""
    rest_stops: List[str] = []
    notes: str = ""
    freight_gross: float = 0
    freight_gross_currency: str = "EUR"
    freight_net: float = 0
    freight_net_currency: str = "EUR"
    freight_paid: float = 0
    freight_paid_currency: str = "EUR"
    freight_payment_date: str = ""
    freight_status: str = "Não informado"
    freight_diesel: float = 0
    freight_diesel_currency: str = "EUR"
    freight_arla: float = 0
    freight_arla_currency: str = "EUR"
    tolls: List[Toll] = []
    vehicle_id: str = ""
    vehicle_label: str = ""
    driver_id: str = ""
    driver_name: str = ""
    driver_license: str = ""


def serialize(trip: Trip) -> dict:
    data = trip.dict()
    data.pop("deleted_at", None)
    data["km"] = trip.km
    return data


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"message": "Controle de Viagens API"}


@api_router.post("/auth/register")
async def register(body: RegisterIn):
    email = (body.email or "").strip().casefold()
    if not email or len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Informe um e-mail e uma senha de pelo menos 4 caracteres.")
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Já existe uma conta com este e-mail.")
    uid = "user_" + uuid.uuid4().hex[:12]
    pw_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()
    name = (body.display_name or "").strip() or email.split("@")[0]
    doc = {
        "user_id": uid, "email": email, "display_name": name,
        "password_hash": pw_hash, "providers": ["password"], "created_at": now_iso(),
    }
    if email in ADMIN_EMAILS:
        doc["is_admin"] = True
    else:
        now = datetime.now(timezone.utc)
        doc["license_status"] = "TESTE"
        doc["trial_started_at"] = now.isoformat()
        doc["trial_ends_at"] = (now + timedelta(days=TRIAL_DAYS)).isoformat()
        dev = (body.device_id or "").strip()
        if dev:
            doc["device_id"] = dev
    await db.users.insert_one(dict(doc))
    return {"access_token": issue_jwt(uid), "token_type": "bearer", "user": public_user(doc)}


@api_router.post("/auth/login")
async def login(body: LoginIn):
    email = (body.email or "").strip().casefold()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash") or not bcrypt.checkpw(
        body.password.encode("utf-8"), user["password_hash"].encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.", headers={"WWW-Authenticate": "Bearer"})
    check_device_or_raise(user, body.device_id)
    await bind_and_init(user, body.device_id)
    await ensure_status(user)
    return {"access_token": issue_jwt(user["user_id"]), "token_type": "bearer", "user": public_user(user)}


@api_router.post("/auth/session")
async def auth_session(body: SessionIn):
    async with httpx.AsyncClient(timeout=30) as cx:
        r = await cx.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": body.session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessão do Google inválida.")
    data = r.json()
    email = (data.get("email") or "").strip().casefold()
    name = data.get("name") or (email.split("@")[0] if email else "Usuário")
    picture = data.get("picture") or ""
    sess_token = data.get("session_token")
    user = await db.users.find_one({"email": email})
    if user:
        uid = user["user_id"]
        await db.users.update_one({"user_id": uid}, {"$addToSet": {"providers": "google"}, "$set": {"picture": picture}})
    else:
        uid = "user_" + uuid.uuid4().hex[:12]
        await db.users.insert_one({
            "user_id": uid, "email": email, "display_name": name, "picture": picture,
            "providers": ["google"], "created_at": now_iso(),
        })
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await db.user_sessions.insert_one({
        "session_token": sess_token, "user_id": uid, "created_at": now_iso(), "expires_at": expires,
    })
    user = await db.users.find_one({"user_id": uid})
    check_device_or_raise(user, body.device_id)
    await bind_and_init(user, body.device_id)
    await ensure_status(user)
    return {"session_token": sess_token, "user": public_user(user)}


@api_router.get("/auth/me")
async def auth_me(user: dict = Depends(get_current_user)):
    await ensure_status(user)
    return public_user(user)


ALLOWED_CURRENCIES = {"EUR", "BRL", "USD", "GBP", "CHF"}


class CurrencyIn(BaseModel):
    currency: str


@api_router.put("/settings/currency")
async def set_currency(body: CurrencyIn, user: dict = Depends(get_current_user)):
    code = (body.currency or "").strip().upper()
    if code not in ALLOWED_CURRENCIES:
        raise HTTPException(status_code=400, detail="Moeda inválida.")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"app_currency": code}})
    user["app_currency"] = code
    return public_user(user)


ALLOWED_LANGUAGES = {"pt-BR", "pt-PT", "es", "en", "fr"}


class LanguageIn(BaseModel):
    language: str


@api_router.put("/settings/language")
async def set_language(body: LanguageIn, user: dict = Depends(get_current_user)):
    code = (body.language or "").strip()
    if code not in ALLOWED_LANGUAGES:
        raise HTTPException(status_code=400, detail="Idioma inválido.")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"app_language": code}})
    user["app_language"] = code
    return public_user(user)


class CompanyIn(BaseModel):
    company_name: str = ""
    company_logo_path: str = ""


@api_router.put("/settings/company")
async def set_company(body: CompanyIn, user: dict = Depends(get_current_user)):
    name = (body.company_name or "").strip()[:120]
    logo = (body.company_logo_path or "").strip()
    await db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {"company_name": name, "company_logo_path": logo}},
    )
    user["company_name"] = name
    user["company_logo_path"] = logo
    return public_user(user)


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"success": True}


@api_router.post("/trips")
async def create_trip(payload: TripCreate, user: dict = Depends(require_write_access)):
    if payload.km_end and payload.km_end < payload.km_start:
        raise HTTPException(
            status_code=400,
            detail="O KM final deve ser igual ou superior ao KM inicial.",
        )
    if payload.end_date and payload.end_date < payload.date:
        raise HTTPException(
            status_code=400,
            detail="A data final deve ser igual ou posterior à data inicial.",
        )
    trip = Trip(**payload.dict())
    trip.user_id = user["user_id"]
    await db.trips.insert_one(trip.dict())
    return serialize(trip)


@api_router.get("/trips")
async def list_trips(user: dict = Depends(get_current_user)):
    docs = await db.trips.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    trips = [Trip(**d) for d in docs]
    # Newest first: by date then created_at.
    trips.sort(key=lambda t: (t.date, t.created_at), reverse=True)
    return [serialize(t) for t in trips]


@api_router.put("/trips/{trip_id}")
async def update_trip(trip_id: str, payload: TripCreate, user: dict = Depends(require_write_access)):
    if payload.km_end and payload.km_end < payload.km_start:
        raise HTTPException(
            status_code=400,
            detail="O KM final deve ser igual ou superior ao KM inicial.",
        )
    if payload.end_date and payload.end_date < payload.date:
        raise HTTPException(
            status_code=400,
            detail="A data final deve ser igual ou posterior à data inicial.",
        )
    doc = await db.trips.find_one({"id": trip_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    update = payload.dict()
    await db.trips.update_one({"id": trip_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize(Trip(**doc))


@api_router.delete("/trips/{trip_id}")
async def delete_trip(trip_id: str, user: dict = Depends(require_write_access)):
    result = await db.trips.update_one(
        {"id": trip_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Viagem não encontrada")
    return {"success": True}


# ---------------------------------------------------------------------------
# Refuelings (Abastecimentos)
# ---------------------------------------------------------------------------
class Refueling(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # yyyy-mm-dd
    station_name: str = ""
    station_place: str = ""
    diesel_liters: float = 0
    diesel_price: float = 0
    arla_liters: float = 0
    arla_price: float = 0
    currency: str = "EUR"  # legado: mantido para registros antigos
    payment_method: str = "Cartão"  # legado
    card_type: str = ""  # legado
    card_name: str = ""  # legado
    km: int = 0  # KM do Diesel
    arla_km: int = 0  # KM do ARLA (independente do Diesel)
    notes: str = ""
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class RefuelingCreate(BaseModel):
    date: str
    station_name: str = ""
    station_place: str = ""
    diesel_liters: float = 0
    diesel_price: float = 0
    arla_liters: float = 0
    arla_price: float = 0
    currency: str = "EUR"
    payment_method: str = "Cartão"
    card_type: str = ""
    card_name: str = ""
    km: int = 0
    arla_km: int = 0
    notes: str = ""


def serialize_refueling(r: Refueling) -> dict:
    data = r.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/refuelings")
async def create_refueling(payload: RefuelingCreate, user: dict = Depends(require_write_access)):
    r = Refueling(**payload.dict())
    r.user_id = user["user_id"]
    await db.refuelings.insert_one(r.dict())
    return serialize_refueling(r)


@api_router.get("/refuelings")
async def list_refuelings(user: dict = Depends(get_current_user)):
    docs = await db.refuelings.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [Refueling(**d) for d in docs]
    items.sort(key=lambda x: (x.date, x.created_at), reverse=True)
    return [serialize_refueling(x) for x in items]


@api_router.put("/refuelings/{refueling_id}")
async def update_refueling(refueling_id: str, payload: RefuelingCreate, user: dict = Depends(require_write_access)):
    doc = await db.refuelings.find_one({"id": refueling_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado")
    update = payload.dict()
    await db.refuelings.update_one({"id": refueling_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_refueling(Refueling(**doc))


@api_router.delete("/refuelings/{refueling_id}")
async def delete_refueling(refueling_id: str, user: dict = Depends(require_write_access)):
    result = await db.refuelings.update_one(
        {"id": refueling_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Abastecimento não encontrado")
    return {"success": True}


# ---------------------------------------------------------------------------
# Toll expenses (Pedágios) — despesa avulsa vinculada ao usuário
# ---------------------------------------------------------------------------
class TollExpense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # yyyy-mm-dd (manual)
    value: float = 0
    place: str = ""  # local opcional (autoestrada, cidade, praça, país)
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class TollExpenseCreate(BaseModel):
    date: str
    value: float = 0
    place: str = ""


def serialize_toll_expense(t: TollExpense) -> dict:
    data = t.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/toll-expenses")
async def create_toll_expense(payload: TollExpenseCreate, user: dict = Depends(require_write_access)):
    t = TollExpense(**payload.dict())
    t.user_id = user["user_id"]
    await db.toll_expenses.insert_one(t.dict())
    return serialize_toll_expense(t)


@api_router.get("/toll-expenses")
async def list_toll_expenses(user: dict = Depends(get_current_user)):
    docs = await db.toll_expenses.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [TollExpense(**d) for d in docs]
    items.sort(key=lambda x: (x.date, x.created_at), reverse=True)
    return [serialize_toll_expense(x) for x in items]


@api_router.put("/toll-expenses/{toll_id}")
async def update_toll_expense(toll_id: str, payload: TollExpenseCreate, user: dict = Depends(require_write_access)):
    doc = await db.toll_expenses.find_one({"id": toll_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Pedágio não encontrado")
    update = payload.dict()
    await db.toll_expenses.update_one({"id": toll_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_toll_expense(TollExpense(**doc))


@api_router.delete("/toll-expenses/{toll_id}")
async def delete_toll_expense(toll_id: str, user: dict = Depends(require_write_access)):
    result = await db.toll_expenses.update_one(
        {"id": toll_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pedágio não encontrado")
    return {"success": True}


# ---------------------------------------------------------------------------
# Other expenses (Outros) — despesa avulsa: local, serviço prestado, valor
# ---------------------------------------------------------------------------
class OtherExpense(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # yyyy-mm-dd
    place: str = ""
    service: str = ""  # serviço prestado
    value: float = 0
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class OtherExpenseCreate(BaseModel):
    date: str
    place: str = ""
    service: str = ""
    value: float = 0


def serialize_other_expense(o: OtherExpense) -> dict:
    data = o.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/other-expenses")
async def create_other_expense(payload: OtherExpenseCreate, user: dict = Depends(require_write_access)):
    o = OtherExpense(**payload.dict())
    o.user_id = user["user_id"]
    await db.other_expenses.insert_one(o.dict())
    return serialize_other_expense(o)


@api_router.get("/other-expenses")
async def list_other_expenses(user: dict = Depends(get_current_user)):
    docs = await db.other_expenses.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [OtherExpense(**d) for d in docs]
    items.sort(key=lambda x: (x.date, x.created_at), reverse=True)
    return [serialize_other_expense(x) for x in items]


@api_router.put("/other-expenses/{exp_id}")
async def update_other_expense(exp_id: str, payload: OtherExpenseCreate, user: dict = Depends(require_write_access)):
    doc = await db.other_expenses.find_one({"id": exp_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    update = payload.dict()
    await db.other_expenses.update_one({"id": exp_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_other_expense(OtherExpense(**doc))


@api_router.delete("/other-expenses/{exp_id}")
async def delete_other_expense(exp_id: str, user: dict = Depends(require_write_access)):
    result = await db.other_expenses.update_one(
        {"id": exp_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Despesa não encontrada")
    return {"success": True}



# ---------------------------------------------------------------------------
# Maintenance (Manutenção) — despesa de manutenção vinculada ao usuário
# ---------------------------------------------------------------------------
class Maintenance(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str = "Mecânica"  # Mecânica | Elétrica | Borracharia | Outros
    date: str  # yyyy-mm-dd
    place: str = ""  # local / oficina
    description: str = ""  # discriminação
    price: float = 0
    km: int = 0
    notes: str = ""  # observação
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class MaintenanceCreate(BaseModel):
    category: str = "Mecânica"
    date: str
    place: str = ""
    description: str = ""
    price: float = 0
    km: int = 0
    notes: str = ""


def serialize_maintenance(m: Maintenance) -> dict:
    data = m.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/maintenances")
async def create_maintenance(payload: MaintenanceCreate, user: dict = Depends(require_write_access)):
    m = Maintenance(**payload.dict())
    m.user_id = user["user_id"]
    await db.maintenances.insert_one(m.dict())
    return serialize_maintenance(m)


@api_router.get("/maintenances")
async def list_maintenances(user: dict = Depends(get_current_user)):
    docs = await db.maintenances.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [Maintenance(**d) for d in docs]
    items.sort(key=lambda x: (x.date, x.created_at), reverse=True)
    return [serialize_maintenance(x) for x in items]


@api_router.put("/maintenances/{maintenance_id}")
async def update_maintenance(maintenance_id: str, payload: MaintenanceCreate, user: dict = Depends(require_write_access)):
    doc = await db.maintenances.find_one({"id": maintenance_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    update = payload.dict()
    await db.maintenances.update_one({"id": maintenance_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_maintenance(Maintenance(**doc))


@api_router.delete("/maintenances/{maintenance_id}")
async def delete_maintenance(maintenance_id: str, user: dict = Depends(require_write_access)):
    result = await db.maintenances.update_one(
        {"id": maintenance_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Manutenção não encontrada")
    return {"success": True}


# ---------------------------------------------------------------------------
# Oil & filter change (Troca de Óleo e Filtros) — vinculado ao veículo
# ---------------------------------------------------------------------------
class OilComponent(BaseModel):
    kind: str = ""          # engine|gearbox|diff1|diff2|steering|other
    label: str = ""         # rótulo livre (para "other")
    enabled: bool = False
    oil_type: str = ""
    brand: str = ""
    liters: float = 0
    value: float = 0
    km: int = 0
    date: str = ""
    control: str = "km"     # km|time|both
    interval_km: int = 0
    next_km: int = 0
    interval_time: int = 0
    time_unit: str = "months"   # months|years
    next_date: str = ""
    alert_km: int = 0
    alert_days: int = 0


class FilterItem(BaseModel):
    kind: str = ""          # oil|fuel|water_sep|air|cabin|adblue|air_dryer|steering|gearbox|other
    label: str = ""
    brand: str = ""
    oil_type: str = ""
    quantity: str = ""
    value: float = 0


class OilChange(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str = ""
    vehicle_label: str = ""
    vehicle_plate: str = ""
    current_km: int = 0
    date: str  # yyyy-mm-dd
    km: int = 0
    place: str = ""
    notes: str = ""
    traction: str = ""      # ""|6x2|6x4
    components: List[OilComponent] = Field(default_factory=list)
    filters: List[FilterItem] = Field(default_factory=list)
    labor_value: float = 0
    other_costs: float = 0
    total: float = 0
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class OilChangeCreate(BaseModel):
    vehicle_id: str = ""
    vehicle_label: str = ""
    vehicle_plate: str = ""
    current_km: int = 0
    date: str
    km: int = 0
    place: str = ""
    notes: str = ""
    traction: str = ""
    components: List[OilComponent] = Field(default_factory=list)
    filters: List[FilterItem] = Field(default_factory=list)
    labor_value: float = 0
    other_costs: float = 0
    total: float = 0


def serialize_oil_change(d: OilChange) -> dict:
    data = d.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/oil-changes")
async def create_oil_change(payload: OilChangeCreate, user: dict = Depends(require_write_access)):
    d = OilChange(**payload.dict())
    d.user_id = user["user_id"]
    await db.oil_changes.insert_one(d.dict())
    return serialize_oil_change(d)


@api_router.get("/oil-changes")
async def list_oil_changes(user: dict = Depends(get_current_user)):
    docs = await db.oil_changes.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [OilChange(**d) for d in docs]
    items.sort(key=lambda x: (x.date, x.created_at), reverse=True)
    return [serialize_oil_change(x) for x in items]


@api_router.put("/oil-changes/{item_id}")
async def update_oil_change(item_id: str, payload: OilChangeCreate, user: dict = Depends(require_write_access)):
    doc = await db.oil_changes.find_one({"id": item_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Troca de óleo não encontrada")
    update = payload.dict()
    await db.oil_changes.update_one({"id": item_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_oil_change(OilChange(**doc))


@api_router.delete("/oil-changes/{item_id}")
async def delete_oil_change(item_id: str, user: dict = Depends(require_write_access)):
    result = await db.oil_changes.update_one(
        {"id": item_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Troca de óleo não encontrada")
    return {"success": True}



# ---------------------------------------------------------------------------
# OS — Ordem de Serviço (independente dos demais relatórios)
# ---------------------------------------------------------------------------
class ServiceOrder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: int = 0                 # número sequencial por usuário (OS Nº)
    date: str                       # yyyy-mm-dd
    km: int = 0
    vehicle_plate: str = ""         # matrícula do veículo
    trailer_plate: str = ""         # matrícula do reboque
    descriptions: List[str] = Field(default_factory=list)
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class ServiceOrderCreate(BaseModel):
    date: str
    km: int = 0
    vehicle_plate: str = ""
    trailer_plate: str = ""
    descriptions: List[str] = Field(default_factory=list)


def serialize_service_order(d: ServiceOrder) -> dict:
    data = d.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/service-orders")
async def create_service_order(payload: ServiceOrderCreate, user: dict = Depends(require_write_access)):
    # Número sequencial por usuário; considera TODAS as OS (inclusive apagadas)
    # para que o número nunca seja reutilizado.
    last = await db.service_orders.find_one(
        {"user_id": user["user_id"]}, sort=[("number", -1)]
    )
    next_number = (last["number"] + 1) if last and last.get("number") else 1
    d = ServiceOrder(**payload.dict())
    d.user_id = user["user_id"]
    d.number = next_number
    await db.service_orders.insert_one(d.dict())
    return serialize_service_order(d)


@api_router.get("/service-orders")
async def list_service_orders(user: dict = Depends(get_current_user)):
    docs = await db.service_orders.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [ServiceOrder(**d) for d in docs]
    items.sort(key=lambda x: x.number, reverse=True)
    return [serialize_service_order(x) for x in items]


@api_router.put("/service-orders/{item_id}")
async def update_service_order(item_id: str, payload: ServiceOrderCreate, user: dict = Depends(require_write_access)):
    doc = await db.service_orders.find_one({"id": item_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
    # Mantém o número original da OS; atualiza apenas os campos editáveis.
    update = payload.dict()
    await db.service_orders.update_one({"id": item_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_service_order(ServiceOrder(**doc))


@api_router.delete("/service-orders/{item_id}")
async def delete_service_order(item_id: str, user: dict = Depends(require_write_access)):
    result = await db.service_orders.update_one(
        {"id": item_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada")
    return {"success": True}


# ---------------------------------------------------------------------------
# Controle de Pneus (Tires) — módulo aditivo, não altera dados existentes
# ---------------------------------------------------------------------------
class TireMeasurement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str = ""           # yyyy-mm-dd
    tread_mm: float = 0.0    # profundidade do sulco em mm
    notes: str = ""
    created_at: str = Field(default_factory=now_iso)


class TireMovement(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str = ""
    vehicle_id: str = ""
    from_position: str = ""
    to_position: str = ""    # "" / "REMOVIDO" para retirada
    km: int = 0
    created_at: str = Field(default_factory=now_iso)


class Tire(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: str = ""              # número do pneu (único por usuário)
    brand: str = ""
    size: str = ""                # medida
    install_date: str = ""        # yyyy-mm-dd
    install_km: int = 0
    current_tread_mm: float = 0.0
    notes: str = ""
    vehicle_id: str = ""
    position_code: str = ""
    status: str = "installed"     # installed | removed
    removed_km: int = 0           # km do veículo no momento da retirada
    measurements: List[TireMeasurement] = Field(default_factory=list)
    movements: List[TireMovement] = Field(default_factory=list)
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class TireCreate(BaseModel):
    number: str = ""
    brand: str = ""
    size: str = ""
    install_date: str = ""
    install_km: int = 0
    current_tread_mm: float = 0.0
    notes: str = ""
    vehicle_id: str = ""
    position_code: str = ""


class TireUpdate(BaseModel):
    number: str = ""
    brand: str = ""
    size: str = ""
    install_date: str = ""
    install_km: int = 0
    current_tread_mm: float = 0.0
    notes: str = ""


class MeasurementCreate(BaseModel):
    date: str = ""
    tread_mm: float = 0.0
    notes: str = ""


class MoveCreate(BaseModel):
    to_position: str = ""      # "" => retirar
    vehicle_id: str = ""       # vazio => mantém veículo atual
    km: int = 0
    date: str = ""


def serialize_tire(t: Tire) -> dict:
    data = t.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/tires")
async def create_tire(payload: TireCreate, user: dict = Depends(require_write_access)):
    uid = user["user_id"]
    if payload.number:
        dup = await db.tires.find_one({"user_id": uid, "deleted_at": None, "number": payload.number})
        if dup:
            raise HTTPException(status_code=400, detail="Já existe um pneu com esse número.")
    if payload.vehicle_id and payload.position_code:
        occ = await db.tires.find_one({
            "user_id": uid, "deleted_at": None, "status": "installed",
            "vehicle_id": payload.vehicle_id, "position_code": payload.position_code,
        })
        if occ:
            raise HTTPException(status_code=400, detail="Já existe um pneu nessa posição.")
    t = Tire(**payload.dict())
    t.user_id = uid
    t.status = "installed" if payload.position_code else "removed"
    if payload.current_tread_mm and payload.install_date:
        t.measurements = [TireMeasurement(date=payload.install_date, tread_mm=payload.current_tread_mm)]
    await db.tires.insert_one(t.dict())
    return serialize_tire(t)


@api_router.get("/tires")
async def list_tires(vehicle_id: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {"deleted_at": None, "user_id": user["user_id"]}
    if vehicle_id:
        q["vehicle_id"] = vehicle_id
    docs = await db.tires.find(q).to_list(100000)
    items = [Tire(**d) for d in docs]
    items.sort(key=lambda x: x.created_at, reverse=True)
    return [serialize_tire(x) for x in items]


@api_router.get("/tires/{tire_id}")
async def get_tire(tire_id: str, user: dict = Depends(get_current_user)):
    doc = await db.tires.find_one({"id": tire_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Pneu não encontrado")
    return serialize_tire(Tire(**doc))


@api_router.put("/tires/{tire_id}")
async def update_tire(tire_id: str, payload: TireUpdate, user: dict = Depends(require_write_access)):
    uid = user["user_id"]
    doc = await db.tires.find_one({"id": tire_id, "deleted_at": None, "user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Pneu não encontrado")
    if payload.number and payload.number != doc.get("number"):
        dup = await db.tires.find_one({"user_id": uid, "deleted_at": None, "number": payload.number, "id": {"$ne": tire_id}})
        if dup:
            raise HTTPException(status_code=400, detail="Já existe um pneu com esse número.")
    update = payload.dict()
    await db.tires.update_one({"id": tire_id, "user_id": uid}, {"$set": update})
    doc.update(update)
    return serialize_tire(Tire(**doc))


@api_router.delete("/tires/{tire_id}")
async def delete_tire(tire_id: str, user: dict = Depends(require_write_access)):
    result = await db.tires.update_one(
        {"id": tire_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Pneu não encontrado")
    return {"success": True}


@api_router.post("/tires/{tire_id}/measurements")
async def add_measurement(tire_id: str, payload: MeasurementCreate, user: dict = Depends(require_write_access)):
    uid = user["user_id"]
    doc = await db.tires.find_one({"id": tire_id, "deleted_at": None, "user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Pneu não encontrado")
    m = TireMeasurement(**payload.dict())
    measurements = doc.get("measurements", []) + [m.dict()]
    await db.tires.update_one(
        {"id": tire_id, "user_id": uid},
        {"$set": {"measurements": measurements, "current_tread_mm": m.tread_mm}},
    )
    doc["measurements"] = measurements
    doc["current_tread_mm"] = m.tread_mm
    return serialize_tire(Tire(**doc))


@api_router.delete("/tires/{tire_id}/measurements/{mid}")
async def delete_measurement(tire_id: str, mid: str, user: dict = Depends(require_write_access)):
    uid = user["user_id"]
    doc = await db.tires.find_one({"id": tire_id, "deleted_at": None, "user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Pneu não encontrado")
    measurements = [m for m in doc.get("measurements", []) if m.get("id") != mid]
    measurements_sorted = sorted(measurements, key=lambda m: (m.get("date") or "", m.get("created_at") or ""))
    current = measurements_sorted[-1]["tread_mm"] if measurements_sorted else doc.get("current_tread_mm", 0.0)
    await db.tires.update_one(
        {"id": tire_id, "user_id": uid},
        {"$set": {"measurements": measurements, "current_tread_mm": current}},
    )
    doc["measurements"] = measurements
    doc["current_tread_mm"] = current
    return serialize_tire(Tire(**doc))


@api_router.post("/tires/{tire_id}/move")
async def move_tire(tire_id: str, payload: MoveCreate, user: dict = Depends(require_write_access)):
    uid = user["user_id"]
    doc = await db.tires.find_one({"id": tire_id, "deleted_at": None, "user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Pneu não encontrado")
    old_pos = doc.get("position_code", "")
    old_vehicle = doc.get("vehicle_id", "")
    target_vehicle = payload.vehicle_id or old_vehicle
    to_pos = payload.to_position or ""

    set_fields: dict = {}
    if to_pos == "":
        # Retirar o pneu
        mov = TireMovement(date=payload.date, vehicle_id=old_vehicle, from_position=old_pos,
                           to_position="REMOVIDO", km=payload.km)
        set_fields.update({"status": "removed", "position_code": "", "removed_km": payload.km})
    else:
        occ = await db.tires.find_one({
            "user_id": uid, "deleted_at": None, "status": "installed",
            "vehicle_id": target_vehicle, "position_code": to_pos, "id": {"$ne": tire_id},
        })
        if occ:
            # Troca entre dois pneus (apenas no mesmo veículo)
            if target_vehicle != old_vehicle or not old_pos:
                raise HTTPException(status_code=400, detail="A posição de destino já está ocupada.")
            occ_mov = TireMovement(date=payload.date, vehicle_id=target_vehicle,
                                   from_position=to_pos, to_position=old_pos, km=payload.km)
            occ_moves = occ.get("movements", []) + [occ_mov.dict()]
            await db.tires.update_one(
                {"id": occ["id"], "user_id": uid},
                {"$set": {"position_code": old_pos, "movements": occ_moves}},
            )
        transfer = target_vehicle != old_vehicle
        mov = TireMovement(date=payload.date, vehicle_id=target_vehicle, from_position=old_pos,
                           to_position=to_pos, km=payload.km)
        set_fields.update({"status": "installed", "position_code": to_pos, "vehicle_id": target_vehicle})
        if transfer or doc.get("status") == "removed":
            # Nova instalação: recomeça a contagem a partir deste km
            set_fields["install_km"] = payload.km
            if payload.date:
                set_fields["install_date"] = payload.date

    movements = doc.get("movements", []) + [mov.dict()]
    set_fields["movements"] = movements
    await db.tires.update_one({"id": tire_id, "user_id": uid}, {"$set": set_fields})
    doc.update(set_fields)
    return serialize_tire(Tire(**doc))


# --- Configuração de eixos por veículo (escolhida no módulo, não altera o cadastro) ---
class TireConfig(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vehicle_id: str = ""
    units: List[dict] = Field(default_factory=list)  # [{role,label,layout_key}]
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)


class TireConfigCreate(BaseModel):
    vehicle_id: str = ""
    units: List[dict] = Field(default_factory=list)


@api_router.get("/tire-configs")
async def list_tire_configs(user: dict = Depends(get_current_user)):
    docs = await db.tire_configs.find({"user_id": user["user_id"]}).to_list(100000)
    for d in docs:
        d.pop("_id", None)
    return docs


@api_router.put("/tire-configs/{vehicle_id}")
async def upsert_tire_config(vehicle_id: str, payload: TireConfigCreate, user: dict = Depends(require_write_access)):
    uid = user["user_id"]
    existing = await db.tire_configs.find_one({"user_id": uid, "vehicle_id": vehicle_id})
    units = payload.units
    if existing:
        await db.tire_configs.update_one(
            {"user_id": uid, "vehicle_id": vehicle_id}, {"$set": {"units": units}}
        )
        existing["units"] = units
        existing.pop("_id", None)
        return existing
    cfg = TireConfig(vehicle_id=vehicle_id, units=units, user_id=uid)
    await db.tire_configs.insert_one(cfg.dict())
    return cfg.dict()


# --- Configuração dos limites de desgaste (mm) ---
class TireSettings(BaseModel):
    green_min_mm: float = 5.0
    yellow_min_mm: float = 3.0


@api_router.get("/tire-settings")
async def get_tire_settings(user: dict = Depends(get_current_user)):
    doc = await db.tire_settings.find_one({"user_id": user["user_id"]})
    if not doc:
        return TireSettings().dict()
    return {"green_min_mm": doc.get("green_min_mm", 5.0), "yellow_min_mm": doc.get("yellow_min_mm", 3.0)}


@api_router.put("/tire-settings")
async def put_tire_settings(payload: TireSettings, user: dict = Depends(require_write_access)):
    uid = user["user_id"]
    await db.tire_settings.update_one(
        {"user_id": uid}, {"$set": {"green_min_mm": payload.green_min_mm, "yellow_min_mm": payload.yellow_min_mm}}, upsert=True
    )
    return payload.dict()




# ---------------------------------------------------------------------------
# Daily control (Controle Diário) — registro diário de KM com paradas
# ---------------------------------------------------------------------------
class DailyStop(BaseModel):
    place: str = ""
    time: str = ""  # HH:mm


class DailyLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # yyyy-mm-dd
    start_place: str = ""
    start_km: int = 0
    start_time: str = ""  # HH:mm
    end_place: str = ""
    end_km: int = 0
    end_time: str = ""  # HH:mm
    stops: List[DailyStop] = Field(default_factory=list)
    notes: str = ""
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class DailyLogCreate(BaseModel):
    date: str
    start_place: str = ""
    start_km: int = 0
    start_time: str = ""
    end_place: str = ""
    end_km: int = 0
    end_time: str = ""
    stops: List[DailyStop] = Field(default_factory=list)
    notes: str = ""


def serialize_daily_log(d: DailyLog) -> dict:
    data = d.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/daily-logs")
async def create_daily_log(payload: DailyLogCreate, user: dict = Depends(require_write_access)):
    d = DailyLog(**payload.dict())
    d.user_id = user["user_id"]
    await db.daily_logs.insert_one(d.dict())
    return serialize_daily_log(d)


@api_router.get("/daily-logs")
async def list_daily_logs(user: dict = Depends(get_current_user)):
    docs = await db.daily_logs.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [DailyLog(**d) for d in docs]
    items.sort(key=lambda x: (x.date, x.created_at), reverse=True)
    return [serialize_daily_log(x) for x in items]


@api_router.put("/daily-logs/{log_id}")
async def update_daily_log(log_id: str, payload: DailyLogCreate, user: dict = Depends(require_write_access)):
    doc = await db.daily_logs.find_one({"id": log_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Controle diário não encontrado")
    update = payload.dict()
    await db.daily_logs.update_one({"id": log_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_daily_log(DailyLog(**doc))


@api_router.delete("/daily-logs/{log_id}")
async def delete_daily_log(log_id: str, user: dict = Depends(require_write_access)):
    result = await db.daily_logs.update_one(
        {"id": log_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Controle diário não encontrado")
    return {"success": True}


# ---------------------------------------------------------------------------
# Monthly KM control (Controle Mensal de KM) — KM inicial/final do mês
# ---------------------------------------------------------------------------
class MonthlyKm(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    start_date: str  # yyyy-mm-dd
    start_km: int = 0
    end_date: str = ""  # yyyy-mm-dd
    end_km: int = 0
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class MonthlyKmCreate(BaseModel):
    start_date: str
    start_km: int = 0
    end_date: str = ""
    end_km: int = 0


def serialize_monthly_km(d: MonthlyKm) -> dict:
    data = d.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/monthly-km")
async def create_monthly_km(payload: MonthlyKmCreate, user: dict = Depends(require_write_access)):
    if payload.end_km and payload.end_km < payload.start_km:
        raise HTTPException(status_code=400, detail="O KM final deve ser igual ou superior ao KM inicial.")
    d = MonthlyKm(**payload.dict())
    d.user_id = user["user_id"]
    await db.monthly_km.insert_one(d.dict())
    return serialize_monthly_km(d)


@api_router.get("/monthly-km")
async def list_monthly_km(user: dict = Depends(get_current_user)):
    docs = await db.monthly_km.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [MonthlyKm(**d) for d in docs]
    items.sort(key=lambda x: (x.start_date, x.created_at), reverse=True)
    return [serialize_monthly_km(x) for x in items]


@api_router.put("/monthly-km/{item_id}")
async def update_monthly_km(item_id: str, payload: MonthlyKmCreate, user: dict = Depends(require_write_access)):
    if payload.end_km and payload.end_km < payload.start_km:
        raise HTTPException(status_code=400, detail="O KM final deve ser igual ou superior ao KM inicial.")
    doc = await db.monthly_km.find_one({"id": item_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Controle mensal não encontrado")
    update = payload.dict()
    await db.monthly_km.update_one({"id": item_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_monthly_km(MonthlyKm(**doc))


@api_router.delete("/monthly-km/{item_id}")
async def delete_monthly_km(item_id: str, user: dict = Depends(require_write_access)):
    result = await db.monthly_km.update_one(
        {"id": item_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Controle mensal não encontrado")
    return {"success": True}




# ---------------------------------------------------------------------------
# Freights (Fretes) — parte comercial/financeira, separada das Viagens
# ---------------------------------------------------------------------------
class Freight(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str  # yyyy-mm-dd
    client: str = ""  # cliente / empresa
    origin: str = ""  # origem
    destination: str = ""  # destino
    value: float = 0  # valor do frete
    currency: str = "EUR"
    weight: float = 0  # peso da carga (kg)
    reference: str = ""  # referência / documento
    notes: str = ""
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class FreightCreate(BaseModel):
    date: str
    client: str = ""
    origin: str = ""
    destination: str = ""
    value: float = 0
    currency: str = "EUR"
    weight: float = 0
    reference: str = ""
    notes: str = ""


def serialize_freight(f: Freight) -> dict:
    data = f.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/freights")
async def create_freight(payload: FreightCreate, user: dict = Depends(require_write_access)):
    f = Freight(**payload.dict())
    f.user_id = user["user_id"]
    await db.freights.insert_one(f.dict())
    return serialize_freight(f)


@api_router.get("/freights")
async def list_freights(user: dict = Depends(get_current_user)):
    docs = await db.freights.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [Freight(**d) for d in docs]
    items.sort(key=lambda x: (x.date, x.created_at), reverse=True)
    return [serialize_freight(x) for x in items]


@api_router.put("/freights/{freight_id}")
async def update_freight(freight_id: str, payload: FreightCreate, user: dict = Depends(require_write_access)):
    doc = await db.freights.find_one({"id": freight_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Frete não encontrado")
    update = payload.dict()
    await db.freights.update_one({"id": freight_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_freight(Freight(**doc))


@api_router.delete("/freights/{freight_id}")
async def delete_freight(freight_id: str, user: dict = Depends(require_write_access)):
    result = await db.freights.update_one(
        {"id": freight_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Frete não encontrado")
    return {"success": True}


# ---------------------------------------------------------------------------
# Vehicles (Veículos / Composições)
# ---------------------------------------------------------------------------
class Vehicle(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company: str = ""  # empresa
    truck_brand: str = ""  # marca do cavalo mecânico
    truck_plate: str = ""  # matrícula/placa do cavalo
    truck_model: str = ""  # marca/modelo opcional
    trailers: List[str] = []  # placas dos reboques
    uses_dolly: bool = False
    dolly_plate: str = ""
    dolly_trailer_plate: str = ""  # reboque ligado ao dolly
    photo_path: str = ""
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class VehicleCreate(BaseModel):
    company: str = ""
    truck_brand: str = ""
    truck_plate: str = ""
    truck_model: str = ""
    trailers: List[str] = []
    uses_dolly: bool = False
    dolly_plate: str = ""
    dolly_trailer_plate: str = ""
    photo_path: str = ""


def serialize_vehicle(v: Vehicle) -> dict:
    data = v.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/vehicles")
async def create_vehicle(payload: VehicleCreate, user: dict = Depends(require_write_access)):
    v = Vehicle(**payload.dict())
    v.user_id = user["user_id"]
    await db.vehicles.insert_one(v.dict())
    return serialize_vehicle(v)


@api_router.get("/vehicles")
async def list_vehicles(user: dict = Depends(get_current_user)):
    docs = await db.vehicles.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [Vehicle(**d) for d in docs]
    items.sort(key=lambda x: x.created_at, reverse=True)
    return [serialize_vehicle(x) for x in items]


@api_router.put("/vehicles/{vehicle_id}")
async def update_vehicle(vehicle_id: str, payload: VehicleCreate, user: dict = Depends(require_write_access)):
    doc = await db.vehicles.find_one({"id": vehicle_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    update = payload.dict()
    await db.vehicles.update_one({"id": vehicle_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_vehicle(Vehicle(**doc))


@api_router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(vehicle_id: str, user: dict = Depends(require_write_access)):
    result = await db.vehicles.update_one(
        {"id": vehicle_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Veículo não encontrado")
    return {"success": True}


# ---------------------------------------------------------------------------
# Drivers (Motoristas)
# ---------------------------------------------------------------------------
class Driver(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    full_name: str = ""
    driver_number: str = ""  # número/identificação do motorista (opcional)
    company: str = ""  # empresa (opcional)
    cpf: str = ""
    license_number: str = ""  # CNH / Carta de Condução
    age: Optional[int] = None
    birth_date: str = ""  # yyyy-mm-dd (data de nascimento)
    blood_type: str = ""  # A+, A-, B+, B-, AB+, AB-, O+, O-
    license_expiry: str = ""  # yyyy-mm-dd
    toxicology_expiry: str = ""  # yyyy-mm-dd
    photo_path: str = ""
    order: int = 0  # 0 = primeiro motorista (aparece no Resumo), 1 = segundo
    user_id: str = ""
    created_at: str = Field(default_factory=now_iso)
    deleted_at: Optional[str] = None


class DriverCreate(BaseModel):
    full_name: str = ""
    driver_number: str = ""
    company: str = ""
    cpf: str = ""
    license_number: str = ""
    age: Optional[int] = None
    birth_date: str = ""
    blood_type: str = ""
    license_expiry: str = ""
    toxicology_expiry: str = ""
    photo_path: str = ""


def serialize_driver(d: Driver) -> dict:
    data = d.dict()
    data.pop("deleted_at", None)
    return data


@api_router.post("/drivers")
async def create_driver(payload: DriverCreate, user: dict = Depends(require_write_access)):
    existing = await db.drivers.count_documents({"deleted_at": None, "user_id": user["user_id"]})
    if existing >= 2:
        raise HTTPException(status_code=400, detail="Limite de 2 motoristas atingido.")
    d = Driver(**payload.dict())
    d.user_id = user["user_id"]
    d.order = existing  # 0 for the first, 1 for the second
    await db.drivers.insert_one(d.dict())
    return serialize_driver(d)


@api_router.get("/drivers")
async def list_drivers(user: dict = Depends(get_current_user)):
    docs = await db.drivers.find({"deleted_at": None, "user_id": user["user_id"]}).to_list(100000)
    items = [Driver(**d) for d in docs]
    items.sort(key=lambda x: (x.order, x.created_at))
    return [serialize_driver(x) for x in items]


@api_router.put("/drivers/{driver_id}/primary")
async def set_primary_driver(driver_id: str, user: dict = Depends(require_write_access)):
    target = await db.drivers.find_one(
        {"id": driver_id, "deleted_at": None, "user_id": user["user_id"]}
    )
    if not target:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")
    # Target becomes the first driver; the others keep a higher order.
    await db.drivers.update_one(
        {"id": driver_id, "user_id": user["user_id"]}, {"$set": {"order": 0}}
    )
    others = await db.drivers.find(
        {
            "deleted_at": None,
            "user_id": user["user_id"],
            "id": {"$ne": driver_id},
        }
    ).to_list(100000)
    others.sort(key=lambda d: d.get("created_at", ""))
    for idx, o in enumerate(others):
        await db.drivers.update_one(
            {"id": o["id"], "user_id": user["user_id"]}, {"$set": {"order": idx + 1}}
        )
    return {"success": True}


@api_router.put("/drivers/{driver_id}")
async def update_driver(driver_id: str, payload: DriverCreate, user: dict = Depends(require_write_access)):
    doc = await db.drivers.find_one({"id": driver_id, "deleted_at": None, "user_id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")
    update = payload.dict()
    await db.drivers.update_one({"id": driver_id, "user_id": user["user_id"]}, {"$set": update})
    doc.update(update)
    return serialize_driver(Driver(**doc))


@api_router.delete("/drivers/{driver_id}")
async def delete_driver(driver_id: str, user: dict = Depends(require_write_access)):
    result = await db.drivers.update_one(
        {"id": driver_id, "deleted_at": None, "user_id": user["user_id"]},
        {"$set": {"deleted_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Motorista não encontrado")
    return {"success": True}


@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    data = await file.read()
    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    if ext not in ("jpg", "jpeg", "png", "webp", "heic", "pdf"):
        ext = "jpg"
    path = f"{APP_NAME}/uploads/{uuid.uuid4()}.{ext}"
    content_type = file.content_type or ("application/pdf" if ext == "pdf" else "image/jpeg")
    try:
        await run_in_threadpool(put_object, path, data, content_type)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else 500
        if status == 402:
            raise HTTPException(status_code=402, detail="Armazenamento sem créditos disponíveis.")
        raise HTTPException(status_code=502, detail="Falha ao enviar o arquivo.")
    return {"path": path}


@api_router.get("/files/{path:path}")
async def serve_file(path: str):
    # Payment proofs are private: only reachable via short-lived admin/owner links.
    if "/payment-proofs/" in f"/{path}":
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    try:
        content, content_type = await run_in_threadpool(get_object, path)
    except requests.HTTPError:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    return Response(content=content, media_type=content_type)


# ---------------------------------------------------------------------------
# Licensing — user-facing activation flow + admin panel
# ---------------------------------------------------------------------------
DEFAULT_PAYMENT_SETTINGS = {
    "iban": "",
    "iban_holder": "",
    "pix_key": "",
    "price_eur": "",
    "price_brl": "",
    "instructions": "",
    "iban_enabled": True,
    "pix_enabled": True,
}


async def get_payment_settings() -> dict:
    doc = await db.app_settings.find_one({"key": "payment"}, {"_id": 0, "key": 0})
    return {**DEFAULT_PAYMENT_SETTINGS, **(doc or {})}


class PaymentSubmitIn(BaseModel):
    method: str  # IBAN | PIX
    proof_path: str


class PaymentSettingsIn(BaseModel):
    iban: str = ""
    iban_holder: str = ""
    pix_key: str = ""
    price_eur: str = ""
    price_brl: str = ""
    instructions: str = ""
    iban_enabled: bool = True
    pix_enabled: bool = True


class RejectIn(BaseModel):
    note: Optional[str] = ""


@api_router.get("/license/payment-info")
async def license_payment_info(user: dict = Depends(get_current_user)):
    s = await get_payment_settings()
    return {
        "iban_enabled": s["iban_enabled"],
        "pix_enabled": s["pix_enabled"],
        "iban": s["iban"] if s["iban_enabled"] else "",
        "iban_holder": s["iban_holder"] if s["iban_enabled"] else "",
        "pix_key": s["pix_key"] if s["pix_enabled"] else "",
        "price_eur": s["price_eur"],
        "price_brl": s["price_brl"],
        "instructions": s["instructions"],
    }


@api_router.post("/license/submit-payment")
async def submit_payment(body: PaymentSubmitIn, background: BackgroundTasks, user: dict = Depends(get_current_user)):
    # Legacy endpoint (older app builds): now also registers a reviewable request.
    method = (body.method or "").strip().upper()
    if method not in ("IBAN", "PIX"):
        raise HTTPException(status_code=400, detail="Método de pagamento inválido.")
    path = (body.proof_path or "").strip()
    if not path:
        raise HTTPException(status_code=400, detail="Envie o comprovante de pagamento.")
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    pr = await _create_payment_request(user, method, path, "jpg" if ext == "jpeg" else ext, "", "", "")
    background.add_task(_send_admin_email, pr["request_id"])
    return {"success": True, **license_public(user)}


async def _get_target(user_id: str) -> dict:
    u = await db.users.find_one({"user_id": user_id})
    if not u:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return u


@api_router.get("/admin/users")
async def admin_list_users(admin: dict = Depends(require_admin)):
    docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100000)
    out = []
    for u in docs:
        adm = is_admin(u)
        st = "ATIVO" if adm else (u.get("license_status") or "TESTE")
        out.append({
            "user_id": u["user_id"],
            "email": u.get("email", ""),
            "display_name": u.get("display_name", ""),
            "is_admin": adm,
            "license_status": st,
            "trial_started_at": u.get("trial_started_at"),
            "trial_ends_at": u.get("trial_ends_at"),
            "days_left": 0 if adm else days_left(u),
            "device_id": u.get("device_id"),
            "payment_method": u.get("payment_method"),
            "payment_proof_path": u.get("payment_proof_path"),
            "payment_submitted_at": u.get("payment_submitted_at"),
            "payment_note": u.get("payment_note", ""),
            "created_at": u.get("created_at"),
        })
    order = {"AGUARDANDO_PAGAMENTO": 0, "TESTE": 1, "EXPIRADO": 2, "BLOQUEADO": 3, "ATIVO": 4}
    out.sort(key=lambda x: (order.get(x["license_status"], 9), x.get("created_at") or ""))
    return out


@api_router.post("/admin/users/{user_id}/confirm-payment")
async def admin_confirm_payment(user_id: str, admin: dict = Depends(require_admin)):
    await _get_target(user_id)
    await _approve_pending(user_id, admin)
    await db.users.update_one({"user_id": user_id}, {"$set": {"license_status": "ATIVO", "payment_note": ""}})
    return {"success": True}


@api_router.post("/admin/users/{user_id}/reject-payment")
async def admin_reject_payment(user_id: str, body: RejectIn, admin: dict = Depends(require_admin)):
    await _get_target(user_id)
    note = (body.note or "").strip()
    await db.payment_requests.update_many(
        {"user_id": user_id, "status": "PENDENTE"},
        {"$set": {"status": "REJEITADO", "reject_reason": note or "—", "decided_at": now_iso(),
                  "decided_by": admin["user_id"], "decided_by_email": admin.get("email", "")}},
    )
    await db.users.update_one({"user_id": user_id}, {"$set": {"license_status": "EXPIRADO", "payment_note": note}})
    return {"success": True}


@api_router.post("/admin/users/{user_id}/block")
async def admin_block(user_id: str, admin: dict = Depends(require_admin)):
    u = await _get_target(user_id)
    if is_admin(u):
        raise HTTPException(status_code=400, detail="Não é possível bloquear um administrador.")
    prev = u.get("license_status") or "TESTE"
    await db.users.update_one({"user_id": user_id}, {"$set": {"license_status": "BLOQUEADO", "status_before_block": prev}})
    return {"success": True}


@api_router.post("/admin/users/{user_id}/unblock")
async def admin_unblock(user_id: str, admin: dict = Depends(require_admin)):
    u = await _get_target(user_id)
    prev = u.get("status_before_block") or "EXPIRADO"
    await db.users.update_one({"user_id": user_id}, {"$set": {"license_status": prev}, "$unset": {"status_before_block": ""}})
    return {"success": True}


@api_router.post("/admin/users/{user_id}/unbind-device")
async def admin_unbind_device(user_id: str, admin: dict = Depends(require_admin)):
    await _get_target(user_id)
    await db.users.update_one({"user_id": user_id}, {"$unset": {"device_id": ""}})
    return {"success": True}


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_admin)):
    u = await _get_target(user_id)
    if is_admin(u):
        raise HTTPException(status_code=400, detail="Não é possível excluir um administrador.")
    for col in ("trips", "refuelings", "toll_expenses", "maintenances", "freights",
                "vehicles", "drivers", "messages", "user_sessions",
                "daily_logs", "monthly_km", "other_expenses", "oil_changes",
                "service_orders", "tires", "tire_configs", "tire_settings", "payment_requests", "ai_messages"):
        await db[col].delete_many({"user_id": user_id})
    await db.users.delete_one({"user_id": user_id})
    return {"success": True}


@api_router.get("/admin/payment-settings")
async def admin_get_payment_settings(admin: dict = Depends(require_admin)):
    return await get_payment_settings()


@api_router.put("/admin/payment-settings")
async def admin_put_payment_settings(body: PaymentSettingsIn, admin: dict = Depends(require_admin)):
    await db.app_settings.update_one({"key": "payment"}, {"$set": {**body.dict(), "key": "payment"}}, upsert=True)
    return await get_payment_settings()


# ---------------------------------------------------------------------------
# In-app messages (admin -> users inbox)
# ---------------------------------------------------------------------------
MESSAGE_TYPES = {"info", "warning", "payment", "update"}


class MessageSendIn(BaseModel):
    target: str  # "all" or a specific user_id
    title: str
    body: str
    type: str = "info"


@api_router.post("/admin/messages")
async def admin_send_message(body: MessageSendIn, admin: dict = Depends(require_admin)):
    title = (body.title or "").strip()
    text = (body.body or "").strip()
    mtype = body.type if body.type in MESSAGE_TYPES else "info"
    if not title or not text:
        raise HTTPException(status_code=400, detail="Informe o título e a mensagem.")
    now = now_iso()
    batch = "batch_" + uuid.uuid4().hex[:12]
    if body.target == "all":
        allusers = await db.users.find({}, {"user_id": 1, "email": 1}).to_list(100000)
        recipients = [u for u in allusers if (u.get("email", "") or "").strip().casefold() not in ADMIN_EMAILS]
    else:
        u = await db.users.find_one({"user_id": body.target}, {"user_id": 1})
        if not u:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")
        recipients = [u]
    docs = [{
        "message_id": "m_" + uuid.uuid4().hex[:12],
        "batch_id": batch,
        "user_id": r["user_id"],
        "title": title,
        "body": text,
        "type": mtype,
        "read": False,
        "created_at": now,
        "created_by": admin["user_id"],
        "target": body.target,
    } for r in recipients]
    if docs:
        await db.messages.insert_many(docs)
    return {"success": True, "sent": len(docs), "batch_id": batch}


@api_router.get("/admin/messages")
async def admin_list_messages(admin: dict = Depends(require_admin)):
    docs = await db.messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(3000)
    groups: dict = {}
    order: list = []
    for d in docs:
        b = d.get("batch_id") or d["message_id"]
        g = groups.get(b)
        if not g:
            g = {"batch_id": b, "title": d["title"], "type": d["type"], "created_at": d["created_at"],
                 "target": d.get("target"), "recipients": 0, "read": 0}
            groups[b] = g
            order.append(b)
        g["recipients"] += 1
        if d.get("read"):
            g["read"] += 1
    return [groups[b] for b in order][:50]


@api_router.get("/messages")
async def list_messages(user: dict = Depends(get_current_user)):
    return await db.messages.find(
        {"user_id": user["user_id"]}, {"_id": 0, "created_by": 0, "batch_id": 0}
    ).sort("created_at", -1).to_list(2000)


@api_router.get("/messages/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    n = await db.messages.count_documents({"user_id": user["user_id"], "read": False})
    return {"count": n}


@api_router.post("/messages/{message_id}/read")
async def mark_message_read(message_id: str, user: dict = Depends(get_current_user)):
    await db.messages.update_one({"message_id": message_id, "user_id": user["user_id"]}, {"$set": {"read": True}})
    return {"success": True}


@api_router.delete("/messages/{message_id}")
async def delete_message(message_id: str, user: dict = Depends(get_current_user)):
    await db.messages.delete_one({"message_id": message_id, "user_id": user["user_id"]})
    return {"success": True}


# ---------------------------------------------------------------------------
# Payment requests (license proofs) — submission, admin review, notifications
# A proof NEVER activates a license; only an authorised admin approval does.
# ---------------------------------------------------------------------------
PROOF_MAX_BYTES = 10 * 1024 * 1024
PROOF_TYPES = {"jpg": "image/jpeg", "png": "image/png", "pdf": "application/pdf"}
PROOF_PREFIX = f"{APP_NAME}/payment-proofs/"
PR_STATUSES = ("PENDENTE", "APROVADO", "REJEITADO")


def _detect_proof_ext(data: bytes) -> Optional[str]:
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:5] == b"%PDF-":
        return "pdf"
    return None


async def get_notification_settings() -> dict:
    doc = await db.app_settings.find_one({"key": "notifications"}, {"_id": 0, "key": 0}) or {}
    default_email = sorted(ADMIN_EMAILS)[0] if ADMIN_EMAILS else ""
    return {
        "admin_email": doc.get("admin_email", default_email),
        "email_enabled": doc.get("email_enabled", True),
    }


class NotificationSettingsIn(BaseModel):
    admin_email: str = ""
    email_enabled: bool = True


class PRRejectIn(BaseModel):
    reason: str


class PRNoteIn(BaseModel):
    note: Optional[str] = ""


def _fmt_amount(pr: dict) -> str:
    amt = (pr.get("amount") or "").strip()
    if not amt:
        return "—"
    return f"{'€' if pr.get('currency') == 'EUR' else 'R$'} {amt}"


def _fmt_dt(iso: Optional[str]) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(iso)
        return d.strftime("%d/%m/%Y %H:%M") + " UTC"
    except ValueError:
        return iso


def pr_public(pr: dict, admin_view: bool = False) -> dict:
    out = {k: pr.get(k) for k in (
        "request_id", "method", "amount", "currency", "status", "file_type", "file_name",
        "created_at", "decided_at", "reject_reason", "user_name", "user_email",
    )}
    if admin_view:
        out.update({k: pr.get(k) for k in (
            "user_id", "decided_by_email", "admin_note", "email_status", "email_error",
            "email_attempts", "email_sent_at", "kept_pending_at",
        )})
    return out


async def _send_admin_email(request_id: str):
    """Send the admin e-mail for a request once; record success/failure for retries."""
    pr = await db.payment_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not pr or pr.get("email_status") == "ENVIADO":
        return
    s = await get_notification_settings()
    if not s["email_enabled"] or not s["admin_email"]:
        await db.payment_requests.update_one({"request_id": request_id}, {"$set": {"email_status": "DESATIVADO"}})
        return
    from html import escape
    from email_service import send_email, EmailError
    rows = [
        ("Utilizador", pr.get("user_name") or "—"),
        ("E-mail", pr.get("user_email") or "—"),
        ("Método", "Pix" if pr.get("method") == "PIX" else "IBAN"),
        ("Valor", _fmt_amount(pr)),
        ("Data", _fmt_dt(pr.get("created_at"))),
        ("Estado", "Aguardando análise"),
    ]
    table = "".join(
        f'<tr><td style="padding:4px 12px 4px 0;color:#666">{escape(k)}:</td>'
        f'<td style="padding:4px 0;font-weight:bold">{escape(str(v))}</td></tr>' for k, v in rows
    )
    subject = "Controle de Viagens — Novo pagamento aguardando aprovação"
    html = (
        '<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#222">'
        '<h2 style="margin:0 0 12px">🔔 Novo pagamento aguardando aprovação</h2>'
        '<p>Um utilizador enviou um comprovante de pagamento de licença.</p>'
        f'<table role="presentation">{table}</table>'
        '<p style="margin-top:16px">Acesse o painel administrativo do aplicativo para verificar o comprovante e confirmar o pagamento.</p>'
        '<p style="font-size:12px;color:#888">Enviado automaticamente por Controle de Viagens. '
        'O comprovante não é anexado a este e-mail por segurança.</p></td></tr></table>'
    )
    try:
        email_id = await send_email(to=s["admin_email"], subject=subject, html=html)
        await db.payment_requests.update_one(
            {"request_id": request_id},
            {"$set": {"email_status": "ENVIADO", "email_sent_at": now_iso(), "email_id": email_id, "email_error": ""},
             "$inc": {"email_attempts": 1}},
        )
    except (EmailError, ValueError) as e:
        logger.warning("Admin email failed for %s: %s", request_id, e)
        await db.payment_requests.update_one(
            {"request_id": request_id},
            {"$set": {"email_status": "FALHOU", "email_error": str(e)}, "$inc": {"email_attempts": 1}},
        )


async def _create_payment_request(user: dict, method: str, proof_path: str, file_type: str,
                                  file_name: str, amount: str, client_request_id: str) -> dict:
    if client_request_id:
        existing = await db.payment_requests.find_one(
            {"user_id": user["user_id"], "client_request_id": client_request_id}, {"_id": 0})
        if existing:
            return existing
    pending = await db.payment_requests.find_one({"user_id": user["user_id"], "status": "PENDENTE"}, {"_id": 0})
    if pending:
        raise HTTPException(status_code=409, detail="Já existe um comprovante aguardando análise. Aguarde a decisão do administrador.")
    settings = await get_payment_settings()
    currency = "EUR" if method == "IBAN" else "BRL"
    amount = (amount or "").strip()[:20] or (settings["price_eur"] if method == "IBAN" else settings["price_brl"]) or ""
    status_now = await ensure_status(user)
    pr = {
        "request_id": "pr_" + uuid.uuid4().hex[:16],
        "client_request_id": client_request_id or None,
        "user_id": user["user_id"],
        "user_name": user.get("display_name") or "",
        "user_email": user.get("email") or "",
        "method": method,
        "amount": str(amount),
        "currency": currency,
        "proof_path": proof_path,
        "file_type": file_type,
        "file_name": (file_name or "")[:120],
        "status": "PENDENTE",
        "prev_license_status": status_now,
        "created_at": now_iso(),
        "email_status": "PENDENTE",
        "email_attempts": 0,
    }
    await db.payment_requests.insert_one(dict(pr))
    pr.pop("_id", None)
    updates = {
        "payment_method": method,
        "payment_proof_path": proof_path,
        "payment_submitted_at": pr["created_at"],
        "payment_note": "",
    }
    # Never activate on submission; keep an already-active licence untouched.
    if status_now != "ATIVO":
        updates["license_status"] = "AGUARDANDO_PAGAMENTO"
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    user.update(updates)
    return pr


@api_router.post("/license/payment-requests")
async def submit_payment_request(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    method: str = Form(...),
    amount: str = Form(""),
    client_request_id: str = Form(""),
    user: dict = Depends(get_current_user),
):
    if is_admin(user):
        raise HTTPException(status_code=400, detail="Administradores não precisam enviar comprovante.")
    method = (method or "").strip().upper()
    if method not in ("IBAN", "PIX"):
        raise HTTPException(status_code=400, detail="Método de pagamento inválido.")
    cid = (client_request_id or "").strip()[:64]
    if cid:
        existing = await db.payment_requests.find_one({"user_id": user["user_id"], "client_request_id": cid}, {"_id": 0})
        if existing:
            return {"success": True, "duplicate": True, "request": pr_public(existing)}
    data = await file.read(PROOF_MAX_BYTES + 1)
    if len(data) > PROOF_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Arquivo muito grande (máximo 10 MB).")
    if not data:
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    ext = _detect_proof_ext(data)
    if not ext:
        raise HTTPException(status_code=400, detail="Formato inválido. Envie JPG, PNG ou PDF.")
    pending = await db.payment_requests.find_one({"user_id": user["user_id"], "status": "PENDENTE"}, {"_id": 1})
    if pending:
        raise HTTPException(status_code=409, detail="Já existe um comprovante aguardando análise. Aguarde a decisão do administrador.")
    path = f"{PROOF_PREFIX}{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await run_in_threadpool(put_object, path, data, PROOF_TYPES[ext])
    except requests.HTTPError:
        raise HTTPException(status_code=502, detail="Falha ao guardar o comprovante. Tente novamente.")
    pr = await _create_payment_request(user, method, path, ext, file.filename or "", amount, cid)
    background.add_task(_send_admin_email, pr["request_id"])
    return {"success": True, "request": pr_public(pr), **license_public(user)}


@api_router.get("/license/payment-requests")
async def my_payment_requests(user: dict = Depends(get_current_user)):
    docs = await db.payment_requests.find({"user_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return [pr_public(d) for d in docs]


def _proof_link(request_id: str) -> str:
    now = datetime.now(timezone.utc)
    token = jwt.encode({"typ": "proof", "rid": request_id, "iat": now, "exp": now + timedelta(minutes=5)},
                       JWT_SECRET, algorithm=JWT_ALG)
    return f"/api/payment-proofs/view?token={token}"


@api_router.post("/license/payment-requests/{request_id}/proof-link")
async def my_proof_link(request_id: str, user: dict = Depends(get_current_user)):
    pr = await db.payment_requests.find_one({"request_id": request_id, "user_id": user["user_id"]}, {"_id": 0})
    if not pr:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    return {"url": _proof_link(request_id)}


@api_router.get("/payment-proofs/view")
async def view_proof(token: str):
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(status_code=403, detail="Link expirado ou inválido.")
    if payload.get("typ") != "proof":
        raise HTTPException(status_code=403, detail="Link inválido.")
    pr = await db.payment_requests.find_one({"request_id": payload.get("rid")}, {"_id": 0})
    if not pr:
        raise HTTPException(status_code=404, detail="Comprovante não encontrado.")
    try:
        content, ctype = await run_in_threadpool(get_object, pr["proof_path"])
    except requests.HTTPError:
        raise HTTPException(status_code=404, detail="Comprovante não encontrado.")
    return Response(content=content, media_type=PROOF_TYPES.get(pr.get("file_type"), ctype),
                    headers={"Cache-Control": "no-store", "Content-Disposition": "inline"})


# ---- Admin ----
@api_router.get("/admin/payment-requests")
async def admin_list_payment_requests(status: str = "", admin: dict = Depends(require_admin)):
    q = {"status": status.upper()} if status.upper() in PR_STATUSES else {}
    docs = await db.payment_requests.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [pr_public(d, admin_view=True) for d in docs]


@api_router.get("/admin/payment-requests/pending-count")
async def admin_pending_count(admin: dict = Depends(require_admin)):
    return {"count": await db.payment_requests.count_documents({"status": "PENDENTE"})}


@api_router.post("/admin/payment-requests/{request_id}/proof-link")
async def admin_proof_link(request_id: str, admin: dict = Depends(require_admin)):
    if not await db.payment_requests.find_one({"request_id": request_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    return {"url": _proof_link(request_id)}


async def _user_message(user_id: str, admin_id: str, title: str, body: str, mtype: str):
    await db.messages.insert_one({
        "message_id": "m_" + uuid.uuid4().hex[:12],
        "batch_id": "batch_" + uuid.uuid4().hex[:12],
        "user_id": user_id, "title": title, "body": body, "type": mtype,
        "read": False, "created_at": now_iso(), "created_by": admin_id, "target": user_id,
    })


async def _approve_pending(user_id: str, admin: dict, request_id: Optional[str] = None) -> Optional[dict]:
    q = {"status": "PENDENTE", "user_id": user_id}
    if request_id:
        q["request_id"] = request_id
    return await db.payment_requests.find_one_and_update(
        q, {"$set": {"status": "APROVADO", "decided_at": now_iso(), "decided_by": admin["user_id"],
                     "decided_by_email": admin.get("email", "")}},
        projection={"_id": 0}, return_document=True,
    )


@api_router.post("/admin/payment-requests/{request_id}/approve")
async def admin_approve_request(request_id: str, admin: dict = Depends(require_admin)):
    pr = await db.payment_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not pr:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    updated = await _approve_pending(pr["user_id"], admin, request_id)
    if not updated:
        raise HTTPException(status_code=409, detail="Esta solicitação já foi analisada.")
    await db.users.update_one({"user_id": pr["user_id"]}, {"$set": {"license_status": "ATIVO", "payment_note": ""}})
    await _user_message(pr["user_id"], admin["user_id"], "✅ Pagamento aprovado!",
                        "Sua licença do Controle de Viagens foi ativada com sucesso.\nObrigado pela confiança!", "payment")
    return {"success": True, "request": pr_public(updated, admin_view=True)}


@api_router.post("/admin/payment-requests/{request_id}/reject")
async def admin_reject_request(request_id: str, body: PRRejectIn, admin: dict = Depends(require_admin)):
    reason = (body.reason or "").strip()[:300]
    if not reason:
        raise HTTPException(status_code=400, detail="Informe o motivo da rejeição.")
    updated = await db.payment_requests.find_one_and_update(
        {"request_id": request_id, "status": "PENDENTE"},
        {"$set": {"status": "REJEITADO", "reject_reason": reason, "decided_at": now_iso(),
                  "decided_by": admin["user_id"], "decided_by_email": admin.get("email", "")}},
        projection={"_id": 0}, return_document=True,
    )
    if not updated:
        exists = await db.payment_requests.find_one({"request_id": request_id}, {"_id": 1})
        raise HTTPException(status_code=409 if exists else 404,
                            detail="Esta solicitação já foi analisada." if exists else "Solicitação não encontrada.")
    u = await db.users.find_one({"user_id": updated["user_id"]}, {"_id": 0})
    if u and u.get("license_status") != "ATIVO":
        prev = updated.get("prev_license_status")
        restore = prev if prev in ("TESTE", "ATIVO") else "EXPIRADO"
        await db.users.update_one({"user_id": u["user_id"]}, {"$set": {"license_status": restore, "payment_note": reason}})
        if restore == "TESTE":
            u["license_status"] = "TESTE"
            await ensure_status(u)
    await _user_message(updated["user_id"], admin["user_id"], "⚠️ Não foi possível confirmar seu pagamento.",
                        f"Motivo: {reason}\nVerifique as informações e envie um novo comprovante, se necessário.", "warning")
    return {"success": True, "request": pr_public(updated, admin_view=True)}


@api_router.post("/admin/payment-requests/{request_id}/keep-pending")
async def admin_keep_pending(request_id: str, body: PRNoteIn, admin: dict = Depends(require_admin)):
    res = await db.payment_requests.update_one(
        {"request_id": request_id, "status": "PENDENTE"},
        {"$set": {"kept_pending_at": now_iso(), "admin_note": (body.note or "").strip()[:300]}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=409, detail="Esta solicitação não está pendente.")
    return {"success": True}


@api_router.post("/admin/payment-requests/{request_id}/resend-email")
async def admin_resend_email(request_id: str, admin: dict = Depends(require_admin)):
    pr = await db.payment_requests.find_one({"request_id": request_id}, {"_id": 0})
    if not pr:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    if pr.get("email_status") == "ENVIADO":
        raise HTTPException(status_code=409, detail="O e-mail já foi enviado.")
    await _send_admin_email(request_id)
    pr = await db.payment_requests.find_one({"request_id": request_id}, {"_id": 0})
    return {"success": pr.get("email_status") == "ENVIADO", "request": pr_public(pr, admin_view=True)}


@api_router.get("/admin/notification-settings")
async def admin_get_notification_settings(admin: dict = Depends(require_admin)):
    return await get_notification_settings()


@api_router.put("/admin/notification-settings")
async def admin_put_notification_settings(body: NotificationSettingsIn, admin: dict = Depends(require_admin)):
    email = (body.admin_email or "").strip()
    if body.email_enabled and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(status_code=400, detail="Informe um e-mail válido.")
    await db.app_settings.update_one(
        {"key": "notifications"},
        {"$set": {"key": "notifications", "admin_email": email, "email_enabled": body.email_enabled}}, upsert=True)
    return await get_notification_settings()


# ---------------------------------------------------------------------------
# AI assistant (OpenAI GPT-5.5 via Emergent universal key) — streamed chat
# ---------------------------------------------------------------------------
AI_MODEL = ("openai", "gpt-5.5")
AI_CONTEXT_COLLECTIONS = {
    "viagens": "trips", "fretes": "freights", "abastecimentos": "refuelings",
    "portagens": "toll_expenses", "outras_despesas": "other_expenses", "manutencoes": "maintenances",
    "trocas_de_oleo": "oil_changes", "ordens_de_servico": "service_orders", "pneus": "tires",
    "controle_diario_km": "daily_logs", "controle_mensal_km": "monthly_km",
    "veiculos": "vehicles", "motoristas": "drivers",
}
AI_DROP_FIELDS = {"_id", "user_id", "created_at", "deleted_at", "photo_path", "photos", "photo_paths",
                  "receipt_path", "receipt_paths", "logo_path", "movements"}
AI_LANG_NAMES = {"pt-BR": "português do Brasil", "pt-PT": "português de Portugal", "es": "espanhol",
                 "en": "inglês", "fr": "francês"}


class AIChatIn(BaseModel):
    text: str


def _ai_clean(v):
    if isinstance(v, dict):
        return {k: _ai_clean(x) for k, x in v.items()
                if k not in AI_DROP_FIELDS and x not in ("", None, [], {}, 0)}
    if isinstance(v, list):
        return [_ai_clean(x) for x in v]
    return v


async def _ai_data_context(user_id: str) -> str:
    out = {}
    for label, col in AI_CONTEXT_COLLECTIONS.items():
        docs = await db[col].find({"user_id": user_id, "deleted_at": None}, {"_id": 0}) \
            .sort([("date", -1), ("created_at", -1)]).to_list(60)
        if docs:
            out[label] = [_ai_clean(d) for d in docs]
    text = json.dumps(out, ensure_ascii=False, default=str)
    return text[:60000]


def _ai_system_prompt(user: dict, data_json: str) -> str:
    lang = AI_LANG_NAMES.get(user.get("app_language") or "pt-BR", "português")
    return (
        "Você é o Assistente IA do aplicativo 'Controle de Viagens', usado por motoristas e transportadores. "
        f"Responda sempre em {lang}, de forma curta, clara e prática (use listas quando ajudar). "
        f"Hoje é {datetime.now(timezone.utc).date().isoformat()}. "
        "O app tem: Resumo (dashboard), Viagens (KM inicial/final, origem, destino, frete, diesel, ARLA, portagens), "
        "Fretes, Despesas (abastecimentos, portagens, outras despesas, manutenção, Troca de Óleo e Filtros, "
        "OS – Ordem de Serviço, Controle de Pneus com mapa de eixos e sulco), Controle Diário e Mensal de KM, "
        "Relatórios com PDF/CSV, Cadastros (motoristas, veículos, reboques, empresa/logo, cores, idioma, moeda) "
        "e Central de Ajuda. "
        "Você pode explicar como usar o app e analisar os dados do utilizador abaixo (JSON, mais recentes primeiro, "
        "até 60 por tipo). KM rodados de uma viagem = km_end - km_start (km_end 0 = viagem em aberto). "
        "Os valores têm moedas próprias (EUR/BRL); nunca converta nem misture moedas. "
        "Se a informação não estiver nos dados, diga isso; não invente números. "
        "Você não pode criar, alterar nem apagar registos — oriente o utilizador a fazê-lo no app. "
        "Não fale sobre licenças/pagamentos de outros utilizadores nem revele dados técnicos internos.\n\n"
        f"DADOS DO UTILIZADOR:\n{data_json}"
    )


@api_router.get("/ai/messages")
async def ai_messages(user: dict = Depends(get_current_user)):
    docs = await db.ai_messages.find({"user_id": user["user_id"]}, {"_id": 0, "user_id": 0}) \
        .sort("created_at", -1).to_list(100)
    return list(reversed(docs))


@api_router.delete("/ai/messages")
async def ai_clear(user: dict = Depends(get_current_user)):
    await db.ai_messages.delete_many({"user_id": user["user_id"]})
    return {"success": True}


@api_router.post("/ai/chat")
async def ai_chat(body: AIChatIn, user: dict = Depends(get_current_user)):
    text = (body.text or "").strip()[:2000]
    if not text:
        raise HTTPException(status_code=400, detail="Escreva uma pergunta.")
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="Assistente IA indisponível.")
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

    history = await db.ai_messages.find({"user_id": user["user_id"]}, {"_id": 0}) \
        .sort("created_at", -1).to_list(20)
    history.reverse()
    system = _ai_system_prompt(user, await _ai_data_context(user["user_id"]))
    initial = [{"role": "system", "content": system}] + [
        {"role": m["role"], "content": m["content"]} for m in history
    ]
    await db.ai_messages.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["user_id"], "role": "user",
        "content": text, "created_at": now_iso(),
    })
    chat = LlmChat(api_key=key, session_id=f"ai_{user['user_id']}_{uuid.uuid4().hex[:8]}",
                   system_message=system, initial_messages=initial).with_model(*AI_MODEL)

    async def gen():
        parts: List[str] = []
        try:
            async for ev in chat.stream_message(UserMessage(text=text)):
                if isinstance(ev, TextDelta):
                    parts.append(ev.content)
                    yield f"data: {json.dumps({'delta': ev.content}, ensure_ascii=False)}\n\n"
                elif isinstance(ev, StreamDone):
                    break
        except Exception as e:  # noqa: BLE001
            logger.error("AI chat error: %s", e)
            yield f"data: {json.dumps({'error': 'Não foi possível obter resposta da IA. Tente novamente.'})}\n\n"
        answer = "".join(parts).strip()
        if answer:
            await db.ai_messages.insert_one({
                "id": str(uuid.uuid4()), "user_id": user["user_id"], "role": "assistant",
                "content": answer, "created_at": now_iso(),
            })
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def startup_storage():
    try:
        await db.users.create_index("email", unique=True, sparse=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.user_sessions.create_index("user_id")
        for col in ("trips", "refuelings", "toll_expenses", "maintenances", "freights", "vehicles", "drivers", "daily_logs", "other_expenses", "monthly_km", "oil_changes", "service_orders", "tires", "tire_configs", "tire_settings"):
            await db[col].create_index("user_id")
        await db.messages.create_index("user_id")
        await db.messages.create_index("message_id", unique=True)
        await db.payment_requests.create_index("request_id", unique=True)
        await db.payment_requests.create_index([("user_id", 1), ("status", 1)])
        await db.payment_requests.create_index("status")
        await db.ai_messages.create_index([("user_id", 1), ("created_at", -1)])
    except Exception as e:  # noqa: BLE001
        logger.warning("Index creation deferred: %s", e)
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage initialized")
    except Exception as e:  # noqa: BLE001
        logger.warning("Storage init deferred: %s", e)
