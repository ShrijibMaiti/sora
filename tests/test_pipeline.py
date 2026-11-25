"""Hourly pipeline, stations, fires, smoke alerts, backoff and health (waves 4–5); no network."""
from datetime import datetime, timedelta, timezone

import httpx
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from sora import pipeline
from sora.api.main import app
from sora.data import fires, openaq, openmeteo
from sora.events import calendar, detect
from sora.field import forecast

client = TestClient(app)
NOW = pd.Timestamp("2026-11-24T12:00:00Z")


def test_stations_reporting_from_datetime_last(monkeypatch):
    locs = [
        {"id": 1, "name": "ITO", "isMonitor": True, "coordinates": {"latitude": 28.63, "longitude": 77.24},
         "datetimeLast": {"utc": "2026-11-24T11:00:00Z"}},
        {"id": 2, "name": "Rohini", "isMonitor": True, "coordinates": {"latitude": 28.73, "longitude": 77.12},
         "datetimeLast": {"utc": "2026-11-23T20:00:00Z"}},
        {"id": 3, "name": None, "isMonitor": True, "coordinates": {"latitude": 28.5, "longitude": 77.0}, "datetimeLast": None},
        {"id": 4, "name": "PurpleAir", "isMonitor": False, "coordinates": {"latitude": 28.6, "longitude": 77.2}},
    ]
    monkeypatch.setattr(openaq, "_get", lambda c, path, params: {"results": locs})
    st = openaq.stations((28.4, 76.84, 28.88, 77.35), NOW, api_key="k")
    assert [(s["name"], s["reporting"]) for s in st] == [("ITO", True), ("Rohini", False), ("Station 3", False)]
    assert openaq.stations((0, 0, 1, 1), NOW) is None  # no key


def fake_get(text):
    return lambda url, timeout: httpx.Response(200, text=text, request=httpx.Request("GET", url))


def test_fires_filter_low_confidence_and_sort_by_power(monkeypatch):
    csv = ("latitude,longitude,confidence,frp\n"
           "30.1,75.5,n,12.0\n30.2,75.6,l,99.0\n30.3,75.7,h,40.0\n")
    monkeypatch.setattr(fires.httpx, "get", fake_get(csv))
    assert fires.fetch((28, 76, 29, 77), api_key="k") == [[30.3, 75.7], [30.1, 75.5]]
    monkeypatch.setattr(fires.httpx, "get", fake_get("Invalid MAP_KEY."))
    with pytest.raises(ValueError):
        fires.fetch((28, 76, 29, 77), api_key="k")
    assert fires.fetch((28, 76, 29, 77)) is None
    monkeypatch.setattr(fires.httpx, "get", lambda url, timeout: httpx.Response(403, request=httpx.Request("GET", url)))
    with pytest.raises(ValueError) as e:
        fires.fetch((28, 76, 29, 77), api_key="SECRETKEY")
    assert "SECRETKEY" not in str(e.value)  # errors get logged; the key must not be in them


def test_field_carries_stations_and_fires_but_stays_cams_only(monkeypatch):
    monkeypatch.setattr(openaq, "stations", lambda bbox, now: [{"name": "ITO", "lat": 28.63, "lon": 77.24, "reporting": True},
                                                               {"name": "Rohini", "lat": 28.73, "lon": 77.12, "reporting": False}])
    monkeypatch.setattr(fires, "fetch", lambda bbox: [[30.1, 75.5]])
    f = client.get("/api/field?city=delhi").json()
    assert f["meta"]["n_stations"] == 2 and f["meta"]["n_reporting"] == 1 and f["fires"] == [[30.1, 75.5]]
    assert f["meta"]["degradation"] == "L3" and not np.any(f["coverage"])  # shown, not assimilated


def test_station_or_fire_outage_never_blocks_the_field(monkeypatch):
    def down(*a):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(openaq, "stations", down)
    monkeypatch.setattr(fires, "fetch", down)
    r = client.get("/api/field?city=delhi")
    assert r.status_code == 200 and r.json()["stations"] == [] and r.json()["fires"] == []


