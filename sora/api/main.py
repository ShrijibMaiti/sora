"""Sora HTTP API (docs/api_contract.md), and the built web app when web/dist exists.

Dev:  uvicorn sora.api.main:app --reload   (Vite on :5173 forwards /api here)
Prod: npm run build in web/, then uvicorn sora.api.main:app --host 0.0.0.0 (or the Dockerfile)
"""
import logging
import os
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .. import config, pipeline
from ..field import forecast
from .routes import events, field, plan

logging.basicConfig(level=os.environ.get("SORA_LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)  # its INFO lines carry full URLs, and the FIRMS key is in the path
WEB_DIST = Path(os.environ.get("SORA_WEB_DIST", config.ROOT / "web" / "dist"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    stop = threading.Event()
    threading.Thread(target=pipeline.loop, args=(stop,), daemon=True, name="sora-pipeline").start()
    yield
    stop.set()


app = FastAPI(title="Sora API", version="1", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)  # /api/field is ~180 kB of JSON, ~30 kB gzipped
for r in (field.router, events.router, plan.router):
    app.include_router(r, prefix="/api")


@app.exception_handler(RequestValidationError)
async def invalid(_: Request, exc: RequestValidationError):
    """Contract: bad input is 400 `invalid`, not FastAPI's default 422 list."""
    e = exc.errors()[0]
    where = ".".join(str(x) for x in e["loc"][1:]) or "request"
    return JSONResponse(status_code=400, content={"detail": {"code": "invalid", "message": f"{where}: {e['msg']}"}})


@app.get("/api/health")
def health():
    """For uptime checks: 200 when every live city has a field to serve (current, or under 3 h old), else 503."""
    now = datetime.now(timezone.utc)
    cities = {}
    for key, c in config.CITIES.items():
        if c.built:
            hit = forecast._cache.get(key)
            cities[key] = {"fresh": forecast.is_fresh(key, now),
                           "analysis_time": hit[1]["field"]["meta"]["analysis_time"] if hit else None,
                           "usable": bool(hit) and now - hit[0] <= forecast.STALE_OK}
    ok = all(v["usable"] for v in cities.values())
    return JSONResponse({"ok": ok, "cities": cities}, status_code=200 if ok else 503)


if WEB_DIST.is_dir():  # last, so /api/* routes win; html=True serves dist/app/index.html for /app/
    app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
