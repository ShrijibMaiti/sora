"""Inhaled dose on joint field samples (spec §22.1): E = Σ C^μ(x, t) · V̇ · Δt, one value per sample."""
import numpy as np

from . import indoor


class Pieces:
    """Where and when a plan spends its minutes. Each piece: hour since the field's first frame, location,
    weight = minutes × m³/min × microenvironment factor, and the factor category whose sample multiplier applies."""

    def __init__(self):
        self.parts = []

    def add(self, h, lat, lon, w, cat):
        h = np.atleast_1d(np.asarray(h, float))
        b = lambda x: np.broadcast_to(np.asarray(x, float), h.shape)
        self.parts.append((h, b(lat), b(lon), b(w), np.full(h.shape, cat, object)))
        return self

    def __add__(self, other):
        out = Pieces()
        out.parts = self.parts + other.parts
        return out

    def arrays(self):
        if not self.parts:
            return (np.zeros(0),) * 4 + (np.zeros(0, object),)
        return tuple(np.concatenate([p[i] for p in self.parts]) for i in range(5))


def conc(C, lats, lons, h, lat, lon):
    """Trilinear interpolation of C (S, T, ny, nx) at points → (S, K). Clamped to the grid and the forecast."""
    S, T, ny, nx = C.shape
    th = np.clip(h, 0, T - 1)
    t0 = np.minimum(th.astype(int), T - 2)
    fy, fx = np.interp(lat, lats, np.arange(ny)), np.interp(lon, lons, np.arange(nx))
    iy, ix = np.minimum(fy.astype(int), ny - 2), np.minimum(fx.astype(int), nx - 2)
    wt, wy, wx = th - t0, fy - iy, fx - ix
    out = 0.0
    for dt, a in ((0, 1 - wt), (1, wt)):
        for dy, b in ((0, 1 - wy), (1, wy)):
            for dx, c in ((0, 1 - wx), (1, wx)):
                out = out + C[:, t0 + dt, iy + dy, ix + dx] * (a * b * c)
    return out


def dose(ens, lats, lons, p: Pieces):
    """(S,) inhaled dose in µg."""
    h, lat, lon, w, cat = p.arrays()
    if not len(h):
        return np.zeros(ens["C"].shape[0])
    cats, inv = np.unique(cat.astype(str), return_inverse=True)
    mult = np.stack([ens["param"][c] for c in cats], 1)[:, inv]
    return (conc(ens["C"], lats, lons, h, lat, lon) * mult * w).sum(1)


def dwell(h_a, h_b, lat, lon, building, vent_lpm):
    """Indoor time at a place from hour h_a to h_b, through the dynamic indoor model (spec §21.3): the pieces are
    outdoor concentrations at and before the stay, weighted by how much of each reaches the person inside."""
    t, w = indoor.dose_weights(h_a, h_b, building, vent_lpm)
    return Pieces().add(t, lat, lon, w, building) if len(t) else Pieces()
