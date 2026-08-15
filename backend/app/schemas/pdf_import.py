from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.entry import EntryCreate


class PDFExtractedEntry(BaseModel):
    row_number: int = Field(ge=1)
    meal_type: Literal["breakfast", "lunch", "dinner", "snacks"]
    food_name: str = Field(min_length=1, max_length=200)
    quantity_value: float = Field(gt=0)
    quantity_unit: str = Field(min_length=1, max_length=30)
    calories: int = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    micronutrients: dict[str, float] = Field(default_factory=dict)
    consumed_at: datetime
    confidence: float = Field(ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)

    @field_validator("consumed_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("consumed_at must include a timezone")
        return value


class PDFExtractionResult(BaseModel):
    entries: list[PDFExtractedEntry] = Field(max_length=500)
    document_warnings: list[str] = Field(default_factory=list)


class PDFImportPreviewResponse(BaseModel):
    filename: str
    total_entries: int
    entries: list[PDFExtractedEntry]
    warnings: list[str]


class PDFImportConfirmRequest(BaseModel):
    entries: list[EntryCreate] = Field(min_length=1, max_length=500)

    @field_validator("entries")
    @classmethod
    def reject_duplicate_rows(
        cls,
        entries: list[EntryCreate],
    ) -> list[EntryCreate]:
        unique_rows: set[tuple[str, str, datetime]] = set()

        for entry in entries:
            row_key = (
                entry.food_name.casefold(),
                entry.meal_type.value,
                entry.consumed_at,
            )

            if row_key in unique_rows:
                raise ValueError(
                    "Duplicate food entries were found in the import"
                )

            unique_rows.add(row_key)

        return entries


class PDFImportConfirmResponse(BaseModel):
    imported_count: int
    entry_ids: list[str]
