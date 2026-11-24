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


PLACE_QUERY = """[out:json][timeout:180];
(
  node["place"~"^(suburb|neighbourhood|quarter|locality|village|hamlet)$"]["name"]({b});
  nwr["amenity"~"^(college|university|school|hospital|clinic|restaurant|cafe|fast_food|marketplace|library|cinema|bus_station)$"]["name"]({b});
  nwr["leisure"~"^(fitness_centre|sports_centre|park|stadium)$"]["name"]({b});
  nwr["shop"="mall"]["name"]({b});
  nwr["railway"="station"]["name"]({b});
  nwr["tourism"~"^(attraction|museum|hotel)$"]["name"]({b});
);
out center tags;"""
PLACE_KINDS = ("place", "railway", "amenity", "leisure", "shop", "tourism")


def fetch_places(bbox, path):
    """Named neighbourhoods, landmarks and everyday destinations (search, spec §7.2)."""
    s, w, n, e = bbox
    r = httpx.post(URL, data={"data": PLACE_QUERY.format(b=f"{s},{w},{n},{e}")}, headers={"User-Agent": "sora-research/0.1"}, timeout=240)
    r.raise_for_status()
    path.write_bytes(r.content)


def load_places(path):
    """[{id, name, kind, value, lat, lon}] from a fetch_places file; English names where OSM has them."""
    out = []
    for el in json.loads(path.read_text(encoding="utf-8"))["elements"]:
        tags = el.get("tags", {})
        name = tags.get("name:en") or tags.get("name")
        pos = el if "lat" in el else el.get("center")
        kind = next((k for k in PLACE_KINDS if k in tags), None)
        if name and pos and kind:
            out.append({"id": f"{el['type'][0]}{el['id']}", "name": name, "kind": kind, "value": tags[kind],
                        "lat": pos["lat"], "lon": pos["lon"]})
    return out


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
