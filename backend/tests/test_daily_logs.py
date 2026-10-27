"""Backend tests for /api/daily-logs (Controle Diário).

Covers: auth requirement, CRUD, ordering, soft-delete (via list), and
per-user isolation.
"""
import os
import uuid
from datetime import date

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") + "/api"


def _register(email: str = "", password: str = "senha1234") -> dict:
    if not email:
        email = f"TEST_dl_{uuid.uuid4().hex[:10]}@teste.com"
    device = "dev_" + uuid.uuid4().hex[:10]
    r = requests.post(
        f"{BASE_URL}/auth/register",
        json={"email": email, "password": password, "device_id": device},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    return {
        "email": email,
        "token": body["access_token"],
        "device": device,
        "user_id": body["user"]["user_id"],
    }


def _headers(session: dict) -> dict:
    return {
        "Authorization": f"Bearer {session['token']}",
        "X-Device-Id": session["device"],
        "Content-Type": "application/json",
    }


@pytest.fixture(scope="module")
def user_a():
    return _register()


@pytest.fixture(scope="module")
def user_b():
    return _register()


# ------ Auth --------------------------------------------------------------
class TestDailyLogsAuth:
    def test_get_requires_auth(self):
        r = requests.get(f"{BASE_URL}/daily-logs", timeout=15)
        assert r.status_code == 401

    def test_post_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/daily-logs",
            json={"date": str(date.today())},
            timeout=15,
        )
        assert r.status_code == 401


# ------ CRUD --------------------------------------------------------------
class TestDailyLogsCRUD:
    def test_create_and_get(self, user_a):
        payload = {
            "date": str(date.today()),
            "start_place": "Garagem",
            "start_km": 1000,
            "start_time": "08:00",
            "end_place": "Cliente",
            "end_km": 1250,
            "end_time": "17:30",
            "stops": [
                {"place": "Posto A", "time": "10:15"},
                {"place": "Almoço", "time": "12:30"},
            ],
            "notes": "TEST_created",
        }
        r = requests.post(
            f"{BASE_URL}/daily-logs",
            json=payload,
            headers=_headers(user_a),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"] and body["start_km"] == 1000 and body["end_km"] == 1250
        assert len(body["stops"]) == 2
        assert body["stops"][0]["place"] == "Posto A"
        assert body.get("user_id") == user_a["user_id"]
        assert "deleted_at" not in body
        user_a["_first_id"] = body["id"]

        # Verify persistence via GET list
        r2 = requests.get(
            f"{BASE_URL}/daily-logs", headers=_headers(user_a), timeout=15
        )
        assert r2.status_code == 200
        ids = [x["id"] for x in r2.json()]
        assert body["id"] in ids

    def test_list_ordered_desc(self, user_a):
        # Create older and newer records
        older = {
            "date": "2024-01-15",
            "start_km": 100,
            "end_km": 200,
            "stops": [],
        }
        newer = {
            "date": "2026-06-15",
            "start_km": 500,
            "end_km": 700,
            "stops": [],
        }
        for p in (older, newer):
            r = requests.post(
                f"{BASE_URL}/daily-logs",
                json=p,
                headers=_headers(user_a),
                timeout=15,
            )
            assert r.status_code == 200

        r = requests.get(
            f"{BASE_URL}/daily-logs", headers=_headers(user_a), timeout=15
        )
        assert r.status_code == 200
        dates = [x["date"] for x in r.json()]
        # Must be sorted date desc
        assert dates == sorted(dates, reverse=True)

    def test_update(self, user_a):
        log_id = user_a["_first_id"]
        payload = {
            "date": str(date.today()),
            "start_place": "Garagem 2",
            "start_km": 1000,
            "start_time": "07:30",
            "end_place": "Cliente 2",
            "end_km": 1300,
            "end_time": "18:00",
            "stops": [{"place": "Nova parada", "time": "11:00"}],
            "notes": "TEST_updated",
        }
        r = requests.put(
            f"{BASE_URL}/daily-logs/{log_id}",
            json=payload,
            headers=_headers(user_a),
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["end_km"] == 1300
        assert r.json()["notes"] == "TEST_updated"

        # Verify via GET
        r2 = requests.get(
            f"{BASE_URL}/daily-logs", headers=_headers(user_a), timeout=15
        )
        found = next(x for x in r2.json() if x["id"] == log_id)
        assert found["end_km"] == 1300
        assert found["stops"][0]["place"] == "Nova parada"

    def test_update_not_found(self, user_a):
        r = requests.put(
            f"{BASE_URL}/daily-logs/does-not-exist",
            json={"date": "2026-01-01", "start_km": 0, "end_km": 0, "stops": []},
            headers=_headers(user_a),
            timeout=15,
        )
        assert r.status_code == 404

    def test_delete_soft(self, user_a):
        log_id = user_a["_first_id"]
        r = requests.delete(
            f"{BASE_URL}/daily-logs/{log_id}",
            headers=_headers(user_a),
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json().get("success") is True

        r2 = requests.get(
            f"{BASE_URL}/daily-logs", headers=_headers(user_a), timeout=15
        )
        ids = [x["id"] for x in r2.json()]
        assert log_id not in ids

        # Delete again should 404 (already soft-deleted)
        r3 = requests.delete(
            f"{BASE_URL}/daily-logs/{log_id}",
            headers=_headers(user_a),
            timeout=15,
        )
        assert r3.status_code == 404


# ------ Isolation ---------------------------------------------------------
class TestDailyLogsIsolation:
    def test_user_b_does_not_see_user_a(self, user_a, user_b):
        # user_a has records; user_b must not see any of them.
        payload = {
            "date": "2026-03-10",
            "start_place": "A start",
            "start_km": 10,
            "end_km": 20,
            "stops": [],
        }
        r = requests.post(
            f"{BASE_URL}/daily-logs",
            json=payload,
            headers=_headers(user_a),
            timeout=15,
        )
        assert r.status_code == 200
        a_id = r.json()["id"]

        r_b = requests.get(
            f"{BASE_URL}/daily-logs", headers=_headers(user_b), timeout=15
        )
        assert r_b.status_code == 200
        b_ids = [x["id"] for x in r_b.json()]
        assert a_id not in b_ids

    def test_user_b_cannot_update_user_a_log(self, user_a, user_b):
        # Create one for user_a
        r = requests.post(
            f"{BASE_URL}/daily-logs",
            json={"date": "2026-03-11", "start_km": 5, "end_km": 15, "stops": []},
            headers=_headers(user_a),
            timeout=15,
        )
        a_id = r.json()["id"]

        # Try to update as user_b -> must be 404 (isolation)
        r_upd = requests.put(
            f"{BASE_URL}/daily-logs/{a_id}",
            json={"date": "2026-03-11", "start_km": 0, "end_km": 0, "stops": []},
            headers=_headers(user_b),
            timeout=15,
        )
        assert r_upd.status_code == 404

        # And delete
        r_del = requests.delete(
            f"{BASE_URL}/daily-logs/{a_id}",
            headers=_headers(user_b),
            timeout=15,
        )
        assert r_del.status_code == 404


# ------ Response shape ----------------------------------------------------
class TestDailyLogsShape:
    def test_no_mongo_id_in_response(self, user_a):
        r = requests.get(
            f"{BASE_URL}/daily-logs", headers=_headers(user_a), timeout=15
        )
        assert r.status_code == 200
        for item in r.json():
            assert "_id" not in item
            assert "deleted_at" not in item
            # Required fields
            for k in ("id", "date", "start_km", "end_km", "stops"):
                assert k in item
