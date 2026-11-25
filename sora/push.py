"""Web Push: reminders (including proactive suggestions, spec §28.2) and event alerts (§28.3), personal content on the device.

The server stores only a push address, the city (for alerts) and wake-up times. A reminder push carries no text: it wakes
the service worker, which reads the text from the device's own storage (spec §40, §41.3). Alerts are city-wide and
public, so they carry their text. Every push shows a notification (browsers require it), so the device only asks for a
wake-up when it has something to say.
"""
import base64
import hashlib
import json
import logging
import os
import threading
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid01
from pywebpush import WebPushException, webpush

from . import config

log = logging.getLogger("sora.push")
SUBJECT = os.environ.get("SORA_VAPID_SUBJECT", "mailto:push@sora.invalid")  # set to your site URL or contact in production
# Only real push services: the server POSTs to these addresses, so any other host would be a request-forgery hole
PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com",
              ".push.apple.com", ".notify.windows.com")
MAX_SUBS, MAX_WAKES, WAKE_AHEAD = 10_000, 50, timedelta(days=7)
ALERT_AHEAD = timedelta(hours=12)
TICK_S = 30

_lock = threading.Lock()
_vapid: Vapid01 | None = None


def _file(name):
    return config.CACHE / name


def _vapid_key() -> Vapid01:
    """The server's VAPID key pair, created once and kept in the cache folder."""
    global _vapid
    if _vapid is None:
        path = _file("vapid_private.pem")
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            v = Vapid01()
            v.generate_keys()
            v.save_key(str(path))
        _vapid = Vapid01.from_file(str(path))
    return _vapid


def public_key() -> str:
    raw = _vapid_key().public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def allowed_endpoint(url: str) -> bool:
    u = urlparse(url)
    host = (u.hostname or "").lower()
    return u.scheme == "https" and any(host == h.lstrip(".") or (h.startswith(".") and host.endswith(h)) for h in PUSH_HOSTS)


def sid_of(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode()).hexdigest()[:20]


def _load() -> dict:
    try:
        return json.loads(_file("push.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def _save(subs: dict):
    path = _file("push.json")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(subs), encoding="utf-8")
    tmp.replace(path)  # atomic: a crash never leaves half a file


def upsert(sub: dict, city: str | None, alerts: bool) -> str:
    sid = sid_of(sub["endpoint"])
    with _lock:
        subs = _load()
        if sid not in subs and len(subs) >= MAX_SUBS:
            raise OverflowError("too many subscriptions")
        old = subs.get(sid, {})
        subs[sid] = {"sub": sub, "city": city, "alerts": alerts, "wakes": old.get("wakes", []), "sent": old.get("sent", [])}
        _save(subs)
    return sid


def add_wake(sid: str, wid: str, at: datetime) -> bool:
    now = datetime.now(timezone.utc)
    if not now - timedelta(minutes=1) <= at <= now + WAKE_AHEAD:
        raise ValueError("wake time must be within the next 7 days")
    with _lock:
        subs = _load()
        if sid not in subs:
            return False
        wakes = [w for w in subs[sid]["wakes"] if w["id"] != wid] + [{"id": wid, "at": at.astimezone(timezone.utc).isoformat()}]
        subs[sid]["wakes"] = sorted(wakes, key=lambda w: w["at"])[-MAX_WAKES:]
        _save(subs)
    return True


def remove(sid: str) -> bool:
    with _lock:
        subs = _load()
        found = subs.pop(sid, None) is not None
        _save(subs)
    return found


def due(now: datetime, events_for) -> list[tuple[str, dict]]:
    """(sid, payload) to send now; marks them as sent. `events_for(city)` → that city's current events."""
    out = []
    city_events = {}
    with _lock:
        subs = _load()
        for sid, s in subs.items():
            keep = []
            for w in s["wakes"]:
                if datetime.fromisoformat(w["at"]) <= now:
                    out.append((sid, {"type": "wake", "id": w["id"]}))
                else:
                    keep.append(w)
            s["wakes"] = keep
            if s.get("alerts") and s.get("city"):
                if s["city"] not in city_events:
                    city_events[s["city"]] = events_for(s["city"])
                for e in city_events[s["city"]]:
                    key = f"{s['city']}:{e['kind']}:{e['start']}"
                    start = datetime.fromisoformat(e["start"].replace("Z", "+00:00"))
                    if e["severity"] == "warning" and key not in s["sent"] and start - now <= ALERT_AHEAD:
                        s["sent"] = (s["sent"] + [key])[-100:]
                        out.append((sid, {"type": "alert", "title": e["title"], "body": e["body"], "tag": key}))
        _save(subs)
    return out


def send(sid: str, payload: dict) -> bool:
    with _lock:
        rec = _load().get(sid)
    if not rec:
        return False
    try:
        webpush(subscription_info=rec["sub"], data=json.dumps(payload), vapid_private_key=_vapid_key(),
                vapid_claims={"sub": SUBJECT}, ttl=3600, timeout=10)
        return True
    except WebPushException as e:
        status = getattr(e.response, "status_code", None)
        if status in (404, 410):  # the browser unsubscribed: forget it
            remove(sid)
        log.warning("push to %s failed: %s", sid, status or e)
        return False


def tick(events_for, now: datetime | None = None) -> int:
    sent = 0
    for sid, payload in due(now or datetime.now(timezone.utc), events_for):
        sent += send(sid, payload)
    return sent


def loop(stop: threading.Event, events_for):
    while not stop.wait(TICK_S):
        try:
            tick(events_for)
        except Exception:  # keep delivering whatever one bad record does
            log.exception("push tick failed")
