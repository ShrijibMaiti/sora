"""Route × departure-time planning for one trip (spec §23, §24, §31): POST /api/plan.

Candidates come from the median field at the planned departure (fastest, lowest-exposure, balanced); each is then
evaluated at every departure in the window on the shared field samples, so all comparisons are paired.
shortcut: candidates are not re-generated per departure, and arrival constraints are deterministic, not chance
constraints (§24.2); upgrade with time-dependent label-setting once traffic data exists.
"""
from dataclasses import dataclass
from datetime import datetime, timezone

import httpx
import numpy as np

from .. import config
from ..exposure import dose as dosing
from ..exposure.microenv import ACCESS_VENT, BUILDING, MAIN_ROADS, MODES, VENT, congestion
from ..field import forecast
from ..representation import road_graph
from ..uncertainty import ensemble
from . import confidence

HOUR = 3600
STEP_S = 15 * 60  # departure grid
SNAP_WARN_M = 300


class PlanError(Exception):
    def __init__(self, status, code, message, **extra):
        super().__init__(message)
        self.status, self.code, self.message, self.extra = status, code, message, extra


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def hhmm(ts: float) -> str:
    m = int(round((ts / 60 + 330))) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def ist_hour(ts: float) -> float:
    return (ts / HOUR + 5.5) % 24


class Ctx:
    """Field, samples and road graph for one city, as used by every planning call."""

    def __init__(self, key: str):
        self.city = config.CITIES[key]
        try:
            self.field = forecast.get(key)["field"]
            self.g = road_graph.get(key)
        except (httpx.HTTPError, ValueError, KeyError, OSError):
            raise PlanError(503, "upstream", "Forecast or map data is temporarily unavailable. Try again in a few minutes.")
        self.ens = ensemble.get(self.field)
        self.t0 = datetime.fromisoformat(self.field["times"][0].replace("Z", "+00:00")).timestamp()
        self.T = len(self.field["times"])
        self.lats, self.lons = np.array(self.field["lats"]), np.array(self.field["lons"])
        self.med = np.asarray(self.field["median"], float)[None]

    def h(self, ts):
        return (np.asarray(ts, float) - self.t0) / HOUR

    def check_horizon(self, *ts):
        if min(self.h(ts)) < -0.25 or max(self.h(ts)) > self.T - 1:
            raise PlanError(400, "beyond_horizon", "Sora forecasts the next 72 hours; these times fall outside them.")

    def check_inside(self, ll, what):
        s, w, n, e = self.city.route_bbox
        if not (s <= ll[0] <= n and w <= ll[1] <= e):
            raise PlanError(400, "outside", f"{what} is outside the area Sora can route in {self.city.name} "
                                            f"({s}–{n}° N, {w}–{e}° E).")

    def air(self, ts, lat, lon):
        """Median outdoor concentration at points."""
        return dosing.conc(self.med, self.lats, self.lons, self.h(ts), lat, lon)[0]


@dataclass
class Leg:
    mode: str
    edges: np.ndarray
    dep: float
    minutes: float
    km: float
    road_air: float          # minute-weighted roadside air along the way, µg/m³ (median field)
    pieces: dosing.Pieces
    path: list

    @property
    def arr(self):
        return self.dep + self.minutes * 60


