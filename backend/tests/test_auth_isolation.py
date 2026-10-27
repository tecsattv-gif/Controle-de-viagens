"""End-to-end backend tests for authentication + per-user data isolation.

Covers:
- 401 without Authorization header on all data endpoints (trips, refuelings, vehicles, drivers, upload)
- /api/auth/register, /api/auth/login, /api/auth/me happy path
- Wrong password → 401, duplicate email → 409
- Two users A and B: A creates resources, B sees zero of A's, and A cannot
  read/update/delete via B's ids (and vice versa) → 404
- Records saved with authenticated user_id (payload user_id ignored)
"""
import io
import os
import uuid
import time
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _rand_email(prefix: str) -> str:
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@teste.com"


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ---- Fixtures --------------------------------------------------------------

@pytest.fixture(scope="module")
def user_a():
    email = _rand_email("A")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "senha1234", "display_name": "User A"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["access_token"], "user_id": data["user"]["user_id"], "created": []}


@pytest.fixture(scope="module")
def user_b():
    email = _rand_email("B")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "senha1234", "display_name": "User B"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"email": email, "token": data["access_token"], "user_id": data["user"]["user_id"], "created": []}


# ---- No auth → 401 ---------------------------------------------------------

@pytest.mark.parametrize("method,path", [
    ("GET", "/trips"), ("POST", "/trips"),
    ("GET", "/refuelings"), ("POST", "/refuelings"),
    ("GET", "/vehicles"), ("POST", "/vehicles"),
    ("GET", "/drivers"), ("POST", "/drivers"),
])
def test_endpoints_require_auth(method, path):
    r = requests.request(method, f"{API}{path}", json={} if method == "POST" else None, timeout=15)
    assert r.status_code == 401, f"{method} {path} expected 401, got {r.status_code}: {r.text[:200]}"


def test_upload_requires_auth():
    files = {"file": ("t.jpg", io.BytesIO(b"x"), "image/jpeg")}
    r = requests.post(f"{API}/upload", files=files, timeout=15)
    assert r.status_code == 401, r.text[:200]


def test_auth_me_requires_auth():
    r = requests.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401


# ---- Auth flows -----------------------------------------------------------

