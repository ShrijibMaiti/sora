"""Sora HTTP API (docs/api_contract.md). Run: uvicorn sora.api.main:app --reload (Vite forwards /api to :8000)."""
import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .. import config
from ..field import forecast
from ..representation import road_graph
from .routes import events, field, plan


def warm():
    """Fetch the field and road graph for live cities before the first user asks (~10 s + ~40 s cold)."""
    for key, c in config.CITIES.items():
        if c.built:
            try:
                forecast.get(key)
                road_graph.get(key)
            except Exception:  # the request path reports upstream errors properly; warming is best-effort
                logging.getLogger("sora").exception("warm-up failed for %s", key)


@asynccontextmanager
async def lifespan(_: FastAPI):
    threading.Thread(target=warm, daemon=True).start()
    yield


app = FastAPI(title="Sora API", version="1", lifespan=lifespan)
for r in (field.router, events.router, plan.router):
    app.include_router(r, prefix="/api")


@app.exception_handler(RequestValidationError)
async def invalid(_: Request, exc: RequestValidationError):
    """Contract: bad input is 400 `invalid`, not FastAPI's default 422 list."""
    e = exc.errors()[0]
    where = ".".join(str(x) for x in e["loc"][1:]) or "request"
    return JSONResponse(status_code=400, content={"detail": {"code": "invalid", "message": f"{where}: {e['msg']}"}})
