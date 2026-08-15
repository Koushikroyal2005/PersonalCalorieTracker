from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.entry import EntryCreate
from app.schemas.goal import GoalCreate
from app.schemas.nutrition_extraction import NutritionExtractionResponse


def test_entry_accepts_dynamic_micronutrients() -> None:
    entry = EntryCreate(
        meal_type="breakfast",
        food_name="Apple juice",
        quantity_value=1,
        quantity_unit="glass",
        calories=110,
        micronutrients={"potassium_mg": 250, "magnesium_mg": 12},
        consumed_at=datetime.now(timezone.utc),
    )

    assert entry.micronutrients["magnesium_mg"] == 12


def test_entry_rejects_negative_dynamic_micronutrient() -> None:
    with pytest.raises(ValidationError):
        EntryCreate(
            meal_type="snacks",
            food_name="Invalid food",
            quantity_value=1,
            quantity_unit="serving",
            calories=10,
            micronutrients={"magnesium_mg": -1},
            consumed_at=datetime.now(timezone.utc),
        )


def test_goal_rejects_end_date_before_start_date() -> None:
    with pytest.raises(ValidationError):
        GoalCreate(
            goal_type="maintain",
            daily_calorie_target=2000,
            daily_protein_target_g=100,
            daily_carbs_target_g=200,
            daily_fat_target_g=60,
            start_date=date(2026, 8, 15),
            end_date=date(2026, 8, 14),
        )


def test_ai_extraction_accepts_new_nutrient_keys() -> None:
    extraction = NutritionExtractionResponse(
        source_type="nutrition_label",
        food_name="Milk",
        quantity_value=1,
        quantity_unit="cup",
        calories=120,
        protein_g=8,
        carbs_g=12,
        fat_g=5,
        micronutrients={"calcium_mg": 300, "vitamin_b12_mcg": 1.2},
        confidence=0.95,
        assumptions=[],
        requires_review=False,
    )

    assert extraction.micronutrients["vitamin_b12_mcg"] == 1.2
