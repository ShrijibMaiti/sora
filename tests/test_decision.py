"""POST /api/plan, /api/day, /api/counterfactual on synthetic data (docs/api_contract.md, spec §23–§26, §31)."""
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest
from conftest import fake_points
from fastapi.testclient import TestClient

from sora.api.main import app
from sora.data import openmeteo

client = TestClient(app)
O, D = [28.52, 77.185], [28.64, 77.245]  # opposite corners of the synthetic street grid


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def t0():
    return datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)


def plan_body(dep_h=3, win_min=60, **kw):
    dep, w = t0() + timedelta(hours=dep_h), timedelta(minutes=win_min)
    body = dict(city="delhi", origin=O, dest=D, mode="car_ac", planned_departure=iso(dep), earliest=iso(dep - w),
                latest_departure=iso(dep + w), latest_arrival=None, max_extra_min=15,
                origin_building="naturally_ventilated", dest_building="ac_sealed")
    return body | kw


def ordered(b):
    return b["p05"] <= b["median"] <= b["p95"]


def test_plan_matches_contract():
    body = plan_body()
    r = client.post("/api/plan", json=body)
    assert r.status_code == 200, r.text
    p = r.json()
    base = p["baseline"]
    assert base["id"] == "plan" and base["extra_min"] == 0 and base["p_better"] is None
    assert [o["id"] for o in p["options"]] == ["A", "B", "C"] and p["recommended"] == "B"
    for o in [base, *p["options"]]:
        assert ordered(o["dose"]) and o["dose"]["median"] > 0 and ordered(o["reduction_pct"])
        assert body["earliest"] <= o["departure"] <= body["latest_departure"]
        assert o["path"][0] == O and o["path"][-1] == D and o["travel_min"] > 0
    for o in p["options"]:
        assert 0 <= o["p_better"] <= 1
    assert p["window"]["start"] == body["earliest"] and p["window"]["end"] > body["latest_departure"]
    assert p["explanation"] and any("stations" in c for c in p["caveats"]) and p["degradation"] == "L5"
    # A is the lowest dose and C the quickest among the options
    a, _, c = p["options"]
    assert a["dose"]["median"] <= min(o["dose"]["median"] for o in [base, *p["options"]])
    assert c["travel_min"] <= min(o["travel_min"] for o in [base, *p["options"]])


def test_cleaner_later_departure_is_recommended(monkeypatch):
    now_h = t0().hour  # fake_points hours count from UTC midnight; start clearing from now
    monkeypatch.setattr(openmeteo, "fetch_points", fake_points(pm=lambda h: 300 * np.exp(-np.maximum(h - now_h, 0) / 3) + 20))
    # walking between two naturally ventilated buildings: only when you are outdoors matters, so later is cleaner
    body = plan_body(mode="walk", dest=[28.56, 77.21], dest_building="naturally_ventilated")
    p = client.post("/api/plan", json=body).json()
    a, b, _ = p["options"]
    assert a["departure"] == body["latest_departure"]
    assert p["reliable"] and b["p_better"] >= 0.7 and b["reduction_pct"]["p05"] > 0
    assert any(line.startswith("Leaving at") for line in p["explanation"])


def test_flat_field_is_not_reliably_different(monkeypatch):
    monkeypatch.setattr(openmeteo, "fetch_points", fake_points(pm=lambda h: np.full_like(h, 100.0)))
    p = client.post("/api/plan", json=plan_body()).json()
    assert not p["reliable"] and "not reliably different" in p["explanation"][0]


@pytest.mark.parametrize("change,status,code", [
    (dict(origin=[28.70, 77.20]), 400, "outside"),
    (dict(mode="rocket"), 400, "invalid"),
    (dict(planned_departure=iso(t0() + timedelta(hours=9))), 400, "invalid"),
    (dict(city="kolkata"), 404, "not_built"),
    (dict(city="paris"), 404, "unknown_city"),
])
def test_plan_errors(change, status, code):
    r = client.post("/api/plan", json=plan_body() | change)
    assert r.status_code == status and r.json()["detail"]["code"] == code


def test_plan_beyond_horizon():
    r = client.post("/api/plan", json=plan_body(dep_h=80))
    assert r.status_code == 400 and r.json()["detail"]["code"] == "beyond_horizon"


def test_no_feasible_reports_fastest():
    body = plan_body()
    body["latest_arrival"] = body["earliest"]
    d = client.post("/api/plan", json=body).json()["detail"]
    assert d["code"] == "no_feasible" and d["fastest_min"] > 0


