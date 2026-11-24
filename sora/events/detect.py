"""Forecast-driven episode alerts for /api/events (spec §30.3: forecast BLH/wind → stagnation, precipitation → washout).

shortcut: rules on the deterministic met forecast, with a lead-time prior as the probability; the
innovation-based detector and met-ensemble probabilities (spec §30.3, T1) replace this.
"""
import numpy as np

STAGNANT_BLH_M, STAGNANT_WIND_MS = 250, 1.5
RAIN_MM_H = 1.0


def _runs(mask, min_len):
    """(start, end_exclusive) of each run of True at least min_len long."""
    out, start = [], None
    for i, m in enumerate(list(mask) + [False]):
        if m and start is None:
            start = i
        elif not m and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def _merge(runs, gap):
    """Join runs separated by fewer than `gap` hours (stagnation recurs nightly; one alert, not one per night)."""
    out = []
    for a, b in runs:
        if out and a - out[-1][1] < gap:
            out[-1] = (out[-1][0], b)
        else:
            out.append((a, b))
    return out


def _prob(start_h):
    return 0.8 if start_h < 24 else 0.65 if start_h < 48 else 0.5


def from_forecast(met: dict) -> list[dict]:
    """Contract ApiEvent list from city-mean hourly met (keys as in field.forecast.build), soonest first."""
    times, blh, wind, rain = met["times"], met["boundary_layer_height"], met["wind_speed_10m"], met["precipitation"]
    end = lambda b: times[b] if b < len(times) else None  # still going at the end of the forecast
    events = []
    stagnant = (blh < STAGNANT_BLH_M) & (wind < STAGNANT_WIND_MS)
    for a, b in _merge(_runs(stagnant, 3), 12):
        depth = max(50, int(np.ceil(np.nanmedian(blh[a:b][stagnant[a:b]]) / 50) * 50))
        recurring = not stagnant[a:b].all()
        events.append({
            "kind": "inversion", "title": "Stagnant nights" if recurring else "Stagnant air near the ground",
            "body": f"Winds under {STAGNANT_WIND_MS:g} m/s and a mixing layer only about {depth} m deep keep traffic and "
                    f"burning emissions near the ground{', mostly from evening to morning' if recurring else ''}.",
            "start": times[a], "end": end(b), "severity": "warning", "probability": _prob(a),
        })
    for a, b in _runs(rain >= RAIN_MM_H, 2):
        events.append({
            "kind": "rain", "title": "Rain washout",
            "body": f"About {np.nansum(rain[a:b]):.0f} mm of rain is forecast; rain usually lowers PM2.5 for a few hours.",
            "start": times[a], "end": end(b), "severity": "success", "probability": _prob(a),
        })
    return sorted(events, key=lambda e: e["start"])
