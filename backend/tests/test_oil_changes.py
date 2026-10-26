"""Backend tests for /api/oil-changes CRUD + user isolation + device binding."""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or "https://app-builder-demo-579.preview.emergentagent.com"
API = f"{BASE_URL}/api"


def _register(session: requests.Session, email: str, device_id: str):
    r = session.post(
        f"{API}/auth/register",
        json={"email": email, "password": "senha1234", "device_id": device_id},
        headers={"X-Device-Id": device_id},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, data
    session.headers.update({
        "Authorization": f"Bearer {token}",
        "X-Device-Id": device_id,
        "Content-Type": "application/json",
    })
    return data


@pytest.fixture
def userA():
    s = requests.Session()
    email = f"oilA_{uuid.uuid4().hex[:8]}@teste.com"
    did = f"dev-{uuid.uuid4().hex[:10]}"
    _register(s, email, did)
    return s


@pytest.fixture
def userB():
    s = requests.Session()
    email = f"oilB_{uuid.uuid4().hex[:8]}@teste.com"
    did = f"dev-{uuid.uuid4().hex[:10]}"
    _register(s, email, did)
    return s


def _sample_payload(vehicle_id="veh-1", km=100000, date="2026-01-10"):
    return {
        "vehicle_id": vehicle_id,
        "vehicle_label": "Scania R450",
        "vehicle_plate": "ABC1D23",
        "current_km": km,
        "date": date,
        "km": km,
        "place": "Oficina X",
        "notes": "teste",
        "traction": "6x4",
        "components": [
            {
                "kind": "engine",
                "label": "Óleo do motor",
                "enabled": True,
                "oil_type": "15W40",
                "brand": "Shell",
                "liters": 20,
                "value": 500,
                "km": km,
                "date": date,
                "control": "both",
                "interval_km": 30000,
                "next_km": 0,
                "interval_time": 6,
                "time_unit": "months",
                "next_date": "",
                "alert_km": 1000,
                "alert_days": 15,
            },
            {
                "kind": "gearbox",
                "label": "Caixa",
                "enabled": True,
                "oil_type": "80W90",
                "brand": "Petronas",
                "liters": 10,
                "value": 300,
                "km": km,
                "date": date,
                "control": "km",
                "interval_km": 100000,
                "next_km": 0,
                "interval_time": 0,
                "time_unit": "months",
                "next_date": "",
                "alert_km": 2000,
                "alert_days": 0,
            },
        ],
        "filters": [
            {"kind": "oil", "label": "", "brand": "Mann", "oil_type": "", "quantity": "1", "value": 80},
            {"kind": "air", "label": "", "brand": "Mann", "oil_type": "", "quantity": "1", "value": 60},
        ],
        "labor_value": 150,
        "other_costs": 20,
        "total": 500 + 300 + 80 + 60 + 150 + 20,
    }


class TestOilChangesCRUD:
    def test_create_and_get(self, userA):
        payload = _sample_payload()
        r = userA.post(f"{API}/oil-changes", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["id"]
        assert body["vehicle_plate"] == "ABC1D23"
        assert body["total"] == pytest.approx(1110.0)
        assert len(body["components"]) == 2
        assert body["components"][0]["kind"] == "engine"
        assert "_id" not in body  # must not leak mongo _id
        oid = body["id"]

        # list and ensure present
        rl = userA.get(f"{API}/oil-changes")
        assert rl.status_code == 200
        ids = [x["id"] for x in rl.json()]
        assert oid in ids
        # ensure _id not leaked
        for x in rl.json():
            assert "_id" not in x

    def test_update(self, userA):
        payload = _sample_payload()
        oid = userA.post(f"{API}/oil-changes", json=payload).json()["id"]
        new_payload = dict(payload)
        new_payload["place"] = "Nova oficina"
        new_payload["total"] = 2000
        r = userA.put(f"{API}/oil-changes/{oid}", json=new_payload)
        assert r.status_code == 200, r.text
        assert r.json()["place"] == "Nova oficina"
        assert r.json()["total"] == 2000

        # verify via GET
        got = {x["id"]: x for x in userA.get(f"{API}/oil-changes").json()}[oid]
        assert got["place"] == "Nova oficina"
        assert got["total"] == 2000

    def test_delete_soft(self, userA):
        oid = userA.post(f"{API}/oil-changes", json=_sample_payload()).json()["id"]
        r = userA.delete(f"{API}/oil-changes/{oid}")
        assert r.status_code == 200
        assert r.json()["success"] is True

        # should no longer appear in list
        ids = [x["id"] for x in userA.get(f"{API}/oil-changes").json()]
        assert oid not in ids

        # deleting again returns 404
        r2 = userA.delete(f"{API}/oil-changes/{oid}")
        assert r2.status_code == 404

    def test_update_nonexistent(self, userA):
        r = userA.put(f"{API}/oil-changes/{uuid.uuid4().hex}", json=_sample_payload())
        assert r.status_code == 404


class TestOilChangesIsolation:
    def test_userA_cannot_see_userB(self, userA, userB):
        a_id = userA.post(f"{API}/oil-changes", json=_sample_payload(vehicle_id="va")).json()["id"]
        b_id = userB.post(f"{API}/oil-changes", json=_sample_payload(vehicle_id="vb")).json()["id"]

        a_list = [x["id"] for x in userA.get(f"{API}/oil-changes").json()]
        b_list = [x["id"] for x in userB.get(f"{API}/oil-changes").json()]
        assert a_id in a_list and b_id not in a_list
        assert b_id in b_list and a_id not in b_list

    def test_userB_cannot_update_userA(self, userA, userB):
        a_id = userA.post(f"{API}/oil-changes", json=_sample_payload()).json()["id"]
        r = userB.put(f"{API}/oil-changes/{a_id}", json=_sample_payload())
        assert r.status_code == 404

    def test_userB_cannot_delete_userA(self, userA, userB):
        a_id = userA.post(f"{API}/oil-changes", json=_sample_payload()).json()["id"]
        r = userB.delete(f"{API}/oil-changes/{a_id}")
        assert r.status_code == 404


class TestOilChangesAuth:
    def test_requires_auth(self):
        r = requests.get(f"{API}/oil-changes")
        assert r.status_code in (401, 403)
