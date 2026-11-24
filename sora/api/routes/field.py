"""GET /api/cities and GET /api/field (docs/api_contract.md)."""
import httpx
from fastapi import APIRouter

from ... import config
from ...field import forecast
from ..schemas import Pollutant, city_or_fail, fail

router = APIRouter()


def forecast_or_fail(key: str) -> dict:
    try:
        return forecast.get(key)
    except (httpx.HTTPError, ValueError, KeyError):
        fail(503, "upstream", "Forecast data is temporarily unavailable. Try again in a few minutes.")


@router.get("/cities")
def cities():
    return [{
        "key": k, "name": c.name, "built": c.built, "status": "Live" if c.built else "Preview",
        "bbox": list(c.bbox), "route_bbox": list(c.route_bbox), "center": list(c.center), "note": c.note,
    } for k, c in config.CITIES.items()]


@router.get("/field")
def field(city: str, pollutant: Pollutant = "pm25"):
    c = city_or_fail(city)
    if pollutant != "pm25":
        fail(404, "unavailable", f"Sora forecasts PM2.5 only in {c.name} for now.")
    return forecast_or_fail(city)["field"]
