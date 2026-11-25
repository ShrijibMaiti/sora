"""Metro network from OpenStreetMap route relations (spec §20, §23.6): stations, lines, rides and transfers.

Each relation is one direction of a line with its stops in order. Stops with the same name within STATION_M are one
station (interchanges included). Rides use a typical speed plus dwell; boarding waits half a headway; changing line
costs a walk within the station.
shortcut: typical speeds and headways, not the operator's timetable (GTFS) or live running.
"""
import json
import logging
import re
import threading
from dataclasses import dataclass

import networkx as nx
import numpy as np

from .. import config
from ..data import osm
from ..geo import haversine_m

log = logging.getLogger("sora.transit")
RAIL_KMH, DWELL_MIN = 33.0, 0.5
WAIT_MIN, TRANSFER_MIN = 4.0, 5.0
STATION_M = 800  # stops with one name closer than this are one station
INTERCHANGE_M = 200  # any two stops closer than this are one station (no line has stops this close)


@dataclass
class Ride:
    line: str        # "Yellow Line"
    colour: str
    stations: list   # station indices in riding order


def _norm(name: str) -> str:
    return re.sub(r"\b(metro station|metro|station)\b|[^0-9a-z]+", " ", name.lower()).strip()


def _line_name(tags: dict) -> str:
    name = tags.get("name:en") or tags.get("name") or tags.get("ref") or "Metro"
    return re.split(r"\s*[(:]", name)[0].strip() or name


class Transit:
    def __init__(self, data: dict):
        nodes = {x["id"]: x for x in data.get("elements", []) if x["type"] == "node"}
        rels = [x for x in data.get("elements", []) if x["type"] == "relation"]
        self.names, lat, lon, by_name = [], [], [], {}

        def station(node) -> int:
            t = node.get("tags", {})
            name = t.get("name:en") or t.get("name") or f"Stop {node['id']}"
            # interchanges are often mapped per line ("Hauz Khas (Yellow Line)", "Hauz Khas (Magenta Line)")
            name = re.sub(r"\s*\([^)]*\bline\b[^)]*\)", "", name, flags=re.I).strip() or name
            for i in by_name.get(_norm(name), []):
                if haversine_m(lat[i], lon[i], node["lat"], node["lon"]) < STATION_M:
                    return i
            if lat:  # interchanges named differently per line ("Central Metro" / "Puratchi Thalaivar … Central")
                d = haversine_m(node["lat"], node["lon"], np.array(lat), np.array(lon))
                if d.min() < INTERCHANGE_M:
                    return int(d.argmin())
            by_name.setdefault(_norm(name), []).append(len(self.names))
            self.names.append(name)
            lat.append(node["lat"])
            lon.append(node["lon"])
            return len(self.names) - 1

        self.G = nx.DiGraph()
        self.lines: dict[str, str] = {}  # line name → colour
        for rel in rels:
            line, colour = _line_name(rel.get("tags", {})), rel.get("tags", {}).get("colour", "")
            seq = [station(nodes[m["ref"]]) for m in rel.get("members", [])
                   if m["type"] == "node" and m["role"].startswith("stop") and m["ref"] in nodes]
            seq = [s for k, s in enumerate(seq) if k == 0 or s != seq[k - 1]]
            if len(seq) < 2:
                continue
            self.lines.setdefault(line, colour)
            for a, b in zip(seq, seq[1:]):
                d = float(haversine_m(lat[a], lon[a], lat[b], lon[b]))
                self.G.add_edge((a, line), (b, line), minutes=d / 1000 / RAIL_KMH * 60 + DWELL_MIN, line=line)
        self.lat, self.lon = np.array(lat), np.array(lon)
        on: dict[int, set] = {}
        for s, line in list(self.G.nodes):
            on.setdefault(s, set()).add(line)
        for s, ls in on.items():  # board (wait for a train), alight, change line inside the station
            for line in ls:
                self.G.add_edge(("in", s), (s, line), minutes=WAIT_MIN)
                self.G.add_edge((s, line), ("out", s), minutes=0.0)
                for other in ls - {line}:
                    self.G.add_edge((s, line), (s, other), minutes=TRANSFER_MIN + WAIT_MIN)
        self.served = np.array(sorted(on), int)

    def nearest(self, lat: float, lon: float, k: int = 3, max_m: float = 2500) -> list[tuple[int, float]]:
        if not len(self.served):
            return []
        d = haversine_m(lat, lon, self.lat[self.served], self.lon[self.served])
        order = np.argsort(d)[:k]
        return [(int(self.served[i]), float(d[i])) for i in order if d[i] <= max_m]

    def ride(self, a: int, b: int) -> tuple[float, list[Ride]] | None:
        """Minutes from walking into station a to stepping off at b (wait, rides, changes), and the rides."""
        try:
            path = nx.shortest_path(self.G, ("in", a), ("out", b), weight="minutes")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None
        minutes = sum(self.G.edges[u, v]["minutes"] for u, v in zip(path, path[1:]))
        rides: list[Ride] = []
        for s, line in path[1:-1]:
            if rides and rides[-1].line == line:
                rides[-1].stations.append(s)
            else:
                rides.append(Ride(line, self.lines.get(line, ""), [s]))
        return minutes, [r for r in rides if len(r.stations) > 1]


_nets: dict[str, Transit] = {}
_lock = threading.Lock()


def get(key: str) -> Transit:
    """The city's metro network, downloaded once from Overpass and cached on disk."""
    with _lock:
        if key not in _nets:
            path = config.CACHE / f"transit_{key}.json"
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                osm.fetch_transit(config.CITIES[key].bbox, path)
            _nets[key] = Transit(json.loads(path.read_text(encoding="utf-8")))
            log.info("transit %s: %d stations on %d lines", key, len(_nets[key].served), len(_nets[key].lines))
        return _nets[key]
