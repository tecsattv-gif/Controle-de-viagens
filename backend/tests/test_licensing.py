"""Backend tests for TEST/ACTIVATION licensing feature.

Covers: trial init on register, write gate (license 403), device binding (device 403),
submit-payment -> AGUARDANDO, admin-only access to /api/admin/*, admin confirm-payment
flow, block/unblock/unbind-device, payment-settings PUT/GET, and data preservation.

IMPORTANT: This test temporarily appends an admin email to backend/.env ADMIN_EMAILS
and restarts backend. It ALWAYS reverts on completion (module-level fixture).
"""
import os
import time
import uuid
import subprocess
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ENV_PATH = "/app/backend/.env"
ADMIN_TEST_EMAIL = "admintest_lic@teste.com"
REAL_ADMIN = "tecsattv@gmail.com"


def _read_env():
    with open(ENV_PATH, "r") as f:
        return f.read()


def _write_env(content: str):
    with open(ENV_PATH, "w") as f:
        f.write(content)


def _restart_backend():
    subprocess.run(["sudo", "supervisorctl", "restart", "backend"], check=False, capture_output=True)
    time.sleep(3)
    # wait until /api/ responds AND is stable
    ok_count = 0
    for _ in range(60):
        try:
            r = requests.get(f"{API}/", timeout=3)
            if r.status_code == 200:
                ok_count += 1
                if ok_count >= 3:
                    return
            else:
                ok_count = 0
        except Exception:
            ok_count = 0
        time.sleep(1)


@pytest.fixture(scope="module", autouse=True)
def enable_test_admin():
    """Temporarily add ADMIN_TEST_EMAIL to ADMIN_EMAILS; always revert."""
    original = _read_env()
    lines = []
    for line in original.splitlines():
        if line.startswith("ADMIN_EMAILS="):
            lines.append(f"ADMIN_EMAILS={REAL_ADMIN},{ADMIN_TEST_EMAIL}")
        else:
            lines.append(line)
    _write_env("\n".join(lines) + "\n")
    _restart_backend()
    try:
        yield
    finally:
        _write_env(original)
        _restart_backend()


def _register(email: str, password: str = "senha1234", device_id: str = None):
    device_id = device_id or f"dev-{uuid.uuid4().hex[:12]}"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": password, "name": email.split("@")[0], "device_id": device_id},
        headers={"X-Device-Id": device_id},
        timeout=15,
    )
    return r, device_id


def _login(email: str, password: str, device_id: str):
    r = requests.post(
        f"{API}/auth/login",
        json={"email": email, "password": password, "device_id": device_id},
        headers={"X-Device-Id": device_id},
        timeout=15,
    )
    return r


def _extract(r):
    """Return (token, user_dict) from register/login response."""
    j = r.json()
    return j.get("access_token") or j.get("token"), j.get("user") or j


