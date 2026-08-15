from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.dependencies.auth import get_current_user
from app.application.services.goal_service import (
    InvalidGoalDateRangeError,
    goal_service,
)
from app.schemas.goal import (
    GoalActivationRequest,
    GoalCreate,
    GoalResponse,
    GoalUpdate,
    PaginatedGoalsResponse,
)

router = APIRouter(prefix="/goals", tags=["Goals"])
CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


@router.post("", response_model=GoalResponse, status_code=201)
async def create_goal(request: GoalCreate, current_user: CurrentUser):
    return await goal_service.create(current_user["id"], request)


@router.get("", response_model=PaginatedGoalsResponse)
async def list_goals(
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
):
    return await goal_service.list(current_user["id"], page, limit)


@router.get("/active", response_model=GoalResponse)
async def get_active_goal(current_user: CurrentUser):
    goal = await goal_service.get_active(current_user["id"])
    if goal is None:
        raise HTTPException(status_code=404, detail="No active goal found")
    return goal


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: str,
    request: GoalUpdate,
    current_user: CurrentUser,
):
    try:
        goal = await goal_service.update(current_user["id"], goal_id, request)
    except InvalidGoalDateRangeError:
        raise HTTPException(
            status_code=422,
            detail="end_date must not be before start_date",
        )

    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.patch("/{goal_id}/activate", response_model=GoalResponse)
async def activate_goal(
    goal_id: str,
    request: GoalActivationRequest,
    current_user: CurrentUser,
):
    goal = await goal_service.activate(
        current_user["id"],
        goal_id,
        request.is_active,
    )
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    return goal


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(goal_id: str, current_user: CurrentUser) -> Response:
    deleted = await goal_service.delete(current_user["id"], goal_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Goal not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)