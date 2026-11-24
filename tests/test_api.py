"""API contract tests (docs/api_contract.md) on synthetic Open-Meteo data; no network."""
from datetime import datetime, timedelta, timezone

import httpx
import numpy as np
import pytest
from conftest import fake_points
from fastapi.testclient import TestClient

from sora import config
from sora.api.main import app
from sora.data import openmeteo
from sora.events import detect
from sora.field import forecast

client = TestClient(app)


def test_cities_lists_all_with_delhi_live():
    r = client.get("/api/cities").json()
    assert [c["key"] for c in r] == list(config.CITIES)
    delhi = r[0]
    assert delhi["built"] and delhi["status"] == "Live" and delhi["route_bbox"] == [28.515, 77.18, 28.645, 77.25]
    assert all(c["status"] == "Preview" for c in r[1:])


def test_field_matches_contract():
    f = client.get("/api/field?city=delhi&pollutant=pm25").json()
    T = forecast.HORIZON_H + 1
    med, p05, p95 = (np.array(f[k]) for k in ("median", "p05", "p95"))
    assert med.shape == p05.shape == p95.shape == (T, config.GRID_N, config.GRID_N)
    assert len(f["times"]) == T and f["times"][0] == f["meta"]["analysis_time"]
    assert f["lats"] == sorted(f["lats"]) and f["lons"] == sorted(f["lons"])
    assert not np.isnan(med).any() and (p05 <= med).all() and (med <= p95).all()
    assert len(f["wind"]["dir_deg"]) == T and f["meta"]["degradation"] == "L5"
    # spread widens with lead time
    assert (p95[-1] / med[-1]).mean() > (p95[0] / med[0]).mean()


def test_wind_direction_is_where_it_blows_to(monkeypatch):
    monkeypatch.setattr(openmeteo, "fetch_points", fake_points(wind_from=270.0))  # westerly
    assert client.get("/api/field?city=delhi").json()["wind"]["dir_deg"][0] == pytest.approx(90.0)


@pytest.mark.parametrize("url,status,code", [
    ("/api/field?city=delhi&pollutant=no2", 404, "unavailable"),
    ("/api/field?city=kolkata&pollutant=pm25", 404, "not_built"),
    ("/api/field?city=paris&pollutant=pm25", 404, "unknown_city"),
    ("/api/field?city=delhi&pollutant=xyz", 400, "invalid"),
    ("/api/field", 400, "invalid"),
    ("/api/events?city=paris", 404, "unknown_city"),
])
def test_errors_use_contract_body(url, status, code):
    r = client.get(url)
    assert r.status_code == status
    assert r.json()["detail"]["code"] == code and r.json()["detail"]["message"]


def test_upstream_failure_serves_stale_then_503(monkeypatch):
    now = datetime.now(timezone.utc)
    first = forecast.get("delhi", now)

    def down(*a, **k):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(openmeteo, "fetch_points", down)
    assert forecast.get("delhi", now + timedelta(hours=2)) is first  # stale within 3 h
    with pytest.raises(httpx.HTTPError):
        forecast.get("delhi", now + timedelta(hours=5))
    forecast._cache.clear()
    r = client.get("/api/field?city=delhi")
    assert r.status_code == 503 and r.json()["detail"]["code"] == "upstream"


def test_events_preview_city_is_empty():
    assert client.get("/api/events?city=mumbai").json() == []


def test_stagnant_nights_merge_into_one_event():
    T = 73
    h = np.arange(T)
    blh = np.where(h % 24 < 14, 60.0, 900.0)  # shallow 14 h a day, deep for 10 h each afternoon
    met = {"times": [f"t{i:02d}" for i in h], "boundary_layer_height": blh, "wind_speed_10m": np.full(T, 1.0),
           "precipitation": np.where((h >= 30) & (h < 33), 2.0, 0.0)}
    ev = detect.from_forecast(met)
    kinds = [e["kind"] for e in ev]
    assert kinds.count("inversion") == 1 and kinds.count("rain") == 1
    inv = next(e for e in ev if e["kind"] == "inversion")
    assert inv["title"] == "Stagnant nights" and inv["start"] == "t00" and inv["end"] == "t62"
    assert "about 100 m" in inv["body"] and inv["probability"] == 0.8
    assert all(0 < e["probability"] <= 1 for e in ev)
