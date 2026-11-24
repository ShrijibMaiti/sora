"""Whole-day schedule optimization (spec §25): POST /api/day.

The day runs 07:00–23:00 IST through the stops in order. Decisions: which listed alternative place to use and
±15/30 min shifts of each departure, within the extra-travel budget and the stops' time windows.
shortcut: coordinate descent over those choices (the same search as the web mock), not DP / CP-SAT over
discretized time (§25.3); legs use the fastest path at free-flow speed, timed with the rush-hour factor.
"""
import re
from dataclasses import dataclass, field

import numpy as np

from ..exposure import dose as dosing
from ..exposure.microenv import BUILDING_LABEL, MODES, VENT
from . import confidence, risk
from .routing import Ctx, PlanError, endpoints, free_minutes, iso, leg

DAY_START, DAY_END = 7 * 60, 23 * 60  # minutes after IST midnight
IST_S = 5.5 * 3600
ICON = {"home": "house", "work": "graduation-cap", "gym": "dumbbell", "restaurant": "utensils",
        "road": "footprints", "vehicle": "car", "metro": "train-front"}


def me_of(name: str) -> str:
    return ("home" if re.search("home", name, re.I) else "gym" if re.search("gym", name, re.I)
            else "restaurant" if re.search("restaurant|dinner|lunch|cafe", name, re.I) else "work")


def hhmm(m: float) -> str:
    m = int(round(m)) % 1440
    return f"{m // 60:02d}:{m % 60:02d}"


def dur(m: float) -> str:
    m = int(round(m))
    return f"{m // 60} h{f' {m % 60} min' if m % 60 else ''}" if m >= 60 else f"{m} min"


def day_start_ts(req, ctx: Ctx) -> float:
    """IST midnight of the planned day: the day of the first time given in the stops, else the forecast's first
    day, or the next one if its 07:00 has already passed (the same rule the web app uses)."""
    times = [t for s in req.stops for t in (s.arrive_after, s.leave_before) if t]
    ref = min(times).timestamp() if times else ctx.t0
    day0 = (ref + IST_S) // 86400 * 86400 - IST_S
    if not times and ctx.t0 > day0 + DAY_START * 60:
        day0 += 86400
    return day0


@dataclass
class Sim:
    segs: list = field(default_factory=list)   # (me, a_min, b_min, dose samples, label)
    total: np.ndarray = None
    travel: float = 0
    ok: bool = True
    ends: list = field(default_factory=list)

    @property
    def score(self):
        return risk.risk(self.total)  # risk-aware dose, the default criterion (spec §31.2)


class Day:
    def __init__(self, req):
        self.req, self.ctx = req, Ctx(req.city)
        self.mode = MODES[req.mode]
        self.day0 = day_start_ts(req, self.ctx)
        self.ctx.check_horizon(self.ts(DAY_START), self.ts(DAY_END))
        for s in req.stops:
            for p in [s.place, *(s.alternatives or [])]:
                self.ctx.check_inside((p.lat, p.lon), f"{s.name} ({p.label})")
        self._paths = {}

    def ts(self, m):
        return self.day0 + m * 60

    def at(self, t):
        return None if t is None else (t.timestamp() - self.day0) / 60

    def place(self, i, choice):
        s = self.req.stops[i]
        alt = s.alternatives[0] if choice[i] and s.alternatives else None
        return (alt or s.place), (alt.building if alt and alt.building else s.building)

    def path(self, a, b):
        key = (a.lat, a.lon, b.lat, b.lon)
        if key not in self._paths:
            o, d, _ = endpoints(self.ctx, self.req.mode, (a.lat, a.lon), (b.lat, b.lon))
            p = self.ctx.g.route(o, d, free_minutes(self.ctx, self.req.mode), self.mode.motor)
            if p is None:
                raise PlanError(400, "no_route", f"No {self.mode.label.lower()} route from {a.label} to {b.label}.")
            self._paths[key] = p
        return self._paths[key]

    def dwell(self, i, choice, a, b):
        p, bld = self.place(i, choice)
        vent = VENT[self.req.stops[i].activity or "light"]
        pieces = dosing.dwell(self.ctx.h(self.ts(a)), self.ctx.h(self.ts(b)), p.lat, p.lon, bld, vent)
        return dosing.dose(self.ctx.ens, self.ctx.lats, self.ctx.lons, pieces)

    def simulate(self, choice, shift) -> Sim:
        stops, n, r = self.req.stops, len(self.req.stops), Sim()
        t = DAY_START
        for i, s in enumerate(stops):
            last, start, before = i == n - 1, t, self.at(s.leave_before)
            end = DAY_END if last else ((before if before is not None else 8 * 60 + 20) + shift[i] if i == 0
                                        else t + (s.duration_min or 60) + shift[i])
            if last:
                r.segs.append((me_of(s.name), start, max(start, end), self.dwell(i, choice, start, max(start, end)), None))
                r.ends.append(end)
                break
            here, _ = self.place(i, choice)
            there, _ = self.place(i + 1, choice)
            lg = leg(self.ctx, self.req.mode, self.path(here, there), self.ts(end), (here.lat, here.lon), (there.lat, there.lon))
            after = self.at(stops[i + 1].arrive_after)
            if after is not None and end + lg.minutes < after:  # wait here rather than arrive early
                end = after - lg.minutes
                lg = leg(self.ctx, self.req.mode, lg.edges, self.ts(end), (here.lat, here.lon), (there.lat, there.lon))
            if (before is not None and end > before and i > 0) or (end - start < 15 and i > 0):
                r.ok = False
            label = self.place(i, choice)[0].label if choice[i] else None
            r.segs.append((me_of(s.name), start, end, self.dwell(i, choice, start, end), label))
            r.segs.append((self.mode.me, end, end + lg.minutes, dosing.dose(self.ctx.ens, self.ctx.lats, self.ctx.lons, lg.pieces), self.mode.label))
            r.travel += lg.minutes
            r.ends.append(end)
            t = end + lg.minutes
        if t > DAY_END:
            r.ok = False
        r.total = sum(sg[3] for sg in r.segs)
        return r


