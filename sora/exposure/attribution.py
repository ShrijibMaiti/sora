"""Where a plan's dose comes from (spec §22.4): indoor time at each end, waiting/walking outdoors, and each named road.

Computed on the median field with typical microenvironment factors, so the parts add up to the plan's typical dose.
"""
from collections import defaultdict

import numpy as np

from . import dose as dosing

LOCAL = "local streets"
TOP_ROADS = 4


def _median_ens(ctx):
    return {"C": ctx.med, "param": defaultdict(lambda: np.ones(1))}


def segments(ctx, t, start: float, end: float, o_ll, d_ll, ob: str, db: str, vent_lpm: float) -> list[dict]:
    """[{label, kind: indoor|access|road, minutes, dose}] for one plan over [start, end], largest dose first."""
    ens = _median_ens(ctx)
    total = lambda p: float(dosing.dose(ens, ctx.lats, ctx.lons, p)[0])
    rows = [
        {"label": "indoors before you leave", "kind": "indoor", "minutes": (t.dep - start) / 60,
         "dose": total(dosing.dwell(ctx.h(start), ctx.h(t.dep), o_ll[0], o_ll[1], ob, vent_lpm))},
        {"label": "indoors after you arrive", "kind": "indoor", "minutes": (end - t.arr) / 60,
         "dose": total(dosing.dwell(ctx.h(t.arr), ctx.h(end), d_ll[0], d_ll[1], db, vent_lpm))},
    ]
    if t.access_w:
        rows.append({"label": "walking and waiting outdoors", "kind": "access", "minutes": t.access_min,
                     "dose": float(ctx.air(t.dep + t.access_min * 30, o_ll[0], o_ll[1]) * t.access_w)})
    g = ctx.g
    per_edge = ctx.air(t.edge_mid, g.mid_lat[t.edges], g.mid_lon[t.edges]) * t.edge_w
    roads: dict[str, list[float]] = {}
    for name, d, m in zip(g.name[t.edges], per_edge, t.edge_mins):
        r = roads.setdefault(str(name) or LOCAL, [0.0, 0.0])
        r[0] += d
        r[1] += m
    named = sorted(((k, v) for k, v in roads.items() if k != LOCAL), key=lambda kv: -kv[1][0])
    other = [v for _, v in named[TOP_ROADS:]] + ([roads[LOCAL]] if LOCAL in roads else [])
    rows += [{"label": k, "kind": "road", "minutes": v[1], "dose": v[0]} for k, v in named[:TOP_ROADS]]
    if other:
        rows.append({"label": "other streets" if named[TOP_ROADS:] else LOCAL, "kind": "road", "minutes": sum(v[1] for v in other), "dose": sum(v[0] for v in other)})
    out = [{**r, "minutes": round(float(r["minutes"])), "dose": round(float(r["dose"]), 1)} for r in rows if r["dose"] >= 0.05]
    return sorted(out, key=lambda r: -r["dose"])
