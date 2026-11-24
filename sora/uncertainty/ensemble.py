"""Joint space-time field samples for paired evaluation (spec §19.2, §31.5).

shortcut: samples are drawn from each cell's log-normal band (median, p95) with a fixed correlation structure
(70% city-wide error, AR(1) in time; 30% static local error), not from a model ensemble or generative sampler (§19, T1).
"""
import numpy as np

from .. import config
from ..exposure.microenv import BUILDING, MODES
from ..mobility.travel_time import SPREAD

RHO_H = 0.95  # hour-to-hour correlation of the city-wide error
SHARE_CITY = 0.7
PARAM_SIGMA = {"mode": 0.15, "building": 0.2}  # log-sd of microenvironment factors (spec §21.4 priors are ranges)

_cache: dict[tuple, dict] = {}


def get(field: dict, n: int = config.N_SAMPLES, seed: int = 0) -> dict:
    """{"C": (S, T, ny, nx) concentration samples, "param": {category: (S,) multiplier}} for one field build.

    Fixed seed: every option in every request is scored on the same samples (common random numbers).
    """
    key = (field["city"], field["meta"]["built_at"], n, seed)
    if key in _cache:
        return _cache[key]
    med = np.asarray(field["median"], float)
    sigma = np.log(np.maximum(np.asarray(field["p95"], float), 1e-6) / np.maximum(med, 1e-6)) / 1.645
    S, (T, ny, nx) = n, med.shape
    rng = np.random.default_rng(seed)
    g = np.empty((S, T))
    g[:, 0] = rng.standard_normal(S)
    for t in range(1, T):
        g[:, t] = RHO_H * g[:, t - 1] + np.sqrt(1 - RHO_H ** 2) * rng.standard_normal(S)
    z = np.sqrt(SHARE_CITY) * g[:, :, None, None] + np.sqrt(1 - SHARE_CITY) * rng.standard_normal((S, 1, ny, nx))
    param = {k: np.exp(PARAM_SIGMA["mode"] * rng.standard_normal(S)) for k in MODES}
    param |= {k: np.exp(PARAM_SIGMA["building"] * rng.standard_normal(S)) for k in BUILDING}
    # how long today's trips take relative to typical (traffic); a longer trip also means more air breathed on the way
    tt = {k: np.exp(SPREAD[k] * rng.standard_normal(S)) for k in MODES}
    for k in MODES:
        param[k] = param[k] * tt[k]
    out = {"C": med[None] * np.exp(sigma[None] * z), "param": param, "tt": tt}
    if len(_cache) > 8:
        _cache.clear()
    _cache[key] = out
    return out