def day(req) -> dict:
    n = len(req.stops)
    if n < 2:
        raise PlanError(400, "invalid", "A day needs at least two stops.")
    D = Day(req)
    zero = [0] * n
    base = D.simulate(zero, zero)
    if not base.ok:
        raise PlanError(400, "no_feasible", "The stops do not fit their time windows. Shorten a stay or widen a window.")

    choice, shift, best = list(zero), list(zero), base
    min_gain = 0.01 * base.score  # don't ask people to change their day for less than 1% of its dose

    def better(c, s):
        nonlocal choice, shift, best
        r = D.simulate(c, s)
        if r.ok and r.travel - base.travel <= req.max_extra_min and r.score < best.score - min_gain:
            best, choice, shift = r, c, s

    for _ in range(2):
        for i, s in enumerate(req.stops):
            if s.alternatives:
                better([1 - v if j == i else v for j, v in enumerate(choice)], shift)
        for i in range(n - 1):
            for dlt in (-30, -15, 15, 30):
                if abs(shift[i] + dlt) <= 30:
                    better(choice, [v + dlt if j == i else v for j, v in enumerate(shift)])

    med = lambda x: float(np.median(x))
    changes = []
    for i, s in enumerate(req.stops):
        if choice[i]:
            r = D.simulate([0 if j == i else v for j, v in enumerate(choice)], shift)
            alt = s.alternatives[0]
            bld = alt.building or s.building
            changes.append({"icon": ICON[me_of(s.name)], "title": f"Use {alt.label} instead of {s.place.label}",
                            "detail": f"{BUILDING_LABEL[bld]}{'; you breathe hardest during this stop.' if s.activity == 'high' else '.'}",
                            "delta_ug": round(med(best.total) - med(r.total))})
        moved = round(best.ends[i] - base.ends[i]) if i < len(best.ends) else 0
        if shift[i] and abs(moved) >= 5 and np.sign(moved) == np.sign(shift[i]) and i < n - 1:
            r = D.simulate(choice, [0 if j == i else v for j, v in enumerate(shift)])
            who = "home" if s.name.strip().lower() == "home" else s.name
            changes.append({"icon": "clock", "title": f"Leave {who} {abs(moved)} min {'later' if moved > 0 else 'earlier'}",
                            "detail": f"{hhmm(base.ends[i])} → {hhmm(best.ends[i])} IST.",
                            "delta_ug": round(med(best.total) - med(r.total))})

    red, pb = confidence.reduction(best.total, base.total)
    segs = lambda sim: [{"me": me, "start": iso(D.ts(a)), "end": iso(D.ts(b)), "dose": round(med(x)), **({"label": lb} if lb else {})}
                        for me, a, b, x, lb in sim.segs]
    rows = []
    for i, s in enumerate(req.stops):
        a = DAY_START if i == 0 else base.segs[2 * i - 1][2]
        b = base.ends[i]
        alt = s.alternatives[0] if s.alternatives else None
        rows.append({"name": s.name, "place": s.place.label, "chosen": alt.label if choice[i] and alt else s.place.label,
                     "icon": ICON[me_of(s.name)],
                     "window": f"until {hhmm(b)}" if i == 0 else f"from {hhmm(a)}" if i == n - 1 else f"{hhmm(a)} – {hhmm(b)}",
                     "duration": "" if i in (0, n - 1) else dur(b - a),
                     "building": BUILDING_LABEL[s.building] + (f" · or {alt.label}" if alt else "")})
    return {
        "stops": rows,
        "original": {"segments": segs(base), "total": confidence.band(base.total)},
        "optimized": {"segments": segs(best), "total": confidence.band(best.total)},
        "changes": sorted([c for c in changes if c["delta_ug"] < 0], key=lambda c: c["delta_ug"]),
        "reduction_pct": red, "p_better": pb, "extra_min": max(0, round(best.travel - base.travel)),
    }
