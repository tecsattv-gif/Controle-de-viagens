"""Payment-request submission, admin approval/reject/keep-pending, and email flow.

Covers:
 - POST /api/license/payment-requests (JPG/PNG/PDF magic bytes, size, type)
 - Duplicate (client_request_id) and 409 while PENDENTE
 - GET /api/license/payment-requests, /proof-link, /payment-proofs/view, /files/* 404
 - Admin list/pending-count/approve/reject/keep-pending/resend-email
 - GET/PUT /api/admin/notification-settings
 - Legacy POST /api/license/submit-payment
"""
import io
import os
import time
import uuid
import struct
import zlib
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://app-builder-demo-579.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admintest@teste.com"
ADMIN_PASS = "senha1234"


# ---------------- helpers ----------------
def _png_bytes() -> bytes:
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff"))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


def _jpg_bytes() -> bytes:
    # Minimal valid JPEG (starts with FFD8FF, ends with FFD9)
    return bytes.fromhex(
        "ffd8ffe000104a46494600010100000100010000"
        "ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432"
        "ffc00011080001000103012200021101031101"
        "ffc4001f0000010501010101010100000000000000000102030405060708090a0b"
        "ffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3b4b5b6b7b8b9bac2c3c4c5c6c7c8c9cad2d3d4d5d6d7d8d9dae1e2e3e4e5e6e7e8e9eaf1f2f3f4f5f6f7f8f9fa"
        "ffda0008010100003f00fb"
        "ffd9"
    )


def _pdf_bytes() -> bytes:
    return (b"%PDF-1.1\n%\xe2\xe3\xcf\xd3\n"
            b"1 0 obj<</Type/Catalog>>endobj\n"
            b"xref\n0 2\n0000000000 65535 f \n0000000015 00000 n \n"
            b"trailer<</Size 2/Root 1 0 R>>\nstartxref\n60\n%%EOF\n")


def _reg(email, pwd="senha1234", device="dev-pytest"):
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": pwd, "device_id": device})
    if r.status_code == 409:
        r = requests.post(f"{API}/auth/login",
                          json={"email": email, "password": pwd, "device_id": device})
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"]


def _auth(token, dev="dev-pytest"):
    return {"Authorization": f"Bearer {token}", "X-Device-Id": dev}


# ---------------- fixtures ----------------
@pytest.fixture(scope="module")
def admin_token():
    return _reg(ADMIN_EMAIL, ADMIN_PASS, device="admin-dev")


@pytest.fixture(scope="module")
def user_token():
    email = f"TEST_pr_{uuid.uuid4().hex[:8]}@teste.com"
    return _reg(email)


@pytest.fixture(scope="module")
def user2_token():
    email = f"TEST_pr2_{uuid.uuid4().hex[:8]}@teste.com"
    return _reg(email, device="dev-pytest-2")


# ---------------- notification settings ----------------
class TestNotificationSettings:
    def test_normal_user_403(self, user_token):
        r = requests.get(f"{API}/admin/notification-settings", headers=_auth(user_token))
        assert r.status_code == 403

    def test_get_defaults(self, admin_token):
        r = requests.get(f"{API}/admin/notification-settings", headers=_auth(admin_token, "admin-dev"))
        assert r.status_code == 200
        b = r.json()
        assert "admin_email" in b and "email_enabled" in b

    def test_invalid_email_400(self, admin_token):
        r = requests.put(f"{API}/admin/notification-settings",
                         headers=_auth(admin_token, "admin-dev"),
                         json={"admin_email": "notanemail", "email_enabled": True})
        assert r.status_code == 400

    def test_set_delivered_resend_dev(self, admin_token):
        r = requests.put(f"{API}/admin/notification-settings",
                         headers=_auth(admin_token, "admin-dev"),
                         json={"admin_email": "delivered@resend.dev", "email_enabled": True})
        assert r.status_code == 200
        assert r.json()["admin_email"] == "delivered@resend.dev"