def test_register_login_me(user_a):
    # /auth/me with the token
    r = requests.get(f"{API}/auth/me", headers=_hdr(user_a["token"]), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["user_id"] == user_a["user_id"]
    assert body["email"] == user_a["email"].casefold()

    # login with same credentials returns new working token
    r = requests.post(f"{API}/auth/login", json={"email": user_a["email"], "password": "senha1234"}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    r = requests.get(f"{API}/auth/me", headers=_hdr(tok), timeout=15)
    assert r.status_code == 200
    assert r.json()["user_id"] == user_a["user_id"]


def test_login_wrong_password_401(user_a):
    r = requests.post(f"{API}/auth/login", json={"email": user_a["email"], "password": "wrong-pass"}, timeout=15)
    assert r.status_code == 401


def test_register_duplicate_email_409(user_a):
    r = requests.post(f"{API}/auth/register", json={"email": user_a["email"], "password": "senha1234"}, timeout=15)
    assert r.status_code == 409


def test_invalid_token_401():
    r = requests.get(f"{API}/auth/me", headers=_hdr("not-a-valid-token"), timeout=15)
    assert r.status_code == 401


# ---- Isolation: A creates data, B cannot see/modify it --------------------

def test_a_creates_all_resources_and_persistence(user_a):
    tok = user_a["token"]
    # veículo
    v = requests.post(f"{API}/vehicles", headers=_hdr(tok), json={
        "company": "ACME", "truck_brand": "Volvo", "truck_plate": "AA-11-BB", "trailers": ["TR-01"],
    }, timeout=15)
    assert v.status_code == 200, v.text
    vehicle_id = v.json()["id"]
    assert v.json()["user_id"] == user_a["user_id"], "server must overwrite user_id from token"
    user_a["created"].append(("vehicles", vehicle_id))

    # motorista
    d = requests.post(f"{API}/drivers", headers=_hdr(tok), json={
        "full_name": "TEST_A_Driver", "license_number": "1234", "blood_type": "O+",
        # attempt to spoof user_id — must be ignored/overwritten
        "user_id": "user_ATTACKER",
    }, timeout=15)
    assert d.status_code == 200, d.text
    driver_id = d.json()["id"]
    assert d.json()["user_id"] == user_a["user_id"], "user_id from body must be ignored"
    user_a["created"].append(("drivers", driver_id))

    # viagem
    t = requests.post(f"{API}/trips", headers=_hdr(tok), json={
        "date": "2026-01-05", "km_start": 1000, "km_end": 1200,
        "vehicle_id": vehicle_id, "driver_id": driver_id, "driver_name": "TEST_A_Driver",
    }, timeout=15)
    assert t.status_code == 200, t.text
    trip_id = t.json()["id"]
    assert t.json()["user_id"] == user_a["user_id"]
    user_a["created"].append(("trips", trip_id))

    # abastecimento
    rf = requests.post(f"{API}/refuelings", headers=_hdr(tok), json={
        "date": "2026-01-05", "diesel_liters": 100, "diesel_price": 1.5, "currency": "EUR",
    }, timeout=15)
    assert rf.status_code == 200, rf.text
    ref_id = rf.json()["id"]
    assert rf.json()["user_id"] == user_a["user_id"]
    user_a["created"].append(("refuelings", ref_id))

    # A can list all of them
    for col in ("trips", "refuelings", "vehicles", "drivers"):
        rr = requests.get(f"{API}/{col}", headers=_hdr(tok), timeout=15)
        assert rr.status_code == 200
        assert len(rr.json()) >= 1, f"user A should see own {col}"
        # every record must be owned by A
        for item in rr.json():
            assert item["user_id"] == user_a["user_id"]


def test_b_cannot_see_a_records(user_a, user_b):
    # B must see zero of A's items (B is a fresh account)
    tok_b = user_b["token"]
    a_ids = {col: rid for col, rid in user_a["created"]}
    for col in ("trips", "refuelings", "vehicles", "drivers"):
        r = requests.get(f"{API}/{col}", headers=_hdr(tok_b), timeout=15)
        assert r.status_code == 200
        ids_seen = [x["id"] for x in r.json()]
        assert a_ids[col] not in ids_seen, f"user B leak: sees A's {col} id"
        # sanity: every id B does see must belong to B
        for x in r.json():
            assert x["user_id"] == user_b["user_id"]


def test_b_cannot_update_or_delete_a_records(user_a, user_b):
    tok_b = user_b["token"]
    # find A's ids by resource kind
    ids = {col: rid for col, rid in user_a["created"]}

    # PUT attempts with valid bodies but A's ids using B's token → 404
    put_bodies = {
        "trips": {"date": "2026-01-05", "km_start": 0, "km_end": 1},
        "refuelings": {"date": "2026-01-05"},
        "vehicles": {"company": "HACK"},
        "drivers": {"full_name": "HACK"},
    }
    for col, body in put_bodies.items():
        r = requests.put(f"{API}/{col}/{ids[col]}", headers=_hdr(tok_b), json=body, timeout=15)
        assert r.status_code == 404, f"B updating A's {col} should be 404, got {r.status_code} {r.text[:120]}"

    for col in ("trips", "refuelings", "vehicles", "drivers"):
        r = requests.delete(f"{API}/{col}/{ids[col]}", headers=_hdr(tok_b), timeout=15)
        assert r.status_code == 404, f"B deleting A's {col} should be 404, got {r.status_code}"


def test_a_still_owns_records_after_b_attempts(user_a):
    tok = user_a["token"]
    ids = {col: rid for col, rid in user_a["created"]}
    for col in ("trips", "refuelings", "vehicles", "drivers"):
        r = requests.get(f"{API}/{col}", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == ids[col] for x in r.json()), f"A must still see its own {col}"


# ---- Cleanup --------------------------------------------------------------

def test_zzz_cleanup(user_a, user_b):
    """Best-effort cleanup: soft-delete created records for user A."""
    tok = user_a["token"]
    for col, rid in user_a["created"]:
        try:
            requests.delete(f"{API}/{col}/{rid}", headers=_hdr(tok), timeout=10)
        except Exception:
            pass
    # sleep a hair to let mongo flush before session ends
    time.sleep(0.1)
