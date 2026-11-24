"""POST /api/plan, /api/day and /api/counterfactual (docs/api_contract.md, spec §23–§26)."""
from contextlib import contextmanager

from fastapi import APIRouter

from ...decision import counterfactual as cf
from ...decision import routing, schedule
from ..schemas import CounterfactualRequest, DayRequest, PlanRequest, city_or_fail, fail

router = APIRouter()


@contextmanager
def contract_errors(city: str):
    city_or_fail(city)
    try:
        yield
    except routing.PlanError as e:
        fail(e.status, e.code, e.message, **e.extra)


@router.post("/plan")
def plan(req: PlanRequest):
    with contract_errors(req.city):
        return routing.plan(req)


@router.post("/day")
def day(req: DayRequest):
    with contract_errors(req.city):
        return schedule.day(req)


@router.post("/counterfactual")
def counterfactual(req: CounterfactualRequest):
    with contract_errors(req.plan.city):
        return cf.counterfactual(req.plan, req.change)
