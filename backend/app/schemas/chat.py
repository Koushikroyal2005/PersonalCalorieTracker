from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChatRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class ChatMessageType(str, Enum):
    TEXT = "text"
    ACTION_PREVIEW = "action_preview"
    ACTION_RESULT = "action_result"
    ERROR = "error"


class ChatRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    conversation_id: str | None = None
    message: str = Field(min_length=1, max_length=4000)


class ChatConversationResponse(BaseModel):
    id: str
    user_id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ChatMessageResponse(BaseModel):
    id: str
    user_id: str
    conversation_id: str
    role: ChatRole
    content: str
    message_type: ChatMessageType
    action_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ChatPagination(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int
    has_next: bool
    has_previous: bool


class PaginatedConversationsResponse(BaseModel):
    items: list[ChatConversationResponse]
    pagination: ChatPagination


class PaginatedChatMessagesResponse(BaseModel):
    items: list[ChatMessageResponse]
    pagination: ChatPagination


class ChatResponse(BaseModel):
    conversation_id: str
    user_message: ChatMessageResponse
    assistant_message: ChatMessageResponse
    requires_confirmation: bool = False
    action_id: str | None = None


class ProposedMealEntry(BaseModel):
    meal_type: Literal["breakfast", "lunch", "dinner", "snacks"]
    food_name: str = Field(min_length=1, max_length=200)
    quantity_value: float = Field(gt=0)
    quantity_unit: str = Field(min_length=1, max_length=30)
    calories: int = Field(ge=0)
    protein_g: float = Field(default=0, ge=0)
    carbs_g: float = Field(default=0, ge=0)
    fat_g: float = Field(default=0, ge=0)
    micronutrients: dict[str, float] = Field(default_factory=dict)
    consumed_at: datetime
    confidence: float = Field(default=0.5, ge=0, le=1)
    assumptions: list[str] = Field(default_factory=list)

    @field_validator("calories", mode="before")
    @classmethod
    def normalize_calories(cls, value: object) -> object:
        if isinstance(value, float):
            return round(value)

        return value

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, value: object) -> object:
        if isinstance(value, (int, float)) and 1 < value <= 100:
            return value / 100

        return value

    @field_validator("micronutrients", mode="before")
    @classmethod
    def normalize_micronutrients(cls, value: object) -> object:
        return {} if value is None else value

    @field_validator("consumed_at")
    @classmethod
    def ensure_consumed_at_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            india_timezone = timezone(timedelta(hours=5, minutes=30))
            return value.replace(tzinfo=india_timezone)

        return value

    @field_validator("meal_type", mode="before")
    @classmethod
    def normalize_meal_type(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().lower()
            return "snacks" if normalized == "snack" else normalized

        return value

    @field_validator("assumptions", mode="before")
    @classmethod
    def normalize_assumptions(
        cls,
        value: object,
    ) -> list[str] | object:
        if value is None:
            return []

        if isinstance(value, str):
            return [value]

        return value


class ProposedGoalUpdate(BaseModel):
    goal_type: Literal["lose", "gain", "maintain"] | None = None
    daily_calorie_target: int | None = Field(default=None, gt=0)
    daily_protein_target_g: float | None = Field(default=None, ge=0)
    daily_carbs_target_g: float | None = Field(default=None, ge=0)
    daily_fat_target_g: float | None = Field(default=None, ge=0)
    target_weight_kg: float | None = Field(default=None, gt=0)

    @field_validator("goal_type", mode="before")
    @classmethod
    def normalize_goal_type(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        normalized = value.strip().lower().replace(" ", "_")
        if normalized in {"loss", "weight_loss", "lose_weight", "losing"}:
            return "lose"
        if normalized in {"weight_gain", "gain_weight", "gaining"}:
            return "gain"
        if normalized in {"maintenance", "weight_maintenance", "maintain_weight"}:
            return "maintain"
        return normalized


class ProposedEntryFilter(BaseModel):
    food_name: str | None = Field(default=None, min_length=1, max_length=200)
    meal_type: Literal[
        "breakfast",
        "lunch",
        "dinner",
        "snacks",
    ] | None = None
    start_date: date | None = None
    end_date: date | None = None

    @field_validator("meal_type", mode="before")
    @classmethod
    def normalize_meal_type(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().lower()
            return "snacks" if normalized == "snack" else normalized
        return value

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def normalize_dates(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return None
            if "T" in normalized:
                return datetime.fromisoformat(
                    normalized.replace("Z", "+00:00")
                ).date()
        return value


class ProposedToolCall(BaseModel):
    tool: Literal[
        "delete_entries",
        "log_meal",
        "delete_goal",
        "update_goal",
    ]
    entries: list[ProposedMealEntry] = Field(default_factory=list)
    entry_filters: list[ProposedEntryFilter] = Field(default_factory=list)
    goal_update: ProposedGoalUpdate | None = None
    goal_selector: Literal["active", "previous", "latest"] | None = None

    @field_validator("entries", "entry_filters", mode="before")
    @classmethod
    def normalize_lists(cls, value: object) -> object:
        return [] if value is None else value


class ChatDecision(BaseModel):
    action: Literal[
        "general_question",
        "log_meal",
        "today_progress",
        "weekly_summary",
        "list_entries",
        "get_goals",
        "create_goal",
        "update_goal",
        "activate_previous_goal",
        "delete_entries",
        "delete_goal",
        "action_sequence",
        "unknown",
    ]
    response_text: str
    entries: list[ProposedMealEntry] = Field(default_factory=list)
    goal_update: ProposedGoalUpdate | None = None
    entry_filters: list[ProposedEntryFilter] = Field(default_factory=list)
    goal_selector: Literal["active", "previous", "latest"] | None = None
    tool_call_sequence: list[ProposedToolCall] = Field(default_factory=list)
    start_date: date | None = None
    end_date: date | None = None
    meal_type: Literal[
        "breakfast",
        "lunch",
        "dinner",
        "snacks",
    ] | None = None
    needs_confirmation: bool = False

    @field_validator("entries", mode="before")
    @classmethod
    def normalize_entries(cls, value: object) -> object:
        return [] if value is None else value

    @field_validator("entry_filters", "tool_call_sequence", mode="before")
    @classmethod
    def normalize_action_lists(cls, value: object) -> object:
        return [] if value is None else value

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def normalize_optional_dates(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return None
            if "T" in normalized:
                return datetime.fromisoformat(
                    normalized.replace("Z", "+00:00")
                ).date()

        return value

    @field_validator("meal_type", mode="before")
    @classmethod
    def normalize_meal_type(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if not normalized:
                return None
            return "snacks" if normalized == "snack" else normalized

        return value


class ChatActionResultResponse(BaseModel):
    action_id: str
    conversation_id: str
    status: Literal["completed", "cancelled"]
    message: str
    result: dict[str, Any] = Field(default_factory=dict)
    assistant_message: ChatMessageResponse
