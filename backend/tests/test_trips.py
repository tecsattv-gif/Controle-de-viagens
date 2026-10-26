"""Backend tests for Controle de Viagens trip logbook API."""
import os
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-builder-demo-579.preview.emergentagent.com").rstrip("/")
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
    # Cleanup
    for tid in ids:
        try:
            requests.delete(f"{API}/trips/{tid}", timeout=10)
        except Exception:
            pass


# ---------- health / root ----------
def test_root(session):
    r = session.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert "message" in r.json()


# ---------- create + km computed ----------
def test_create_trip_computes_km(session, created_ids):
    payload = {
        "date": "2026-01-15",
        "km_start": 1000,
        "km_end": 1350,
        "start_time": "08:00",
        "end_time": "12:00",
        "loading_place": "TEST_CD_Center",
        "rest_place": "",
        "notes": "TEST",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["km"] == 350
    assert body["km_start"] == 1000
    assert body["km_end"] == 1350
    assert body["loading_place"] == "TEST_CD_Center"
    assert "id" in body and body["id"]
    assert "_id" not in body
    created_ids.append(body["id"])


def test_create_trip_km_equal_ok(session, created_ids):
    """km_end == km_start should be allowed and km == 0."""
    payload = {
        "date": "2026-01-15",
        "km_start": 500,
        "km_end": 500,
        "start_time": "",
        "end_time": "",
        "loading_place": "TEST_ZeroDistance",
        "rest_place": "",
        "notes": "",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["km"] == 0
    created_ids.append(body["id"])


# ---------- validation ----------
def test_create_trip_km_end_less_than_start_returns_400(session):
    payload = {
        "date": "2026-01-15",
        "km_start": 1000,
        "km_end": 500,
        "start_time": "",
        "end_time": "",
        "loading_place": "TEST_Invalid",
        "rest_place": "",
        "notes": "",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 400
    body = r.json()
    assert "detail" in body
    assert "KM final" in body["detail"]


# ---------- list ordering ----------
def test_list_trips_newest_first(session, created_ids):
    # Create two trips with different dates
    older = session.post(
        f"{API}/trips",
        json={
            "date": "2026-01-10",
            "km_start": 100,
            "km_end": 110,
            "start_time": "",
            "end_time": "",
            "loading_place": "TEST_Older",
            "rest_place": "",
            "notes": "",
        },
        timeout=15,
    )
    assert older.status_code == 200
    older_id = older.json()["id"]
    created_ids.append(older_id)

    newer = session.post(
        f"{API}/trips",
        json={
            "date": "2026-01-20",
            "km_start": 200,
            "km_end": 250,
            "start_time": "",
            "end_time": "",
            "loading_place": "TEST_Newer",
            "rest_place": "",
            "notes": "",
        },
        timeout=15,
    )
    assert newer.status_code == 200
    newer_id = newer.json()["id"]
    created_ids.append(newer_id)

    r = session.get(f"{API}/trips", timeout=15)
    assert r.status_code == 200
    trips = r.json()
    # Find our two trips; newer must come before older
    positions = {t["id"]: idx for idx, t in enumerate(trips)}
    assert older_id in positions and newer_id in positions
    assert positions[newer_id] < positions[older_id]
    # No mongo _id leak
    assert all("_id" not in t for t in trips)


# ---------- delete (soft) ----------
def test_delete_trip_soft_removes_from_list(session, created_ids):
    r = session.post(
        f"{API}/trips",
        json={
            "date": "2026-01-16",
            "km_start": 10,
            "km_end": 20,
            "start_time": "",
            "end_time": "",
            "loading_place": "TEST_ToDelete",
            "rest_place": "",
            "notes": "",
        },
        timeout=15,
    )
    assert r.status_code == 200
    tid = r.json()["id"]

    d = session.delete(f"{API}/trips/{tid}", timeout=15)
    assert d.status_code == 200
    assert d.json().get("success") is True

    listed = session.get(f"{API}/trips", timeout=15).json()
    assert not any(t["id"] == tid for t in listed)

    # deleting again returns 404
    d2 = session.delete(f"{API}/trips/{tid}", timeout=15)
    assert d2.status_code == 404


def test_delete_nonexistent_trip_returns_404(session):
    r = session.delete(f"{API}/trips/nonexistent-id-xyz-123", timeout=15)
    assert r.status_code == 404


# ---------- end_date (multi-day trip) ----------
def test_create_multi_day_trip_with_end_date(session, created_ids):
    """Multi-day trip: date=2026-06-10, end_date=2026-06-12, km=800."""
    payload = {
        "date": "2026-06-10",
        "end_date": "2026-06-12",
        "km_start": 1000,
        "km_end": 1800,
        "start_time": "07:00",
        "end_time": "18:00",
        "loading_place": "TEST_MultiDay",
        "rest_place": "",
        "notes": "TEST_multi",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["date"] == "2026-06-10"
    assert body["end_date"] == "2026-06-12"
    assert body["km"] == 800
    assert body["km_start"] == 1000
    assert body["km_end"] == 1800
    assert "_id" not in body
    created_ids.append(body["id"])

    # Verify persistence
    listed = session.get(f"{API}/trips", timeout=15).json()
    found = next((t for t in listed if t["id"] == body["id"]), None)
    assert found is not None
    assert found["end_date"] == "2026-06-12"
    assert found["date"] == "2026-06-10"


def test_create_trip_end_date_equal_start_ok(session, created_ids):
    """end_date == date should be allowed (single-day multi-date form)."""
    payload = {
        "date": "2026-06-15",
        "end_date": "2026-06-15",
        "km_start": 100,
        "km_end": 200,
        "start_time": "",
        "end_time": "",
        "loading_place": "TEST_EqualDate",
        "rest_place": "",
        "notes": "",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["end_date"] == "2026-06-15"
    created_ids.append(body["id"])


def test_create_trip_end_date_before_start_returns_400(session):
    """end_date < date should return 400 with the exact PT-BR detail."""
    payload = {
        "date": "2026-06-12",
        "end_date": "2026-06-10",
        "km_start": 1000,
        "km_end": 1200,
        "start_time": "",
        "end_time": "",
        "loading_place": "TEST_InvalidDates",
        "rest_place": "",
        "notes": "",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 400
    body = r.json()
    assert "detail" in body
    assert body["detail"] == "A data final deve ser igual ou posterior à data inicial."


def test_create_trip_without_end_date_defaults_empty(session, created_ids):
    """Backwards compat: omitting end_date should default to '' and list should return it."""
    payload = {
        "date": "2026-06-20",
        "km_start": 500,
        "km_end": 550,
        "start_time": "",
        "end_time": "",
        "loading_place": "TEST_NoEndDate",
        "rest_place": "",
        "notes": "",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("end_date", None) == ""
    created_ids.append(body["id"])

    listed = session.get(f"{API}/trips", timeout=15).json()
    found = next((t for t in listed if t["id"] == body["id"]), None)
    assert found is not None
    assert "end_date" in found
    assert found["end_date"] == ""


def test_km_validation_takes_precedence_over_date(session):
    """When both km and date are invalid, km error is raised first (per server ordering)."""
    payload = {
        "date": "2026-06-12",
        "end_date": "2026-06-10",
        "km_start": 1000,
        "km_end": 500,
        "start_time": "",
        "end_time": "",
        "loading_place": "TEST_BothInvalid",
        "rest_place": "",
        "notes": "",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 400
    assert "KM final" in r.json()["detail"]



# ---------- rest_stops (multiple rest places) ----------
def test_create_trip_with_multiple_rest_stops(session, created_ids):
    """New: rest_stops accepts an array of strings and is persisted/returned."""
    payload = {
        "date": "2026-01-22",
        "km_start": 100,
        "km_end": 400,
        "start_time": "",
        "end_time": "",
        "loading_place": "TEST_MultiStops",
        "rest_stops": [
            "TEST_Posto BR km120",
            "TEST_Restaurante km250",
            "TEST_Posto Shell km380",
        ],
        "notes": "",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["km"] == 300
    assert isinstance(body.get("rest_stops"), list)
    assert body["rest_stops"] == [
        "TEST_Posto BR km120",
        "TEST_Restaurante km250",
        "TEST_Posto Shell km380",
    ]
    created_ids.append(body["id"])

    # GET must return the list unchanged
    listed = session.get(f"{API}/trips", timeout=15).json()
    found = next((t for t in listed if t["id"] == body["id"]), None)
    assert found is not None
    assert found["rest_stops"] == [
        "TEST_Posto BR km120",
        "TEST_Restaurante km250",
        "TEST_Posto Shell km380",
    ]


def test_create_trip_without_rest_stops_defaults_empty_list(session, created_ids):
    """Backwards compat: omitting rest_stops returns []."""
    payload = {
        "date": "2026-01-23",
        "km_start": 10,
        "km_end": 20,
        "start_time": "",
        "end_time": "",
        "loading_place": "TEST_NoStops",
        "notes": "",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("rest_stops") == []
    created_ids.append(body["id"])

    listed = session.get(f"{API}/trips", timeout=15).json()
    found = next((t for t in listed if t["id"] == body["id"]), None)
    assert found is not None
    assert found.get("rest_stops") == []


def test_create_trip_with_single_rest_stop(session, created_ids):
    """rest_stops with one element works and is returned as one-item list."""
    payload = {
        "date": "2026-01-24",
        "km_start": 0,
        "km_end": 50,
        "loading_place": "TEST_SingleStop",
        "rest_stops": ["TEST_Only Stop"],
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["rest_stops"] == ["TEST_Only Stop"]
    created_ids.append(body["id"])


def test_legacy_rest_place_still_accepted(session, created_ids):
    """rest_place (legacy string) is still accepted for backward-compat."""
    payload = {
        "date": "2026-01-25",
        "km_start": 0,
        "km_end": 10,
        "loading_place": "TEST_Legacy",
        "rest_place": "TEST_LegacyStop",
    }
    r = session.post(f"{API}/trips", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("rest_place") == "TEST_LegacyStop"
    # rest_stops defaults to empty list when only legacy field is used
    assert body.get("rest_stops") == []
    created_ids.append(body["id"])
