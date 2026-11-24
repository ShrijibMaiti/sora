"""Paired confidence on common random numbers (spec §31.5, ADR-011) and the "not reliably different" rule (§31.7)."""
import numpy as np

C_MIN = 0.7


def band(x) -> dict:
    """Median and 90% interval, rounded to whole units."""
    return {"median": round(float(np.median(x))), "p05": round(float(np.percentile(x, 5))), "p95": round(float(np.percentile(x, 95)))}


def reduction(d_alt, d_base) -> tuple[dict, float]:
    """Reduction in % vs the baseline (positive = lower dose) and P(alt < baseline), both on the same samples."""
    return band(100 * (1 - d_alt / d_base)), round(float(np.mean(d_alt < d_base)), 2)


def reliable(red: dict, p_better: float) -> bool:
    return p_better >= C_MIN and red["p05"] > 0


def verdict(red: dict, p_better: float) -> str:
    """"Likely helps" needs the same evidence as a recommendation (§31.7): P ≥ 0.7 and an interval clear of zero."""
    if reliable(red, p_better):
        return "Likely helps"
    return "Probably not" if p_better <= 1 - C_MIN else "Not reliably different"
