"""GET /api/events (docs/api_contract.md, spec §30)."""
from fastapi import APIRouter

from ...events import calendar, detect
from ..schemas import city_or_fail
from .field import forecast_or_fail

router = APIRouter()


@router.get("/events")
def events(city: str):
    c = city_or_fail(city, need_built=False)
    if not c.built:
        return []
    f = forecast_or_fail(city)
    found = detect.from_forecast(f["met"], f["field"]["fires"], c.center) + calendar.upcoming(city, f["met"]["times"])
    return sorted(found, key=lambda e: e["start"])
