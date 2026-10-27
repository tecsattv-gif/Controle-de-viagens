"""Backend tests for the Despesas rework + app currency (Jan-2026 update).

Covers:
- /api/auth/me returns app_currency (default EUR) after register.
- PUT /api/settings/currency validates EUR/BRL/USD/GBP/CHF and persists.
- PUT /api/settings/currency rejects invalid codes with 400.
- Refuelings CRUD with the new arla_km field (with & without ARLA).
- Toll expenses (/api/toll-expenses) full CRUD.
- Maintenances (/api/maintenances) full CRUD including category.
- Trips (Fretes) CRUD continues to work.
- Per-user isolation on the 3 new despesa collections (404 on cross-user access, 401 without token).
"""

import os
import uuid
import requests
import pytest

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


def _rand_email(prefix: str) -> str:
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@teste.com"


# -------- Fixtures --------

@pytest.fixture(scope="module")
def user_a():
    email = _rand_email("CURA")
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "senha1234", "display_name": "Currency A"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return {"email": email, "token": body["access_token"], "user_id": body["user"]["user_id"], "trash": []}


@pytest.fixture(scope="module")
def user_b():
    email = _rand_email("CURB")
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "senha1234", "display_name": "Currency B"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return {"email": email, "token": body["access_token"], "user_id": body["user"]["user_id"], "trash": []}


# -------- /auth/me includes app_currency, defaults to EUR --------

