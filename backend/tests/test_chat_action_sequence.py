from datetime import date

import pytest

from app.application.services.chat_action_executor_service import (
    chat_action_executor_service,
)
from app.application.services.chat_ai_service import ChatAIService
from app.application.services.chat_service import chat_service
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


def test_sequence_accepts_detailed_list_entries_after_mutations() -> None:
    decision = ChatDecision.model_validate(
        {
            "action": "action_sequence",
            "response_text": "Review, then show yesterday.",
            "tool_call_sequence": [
                {"tool": "log_meal", "entries": [meal_payload()]},
                {
                    "tool": "list_entries",
                    "start_date": "2026-08-15T00:00:00+05:30",
                    "end_date": "2026-08-15T23:59:59+05:30",
                    "detailed": True,
                },
            ],
        }
    )

    list_call = decision.tool_call_sequence[1]
    assert list_call.tool == "list_entries"
    assert list_call.start_date.isoformat() == "2026-08-15"
    assert list_call.end_date.isoformat() == "2026-08-15"
    assert list_call.detailed is True


def test_delete_end_date_without_start_date_is_open_ended() -> None:
    _, end = chat_service.optional_date_bounds(
        None,
        "2026-08-12",
        date(2026, 8, 16),
    )
    start, _ = chat_service.optional_date_bounds(
        None,
        "2026-08-12",
        date(2026, 8, 16),
    )
    assert start is None
    assert end.isoformat() == "2026-08-12T18:29:59.999999+00:00"


def test_goal_enrichment_preserves_multi_action_sequence() -> None:
    decision = ChatDecision.model_validate(
        {
            "action": "action_sequence",
            "response_text": "Review meals and the new goal.",
            "tool_call_sequence": [
                {"tool": "log_meal", "entries": [meal_payload()]},
                {
                    "tool": "create_goal",
                    "goal_update": {"daily_calorie_target": 5000},
                },
            ],
        }
    )

    enriched = ChatAIService.enrich_goal_targets(
        decision,
        "Log this meal and set a new goal with 5000 calories",
    )
    assert enriched.action == "action_sequence"
    assert [call.tool for call in enriched.tool_call_sequence] == [
        "log_meal",
        "create_goal",
    ]


def test_repeated_request_excludes_its_previous_exchange() -> None:
    repeated = "Log one apple for breakfast"
    history = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi!"},
        {"role": "user", "content": repeated},
        {"role": "assistant", "content": "Please confirm the apple."},
    ]

    relevant = ChatAIService.history_before_repeated_request(
        "  LOG one apple   for breakfast ",
        history,
    )
    assert relevant == history[:2]


@pytest.mark.asyncio
async def test_duplicate_goal_calls_merge_into_one_sequence_step(
    monkeypatch,
) -> None:
    async def no_active_goal(_: str):
        return None

    monkeypatch.setattr(goal_service, "get_active", no_active_goal)
    payload, proposal, _ = await chat_service.prepare_action_sequence(
        "user-id",
        [
            {"tool": "log_meal", "entries": [meal_payload("Sandwich")]},
            {
                "tool": "create_goal",
                "goal_update": {
                    "goal_type": None,
                    "daily_calorie_target": 5000,
                    "daily_protein_target_g": None,
                    "daily_carbs_target_g": None,
                    "daily_fat_target_g": None,
                },
            },
            {"tool": "log_meal", "entries": [meal_payload("Badam shake")]},
            {
                "tool": "create_goal",
                "goal_update": {"daily_protein_target_g": 140},
            },
        ],
    )

    assert [step["tool"] for step in payload["steps"]] == [
        "log_meal",
        "create_goal",
        "log_meal",
    ]
    assert proposal["goal_update"]["daily_calorie_target"] == 5000
    assert proposal["goal_update"]["daily_protein_target_g"] == 140
    assert proposal["goal_update"]["goal_type"] == "maintain"


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

    async def fake_create_goal(_: str, goal) -> dict:
        calls.append(f"create_goal:{goal.daily_calorie_target}")
        return {"id": "new-goal-id", "daily_calorie_target": 5000}

    async def fake_list_entries(**_) -> dict:
        calls.append("list_entries")
        return {
            "items": [
                {
                    "id": "yesterday-entry",
                    "food_name": "Cheese cake",
                    "quantity_value": 1,
                    "quantity_unit": "slice",
                    "calories": 320,
                    "protein_g": 6,
                    "carbs_g": 32,
                    "fat_g": 18,
                    "micronutrients": {"calcium_mg": 80},
                }
            ],
            "pagination": {"total": 1},
            "totals": {
                "calories": 320,
                "protein_g": 6,
                "carbs_g": 32,
                "fat_g": 18,
            },
        }

    monkeypatch.setattr(entry_service, "delete", fake_delete_entry)
    monkeypatch.setattr(entry_service, "bulk_create", fake_bulk_create)
    monkeypatch.setattr(goal_service, "delete", fake_delete_goal)
    monkeypatch.setattr(goal_service, "create", fake_create_goal)
    monkeypatch.setattr(entry_service, "list", fake_list_entries)

    result, message = (
        await chat_action_executor_service.confirm_action_sequence(
            "user-id",
            {
                "steps": [
                    {"tool": "delete_entries", "entry_ids": ["old-entry-id"]},
                    {"tool": "log_meal", "entries": [meal_payload()]},
                    {"tool": "delete_goal", "goal_id": "old-goal-id"},
                    {
                        "tool": "create_goal",
                        "goal_update": {
                            "goal_type": "maintain",
                            "daily_calorie_target": 5000,
                            "daily_protein_target_g": 120,
                            "daily_carbs_target_g": 220,
                            "daily_fat_target_g": 65,
                        },
                    },
                    {
                        "tool": "list_entries",
                        "start_date": "2026-08-15",
                        "end_date": "2026-08-15",
                        "detailed": True,
                    },
                ]
            },
        )
    )

    assert calls == [
        "delete_entry:old-entry-id",
        "log_meal:Pizza",
        "delete_goal:old-goal-id",
        "create_goal:5000",
        "list_entries",
    ]
    assert [step["tool"] for step in result["steps"]] == [
        "delete_entries",
        "log_meal",
        "delete_goal",
        "create_goal",
        "list_entries",
    ]
    assert message == (
        "Done! I deleted 1 food entry, then added 1 meal entry, "
        "then deleted the selected goal, then created and activated a new goal, "
        "then checked the requested food log.\n\n"
        "Food details for 2026-08-15 to 2026-08-15:\n"
        "- Cheese cake: 1 slice, 320 kcal; protein 6 g, carbs 32 g, fat 18 g; "
        "micronutrients: calcium mg 80"
    )
