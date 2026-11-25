"""Microenvironment and travel priors (spec §21.4, §22.2, §23.6). T0: fixed factors by type, no fitted values.

shortcut: indicative priors (indoor/outdoor ratios, near-road increments, urban speeds) instead of values fitted
to Indian measurements and live traffic; replace with the dynamic indoor model (§21.3) and traffic speeds (§11.5).
"""
from dataclasses import dataclass

import numpy as np

from . import indoor

# steady-state infiltration factor F_inf by building (spec §21.4), from the dynamic model's parameters
BUILDING = {b: indoor.f_inf(b) for b in indoor.PARAMS}
BUILDING_LABEL = {"naturally_ventilated": "Naturally ventilated", "ac_sealed": "AC, sealed", "ac_filtered": "AC with filter"}

# breathing rate, L/min (spec §22.2, after US EPA Exposure Factors Handbook ch. 6)
VENT = {"rest": 7, "light": 12, "moderate": 25, "high": 45}


@dataclass(frozen=True)
class Mode:
    label: str
    me: str           # microenvironment key the UI colours by
    f: float          # in-vehicle / roadside concentration ratio
    vent: float       # L/min while travelling
    kmh: float        # typical urban speed on a secondary road, free of rush hour
    motor: bool       # uses motor_ok edges (respects one-ways) and the road-class speed table
    access_min: float  # walking / waiting outdoors before boarding (bus stop, metro access, hailing an auto)


# seated commuting is "light" (11–13 L/min, spec §22.2); walking and cycling are moderate
MODES = {
    "walk": Mode("Walk", "road", 1.0, 20, 4.8, False, 0),
    "cycle": Mode("Cycle", "road", 1.0, 28, 13, False, 0),
    "two_wheeler": Mode("Two-wheeler", "road", 1.1, 12, 22, True, 0),
    "auto": Mode("Auto", "vehicle", 1.1, 12, 20, True, 3),
    "car_ac": Mode("Car", "vehicle", 0.5, 12, 22, True, 0),
    "bus": Mode("Bus", "vehicle", 0.9, 12, 15, True, 8),
    # metro trips are journeys on the real lines (representation/transit.py); kmh/access unused there
    "metro": Mode("Metro", "metro", 0.4, 12, 33, True, 0),
}
ACCESS_VENT = 15  # standing / walking to the stop

# near-road increment on the background field by road class (spec §15.2 LUR stands in here as a fixed prior)
ROAD_INC = {"motorway": 1.35, "trunk": 1.35, "primary": 1.25, "secondary": 1.15, "tertiary": 1.08,
            "unclassified": 1.0, "residential": 1.0, "living_street": 0.95, "pedestrian": 0.95}
# motor speed relative to a secondary road
ROAD_SPEED = {"motorway": 1.4, "trunk": 1.3, "primary": 1.15, "secondary": 1.0, "tertiary": 0.9,
              "unclassified": 0.8, "residential": 0.7, "living_street": 0.5, "pedestrian": 0.3}
MAIN_ROADS = {"motorway", "trunk", "primary", "secondary"}


# Pollutant-specific adjustments to the PM2.5-based priors above (spec §22.5: NO₂ is dominated by near-road air, O₃
# is lower next to traffic). shortcut: indicative values from the near-road and indoor/outdoor literature, not fitted.
#   road: scale of the near-road increment (inc − 1); negative = lower beside traffic (NO titrates O₃)
#   indoor: multiplier on a building's F_inf (O₃ reacts on surfaces, coarse PM settles, CO passes straight in)
#   cabin: in-vehicle ratio for sealed AC vehicles (filters catch particles, not gases)
POLLUTANT = {
    "pm25": {"road": 1.0, "indoor": 1.0, "cabin": {}},
    "pm10": {"road": 1.3, "indoor": 0.6, "cabin": {"car_ac": 0.4, "metro": 0.35}},
    "no2": {"road": 2.5, "indoor": 0.7, "cabin": {"car_ac": 0.8, "metro": 0.7}},
    "o3": {"road": -0.5, "indoor": 0.35, "cabin": {"car_ac": 0.4, "metro": 0.3}},
    "so2": {"road": 0.3, "indoor": 0.5, "cabin": {"car_ac": 0.7, "metro": 0.6}},
    "co": {"road": 2.0, "indoor": 1.0, "cabin": {"car_ac": 0.9, "metro": 0.8}},
}


def road_inc(inc, pollutant: str):
    """Near-road increment for a pollutant from the PM2.5 one (array or scalar), never below half the background."""
    return np.maximum(0.5, 1 + (np.asarray(inc, float) - 1) * POLLUTANT[pollutant]["road"])


def cabin_f(mode: str, pollutant: str) -> float:
    return POLLUTANT[pollutant]["cabin"].get(mode, MODES[mode].f)


def congestion(ist_hour: float) -> float:
    """Motor speed multiplier by IST hour: morning and evening peaks are slow, nights fast."""
    if 8 <= ist_hour < 11 or 17 <= ist_hour < 21:
        return 0.7
    if ist_hour >= 23 or ist_hour < 6:
        return 1.3
    return 1.0
