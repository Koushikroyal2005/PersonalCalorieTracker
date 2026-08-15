from datetime import date

from pydantic import BaseModel


class CalorieTrendPoint(BaseModel):
    period: str
    calories: int


class CalorieTrendResponse(BaseModel):
    points: list[CalorieTrendPoint]


class MacroTrendPoint(BaseModel):
    period: str
    protein_g: float
    carbs_g: float
    fat_g: float


class MacroTrendResponse(BaseModel):
    points: list[MacroTrendPoint]


class MicronutrientTotal(BaseModel):
    name: str
    amount: float


class MicronutrientSummaryResponse(BaseModel):
    nutrients: list[MicronutrientTotal]


class GoalMetric(BaseModel):
    target: float
    actual: float
    remaining: float
    percentage: float


class GoalComparisonResponse(BaseModel):
    date: date
    end_date: date | None = None
    has_active_goal: bool
    calories: GoalMetric | None
    protein_g: GoalMetric | None
    carbs_g: GoalMetric | None
    fat_g: GoalMetric | None