def _auth_headers(token: str, device_id: str):
    return {"Authorization": f"Bearer {token}", "X-Device-Id": device_id, "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# 1) Trial init on register
# ---------------------------------------------------------------------------
class TestTrialInit:
    def test_register_new_user_starts_trial(self):
        email = f"TEST_lic_{uuid.uuid4().hex[:8]}@teste.com"
        r, dev = _register(email)
        assert r.status_code == 200, r.text
        _, user = _extract(r)
        assert user.get("license_status") == "TESTE"
        assert user.get("days_left", 0) >= 1
        assert user.get("can_write") is True
        assert user.get("trial_started_at") and user.get("trial_ends_at")
        assert user.get("device_bound") is True


# ---------------------------------------------------------------------------
# 2) Write gate + submit-payment flow
# ---------------------------------------------------------------------------
class TestWriteGateAndPayment:
    @pytest.fixture(scope="class")
    def user_ctx(self):
        email = f"TEST_wg_{uuid.uuid4().hex[:8]}@teste.com"
        r, dev = _register(email)
        assert r.status_code == 200
        token, user = _extract(r)
        return {"token": token, "device": dev, "email": email, "user_id": user["user_id"]}

    def test_teste_user_can_write(self, user_ctx):
        h = _auth_headers(user_ctx["token"], user_ctx["device"])
        trip = {"date": "2026-01-15", "km_start": 0, "km_end": 100, "origin": "TEST_A", "destination": "TEST_B"}
        r = requests.post(f"{API}/trips", json=trip, headers=h, timeout=15)
        assert r.status_code in (200, 201), r.text

    def test_submit_payment_moves_to_aguardando(self, user_ctx):
        h = _auth_headers(user_ctx["token"], user_ctx["device"])
        r = requests.post(
            f"{API}/license/submit-payment",
            json={"method": "IBAN", "proof_path": "data:image/png;base64,AAAA"},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # response is {"success": True, ...license_public(user)}
        assert data.get("license_status") == "AGUARDANDO_PAGAMENTO"

    def test_writes_blocked_when_aguardando_returns_license_403(self, user_ctx):
        h = _auth_headers(user_ctx["token"], user_ctx["device"])
        trip = {"date": "2026-01-16", "km_start": 100, "km_end": 200, "origin": "TEST_C", "destination": "TEST_D"}
        r = requests.post(f"{API}/trips", json=trip, headers=h, timeout=15)
        assert r.status_code == 403, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict) and detail.get("code") == "license"

    def test_reads_allowed_when_aguardando(self, user_ctx):
        h = _auth_headers(user_ctx["token"], user_ctx["device"])
        r = requests.get(f"{API}/trips", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_submit_payment_requires_proof(self, user_ctx):
        h = _auth_headers(user_ctx["token"], user_ctx["device"])
        r = requests.post(
            f"{API}/license/submit-payment",
            json={"method": "IBAN", "proof_path": ""},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 400

    def test_submit_payment_invalid_method(self, user_ctx):
        h = _auth_headers(user_ctx["token"], user_ctx["device"])
        r = requests.post(
            f"{API}/license/submit-payment",
            json={"method": "CARTAO", "proof_path": "x"},
            headers=h,
            timeout=15,
        )
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# 3) Device binding
# ---------------------------------------------------------------------------
class TestDeviceBinding:
    def test_login_from_different_device_returns_device_403(self):
        email = f"TEST_dev_{uuid.uuid4().hex[:8]}@teste.com"
        r, dev1 = _register(email)
        assert r.status_code == 200
        # Try to login from a DIFFERENT device
        dev2 = f"dev-{uuid.uuid4().hex[:12]}"
        r2 = _login(email, "senha1234", dev2)
        assert r2.status_code == 403, r2.text
        detail = r2.json().get("detail")
        assert isinstance(detail, dict) and detail.get("code") == "device"

    def test_login_from_same_device_ok(self):
        email = f"TEST_dev2_{uuid.uuid4().hex[:8]}@teste.com"
        r, dev1 = _register(email)
        assert r.status_code == 200
        r2 = _login(email, "senha1234", dev1)
        assert r2.status_code == 200


# ---------------------------------------------------------------------------
# 4) Admin panel (access control + flows)
# ---------------------------------------------------------------------------
class TestAdminPanel:
    @pytest.fixture(scope="class")
    def admin_ctx(self):
        # register admintest_lic@teste.com; if already exists, login
        dev = f"dev-adm-{uuid.uuid4().hex[:8]}"
        r, _ = _register(ADMIN_TEST_EMAIL, device_id=dev)
        if r.status_code == 200:
            token, _ = _extract(r)
        else:
            # existing user -- try login
            r2 = _login(ADMIN_TEST_EMAIL, "senha1234", dev)
            if r2.status_code == 403:
                pytest.skip("Admin test account bound to another device from previous run")
            assert r2.status_code == 200, r2.text
            token, _ = _extract(r2)
        return {"token": token, "device": dev}

    @pytest.fixture(scope="class")
    def normal_ctx(self):
        email = f"TEST_norm_{uuid.uuid4().hex[:8]}@teste.com"
        r, dev = _register(email)
        assert r.status_code == 200
        token, user = _extract(r)
        return {"token": token, "device": dev, "email": email, "user_id": user["user_id"]}

    def test_normal_user_cannot_list_admin_users(self, normal_ctx):
        h = _auth_headers(normal_ctx["token"], normal_ctx["device"])
        r = requests.get(f"{API}/admin/users", headers=h, timeout=15)
        assert r.status_code == 403

    def test_admin_can_list_users(self, admin_ctx):
        h = _auth_headers(admin_ctx["token"], admin_ctx["device"])
        r = requests.get(f"{API}/admin/users", headers=h, timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        assert len(users) >= 1

    def test_admin_confirm_activates_user_and_write_works(self, admin_ctx):
        # Create a fresh user, submit payment, then admin confirms
        email = f"TEST_flow_{uuid.uuid4().hex[:8]}@teste.com"
        r, dev = _register(email)
        assert r.status_code == 200
        u_token, u_user = _extract(r)
        u_id = u_user["user_id"]
        h_u = _auth_headers(u_token, dev)
        # submit-payment
        rp = requests.post(
            f"{API}/license/submit-payment",
            json={"method": "PIX", "proof_path": "data:image/png;base64,AAAA"},
            headers=h_u,
            timeout=15,
        )
        assert rp.status_code == 200
        # admin confirms
        h_a = _auth_headers(admin_ctx["token"], admin_ctx["device"])
        rc = requests.post(f"{API}/admin/users/{u_id}/confirm-payment", headers=h_a, timeout=15)
        assert rc.status_code == 200
        # user now ATIVO -> write allowed
        me = requests.get(f"{API}/auth/me", headers=h_u, timeout=15)
        assert me.status_code == 200
        me_data = me.json()
        # /api/auth/me returns public_user which includes license_status directly
        status = me_data.get("license_status") or (me_data.get("user") or {}).get("license_status")
        assert status == "ATIVO", me.text
        rt = requests.post(
            f"{API}/trips",
            json={"date": "2026-01-17", "km_start": 0, "km_end": 50, "origin": "TEST_X", "destination": "TEST_Y"},
            headers=h_u,
            timeout=15,
        )
        assert rt.status_code in (200, 201), rt.text

    def test_admin_block_unblock(self, admin_ctx, normal_ctx):
        h_a = _auth_headers(admin_ctx["token"], admin_ctx["device"])
        r_block = requests.post(f"{API}/admin/users/{normal_ctx['user_id']}/block", headers=h_a, timeout=15)
        assert r_block.status_code == 200
        # blocked user write must fail
        h_u = _auth_headers(normal_ctx["token"], normal_ctx["device"])
        rw = requests.post(
            f"{API}/trips",
            json={"date": "2026-01-18", "km_start": 0, "km_end": 10, "origin": "TEST_bk", "destination": "TEST_bk2"},
            headers=h_u,
            timeout=15,
        )
        assert rw.status_code == 403
        # unblock
        r_ub = requests.post(f"{API}/admin/users/{normal_ctx['user_id']}/unblock", headers=h_a, timeout=15)
        assert r_ub.status_code == 200

    def test_admin_unbind_device_allows_new_device_login(self, admin_ctx):
        email = f"TEST_ub_{uuid.uuid4().hex[:8]}@teste.com"
        r, dev1 = _register(email)
        _, u = _extract(r)
        uid = u["user_id"]
        # try new device -> 403 device
        dev2 = f"dev-{uuid.uuid4().hex[:8]}"
        r2 = _login(email, "senha1234", dev2)
        assert r2.status_code == 403
        # admin unbind
        h_a = _auth_headers(admin_ctx["token"], admin_ctx["device"])
        r_ub = requests.post(f"{API}/admin/users/{uid}/unbind-device", headers=h_a, timeout=15)
        assert r_ub.status_code == 200
        # new device login ok
        r3 = _login(email, "senha1234", dev2)
        assert r3.status_code == 200


# ---------------------------------------------------------------------------
# 5) Payment settings PUT/GET
# ---------------------------------------------------------------------------
class TestPaymentSettings:
    @pytest.fixture(scope="class")
    def admin_ctx(self):
        dev = f"dev-adm2-{uuid.uuid4().hex[:8]}"
        r, _ = _register(ADMIN_TEST_EMAIL, device_id=dev)
        if r.status_code == 200:
            token, _ = _extract(r)
        else:
            r2 = _login(ADMIN_TEST_EMAIL, "senha1234", dev)
            if r2.status_code == 403:
                pytest.skip("Admin bound to another device")
            token, _ = _extract(r2)
        return {"token": token, "device": dev}

    def test_put_settings_and_public_info_reflects(self, admin_ctx):
        h_a = _auth_headers(admin_ctx["token"], admin_ctx["device"])
        payload = {
            "iban": "PT50 0000 0000 0000 0000 0",
            "iban_holder": "TEST HOLDER",
            "pix_key": "test@pix.br",
            "price_eur": "9.99",
            "price_brl": "49.90",
            "instructions": "TEST inst",
            "iban_enabled": True,
            "pix_enabled": True,
        }
        rp = requests.put(f"{API}/admin/payment-settings", json=payload, headers=h_a, timeout=15)
        assert rp.status_code == 200
        # Any authenticated user can fetch public info
        email = f"TEST_pset_{uuid.uuid4().hex[:8]}@teste.com"
        r, dev = _register(email)
        u_token, _ = _extract(r)
        h_u = _auth_headers(u_token, dev)
        info = requests.get(f"{API}/license/payment-info", headers=h_u, timeout=15).json()
        assert info["iban"] == payload["iban"]
        assert info["pix_key"] == payload["pix_key"]
        assert info["price_eur"] == "9.99"
        assert info["price_brl"] == "49.90"
        assert info["instructions"] == "TEST inst"


# ---------------------------------------------------------------------------
# 6) Data preservation
# ---------------------------------------------------------------------------
class TestDataPreservation:
    def test_existing_users_still_present(self):
        # Use admin to list users and assert count >= 24 (the ~24 preexisting)
        dev = f"dev-dp-{uuid.uuid4().hex[:8]}"
        r, _ = _register(ADMIN_TEST_EMAIL, device_id=dev)
        if r.status_code == 200:
            token, _ = _extract(r)
        else:
            r2 = _login(ADMIN_TEST_EMAIL, "senha1234", dev)
            if r2.status_code == 403:
                pytest.skip("Admin bound to another device")
            token, _ = _extract(r2)
        h = _auth_headers(token, dev)
        users = requests.get(f"{API}/admin/users", headers=h, timeout=15).json()
        assert isinstance(users, list)
        # Should include the real admin email
        emails = {u.get("email") for u in users}
        assert REAL_ADMIN in emails
        assert len(users) >= 20  # ~24 pre-existing + our test users
