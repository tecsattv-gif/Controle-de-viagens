"""Backend tests for the AI Assistant feature.

Covers:
- Auth gating: POST /api/ai/chat without token → 401
- Validation: empty text → 400
- SSE streaming: POST /api/ai/chat emits `data: {"delta": "..."}` chunks and a final `data: {"done": true}`
- Persistence: GET /api/ai/messages returns the user+assistant pair in chronological order
- Clear: DELETE /api/ai/messages wipes messages for the caller only
- Isolation: user B's chat context does not include user A's data
- Grounded answer: user asks "KM da minha ultima viagem" and the model mentions 450 (km_end - km_start)
"""
import json
import os
import re
import uuid
from typing import List

import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://app-builder-demo-579.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"


def _rand_email(prefix: str) -> str:
    return f"TEST_ai_{prefix}_{uuid.uuid4().hex[:8]}@teste.com"


def _register(email_prefix: str) -> dict:
    email = _rand_email(email_prefix)
    device_id = f"dev_{uuid.uuid4().hex[:10]}"
    r = requests.post(
        f"{API}/auth/register",
        json={"email": email, "password": "senha1234", "display_name": f"User {email_prefix}", "device_id": device_id},
        headers={"X-Device-Id": device_id},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "email": email,
        "token": data["access_token"],
        "user_id": data["user"]["user_id"],
        "device_id": device_id,
    }


def _hdr(u: dict, extra: dict | None = None) -> dict:
    h = {"Authorization": f"Bearer {u['token']}", "X-Device-Id": u["device_id"]}
    if extra:
        h.update(extra)
    return h


# ---- Fixtures --------------------------------------------------------------

@pytest.fixture(scope="module")
def user_a() -> dict:
    return _register("A")


@pytest.fixture(scope="module")
def user_b() -> dict:
    return _register("B")


