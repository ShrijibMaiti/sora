"""Synthetic, deterministic data: no network. Used by the tests and by `SORA_FAKE_DATA=1` (browser tests in CI).

The forecast is a smooth diurnal PM2.5 cycle; each city's routable area is a ~1 km street grid where every 4th row and
column is a main road ("Ring Road"); place search knows the featured places and a few synthetic ones.
"""
import json
import os
import tempfile
from pathlib import Path

import networkx as nx
import numpy as np
import pandas as pd

from . import config
from .data import openmeteo, osm
from .representation import road_graph

N = config.GRID_N ** 2


def fake_points(blh=None, rain=None, wind_from=270.0, pm=None, gases=None):
    """Open-Meteo stand-in. `pm(hours_since_day0) -> (T,)` overrides the default diurnal PM2.5 cycle;
    `gases` adds other CAMS variables as constants, e.g. {"carbon_monoxide": 1200.0} (NaN = no data)."""
    def fetch(lats, lons, past_days, forecast_days):
        day0 = pd.Timestamp.now(tz="UTC").floor("D")
        times = pd.date_range(day0, periods=24 * forecast_days, freq="h")
        T = len(times)
        h = np.arange(T, dtype=float)
        base = pm(h) if pm else 80 + 40 * np.sin(h / 24 * 2 * np.pi)
        p = np.asarray(base, float)[:, None] + np.linspace(0, 20, N)[None, :]
        p[-1, 0] = np.nan  # CAMS tail gap
        col = lambda v: np.repeat(np.asarray(v, float).reshape(-1, 1) if np.ndim(v) else np.full((T, 1), v), N, 1)
        return times, {
            **{v: col(x) for v, x in (gases or {}).items()},
            "pm2_5": p, "wind_speed_10m": col(2.0), "wind_direction_10m": col(wind_from),
            "boundary_layer_height": col(blh if blh is not None else 800.0),
            "precipitation": col(rain if rain is not None else 0.0),
            "temperature_2m": col(20.0), "relative_humidity_2m": col(50.0),
        }
    return fetch


def street_grid(key: str = "delhi") -> road_graph.RoadGraph:
    s, w, n, e = config.CITIES[key].route_bbox
    lats, lons = np.arange(s, n + 1e-9, 0.01), np.arange(w, e + 1e-9, 0.01)
    G = nx.DiGraph()
    for i, la in enumerate(lats):
        for j, lo in enumerate(lons):
            G.add_node((i, j), lat=float(la), lon=float(lo))
    for i in range(len(lats)):
        for j in range(len(lons)):
            for di, dj in ((0, 1), (1, 0)):
                a, b = (i, j), (i + di, j + dj)
                if b not in G:
                    continue
                main = (i % 4 == 0) if di == 0 else (j % 4 == 0)
                hw, name = ("primary", "Ring Road") if main else ("residential", "")
                d = float(np.hypot((lats[b[0]] - lats[i]) * 110.57e3, (lons[b[1]] - lons[j]) * 97.9e3))
                for x, y in ((a, b), (b, a)):
                    G.add_edge(x, y, length=d, highway=hw, name=name, walk_ok=True, motor_ok=True)
    return road_graph.RoadGraph(G)


OSM_PLACES = {"elements": [  # Delhi; the tests rely on exactly these
    {"type": "node", "id": 1, "lat": 28.555, "lon": 77.200, "tags": {"place": "neighbourhood", "name": "Hauz Khas"}},
    {"type": "node", "id": 2, "lat": 28.556, "lon": 77.201, "tags": {"leisure": "fitness_centre", "name": "Gold's Gym"}},
    {"type": "way", "id": 3, "center": {"lat": 28.600, "lon": 77.228}, "tags": {"amenity": "marketplace", "name": "Khan Market Stalls"}},
    {"type": "node", "id": 4, "lat": 28.70, "lon": 77.20, "tags": {"amenity": "cafe", "name": "Outside Café"}},  # beyond route_bbox
    {"type": "node", "id": 5, "lat": 28.57, "lon": 77.21, "tags": {"amenity": "cafe"}},  # no name
]}


def osm_places(bbox) -> dict:
    """Overpass-shaped answer for a city's routable area: Delhi's fixture, else its featured places as neighbourhoods."""
    key = next(k for k, c in config.CITIES.items() if tuple(c.route_bbox) == tuple(bbox))
    if key == "delhi":
        return OSM_PLACES
    return {"elements": [{"type": "node", "id": i, "lat": p["lat"], "lon": p["lon"], "tags": {"place": "neighbourhood", "name": p["name"]}}
                         for i, p in enumerate(config.PLACES.get(key, []), 1)]}


def write_places(bbox, path: Path):
    path.write_text(json.dumps(osm_places(bbox)), encoding="utf-8")


def install():
    """Swap every network source for synthetic data, with a scratch cache folder (never the real data_cache)."""
    grids: dict[str, road_graph.RoadGraph] = {}
    config.CACHE = Path(tempfile.gettempdir()) / "sora_fake_cache"
    openmeteo.fetch_points = fake_points()
    road_graph.get = lambda key: grids.setdefault(key, street_grid(key))
    osm.fetch_places = write_places
    for k in ("OPENAQ_API_KEY", "FIRMS_MAP_KEY"):
        os.environ.pop(k, None)
