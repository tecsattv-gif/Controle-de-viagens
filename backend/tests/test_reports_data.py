"""
Backend data-shape tests for the new client-side Relatórios de Viagem feature.

Relatórios is computed on the frontend from GET /api/trips (no new endpoint).
These tests verify:
  - GET /api/trips returns a list with the fields the report screen consumes
    (date, end_date, km_start, km_end, km, start_time, end_time,
     loading_place, unloading_place, rest_place, rest_stops, notes).
  - Trip.date supports ISO-lexicographic range filtering (used by the
    Relatórios date-range filter: t.date >= startISO && t.date <= endISO).
  - No mongodb _id leaks in the response.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://app-builder-demo-579.preview.emergentagent.com",
).rstrip("/")
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
    for tid in ids:
        try:
            requests.delete(f"{API}/trips/{tid}", timeout=10)
        except Exception:
            pass


# --- data shape ---
def test_trips_list_contains_reports_fields(session, created_ids):
    """Create a trip that exercises every field the Relatórios card renders."""
    tag = f"TEST_REPORT_{uuid.uuid4().hex[:6]}"
    payload = {
        "date": "2026-01-10",
        "end_date": "2026-01-11",
        "km_start": 100000,
        "km_end": 100450,
        "start_time": "07:30",
        "end_time": "18:45",
        "loading_place": f"{tag}_LOAD",
        "unloading_place": f"{tag}_UNLOAD",
        "rest_place": "",
        "rest_stops": [f"{tag}_STOP_A", f"{tag}_STOP_B"],
        "notes": f"{tag}_NOTES",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    trip = r.json()
    created_ids.append(trip["id"])

    # required keys used by relatorios.tsx
    for k in [
        "id", "date", "end_date", "km_start", "km_end", "km",
        "start_time", "end_time", "loading_place", "unloading_place",
        "rest_place", "rest_stops", "notes",
    ]:
        assert k in trip, f"missing key {k}"
    assert "_id" not in trip
    assert trip["km"] == 450
    assert trip["rest_stops"] == [f"{tag}_STOP_A", f"{tag}_STOP_B"]

    # verify GET /trips returns the same shape
    r = session.get(f"{API}/trips", timeout=15)
    assert r.status_code == 200
    found = [t for t in r.json() if t["id"] == trip["id"]]
    assert found and "_id" not in found[0] and found[0]["km"] == 450


# --- date-range filter (ISO strings sort lexicographically) ---
def test_trips_date_range_filter(session, created_ids):
    """Verify multiple trips can be range-filtered on the client using
    trip.date lexicographic comparison (as done in relatorios.tsx)."""
    tag = f"TEST_RANGE_{uuid.uuid4().hex[:6]}"
    dates = ["2025-11-05", "2025-12-20", "2026-01-15", "2026-02-02"]
    kms = [10, 20, 30, 40]
    for d, k in zip(dates, kms):
        r = session.post(
            f"{API}/trips",
            json={
                "date": d, "km_start": 0, "km_end": k,
                "loading_place": tag, "unloading_place": tag,
            },
            timeout=15,
        )
        assert r.status_code == 200
        created_ids.append(r.json()["id"])

    r = session.get(f"{API}/trips", timeout=15)
    all_trips = [t for t in r.json() if t.get("loading_place") == tag]
    assert len(all_trips) == 4

    # Apply the exact filter used by relatorios.tsx
    start, end = "2025-12-01", "2026-01-31"
    in_range = [t for t in all_trips if start <= t["date"] <= end]
    assert len(in_range) == 2
    assert sum(t["km"] for t in in_range) == 50  # 20 + 30

    # end < start yields empty (frontend also shows "Período inválido" banner)
    r_start, r_end = "2026-02-01", "2026-01-01"
    empty = [t for t in all_trips if r_start <= t["date"] <= r_end]
    assert empty == []


# --- edge: single-day trip has same date/end_date semantics ---
def test_single_day_trip_end_date_optional(session, created_ids):
    r = session.post(
        f"{API}/trips",
        json={"date": "2026-01-20", "km_start": 500, "km_end": 620},
        timeout=15,
    )
    assert r.status_code == 200
    t = r.json()
    created_ids.append(t["id"])
    # end_date defaults to empty string; relatorios.tsx handles this ('' !== date)
    assert t["end_date"] == ""
    assert t["km"] == 120
