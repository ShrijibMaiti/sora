"""Template explanations for trip advice (spec §28–29, T0): every sentence is built from numbers the planner computed.

Inputs are plain values (times already formatted as IST "HH:MM"), so the templates can be read and tested on their own.
"""
MODE_LINE = {
    "car_ac": "With the AC on recirculate, air inside the car is about {cabin:.0%} of roadside air.",
    "walk": "Walking means breathing harder, so when and where you walk matters more than for other modes.",
    "cycle": "Cycling means breathing hard, so when and where you ride matters more than for other modes.",
    "two_wheeler": "A two-wheeler gives no protection: you breathe roadside air, often inside the traffic plume.",
    "auto": "An auto gives no protection: you breathe roadside air, often inside the traffic plume.",
    "bus": "A bus gives little protection, and the wait at the stop is outdoors.",
    "metro": "Metro coaches keep air at about {cabin:.0%} of roadside levels; the walk to and from stations is outdoors.",
}
NOT_RELIABLE = ("The options are not reliably different today: the differences are smaller than the forecast "
                "uncertainty. Take the one you prefer.")


def plan_lines(*, reliable: bool, mode: str, dep: str, base_dep: str, air: float, base_air: float, minutes: float,
               base_minutes: float, route_changed: bool, main_share: float, base_main_share: float, avoided: list[str],
               top_road: dict | None, robustness: dict | None, arrive_by: str | None, cabin: float = 0.5) -> list[str]:
    """Why the recommended option beats the plan, most important first; the mode's protection last."""
    if not reliable:
        return [NOT_RELIABLE, MODE_LINE[mode].format(cabin=cabin)]
    lines = []
    if dep != base_dep and air < base_air:
        lines.append(f"Leaving at {dep} instead of {base_dep}: air along the way is forecast at about {air:.0f} µg/m³ "
                     f"then, against {base_air:.0f} µg/m³.")
    if dep != base_dep and minutes < base_minutes - 2:
        lines.append(f"Leaving at {dep} misses the rush: about {minutes:.0f} min on the road instead of "
                     f"{base_minutes:.0f}, so less time breathing traffic air.")
    if route_changed:
        lines.append(f"This route keeps {main_share:.0%} of the distance on main roads, against {base_main_share:.0%} "
                     f"on the fastest route" + (f" (less of {' and '.join(avoided)})." if avoided else "."))
    if top_road:
        lines.append(f"On the way, {top_road['label']} contributes most: {top_road['minutes']} min and about "
                     f"{top_road['share']:.0%} of what you breathe outdoors on this trip.")
    if robustness:
        m = robustness["margin_pct"]
        worse = f"more than {m}% worse than forecast" if m < 100 else f"more than {1 + m / 100:.1f} times the forecast"
        lines.append(f"The advice holds unless the air along {robustness['where']} turns out {worse}" +
                     ("; no station measures it directly." if robustness["unmonitored"] else "."))
    if arrive_by:
        lines.append(f"You arrive by {arrive_by} on at least 9 trips in 10, given how much travel times vary.")
    lines.append(MODE_LINE[mode].format(cabin=cabin))
    return lines


def caveats(*, stations_reporting: int, mode: str, snap_m: float, snap_warn_m: float) -> list[str]:
    out = []
    if not stations_reporting:
        out.append("No monitoring stations feed this forecast yet: it is the regional CAMS forecast, so street-level "
                   "differences come from fixed road-type factors, not measurements.")
    out.append("Travel times use typical speeds by road type and rush hour, with a typical day-to-day spread; "
               "not live traffic.")
    if mode == "metro":
        out.append("Metro times use typical running speeds and a 4-minute wait for a train, not the live timetable.")
    if snap_m > snap_warn_m:
        out.append(f"The start or destination is about {round(snap_m, -1):.0f} m from the nearest road Sora knows; "
                   "that walk isn't counted.")
    return out
