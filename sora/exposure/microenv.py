"""Microenvironment and travel priors (spec §21.4, §22.2, §23.6). T0: fixed factors by type, no fitted values.

shortcut: indicative priors (indoor/outdoor ratios, near-road increments, urban speeds) instead of values fitted
to Indian measurements and live traffic; replace with the dynamic indoor model (§21.3) and traffic speeds (§11.5).
"""
from dataclasses import dataclass

# steady-state infiltration factor F_inf by building (spec §21.4)
BUILDING = {"naturally_ventilated": 0.8, "ac_sealed": 0.45, "ac_filtered": 0.25}
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
    # shortcut: metro runs along the road network at rail speed; replace with the DMRC GTFS network
    "metro": Mode("Metro", "metro", 0.4, 12, 32, True, 10),
}
ACCESS_VENT = 15  # standing / walking to the stop

# near-road increment on the background field by road class (spec §15.2 LUR stands in here as a fixed prior)
ROAD_INC = {"motorway": 1.35, "trunk": 1.35, "primary": 1.25, "secondary": 1.15, "tertiary": 1.08,
            "unclassified": 1.0, "residential": 1.0, "living_street": 0.95, "pedestrian": 0.95}
# motor speed relative to a secondary road
ROAD_SPEED = {"motorway": 1.4, "trunk": 1.3, "primary": 1.15, "secondary": 1.0, "tertiary": 0.9,
              "unclassified": 0.8, "residential": 0.7, "living_street": 0.5, "pedestrian": 0.3}
MAIN_ROADS = {"motorway", "trunk", "primary", "secondary"}


def congestion(ist_hour: float) -> float:
    """Motor speed multiplier by IST hour: morning and evening peaks are slow, nights fast."""
    if 8 <= ist_hour < 11 or 17 <= ist_hour < 21:
        return 0.7
    if ist_hour >= 23 or ist_hour < 6:
        return 1.3
    return 1.0
