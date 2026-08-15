import math
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class NutritionExtractionResponse(BaseModel):
    source_type: Literal["nutrition_label", "plated_food", "unknown"]
    food_name: str = Field(min_length=1, max_length=200)
    quantity_value: float = Field(ge=0.01)
    quantity_unit: str = Field(min_length=1, max_length=30)
    calories: int = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    micronutrients: dict[str, float] = Field(default_factory=dict)
    confidence: float = Field(ge=0, le=1)
    assumptions: list[str]
    requires_review: bool

    @field_validator("source_type", mode="before")
    @classmethod
    def normalize_source_type(cls, value: object) -> object:
        if value is None:
            return "unknown"
        if not isinstance(value, str):
            return value

        normalized = value.strip().lower().replace(" ", "_")
        if normalized in {"label", "product_label", "nutrition_facts"}:
            return "nutrition_label"
        if normalized in {"food", "plate", "meal", "plate_of_food"}:
            return "plated_food"
        return normalized

    @field_validator("calories", mode="before")
    @classmethod
    def normalize_calories(cls, value: object) -> object:
        if value is None:
            return 0
        return round(value) if isinstance(value, float) else value

    @field_validator("protein_g", "carbs_g", "fat_g", mode="before")
    @classmethod
    def normalize_macros(cls, value: object) -> object:
        return 0 if value is None else value

    @field_validator("food_name", mode="before")
    @classmethod
    def normalize_food_name(cls, value: object) -> object:
        return "Unidentified food" if value is None else value

    @field_validator("quantity_value", mode="before")
    @classmethod
    def normalize_quantity_value(cls, value: object) -> object:
        if value is None or value == 0:
            return 1
        return value

    @field_validator("quantity_unit", mode="before")
    @classmethod
    def normalize_quantity_unit(cls, value: object) -> object:
        return "serving" if value is None else value

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, value: object) -> object:
        if value is None:
            return 0
        if isinstance(value, (int, float)) and 1 < value <= 100:
            return value / 100
        return value

    @field_validator("requires_review", mode="before")
    @classmethod
    def normalize_requires_review(cls, value: object) -> object:
        return True if value is None else value

    @field_validator("assumptions", mode="before")
    @classmethod
    def normalize_assumptions(cls, value: object) -> object:
        if value is None:
            return []
        return [value] if isinstance(value, str) else value

    @field_validator("micronutrients", mode="before")
    @classmethod
    def validate_micronutrients(
        cls,
        value: object,
    ) -> object:
        if value is None:
            return {}
        if not isinstance(value, dict):
            return value
        for name, amount in value.items():
            if (
                not isinstance(name, str)
                or not isinstance(amount, (int, float))
                or not name.strip()
                or amount < 0
                or not math.isfinite(amount)
            ):
                raise ValueError("Invalid micronutrient name or amount")
        return value

    @model_validator(mode="after")
    def require_review_for_unknown(self) -> "NutritionExtractionResponse":
        if self.source_type == "unknown" or self.confidence < 0.8:
            self.requires_review = True
        return self
