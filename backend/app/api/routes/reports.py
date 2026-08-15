from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.dependencies.auth import get_current_user
from app.application.services.report_service import report_service
from app.schemas.report import (
    CalorieTrendResponse,
    GoalComparisonResponse,
    MacroTrendResponse,
    MicronutrientSummaryResponse,
)

router = APIRouter(prefix="/reports", tags=["Reports"])
CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


def validate_date_range(start_date: date | None, end_date: date | None) -> None:
    if (start_date is None) != (end_date is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_date and end_date must be provided together",
        )
    if start_date is not None and end_date is not None and end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date must be on or after start_date",
        )


@router.get("/calorie-trend", response_model=CalorieTrendResponse)
async def calorie_trend(
    current_user: CurrentUser,
    period: Literal["7d", "30d", "90d"] = Query(default="7d"),
    view: Literal["daily", "weekly"] = Query(default="daily"),
    start_date: date | None = None,
    end_date: date | None = None,
):
    validate_date_range(start_date, end_date)
    return await report_service.calorie_trend(
        current_user["id"],
        period,
        view,
        start_date,
        end_date,
    )


@router.get("/macro-breakdown", response_model=MacroTrendResponse)
async def macro_breakdown(
    current_user: CurrentUser,
    period: Literal["7d", "30d", "90d"] = Query(default="7d"),
    view: Literal["daily", "weekly"] = Query(default="daily"),
    start_date: date | None = None,
    end_date: date | None = None,
):
    validate_date_range(start_date, end_date)
    return await report_service.macro_trend(
        current_user["id"],
        period,
        view,
        start_date,
        end_date,
    )


@router.get("/micro-summary", response_model=MicronutrientSummaryResponse)
async def micro_summary(
    current_user: CurrentUser,
    period: Literal["7d", "30d", "90d"] = Query(default="7d"),
    start_date: date | None = None,
    end_date: date | None = None,
):
    validate_date_range(start_date, end_date)
    return await report_service.micronutrient_summary(
        current_user["id"],
        period,
        start_date,
        end_date,
    )


@router.get("/goal-comparison", response_model=GoalComparisonResponse)
async def goal_comparison(
    current_user: CurrentUser,
    selected_date: Annotated[date, Query(alias="date")],
    end_date: date | None = None,
):
    validate_date_range(selected_date, end_date or selected_date)
    return await report_service.goal_comparison(
        current_user["id"],
        selected_date,
        end_date,
    )
