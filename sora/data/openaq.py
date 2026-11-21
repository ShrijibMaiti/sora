"""Hourly PM2.5 at reference stations from OpenAQ v3, which mirrors CPCB CAAQMS (spec §11.1).

Needs a free API key in OPENAQ_API_KEY. Without it the pipeline degrades to CAMS only (spec §39, L3).
"""
import os
import time

import httpx
import pandas as pd

BASE = "https://api.openaq.org/v3"
PM25 = 2  # OpenAQ parameter id for pm25


def _get(client, path, params):
    for attempt in range(5):
        r = client.get(BASE + path, params=params)
        if r.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        r.raise_for_status()
        time.sleep(1.05)  # free tier: 60 requests/minute
        return r.json()
    r.raise_for_status()


def fetch_pm25(bbox, start, end, api_key=None):
    """DataFrame [station, lat, lon, time (UTC hour), value µg/m³], or None without a key/data."""
    key = api_key or os.environ.get("OPENAQ_API_KEY")
    if not key:
        return None
    s, w, n, e = bbox
    rows = []
    with httpx.Client(headers={"X-API-Key": key}, timeout=60) as c:
        locs = _get(c, "/locations", {"bbox": f"{w},{s},{e},{n}", "parameters_id": PM25, "limit": 1000})["results"]
        for loc in locs:
            # shortcut: reference monitors only; low-cost sensors need RH calibration first (spec §12.4, T1)
            if not loc.get("isMonitor"):
                continue
            lat, lon = loc["coordinates"]["latitude"], loc["coordinates"]["longitude"]
            for sensor in loc["sensors"]:
                if sensor["parameter"]["name"] != "pm25":
                    continue
                page = 1
                while True:
                    res = _get(c, f"/sensors/{sensor['id']}/hours", {
                        "datetime_from": start.isoformat(), "datetime_to": end.isoformat(),
                        "limit": 1000, "page": page})["results"]
                    rows += [(loc["id"], lat, lon, h["period"]["datetimeTo"]["utc"], h["value"]) for h in res]
                    if len(res) < 1000:
                        break
                    page += 1
    if not rows:
        return None
    df = pd.DataFrame(rows, columns=["station", "lat", "lon", "time", "value"])
    df["time"] = pd.to_datetime(df["time"], utc=True).dt.floor("h")
    return df
