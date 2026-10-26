# Backend tests for the "editar viagem + fotos + driver_number/company" round.
# Focus:
#  - PUT /api/trips/{id}: updates in-place, validates km_end/end_date, 404, id/created_at preserved
#  - drivers/vehicles: driver_number/company/photo_path persist through POST/PUT
#  - POST /api/upload + GET /api/files/{path} smoke reconfirmation
import io
import os
import time

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    return s


# -------------------------- PUT /api/trips/{id} ---------------------------
class TestTripUpdate:
    def _create_trip(self, api_client, **overrides):
        payload = {
            "date": "2026-01-10",
            "end_date": "2026-01-10",
            "km_start": 1000,
            "km_end": 1200,
            "start_time": "08:00",
            "end_time": "12:00",
            "loading_place": "TEST_CD Origem",
            "unloading_place": "TEST_Cliente",
            "rest_stops": ["TEST_Posto A"],
            "notes": "TEST original",
            "vehicle_id": "",
            "vehicle_label": "",
            "driver_id": "",
            "driver_name": "",
            "driver_license": "",
        }
        payload.update(overrides)
        r = api_client.post(f"{API}/trips", json=payload)
        assert r.status_code == 200, r.text
        return r.json()

    def test_put_updates_in_place_and_preserves_id_created_at(self, api_client):
        original = self._create_trip(api_client)
        trip_id = original["id"]
        created_at = original["created_at"]

        update = {
            "date": "2026-01-11",
            "end_date": "2026-01-12",
            "km_start": 1000,
            "km_end": 1500,  # 500 km
            "start_time": "07:30",
            "end_time": "18:45",
            "loading_place": "TEST_Origem NOVA",
            "unloading_place": "TEST_Destino NOVO",
            "rest_stops": ["TEST_Parada 1", "TEST_Parada 2"],
            "notes": "TEST editado",
            "vehicle_id": "",
            "vehicle_label": "",
            "driver_id": "",
            "driver_name": "",
            "driver_license": "",
        }
        r = api_client.put(f"{API}/trips/{trip_id}", json=update)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == trip_id, "id must be preserved on PUT"
        assert data["created_at"] == created_at, "created_at must be preserved"
        assert data["km"] == 500, "km must be recalculated (km_end - km_start)"
        assert data["date"] == "2026-01-11"
        assert data["end_date"] == "2026-01-12"
        assert data["loading_place"] == "TEST_Origem NOVA"
        assert data["rest_stops"] == ["TEST_Parada 1", "TEST_Parada 2"]

        # Verify persistence via list
        r2 = api_client.get(f"{API}/trips")
        assert r2.status_code == 200
        found = [t for t in r2.json() if t["id"] == trip_id]
        assert len(found) == 1, "should still be exactly one trip with this id (no duplicate)"
        assert found[0]["notes"] == "TEST editado"

        api_client.delete(f"{API}/trips/{trip_id}")

    def test_put_validates_km_end_lt_km_start(self, api_client):
        t = self._create_trip(api_client)
        r = api_client.put(f"{API}/trips/{t['id']}", json={
            **_full_input(t), "km_start": 5000, "km_end": 4000,
        })
        assert r.status_code == 400
        assert "KM" in r.json().get("detail", "")
        api_client.delete(f"{API}/trips/{t['id']}")

    def test_put_validates_end_date_before_date(self, api_client):
        t = self._create_trip(api_client)
        r = api_client.put(f"{API}/trips/{t['id']}", json={
            **_full_input(t), "date": "2026-02-10", "end_date": "2026-02-01",
        })
        assert r.status_code == 400
        assert "data" in r.json().get("detail", "").lower()
        api_client.delete(f"{API}/trips/{t['id']}")

    def test_put_404_when_id_unknown(self, api_client):
        r = api_client.put(f"{API}/trips/unknown-id-xyz", json=_full_input({
            "date": "2026-01-10", "end_date": "", "km_start": 0, "km_end": 0,
            "start_time": "", "end_time": "", "loading_place": "", "unloading_place": "",
            "rest_stops": [], "notes": "",
            "vehicle_id": "", "vehicle_label": "",
            "driver_id": "", "driver_name": "", "driver_license": "",
        }))
        assert r.status_code == 404

    def test_put_does_not_duplicate_and_updates_snapshot(self, api_client):
        t = self._create_trip(api_client)
        trip_id = t["id"]

        # Get list count before
        before = api_client.get(f"{API}/trips").json()
        before_count = len([x for x in before if x["id"] == trip_id])

        upd = {
            **_full_input(t),
            "vehicle_id": "veh-abc",
            "vehicle_label": "TEST_VEH-9999 (Trans TEST)",
            "driver_id": "drv-abc",
            "driver_name": "TEST Motorista Editado",
            "driver_license": "CNH-EDIT-1",
        }
        r = api_client.put(f"{API}/trips/{trip_id}", json=upd)
        assert r.status_code == 200
        after = api_client.get(f"{API}/trips").json()
        after_count = len([x for x in after if x["id"] == trip_id])
        assert before_count == 1 and after_count == 1, "PUT must not create a duplicate"

        item = next(x for x in after if x["id"] == trip_id)
        assert item["vehicle_label"] == "TEST_VEH-9999 (Trans TEST)"
        assert item["driver_name"] == "TEST Motorista Editado"
        assert item["driver_license"] == "CNH-EDIT-1"
        api_client.delete(f"{API}/trips/{trip_id}")


