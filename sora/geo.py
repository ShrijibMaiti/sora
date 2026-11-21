import numpy as np

EARTH_M = 6371000.0


def haversine_m(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(np.subtract(lon2, lon1)) / 2) ** 2
    return 2 * EARTH_M * np.arcsin(np.sqrt(a))


def to_km(lat, lon, lat0, lon0):
    """Local equirectangular projection (x, y) in km; adequate within one city."""
    return np.stack([(np.asarray(lon) - lon0) * 111.32 * np.cos(np.radians(lat0)),
                     (np.asarray(lat) - lat0) * 110.57], -1)
