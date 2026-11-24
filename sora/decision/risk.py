"""Risk-aware objective (spec §31.2): ρ[E] = (1 − β)·E[E] + β·CVaR_α[E], the default criterion.

It prefers a plan that is slightly worse on average but much safer in the bad scenarios the samples contain.
"""
import numpy as np

BETA, ALPHA = 0.5, 0.9


def cvar(x, alpha=ALPHA) -> float:
    """Mean of the worst (1 − α) share of outcomes: exactly the top ⌈(1 − α)·n⌉ values, so ties at the quantile
    (common with sampled doses) can't drag the whole distribution in."""
    x = np.sort(np.asarray(x, float))
    k = max(1, int(np.ceil((1 - alpha) * len(x) - 1e-9)))
    return float(x[-k:].mean())


def risk(x, beta=BETA, alpha=ALPHA) -> float:
    x = np.asarray(x, float)
    return float((1 - beta) * x.mean() + beta * cvar(x, alpha))