@pytest.mark.parametrize("change", [
    {"kind": "shift_departure", "minutes": 30},
    {"kind": "mode", "mode": "metro"},
    {"kind": "destination", "dest": [28.6, 77.227], "dest_building": "ac_filtered"},
    {"kind": "stay_indoors", "start": iso(t0() + timedelta(hours=2)), "end": iso(t0() + timedelta(hours=5))},
])
def test_counterfactual_matches_contract(change):
    r = client.post("/api/counterfactual", json={"plan": plan_body(), "change": change})
    assert r.status_code == 200, r.text
    c = r.json()
    assert ordered(c["delta_pct"]) and 0 <= c["p_better"] <= 1 and c["reason"]
    assert c["verdict"] in ("Likely helps", "Probably not", "Not reliably different")
    if c["verdict"] == "Likely helps":  # same evidence bar as a recommendation (spec §31.7)
        assert c["p_better"] >= 0.7 and c["delta_pct"]["p95"] < 0


def test_counterfactual_filtered_destination_always_helps():
    c = client.post("/api/counterfactual", json={"plan": plan_body(), "change": {
        "kind": "destination", "dest": D, "dest_building": "ac_filtered"}}).json()
    # not exactly 1: both buildings' infiltration factors are uncertain priors (spec §21.4)
    assert c["p_better"] >= 0.9 and c["delta_pct"]["median"] < 0 and c["verdict"] == "Likely helps"


def test_stay_indoors_outside_the_trip_changes_nothing():
    late = t0() + timedelta(hours=20)
    c = client.post("/api/counterfactual", json={"plan": plan_body(), "change": {
        "kind": "stay_indoors", "start": iso(late), "end": iso(late + timedelta(hours=2))}}).json()
    assert c["delta_pct"] == {"median": 0, "p05": 0, "p95": 0} and c["verdict"] == "Probably not"
    assert "changes nothing" in c["reason"]


def day_body(**kw):
    ist = timedelta(hours=5.5)
    day0 = (t0() + ist).replace(hour=0, minute=0) - ist
    if t0() > day0 + timedelta(hours=7):
        day0 += timedelta(days=1)
    at = lambda hm: iso(day0 + timedelta(hours=int(hm[:2]), minutes=int(hm[3:])))
    P = lambda label, lat, lon: {"label": label, "lat": lat, "lon": lon}
    home = P("Lajpat Nagar", 28.5677, 77.2433)
    stops = [
        {"name": "Home", "place": home, "leave_before": at("08:20"), "building": "naturally_ventilated", "activity": "rest"},
        {"name": "College", "place": P("IIT Delhi", 28.545, 77.1926), "arrive_after": at("08:45"), "duration_min": 455,
         "building": "naturally_ventilated", "activity": "light"},
        {"name": "Gym", "place": P("Hauz Khas Village", 28.5535, 77.194), "duration_min": 75, "building": "naturally_ventilated",
         "activity": "high", "alternatives": [P("Green Park", 28.559, 77.206) | {"building": "ac_filtered"}]},
        {"name": "Restaurant", "place": P("Khan Market", 28.6003, 77.227), "arrive_after": at("18:45"), "duration_min": 105,
         "building": "ac_sealed", "activity": "light"},
        {"name": "Home", "place": home, "building": "naturally_ventilated", "activity": "rest"},
    ]
    return {"city": "delhi", "mode": "car_ac", "max_extra_min": 15, "stops": stops} | kw, at


def test_day_matches_contract_and_picks_filtered_gym():
    body, at = day_body()
    r = client.post("/api/day", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    assert [s["name"] for s in d["stops"]] == [s["name"] for s in body["stops"]]
    for plan in (d["original"], d["optimized"]):
        segs = plan["segments"]
        assert segs[0]["start"] == at("07:00") and segs[-1]["end"] == at("23:00")
        assert all(a["end"] == b["start"] for a, b in zip(segs, segs[1:])), "segments must tile the day"
        assert ordered(plan["total"])
    assert d["stops"][2]["chosen"] == "Green Park" and any("Green Park" in c["title"] for c in d["changes"])
    assert all(c["delta_ug"] < 0 for c in d["changes"])
    assert all(-c["delta_ug"] >= 0.005 * d["original"]["total"]["median"] for c in d["changes"]), "no trivial changes"
    assert d["p_better"] >= 0.9 and d["reduction_pct"]["p05"] > 0 and 0 <= d["extra_min"] <= 15


def test_day_errors():
    body, at = day_body()
    one = client.post("/api/day", json=body | {"stops": body["stops"][:1]})
    assert one.status_code == 400 and one.json()["detail"]["code"] == "invalid"
    body["stops"][1]["leave_before"] = at("09:00")  # 7.5 h of college can't end by 09:00
    tight = client.post("/api/day", json=body)
    assert tight.status_code == 400 and tight.json()["detail"]["code"] == "no_feasible"
