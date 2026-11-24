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

GRID_N = 12          # field grid points per side
HISTORY_DAYS = 60    # training window (Open-Meteo past_days limit is 92)
FORECAST_DAYS = 3    # 0–72 h horizon (spec §18.1)
N_SAMPLES = 128      # joint field samples (spec §19.2)
