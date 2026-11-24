"""Active fire detections from NASA FIRMS, VIIRS S-NPP near-real-time, last 24 h (spec §11.3).

Needs a free MAP_KEY in FIRMS_MAP_KEY (https://firms.modaps.eosdis.nasa.gov/api/map_key/); without it, no fires.
"""
import io
import os

import httpx
import pandas as pd

URL = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/VIIRS_SNPP_NRT/{w},{s},{e},{n}/1"
REGION_DEG = 2.5  # crop-residue smoke reaches Delhi from Punjab/Haryana, ~250 km upwind
MAX_FIRES = 300   # strongest first; enough for the map and the upwind test


def region(bbox):
    s, w, n, e = bbox
    return s - REGION_DEG, w - REGION_DEG, n + REGION_DEG, e + REGION_DEG


def fetch(bbox, api_key=None):
    """[[lat, lon], ...] of nominal/high-confidence detections in bbox, strongest first; None without a key."""
    key = api_key or os.environ.get("FIRMS_MAP_KEY")
    if not key:
        return None
    s, w, n, e = bbox
    r = httpx.get(URL.format(key=key, w=w, s=s, e=e, n=n), timeout=60)
    if r.is_error:  # not raise_for_status(): its message quotes the URL, which contains the key
        raise ValueError(f"FIRMS returned HTTP {r.status_code}")
    df = pd.read_csv(io.StringIO(r.text))
    if not {"latitude", "longitude"} <= set(df.columns):  # a bad key answers 200 with a plain-text message
        raise ValueError(f"FIRMS: unexpected response {r.text[:80]!r}")
    if "confidence" in df:
        df = df[df["confidence"].astype(str).str.lower() != "l"]
    if "frp" in df:
        df = df.sort_values("frp", ascending=False)
    return df[["latitude", "longitude"]].head(MAX_FIRES).round(3).values.tolist()
