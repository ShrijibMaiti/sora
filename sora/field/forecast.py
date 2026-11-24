"""Hourly 0–72 h PM2.5 field served by /api/field (spec §18, docs/api_contract.md).

shortcut: CAMS background only (no station correction, no LUR downscaling) with a fixed log-normal
error prior for p05/p95, so the field is labelled degradation L5 "CAMS only"; replace with the T0
field model (spec §43: station ML + LUR + ensemble) once it exists.
"""
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

import httpx
import numpy as np

from .. import config
from ..data import fires, openaq, openmeteo

HORIZON_H = config.FORECAST_DAYS * 24
STALE_OK = timedelta(hours=3)  # an older field still beats no field (spec §39)
RETRY = timedelta(minutes=5)   # after a failed build, serve the old field instead of retrying on every request
SIGMA0, SIGMA_PER_H = 0.35, 0.003  # log-space spread of CAMS error; widens with lead time
UPSTREAM_ERRORS = (httpx.HTTPError, ValueError, KeyError)

log = logging.getLogger("sora.field")
_cache: dict[str, tuple[datetime, dict]] = {}
_failed: dict[str, datetime] = {}
_lock = threading.Lock()


def _optional(what, fn, *args):
    """Stations and fires add context but never block the field."""
    try:
        return fn(*args)
    except UPSTREAM_ERRORS as e:
        log.warning("%s unavailable: %s", what, e)
        return None


def iso(t) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def _ffill(a):
    """Fill gaps along time (axis 0) from the previous hour, then the next; CAMS ends sometimes have nulls."""
    for _ in range(2):
        for i in range(1, len(a)):
            gap = np.isnan(a[i])
            a[i, gap] = a[i - 1, gap]
        a = a[::-1]
    return a


def build(key: str, now: datetime) -> dict:
    """{"field": contract Field, "met": city-mean hourly met for event detection}."""
    city = config.CITIES[key]
    t0 = now.replace(minute=0, second=0, microsecond=0)
    s, w, n, e = city.bbox
    lats, lons = np.linspace(s, n, config.GRID_N), np.linspace(w, e, config.GRID_N)
    LA, LO = np.meshgrid(lats, lons, indexing="ij")
    # past_days=0 starts at 00 UTC today, so one extra day keeps t0 + 72 h inside the window at any hour
    times, data = openmeteo.fetch_points(LA.ravel(), LO.ravel(), past_days=0, forecast_days=config.FORECAST_DAYS + 1)
    i0 = int(times.searchsorted(t0))
    T = HORIZON_H + 1
    if i0 >= len(times) or times[i0] != t0 or i0 + T > len(times):
        raise ValueError(f"forecast does not cover {iso(t0)} + {HORIZON_H} h")
    sl = slice(i0, i0 + T)

    pm = _ffill(data["pm2_5"][sl].copy())
    if np.isnan(pm).any() or (pm < 0).any():
        raise ValueError("CAMS PM2.5 has missing or negative values")
    median = pm.reshape(T, config.GRID_N, config.GRID_N)
    sigma = (SIGMA0 + SIGMA_PER_H * np.arange(T))[:, None, None]

    # Open-Meteo gives the direction wind blows FROM; the contract wants where it blows TO
    spd, frm = data["wind_speed_10m"][sl], np.radians(data["wind_direction_10m"][sl])
    u, v = np.nanmean(-spd * np.sin(frm), 1), np.nanmean(-spd * np.cos(frm), 1)
    to_deg = np.degrees(np.arctan2(u, v)) % 360

    r1 = lambda a: np.round(a, 1).tolist()
    tt = [iso(t) for t in times[sl]]
    # shown on the map, not assimilated: the field stays CAMS-only (coverage 0, degradation L5) until the T0 model
    stations = _optional("OpenAQ stations", openaq.stations, city.bbox, now) or []
    fire_pts = _optional("FIRMS fires", fires.fetch, fires.region(city.bbox)) or []
    field = {
        "city": key, "pollutant": "pm25", "unit": "µg/m³",
        "times": tt, "lats": np.round(lats, 4).tolist(), "lons": np.round(lons, 4).tolist(),
        "median": r1(median), "p05": r1(median * np.exp(-1.645 * sigma)), "p95": r1(median * np.exp(1.645 * sigma)),
        "coverage": np.zeros((config.GRID_N, config.GRID_N)).tolist(),
        "stations": stations, "fires": fire_pts,
        "wind": {"dir_deg": r1(to_deg), "speed_ms": np.round(np.nanmean(spd, 1), 2).tolist()},
        "meta": {
            "analysis_time": tt[0], "next_update": iso(t0 + timedelta(hours=1)), "built_at": iso(now),
            "degradation": "L5", "n_stations": len(stations), "n_reporting": sum(s["reporting"] for s in stations),
            "background": "CAMS global forecast",
        },
    }
    met = {k: np.nanmean(data[k][sl], 1) for k in ("boundary_layer_height", "wind_speed_10m", "precipitation")}
    met["wind_from_deg"] = (to_deg + 180) % 360
    met["times"] = tt
    return {"field": field, "met": met}


def get(key: str, now: datetime | None = None) -> dict:
    """Cached build for the current UTC hour. If the upstream fails, serve the last good build for up to STALE_OK,
    and don't try again for RETRY, so requests don't each wait out the upstream's timeouts."""
    now = now or datetime.now(timezone.utc)
    hour = now.replace(minute=0, second=0, microsecond=0)
    with _lock:  # one upstream fetch per city-hour even when the app fires several requests at once
        hit = _cache.get(key)
        if hit and hit[0] == hour:
            return hit[1]
        usable = hit is not None and now - hit[0] <= STALE_OK
        if key in _failed and now - _failed[key] < RETRY:
            if usable:
                return hit[1]
            raise ValueError(f"{key}: forecast upstream failed at {iso(_failed[key])}; retrying after {RETRY}")
        t = time.monotonic()
        try:
            out = build(key, now)
        except UPSTREAM_ERRORS:
            _failed[key] = now
            log.exception("field build failed for %s; %s", key, "serving the last build" if usable else "no fallback")
            if usable:
                return hit[1]
            raise
        _failed.pop(key, None)
        m = out["field"]["meta"]
        log.info("field %s built in %.1fs: %d/%d stations reporting, %d fires",
                 key, time.monotonic() - t, m["n_reporting"], m["n_stations"], len(out["field"]["fires"]))
        _cache[key] = (hour, out)
        return out


def is_fresh(key: str, now: datetime | None = None) -> bool:
    """Whether the cached field is for the current UTC hour."""
    now = now or datetime.now(timezone.utc)
    hit = _cache.get(key)
    return bool(hit) and hit[0] == now.replace(minute=0, second=0, microsecond=0)
