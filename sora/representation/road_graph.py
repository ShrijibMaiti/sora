"""City road graph for routing (spec §13.3): OSM streets inside City.route_bbox, as arrays for scipy shortest paths."""
import threading

import numpy as np
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

from .. import config
from ..data import osm
from ..exposure.microenv import ROAD_INC, ROAD_SPEED
from ..geo import haversine_m


class RoadGraph:
    def __init__(self, G):
        nodes = list(G.nodes)
        ix = {n: i for i, n in enumerate(nodes)}
        self.n = len(nodes)
        self.lat = np.array([G.nodes[n]["lat"] for n in nodes])
        self.lon = np.array([G.nodes[n]["lon"] for n in nodes])
        E = list(G.edges(data=True))
        self.u = np.array([ix[a] for a, _, _ in E])
        self.v = np.array([ix[b] for _, b, _ in E])
        self.length = np.array([d["length"] for *_, d in E])
        self.highway = np.array([d["highway"] for *_, d in E])
        self.name = np.array([d["name"] for *_, d in E])
        self.motor_ok = np.array([d["motor_ok"] for *_, d in E])
        self.walk_ok = np.array([d["walk_ok"] for *_, d in E])
        self.inc = np.array([ROAD_INC[h] for h in self.highway])          # near-road increment
        self.speed_rel = np.array([ROAD_SPEED[h] for h in self.highway])  # motor speed vs a secondary road
        self.mid_lat = (self.lat[self.u] + self.lat[self.v]) / 2
        self.mid_lon = (self.lon[self.u] + self.lon[self.v]) / 2
        self.edge_of = {(a, b): e for e, (a, b) in enumerate(zip(self.u.tolist(), self.v.tolist()))}

    def allowed(self, motor: bool):
        return self.motor_ok if motor else self.walk_ok

    def snap(self, lat, lon, motor: bool):
        """Nearest node with an allowed outgoing edge, and its distance in metres."""
        ok = np.zeros(self.n, bool)
        ok[self.u[self.allowed(motor)]] = True
        d = np.where(ok, haversine_m(lat, lon, self.lat, self.lon), np.inf)
        i = int(np.argmin(d))
        return i, float(d[i])

    def route(self, src: int, dst: int, weight, motor: bool):
        """Edge indices of the least-weight path, or None when dst is unreachable."""
        m = self.allowed(motor)
        A = csr_matrix((weight[m] + 1e-9, (self.u[m], self.v[m])), shape=(self.n, self.n))
        dist, pred = dijkstra(A, indices=src, return_predecessors=True)
        if not np.isfinite(dist[dst]):
            return None
        path, b = [], dst
        while b != src:
            a = int(pred[b])
            path.append(self.edge_of[(a, b)])
            b = a
        return np.array(path[::-1], int)


_graphs: dict[str, RoadGraph] = {}
_lock = threading.Lock()


def get(key: str) -> RoadGraph:
    """Road graph for a city, downloaded from Overpass once (~40 s for Delhi) and cached on disk."""
    with _lock:
        if key not in _graphs:
            path = config.CACHE / f"osm_{key}.json"
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                osm.fetch(config.CITIES[key].route_bbox, path)
            _graphs[key] = RoadGraph(osm.load_graph(path))
        return _graphs[key]
