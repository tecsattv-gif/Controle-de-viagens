"""Backend tests for the new 'Controle de Pneus' module (Fase 1).

Covers:
  * /api/tires CRUD (number uniqueness, position occupancy, soft-delete)
  * /api/tires/{id}/measurements add/delete + current_tread_mm recalculation
  * /api/tires/{id}/move  (relocate, swap, remove, transfer-to-other-vehicle)
  * /api/tire-configs GET + PUT upsert
  * /api/tire-settings GET defaults + PUT persist
  * User isolation (userB does not see userA) and auth (401 w/o token)
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


def _register(prefix: str):
    device_id = f"dev_{uuid.uuid4().hex[:10]}"
    email = f"{prefix}_{uuid.uuid4().hex[:6]}@teste.com"
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


def _h(acc):
    return {
        "Authorization": f"Bearer {acc['token']}",
        "X-Device-Id": acc["device_id"],
        "Content-Type": "application/json",
    }


def _create_vehicle(acc, plate: str, trailers=None):
    payload = {"truck_plate": plate, "trailer_plates": trailers or []}
    r = requests.post(f"{API}/vehicles", headers=_h(acc), json=payload, timeout=30)
    assert r.status_code == 200, f"vehicle create failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def user_a():
    acc = _register("TEST_tireA")
    return acc


@pytest.fixture(scope="module")
def user_b():
    acc = _register("TEST_tireB")
    return acc


@pytest.fixture(scope="module")
def vehicle_a(user_a):
    return _create_vehicle(user_a, f"TAA{uuid.uuid4().hex[:3].upper()}", ["REB001"])


@pytest.fixture(scope="module")
def vehicle_a2(user_a):
    return _create_vehicle(user_a, f"TAB{uuid.uuid4().hex[:3].upper()}", [])


# -------------------------------------------------------------------
# Auth
# -------------------------------------------------------------------
class TestAuth:
    def test_create_tire_requires_auth(self):
        r = requests.post(f"{API}/tires", json={"number": "X"}, timeout=30)
        assert r.status_code == 401

    def test_put_tire_settings_requires_auth(self):
        r = requests.put(f"{API}/tire-settings", json={"green_min_mm": 5, "yellow_min_mm": 3}, timeout=30)
        assert r.status_code == 401

    def test_put_tire_config_requires_auth(self):
        r = requests.put(f"{API}/tire-configs/some-vehicle", json={"vehicle_id": "x", "units": []}, timeout=30)
        assert r.status_code == 401


# -------------------------------------------------------------------
# tire-settings
# -------------------------------------------------------------------
class TestTireSettings:
    def test_defaults_when_unset(self, user_b):
        r = requests.get(f"{API}/tire-settings", headers=_h(user_b), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data == {"green_min_mm": 5.0, "yellow_min_mm": 3.0}

    def test_put_persists(self, user_a):
        payload = {"green_min_mm": 6.0, "yellow_min_mm": 2.5}
        r = requests.put(f"{API}/tire-settings", headers=_h(user_a), json=payload, timeout=30)
        assert r.status_code == 200
        assert r.json()["green_min_mm"] == 6.0
        assert r.json()["yellow_min_mm"] == 2.5
        # GET verifies persistence
        g = requests.get(f"{API}/tire-settings", headers=_h(user_a), timeout=30).json()
        assert g == {"green_min_mm": 6.0, "yellow_min_mm": 2.5}


# -------------------------------------------------------------------
# tire-configs
# -------------------------------------------------------------------
class TestTireConfigs:
    def test_upsert_and_isolation(self, user_a, user_b, vehicle_a):
        vid = vehicle_a["id"]
        units = [
            {"role": "truck", "label": "Cavalo", "layout_key": "truck_6x2"},
            {"role": "trailer", "label": "Reboque 1", "layout_key": "semi_3"},
        ]
        r = requests.put(
            f"{API}/tire-configs/{vid}",
            headers=_h(user_a),
            json={"vehicle_id": vid, "units": units},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        got = r.json()
        assert got["vehicle_id"] == vid
        assert len(got["units"]) == 2
        assert "_id" not in got

        # Upsert update (change layout_key)
        units2 = [{"role": "truck", "label": "Cavalo", "layout_key": "truck_4x2"}]
        r2 = requests.put(
            f"{API}/tire-configs/{vid}",
            headers=_h(user_a),
            json={"vehicle_id": vid, "units": units2},
            timeout=30,
        )
        assert r2.status_code == 200
        assert r2.json()["units"] == units2

        # List returns 1 item for user_a
        lst = requests.get(f"{API}/tire-configs", headers=_h(user_a), timeout=30).json()
        assert any(c["vehicle_id"] == vid for c in lst)
        assert all("_id" not in c for c in lst)

        # user_b sees nothing
        lst_b = requests.get(f"{API}/tire-configs", headers=_h(user_b), timeout=30).json()
        assert all(c["vehicle_id"] != vid for c in lst_b)


# -------------------------------------------------------------------
# Tires CRUD + measurements + move
# -------------------------------------------------------------------
class TestTiresCRUD:
    def test_full_lifecycle(self, user_a, user_b, vehicle_a, vehicle_a2):
        h = _h(user_a)
        v1 = vehicle_a["id"]
        v2 = vehicle_a2["id"]

        # Clean state (listing shouldn't include tires from previous suites for these vehicles)
        base_count = len(requests.get(f"{API}/tires?vehicle_id={v1}", headers=h, timeout=30).json())
        assert base_count == 0

        tnum_a = f"T-{uuid.uuid4().hex[:6]}"
        tnum_b = f"T-{uuid.uuid4().hex[:6]}"

        # Create tire A at position C-1L
        rA = requests.post(
            f"{API}/tires",
            headers=h,
            json={
                "number": tnum_a, "brand": "Pirelli", "size": "295/80R22.5",
                "install_date": "2026-01-01", "install_km": 100000,
                "current_tread_mm": 15.0, "notes": "novo",
                "vehicle_id": v1, "position_code": "C-1L",
            },
            timeout=30,
        )
        assert rA.status_code == 200, rA.text
        tA = rA.json()
        assert tA["number"] == tnum_a
        assert tA["status"] == "installed"
        assert tA["current_tread_mm"] == 15.0
        assert tA["vehicle_id"] == v1
        assert tA["position_code"] == "C-1L"
        assert "_id" not in tA
        # Install measurement auto-created
        assert len(tA["measurements"]) == 1
        assert tA["measurements"][0]["tread_mm"] == 15.0

        # Duplicate number => 400
        rdup = requests.post(
            f"{API}/tires", headers=h,
            json={"number": tnum_a, "vehicle_id": v1, "position_code": "C-1R",
                  "install_date": "2026-01-01", "current_tread_mm": 15.0, "install_km": 100000},
            timeout=30,
        )
        assert rdup.status_code == 400

        # Occupied position same vehicle => 400
        rocc = requests.post(
            f"{API}/tires", headers=h,
            json={"number": tnum_b, "vehicle_id": v1, "position_code": "C-1L",
                  "install_date": "2026-01-01", "current_tread_mm": 15.0, "install_km": 100000},
            timeout=30,
        )
        assert rocc.status_code == 400

        # Create tire B at C-2LO
        rB = requests.post(
            f"{API}/tires", headers=h,
            json={"number": tnum_b, "brand": "Michelin", "size": "295/80R22.5",
                  "install_date": "2026-01-02", "install_km": 100000,
                  "current_tread_mm": 12.0, "vehicle_id": v1, "position_code": "C-2LO"},
            timeout=30,
        )
        assert rB.status_code == 200
        tB = rB.json()

        # GET /{id}
        rget = requests.get(f"{API}/tires/{tA['id']}", headers=h, timeout=30)
        assert rget.status_code == 200
        assert rget.json()["id"] == tA["id"]

        # GET list w/ vehicle filter
        lst = requests.get(f"{API}/tires?vehicle_id={v1}", headers=h, timeout=30).json()
        assert len(lst) == 2
        ids = {x["id"] for x in lst}
        assert tA["id"] in ids and tB["id"] in ids

        # PUT edit
        rup = requests.put(
            f"{API}/tires/{tA['id']}", headers=h,
            json={"number": tnum_a, "brand": "Goodyear", "size": "295/80R22.5",
                  "install_date": "2026-01-01", "install_km": 100000,
                  "current_tread_mm": 15.0, "notes": "editado"},
            timeout=30,
        )
        assert rup.status_code == 200
        assert rup.json()["brand"] == "Goodyear"
        assert rup.json()["notes"] == "editado"

        # ---------- Measurements ----------
        rm = requests.post(
            f"{API}/tires/{tA['id']}/measurements",
            headers=h,
            json={"date": "2026-01-15", "tread_mm": 13.5, "notes": "primeira medição"},
            timeout=30,
        )
        assert rm.status_code == 200
        md = rm.json()
        assert md["current_tread_mm"] == 13.5
        assert len(md["measurements"]) == 2
        mid_second = md["measurements"][-1]["id"]

        # Delete most-recent measurement => current_tread_mm reverts to previous (15.0)
        rdel = requests.delete(
            f"{API}/tires/{tA['id']}/measurements/{mid_second}", headers=h, timeout=30
        )
        assert rdel.status_code == 200
        assert rdel.json()["current_tread_mm"] == 15.0
        assert len(rdel.json()["measurements"]) == 1

        # ---------- Move: swap between two tires on SAME vehicle ----------
        # Swap tA (C-1L) with tB (C-2LO) by moving tA to C-2LO
        rmv = requests.post(
            f"{API}/tires/{tA['id']}/move",
            headers=h,
            json={"to_position": "C-2LO", "vehicle_id": v1, "km": 150000, "date": "2026-02-01"},
            timeout=30,
        )
        assert rmv.status_code == 200, rmv.text
        tA_after = rmv.json()
        assert tA_after["position_code"] == "C-2LO"
        # tB should now be at C-1L (swapped) and have a movement entry
        tB_after = requests.get(f"{API}/tires/{tB['id']}", headers=h, timeout=30).json()
        assert tB_after["position_code"] == "C-1L"
        assert len(tB_after["movements"]) >= 1
        assert len(tA_after["movements"]) >= 1

        # ---------- Move to another vehicle => new installation ----------
        rmv2 = requests.post(
            f"{API}/tires/{tA['id']}/move",
            headers=h,
            json={"to_position": "C-1L", "vehicle_id": v2, "km": 160000, "date": "2026-03-01"},
            timeout=30,
        )
        assert rmv2.status_code == 200, rmv2.text
        tA2 = rmv2.json()
        assert tA2["vehicle_id"] == v2
        assert tA2["position_code"] == "C-1L"
        assert tA2["install_km"] == 160000, "transfer must reset install_km"
        assert tA2["install_date"] == "2026-03-01"

        # ---------- Move: remove (to_position empty) ----------
        rrm = requests.post(
            f"{API}/tires/{tA['id']}/move",
            headers=h,
            json={"to_position": "", "vehicle_id": "", "km": 170000, "date": "2026-04-01"},
            timeout=30,
        )
        assert rrm.status_code == 200
        tA_rm = rrm.json()
        assert tA_rm["status"] == "removed"
        assert tA_rm["position_code"] == ""
        assert tA_rm["removed_km"] == 170000

        # Occupied position must be rejected across DIFFERENT tires in same vehicle:
        # create a third tire and try to put it where tB sits
        tnum_c = f"T-{uuid.uuid4().hex[:6]}"
        rC = requests.post(
            f"{API}/tires", headers=h,
            json={"number": tnum_c, "install_date": "2026-02-01", "install_km": 150000,
                  "current_tread_mm": 10.0, "vehicle_id": v1, "position_code": "C-2LO"},
            timeout=30,
        )
        assert rC.status_code == 200  # C-1L free now? tB is at C-1L. C-2LO was emptied when tA moved to v2
        # tB is at C-1L, C-2LO should be free -> created ok
        tC = rC.json()
        # Now try to MOVE tC to C-1L (occupied by tB) => should SWAP (not error)
        rsw = requests.post(
            f"{API}/tires/{tC['id']}/move", headers=h,
            json={"to_position": "C-1L", "vehicle_id": v1, "km": 155000, "date": "2026-02-15"},
            timeout=30,
        )
        assert rsw.status_code == 200
        tC_after = rsw.json()
        tB_after2 = requests.get(f"{API}/tires/{tB['id']}", headers=h, timeout=30).json()
        assert tC_after["position_code"] == "C-1L"
        assert tB_after2["position_code"] == "C-2LO"

        # ---------- Soft delete ----------
        rde = requests.delete(f"{API}/tires/{tB['id']}", headers=h, timeout=30)
        assert rde.status_code == 200
        rg = requests.get(f"{API}/tires/{tB['id']}", headers=h, timeout=30)
        assert rg.status_code == 404
        # List shouldn't include tB anymore
        lst2 = requests.get(f"{API}/tires?vehicle_id={v1}", headers=h, timeout=30).json()
        assert all(x["id"] != tB["id"] for x in lst2)

        # ---------- Isolation ----------
        hb = _h(user_b)
        lst_b = requests.get(f"{API}/tires", headers=hb, timeout=30).json()
        assert all(x["id"] != tA["id"] and x["id"] != tC["id"] for x in lst_b)
        # user_b cannot access tire A
        rb = requests.get(f"{API}/tires/{tA['id']}", headers=hb, timeout=30)
        assert rb.status_code == 404
        rbp = requests.put(
            f"{API}/tires/{tA['id']}", headers=hb,
            json={"number": tnum_a, "brand": "x", "size": "y",
                  "install_date": "2026-01-01", "install_km": 1,
                  "current_tread_mm": 1.0, "notes": ""},
            timeout=30,
        )
        assert rbp.status_code == 404
        rbd = requests.delete(f"{API}/tires/{tA['id']}", headers=hb, timeout=30)
        assert rbd.status_code == 404

        # Cleanup
        for item in requests.get(f"{API}/tires", headers=h, timeout=30).json():
            requests.delete(f"{API}/tires/{item['id']}", headers=h, timeout=30)
