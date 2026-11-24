"""What-if on a planned trip (spec §26): change one thing, evaluate both plans on the same samples (paired)."""
from ..exposure.microenv import BUILDING, BUILDING_LABEL, MODES
from . import confidence
from .routing import Ctx, fastest, hhmm, window_dose


def counterfactual(p, change) -> dict:
    ctx = Ctx(p.city)
    o_ll, d_ll = tuple(p.origin), tuple(p.dest)
    ctx.check_inside(o_ll, "Start")
    ctx.check_inside(d_ll, "Destination")
    dep = p.planned_departure.timestamp()
    ctx.check_horizon(dep)
    base = fastest(ctx, p.mode, o_ll, d_ll, dep)
    mode, dest, db, adep = p.mode, d_ll, p.dest_building, dep
    if change.kind == "shift_departure":
        adep = dep + change.minutes * 60
    elif change.kind == "mode":
        mode = change.mode
    elif change.kind == "destination":
        dest, db = tuple(change.dest), change.dest_building or p.dest_building
        ctx.check_inside(dest, "The other destination")
    else:
        s, e = change.start.timestamp(), change.end.timestamp()
        if base.dep < e and base.arr > s:  # the trip runs through the peak: wait it out at the start
            adep = e
    ctx.check_horizon(adep)
    alt = fastest(ctx, mode, o_ll, dest, adep)
    # same window as /api/plan: earliest departure to the latest possible arrival, so time at the destination counts
    late = p.latest_departure.timestamp()
    start = min(p.earliest.timestamp(), base.dep, alt.dep)
    end = max(base.arr, alt.arr, late + max(base.minutes, alt.minutes) * 60)
    ctx.check_horizon(start, end)
    d0 = window_dose(ctx, base, start, end, o_ll, d_ll, p.origin_building, p.dest_building)
    d1 = window_dose(ctx, alt, start, end, o_ll, dest, p.origin_building, db)
    red, pb = confidence.reduction(d1, d0)
    delta = {"median": -red["median"], "p05": -red["p95"], "p95": -red["p05"]}  # negative = lower dose

    if change.kind == "shift_departure":
        reason = (f"Leaving at {hhmm(adep)} instead of {hhmm(dep)}: air along the way is forecast at about "
                  f"{alt.road_air:.0f} µg/m³ then, against {base.road_air:.0f} µg/m³.")
    elif change.kind == "mode":
        m0, m1 = MODES[p.mode], MODES[mode]
        reason = (f"By {m1.label.lower()} the trip takes about {alt.minutes:.0f} min breathing about {m1.f:.0%} of "
                  f"roadside air; by {m0.label.lower()}, {base.minutes:.0f} min at {m0.f:.0%}.")
    elif change.kind == "destination":
        reason = (f"Inside, the other place ({BUILDING_LABEL[db].lower()}) has about {BUILDING[db]:.0%} of outdoor air, "
                  f"against {BUILDING[p.dest_building]:.0%} where you were going; getting there takes "
                  f"{alt.minutes:.0f} min instead of {base.minutes:.0f}.")
    elif adep == dep:
        reason = (f"Your trip ({hhmm(base.dep)}–{hhmm(base.arr)}) already misses the {hhmm(s)}–{hhmm(e)} peak, "
                  "so staying in changes nothing.")
    else:
        reason = (f"Staying in until {hhmm(e)} moves the trip to when air along the way is forecast at about "
                  f"{alt.road_air:.0f} µg/m³, against {base.road_air:.0f} µg/m³ at {hhmm(dep)}. Meanwhile your "
                  f"{BUILDING_LABEL[p.origin_building].lower()} start building lets in about "
                  f"{BUILDING[p.origin_building]:.0%} of outdoor air.")
    return {"delta_pct": delta, "p_better": pb, "verdict": confidence.verdict(red, pb), "reason": reason}