def test_failed_build_backs_off_instead_of_retrying_every_request(monkeypatch):
    calls = []

    def down(*a, **k):
        calls.append(1)
        raise httpx.ConnectError("down")
    monkeypatch.setattr(openmeteo, "fetch_points", down)
    now = datetime.now(timezone.utc)
    for dt in (0, 1, 4):  # minutes
        with pytest.raises((httpx.HTTPError, ValueError)):
            forecast.get("delhi", now + timedelta(minutes=dt))
    assert len(calls) == 1
    with pytest.raises(httpx.HTTPError):
        forecast.get("delhi", now + timedelta(minutes=6))  # backoff over: tries again
    assert len(calls) == 2


def met(hours=48, wind_from=270.0):
    return {"times": [f"t{i:02d}" for i in range(hours)], "boundary_layer_height": np.full(hours, 900.0),
            "wind_speed_10m": np.full(hours, 3.0), "precipitation": np.zeros(hours), "wind_from_deg": np.full(hours, wind_from)}


def test_smoke_alert_needs_fires_upwind():
    center = (28.61, 77.20)
    west = [[28.6 + 0.05 * i, 75.5] for i in range(12)]  # Punjab / Haryana side
    ev = detect.from_forecast(met(wind_from=270), west, center)
    fire = [e for e in ev if e["kind"] == "fire"]
    assert len(fire) == 1 and "to the west" in fire[0]["body"] and fire[0]["start"] == "t00"
    assert not [e for e in detect.from_forecast(met(wind_from=90), west, center) if e["kind"] == "fire"]  # blowing away
    assert not [e for e in detect.from_forecast(met(wind_from=270), west[:5], center) if e["kind"] == "fire"]  # too few


def test_overpass_retries_busy_errors(monkeypatch, tmp_path):
    from sora.data import osm
    answers = [503, 504, 200]
    monkeypatch.setattr(osm.time, "sleep", lambda s: None)
    monkeypatch.setattr(osm.httpx, "post", lambda url, **k: httpx.Response(answers.pop(0), content=b'{"elements": []}',
                                                                           request=httpx.Request("POST", url)))
    osm._query("q", tmp_path / "a.json")
    assert (tmp_path / "a.json").read_bytes() == b'{"elements": []}' and not answers
    answers[:] = [502, 502, 502]
    with pytest.raises(httpx.HTTPStatusError):
        osm._query("q", tmp_path / "b.json")
    assert not (tmp_path / "b.json").exists()


def test_festival_calendar():
    window = ["2027-10-29T00:00:00Z", "2027-10-31T23:00:00Z"]
    (diwali,) = calendar.upcoming("delhi", window)
    assert diwali["kind"] == "festival" and diwali["start"] == "2027-10-29T12:30:00Z"  # 18:00 IST
    assert diwali["end"] == "2027-10-30T00:30:00Z" and diwali["severity"] == "warning"
    assert [e["title"] for e in calendar.upcoming("chennai", ["2027-01-13T12:00:00Z", "2027-01-16T12:00:00Z"])] == ["Bhogi bonfires"]
    assert calendar.upcoming("delhi", ["2027-01-13T12:00:00Z", "2027-01-16T12:00:00Z"]) == []  # Bhogi is Chennai's
    assert calendar.upcoming("delhi", ["2027-11-05T00:00:00Z", "2027-11-08T00:00:00Z"]) == []  # nothing in the window
    for date, *_ in calendar.FESTIVALS:
        assert date >= "2027-01-01"  # past entries get pruned when the table is extended


def test_pipeline_run_once_and_health(monkeypatch):
    assert client.get("/api/health").status_code == 503  # nothing built yet
    assert pipeline.run_once() is True
    h = client.get("/api/health")
    assert h.status_code == 200 and h.json()["cities"]["delhi"]["fresh"]
    forecast._cache.clear()
    monkeypatch.setattr(openmeteo, "fetch_points", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("down")))
    assert pipeline.run_once() is False  # loop then retries in RETRY_S, not next hour