def leg(ctx: Ctx, mode: str, edges, dep: float, o_ll, d_ll) -> Leg:
    m, g = MODES[mode], ctx.g
    rail = mode == "metro"
    start = dep + m.access_min * 60
    kmh = m.kmh * (g.speed_rel[edges] * congestion(ist_hour(start)) if m.motor and not rail else 1.0)
    mins = g.length[edges] / 1000 / kmh * 60
    mid = start + (np.cumsum(mins) - mins / 2) * 60
    inc = 1.0 if rail else g.inc[edges]
    p = dosing.Pieces()
    if m.access_min:
        p.add(ctx.h(dep + m.access_min * 30), o_ll[0], o_ll[1], m.access_min * ACCESS_VENT / 1000, "walk")
    p.add(ctx.h(mid), g.mid_lat[edges], g.mid_lon[edges], mins * m.vent / 1000 * m.f * inc, mode)
    air = ctx.air(mid, g.mid_lat[edges], g.mid_lon[edges]) * inc
    nodes = np.r_[g.u[edges[:1]], g.v[edges]]
    path = [list(o_ll)] + np.round(np.c_[g.lat[nodes], g.lon[nodes]], 5).tolist() + [list(d_ll)]
    return Leg(mode, edges, dep, float(m.access_min + mins.sum()), float(g.length[edges].sum() / 1000),
               float((air * mins).sum() / max(mins.sum(), 1e-9)), p, path)


def endpoints(ctx: Ctx, mode: str, o_ll, d_ll):
    """Snap both ends to the road graph for this mode; returns (o_node, d_node, worst snap distance m)."""
    motor = MODES[mode].motor
    (o, od), (d, dd) = ctx.g.snap(*o_ll, motor), ctx.g.snap(*d_ll, motor)
    if not np.isfinite(max(od, dd)):
        raise PlanError(400, "no_route", f"Sora has no {MODES[mode].label.lower()} network here.")
    if o == d:
        raise PlanError(400, "invalid", "Start and destination are the same place.")
    return o, d, max(od, dd)


def free_minutes(ctx: Ctx, mode: str):
    """Per-edge travel minutes outside rush hour (congestion scales every edge alike, so it doesn't change paths)."""
    m, g = MODES[mode], ctx.g
    return g.length / 1000 / (m.kmh * (g.speed_rel if m.motor and mode != "metro" else 1.0)) * 60


def fastest(ctx: Ctx, mode: str, o_ll, d_ll, dep: float) -> Leg:
    o, d, _ = endpoints(ctx, mode, o_ll, d_ll)
    p = ctx.g.route(o, d, free_minutes(ctx, mode), MODES[mode].motor)
    if p is None:
        raise PlanError(400, "no_route", f"No {MODES[mode].label.lower()} route connects these points.")
    return leg(ctx, mode, p, dep, o_ll, d_ll)


def candidates(ctx: Ctx, mode: str, o: int, d: int, dep: float) -> list[np.ndarray]:
    """Fastest, lowest-exposure and balanced paths on the median field at `dep` (deduplicated, fastest first)."""
    m, g = MODES[mode], ctx.g
    rail = mode == "metro"
    t_e = free_minutes(ctx, mode)
    fast = g.route(o, d, t_e, m.motor)
    if fast is None:
        return []
    x_e = t_e * ctx.air(np.full(len(t_e), dep), g.mid_lat, g.mid_lon) * (1.0 if rail else g.inc)
    low = g.route(o, d, x_e, m.motor)
    bal = g.route(o, d, t_e / t_e[fast].sum() + x_e / x_e[fast].sum(), m.motor)
    # penalty path (§23.3): main roads are fast, so the cheapest paths share one corridor; price that corridor up
    # so there is a genuinely different alternative to evaluate
    pen = x_e.copy()
    pen[fast[np.isin(g.highway[fast], list(MAIN_ROADS))]] *= 2
    alt = g.route(o, d, pen, m.motor)
    out, seen = [], set()
    for p in (fast, low, bal, alt):
        if p is not None and tuple(p) not in seen:
            seen.add(tuple(p))
            out.append(p)
    return out


def window_dose(ctx: Ctx, t: Leg, start: float, end: float, o_ll, d_ll, ob: str, db: str):
    """(S,) dose over [start, end]: indoors at the origin until departure, the trip, indoors at the destination."""
    v = VENT["rest"]  # activity before and after a trip is unknown; sitting is the common case
    p = (dosing.dwell(ctx.h(start), ctx.h(t.dep), o_ll[0], o_ll[1], BUILDING[ob], v, ob) + t.pieces
         + dosing.dwell(ctx.h(t.arr), ctx.h(end), d_ll[0], d_ll[1], BUILDING[db], v, db))
    return dosing.dose(ctx.ens, ctx.lats, ctx.lons, p)


