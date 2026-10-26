"""Backend tests for Controle de Viagens 'refuelings' API — includes prices + currency."""
import os
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    yield s
    s.close()


@pytest.fixture
def created_ids():
    ids = []
    yield ids
    for rid in ids:
        try:
            requests.delete(f"{API}/refuelings/{rid}", timeout=10)
        except Exception:
            pass


# ---------- create ----------
def test_create_refueling_full_with_prices_eur(session, created_ids):
    payload = {
        "date": "2026-01-15",
        "station_name": "TEST_PostoIpiranga",
        "station_place": "TEST_BR-116, km 230",
        "diesel_liters": 100.0,
        "diesel_price": 1.50,
        "arla_liters": 12.5,
        "arla_price": 2.0,
        "currency": "EUR",
        "km": 123456,
        "notes": "TEST_full",
    }
    r = session.post(f"{API}/refuelings", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["diesel_liters"] == 100.0
    assert body["diesel_price"] == 1.50
    assert body["arla_liters"] == 12.5
    assert body["arla_price"] == 2.0
    assert body["currency"] == "EUR"
    assert "_id" not in body
    assert "deleted_at" not in body
    created_ids.append(body["id"])

    # GET verifies persistence
    listed = session.get(f"{API}/refuelings", timeout=15).json()
    found = next((x for x in listed if x["id"] == body["id"]), None)
    assert found is not None
    assert found["diesel_price"] == 1.50
    assert found["arla_price"] == 2.0
    assert found["currency"] == "EUR"


def test_create_refueling_brl_persists(session, created_ids):
    payload = {
        "date": "2026-01-16",
        "station_name": "TEST_BR",
        "station_place": "TEST_BR",
        "diesel_liters": 200.0,
        "diesel_price": 6.50,
        "currency": "BRL",
        "km": 50000,
    }
    r = session.post(f"{API}/refuelings", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["currency"] == "BRL"
    assert body["diesel_price"] == 6.50
    assert body["arla_price"] == 0
    assert body["arla_liters"] == 0
    created_ids.append(body["id"])


def test_create_defaults_currency_eur(session, created_ids):
    """If currency omitted, defaults to EUR"""
    payload = {
        "date": "2026-01-17",
        "station_name": "TEST_Default",
        "station_place": "TEST",
        "diesel_liters": 50.0,
        "diesel_price": 1.20,
        "km": 500,
    }
    r = session.post(f"{API}/refuelings", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["currency"] == "EUR"
    assert body["diesel_price"] == 1.20
    created_ids.append(body["id"])


# ---------- list ordering ----------
def test_list_refuelings_newest_first(session, created_ids):
    older = session.post(
        f"{API}/refuelings",
        json={"date": "2026-01-05", "station_name": "TEST_Older", "station_place": "X",
              "diesel_liters": 50, "diesel_price": 1.4, "currency": "EUR", "km": 100},
        timeout=15,
    ).json()
    created_ids.append(older["id"])
    newer = session.post(
        f"{API}/refuelings",
        json={"date": "2026-01-25", "station_name": "TEST_Newer", "station_place": "Y",
              "diesel_liters": 80, "diesel_price": 1.6, "currency": "BRL", "km": 200},
        timeout=15,
    ).json()
    created_ids.append(newer["id"])

    listed = session.get(f"{API}/refuelings", timeout=15).json()
    positions = {r["id"]: idx for idx, r in enumerate(listed)}
    assert positions[newer["id"]] < positions[older["id"]]
    assert all("_id" not in r for r in listed)


# ---------- update (PUT) ----------
def test_update_refueling_persists_prices_and_currency(session, created_ids):
    created = session.post(
        f"{API}/refuelings",
        json={"date": "2026-01-10", "station_name": "TEST_Original",
              "station_place": "TEST_OrigPlace", "diesel_liters": 100,
              "diesel_price": 1.0, "arla_liters": 5, "arla_price": 1.5,
              "currency": "EUR", "km": 1000, "notes": "orig"},
        timeout=15,
    ).json()
    rid = created["id"]
    created_ids.append(rid)

    updated_payload = {
        "date": "2026-01-11",
        "station_name": "TEST_Updated",
        "station_place": "TEST_NewPlace",
        "diesel_liters": 200.5,
        "diesel_price": 7.20,
        "arla_liters": 15,
        "arla_price": 3.0,
        "currency": "BRL",
        "km": 2000,
        "notes": "updated",
    }
    r = session.put(f"{API}/refuelings/{rid}", json=updated_payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["diesel_price"] == 7.20
    assert body["arla_price"] == 3.0
    assert body["currency"] == "BRL"
    assert body["diesel_liters"] == 200.5

    # GET verifies persistence
    listed = session.get(f"{API}/refuelings", timeout=15).json()
    found = next((x for x in listed if x["id"] == rid), None)
    assert found is not None
    assert found["diesel_price"] == 7.20
    assert found["currency"] == "BRL"


def test_update_nonexistent_returns_404(session):
    r = session.put(
        f"{API}/refuelings/nonexistent-xyz-123",
        json={"date": "2026-01-11", "station_name": "x", "station_place": "x",
              "diesel_liters": 1, "diesel_price": 1, "currency": "EUR", "km": 1},
        timeout=15,
    )
    assert r.status_code == 404


# ---------- delete (soft) ----------
def test_delete_refueling_soft_removes_from_list(session):
    created = session.post(
        f"{API}/refuelings",
        json={"date": "2026-01-17", "station_name": "TEST_ToDelete",
              "station_place": "x", "diesel_liters": 10, "diesel_price": 1.0,
              "currency": "EUR", "km": 10},
        timeout=15,
    ).json()
    rid = created["id"]
    d = session.delete(f"{API}/refuelings/{rid}", timeout=15)
    assert d.status_code == 200
    assert d.json().get("success") is True
    listed = session.get(f"{API}/refuelings", timeout=15).json()
    assert not any(r["id"] == rid for r in listed)
    d2 = session.delete(f"{API}/refuelings/{rid}", timeout=15)
    assert d2.status_code == 404


def test_delete_nonexistent_returns_404(session):
    r = session.delete(f"{API}/refuelings/nonexistent-xyz-999", timeout=15)
    assert r.status_code == 404
