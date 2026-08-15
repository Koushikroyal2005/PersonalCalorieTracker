from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator


class GoalType(str, Enum):
    LOSE = "lose"
    GAIN = "gain"
    MAINTAIN = "maintain"


class GoalCreate(BaseModel):
    goal_type: GoalType
    daily_calorie_target: int = Field(gt=0, le=20000)
    daily_protein_target_g: float = Field(ge=0, le=2000)
    daily_carbs_target_g: float = Field(ge=0, le=5000)
    daily_fat_target_g: float = Field(ge=0, le=2000)
    target_weight_kg: float | None = Field(default=None, gt=0, le=1000)
    start_date: date = Field(default_factory=date.today)
    end_date: date | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def validate_dates(self) -> "GoalCreate":
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class GoalUpdate(BaseModel):
    goal_type: GoalType | None = None
    daily_calorie_target: int | None = Field(default=None, gt=0, le=20000)
    daily_protein_target_g: float | None = Field(default=None, ge=0, le=2000)
    daily_carbs_target_g: float | None = Field(default=None, ge=0, le=5000)
    daily_fat_target_g: float | None = Field(default=None, ge=0, le=2000)
    target_weight_kg: float | None = Field(default=None, gt=0, le=1000)
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def require_field(self) -> "GoalUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class GoalActivationRequest(BaseModel):
    is_active: bool


class GoalResponse(BaseModel):
    id: str
    user_id: str
    goal_type: GoalType
    daily_calorie_target: int
    daily_protein_target_g: float
    daily_carbs_target_g: float
    daily_fat_target_g: float
    target_weight_kg: float | None
    start_date: date
    end_date: date | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class GoalPagination(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool
    has_previous: bool


class PaginatedGoalsResponse(BaseModel):
    items: list[GoalResponse]
    pagination: GoalPagination