def main_share(ctx: Ctx, t: Leg) -> float:
    L = ctx.g.length[t.edges]
    return float(L[np.isin(ctx.g.highway[t.edges], list(MAIN_ROADS))].sum() / L.sum())


def avoided_roads(ctx: Ctx, base: Leg, alt: Leg, k=2) -> list[str]:
    """Named main roads that carry the baseline but mostly not the alternative, longest first."""
    g = ctx.g

    def by_name(t):
        out = {}
        for e in t.edges:
            if g.name[e] and g.highway[e] in MAIN_ROADS:
                out[g.name[e]] = out.get(g.name[e], 0) + g.length[e]
        return out
    b, a = by_name(base), by_name(alt)
    return [n for n, L in sorted(b.items(), key=lambda x: -x[1]) if L > 500 and a.get(n, 0) < 0.3 * L][:k]


MODE_LINE = {
    "car_ac": "With the AC on recirculate, air inside the car is about half of roadside air.",
    "walk": "Walking means breathing harder, so when and where you walk matters more than for other modes.",
    "cycle": "Cycling means breathing hard, so when and where you ride matters more than for other modes.",
    "two_wheeler": "A two-wheeler gives no protection: you breathe roadside air, often inside the traffic plume.",
    "auto": "An auto gives no protection: you breathe roadside air, often inside the traffic plume.",
    "bus": "A bus gives little protection, and the wait at the stop is outdoors.",
    "metro": "Metro coaches keep air at about 40% of roadside levels; the walk to the station is outdoors.",
}


def caveats(ctx: Ctx, mode: str, snap_m: float) -> list[str]:
    out = []
    if not ctx.field["meta"]["n_reporting"]:
        out.append("No monitoring stations feed this forecast yet: it is the regional CAMS forecast, so street-level "
                   "differences come from fixed road-type factors, not measurements.")
    out.append("Travel times use typical speeds by road type and rush hour, not live traffic.")
    if mode == "metro":
        out.append("Metro is approximated along the road network rather than the real lines.")
    if snap_m > SNAP_WARN_M:
        out.append(f"The start or destination is about {round(snap_m, -1):.0f} m from the nearest road Sora knows; "
                   "that walk isn't counted.")
    return out


