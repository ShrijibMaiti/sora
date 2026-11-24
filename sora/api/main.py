"""Sora HTTP API (docs/api_contract.md). Run: uvicorn sora.api.main:app --reload (Vite forwards /api to :8000)."""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .routes import events, field
from .schemas import fail

app = FastAPI(title="Sora API", version="1")
app.include_router(field.router, prefix="/api")
app.include_router(events.router, prefix="/api")


@app.exception_handler(RequestValidationError)
async def invalid(_: Request, exc: RequestValidationError):
    """Contract: bad input is 400 `invalid`, not FastAPI's default 422 list."""
    e = exc.errors()[0]
    where = ".".join(str(x) for x in e["loc"][1:]) or "request"
    return JSONResponse(status_code=400, content={"detail": {"code": "invalid", "message": f"{where}: {e['msg']}"}})


# shortcut: planner endpoints answer not_built until the routing/day/what-if backend lands (waves 2–3)
@app.post("/api/plan")
@app.post("/api/day")
@app.post("/api/counterfactual")
def planner_not_live():
    fail(404, "not_built", "Trip and day planning aren't live on Sora's server yet. The forecast map and alerts are.")
