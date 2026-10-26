"""
Regression tests for bug: 'KM rodados no mês' should NOT be 0 when there's an open
monthly control + open daily log in the current month.

This test suite validates the backend data that the frontend (app/(tabs)/index.tsx)
uses to compute monthKm. The frontend logic (lines ~199-234) requires:
  - GET /api/monthly-km returns the open monthly control (end_km=0)
  - GET /api/daily-logs returns the daily logs with start_km/end_km
Then the UI combines them: max(sumDaily, maxOdo-startM, tripBasedMonthKm).
"""
import os
import uuid
from datetime import datetime

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _today_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d")


def _month_first_day() -> str:
    return datetime.utcnow().strftime("%Y-%m-01")


@pytest.fixture(scope="module")
def auth():
    email = f"userkm_{uuid.uuid4().hex[:8]}@teste.com"
    device_id = f"dev-{uuid.uuid4().hex[:10]}"
    body = {
        "email": email,
        "password": "senha1234",
        "display_name": "User KM",
        "device_id": device_id,
    }
    r = requests.post(f"{API}/auth/register", json=body, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    token = data["access_token"]
    assert data["user"]["can_write"] is True
    return {
        "Authorization": f"Bearer {token}",
        "X-Device-Id": device_id,
        "Content-Type": "application/json",
    }


class TestMonthKmBugScenario:
    """Scenario 1 from review request: open monthly + 1 closed daily + 1 open daily."""

    def test_scenario_open_monthly_and_mixed_dailies(self, auth):
        # 1) Create OPEN monthly control (start_km only)
        start_km = 200000
        monthly_payload = {
            "start_date": _month_first_day(),
            "start_km": start_km,
            "end_date": "",
            "end_km": 0,
        }
        r = requests.post(f"{API}/monthly-km", json=monthly_payload, headers=auth, timeout=30)
        assert r.status_code == 200, r.text
        monthly = r.json()
        assert monthly["start_km"] == start_km
        assert monthly["end_km"] == 0  # open

        # 2) Create CLOSED daily log (start 200000, end 200500 = 500 km)
        daily1 = {
            "date": _today_iso(),
            "start_place": "Lisboa",
            "start_km": 200000,
            "start_time": "08:00",
            "end_place": "Porto",
            "end_km": 200500,
            "end_time": "14:00",
            "stops": [],
            "notes": "fechado",
        }
        r = requests.post(f"{API}/daily-logs", json=daily1, headers=auth, timeout=30)
        assert r.status_code == 200, r.text

        # 3) Create OPEN daily log (start 200500, no end_place, end_km 0)
        daily2 = {
            "date": _today_iso(),
            "start_place": "Porto",
            "start_km": 200500,
            "start_time": "15:00",
            "end_place": "",
            "end_km": 0,
            "end_time": "",
            "stops": [],
            "notes": "aberto",
        }
        r = requests.post(f"{API}/daily-logs", json=daily2, headers=auth, timeout=30)
        assert r.status_code == 200, r.text

        # 4) Verify GET /monthly-km returns the open control
        r = requests.get(f"{API}/monthly-km", headers=auth, timeout=30)
        assert r.status_code == 200
        monthlies = r.json()
        assert len(monthlies) >= 1
        m = next((x for x in monthlies if x["start_date"] == monthly_payload["start_date"]), None)
        assert m is not None, "monthly for current month missing"
        assert m["end_km"] == 0, "monthly must still be open"
        assert m["start_km"] == start_km

        # 5) Verify GET /daily-logs returns both logs
        r = requests.get(f"{API}/daily-logs", headers=auth, timeout=30)
        assert r.status_code == 200
        logs = r.json()
        assert len(logs) >= 2
        kms = sorted((d["start_km"], d["end_km"]) for d in logs)
        assert (200000, 200500) in kms
        assert (200500, 0) in kms

        # 6) Simulate frontend computation (lines ~199-234 of index.tsx):
        start_m = m["start_km"]
        sum_daily = 0
        max_odo = start_m
        for d in logs:
            diff = (d["end_km"] or 0) - (d["start_km"] or 0)
            if diff > 0:
                sum_daily += diff
            max_odo = max(max_odo, d.get("end_km") or 0, d.get("start_km") or 0)
        odo_result = max_odo - start_m if max_odo > start_m else 0
        trip_based = 0  # no trips in this scenario
        result = max(trip_based, sum_daily, odo_result)
        if result < 0:
            result = 0

        # Expected: 500 (from closed daily), NOT zero
        assert result > 0, "BUG REPRODUCED: month-km would be 0"
        assert result == 500, f"Expected 500, got {result}"


class TestScenario2OpenDailyWithEndKm:
    """Scenario 2: open monthly + a single 'open' daily that HAS start/end_km
    (open because end_place/end_time missing)."""

    def test_open_daily_with_distance(self):
        # New isolated account
        email = f"userkm2_{uuid.uuid4().hex[:8]}@teste.com"
        device_id = f"dev-{uuid.uuid4().hex[:10]}"
        r = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "senha1234", "device_id": device_id},
            timeout=30,
        )
        assert r.status_code == 200
        token = r.json()["access_token"]
        h = {
            "Authorization": f"Bearer {token}",
            "X-Device-Id": device_id,
            "Content-Type": "application/json",
        }

        # Open monthly: start_km only
        r = requests.post(
            f"{API}/monthly-km",
            json={"start_date": _month_first_day(), "start_km": 200000, "end_date": "", "end_km": 0},
            headers=h,
            timeout=30,
        )
        assert r.status_code == 200

        # Single daily: has both km (200500->200800 = 300km) but no end_place => "aberto"
        r = requests.post(
            f"{API}/daily-logs",
            json={
                "date": _today_iso(),
                "start_place": "Lisboa",
                "start_km": 200500,
                "start_time": "08:00",
                "end_place": "",  # open semantics (no end_place)
                "end_km": 200800,
                "end_time": "",
                "stops": [],
                "notes": "",
            },
            headers=h,
            timeout=30,
        )
        assert r.status_code == 200

        logs = requests.get(f"{API}/daily-logs", headers=h, timeout=30).json()
        monthlies = requests.get(f"{API}/monthly-km", headers=h, timeout=30).json()
        m = monthlies[0]

        # Simulate frontend computation
        start_m = m["start_km"]
        sum_daily = 0
        max_odo = start_m
        for d in logs:
            diff = (d["end_km"] or 0) - (d["start_km"] or 0)
            if diff > 0:
                sum_daily += diff
            max_odo = max(max_odo, d.get("end_km") or 0, d.get("start_km") or 0)
        odo_result = max_odo - start_m if max_odo > start_m else 0
        result = max(0, sum_daily, odo_result)

        assert result > 0, "BUG: month-km would be 0 with only an open daily log"
        assert result == 800  # odo_result = 200800-200000 = 800 (dominates sum_daily=300)