# ---------------- submission ----------------
class TestSubmission:
    def test_submit_png(self, user_token):
        cid = "cid-" + uuid.uuid4().hex[:8]
        files = {"file": ("proof.png", _png_bytes(), "image/png")}
        data = {"method": "IBAN", "amount": "15.00", "client_request_id": cid}
        r = requests.post(f"{API}/license/payment-requests",
                          headers=_auth(user_token), files=files, data=data)
        assert r.status_code == 200, r.text
        j = r.json()
        pytest.pr_png_id = j["request"]["request_id"]
        pytest.pr_cid = cid
        assert j["request"]["status"] == "PENDENTE"
        assert j["request"]["method"] == "IBAN"
        assert j["request"]["file_type"] == "png"
        assert j["license_status"] in ("AGUARDANDO_PAGAMENTO",)

    def test_duplicate_cid_returns_same(self, user_token):
        files = {"file": ("proof.png", _png_bytes(), "image/png")}
        data = {"method": "IBAN", "client_request_id": pytest.pr_cid}
        r = requests.post(f"{API}/license/payment-requests",
                          headers=_auth(user_token), files=files, data=data)
        assert r.status_code == 200
        j = r.json()
        assert j.get("duplicate") is True
        assert j["request"]["request_id"] == pytest.pr_png_id

    def test_second_different_submission_409(self, user_token):
        files = {"file": ("proof2.png", _png_bytes(), "image/png")}
        data = {"method": "PIX", "client_request_id": "cid-other-" + uuid.uuid4().hex[:6]}
        r = requests.post(f"{API}/license/payment-requests",
                          headers=_auth(user_token), files=files, data=data)
        assert r.status_code == 409

    def test_invalid_type_400(self, user2_token):
        files = {"file": ("x.txt", b"hello world", "text/plain")}
        r = requests.post(f"{API}/license/payment-requests",
                          headers=_auth(user2_token, "dev-pytest-2"),
                          files=files, data={"method": "PIX"})
        assert r.status_code == 400

    def test_too_large_413(self, user2_token):
        big = _png_bytes() + b"\x00" * (10 * 1024 * 1024 + 10)
        files = {"file": ("big.png", big, "image/png")}
        r = requests.post(f"{API}/license/payment-requests",
                          headers=_auth(user2_token, "dev-pytest-2"),
                          files=files, data={"method": "PIX"})
        assert r.status_code == 413

    def test_submit_pdf_user2(self, user2_token):
        files = {"file": ("proof.pdf", _pdf_bytes(), "application/pdf")}
        r = requests.post(f"{API}/license/payment-requests",
                          headers=_auth(user2_token, "dev-pytest-2"),
                          files=files, data={"method": "PIX"})
        assert r.status_code == 200, r.text
        j = r.json()
        pytest.pr_pdf_id = j["request"]["request_id"]
        assert j["request"]["file_type"] == "pdf"

    def test_my_requests_isolation(self, user_token, user2_token):
        r1 = requests.get(f"{API}/license/payment-requests", headers=_auth(user_token))
        r2 = requests.get(f"{API}/license/payment-requests", headers=_auth(user2_token, "dev-pytest-2"))
        assert r1.status_code == 200 and r2.status_code == 200
        ids1 = {d["request_id"] for d in r1.json()}
        ids2 = {d["request_id"] for d in r2.json()}
        assert pytest.pr_png_id in ids1 and pytest.pr_pdf_id not in ids1
        assert pytest.pr_pdf_id in ids2 and pytest.pr_png_id not in ids2


# ---------------- proof link security ----------------
class TestProofLink:
    def test_owner_proof_link_works(self, user_token):
        r = requests.post(f"{API}/license/payment-requests/{pytest.pr_png_id}/proof-link",
                          headers=_auth(user_token))
        assert r.status_code == 200
        url = r.json()["url"]
        assert "/api/payment-proofs/view?token=" in url
        full = f"{BASE_URL}{url}"
        rv = requests.get(full)
        assert rv.status_code == 200
        assert rv.headers.get("content-type", "").startswith("image/png")

    def test_other_user_cannot_proof_link_404(self, user2_token):
        r = requests.post(f"{API}/license/payment-requests/{pytest.pr_png_id}/proof-link",
                          headers=_auth(user2_token, "dev-pytest-2"))
        assert r.status_code == 404

    def test_bad_token_403(self):
        r = requests.get(f"{API}/payment-proofs/view?token=invalid.token.here")
        assert r.status_code == 403

    def test_files_payment_proofs_404(self):
        r = requests.get(f"{BASE_URL}/api/files/controle-viagens/payment-proofs/anything.png")
        assert r.status_code == 404