@pytest.fixture(scope="module")
def trip_a(user_a) -> dict:
    """Create a Lisboa→Porto trip for user A with km_start=1000, km_end=1450 (450 km)."""
    payload = {
        "date": "2026-01-10",
        "km_start": 1000,
        "km_end": 1450,
        "start_time": "08:00",
        "end_time": "13:00",
        "loading_place": "TEST_Lisboa",
        "unloading_place": "TEST_Porto",
        "rest_place": "",
        "notes": "TEST_AI_assistant_trip",
    }
    r = requests.post(f"{API}/trips", json=payload, headers=_hdr(user_a), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["km_start"] == 1000
    assert data["km_end"] == 1450
    yield data
    try:
        requests.delete(f"{API}/trips/{data['id']}", headers=_hdr(user_a), timeout=10)
    except Exception:
        pass


# ---- Helpers for SSE -------------------------------------------------------

def _parse_sse_stream(resp) -> tuple[str, bool, list[str]]:
    """Collect delta/done events from an SSE response. Returns (answer, done_flag, errors)."""
    answer: List[str] = []
    done = False
    errors: List[str] = []
    buf = ""
    for raw in resp.iter_content(chunk_size=None, decode_unicode=True):
        if not raw:
            continue
        buf += raw
        while "\n\n" in buf:
            frame, buf = buf.split("\n\n", 1)
            frame = frame.strip()
            if not frame.startswith("data:"):
                continue
            try:
                ev = json.loads(frame[5:].strip())
            except json.JSONDecodeError:
                errors.append(f"invalid-json:{frame[:80]}")
                continue
            if "delta" in ev:
                answer.append(ev["delta"])
            if "error" in ev:
                errors.append(ev["error"])
            if ev.get("done"):
                done = True
    return "".join(answer), done, errors


# ---- Auth / validation -----------------------------------------------------

def test_chat_requires_auth():
    r = requests.post(f"{API}/ai/chat", json={"text": "oi"}, timeout=15)
    assert r.status_code == 401, r.text


def test_messages_requires_auth():
    r = requests.get(f"{API}/ai/messages", timeout=15)
    assert r.status_code == 401, r.text


def test_chat_empty_text_400(user_a):
    r = requests.post(f"{API}/ai/chat", json={"text": "   "}, headers=_hdr(user_a), timeout=20)
    assert r.status_code == 400, r.text
    assert "detail" in r.json()


def test_messages_empty_initially(user_a):
    r = requests.get(f"{API}/ai/messages", headers=_hdr(user_a), timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    # Should be empty for a brand new user
    assert r.json() == []


# ---- SSE streaming + persistence ------------------------------------------

@pytest.fixture(scope="module")
def streamed_answer(user_a, trip_a) -> dict:
    """Send the grounded KM question and collect streamed answer. Module-scoped so we only hit
    the LLM once; downstream tests reuse the result."""
    text = "Quantos KM teve a minha última viagem? Responda só com o número."
    headers = _hdr(user_a, {"Content-Type": "application/json", "Accept": "text/event-stream"})
    with requests.post(
        f"{API}/ai/chat", json={"text": text}, headers=headers, stream=True, timeout=90
    ) as r:
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("text/event-stream")
        answer, done, errors = _parse_sse_stream(r)
    return {"question": text, "answer": answer, "done": done, "errors": errors}


def test_chat_streams_and_finishes(streamed_answer):
    assert streamed_answer["errors"] == [], f"stream errors: {streamed_answer['errors']}"
    assert streamed_answer["done"] is True
    assert len(streamed_answer["answer"]) > 0, "assistant returned empty answer"


def test_chat_answer_mentions_450(streamed_answer):
    answer = streamed_answer["answer"]
    # Model should quote 450 (km_end 1450 - km_start 1000). Allow "450 km", "450km", "450,0", etc.
    assert re.search(r"\b450\b", answer), f"expected '450' in answer, got: {answer!r}"


def test_messages_persisted_in_order(user_a, streamed_answer):
    r = requests.get(f"{API}/ai/messages", headers=_hdr(user_a), timeout=15)
    assert r.status_code == 200
    msgs = r.json()
    assert len(msgs) >= 2, f"expected >=2 messages, got {len(msgs)}"
    # Latest two should be user then assistant
    user_msgs = [m for m in msgs if m["role"] == "user"]
    bot_msgs = [m for m in msgs if m["role"] == "assistant"]
    assert any(m["content"] == streamed_answer["question"] for m in user_msgs)
    assert any("450" in m["content"] for m in bot_msgs)
    # Chronological order
    created_times = [m["created_at"] for m in msgs]
    assert created_times == sorted(created_times), "messages not in ascending created_at order"


# ---- Per-user isolation ----------------------------------------------------

def test_user_b_cannot_see_user_a_messages(user_a, user_b, streamed_answer):
    r = requests.get(f"{API}/ai/messages", headers=_hdr(user_b), timeout=15)
    assert r.status_code == 200
    assert r.json() == [], "User B must not see User A's AI history"


def test_user_b_context_excludes_user_a_trip(user_a, user_b, trip_a):
    """Ask user B about last-trip KM; the model must NOT answer 450 because B has no trips."""
    headers = _hdr(user_b, {"Content-Type": "application/json", "Accept": "text/event-stream"})
    with requests.post(
        f"{API}/ai/chat",
        json={"text": "Quantos KM teve a minha última viagem? Responda com o número ou diga que não há dados."},
        headers=headers,
        stream=True,
        timeout=90,
    ) as r:
        assert r.status_code == 200, r.text
        answer, done, errors = _parse_sse_stream(r)
    assert done is True
    assert errors == []
    assert len(answer) > 0
    # Must not quote 450 or Lisboa/Porto from user A's trip
    assert "450" not in answer, f"User B saw User A data: {answer!r}"
    assert "Lisboa" not in answer and "Porto" not in answer, f"User B saw User A places: {answer!r}"


# ---- Clear -----------------------------------------------------------------

def test_delete_messages_clears_only_caller(user_a, user_b):
    # Make sure user_b now has at least one assistant message (from previous test)
    r_b_before = requests.get(f"{API}/ai/messages", headers=_hdr(user_b), timeout=15)
    assert r_b_before.status_code == 200
    assert len(r_b_before.json()) >= 2

    # Clear user A
    r = requests.delete(f"{API}/ai/messages", headers=_hdr(user_a), timeout=15)
    assert r.status_code == 200
    assert r.json().get("success") is True

    # user A now empty
    r_a = requests.get(f"{API}/ai/messages", headers=_hdr(user_a), timeout=15)
    assert r_a.status_code == 200
    assert r_a.json() == []

    # user B unaffected
    r_b_after = requests.get(f"{API}/ai/messages", headers=_hdr(user_b), timeout=15)
    assert r_b_after.status_code == 200
    assert len(r_b_after.json()) == len(r_b_before.json())

    # Cleanup user B as well
    requests.delete(f"{API}/ai/messages", headers=_hdr(user_b), timeout=15)
