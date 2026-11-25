"""Web Push subscriptions and wake-ups (docs/api_contract.md "Push"). No reminder text or trip ever reaches the server."""
import re

from fastapi import APIRouter
from pydantic import AwareDatetime, BaseModel, Field, field_validator

from ... import config, push
from ..schemas import fail

router = APIRouter(prefix="/push")


class Keys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class Subscription(BaseModel):
    endpoint: str = Field(max_length=1000)
    keys: Keys

    @field_validator("endpoint")
    @classmethod
    def push_service_only(cls, v):
        if not push.allowed_endpoint(v):
            raise ValueError("not a known push service")
        return v


class Subscribe(BaseModel):
    subscription: Subscription
    city: str | None = None
    alerts: bool = False  # city-wide warnings (spec §28.3)


class Wake(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    at: AwareDatetime


@router.get("/key")
def key():
    return {"public_key": push.public_key()}


@router.put("/subscription")
def subscribe(req: Subscribe):
    if req.city is not None and req.city not in config.CITIES:
        fail(404, "unknown_city", f'Unknown city "{req.city}".')
    try:
        return {"id": push.upsert(req.subscription.model_dump(), req.city, req.alerts)}
    except OverflowError:
        fail(503, "full", "Notifications are not available right now.")


@router.post("/subscription/{sid}/wake")
def wake(sid: str, req: Wake):
    if not re.fullmatch(r"[0-9a-f]{20}", sid):
        fail(400, "invalid", "Unknown subscription id.")
    try:
        ok = push.add_wake(sid, req.id, req.at)
    except ValueError as e:
        fail(400, "invalid", str(e))
    if not ok:
        fail(404, "unknown_subscription", "This device isn't subscribed; turn notifications on again.")
    return {"ok": True}


@router.delete("/subscription/{sid}")
def unsubscribe(sid: str):
    return {"removed": push.remove(sid) if re.fullmatch(r"[0-9a-f]{20}", sid) else False}
