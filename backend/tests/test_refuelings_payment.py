"""Backend tests for the new payment_method / card_type / card_name fields on refuelings."""
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


# ---------- Payment method defaults ----------
def test_payment_defaults_when_omitted(session, created_ids):
    """When payment_method/card_type/card_name are omitted, defaults are applied."""
    r = session.post(
        f"{API}/refuelings",
        json={
            "date": "2026-01-20",
            "station_name": "TEST_Defaults",
            "station_place": "TEST",
            "diesel_liters": 50,
            "diesel_price": 1.5,
            "currency": "EUR",
            "km": 1000,
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["payment_method"] == "Cartão"
    assert body["card_type"] == ""
    assert body["card_name"] == ""
    created_ids.append(body["id"])


# ---------- Payment method Cartão with card details ----------
def test_create_with_cartao_credito_visa(session, created_ids):
    r = session.post(
        f"{API}/refuelings",
        json={
            "date": "2026-01-21",
            "station_name": "TEST_Cartao",
            "station_place": "TEST",
            "diesel_liters": 100,
            "diesel_price": 1.6,
            "currency": "EUR",
            "payment_method": "Cartão",
            "card_type": "Crédito",
            "card_name": "Visa",
            "km": 2000,
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["payment_method"] == "Cartão"
    assert body["card_type"] == "Crédito"
    assert body["card_name"] == "Visa"
    created_ids.append(body["id"])

    # Verify persistence via GET
    listed = session.get(f"{API}/refuelings", timeout=15).json()
    found = next((x for x in listed if x["id"] == body["id"]), None)
    assert found is not None
    assert found["payment_method"] == "Cartão"
    assert found["card_type"] == "Crédito"
    assert found["card_name"] == "Visa"


def test_create_with_cartao_frota_dkv(session, created_ids):
    r = session.post(
        f"{API}/refuelings",
        json={
            "date": "2026-01-22",
            "station_name": "TEST_Frota",
            "station_place": "TEST",
            "diesel_liters": 200,
            "diesel_price": 1.7,
            "currency": "EUR",
            "payment_method": "Cartão",
            "card_type": "Cartão Frota",
            "card_name": "DKV",
            "km": 3000,
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["card_type"] == "Cartão Frota"
    assert body["card_name"] == "DKV"
    created_ids.append(body["id"])


# ---------- Payment methods Dinheiro / Pix ----------
def test_create_with_dinheiro(session, created_ids):
    r = session.post(
        f"{API}/refuelings",
        json={
            "date": "2026-01-23",
            "station_name": "TEST_Dinheiro",
            "station_place": "TEST",
            "diesel_liters": 30,
            "diesel_price": 6.0,
            "currency": "BRL",
            "payment_method": "Dinheiro",
            "card_type": "",
            "card_name": "",
            "km": 4000,
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["payment_method"] == "Dinheiro"
    assert body["card_type"] == ""
    assert body["card_name"] == ""
    created_ids.append(body["id"])


def test_create_with_pix(session, created_ids):
    r = session.post(
        f"{API}/refuelings",
        json={
            "date": "2026-01-24",
            "station_name": "TEST_Pix",
            "station_place": "TEST",
            "diesel_liters": 40,
            "diesel_price": 6.2,
            "currency": "BRL",
            "payment_method": "Pix",
            "km": 5000,
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["payment_method"] == "Pix"
    assert body["card_type"] == ""
    assert body["card_name"] == ""
    created_ids.append(body["id"])


# ---------- PUT updates payment fields ----------
def test_put_updates_payment_fields(session, created_ids):
    # Create with Cartão/Crédito/Visa
    created = session.post(
        f"{API}/refuelings",
        json={
            "date": "2026-01-25",
            "station_name": "TEST_ToUpdate",
            "station_place": "TEST",
            "diesel_liters": 60,
            "diesel_price": 1.4,
            "currency": "EUR",
            "payment_method": "Cartão",
            "card_type": "Crédito",
            "card_name": "Visa",
            "km": 6000,
        },
        timeout=15,
    ).json()
    rid = created["id"]
    created_ids.append(rid)

    # Update to Dinheiro (card fields must be cleared)
    upd = session.put(
        f"{API}/refuelings/{rid}",
        json={
            "date": "2026-01-25",
            "station_name": "TEST_ToUpdate",
            "station_place": "TEST",
            "diesel_liters": 60,
            "diesel_price": 1.4,
            "currency": "EUR",
            "payment_method": "Dinheiro",
            "card_type": "",
            "card_name": "",
            "km": 6000,
        },
        timeout=15,
    )
    assert upd.status_code == 200, upd.text
    body = upd.json()
    assert body["payment_method"] == "Dinheiro"
    assert body["card_type"] == ""
    assert body["card_name"] == ""

    # Verify via GET
    listed = session.get(f"{API}/refuelings", timeout=15).json()
    found = next((x for x in listed if x["id"] == rid), None)
    assert found is not None
    assert found["payment_method"] == "Dinheiro"
    assert found["card_name"] == ""

    # Update back to Cartão Débito Mastercard
    upd2 = session.put(
        f"{API}/refuelings/{rid}",
        json={
            "date": "2026-01-25",
            "station_name": "TEST_ToUpdate",
            "station_place": "TEST",
            "diesel_liters": 60,
            "diesel_price": 1.4,
            "currency": "EUR",
            "payment_method": "Cartão",
            "card_type": "Débito",
            "card_name": "Mastercard",
            "km": 6000,
        },
        timeout=15,
    )
    assert upd2.status_code == 200, upd2.text
    b2 = upd2.json()
    assert b2["payment_method"] == "Cartão"
    assert b2["card_type"] == "Débito"
    assert b2["card_name"] == "Mastercard"


def test_get_has_payment_fields_for_all_items(session, created_ids):
    """Every refueling in GET /refuelings must expose payment fields."""
    created = session.post(
        f"{API}/refuelings",
        json={
            "date": "2026-01-26",
            "station_name": "TEST_ListCheck",
            "station_place": "TEST",
            "diesel_liters": 10,
            "diesel_price": 1.0,
            "currency": "EUR",
            "payment_method": "Pix",
            "km": 100,
        },
        timeout=15,
    ).json()
    created_ids.append(created["id"])

    listed = session.get(f"{API}/refuelings", timeout=15).json()
    assert len(listed) > 0
    for r in listed:
        assert "payment_method" in r
        assert "card_type" in r
        assert "card_name" in r
        assert "_id" not in r
        assert "deleted_at" not in r
