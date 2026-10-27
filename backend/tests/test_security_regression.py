"""Regression: ensure driver security UI feature did not touch backend endpoints."""
import os
import uuid
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-builder-demo-579.preview.emergentagent.com").rstrip("/")


def test_drivers_list_200():
    r = requests.get(f"{BASE_URL}/api/drivers", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_trips_list_200():
    r = requests.get(f"{BASE_URL}/api/trips", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_driver_and_get():
    unique = f"TEST_SEC_{uuid.uuid4().hex[:6]}"
    payload = {
        "full_name": unique,
        "cpf": "",
        "license_number": "0000",
        "blood_type": "O+",
        "license_expiry": "2030-01-01",
        "toxicology_expiry": "2030-01-01",
    }
    r = requests.post(f"{BASE_URL}/api/drivers", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    created = r.json()
    assert created["full_name"] == unique
    driver_id = created["id"]
    # Verify persistence
    g = requests.get(f"{BASE_URL}/api/drivers", timeout=15)
    assert g.status_code == 200
    assert any(d["id"] == driver_id for d in g.json())
    # Cleanup
    requests.delete(f"{BASE_URL}/api/drivers/{driver_id}", timeout=15)
