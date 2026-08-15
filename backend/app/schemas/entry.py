import math
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MealType(str, Enum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACKS = "snacks"


class EntryCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    meal_type: MealType
    food_name: str = Field(min_length=1, max_length=200)
    quantity_value: float = Field(gt=0, le=100000)
    quantity_unit: str = Field(min_length=1, max_length=30)
    calories: int = Field(ge=0, le=100000)
    protein_g: float = Field(default=0, ge=0, le=10000)
    carbs_g: float = Field(default=0, ge=0, le=10000)
    fat_g: float = Field(default=0, ge=0, le=10000)
    micronutrients: dict[str, float] = Field(default_factory=dict)
    consumed_at: datetime

    @field_validator("consumed_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("consumed_at must include a timezone")
        return value

    @field_validator("micronutrients")
    @classmethod
    def validate_micronutrients(
        cls,
        value: dict[str, float],
    ) -> dict[str, float]:
        if len(value) > 100:
            raise ValueError("A maximum of 100 micronutrients is allowed")

        for name, amount in value.items():
            if not name.strip():
                raise ValueError("Micronutrient names cannot be empty")
            if amount < 0 or not math.isfinite(amount):
                raise ValueError("Micronutrient amounts must be finite and non-negative")

        return value


class EntryUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    meal_type: MealType | None = None
    food_name: str | None = Field(default=None, min_length=1, max_length=200)
    quantity_value: float | None = Field(default=None, gt=0, le=100000)
    quantity_unit: str | None = Field(default=None, min_length=1, max_length=30)
    calories: int | None = Field(default=None, ge=0, le=100000)
    protein_g: float | None = Field(default=None, ge=0, le=10000)
    carbs_g: float | None = Field(default=None, ge=0, le=10000)
    fat_g: float | None = Field(default=None, ge=0, le=10000)
    micronutrients: dict[str, float] | None = None
    consumed_at: datetime | None = None

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> "EntryUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self

    @field_validator("consumed_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("consumed_at must include a timezone")
        return value

    @field_validator("micronutrients")
    @classmethod
    def validate_micronutrients(
        cls,
        value: dict[str, float] | None,
    ) -> dict[str, float] | None:
        if value is None:
            return value

        if len(value) > 100:
            raise ValueError("A maximum of 100 micronutrients is allowed")

        for name, amount in value.items():
            if not name.strip() or amount < 0 or not math.isfinite(amount):
                raise ValueError("Invalid micronutrient name or amount")

        return value


class EntryResponse(BaseModel):
    id: str
    user_id: str
    meal_type: MealType
    food_name: str
    quantity_value: float
    quantity_unit: str
    calories: int
    protein_g: float
    carbs_g: float
    fat_g: float
    micronutrients: dict[str, float]
    consumed_at: datetime
    created_at: datetime
    updated_at: datetime


class PaginationMetadata(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool
    has_previous: bool


class EntryNutritionTotals(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


class PaginatedEntriesResponse(BaseModel):
    items: list[EntryResponse]
    pagination: PaginationMetadata
    totals: EntryNutritionTotals
