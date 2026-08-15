from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.api.dependencies.auth import get_current_user
from app.application.services.entry_service import entry_service
from app.schemas.entry import (
    EntryCreate,
    EntryResponse,
    EntryUpdate,
    MealType,
    PaginatedEntriesResponse,
)

router = APIRouter(prefix="/entries", tags=["Food Entries"])
CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


@router.post(
    "",
    response_model=EntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_entry(
    request: EntryCreate,
    current_user: CurrentUser,
):
    return await entry_service.create(current_user["id"], request)


@router.get("", response_model=PaginatedEntriesResponse)
async def list_entries(
    current_user: CurrentUser,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    meal_type: MealType | None = None,
    search: str | None = Query(default=None, min_length=1, max_length=100),
):
    if start_date and end_date and end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="end_date must be greater than or equal to start_date",
        )

    return await entry_service.list(
        user_id=current_user["id"],
        page=page,
        limit=limit,
        start_date=start_date,
        end_date=end_date,
        meal_type=meal_type,
        search=search,
    )


@router.get("/{entry_id}", response_model=EntryResponse)
async def get_entry(entry_id: str, current_user: CurrentUser):
    entry = await entry_service.get(current_user["id"], entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Food entry not found")
    return entry


@router.put("/{entry_id}", response_model=EntryResponse)
async def update_entry(
    entry_id: str,
    request: EntryUpdate,
    current_user: CurrentUser,
):
    entry = await entry_service.update(
        current_user["id"],
        entry_id,
        request,
    )
    if entry is None:
        raise HTTPException(status_code=404, detail="Food entry not found")
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: str, current_user: CurrentUser) -> Response:
    deleted = await entry_service.delete(current_user["id"], entry_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Food entry not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
