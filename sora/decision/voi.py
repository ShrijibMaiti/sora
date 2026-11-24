"""Robustness margin for a recommendation (spec §31.5 item 3, §31.6): how much worse than forecast the air along the
recommended route would have to be for it to stop beating the plan, and where on the route that matters most.

shortcut: one uniform perturbation of the recommended trip's outdoor air (the dominant uncertainty while the field is
CAMS-only), not the per-region Sobol sensitivities of §19.5.
"""


def robustness(base_total: float, alt_total: float, alt_segments: list[dict], coverage_along: float) -> dict | None:
    """{margin_pct, where, unmonitored} or None when the alternative isn't better or has no outdoor part."""
    outdoor = [s for s in alt_segments if s["kind"] in ("road", "access")]
    exposed = sum(s["dose"] for s in outdoor)
    gap = base_total - alt_total
    if gap <= 0 or exposed <= 0:
        return None
    top = max(outdoor, key=lambda s: s["dose"])
    named = top["kind"] == "road" and top["label"] not in ("local streets", "other streets")
    where = top["label"] if named else "this route"
    return {"margin_pct": round(100 * gap / exposed), "where": where, "unmonitored": coverage_along < 0.3}
