"""Dynamic indoor mass-balance model (spec §21.3): dC_in/dt = P·a·C_out − (a + k)·C_in.

Indoor air follows outdoor air with a lag of about 1/(a + k): a short outdoor peak barely reaches a sealed building,
while a leaky one tracks the outdoors within half an hour. Steady state is F_inf = P·a / (a + k).
shortcut: indicative parameters (spec §21.4 ranges), no indoor sources (cooking, incense); fitted values replace them.
"""
import numpy as np

# a: air exchanges per hour, P: penetration, k: loss per hour (deposition + filtration)
PARAMS = {
    "naturally_ventilated": (2.0, 0.9, 0.2),   # windows open: F_inf ≈ 0.82, lag ≈ 27 min
    "ac_sealed": (0.5, 0.8, 0.4),              # F_inf ≈ 0.44, lag ≈ 67 min
    "ac_filtered": (0.5, 0.8, 1.1),            # filter adds removal: F_inf = 0.25, lag ≈ 38 min
}
STEP_H = 0.25
WARMUP_TAUS = 3  # start the building this many time constants early, so its air reflects the hours before


def f_inf(building: str) -> float:
    a, p, k = PARAMS[building]
    return p * a / (a + k)


def tau_h(building: str) -> float:
    a, _, k = PARAMS[building]
    return 1 / (a + k)


def dose_weights(h_a: float, h_b: float, building: str, vent_lpm: float):
    """Times (h) and weights w such that dose = Σ w_j · C_out(t_j) for time indoors from h_a to h_b.

    The ODE is linear in C_out, so indoor dose is a weighted sum of outdoor concentrations, including the warm-up
    hours before arrival (the building's air already carries them). Exact for C_out constant within each step.
    """
    if h_b <= h_a:
        return np.zeros(0), np.zeros(0)
    a, p, k = PARAMS[building]
    lam = a + k
    t = np.arange(h_a - WARMUP_TAUS / lam, h_b, STEP_H)
    n = len(t)
    decay = np.exp(-lam * STEP_H)
    coef = np.zeros((n, n))  # C_in at step i = Σ_j coef[i, j] · C_out(t_j)
    coef[0, 0] = p * a / lam  # start from steady state with the first outdoor value
    for i in range(1, n):
        coef[i] = coef[i - 1] * decay
        coef[i, i] += (p * a / lam) * (1 - decay)
    # minutes present in each step (the last one may be partial)
    present = np.clip(np.minimum(t + STEP_H, h_b) - np.maximum(t, h_a), 0, None) * 60
    w = (present * vent_lpm / 1000) @ coef
    keep = w > 0
    return t[keep] + STEP_H / 2, w[keep]
