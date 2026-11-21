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
    demo_bbox: tuple[float, float, float, float]  # road network used for routing


CITIES = {
    "delhi": City("Delhi", (28.40, 76.84, 28.88, 77.35), (28.56, 77.18, 28.64, 77.26)),
    "kolkata": City("Kolkata", (22.40, 88.20, 22.75, 88.50), (22.52, 88.32, 22.60, 88.40)),
    "mumbai": City("Mumbai", (18.88, 72.77, 19.30, 73.00), (19.00, 72.81, 19.08, 72.89)),
    "chennai": City("Chennai", (12.85, 80.10, 13.25, 80.33), (13.02, 80.21, 13.10, 80.29)),
}

GRID_N = 12          # field grid points per side
HISTORY_DAYS = 60    # training window (Open-Meteo past_days limit is 92)
FORECAST_DAYS = 3    # 0–72 h horizon (spec §18.1)
N_SAMPLES = 128      # joint field samples (spec §19.2)