# ---------------- admin ----------------
class TestAdmin:
    def test_user_cannot_access_admin(self, user_token):
        for ep in ("/admin/payment-requests",
                   "/admin/payment-requests/pending-count",
                   "/admin/notification-settings"):
            r = requests.get(f"{API}{ep}", headers=_auth(user_token))
            assert r.status_code == 403, ep

    def test_list_pending(self, admin_token):
        r = requests.get(f"{API}/admin/payment-requests?status=PENDENTE",
                         headers=_auth(admin_token, "admin-dev"))
        assert r.status_code == 200
        ids = {d["request_id"] for d in r.json()}
        assert pytest.pr_png_id in ids and pytest.pr_pdf_id in ids

    def test_pending_count(self, admin_token):
        r = requests.get(f"{API}/admin/payment-requests/pending-count",
                         headers=_auth(admin_token, "admin-dev"))
        assert r.status_code == 200
        assert r.json()["count"] >= 2

    def test_reject_requires_reason(self, admin_token):
        r = requests.post(f"{API}/admin/payment-requests/{pytest.pr_pdf_id}/reject",
                          headers=_auth(admin_token, "admin-dev"), json={"reason": ""})
        assert r.status_code == 400

    def test_reject_sets_rejeitado_and_message(self, admin_token, user2_token):
        reason = "Comprovante ilegível"
        r = requests.post(f"{API}/admin/payment-requests/{pytest.pr_pdf_id}/reject",
                          headers=_auth(admin_token, "admin-dev"), json={"reason": reason})
        assert r.status_code == 200
        assert r.json()["request"]["status"] == "REJEITADO"
        assert r.json()["request"]["reject_reason"] == reason
        # user message
        rm = requests.get(f"{API}/messages", headers=_auth(user2_token, "dev-pytest-2"))
        assert rm.status_code == 200
        titles = [m.get("title", "") for m in rm.json()]
        assert any("Não foi possível confirmar" in t for t in titles)

    def test_reject_after_decided_409(self, admin_token):
        r = requests.post(f"{API}/admin/payment-requests/{pytest.pr_pdf_id}/reject",
                          headers=_auth(admin_token, "admin-dev"), json={"reason": "again"})
        assert r.status_code == 409

    def test_keep_pending(self, admin_token):
        r = requests.post(f"{API}/admin/payment-requests/{pytest.pr_png_id}/keep-pending",
                          headers=_auth(admin_token, "admin-dev"), json={"note": "aguardar"})
        assert r.status_code == 200

    def test_approve_sets_ativo_and_message(self, admin_token, user_token):
        r = requests.post(f"{API}/admin/payment-requests/{pytest.pr_png_id}/approve",
                          headers=_auth(admin_token, "admin-dev"))
        assert r.status_code == 200, r.text
        j = r.json()["request"]
        assert j["status"] == "APROVADO"
        assert j.get("decided_at") and j.get("decided_by_email")
        # license -> ATIVO
        me = requests.get(f"{API}/auth/me", headers=_auth(user_token))
        assert me.status_code == 200
        assert me.json()["license_status"] == "ATIVO"
        # user message
        rm = requests.get(f"{API}/messages", headers=_auth(user_token))
        titles = [m.get("title", "") for m in rm.json()]
        assert any("Pagamento aprovado" in t for t in titles)

    def test_second_approve_409(self, admin_token):
        r = requests.post(f"{API}/admin/payment-requests/{pytest.pr_png_id}/approve",
                          headers=_auth(admin_token, "admin-dev"))
        assert r.status_code == 409


# ---------------- email flow (delivered@resend.dev) ----------------
class TestEmailFlow:
    def test_submit_triggers_email_sent(self, admin_token):
        # Create a new user to avoid 409 from previous pending
        email = f"TEST_mail_{uuid.uuid4().hex[:8]}@teste.com"
        token = _reg(email, device="dev-mail")
        files = {"file": ("p.png", _png_bytes(), "image/png")}
        r = requests.post(f"{API}/license/payment-requests",
                          headers=_auth(token, "dev-mail"), files=files,
                          data={"method": "PIX"})
        assert r.status_code == 200
        rid = r.json()["request"]["request_id"]
        pytest.pr_mail_id = rid
        pytest.pr_mail_token = token
        # Wait for background email send (Resend sandbox should accept delivered@resend.dev)
        sent = False
        for _ in range(15):
            time.sleep(2)
            r2 = requests.get(f"{API}/admin/payment-requests?status=PENDENTE",
                              headers=_auth(admin_token, "admin-dev"))
            match = next((d for d in r2.json() if d["request_id"] == rid), None)
            if match and match.get("email_status") == "ENVIADO":
                sent = True
                break
        assert sent, f"email_status never became ENVIADO (last match: {match if 'match' in dir() else None})"

    def test_resend_when_sent_returns_409(self, admin_token):
        r = requests.post(f"{API}/admin/payment-requests/{pytest.pr_mail_id}/resend-email",
                          headers=_auth(admin_token, "admin-dev"))
        assert r.status_code == 409


# ---------------- legacy endpoint ----------------
class TestLegacy:
    def test_legacy_submit_payment_creates_pending(self):
        email = f"TEST_legacy_{uuid.uuid4().hex[:8]}@teste.com"
        token = _reg(email, device="dev-legacy")
        # Upload a proof via /uploads to get a path, then legacy submit
        files = {"file": ("p.png", _png_bytes(), "image/png")}
        up = requests.post(f"{API}/uploads", headers=_auth(token, "dev-legacy"), files=files)
        if up.status_code == 404:
            pytest.skip("No /api/uploads endpoint; legacy flow upload path unknown.")
        assert up.status_code == 200, up.text
        path = up.json().get("path") or up.json().get("file_path")
        assert path
        r = requests.post(f"{API}/license/submit-payment",
                          headers=_auth(token, "dev-legacy"),
                          json={"method": "PIX", "proof_path": path})
        assert r.status_code == 200
        prs = requests.get(f"{API}/license/payment-requests",
                           headers=_auth(token, "dev-legacy"))
        assert prs.status_code == 200
        assert any(d["status"] == "PENDENTE" for d in prs.json())


# ---------------- restore ----------------
class TestRestore:
    def test_restore_admin_email(self, admin_token):
        r = requests.put(f"{API}/admin/notification-settings",
                         headers=_auth(admin_token, "admin-dev"),
                         json={"admin_email": "tecsattv@gmail.com", "email_enabled": True})
        assert r.status_code == 200
