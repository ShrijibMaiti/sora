"""GET /api/events (docs/api_contract.md, spec §30)."""
from fastapi import APIRouter

from ...events import detect
from ..schemas import city_or_fail
from .field import forecast_or_fail

router = APIRouter()


@router.get("/events")
def events(city: str):
    if not city_or_fail(city, need_built=False).built:
        return []
    return detect.from_forecast(forecast_or_fail(city)["met"])
