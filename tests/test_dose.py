"""Indoor mass-balance model (spec §21.3), risk-aware objective (§31.2) and dose attribution (§22.4)."""
import numpy as np
import pytest

from sora.decision import risk
from sora.exposure import indoor


@pytest.mark.parametrize("building", list(indoor.PARAMS))
def test_indoor_steady_state_matches_infiltration_factor(building):
    t, w = indoor.dose_weights(10.0, 11.5, building, 7)
    assert 100 * w.sum() == pytest.approx(90 * 7 / 1000 * indoor.f_inf(building) * 100, rel=1e-9)
    assert t[0] < 10.0  # the building's air before arrival counts (warm-up)


def test_indoor_lags_outdoor():
    """A peak that starts when you arrive reaches a sealed building slowly; a leaky one follows it quickly."""
    def step(b):
        t, w = indoor.dose_weights(10.0, 11.0, b, 7)
        return float((w * np.where(t >= 10.0, 300.0, 100.0)).sum()) / (60 * 7 / 1000 * indoor.f_inf(b))
    sealed, leaky = step("ac_sealed"), step("naturally_ventilated")
    assert 100 < sealed < leaky < 300  # effective indoor/F ratio: lags behind the 300 outside
    assert indoor.tau_h("ac_sealed") > indoor.tau_h("naturally_ventilated")


def test_indoor_no_time_no_dose():
    t, w = indoor.dose_weights(5.0, 5.0, "ac_sealed", 7)
    assert len(t) == len(w) == 0


def test_risk_prefers_the_safer_plan():
    rng = np.random.default_rng(0)
    steady = np.full(1000, 100.0)
    spiky = np.where(rng.random(1000) < 0.1, 400.0, 100 - 300 / 9)  # same mean, a bad tail
    assert spiky.mean() == pytest.approx(100, rel=0.05)
    assert risk.risk(steady) == pytest.approx(100)
    assert risk.risk(spiky) > risk.risk(steady) + 50
    assert risk.cvar(spiky) >= np.quantile(spiky, risk.ALPHA)
    ties = np.r_[np.full(95, 50.0), np.full(5, 200.0)]  # worst 10 = five 200s and five 50s
    assert risk.cvar(ties) == pytest.approx(125.0)
