"""Backend tests for Monthly KM control (Controle Mensal de KM).

Covers:
- POST /api/monthly-km (open record with end_km=0 is allowed)
- GET /api/monthly-km (ordered by start_date/created_at desc, user-scoped)
- PUT /api/monthly-km/{id} (update end_km to close month)
- DELETE /api/monthly-km/{id} (soft-delete)
- Validation: end_km > 0 and end_km < start_km -> 400
- Auth: 401 without token
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "https://app-builder-demo-579.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


def _rand_email():
    return f"TEST_cm_{uuid.uuid4().hex[:8]}@teste.com"


@pytest.fixture(scope="module")
def auth():
    """Register a fresh test user and return headers + user info."""
    email = _rand_email()
    password = "senha1234"
    device_id = f"test-device-{uuid.uuid4().hex[:8]}"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": password, "device_id": device_id},
                      timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}", "X-Device-Id": device_id,
               "Content-Type": "application/json"}
    yield {"headers": headers, "email": email, "token": token, "user": data["user"]}


class TestMonthlyKm:
    def test_auth_required(self):
        r = requests.get(f"{API}/monthly-km", timeout=15)
        assert r.status_code == 401

    def test_create_open_record(self, auth):
        """POST monthly-km with end_km omitted/0 should succeed (open record)."""
        payload = {"start_date": "2026-01-01", "start_km": 104000}
        r = requests.post(f"{API}/monthly-km", json=payload, headers=auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["start_km"] == 104000
        assert body["end_km"] == 0
        assert body["start_date"] == "2026-01-01"
        assert "id" in body
        auth["open_id"] = body["id"]

    def test_list_returns_open_record(self, auth):
        r = requests.get(f"{API}/monthly-km", headers=auth["headers"], timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        ids = [i["id"] for i in items]
        assert auth["open_id"] in ids
        it = next(i for i in items if i["id"] == auth["open_id"])
        assert it["end_km"] == 0  # open

    def test_validation_end_lt_start(self, auth):
        """end_km>0 but < start_km should 400."""
        payload = {"start_date": "2026-02-01", "start_km": 110000,
                   "end_date": "2026-02-28", "end_km": 100000}
        r = requests.post(f"{API}/monthly-km", json=payload, headers=auth["headers"], timeout=15)
        assert r.status_code == 400

    def test_update_close_record(self, auth):
        """PUT to set end_km should close the record and persist."""
        payload = {"start_date": "2026-01-01", "start_km": 104000,
                   "end_date": "2026-01-31", "end_km": 106000}
        r = requests.put(f"{API}/monthly-km/{auth['open_id']}",
                         json=payload, headers=auth["headers"], timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["end_km"] == 106000
        assert body["end_date"] == "2026-01-31"
        # Verify via GET
        r2 = requests.get(f"{API}/monthly-km", headers=auth["headers"], timeout=15)
        it = next(i for i in r2.json() if i["id"] == auth["open_id"])
        assert it["end_km"] == 106000

    def test_update_invalid_end(self, auth):
        payload = {"start_date": "2026-01-01", "start_km": 104000,
                   "end_date": "2026-01-31", "end_km": 100}
        r = requests.put(f"{API}/monthly-km/{auth['open_id']}",
                         json=payload, headers=auth["headers"], timeout=15)
        assert r.status_code == 400

    def test_delete_record(self, auth):
        r = requests.delete(f"{API}/monthly-km/{auth['open_id']}",
                            headers=auth["headers"], timeout=15)
        assert r.status_code == 200
        # Verify absent
        r2 = requests.get(f"{API}/monthly-km", headers=auth["headers"], timeout=15)
        ids = [i["id"] for i in r2.json()]
        assert auth["open_id"] not in ids
        # Delete again -> 404
        r3 = requests.delete(f"{API}/monthly-km/{auth['open_id']}",
                             headers=auth["headers"], timeout=15)
        assert r3.status_code == 404


class TestMonthlyKmIntegration:
    """Integration: daily-log + monthly-km interplay (dashboard formula)."""

    def test_daily_log_and_open_monthly(self, auth):
        # Create daily log with end_km=105000
        d_payload = {"date": "2026-01-15", "start_km": 104500, "end_km": 105000}
        rd = requests.post(f"{API}/daily-logs", json=d_payload,
                           headers=auth["headers"], timeout=15)
        assert rd.status_code == 200, rd.text

        # Create open monthly with start_km=104000
        m_payload = {"start_date": "2026-01-01", "start_km": 104000}
        rm = requests.post(f"{API}/monthly-km", json=m_payload,
                           headers=auth["headers"], timeout=15)
        assert rm.status_code == 200
        m = rm.json()
        assert m["end_km"] == 0
        # Dashboard computes: lastDailyKm(105000) - startM(104000) = 1000
        # Verify data present for frontend calc:
        rdl = requests.get(f"{API}/daily-logs", headers=auth["headers"], timeout=15)
        latest_daily = rdl.json()[0]
        assert max(latest_daily.get("end_km", 0), latest_daily.get("start_km", 0)) == 105000

        rml = requests.get(f"{API}/monthly-km", headers=auth["headers"], timeout=15)
        latest_m = rml.json()[0]
        assert latest_m["start_km"] == 104000
        assert latest_m["end_km"] == 0

        # Close monthly: end_km=106000 -> expected 2000
        close = {"start_date": "2026-01-01", "start_km": 104000,
                 "end_date": "2026-01-31", "end_km": 106000}
        rc = requests.put(f"{API}/monthly-km/{latest_m['id']}",
                          json=close, headers=auth["headers"], timeout=15)
        assert rc.status_code == 200
        assert rc.json()["end_km"] == 106000
