"""Tests for /api/vehicles, /api/drivers and Trip snapshot immutability."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
    os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Vehicles ----------
class TestVehicles:
    created_id = None

    def test_create_vehicle(self, api):
        payload = {
            "company": "TEST_Transportes Silva",
            "truck_brand": "Volvo",
            "truck_plate": "TEST-1234",
            "truck_model": "FH 540",
            "trailers": ["TRL-0001", "TRL-0002"],
            "uses_dolly": True,
            "dolly_plate": "DLY-0001",
            "dolly_trailer_plate": "TRL-DOLLY-1",
        }
        r = api.post(f"{BASE_URL}/api/vehicles", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["truck_plate"] == "TEST-1234"
        assert data["trailers"] == ["TRL-0001", "TRL-0002"]
        assert data["uses_dolly"] is True
        assert data["dolly_plate"] == "DLY-0001"
        assert "id" in data
        assert "_id" not in data
        TestVehicles.created_id = data["id"]

    def test_get_vehicles_contains_created(self, api):
        r = api.get(f"{BASE_URL}/api/vehicles")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        ids = [v["id"] for v in data]
        assert TestVehicles.created_id in ids
        for v in data:
            assert "_id" not in v

    def test_update_vehicle(self, api):
        vid = TestVehicles.created_id
        payload = {
            "company": "TEST_Transportes Silva LTDA",
            "truck_brand": "Scania",
            "truck_plate": "TEST-9999",
            "truck_model": "R450",
            "trailers": ["TRL-0003"],
            "uses_dolly": False,
            "dolly_plate": "",
            "dolly_trailer_plate": "",
        }
        r = api.put(f"{BASE_URL}/api/vehicles/{vid}", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["truck_plate"] == "TEST-9999"
        assert d["uses_dolly"] is False
        assert d["trailers"] == ["TRL-0003"]

    def test_delete_vehicle_soft(self, api):
        vid = TestVehicles.created_id
        r = api.delete(f"{BASE_URL}/api/vehicles/{vid}")
        assert r.status_code == 200
        assert r.json().get("success") is True
        # not returned in list anymore
        r2 = api.get(f"{BASE_URL}/api/vehicles")
        assert vid not in [v["id"] for v in r2.json()]

    def test_delete_nonexistent_vehicle(self, api):
        r = api.delete(f"{BASE_URL}/api/vehicles/does-not-exist")
        assert r.status_code == 404


# ---------- Drivers ----------
class TestDrivers:
    created_id = None

    def test_create_driver(self, api):
        payload = {
            "full_name": "TEST_João da Silva",
            "cpf": "12345678900",
            "license_number": "01234567890",
            "age": 38,
            "blood_type": "O+",
            "license_expiry": "2026-06-30",
            "toxicology_expiry": "2026-03-15",
        }
        r = api.post(f"{BASE_URL}/api/drivers", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["full_name"] == "TEST_João da Silva"
        assert data["blood_type"] == "O+"
        assert data["age"] == 38
        assert data["license_expiry"] == "2026-06-30"
        assert "id" in data
        assert "_id" not in data
        TestDrivers.created_id = data["id"]

    def test_get_drivers_contains_created(self, api):
        r = api.get(f"{BASE_URL}/api/drivers")
        assert r.status_code == 200
        data = r.json()
        assert TestDrivers.created_id in [d["id"] for d in data]
        for d in data:
            assert "_id" not in d

    def test_update_driver(self, api):
        did = TestDrivers.created_id
        payload = {
            "full_name": "TEST_João Editado",
            "cpf": "",
            "license_number": "98765432100",
            "age": 40,
            "blood_type": "AB-",
            "license_expiry": "2027-01-01",
            "toxicology_expiry": "2026-12-01",
        }
        r = api.put(f"{BASE_URL}/api/drivers/{did}", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["full_name"] == "TEST_João Editado"
        assert d["blood_type"] == "AB-"
        assert d["age"] == 40
        assert d["license_number"] == "98765432100"

    def test_driver_optional_age(self, api):
        payload = {
            "full_name": "TEST_Sem Idade",
            "cpf": "",
            "license_number": "",
            "age": None,
            "blood_type": "",
            "license_expiry": "",
            "toxicology_expiry": "",
        }
        r = api.post(f"{BASE_URL}/api/drivers", json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["age"] is None
        # cleanup
        api.delete(f"{BASE_URL}/api/drivers/{d['id']}")

    def test_delete_driver_soft(self, api):
        did = TestDrivers.created_id
        r = api.delete(f"{BASE_URL}/api/drivers/{did}")
        assert r.status_code == 200
        r2 = api.get(f"{BASE_URL}/api/drivers")
        assert did not in [d["id"] for d in r2.json()]

    def test_delete_nonexistent_driver(self, api):
        r = api.delete(f"{BASE_URL}/api/drivers/does-not-exist")
        assert r.status_code == 404


# ---------- Trip Snapshot Immutability ----------
class TestTripSnapshot:
    vehicle_id = None
    driver_id = None
    trip_id = None
    original_vehicle_label = None
    original_driver_name = None
    original_driver_license = None

    def test_setup_vehicle_and_driver(self, api):
        v = api.post(f"{BASE_URL}/api/vehicles", json={
            "company": "TEST_Snap Co",
            "truck_brand": "Volvo",
            "truck_plate": "SNAP-0001",
            "truck_model": "",
            "trailers": ["SNAP-TRL-1"],
            "uses_dolly": False,
            "dolly_plate": "",
            "dolly_trailer_plate": "",
        }).json()
        TestTripSnapshot.vehicle_id = v["id"]

        d = api.post(f"{BASE_URL}/api/drivers", json={
            "full_name": "TEST_Snapshot Driver",
            "cpf": "",
            "license_number": "CNH-SNAP-123",
            "age": 30,
            "blood_type": "A+",
            "license_expiry": "2027-01-01",
            "toxicology_expiry": "2027-01-01",
        }).json()
        TestTripSnapshot.driver_id = d["id"]

    def test_create_trip_with_snapshot(self, api):
        payload = {
            "date": "2026-01-15",
            "end_date": "2026-01-15",
            "km_start": 1000,
            "km_end": 1200,
            "start_time": "08:00",
            "end_time": "12:00",
            "loading_place": "TEST_Origem",
            "unloading_place": "TEST_Destino",
            "rest_stops": [],
            "notes": "TEST snapshot",
            "vehicle_id": TestTripSnapshot.vehicle_id,
            "vehicle_label": "Cavalo SNAP-0001 • Reboque SNAP-TRL-1",
            "driver_id": TestTripSnapshot.driver_id,
            "driver_name": "TEST_Snapshot Driver",
            "driver_license": "CNH-SNAP-123",
        }
        r = api.post(f"{BASE_URL}/api/trips", json=payload)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["vehicle_id"] == TestTripSnapshot.vehicle_id
        assert t["vehicle_label"] == payload["vehicle_label"]
        assert t["driver_id"] == TestTripSnapshot.driver_id
        assert t["driver_name"] == "TEST_Snapshot Driver"
        assert t["driver_license"] == "CNH-SNAP-123"
        assert t["km"] == 200
        TestTripSnapshot.trip_id = t["id"]
        TestTripSnapshot.original_vehicle_label = t["vehicle_label"]
        TestTripSnapshot.original_driver_name = t["driver_name"]
        TestTripSnapshot.original_driver_license = t["driver_license"]

    def test_snapshot_unchanged_after_vehicle_update(self, api):
        # Update vehicle plate/company
        r = api.put(f"{BASE_URL}/api/vehicles/{TestTripSnapshot.vehicle_id}", json={
            "company": "TEST_CHANGED",
            "truck_brand": "Scania",
            "truck_plate": "CHANGED-9999",
            "truck_model": "",
            "trailers": ["CHANGED-TRL"],
            "uses_dolly": False,
            "dolly_plate": "",
            "dolly_trailer_plate": "",
        })
        assert r.status_code == 200

        # Trip snapshot should still show original label
        trips = api.get(f"{BASE_URL}/api/trips").json()
        trip = next(t for t in trips if t["id"] == TestTripSnapshot.trip_id)
        assert trip["vehicle_label"] == TestTripSnapshot.original_vehicle_label
        assert trip["vehicle_id"] == TestTripSnapshot.vehicle_id

    def test_snapshot_unchanged_after_driver_update(self, api):
        r = api.put(f"{BASE_URL}/api/drivers/{TestTripSnapshot.driver_id}", json={
            "full_name": "TEST_CHANGED_NAME",
            "cpf": "",
            "license_number": "CHANGED-CNH",
            "age": 99,
            "blood_type": "O-",
            "license_expiry": "2028-01-01",
            "toxicology_expiry": "2028-01-01",
        })
        assert r.status_code == 200

        trips = api.get(f"{BASE_URL}/api/trips").json()
        trip = next(t for t in trips if t["id"] == TestTripSnapshot.trip_id)
        assert trip["driver_name"] == TestTripSnapshot.original_driver_name
        assert trip["driver_license"] == TestTripSnapshot.original_driver_license

    def test_snapshot_unchanged_after_delete(self, api):
        # Delete both vehicle and driver
        assert api.delete(f"{BASE_URL}/api/vehicles/{TestTripSnapshot.vehicle_id}").status_code == 200
        assert api.delete(f"{BASE_URL}/api/drivers/{TestTripSnapshot.driver_id}").status_code == 200

        trips = api.get(f"{BASE_URL}/api/trips").json()
        trip = next(t for t in trips if t["id"] == TestTripSnapshot.trip_id)
        assert trip["vehicle_label"] == TestTripSnapshot.original_vehicle_label
        assert trip["driver_name"] == TestTripSnapshot.original_driver_name
        assert trip["driver_license"] == TestTripSnapshot.original_driver_license

    def test_cleanup_trip(self, api):
        r = api.delete(f"{BASE_URL}/api/trips/{TestTripSnapshot.trip_id}")
        assert r.status_code == 200


class TestTripWithoutSnapshot:
    """Trip should still work if no vehicle/driver selected (optional)."""

    def test_create_trip_no_composition(self, api):
        r = api.post(f"{BASE_URL}/api/trips", json={
            "date": "2026-01-10",
            "end_date": "",
            "km_start": 100,
            "km_end": 150,
            "start_time": "",
            "end_time": "",
            "loading_place": "TEST_A",
            "unloading_place": "TEST_B",
            "rest_stops": [],
            "notes": "",
            "vehicle_id": "",
            "vehicle_label": "",
            "driver_id": "",
            "driver_name": "",
            "driver_license": "",
        })
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["vehicle_id"] == ""
        assert t["driver_name"] == ""
        assert t["km"] == 50
        # cleanup
        api.delete(f"{BASE_URL}/api/trips/{t['id']}")
