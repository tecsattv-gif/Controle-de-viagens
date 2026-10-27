"""Tests for the Jan-2026 fork:
- PUT/GET app language (per-user, 5 options)
- Freights weight (kg) persistence
- Drivers limit (max 2) + primary switch (order asc)
- Cross-user isolation for freights & drivers
- Quick regression: /api/trips + /api/settings/currency
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = BASE_URL + "/api"


def _register():
    email = f"lang_{uuid.uuid4().hex[:10]}@teste.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "senha1234"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"], email


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def user_a():
    tok, email = _register()
    return {"token": tok, "email": email}


@pytest.fixture(scope="module")
def user_b():
    tok, email = _register()
    return {"token": tok, "email": email}


# ------------------------- Language -------------------------
class TestLanguage:
    def test_me_default_language(self, user_a):
        r = requests.get(f"{API}/auth/me", headers=_h(user_a["token"]), timeout=30)
        assert r.status_code == 200
        assert r.json().get("app_language") == "pt-BR"

    @pytest.mark.parametrize("lang", ["pt-BR", "pt-PT", "es", "en", "fr"])
    def test_set_valid_language(self, user_a, lang):
        r = requests.put(f"{API}/settings/language", headers=_h(user_a["token"]), json={"language": lang}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("app_language") == lang
        # Verify persistence via /auth/me
        me = requests.get(f"{API}/auth/me", headers=_h(user_a["token"]), timeout=30).json()
        assert me.get("app_language") == lang

    def test_reject_invalid_language(self, user_a):
        r = requests.put(f"{API}/settings/language", headers=_h(user_a["token"]), json={"language": "xx"}, timeout=30)
        assert r.status_code == 400

    def test_language_requires_auth(self):
        r = requests.put(f"{API}/settings/language", json={"language": "en"}, timeout=30)
        assert r.status_code == 401


# ------------------------- Freights (weight kg) -------------------------
class TestFreights:
    def test_create_freight_with_weight_persists(self, user_a):
        payload = {
            "date": "2026-01-15",
            "client": "TEST_ACME",
            "origin": "Lisboa",
            "destination": "Porto",
            "value": 1500.0,
            "currency": "EUR",
            "weight": 24500.5,
            "reference": "TEST_REF1",
            "notes": "TEST weight",
        }
        r = requests.post(f"{API}/freights", headers=_h(user_a["token"]), json=payload, timeout=30)
        assert r.status_code == 200, r.text
        created = r.json()
        assert created["weight"] == 24500.5
        assert created["client"] == "TEST_ACME"
        fid = created["id"]

        # GET verifies persistence
        lst = requests.get(f"{API}/freights", headers=_h(user_a["token"]), timeout=30).json()
        found = next((f for f in lst if f["id"] == fid), None)
        assert found is not None
        assert found["weight"] == 24500.5

        # PUT updates weight
        payload["weight"] = 30000.0
        r2 = requests.put(f"{API}/freights/{fid}", headers=_h(user_a["token"]), json=payload, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["weight"] == 30000.0

        lst2 = requests.get(f"{API}/freights", headers=_h(user_a["token"]), timeout=30).json()
        found2 = next((f for f in lst2 if f["id"] == fid), None)
        assert found2["weight"] == 30000.0

        # DELETE
        rd = requests.delete(f"{API}/freights/{fid}", headers=_h(user_a["token"]), timeout=30)
        assert rd.status_code == 200

    def test_freight_isolation_between_users(self, user_a, user_b):
        payload = {"date": "2026-01-10", "client": "TEST_ISO_A", "weight": 100.0}
        r = requests.post(f"{API}/freights", headers=_h(user_a["token"]), json=payload, timeout=30)
        assert r.status_code == 200
        fid = r.json()["id"]

        # user B cannot see A's freight
        lst_b = requests.get(f"{API}/freights", headers=_h(user_b["token"]), timeout=30).json()
        assert all(f["id"] != fid for f in lst_b)

        # user B PUT on A's freight -> 404
        r2 = requests.put(f"{API}/freights/{fid}", headers=_h(user_b["token"]), json=payload, timeout=30)
        assert r2.status_code == 404

        # user B DELETE on A's freight -> 404
        r3 = requests.delete(f"{API}/freights/{fid}", headers=_h(user_b["token"]), timeout=30)
        assert r3.status_code == 404

        # cleanup
        requests.delete(f"{API}/freights/{fid}", headers=_h(user_a["token"]), timeout=30)


# ------------------------- Drivers (max 2 + primary) -------------------------
class TestDrivers:
    @pytest.fixture(autouse=True)
    def _cleanup(self, user_a):
        # Remove any pre-existing drivers for user_a to have a clean slate
        lst = requests.get(f"{API}/drivers", headers=_h(user_a["token"]), timeout=30).json()
        for d in lst:
            requests.delete(f"{API}/drivers/{d['id']}", headers=_h(user_a["token"]), timeout=30)
        yield
        lst = requests.get(f"{API}/drivers", headers=_h(user_a["token"]), timeout=30).json()
        for d in lst:
            requests.delete(f"{API}/drivers/{d['id']}", headers=_h(user_a["token"]), timeout=30)

    def test_max_two_drivers(self, user_a):
        # First driver -> order=0
        r1 = requests.post(f"{API}/drivers", headers=_h(user_a["token"]),
                           json={"full_name": "TEST_D1"}, timeout=30)
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["order"] == 0

        # Second driver -> order=1
        r2 = requests.post(f"{API}/drivers", headers=_h(user_a["token"]),
                           json={"full_name": "TEST_D2"}, timeout=30)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["order"] == 1

        # Third -> 400 Limite
        r3 = requests.post(f"{API}/drivers", headers=_h(user_a["token"]),
                           json={"full_name": "TEST_D3"}, timeout=30)
        assert r3.status_code == 400
        assert "Limite" in r3.json().get("detail", "")

        # GET ordered by order asc
        lst = requests.get(f"{API}/drivers", headers=_h(user_a["token"]), timeout=30).json()
        assert [d["order"] for d in lst] == [0, 1]
        assert lst[0]["id"] == d1["id"]
        assert lst[1]["id"] == d2["id"]

    def test_set_primary_swap(self, user_a):
        r1 = requests.post(f"{API}/drivers", headers=_h(user_a["token"]),
                           json={"full_name": "TEST_D1"}, timeout=30).json()
        r2 = requests.post(f"{API}/drivers", headers=_h(user_a["token"]),
                           json={"full_name": "TEST_D2"}, timeout=30).json()
        # Promote d2 to primary
        rp = requests.put(f"{API}/drivers/{r2['id']}/primary",
                          headers=_h(user_a["token"]), timeout=30)
        assert rp.status_code == 200

        lst = requests.get(f"{API}/drivers", headers=_h(user_a["token"]), timeout=30).json()
        assert lst[0]["id"] == r2["id"]
        assert lst[0]["order"] == 0
        assert lst[1]["id"] == r1["id"]
        assert lst[1]["order"] == 1

    def test_driver_isolation(self, user_a, user_b):
        d = requests.post(f"{API}/drivers", headers=_h(user_a["token"]),
                          json={"full_name": "TEST_ISO"}, timeout=30).json()
        # user_b lists -> not there
        lst_b = requests.get(f"{API}/drivers", headers=_h(user_b["token"]), timeout=30).json()
        assert all(x["id"] != d["id"] for x in lst_b)
        # user_b PUT primary on A's driver -> 404
        rp = requests.put(f"{API}/drivers/{d['id']}/primary",
                          headers=_h(user_b["token"]), timeout=30)
        assert rp.status_code == 404
        # user_b DELETE A's driver -> 404
        rd = requests.delete(f"{API}/drivers/{d['id']}",
                             headers=_h(user_b["token"]), timeout=30)
        assert rd.status_code == 404


# ------------------------- Regression: trips + currency -------------------------
class TestRegression:
    def test_trips_crud_smoke(self, user_a):
        payload = {"date": "2026-01-05", "km_start": 100, "km_end": 250}
        r = requests.post(f"{API}/trips", headers=_h(user_a["token"]), json=payload, timeout=30)
        assert r.status_code == 200
        tid = r.json()["id"]
        assert r.json()["km"] == 150
        lst = requests.get(f"{API}/trips", headers=_h(user_a["token"]), timeout=30).json()
        assert any(t["id"] == tid for t in lst)
        rd = requests.delete(f"{API}/trips/{tid}", headers=_h(user_a["token"]), timeout=30)
        assert rd.status_code == 200

    @pytest.mark.parametrize("cur", ["EUR", "BRL", "USD", "GBP", "CHF"])
    def test_currency_valid(self, user_a, cur):
        r = requests.put(f"{API}/settings/currency", headers=_h(user_a["token"]),
                         json={"currency": cur}, timeout=30)
        assert r.status_code == 200
        assert r.json()["app_currency"] == cur

    def test_currency_invalid(self, user_a):
        r = requests.put(f"{API}/settings/currency", headers=_h(user_a["token"]),
                         json={"currency": "XYZ"}, timeout=30)
        assert r.status_code == 400
