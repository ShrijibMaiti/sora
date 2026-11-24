"""Target cities and global constants (spec §3.3, §8.3, §13)."""
import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(os.environ.get("SORA_CACHE", ROOT / "data_cache"))

IST_OFFSET_H = 5.5  # all four cities are on IST


@dataclass(frozen=True)
class City:
    name: str
    bbox: tuple[float, float, float, float]       # south, west, north, east — field grid
    route_bbox: tuple[float, float, float, float]  # road graph; trips must start and end inside (docs/api_contract.md)
    center: tuple[float, float]
    built: bool                                    # model is live; served by /api/field
    note: str                                      # one-line pollution context shown in the city picker


CITIES = {
    # Delhi route_bbox covers every demo place: Saket, Connaught Place, Lajpat Nagar, IIT, Hauz Khas, Green Park, Khan Market
    "delhi": City("Delhi", (28.40, 76.84, 28.88, 77.35), (28.515, 77.18, 28.645, 77.25), (28.61, 77.20), True,
                  "Winter inversions trap traffic exhaust and smoke from upwind crop fires."),
    "kolkata": City("Kolkata", (22.40, 88.20, 22.75, 88.50), (22.52, 88.32, 22.60, 88.40), (22.57, 88.36), False,
                    "Winter outflow down the Gangetic plain adds to local traffic and industry."),
    "mumbai": City("Mumbai", (18.88, 72.77, 19.30, 73.00), (19.00, 72.81, 19.08, 72.89), (19.07, 72.88), False,
                   "The sea breeze clears the afternoon; calm winter nights let haze settle."),
    "chennai": City("Chennai", (12.85, 80.10, 13.25, 80.33), (13.02, 80.21, 13.10, 80.29), (13.06, 80.24), False,
                    "North-east monsoon rain washes the air; Bhogi bonfires spike it in January."),
}

# Featured places and the example trip / day the app opens with (GET /api/places). Keys are stable ids the app stores.
# Every place must lie inside the city's route_bbox. `building` is the indoor type when known.
PLACES = {
    "delhi": [
        {"key": "saket", "name": "Saket", "sub": "Select Citywalk, Press Enclave Marg", "lat": 28.5245, "lon": 77.2066},
        {"key": "cp", "name": "Connaught Place", "sub": "Inner Circle, New Delhi", "lat": 28.6315, "lon": 77.2167},
        {"key": "lajpat", "name": "Lajpat Nagar", "sub": "Central Market, Lajpat Nagar II", "lat": 28.5677, "lon": 77.2433},
        {"key": "iitd", "name": "IIT Delhi", "sub": "Hauz Khas, New Delhi", "lat": 28.545, "lon": 77.1926},
        {"key": "hkv", "name": "Hauz Khas Village", "sub": "Gym A · Naturally ventilated", "lat": 28.5535, "lon": 77.194,
         "building": "naturally_ventilated"},
        {"key": "greenpark", "name": "Green Park", "sub": "Gym B · AC with filter", "lat": 28.559, "lon": 77.206,
         "building": "ac_filtered"},
        {"key": "khan", "name": "Khan Market", "sub": "Rabindra Nagar, New Delhi", "lat": 28.6003, "lon": 77.227},
    ],
}
# The spec's key demo scenario: an evening trip, and Home → College → Gym → Restaurant → Home. Times are IST "HH:MM".
EXAMPLES = {
    "delhi": {
        "trip": {"origin": "saket", "dest": "cp", "mode": "car_ac", "dep": "18:15",
                 "origin_building": "naturally_ventilated", "dest_building": "ac_sealed"},
        "day": [
            {"name": "Home", "place": "lajpat", "before": "08:20", "building": "naturally_ventilated", "activity": "rest"},
            {"name": "College", "place": "iitd", "after": "08:45", "duration_min": 455, "building": "naturally_ventilated", "activity": "light"},
            {"name": "Gym", "place": "hkv", "alt": "greenpark", "alt_building": "ac_filtered", "duration_min": 75,
             "building": "naturally_ventilated", "activity": "high"},
            {"name": "Restaurant", "place": "khan", "after": "18:45", "duration_min": 105, "building": "ac_sealed", "activity": "light"},
            {"name": "Home", "place": "lajpat", "building": "naturally_ventilated", "activity": "rest"},
        ],
    },
}

GRID_N = 12          # field grid points per side
HISTORY_DAYS = 60    # training window (Open-Meteo past_days limit is 92)
FORECAST_DAYS = 3    # 0–72 h horizon (spec §18.1)
N_SAMPLES = 128      # joint field samples (spec §19.2)