def test_auth_me_returns_app_currency(user_a):
    r = requests.get(f"{API}/auth/me", headers=_hdr(user_a["token"]), timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "app_currency" in body, "app_currency must be exposed"
    assert body["app_currency"] == "EUR", f"default currency should be EUR, got {body['app_currency']}"


# -------- PUT /api/settings/currency --------

@pytest.mark.parametrize("code", ["EUR", "BRL", "USD", "GBP", "CHF"])
def test_set_currency_valid_codes(user_a, code):
    r = requests.put(
        f"{API}/settings/currency",
        headers=_hdr(user_a["token"]),
        json={"currency": code},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json()["app_currency"] == code
    # /auth/me reflects it
    me = requests.get(f"{API}/auth/me", headers=_hdr(user_a["token"]), timeout=15)
    assert me.status_code == 200
    assert me.json()["app_currency"] == code


@pytest.mark.parametrize("bad", ["JPY", "eur", "", "XYZ", "R$"])
def test_set_currency_invalid_400(user_a, bad):
    r = requests.put(
        f"{API}/settings/currency",
        headers=_hdr(user_a["token"]),
        json={"currency": bad},
        timeout=15,
    )
    # lowercase "eur" is accepted by the server (it uppercases). Adjust expectation.
    if bad.upper() in {"EUR", "BRL", "USD", "GBP", "CHF"}:
        assert r.status_code == 200
    else:
        assert r.status_code == 400, f"expected 400 for {bad!r}, got {r.status_code}"


def test_set_currency_requires_auth():
    r = requests.put(f"{API}/settings/currency", json={"currency": "USD"}, timeout=15)
    assert r.status_code == 401


# -------- Refuelings with arla_km --------

def test_refueling_create_with_arla(user_a):
    payload = {
        "date": "2026-01-10",
        "station_name": "TEST_Posto",
        "station_place": "Lisboa",
        "diesel_liters": 200.5,
        "diesel_price": 1.65,
        "arla_liters": 20.0,
        "arla_price": 1.20,
        "km": 123456,
        "arla_km": 123400,
        "notes": "TEST with arla",
    }
    r = requests.post(f"{API}/refuelings", headers=_hdr(user_a["token"]), json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["arla_km"] == 123400
    assert body["km"] == 123456
    assert body["arla_liters"] == 20.0
    assert body["user_id"] == user_a["user_id"]
    user_a["trash"].append(("refuelings", body["id"]))

    # GET verifies persistence
    lst = requests.get(f"{API}/refuelings", headers=_hdr(user_a["token"]), timeout=15).json()
    hit = [x for x in lst if x["id"] == body["id"]]
    assert hit and hit[0]["arla_km"] == 123400


def test_refueling_create_without_arla(user_a):
    payload = {
        "date": "2026-01-11",
        "station_place": "Porto",
        "diesel_liters": 150.0,
        "diesel_price": 1.60,
        "km": 200000,
    }
    r = requests.post(f"{API}/refuelings", headers=_hdr(user_a["token"]), json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["arla_km"] == 0
    assert body["arla_liters"] == 0
    user_a["trash"].append(("refuelings", body["id"]))


def test_refueling_update_arla_km(user_a):
    # create then update
    r = requests.post(
        f"{API}/refuelings",
        headers=_hdr(user_a["token"]),
        json={"date": "2026-01-12", "diesel_liters": 50, "diesel_price": 1.7, "km": 111, "arla_km": 100},
        timeout=15,
    )
    assert r.status_code == 200
    rid = r.json()["id"]
    user_a["trash"].append(("refuelings", rid))
    upd = requests.put(
        f"{API}/refuelings/{rid}",
        headers=_hdr(user_a["token"]),
        json={"date": "2026-01-12", "diesel_liters": 50, "diesel_price": 1.7, "km": 222, "arla_km": 210, "notes": "edited"},
        timeout=15,
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["arla_km"] == 210
    assert upd.json()["km"] == 222


def test_refueling_delete(user_a):
    r = requests.post(
        f"{API}/refuelings",
        headers=_hdr(user_a["token"]),
        json={"date": "2026-01-13", "diesel_liters": 10, "diesel_price": 1.7},
        timeout=15,
    )
    rid = r.json()["id"]
    d = requests.delete(f"{API}/refuelings/{rid}", headers=_hdr(user_a["token"]), timeout=15)
    assert d.status_code == 200
    # second delete -> 404
    d2 = requests.delete(f"{API}/refuelings/{rid}", headers=_hdr(user_a["token"]), timeout=15)
    assert d2.status_code == 404


# -------- Toll expenses --------

def test_toll_expense_crud(user_a):
    tok = user_a["token"]
    # create
    r = requests.post(
        f"{API}/toll-expenses",
        headers=_hdr(tok),
        json={"date": "2026-01-15", "value": 12.34, "place": "A1 - Aveiras"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    assert r.json()["value"] == 12.34
    assert r.json()["place"] == "A1 - Aveiras"
    assert r.json()["user_id"] == user_a["user_id"]
    user_a["trash"].append(("toll-expenses", tid))

    # list
    lst = requests.get(f"{API}/toll-expenses", headers=_hdr(tok), timeout=15)
    assert lst.status_code == 200
    assert any(x["id"] == tid for x in lst.json())

    # update
    upd = requests.put(
        f"{API}/toll-expenses/{tid}",
        headers=_hdr(tok),
        json={"date": "2026-01-16", "value": 15.5, "place": ""},
        timeout=15,
    )
    assert upd.status_code == 200
    assert upd.json()["value"] == 15.5
    assert upd.json()["place"] == ""

    # delete
    d = requests.delete(f"{API}/toll-expenses/{tid}", headers=_hdr(tok), timeout=15)
    assert d.status_code == 200
    # verify gone
    lst2 = requests.get(f"{API}/toll-expenses", headers=_hdr(tok), timeout=15).json()
    assert not any(x["id"] == tid for x in lst2)


def test_toll_expense_requires_auth():
    r = requests.get(f"{API}/toll-expenses", timeout=15)
    assert r.status_code == 401
    r = requests.post(f"{API}/toll-expenses", json={"date": "2026-01-01", "value": 1}, timeout=15)
    assert r.status_code == 401


# -------- Maintenances --------

@pytest.mark.parametrize("category", ["Mecânica", "Elétrica", "Borracharia", "Outros"])
def test_maintenance_create_each_category(user_a, category):
    tok = user_a["token"]
    r = requests.post(
        f"{API}/maintenances",
        headers=_hdr(tok),
        json={
            "category": category,
            "date": "2026-01-18",
            "place": "Oficina TEST",
            "description": f"Serviço {category}",
            "price": 99.9,
            "km": 250000,
            "notes": "obs",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["category"] == category
    assert body["price"] == 99.9
    assert body["km"] == 250000
    assert body["user_id"] == user_a["user_id"]
    user_a["trash"].append(("maintenances", body["id"]))


def test_maintenance_update_and_delete(user_a):
    tok = user_a["token"]
    r = requests.post(
        f"{API}/maintenances",
        headers=_hdr(tok),
        json={"category": "Mecânica", "date": "2026-01-20", "price": 10, "description": "TEST"},
        timeout=15,
    )
    mid = r.json()["id"]
    upd = requests.put(
        f"{API}/maintenances/{mid}",
        headers=_hdr(tok),
        json={"category": "Elétrica", "date": "2026-01-21", "price": 55.5, "description": "TEST edit", "km": 999, "place": "X"},
        timeout=15,
    )
    assert upd.status_code == 200
    assert upd.json()["category"] == "Elétrica"
    assert upd.json()["price"] == 55.5

    d = requests.delete(f"{API}/maintenances/{mid}", headers=_hdr(tok), timeout=15)
    assert d.status_code == 200
    d2 = requests.delete(f"{API}/maintenances/{mid}", headers=_hdr(tok), timeout=15)
    assert d2.status_code == 404


def test_maintenance_requires_auth():
    r = requests.get(f"{API}/maintenances", timeout=15)
    assert r.status_code == 401


# -------- Trip (Frete) still works --------

def test_trip_crud_still_works(user_a):
    tok = user_a["token"]
    r = requests.post(
        f"{API}/trips",
        headers=_hdr(tok),
        json={
            "date": "2026-01-25",
            "km_start": 1000,
            "km_end": 1500,
            "loading_place": "Lisboa",
            "unloading_place": "Madrid",
            "freight_gross": 2500.0,
            "freight_net": 2000.0,
            "freight_status": "A receber",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["km"] == 500
    assert body["freight_gross"] == 2500.0
    assert body["user_id"] == user_a["user_id"]
    user_a["trash"].append(("trips", body["id"]))

    lst = requests.get(f"{API}/trips", headers=_hdr(tok), timeout=15)
    assert lst.status_code == 200
    assert any(x["id"] == body["id"] for x in lst.json())


# -------- Isolation on new despesa collections --------

def test_isolation_toll_maintenance_refueling(user_a, user_b):
    tok_a, tok_b = user_a["token"], user_b["token"]
    # A creates one of each
    ta = requests.post(
        f"{API}/toll-expenses", headers=_hdr(tok_a),
        json={"date": "2026-01-30", "value": 5.5, "place": "TEST_A"}, timeout=15,
    ).json()["id"]
    ma = requests.post(
        f"{API}/maintenances", headers=_hdr(tok_a),
        json={"category": "Outros", "date": "2026-01-30", "price": 1.0, "description": "TEST_A"}, timeout=15,
    ).json()["id"]
    ra = requests.post(
        f"{API}/refuelings", headers=_hdr(tok_a),
        json={"date": "2026-01-30", "diesel_liters": 1, "diesel_price": 1.5}, timeout=15,
    ).json()["id"]
    user_a["trash"].extend([("toll-expenses", ta), ("maintenances", ma), ("refuelings", ra)])

    # B cannot see them in list
    for col, rid in [("toll-expenses", ta), ("maintenances", ma), ("refuelings", ra)]:
        lst = requests.get(f"{API}/{col}", headers=_hdr(tok_b), timeout=15).json()
        assert not any(x["id"] == rid for x in lst), f"leak: B sees A's {col}"

    # B cannot PUT/DELETE A's ids
    put_bodies = {
        "toll-expenses": {"date": "2026-01-30", "value": 999},
        "maintenances": {"category": "Outros", "date": "2026-01-30", "price": 0},
        "refuelings": {"date": "2026-01-30"},
    }
    for col, rid in [("toll-expenses", ta), ("maintenances", ma), ("refuelings", ra)]:
        p = requests.put(f"{API}/{col}/{rid}", headers=_hdr(tok_b), json=put_bodies[col], timeout=15)
        assert p.status_code == 404, f"B updating A's {col} should be 404, got {p.status_code}"
        d = requests.delete(f"{API}/{col}/{rid}", headers=_hdr(tok_b), timeout=15)
        assert d.status_code == 404


# -------- Trip validation still enforced --------

def test_trip_km_validation(user_a):
    r = requests.post(
        f"{API}/trips",
        headers=_hdr(user_a["token"]),
        json={"date": "2026-01-27", "km_start": 500, "km_end": 100},
        timeout=15,
    )
    assert r.status_code == 400


# -------- Cleanup --------

def test_zzz_cleanup(user_a, user_b):
    for col, rid in user_a["trash"]:
        try:
            requests.delete(f"{API}/{col}/{rid}", headers=_hdr(user_a["token"]), timeout=10)
        except Exception:
            pass
