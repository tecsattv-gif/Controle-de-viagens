"""Backend tests for the new OS (Service Orders) module.

Covers:
  * CRUD POST/GET/PUT/DELETE /api/service-orders
  * Sequential numbering per user (never reused across deletions)
  * User isolation (numbers scoped per user)
  * Auth required for writes
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-builder-demo-579.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _register(email_prefix: str):
    device_id = f"dev_{uuid.uuid4().hex[:10]}"
    email = f"{email_prefix}_{uuid.uuid4().hex[:6]}@teste.com"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "senha1234", "device_id": device_id},
        headers={"X-Device-Id": device_id},
        timeout=30,
    )
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {
        "email": email,
        "token": data["access_token"],
        "device_id": device_id,
        "user": data["user"],
    }


def _headers(acc):
    return {
        "Authorization": f"Bearer {acc['token']}",
        "X-Device-Id": acc["device_id"],
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def user_a():
    return _register("TEST_userosA")


@pytest.fixture(scope="module")
def user_b():
    return _register("TEST_userosB")


# -------------------------------------------------------------------
# Auth
# -------------------------------------------------------------------
class TestAuth:
    def test_create_requires_auth(self):
        r = requests.post(
            f"{API}/service-orders",
            json={"date": "2026-01-01", "descriptions": ["x"]},
            timeout=30,
        )
        assert r.status_code == 401

    def test_update_requires_auth(self):
        r = requests.put(
            f"{API}/service-orders/some-id",
            json={"date": "2026-01-01", "descriptions": ["x"]},
            timeout=30,
        )
        assert r.status_code == 401

    def test_delete_requires_auth(self):
        r = requests.delete(f"{API}/service-orders/some-id", timeout=30)
        assert r.status_code == 401


# -------------------------------------------------------------------
# CRUD + sequential numbering + non-reuse + isolation
# -------------------------------------------------------------------
class TestServiceOrderCRUD:
    def test_full_flow(self, user_a, user_b):
        h = _headers(user_a)

        # Clean start: user_a should have no OS
        r = requests.get(f"{API}/service-orders", headers=h, timeout=30)
        assert r.status_code == 200
        assert r.json() == []

        # Create OS #1
        payload1 = {
            "date": "2026-01-10",
            "km": 100000,
            "vehicle_plate": "AA-11-BB",
            "trailer_plate": "CC-22-DD",
            "descriptions": ["Trocar óleo", "Verificar freios"],
        }
        r1 = requests.post(f"{API}/service-orders", headers=h, json=payload1, timeout=30)
        assert r1.status_code == 200, r1.text
        os1 = r1.json()
        assert os1["number"] == 1
        assert os1["vehicle_plate"] == "AA-11-BB"
        assert os1["trailer_plate"] == "CC-22-DD"
        assert os1["km"] == 100000
        assert os1["descriptions"] == ["Trocar óleo", "Verificar freios"]
        assert "_id" not in os1

        # Create OS #2
        r2 = requests.post(
            f"{API}/service-orders",
            headers=h,
            json={"date": "2026-01-11", "km": 100100, "vehicle_plate": "AA-11-BB",
                  "trailer_plate": "CC-22-DD", "descriptions": ["Lavagem"]},
            timeout=30,
        )
        assert r2.status_code == 200
        os2 = r2.json()
        assert os2["number"] == 2

        # Create OS #3
        r3 = requests.post(
            f"{API}/service-orders",
            headers=h,
            json={"date": "2026-01-12", "km": 100200, "vehicle_plate": "AA-11-BB",
                  "trailer_plate": "CC-22-DD", "descriptions": ["Teste 3"]},
            timeout=30,
        )
        assert r3.status_code == 200
        os3 = r3.json()
        assert os3["number"] == 3

        # List => ordered by number desc
        lst = requests.get(f"{API}/service-orders", headers=h, timeout=30).json()
        assert [x["number"] for x in lst] == [3, 2, 1]

        # Delete OS#2 => soft delete, should disappear from listing
        rd = requests.delete(f"{API}/service-orders/{os2['id']}", headers=h, timeout=30)
        assert rd.status_code == 200
        lst2 = requests.get(f"{API}/service-orders", headers=h, timeout=30).json()
        assert [x["number"] for x in lst2] == [3, 1]

        # Create new OS => should get number 4 (NEVER reuse number 2)
        r4 = requests.post(
            f"{API}/service-orders",
            headers=h,
            json={"date": "2026-01-13", "km": 100300, "vehicle_plate": "AA-11-BB",
                  "trailer_plate": "CC-22-DD", "descriptions": ["Após deleção"]},
            timeout=30,
        )
        assert r4.status_code == 200
        os4 = r4.json()
        assert os4["number"] == 4, f"Expected number 4, got {os4['number']}"

        # PUT update preserves number and changes other fields
        upd_payload = {
            "date": "2026-02-01",
            "km": 99999,
            "vehicle_plate": "ZZ-99-ZZ",
            "trailer_plate": "YY-88-YY",
            "descriptions": ["novo A", "novo B", "novo C"],
        }
        ru = requests.put(
            f"{API}/service-orders/{os1['id']}", headers=h, json=upd_payload, timeout=30
        )
        assert ru.status_code == 200, ru.text
        upd = ru.json()
        assert upd["number"] == 1, "PUT must NOT change the OS number"
        assert upd["date"] == "2026-02-01"
        assert upd["km"] == 99999
        assert upd["vehicle_plate"] == "ZZ-99-ZZ"
        assert upd["trailer_plate"] == "YY-88-YY"
        assert upd["descriptions"] == ["novo A", "novo B", "novo C"]

        # GET verifies persistence
        lst3 = requests.get(f"{API}/service-orders", headers=h, timeout=30).json()
        found = next(x for x in lst3 if x["id"] == os1["id"])
        assert found["number"] == 1
        assert found["km"] == 99999

        # ----- Isolation per user -----
        hb = _headers(user_b)
        rb_list = requests.get(f"{API}/service-orders", headers=hb, timeout=30)
        assert rb_list.status_code == 200
        # User B should NOT see user A's OS
        assert rb_list.json() == []

        # User B creates OS => numbering starts at 1 for them
        rb1 = requests.post(
            f"{API}/service-orders",
            headers=hb,
            json={"date": "2026-01-15", "km": 500, "vehicle_plate": "BB-11-BB",
                  "trailer_plate": "", "descriptions": ["userB first"]},
            timeout=30,
        )
        assert rb1.status_code == 200
        osB1 = rb1.json()
        assert osB1["number"] == 1, "User B numbering must start at 1 (isolated per user)"

        # User B cannot update/delete User A's OS => 404
        rbad = requests.put(
            f"{API}/service-orders/{os1['id']}",
            headers=hb,
            json=upd_payload,
            timeout=30,
        )
        assert rbad.status_code == 404
        rbaddel = requests.delete(f"{API}/service-orders/{os1['id']}", headers=hb, timeout=30)
        assert rbaddel.status_code == 404

        # Cleanup: delete user A remaining OS and user B OS
        for item in requests.get(f"{API}/service-orders", headers=h, timeout=30).json():
            requests.delete(f"{API}/service-orders/{item['id']}", headers=h, timeout=30)
        for item in requests.get(f"{API}/service-orders", headers=hb, timeout=30).json():
            requests.delete(f"{API}/service-orders/{item['id']}", headers=hb, timeout=30)
