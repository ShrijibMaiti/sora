"""Wire shapes and errors shared by the routes (docs/api_contract.md)."""
from typing import Literal

from fastapi import HTTPException

from .. import config

Pollutant = Literal["pm25", "pm10", "no2", "o3", "so2", "co"]


def fail(status: int, code: str, message: str, **extra):
    """Contract error body: {"detail": {"code", "message", ...extra}}."""
    raise HTTPException(status, detail={"code": code, "message": message, **extra})


def city_or_fail(key: str, need_built: bool = True) -> config.City:
    city = config.CITIES.get(key)
    if city is None:
        fail(404, "unknown_city", f'Unknown city "{key}".')
    if need_built and not city.built:
        fail(404, "not_built", f"{city.name} isn't live yet.")
    return city
