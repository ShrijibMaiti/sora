"""Shared fixtures: synthetic Open-Meteo data and a synthetic Delhi street grid, so no test touches the network."""
import networkx as nx
import numpy as np
import pandas as pd
import pytest

from sora import config
from sora.data import openmeteo
from sora.field import forecast
from sora.representation import road_graph
from sora.uncertainty import ensemble

N = config.GRID_N ** 2


def fake_points(blh=None, rain=None, wind_from=270.0, pm=None):
    """Open-Meteo stand-in. `pm(hours_since_day0) -> (T,)` overrides the default diurnal PM2.5 cycle."""
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
            "pm2_5": p, "wind_speed_10m": col(2.0), "wind_direction_10m": col(wind_from),
            "boundary_layer_height": col(blh if blh is not None else 800.0),
            "precipitation": col(rain if rain is not None else 0.0),
            "temperature_2m": col(20.0), "relative_humidity_2m": col(50.0),
        }
    return fetch


def street_grid():
    """~1 km grid over Delhi's route_bbox: every 4th row and column is a primary road ("Ring Road"), the rest residential."""
    s, w, n, e = config.CITIES["delhi"].route_bbox
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


GRID = street_grid()


@pytest.fixture(autouse=True)
def fresh(monkeypatch):
    forecast._cache.clear()
    ensemble._cache.clear()
    monkeypatch.setattr(openmeteo, "fetch_points", fake_points())
    monkeypatch.setattr(road_graph, "get", lambda key: GRID)
