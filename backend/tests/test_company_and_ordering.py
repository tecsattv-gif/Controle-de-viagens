"""Iteration 30: company settings endpoint + top-of-list ordering for new inserts."""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or "https://app-builder-demo-579.preview.emergentagent.com"
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def auth():
    email = f"feat+{uuid.uuid4().hex[:8]}@teste.com"
    password = "senha1234"
    device = "device-" + uuid.uuid4().hex[:8]
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": password, "device_id": device}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"headers": {"Authorization": f"Bearer {tok}", "X-Device-Id": device, "Content-Type": "application/json"}, "email": email}


# -------- Company settings --------
class TestCompanySettings:
    def test_missing_auth_returns_401(self):
        r = requests.put(f"{API}/settings/company", json={"company_name": "X", "company_logo_path": ""}, timeout=30)
        assert r.status_code == 401

    def test_set_and_persist_via_me(self, auth):
        payload = {"company_name": "Transportes Silva TEST", "company_logo_path": "controle-viagens/uploads/fake-logo.png"}
        r = requests.put(f"{API}/settings/company", json=payload, headers=auth["headers"], timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("company_name") == payload["company_name"]
        assert data.get("company_logo_path") == payload["company_logo_path"]
        # Verify via /auth/me
        me = requests.get(f"{API}/auth/me", headers=auth["headers"], timeout=30)
        assert me.status_code == 200
        me_data = me.json()
        assert me_data.get("company_name") == payload["company_name"]
        assert me_data.get("company_logo_path") == payload["company_logo_path"]

    def test_update_empty_clears(self, auth):
        r = requests.put(
            f"{API}/settings/company",
            json={"company_name": "  ", "company_logo_path": ""},
            headers=auth["headers"],
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json().get("company_name") == ""
        assert r.json().get("company_logo_path") == ""


# -------- Top-of-list ordering after new insert --------
def _create_and_assert_top(endpoint: str, payload: dict, headers: dict, id_field: str = "id"):
    # Insert a first record (yesterday)
    baseline = requests.post(f"{API}/{endpoint}", json={**payload, "date": "2025-01-01"}, headers=headers, timeout=30)
    assert baseline.status_code == 200, baseline.text
    baseline_id = baseline.json()[id_field]

    # Small delay so created_at differs
    time.sleep(0.05)

    # Insert a new record with today's date -> should top the list
    new_payload = {**payload, "date": "2026-01-15"}
    new_r = requests.post(f"{API}/{endpoint}", json=new_payload, headers=headers, timeout=30)
    assert new_r.status_code == 200, new_r.text
    new_id = new_r.json()[id_field]

    # GET list
    lst = requests.get(f"{API}/{endpoint}", headers=headers, timeout=30)
    assert lst.status_code == 200
    items = lst.json()
    assert len(items) >= 2
    assert items[0][id_field] == new_id, f"Expected new record ({new_id}) on TOP of {endpoint} but got {items[0][id_field]}"
    # Cleanup
    requests.delete(f"{API}/{endpoint}/{new_id}", headers=headers, timeout=30)
    requests.delete(f"{API}/{endpoint}/{baseline_id}", headers=headers, timeout=30)


class TestOrderingTop:
    def test_toll_expenses_top(self, auth):
        _create_and_assert_top(
            "toll-expenses",
            {"value": 12.5, "place": "TEST-toll"},
            auth["headers"],
        )

    def test_refuelings_top(self, auth):
        _create_and_assert_top(
            "refuelings",
            {"station_name": "TEST", "diesel_liters": 10, "diesel_price": 1.5, "km": 12345},
            auth["headers"],
        )

    def test_freights_top(self, auth):
        _create_and_assert_top(
            "freights",
            {"client": "TEST-cliente", "origin": "A", "destination": "B", "value": 100, "currency": "EUR"},
            auth["headers"],
        )

    def test_other_expenses_top(self, auth):
        _create_and_assert_top(
            "other-expenses",
            {"place": "TEST-local", "service": "Lavagem", "value": 20},
            auth["headers"],
        )

    def test_maintenances_top(self, auth):
        _create_and_assert_top(
            "maintenances",
            {"category": "Mecânica", "place": "Oficina TEST", "description": "Troca de óleo", "price": 50, "km": 1000},
            auth["headers"],
        )


# -------- Undo semantics on server: DELETE actually removes --------
class TestDeletePersistence:
    def test_delete_toll_removes_from_list(self, auth):
        r = requests.post(
            f"{API}/toll-expenses",
            json={"date": "2026-01-10", "value": 5, "place": "TEST-undo"},
            headers=auth["headers"],
            timeout=30,
        )
        assert r.status_code == 200
        tid = r.json()["id"]
        # Delete
        d = requests.delete(f"{API}/toll-expenses/{tid}", headers=auth["headers"], timeout=30)
        assert d.status_code == 200
        # List should not include it
        lst = requests.get(f"{API}/toll-expenses", headers=auth["headers"], timeout=30).json()
        assert not any(x["id"] == tid for x in lst)


# -------- Trial banner data via /auth/me --------
class TestTrialBannerData:
    def test_new_user_has_trial(self, auth):
        me = requests.get(f"{API}/auth/me", headers=auth["headers"], timeout=30).json()
        assert me.get("license_status") == "TESTE"
        assert isinstance(me.get("days_left"), int)
        assert me["days_left"] >= 28  # ~30 days trial
