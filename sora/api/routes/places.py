"""GET /api/places and GET /api/search (docs/api_contract.md)."""
from fastapi import APIRouter, Query

from ... import config
from ...representation import places
from ..schemas import city_or_fail

router = APIRouter()


@router.get("/places")
def featured(city: str):
    city_or_fail(city)
    return {"places": places.featured(city), "example": config.EXAMPLES.get(city)}


@router.get("/search")
def search(city: str, q: str = Query(min_length=1, max_length=80)):
    city_or_fail(city)
    return places.search(city, q)
