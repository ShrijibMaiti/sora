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
    "kolkata": City("Kolkata", (22.40, 88.20, 22.75, 88.50), (22.52, 88.32, 22.60, 88.40), (22.57, 88.36), True,
                    "Winter outflow down the Gangetic plain adds to local traffic and industry."),
    "mumbai": City("Mumbai", (18.88, 72.77, 19.30, 73.00), (19.00, 72.81, 19.08, 72.89), (19.07, 72.88), True,
                   "The sea breeze clears the afternoon; calm winter nights let haze settle."),
    "chennai": City("Chennai", (12.85, 80.10, 13.25, 80.33), (13.02, 80.21, 13.10, 80.29), (13.06, 80.24), True,
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
    # Coordinates from the OSM extract (data_cache/places_{city}.json). Gym A / Gym B building types are example
    # attributes of the demo day, placed at an area or landmark, not claims about a named business.
    "kolkata": [
        {"key": "kol_ballygunge", "name": "Ballygunge", "sub": "South Kolkata", "lat": 22.5280, "lon": 88.3659},
        {"key": "kol_esplanade", "name": "Esplanade", "sub": "Metro and bus terminus, Central Kolkata", "lat": 22.5636, "lon": 88.3512},
        {"key": "kol_parkstreet", "name": "Park Street", "sub": "Park Street metro, Central Kolkata", "lat": 22.5552, "lon": 88.3501},
        {"key": "kol_cu", "name": "University of Calcutta", "sub": "College Street campus", "lat": 22.5749, "lon": 88.3626},
        {"key": "kol_newmarket", "name": "New Market", "sub": "Lindsay Street, Central Kolkata", "lat": 22.5602, "lon": 88.3530},
        {"key": "kol_sealdah", "name": "Sealdah", "sub": "Sealdah station", "lat": 22.5680, "lon": 88.3711},
        {"key": "kol_phari", "name": "Ballygunge Phari", "sub": "Gym A · Naturally ventilated", "lat": 22.5249, "lon": 88.3658,
         "building": "naturally_ventilated"},
        {"key": "kol_quest", "name": "Quest Mall", "sub": "Gym B · AC with filter", "lat": 22.5391, "lon": 88.3657,
         "building": "ac_filtered"},
    ],
    "mumbai": [
        {"key": "mum_dadar", "name": "Dadar West", "sub": "Central Mumbai", "lat": 19.0239, "lon": 72.8382},
        {"key": "mum_bkc", "name": "Bandra Kurla Complex", "sub": "Business district", "lat": 19.0671, "lon": 72.8657},
        {"key": "mum_bandra", "name": "Bandra West", "sub": "Western suburbs", "lat": 19.0583, "lon": 72.8303},
        {"key": "mum_vjti", "name": "VJTI", "sub": "Veermata Jijabai Technological Institute, Matunga", "lat": 19.0218, "lon": 72.8559},
        {"key": "mum_worli", "name": "Worli", "sub": "South-central Mumbai", "lat": 19.0117, "lon": 72.8179},
        {"key": "mum_lowerparel", "name": "Lower Parel", "sub": "Offices and mills district", "lat": 19.0030, "lon": 72.8303},
        {"key": "mum_shivaji", "name": "Shivaji Park", "sub": "Gym A · Naturally ventilated", "lat": 19.0287, "lon": 72.8392,
         "building": "naturally_ventilated"},
        {"key": "mum_jwd", "name": "Jio World Drive", "sub": "Gym B · AC with filter", "lat": 19.0536, "lon": 72.8505,
         "building": "ac_filtered"},
    ],
    "chennai": [
        {"key": "che_mylapore", "name": "Mylapore", "sub": "South Chennai", "lat": 13.0316, "lon": 80.2700},
        {"key": "che_central", "name": "Chennai Central", "sub": "Railway station", "lat": 13.0866, "lon": 80.2745},
        {"key": "che_egmore", "name": "Egmore", "sub": "Central Chennai", "lat": 13.0728, "lon": 80.2577},
        {"key": "che_loyola", "name": "Loyola College", "sub": "Nungambakkam", "lat": 13.0619, "lon": 80.2347},
        {"key": "che_tnagar", "name": "T. Nagar", "sub": "Thyagaraya Nagar, shopping district", "lat": 13.0346, "lon": 80.2301},
        {"key": "che_nungambakkam", "name": "Nungambakkam", "sub": "Gym A · Naturally ventilated", "lat": 13.0621, "lon": 80.2405,
         "building": "naturally_ventilated"},
        {"key": "che_ea", "name": "Express Avenue", "sub": "Gym B · AC with filter", "lat": 13.0587, "lon": 80.2642,
         "building": "ac_filtered"},
    ],
}
def _example(home, trip_dest, college, gym, gym_alt, restaurant):
    """The demo scenario with a city's own places (same times and buildings as Delhi's)."""
    return {
        "trip": {"origin": home, "dest": trip_dest, "mode": "car_ac", "dep": "18:15",
                 "origin_building": "naturally_ventilated", "dest_building": "ac_sealed"},
        "day": [
            {"name": "Home", "place": home, "before": "08:20", "building": "naturally_ventilated", "activity": "rest"},
            {"name": "College", "place": college, "after": "08:45", "duration_min": 455, "building": "naturally_ventilated", "activity": "light"},
            {"name": "Gym", "place": gym, "alt": gym_alt, "alt_building": "ac_filtered", "duration_min": 75,
             "building": "naturally_ventilated", "activity": "high"},
            {"name": "Restaurant", "place": restaurant, "after": "18:45", "duration_min": 105, "building": "ac_sealed", "activity": "light"},
            {"name": "Home", "place": home, "building": "naturally_ventilated", "activity": "rest"},
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
    "kolkata": _example("kol_ballygunge", "kol_esplanade", "kol_cu", "kol_phari", "kol_quest", "kol_parkstreet"),
    "mumbai": _example("mum_dadar", "mum_bkc", "mum_vjti", "mum_shivaji", "mum_jwd", "mum_bandra"),
    "chennai": _example("che_mylapore", "che_central", "che_loyola", "che_nungambakkam", "che_ea", "che_tnagar"),
}

GRID_N = 12          # field grid points per side
HISTORY_DAYS = 60    # training window (Open-Meteo past_days limit is 92)
FORECAST_DAYS = 3    # 0–72 h horizon (spec §18.1)
N_SAMPLES = 128      # joint field samples (spec §19.2)
