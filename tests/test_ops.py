"""Production middleware (security headers, rate limits, metrics) and Web Push; no network."""
import base64
import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from sora import push
from sora.api import middleware as mw
from sora.api.main import app

client = TestClient(app)
SUB = {"endpoint": "https://fcm.googleapis.com/fcm/send/abc123", "keys": {"p256dh": "BPk", "auth": "xyz"}}


def test_security_headers_on_api_responses():
    h = client.get("/api/cities").headers
    assert "default-src 'self'" in h["content-security-policy"] and "frame-ancestors 'none'" in h["content-security-policy"]
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
    assert "strict-transport-security" not in h  # plain http: HSTS only over https


def test_csp_allows_inline_scripts_by_hash_only(tmp_path):
    page = tmp_path / "index.html"
    page.write_text("<html><script>boot()</script><script type=module src=/a.js></script></html>", encoding="utf-8")
    want = base64.b64encode(hashlib.sha256(b"boot()").digest()).decode()
    policy = mw.csp(page)
    assert f"'sha256-{want}'" in policy and "'unsafe-inline'" not in policy.split("script-src")[1].split(";")[0]
    assert "https://tile.openstreetmap.org" in policy  # map tiles, also fetched by the service worker


def test_rate_limiter_refills():
    rl = mw.RateLimiter({"plan": (60, 2)})  # 1 per second, burst 2
    key = ("1.2.3.4", "plan")
    assert rl.take(key, now=0) == 0 and rl.take(key, now=0) == 0
    assert rl.take(key, now=0) == pytest.approx(1.0)  # empty: wait a second
    assert rl.take(key, now=1.0) == 0
    assert rl.take(("5.6.7.8", "plan"), now=1.0) == 0  # per client


def test_rate_limit_over_http(monkeypatch):
    monkeypatch.delenv("SORA_RATE_LIMIT", raising=False)
    burst = mw.LIMITS["plan"][1]
    codes = [client.post("/api/plan", json={}).status_code for _ in range(burst + 1)]
    assert codes[:burst] == [400] * burst and codes[-1] == 429  # invalid body until the budget runs out
    r = client.post("/api/plan", json={})
    assert r.json()["detail"]["code"] == "rate_limited" and int(r.headers["retry-after"]) >= 1
    assert client.get("/api/health").status_code != 429  # health checks are never limited


def test_metrics(monkeypatch):
    client.get("/api/cities")
    text = client.get("/api/metrics").text
    assert 'sora_requests_total{route="/api/cities",method="GET",status="200"}' in text
    monkeypatch.setattr(mw, "METRICS_TOKEN", "s3cret")
    assert client.get("/api/metrics").status_code == 401
    assert client.get("/api/metrics", headers={"Authorization": "Bearer s3cret"}).status_code == 200


@pytest.mark.parametrize("url,ok", [
    ("https://fcm.googleapis.com/fcm/send/x", True), ("https://updates.push.services.mozilla.com/wpush/v2/x", True),
    ("https://web.push.apple.com/abc", True), ("http://fcm.googleapis.com/x", False),
    ("https://169.254.169.254/latest", False), ("https://evil.com/fcm.googleapis.com", False),
    ("https://fcm.googleapis.com.evil.com/x", False),
])
def test_push_endpoint_allowlist(url, ok):
    assert push.allowed_endpoint(url) is ok


def test_push_key_and_subscription_flow():
    key = client.get("/api/push/key").json()["public_key"]
    assert len(base64.urlsafe_b64decode(key + "==")) == 65  # uncompressed P-256 point
    bad = client.put("/api/push/subscription", json={"subscription": {**SUB, "endpoint": "https://10.0.0.1/x"}})
    assert bad.status_code == 400 and bad.json()["detail"]["code"] == "invalid"
    sid = client.put("/api/push/subscription", json={"subscription": SUB, "city": "delhi", "alerts": True}).json()["id"]
    at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    assert client.post(f"/api/push/subscription/{sid}/wake", json={"id": "r1", "at": at}).json() == {"ok": True}
    far = (datetime.now(timezone.utc) + timedelta(days=9)).isoformat()
    assert client.post(f"/api/push/subscription/{sid}/wake", json={"id": "r2", "at": far}).status_code == 400
    assert client.post("/api/push/subscription/0123456789abcdef0123/wake", json={"id": "r1", "at": at}).status_code == 404
    assert client.delete(f"/api/push/subscription/{sid}").json() == {"removed": True}


def test_push_due_wakes_and_alerts():
    sid = push.upsert(SUB, "delhi", alerts=True)
    now = datetime(2027, 1, 10, 4, 0, tzinfo=timezone.utc)  # 09:30 IST
    with push._lock:
        subs = push._load()
        subs[sid]["wakes"] = [{"id": "r1", "at": (now - timedelta(minutes=1)).isoformat()},
                              {"id": "later", "at": (now + timedelta(hours=2)).isoformat()}]
        push._save(subs)
    event = {"kind": "inversion", "title": "Stagnant air", "body": "Calm night.", "start": "2027-01-10T12:00:00Z",
             "severity": "warning"}
    first = push.due(now, lambda city: [event])
    assert (sid, {"type": "wake", "id": "r1"}) in first  # wake carries no text: the device holds it
    assert all(p["type"] in ("wake", "alert") for _, p in first) and len(first) == 2  # the later wake waits
    assert any(p["type"] == "alert" and p["title"] == "Stagnant air" for _, p in first)
    again = push.due(now + timedelta(minutes=1), lambda city: [event])
    assert again == []  # wake sent once, alert once


def test_push_send_forgets_unsubscribed_browsers(monkeypatch):
    sid = push.upsert(SUB, None, alerts=False)
    sent = []

    def fake_webpush(**kw):
        sent.append(kw)
        raise push.WebPushException("gone", response=type("R", (), {"status_code": 410})())
    monkeypatch.setattr(push, "webpush", fake_webpush)
    assert push.send(sid, {"type": "wake", "id": "x"}) is False
    assert sent and sent[0]["vapid_claims"]["sub"].startswith(("mailto:", "https:"))
    assert sid not in push._load()
