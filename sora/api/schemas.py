"""Wire shapes and errors shared by the routes (docs/api_contract.md)."""
from typing import Annotated, Literal, Union

from fastapi import HTTPException
from pydantic import AwareDatetime, BaseModel, Field

from .. import config

Pollutant = Literal["pm25", "pm10", "no2", "o3", "so2", "co"]
Mode = Literal["walk", "cycle", "two_wheeler", "auto", "car_ac", "bus", "metro"]
Building = Literal["naturally_ventilated", "ac_sealed", "ac_filtered"]
LatLng = tuple[float, float]


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


class PlanRequest(BaseModel):
    city: str
    origin: LatLng
    dest: LatLng
    mode: Mode
    planned_departure: AwareDatetime
    earliest: AwareDatetime
    latest_departure: AwareDatetime
    latest_arrival: AwareDatetime | None = None
    max_extra_min: float = Field(ge=0, le=180)
    origin_building: Building
    dest_building: Building
    pollutant: Pollutant = "pm25"  # what to plan for (spec §22.5)


class Place(BaseModel):
    label: str
    lat: float
    lon: float


class AltPlace(Place):
    building: Building | None = None


class Stop(BaseModel):
    name: str
    place: Place
    alternatives: list[AltPlace] | None = None
    arrive_after: AwareDatetime | None = None
    leave_before: AwareDatetime | None = None
    duration_min: float | None = Field(None, ge=0, le=24 * 60)
    building: Building
    activity: Literal["rest", "light", "moderate", "high"] | None = None
    mode: Mode | None = None  # how you travel on to the next stop; the day's mode when absent


class DayRequest(BaseModel):
    city: str
    mode: Mode
    max_extra_min: float = Field(ge=0, le=180)
    stops: list[Stop] = Field(max_length=12)
    pollutant: Pollutant = "pm25"


class ShiftDeparture(BaseModel):
    kind: Literal["shift_departure"]
    minutes: float = Field(ge=-180, le=180)


class ModeChange(BaseModel):
    kind: Literal["mode"]
    mode: Mode


class DestinationChange(BaseModel):
    kind: Literal["destination"]
    dest: LatLng
    dest_building: Building | None = None


class StayIndoors(BaseModel):
    kind: Literal["stay_indoors"]
    start: AwareDatetime
    end: AwareDatetime


Change = Annotated[Union[ShiftDeparture, ModeChange, DestinationChange, StayIndoors], Field(discriminator="kind")]


class CounterfactualRequest(BaseModel):
    plan: PlanRequest
    change: Change
