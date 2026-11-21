"""Road network from OpenStreetMap via Overpass (spec §11.6, §13.3)."""
import json

import httpx
import networkx as nx

from ..geo import haversine_m

URL = "https://overpass-api.de/api/interpreter"
HIGHWAY_RE = "^((motorway|trunk|primary|secondary|tertiary)(_link)?|unclassified|residential|living_street|pedestrian)$"


def fetch(bbox, path):
    s, w, n, e = bbox
    q = f'[out:json][timeout:180];way["highway"~"{HIGHWAY_RE}"]({s},{w},{n},{e});out geom;'
    r = httpx.post(URL, data={"data": q}, headers={"User-Agent": "sora-research/0.1"}, timeout=240)
    r.raise_for_status()
    path.write_bytes(r.content)


def load_graph(path):
    """Directed graph; every street has both directions, with motor_ok False against a one-way."""
    G = nx.DiGraph()
    for way in json.loads(path.read_text(encoding="utf-8"))["elements"]:
        nodes, geom, tags = way.get("nodes", []), way.get("geometry", []), way["tags"]
        if len(nodes) != len(geom):
            continue
        hw = tags["highway"].removesuffix("_link")
        oneway = tags.get("oneway", "no")
        attrs = dict(highway=hw, name=tags.get("name", ""), walk_ok=hw != "motorway")
        for (a, pa), (b, pb) in zip(zip(nodes, geom), zip(nodes[1:], geom[1:])):
            G.add_node(a, lat=pa["lat"], lon=pa["lon"])
            G.add_node(b, lat=pb["lat"], lon=pb["lon"])
            d = float(haversine_m(pa["lat"], pa["lon"], pb["lat"], pb["lon"]))
            motor = hw != "pedestrian"
            G.add_edge(a, b, length=d, motor_ok=motor and oneway != "-1", **attrs)
            G.add_edge(b, a, length=d, motor_ok=motor and oneway not in ("yes", "1", "true"), **attrs)
    keep = max(nx.weakly_connected_components(G), key=len)
    return G.subgraph(keep).copy()