class TestMonthlyKmCrud:
    """Basic CRUD sanity for /api/monthly-km and /api/daily-logs."""

    def test_monthly_km_crud(self, auth):
        payload = {
            "start_date": "2025-11-01",
            "start_km": 100000,
            "end_date": "",
            "end_km": 0,
        }
        r = requests.post(f"{API}/monthly-km", json=payload, headers=auth, timeout=30)
        assert r.status_code == 200
        mid = r.json()["id"]

        # Update to closed
        upd = {**payload, "end_date": "2025-11-30", "end_km": 105000}
        r = requests.put(f"{API}/monthly-km/{mid}", json=upd, headers=auth, timeout=30)
        assert r.status_code == 200
        assert r.json()["end_km"] == 105000

        # Validation: end < start
        bad = {**payload, "end_km": 50000}
        r = requests.put(f"{API}/monthly-km/{mid}", json=bad, headers=auth, timeout=30)
        assert r.status_code == 400

        # Delete
        r = requests.delete(f"{API}/monthly-km/{mid}", headers=auth, timeout=30)
        assert r.status_code == 200

        # Should no longer appear in list
        r = requests.get(f"{API}/monthly-km", headers=auth, timeout=30)
        assert r.status_code == 200
        assert all(x["id"] != mid for x in r.json())
