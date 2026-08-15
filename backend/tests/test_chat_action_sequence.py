import pytest

from app.application.services.chat_action_executor_service import (
    chat_action_executor_service,
)
from app.application.services.chat_ai_service import ChatAIService
from app.application.services.entry_service import entry_service
from app.application.services.goal_service import goal_service
from app.schemas.chat import ChatDecision


def meal_payload(food_name: str = "Pizza") -> dict:
    return {
        "meal_type": "lunch",
        "food_name": food_name,
        "quantity_value": 1,
        "quantity_unit": "slice",
        "calories": 285,
        "protein_g": 12,
        "carbs_g": 36,
        "fat_g": 10,
        "micronutrients": {},
        "consumed_at": "2026-08-15T13:00:00+05:30",
        "confidence": 0.8,
        "assumptions": ["Estimated serving"],
    }


def test_chat_decision_parses_ordered_mutation_sequence() -> None:
    decision = ChatDecision.model_validate(
        {
            "action": "action_sequence",
            "response_text": "Review these changes.",
            "tool_call_sequence": [
                {
                    "tool": "delete_entries",
                    "entry_filters": [
                        {
                            "food_name": "Biryani",
                            "meal_type": "lunch",
                            "start_date": "2026-08-15",
                        }
                    ],
                },
                {"tool": "log_meal", "entries": [meal_payload()]},
            ],
            "needs_confirmation": True,
        }
    )

    assert [call.tool for call in decision.tool_call_sequence] == [
        "delete_entries",
        "log_meal",
    ]
    assert decision.tool_call_sequence[0].entry_filters[0].food_name == "Biryani"
    assert decision.tool_call_sequence[1].entries[0].food_name == "Pizza"


def test_multitask_delete_and_replacement_requires_sequence() -> None:
    message = (
        "Delete biryani; pizza for lunch and Maggi for dinner instead."
    )
    assert ChatAIService.requires_action_sequence(message)


def test_date_range_delete_accepts_no_food_name_and_datetime_values() -> None:
    decision = ChatDecision.model_validate(
        {
            "action": "delete_entries",
            "response_text": "Review the selected logs.",
            "entry_filters": [
                {
                    "start_date": "2026-08-13T00:00:00+05:30",
                    "end_date": "2026-08-14T23:59:59+05:30",
                }
            ],
            "end_date": "2026-08-14T23:59:59+05:30",
            "needs_confirmation": True,
        }
    )

    entry_filter = decision.entry_filters[0]
    assert entry_filter.food_name is None
    assert entry_filter.start_date.isoformat() == "2026-08-13"
    assert entry_filter.end_date.isoformat() == "2026-08-14"
    assert decision.end_date.isoformat() == "2026-08-14"


@pytest.mark.asyncio
async def test_action_sequence_executes_tools_in_order(monkeypatch) -> None:
    calls: list[str] = []

    async def fake_delete_entry(_: str, entry_id: str) -> bool:
        calls.append(f"delete_entry:{entry_id}")
        return True

    async def fake_bulk_create(_: str, entries: list) -> list[str]:
        calls.append(f"log_meal:{entries[0].food_name}")
        return ["new-entry-id"]

    async def fake_delete_goal(_: str, goal_id: str) -> bool:
        calls.append(f"delete_goal:{goal_id}")
        return True

    monkeypatch.setattr(entry_service, "delete", fake_delete_entry)
    monkeypatch.setattr(entry_service, "bulk_create", fake_bulk_create)
    monkeypatch.setattr(goal_service, "delete", fake_delete_goal)

    result, message = (
        await chat_action_executor_service.confirm_action_sequence(
            "user-id",
            {
                "steps": [
                    {"tool": "delete_entries", "entry_ids": ["old-entry-id"]},
                    {"tool": "log_meal", "entries": [meal_payload()]},
                    {"tool": "delete_goal", "goal_id": "old-goal-id"},
                ]
            },
        )
    )

    assert calls == [
        "delete_entry:old-entry-id",
        "log_meal:Pizza",
        "delete_goal:old-goal-id",
    ]
    assert [step["tool"] for step in result["steps"]] == [
        "delete_entries",
        "log_meal",
        "delete_goal",
    ]
    assert message == (
        "Done! I deleted 1 food entry, then added 1 meal entry, "
        "then deleted the selected goal."
    )