def plan(req) -> dict:
    ctx = Ctx(req.city)
    o_ll, d_ll = tuple(req.origin), tuple(req.dest)
    ctx.check_inside(o_ll, "Start")
    ctx.check_inside(d_ll, "Destination")
    dep0, early, late = (x.timestamp() for x in (req.planned_departure, req.earliest, req.latest_departure))
    if not early <= dep0 <= late:
        raise PlanError(400, "invalid", "The planned departure must be inside the departure window.")
    ctx.check_horizon(early, late)
    o, d, snap_m = endpoints(ctx, req.mode, o_ll, d_ll)
    paths = candidates(ctx, req.mode, o, d, dep0)
    if not paths:
        raise PlanError(400, "no_route", f"No {MODES[req.mode].label.lower()} route connects these points.")

    deps = np.unique(np.r_[np.arange(early, late + 1, STEP_S), dep0])
    trips = [(pi, leg(ctx, req.mode, p, float(t), o_ll, d_ll)) for pi, p in enumerate(paths) for t in deps]
    trips = [(pi, t) for pi, t in trips if ctx.h(t.arr) <= ctx.T - 1]
    base = next((t for pi, t in trips if pi == 0 and t.dep == dep0), None)
    if base is None:
        raise PlanError(400, "beyond_horizon", "This trip would end after the 72-hour forecast.")
    end = max(t.arr for _, t in trips)
    doses = [window_dose(ctx, t, early, end, o_ll, d_ll, req.origin_building, req.dest_building) for _, t in trips]
    d_base = window_dose(ctx, base, early, end, o_ll, d_ll, req.origin_building, req.dest_building)

    la = req.latest_arrival.timestamp() if req.latest_arrival else None
    extra = [t.minutes - base.minutes for _, t in trips]
    ok = [i for i, (_, t) in enumerate(trips) if extra[i] <= req.max_extra_min + 1e-6 and (la is None or t.arr <= la)]
    if not ok:
        fastest = round(min(t.minutes for _, t in trips))
        raise PlanError(400, "no_feasible", f"No departure in your window arrives by {hhmm(la)}. "
                                            f"The fastest option takes about {fastest} min.", fastest_min=fastest)

    med = [float(np.median(x)) for x in doses]
    b_med, half = float(np.median(d_base)), max(1.0, (late - early) / 2 / 60)
    # knee point with unknown weights (§31.1). The user's window and detour budget already say what is acceptable,
    # so the time terms only break near-ties: using the whole budget must save > 10%, moving across half the window > 5%
    score = lambda i: med[i] / b_med + 0.1 * max(0, extra[i]) / max(1, req.max_extra_min) + 0.05 * abs(trips[i][1].dep - dep0) / 60 / half
    A = min(ok, key=lambda i: med[i])
    B = min(ok, key=score)
    C = min(ok, key=lambda i: (round(trips[i][1].minutes), abs(trips[i][1].dep - dep0), med[i]))

    def option(i, oid, label):
        t, x = (base, d_base) if i is None else (trips[i][1], doses[i])
        red, pb = confidence.reduction(x, d_base) if i is not None else ({"median": 0, "p05": 0, "p95": 0}, None)
        return {"id": oid, "label": label, "departure": iso(t.dep), "travel_min": round(t.minutes),
                "distance_km": round(t.km, 1), "dose": confidence.band(x), "reduction_pct": red, "p_better": pb,
                "extra_min": round(t.minutes - base.minutes), "path": t.path}

    opts = [option(A, "A", "Lowest exposure"), option(B, "B", "Balanced"), option(C, "C", "Fastest")]
    rec = opts[1]
    is_reliable = confidence.reliable(rec["reduction_pct"], rec["p_better"])
    tb = trips[B][1]
    lines = []
    if is_reliable:
        if tb.dep != base.dep and tb.road_air < base.road_air:
            lines.append(f"Leaving at {hhmm(tb.dep)} instead of {hhmm(base.dep)}: air along the way is forecast at about "
                         f"{tb.road_air:.0f} µg/m³ then, against {base.road_air:.0f} µg/m³.")
        if tb.dep != base.dep and tb.minutes < base.minutes - 2:
            lines.append(f"Leaving at {hhmm(tb.dep)} misses the rush: about {tb.minutes:.0f} min on the road instead of "
                         f"{base.minutes:.0f}, so less time breathing traffic air.")
        if not np.array_equal(tb.edges, base.edges):
            names = avoided_roads(ctx, base, tb)
            lines.append(f"This route keeps {main_share(ctx, tb):.0%} of the distance on main roads, against "
                         f"{main_share(ctx, base):.0%} on the fastest route" + (f" (less of {' and '.join(names)})." if names else "."))
    else:
        lines.append("The options are not reliably different today: the differences are smaller than the forecast "
                     "uncertainty. Take the one you prefer.")
    lines.append(MODE_LINE[req.mode])
    return {
        "baseline": option(None, "plan", "Your plan"), "options": opts, "recommended": "B", "reliable": is_reliable,
        "explanation": lines, "caveats": caveats(ctx, req.mode, snap_m),
        "degradation": ctx.field["meta"]["degradation"], "window": {"start": iso(early), "end": iso(end)},
    }
