"""Place search for the app (GET /api/search): featured places, OSM named places and street names inside route_bbox.

Everything is local: OSM names are fetched once per city with Overpass and cached; search never calls a third party.
"""
import logging
import re
import threading

import httpx
import numpy as np

from .. import config
from ..data import osm
from . import road_graph

log = logging.getLogger("sora.places")
LABEL = {
    "suburb": "Neighbourhood", "neighbourhood": "Neighbourhood", "quarter": "Neighbourhood", "locality": "Locality",
    "village": "Village", "hamlet": "Village", "college": "College", "university": "University", "school": "School",
    "hospital": "Hospital", "clinic": "Clinic", "restaurant": "Restaurant", "cafe": "Café", "fast_food": "Fast food",
    "marketplace": "Market", "library": "Library", "cinema": "Cinema", "bus_station": "Bus station",
    "fitness_centre": "Gym", "sports_centre": "Sports centre", "park": "Park", "stadium": "Stadium", "mall": "Mall",
    "station": "Station", "attraction": "Landmark", "museum": "Museum", "hotel": "Hotel",
}
RANK = {"featured": 0, "place": 1, "railway": 2, "street": 4}  # other OSM kinds: 3
STREET_TYPES = ["motorway", "trunk", "primary", "secondary", "tertiary"]
NEAR_DEG = 0.025  # ~2.5 km: a landmark's "area" is the nearest neighbourhood within this
FIELDS = ("key", "name", "sub", "lat", "lon", "building")

_index: dict[str, list[dict]] = {}
_lock = threading.Lock()


def norm(s: str) -> str:
    return re.sub(r"[^0-9a-z]+", " ", s.lower()).strip()


def featured(key: str) -> list[dict]:
    return [{f: p.get(f) for f in FIELDS} for p in config.PLACES.get(key, [])]


def _item(p, rank):
    n = norm(p["name"])
    return {**{f: p.get(f) for f in FIELDS}, "rank": rank, "norm": n, "words": n.split()}


def _build(key: str) -> list[dict]:
    city = config.CITIES[key]
    s, w, n, e = city.route_bbox
    path = config.CACHE / f"places_{key}.json"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        osm.fetch_places(city.route_bbox, path)
    raw = [p for p in osm.load_places(path) if s <= p["lat"] <= n and w <= p["lon"] <= e]
    hoods = [p for p in raw if p["kind"] == "place"]
    hll = np.array([[h["lat"], h["lon"]] for h in hoods]) if hoods else np.zeros((0, 2))

    def area(lat, lon):
        if not len(hll):
            return city.name
        d = np.hypot(hll[:, 0] - lat, (hll[:, 1] - lon) * np.cos(np.radians(lat)))
        i = int(np.argmin(d))
        return hoods[i]["name"] if d[i] < NEAR_DEG else city.name

    items = [_item(p, RANK["featured"]) for p in featured(key)]
    for p in raw:
        label = LABEL.get(p["value"], p["value"].replace("_", " ").capitalize())
        sub = label if p["kind"] == "place" else f"{label} · {area(p['lat'], p['lon'])}"
        items.append(_item({"key": "osm_" + p["id"], "name": p["name"], "sub": sub, "lat": p["lat"], "lon": p["lon"]},
                           RANK.get(p["kind"], 3)))
    try:  # named through-roads ("Lodhi Road"), one point each: the edge midpoint nearest the road's middle
        g = road_graph.get(key)
        m = (g.name != "") & np.isin(g.highway, STREET_TYPES)
        for name in np.unique(g.name[m]):
            ix = np.flatnonzero(m & (g.name == name))
            mid = np.median(np.c_[g.mid_lat[ix], g.mid_lon[ix]], 0)
            j = ix[np.argmin(np.hypot(g.mid_lat[ix] - mid[0], g.mid_lon[ix] - mid[1]))]
            lat, lon = round(float(g.mid_lat[j]), 5), round(float(g.mid_lon[j]), 5)
            name = str(name)
            items.append(_item({"key": "street_" + norm(name).replace(" ", "_"), "name": name, "sub": f"Road · {area(lat, lon)}",
                                "lat": lat, "lon": lon}, RANK["street"]))
    except (httpx.HTTPError, OSError, ValueError) as ex:
        log.warning("street names unavailable for %s: %s", key, ex)
    log.info("place index %s: %d entries", key, len(items))
    return items


def index(key: str) -> list[dict]:
    """The city's search index, built once. If OSM can't be reached, featured places only (not cached, so it retries)."""
    with _lock:
        if key not in _index:
            try:
                _index[key] = _build(key)
            except (httpx.HTTPError, OSError, ValueError, KeyError) as ex:
                log.warning("place index for %s unavailable, featured places only: %s", key, ex)
                return [_item(p, RANK["featured"]) for p in featured(key)]
        return _index[key]


def search(key: str, q: str, limit: int = 8) -> list[dict]:
    """Best matches for q: whole-name prefix, then word prefix, then substring; featured and neighbourhoods first."""
    qn = norm(q)
    if len(qn) < 2:
        return []
    hits = []
    for it in index(key):
        n = it["norm"]
        if n.startswith(qn):
            s = 0
        elif f" {qn}" in f" {n}":
            s = 1
        elif qn in n:
            s = 2
        else:
            continue
        hits.append((s, it["rank"], len(n), it))
    hits.sort(key=lambda h: h[:3])
    out, seen = [], set()
    for *_, it in hits:
        tag = (it["norm"], round(it["lat"], 2), round(it["lon"], 2))  # the same name mapped twice nearby
        if tag not in seen:
            seen.add(tag)
            out.append({f: it[f] for f in FIELDS})
            if len(out) == limit:
                break
    return out
