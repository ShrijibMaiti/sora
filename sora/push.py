"""Web Push: reminders (including proactive suggestions, spec §28.2) and event alerts (§28.3), personal content on the device.

The server stores (in SQLite, push.db) only a push address, the city (for alerts) and wake-up times. A reminder push carries no text: it wakes
the service worker, which reads the text from the device's own storage (spec §40, §41.3). Alerts are city-wide and
public, so they carry their text. Every push shows a notification (browsers require it), so the device only asks for a
wake-up when it has something to say.
"""
import base64
import hashlib
import json
import logging
import os
import sqlite3
import threading
from contextlib import contextmanager
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

_vapid: Vapid01 | None = None


def _file(name):
    return config.CACHE / name


def _vapid_key() -> Vapid01:
    """The server's VAPID key pair, created once and kept in the cache folder."""
    global _vapid
    if _vapid is None:
        path = _file("vapid_private.pem")
        if not path.exists():  # several workers may start together: the first link wins, the rest read it
            path.parent.mkdir(parents=True, exist_ok=True)
            v = Vapid01()
            v.generate_keys()
            tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
            tmp.write_bytes(v.private_pem())
            try:
                os.link(tmp, path)
            except FileExistsError:
                pass
            finally:
                tmp.unlink()
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


SCHEMA = """
CREATE TABLE IF NOT EXISTS subs (sid TEXT PRIMARY KEY, sub TEXT NOT NULL, city TEXT, alerts INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS wakes (sid TEXT NOT NULL REFERENCES subs ON DELETE CASCADE, id TEXT NOT NULL, at TEXT NOT NULL,
                                  PRIMARY KEY (sid, id));
CREATE INDEX IF NOT EXISTS wakes_at ON wakes (at);
CREATE TABLE IF NOT EXISTS sent (sid TEXT NOT NULL REFERENCES subs ON DELETE CASCADE, key TEXT NOT NULL, at TEXT NOT NULL,
                                 PRIMARY KEY (sid, key));
"""


@contextmanager
def _tx():
    """One write transaction on push.db. BEGIN IMMEDIATE takes the write lock up front, so several server workers on
    one host never claim the same wake or alert twice (shortcut: one host's disk; use Postgres to scale out)."""
    path = _file("push.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=15, isolation_level=None)
    try:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
        db.execute("BEGIN IMMEDIATE")
        try:
            yield db
            db.execute("COMMIT")
        except BaseException:
            db.execute("ROLLBACK")
            raise
    finally:
        db.close()


def upsert(sub: dict, city: str | None, alerts: bool) -> str:
    sid = sid_of(sub["endpoint"])
    with _tx() as db:
        known = db.execute("SELECT 1 FROM subs WHERE sid = ?", (sid,)).fetchone()
        if not known and db.execute("SELECT COUNT(*) FROM subs").fetchone()[0] >= MAX_SUBS:
            raise OverflowError("too many subscriptions")
        db.execute("INSERT INTO subs VALUES (?, ?, ?, ?) ON CONFLICT (sid) DO UPDATE SET sub = excluded.sub, "
                   "city = excluded.city, alerts = excluded.alerts", (sid, json.dumps(sub), city, int(alerts)))
    return sid


def _ts(at: datetime) -> str:
    return at.astimezone(timezone.utc).isoformat(timespec="seconds")  # one format, so text order is time order


def add_wake(sid: str, wid: str, at: datetime) -> bool:
    now = datetime.now(timezone.utc)
    if not now - timedelta(minutes=1) <= at <= now + WAKE_AHEAD:
        raise ValueError("wake time must be within the next 7 days")
    with _tx() as db:
        if not db.execute("SELECT 1 FROM subs WHERE sid = ?", (sid,)).fetchone():
            return False
        db.execute("INSERT OR REPLACE INTO wakes VALUES (?, ?, ?)", (sid, wid, _ts(at)))
        db.execute("DELETE FROM wakes WHERE sid = ? AND id NOT IN "
                   "(SELECT id FROM wakes WHERE sid = ? ORDER BY at DESC LIMIT ?)", (sid, sid, MAX_WAKES))
    return True


def remove(sid: str) -> bool:
    with _tx() as db:
        return db.execute("DELETE FROM subs WHERE sid = ?", (sid,)).rowcount > 0


def due(now: datetime, events_for) -> list[tuple[str, dict]]:
    """(sid, payload) to send now, claimed atomically: each wake and alert goes to exactly one worker, once.
    `events_for(city)` → that city's current events (fetched before taking the lock)."""
    with _tx() as db:
        cities = [c for (c,) in db.execute("SELECT DISTINCT city FROM subs WHERE alerts AND city IS NOT NULL")]
    warn = {}
    for c in cities:
        warn[c] = [e for e in events_for(c) if e["severity"] == "warning"
                   and datetime.fromisoformat(e["start"].replace("Z", "+00:00")) - now <= ALERT_AHEAD]
    out = []
    with _tx() as db:
        for sid, wid in db.execute("DELETE FROM wakes WHERE at <= ? RETURNING sid, id", (_ts(now),)).fetchall():
            out.append((sid, {"type": "wake", "id": wid}))
        for sid, city in db.execute("SELECT sid, city FROM subs WHERE alerts AND city IS NOT NULL").fetchall():
            for e in warn.get(city, []):
                key = f"{city}:{e['kind']}:{e['start']}"
                if db.execute("INSERT OR IGNORE INTO sent VALUES (?, ?, ?)", (sid, key, _ts(now))).rowcount:
                    out.append((sid, {"type": "alert", "title": e["title"], "body": e["body"], "tag": key}))
        db.execute("DELETE FROM sent WHERE at < ?", (_ts(now - timedelta(days=30)),))  # events are days long at most
    return out


def subscription(sid: str) -> dict | None:
    with _tx() as db:
        row = db.execute("SELECT sub FROM subs WHERE sid = ?", (sid,)).fetchone()
    return json.loads(row[0]) if row else None


def send(sid: str, payload: dict) -> bool:
    sub = subscription(sid)
    if not sub:
        return False
    try:
        webpush(subscription_info=sub, data=json.dumps(payload), vapid_private_key=_vapid_key(),
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
