"""CAMS PM2.5 background and ERA5/IFS meteorology from Open-Meteo (spec §11.2, §11.4).

shortcut: Open-Meteo serves CAMS global (~0.4°) over India, so the background is smooth at city scale;
upgrade to CAMS ADS / own WRF-Chem fields in T1 (spec §17.4).
"""
import httpx
import numpy as np
import pandas as pd

AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
MET_URL = "https://api.open-meteo.com/v1/forecast"
MET_VARS = ["wind_speed_10m", "wind_direction_10m", "boundary_layer_height",
            "temperature_2m", "relative_humidity_2m", "precipitation"]
AQ_VARS = ["pm2_5", "pm10", "nitrogen_dioxide", "ozone", "sulphur_dioxide", "carbon_monoxide"]  # all µg/m³
CHUNK = 50


def _fetch(url, lats, lons, variables, past_days, forecast_days):
    out = []
    for i in range(0, len(lats), CHUNK):
        params = {
            "latitude": ",".join(f"{x:.4f}" for x in lats[i:i + CHUNK]),
            "longitude": ",".join(f"{x:.4f}" for x in lons[i:i + CHUNK]),
            "hourly": ",".join(variables), "past_days": past_days, "forecast_days": forecast_days,
            "timezone": "GMT", "wind_speed_unit": "ms",
        }
        r = httpx.get(url, params=params, timeout=120)
        r.raise_for_status()
        js = r.json()
        out += js if isinstance(js, list) else [js]
    return out


def fetch_points(lats, lons, past_days, forecast_days):
    """Hourly UTC times and {variable: array (T, n_points)} for AQ_VARS and MET_VARS."""
    aq = _fetch(AQ_URL, lats, lons, AQ_VARS, past_days, forecast_days)
    met = _fetch(MET_URL, lats, lons, MET_VARS, past_days, forecast_days)
    times = pd.to_datetime(aq[0]["hourly"]["time"], utc=True)
    data = {v: np.array([p["hourly"][v] for p in aq], float).T for v in AQ_VARS if v in aq[0]["hourly"]}
    met_times = pd.to_datetime(met[0]["hourly"]["time"], utc=True)
    for v in MET_VARS:
        arr = np.array([p["hourly"][v] for p in met], float).T
        data[v] = pd.DataFrame(arr, index=met_times).reindex(times).to_numpy()
    return times, data
