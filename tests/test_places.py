"""GET /api/places and GET /api/search (docs/api_contract.md), on a fake Overpass answer and the synthetic street grid."""
import httpx
import pytest
from fastapi.testclient import TestClient

from sora import config
from sora.api.main import app
from sora.data import osm
from sora.representation import places

client = TestClient(app)


@pytest.mark.parametrize("key", [k for k, c in config.CITIES.items() if c.built])
def test_config_places_and_examples_are_consistent(key):
    """Every featured place is routable and every example refers to a featured place (the app relies on both)."""
    s, w, n, e = config.CITIES[key].route_bbox
    feat = {p["key"]: p for p in config.PLACES[key]}
    assert all(s <= p["lat"] <= n and w <= p["lon"] <= e for p in feat.values())
    ex = config.EXAMPLES[key]
    assert ex["trip"]["origin"] in feat and ex["trip"]["dest"] in feat
    assert all(st["place"] in feat and st.get("alt", st["place"]) in feat for st in ex["day"])


def test_places_endpoint():
    r = client.get("/api/places?city=delhi").json()
    assert [p["key"] for p in r["places"]][:2] == ["saket", "cp"]
    assert set(r["places"][0]) == {"key", "name", "sub", "lat", "lon", "building"}
    assert r["example"]["trip"]["origin"] == "saket" and r["example"]["day"][0]["name"] == "Home"
    assert next(p for p in r["places"] if p["key"] == "greenpark")["building"] == "ac_filtered"
    keys = [p["key"] for c in config.PLACES for p in config.PLACES[c]]
    assert len(keys) == len(set(keys)), "place keys are global in the app; they must not repeat across cities"


def test_search_ranks_featured_then_osm_then_streets():
    r = client.get("/api/search?city=delhi&q=khan").json()
    assert [p["name"] for p in r] == ["Khan Market", "Khan Market Stalls"]  # featured first
    assert r[1]["key"] == "osm_w3" and r[1]["sub"] == "Market · Delhi"  # no neighbourhood within 2.5 km: the city
    gym = client.get("/api/search?city=delhi&q=gold").json()[0]
    assert gym["name"] == "Gold's Gym" and gym["sub"] == "Gym · Hauz Khas"  # labelled with the nearest neighbourhood
    road = client.get("/api/search?city=delhi&q=ring").json()[0]
    assert road["name"] == "Ring Road" and road["key"] == "street_ring_road" and road["sub"].startswith("Road")
    assert client.get("/api/search?city=delhi&q=outside").json() == []  # outside route_bbox is not routable
    assert client.get("/api/search?city=delhi&q=k").json() == []         # too short to be useful
    assert client.get("/api/search?city=delhi").json()["detail"]["code"] == "invalid"


def test_search_falls_back_to_featured_places_when_osm_is_down(monkeypatch):
    def down(bbox, path):
        raise httpx.ConnectError("down")
    monkeypatch.setattr(osm, "fetch_places", down)
    assert [p["name"] for p in client.get("/api/search?city=delhi&q=khan").json()] == ["Khan Market"]
    assert "delhi" not in places._index  # not cached: the next search tries OSM again
