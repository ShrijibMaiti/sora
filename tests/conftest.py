"""Shared fixtures: synthetic Open-Meteo data and a synthetic Delhi street grid (sora/fake.py), so no test touches
the network."""
import dataclasses
import json

import pytest

from sora import config
from sora.data import openmeteo, osm
from sora.fake import OSM_PLACES, fake_points, street_grid, write_transit  # noqa: F401  (fake_points is imported by the tests)
from sora.field import forecast
from sora.representation import places, road_graph, transit
from sora.uncertainty import ensemble

GRID = street_grid("delhi")


@pytest.fixture
def preview_city(monkeypatch):
    """A city whose model isn't live (every configured city is live today; new ones start this way)."""
    monkeypatch.setitem(config.CITIES, "kolkata", dataclasses.replace(config.CITIES["kolkata"], built=False))
    return "kolkata"


@pytest.fixture(autouse=True)
def fresh(monkeypatch, tmp_path):
    forecast._cache.clear()
    forecast._failed.clear()
    ensemble._cache.clear()
    places._index.clear()
    transit._nets.clear()
    monkeypatch.setattr(osm, "fetch_transit", write_transit)  # synthetic metro: two lines crossing at "Central"
    monkeypatch.setattr(config, "CACHE", tmp_path)  # never read or write the real data_cache
    monkeypatch.setattr(osm, "fetch_places", lambda bbox, path: path.write_text(json.dumps(OSM_PLACES), encoding="utf-8"))
    for k in ("OPENAQ_API_KEY", "FIRMS_MAP_KEY"):  # a developer's real keys must not send tests to the network
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("SORA_RATE_LIMIT", "off")  # one test client fires many requests; test_ops turns it back on
    monkeypatch.setattr(openmeteo, "fetch_points", fake_points())
    monkeypatch.setattr(road_graph, "get", lambda key: GRID)
