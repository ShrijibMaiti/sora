"""Hourly cycle (spec §18.2): rebuild each live city's field just after the hour, so requests find it ready.

shortcut: ingest → forecast only (CAMS + stations + fires); QC, assimilation and samples join when the T0 field
model exists. One process; with several API workers each runs its own loop (fine at this size).
"""
import logging
import threading
import time

from . import config
from .field import forecast
from .representation import road_graph

log = logging.getLogger("sora.pipeline")
AFTER_HOUR_S = 5
RETRY_S = 300


def run_once() -> bool:
    """Refresh every live city; True when all fields are for the current hour."""
    ok = True
    for key, city in config.CITIES.items():
        if not city.built:
            continue
        try:
            forecast.get(key)
            road_graph.get(key)
        except Exception:  # keep the loop alive whatever happens; requests report errors themselves
            log.exception("refresh failed for %s", key)
        ok = ok and forecast.is_fresh(key)
    return ok


def loop(stop: threading.Event):
    while True:
        wait = 3600 - time.time() % 3600 + AFTER_HOUR_S if run_once() else RETRY_S
        if stop.wait(wait):
            return
