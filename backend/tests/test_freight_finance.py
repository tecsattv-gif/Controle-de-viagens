"""Backend tests for trip freight/finance fields: gross, diesel, ARLA, tolls per currency."""
import os
from pathlib import Path
import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def cleanup_ids():
    ids = []
    yield ids
    for tid in ids:
        try:
            requests.delete(f"{API}/trips/{tid}", timeout=10)
        except Exception:
            pass


# ----- Health -----
def test_health(api_client):
    r = api_client.get(f"{API}/")
    assert r.status_code == 200


# ----- Create trip with full freight (EUR) -----
def test_create_trip_eur_with_freight_and_tolls(api_client, cleanup_ids):
    payload = {
        "date": "2026-01-10",
        "km_start": 100000,
        "km_end": 100500,
        "loading_place": "TEST_Lisboa",
        "unloading_place": "TEST_Madrid",
        "freight_gross": 2000.0,
        "freight_gross_currency": "EUR",
        "freight_net": 1500.0,
        "freight_net_currency": "EUR",
        "freight_paid": 500.0,
        "freight_paid_currency": "EUR",
        "freight_status": "Parcialmente recebido",
        "freight_diesel": 400.0,
        "freight_diesel_currency": "EUR",
        "freight_arla": 30.0,
        "freight_arla_currency": "EUR",
        "tolls": [
            {"value": 25.5, "currency": "EUR"},
            {"value": 14.5, "currency": "EUR"},
        ],
    }
    r = api_client.post(f"{API}/trips", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    cleanup_ids.append(d["id"])
    assert d["freight_gross"] == 2000.0
    assert d["freight_gross_currency"] == "EUR"
    assert d["freight_diesel"] == 400.0
    assert d["freight_arla"] == 30.0
    assert len(d["tolls"]) == 2
    assert d["tolls"][0]["value"] == 25.5
    assert d["freight_status"] == "Parcialmente recebido"
    assert d["km"] == 500

    # Verify GET persistence
    lst = api_client.get(f"{API}/trips").json()
    found = next((t for t in lst if t["id"] == d["id"]), None)
    assert found is not None
    assert found["freight_gross"] == 2000.0
    assert found["tolls"][1]["currency"] == "EUR"


# ----- Create trip with BRL freight and mixed toll currencies -----
def test_create_trip_brl_with_mixed_tolls(api_client, cleanup_ids):
    payload = {
        "date": "2026-01-12",
        "km_start": 200000,
        "km_end": 200320,
        "freight_gross": 8500.0,
        "freight_gross_currency": "BRL",
        "freight_diesel": 1200.0,
        "freight_diesel_currency": "BRL",
        "freight_arla": 90.0,
        "freight_arla_currency": "BRL",
        "tolls": [
            {"value": 45.0, "currency": "BRL"},
            {"value": 32.0, "currency": "BRL"},
            {"value": 12.0, "currency": "EUR"},
        ],
        "freight_status": "A receber",
    }
    r = api_client.post(f"{API}/trips", json=payload)
    assert r.status_code == 200, r.text
    d = r.json()
    cleanup_ids.append(d["id"])
    assert d["freight_gross_currency"] == "BRL"
    assert len(d["tolls"]) == 3
    currencies = [t["currency"] for t in d["tolls"]]
    assert currencies.count("BRL") == 2
    assert currencies.count("EUR") == 1


# ----- Update trip financial fields -----
def test_update_trip_finance(api_client, cleanup_ids):
    create = {
        "date": "2026-01-14",
        "km_start": 50000,
        "km_end": 50100,
        "freight_gross": 100.0,
        "freight_gross_currency": "EUR",
    }
    r = api_client.post(f"{API}/trips", json=create)
    assert r.status_code == 200
    tid = r.json()["id"]
    cleanup_ids.append(tid)

    update = {
        **create,
        "freight_gross": 999.99,
        "freight_diesel": 250.0,
        "freight_diesel_currency": "EUR",
        "freight_arla": 15.0,
        "freight_arla_currency": "EUR",
        "tolls": [{"value": 7.5, "currency": "EUR"}],
        "freight_status": "Pago",
    }
    r2 = api_client.put(f"{API}/trips/{tid}", json=update)
    assert r2.status_code == 200, r2.text
    d = r2.json()
    assert d["freight_gross"] == 999.99
    assert d["freight_diesel"] == 250.0
    assert d["freight_arla"] == 15.0
    assert d["tolls"][0]["value"] == 7.5
    assert d["freight_status"] == "Pago"

    # Verify via GET
    lst = api_client.get(f"{API}/trips").json()
    found = next((t for t in lst if t["id"] == tid), None)
    assert found is not None
    assert found["freight_gross"] == 999.99
    assert found["freight_diesel"] == 250.0
    assert found["tolls"][0]["value"] == 7.5


# ----- Validation: km_end < km_start -----
def test_create_km_end_lower_rejected(api_client):
    r = api_client.post(f"{API}/trips", json={
        "date": "2026-01-15",
        "km_start": 5000,
        "km_end": 4000,
    })
    assert r.status_code == 400
    assert "KM final" in r.json()["detail"]


def test_update_km_end_lower_rejected(api_client, cleanup_ids):
    r = api_client.post(f"{API}/trips", json={
        "date": "2026-01-15",
        "km_start": 5000,
        "km_end": 5100,
    })
    assert r.status_code == 200
    tid = r.json()["id"]
    cleanup_ids.append(tid)
    r2 = api_client.put(f"{API}/trips/{tid}", json={
        "date": "2026-01-15",
        "km_start": 5000,
        "km_end": 4000,
    })
    assert r2.status_code == 400


# ----- DELETE -----
def test_delete_trip_removes_from_list(api_client):
    r = api_client.post(f"{API}/trips", json={
        "date": "2026-01-16",
        "km_start": 1000,
        "km_end": 1010,
    })
    assert r.status_code == 200
    tid = r.json()["id"]
    d = api_client.delete(f"{API}/trips/{tid}")
    assert d.status_code == 200
    assert d.json() == {"success": True}
    lst = api_client.get(f"{API}/trips").json()
    assert not any(t["id"] == tid for t in lst)
    # Second delete → 404
    d2 = api_client.delete(f"{API}/trips/{tid}")
    assert d2.status_code == 404