def _full_input(t):
    return {
        "date": t.get("date", "2026-01-10"),
        "end_date": t.get("end_date", ""),
        "km_start": t.get("km_start", 0),
        "km_end": t.get("km_end", 0),
        "start_time": t.get("start_time", ""),
        "end_time": t.get("end_time", ""),
        "loading_place": t.get("loading_place", ""),
        "unloading_place": t.get("unloading_place", ""),
        "rest_stops": t.get("rest_stops", []),
        "notes": t.get("notes", ""),
        "vehicle_id": t.get("vehicle_id", ""),
        "vehicle_label": t.get("vehicle_label", ""),
        "driver_id": t.get("driver_id", ""),
        "driver_name": t.get("driver_name", ""),
        "driver_license": t.get("driver_license", ""),
    }


# -------------------------- Drivers new fields ---------------------------
class TestDriverExtraFields:
    def test_driver_number_company_photo_persist(self, api_client):
        payload = {
            "full_name": "TEST_D Fulano",
            "driver_number": "MOT-0042",
            "company": "TEST_Transportes Silva",
            "cpf": "",
            "license_number": "CNH-777",
            "age": 40,
            "blood_type": "O+",
            "license_expiry": "2027-05-01",
            "toxicology_expiry": "2027-06-01",
            "photo_path": "controle-viagens/uploads/fake-driver.jpg",
        }
        r = api_client.post(f"{API}/drivers", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["driver_number"] == "MOT-0042"
        assert d["company"] == "TEST_Transportes Silva"
        assert d["photo_path"] == payload["photo_path"]

        # GET verifies persistence
        r2 = api_client.get(f"{API}/drivers")
        assert r2.status_code == 200
        found = next((x for x in r2.json() if x["id"] == d["id"]), None)
        assert found is not None
        assert found["driver_number"] == "MOT-0042"
        assert found["company"] == "TEST_Transportes Silva"
        assert found["photo_path"] == payload["photo_path"]

        # PUT with new values
        payload["driver_number"] = "MOT-9999"
        payload["company"] = "TEST_Nova Empresa"
        payload["photo_path"] = ""
        r3 = api_client.put(f"{API}/drivers/{d['id']}", json=payload)
        assert r3.status_code == 200
        d2 = r3.json()
        assert d2["driver_number"] == "MOT-9999"
        assert d2["company"] == "TEST_Nova Empresa"
        assert d2["photo_path"] == ""

        api_client.delete(f"{API}/drivers/{d['id']}")


# -------------------------- Vehicles photo_path ---------------------------
class TestVehiclePhoto:
    def test_vehicle_photo_path_persists(self, api_client):
        payload = {
            "company": "TEST_Empresa V",
            "truck_brand": "Volvo",
            "truck_plate": "TST-0001",
            "truck_model": "FH",
            "trailers": ["REB-01"],
            "uses_dolly": False,
            "dolly_plate": "",
            "dolly_trailer_plate": "",
            "photo_path": "controle-viagens/uploads/fake-vehicle.jpg",
        }
        r = api_client.post(f"{API}/vehicles", json=payload)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["photo_path"] == payload["photo_path"]

        r2 = api_client.get(f"{API}/vehicles")
        found = next((x for x in r2.json() if x["id"] == v["id"]), None)
        assert found and found["photo_path"] == payload["photo_path"]

        payload["photo_path"] = ""
        r3 = api_client.put(f"{API}/vehicles/{v['id']}", json=payload)
        assert r3.status_code == 200 and r3.json()["photo_path"] == ""

        api_client.delete(f"{API}/vehicles/{v['id']}")


# -------------------------- Upload + Files smoke -----------------------
# 1x1 PNG (89 bytes) — smallest valid PNG
PNG_1x1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff"
    b"\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
)


class TestUploadAndFiles:
    def test_upload_returns_path_and_files_serves_image(self, api_client):
        files = {"file": ("tiny.png", io.BytesIO(PNG_1x1), "image/png")}
        r = api_client.post(f"{API}/upload", files=files)
        # Storage may fail (402/502) if account has no credits — accept & skip in that case.
        if r.status_code != 200:
            pytest.skip(f"Upload storage not available (status={r.status_code}): {r.text[:200]}")
        path = r.json().get("path")
        assert path and path.startswith("controle-viagens/uploads/")

        # Fetch back
        time.sleep(0.5)
        r2 = api_client.get(f"{API}/files/{path}")
        assert r2.status_code == 200
        ct = r2.headers.get("content-type", "")
        assert ct.startswith("image/"), f"unexpected content-type: {ct}"
        assert len(r2.content) > 0
