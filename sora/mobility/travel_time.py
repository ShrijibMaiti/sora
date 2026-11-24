"""Travel-time spread by mode (spec §20, §23.2): how much a trip's duration varies around its typical value.

shortcut: a fixed log-normal spread per mode instead of edge travel-time distributions from traffic data (§11.5, T1).
"""
# log-sd of trip duration: open road traffic varies most, rail and walking least
SPREAD = {"walk": 0.05, "cycle": 0.08, "metro": 0.08, "two_wheeler": 0.15, "auto": 0.20, "car_ac": 0.20, "bus": 0.25}
LATE_RISK = 0.10  # an arrival deadline must be met with at least 90% probability (spec §31.3, ε)
