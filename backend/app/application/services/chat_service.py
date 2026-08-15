from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from app.application.services.chat_action_service import (
    chat_action_service,
)
from app.application.services.chat_ai_service import chat_ai_service
from app.application.services.chat_history_service import (
    chat_history_service,
)
from app.application.services.entry_service import entry_service
from app.application.services.goal_service import goal_service
from app.application.services.report_service import report_service
from app.schemas.chat import (
    ChatMessageType,
    ChatRequest,
    ChatRole,
)
from app.schemas.entry import MealType

INDIA_TIMEZONE = timezone(timedelta(hours=5, minutes=30))


class ConversationNotFoundError(Exception):
    pass


class ChatService:
    @staticmethod
    def date_bounds(
        start_date: date,
        end_date: date,
    ) -> tuple[datetime, datetime]:
        start = datetime.combine(
            start_date,
            time.min,
            INDIA_TIMEZONE,
        ).astimezone(timezone.utc)

        end = datetime.combine(
            end_date,
            time.max,
            INDIA_TIMEZONE,
        ).astimezone(timezone.utc)

        return start, end

    async def prepare_action_sequence(
        self,
        user_id: str,
        tool_calls: list[dict[str, Any]],
    ) -> tuple[dict[str, Any], dict[str, Any], str]:
        today = datetime.now(INDIA_TIMEZONE).date()
        prepared_steps: list[dict[str, Any]] = []
        proposed_entries: list[dict[str, Any]] = []
        proposed_deletions: list[dict[str, Any]] = []
        proposed_goal_update: dict[str, Any] = {}
        descriptions: list[str] = []

        create_goal_updates: dict[str, Any] = {}
        has_create_goal = any(
            call.get("tool") == "create_goal" for call in tool_calls
        )
        if has_create_goal:
            for call in tool_calls:
                if call.get("tool") in {"create_goal", "update_goal"}:
                    create_goal_updates.update(call.get("goal_update") or {})
        create_goal_prepared = False

        for call in tool_calls:
            tool = call.get("tool")

            if tool == "delete_entries":
                matched_by_id: dict[str, dict[str, Any]] = {}
                missing_names: list[str] = []

                for entry_filter in call.get("entry_filters", []):
                    selected_start = entry_filter.get("start_date") or today
                    selected_end = entry_filter.get("end_date") or selected_start
                    start, end = self.date_bounds(
                        date.fromisoformat(selected_start)
                        if isinstance(selected_start, str)
                        else selected_start,
                        date.fromisoformat(selected_end)
                        if isinstance(selected_end, str)
                        else selected_end,
                    )
                    meal_type = entry_filter.get("meal_type")
                    food_name = entry_filter.get("food_name")
                    page = 1
                    filter_matches: list[dict[str, Any]] = []
                    while True:
                        matches = await entry_service.list(
                            user_id=user_id,
                            page=page,
                            limit=100,
                            start_date=start,
                            end_date=end,
                            meal_type=MealType(meal_type) if meal_type else None,
                            search=food_name,
                        )
                        filter_matches.extend(matches["items"])
                        if not matches["pagination"]["has_next"]:
                            break
                        page += 1

                    if not filter_matches:
                        missing_names.append(food_name or "the selected date range")
                    for item in filter_matches:
                        matched_by_id[item["id"]] = item

                matched_entries = list(matched_by_id.values())
                prepared_steps.append(
                    {
                        "tool": "delete_entries",
                        "entry_ids": [item["id"] for item in matched_entries],
                        "entries": matched_entries,
                    }
                )
                proposed_deletions.extend(
                    {
                        "kind": "food_entry",
                        "id": item["id"],
                        "label": item["food_name"],
                        "meal_type": item["meal_type"],
                        "calories": item["calories"],
                        "consumed_at": item["consumed_at"],
                    }
                    for item in matched_entries[:20]
                )
                description = f"delete {len(matched_entries)} matching food entries"
                if missing_names:
                    description += (
                        " (no match for " + ", ".join(missing_names) + ")"
                    )
                descriptions.append(description)

            elif tool == "log_meal":
                entries = call.get("entries", [])
                if entries:
                    prepared_steps.append({"tool": "log_meal", "entries": entries})
                    proposed_entries.extend(entries)
                    descriptions.append(f"add {len(entries)} meal entries")

            elif tool == "delete_goal":
                goals = await goal_service.list(user_id, page=1, limit=100)
                selector = call.get("goal_selector") or "active"
                if selector == "active":
                    selected_goal = next(
                        (goal for goal in goals["items"] if goal["is_active"]),
                        None,
                    )
                elif selector == "previous":
                    selected_goal = next(
                        (goal for goal in goals["items"] if not goal["is_active"]),
                        None,
                    )
                else:
                    selected_goal = goals["items"][0] if goals["items"] else None

                prepared_steps.append(
                    {
                        "tool": "delete_goal",
                        "goal_id": selected_goal["id"] if selected_goal else None,
                        "goal": selected_goal,
                    }
                )
                if selected_goal:
                    proposed_deletions.append(
                        {
                            "kind": "goal",
                            "id": selected_goal["id"],
                            "label": f'{selected_goal["goal_type"]} weight goal',
                            "is_active": selected_goal["is_active"],
                        }
                    )
                    descriptions.append(f"delete the {selector} goal")
                else:
                    descriptions.append(f"skip {selector} goal (not found)")

            elif tool == "update_goal" and not has_create_goal:
                goal_update = call.get("goal_update") or {}
                if goal_update:
                    prepared_steps.append(
                        {"tool": "update_goal", "goal_update": goal_update}
                    )
                    proposed_goal_update.update(goal_update)
                    descriptions.append("update the active goal")

            elif tool == "create_goal" and not create_goal_prepared:
                active_goal = await goal_service.get_active(user_id)
                goal_update = {
                    "goal_type": "maintain",
                    "daily_calorie_target": 2000,
                    "daily_protein_target_g": 120,
                    "daily_carbs_target_g": 220,
                    "daily_fat_target_g": 65,
                }
                if active_goal:
                    goal_update.update(
                        {
                            "goal_type": active_goal["goal_type"],
                            "daily_calorie_target": active_goal[
                                "daily_calorie_target"
                            ],
                            "daily_protein_target_g": active_goal[
                                "daily_protein_target_g"
                            ],
                            "daily_carbs_target_g": active_goal[
                                "daily_carbs_target_g"
                            ],
                            "daily_fat_target_g": active_goal[
                                "daily_fat_target_g"
                            ],
                            "target_weight_kg": active_goal.get(
                                "target_weight_kg"
                            ),
                        }
                    )
                goal_update.update(create_goal_updates)
                prepared_steps.append(
                    {"tool": "create_goal", "goal_update": goal_update}
                )
                proposed_goal_update.update(goal_update)
                descriptions.append("create and activate a new goal")
                create_goal_prepared = True

            elif tool == "activate_previous_goal":
                goals = await goal_service.list(user_id, page=1, limit=100)
                previous_goal = next(
                    (goal for goal in goals["items"] if not goal["is_active"]),
                    None,
                )
                prepared_steps.append(
                    {
                        "tool": "activate_previous_goal",
                        "goal_id": previous_goal["id"] if previous_goal else None,
                    }
                )
                descriptions.append(
                    "activate the previous goal"
                    if previous_goal
                    else "skip previous goal (not found)"
                )

        proposal = {
            "entries": proposed_entries,
            "deletions": proposed_deletions,
            "deletion_count": sum(
                len(step.get("entry_ids", []))
                + (1 if step.get("tool") == "delete_goal" and step.get("goal_id") else 0)
                for step in prepared_steps
            ),
            "goal_update": proposed_goal_update or None,
            "steps": prepared_steps,
        }
        numbered = "; ".join(
            f"{index}. {description}"
            for index, description in enumerate(descriptions, start=1)
        )
        response_text = (
            f"I prepared these actions in order: {numbered}. "
            "Please review them and confirm once to run each step sequentially."
        )
        return {"steps": prepared_steps}, proposal, response_text

    async def process(
        self,
        user_id: str,
        request: ChatRequest,
    ) -> dict[str, Any]:
        if request.conversation_id:
            conversation = await chat_history_service.get_conversation(
                user_id,
                request.conversation_id,
            )
            if conversation is None:
                raise ConversationNotFoundError

            conversation_id = conversation["id"]
        else:
            conversation = await chat_history_service.create_conversation(
                user_id,
                request.message[:100],
            )
            conversation_id = conversation["id"]

        history = await chat_history_service.recent_messages(
            user_id,
            conversation_id,
            limit=10,
        )

        user_message = await chat_history_service.add_message(
            user_id=user_id,
            conversation_id=conversation_id,
            role=ChatRole.USER,
            content=request.message,
        )

        decision = await chat_ai_service.interpret(
            request.message,
            history,
        )

        response_text = decision.response_text
        metadata: dict[str, Any] = {
            "action": decision.action,
        }
        action_id = None
        message_type = ChatMessageType.TEXT
        requires_confirmation = False

        if decision.action == "list_entries":
            detailed = any(
                phrase in request.message.lower()
                for phrase in (
                    "detail",
                    "elaborate",
                    "macro",
                    "micro",
                    "nutrient",
                    "breakdown",
                )
            )
            response_text, result = await self.list_entries(
                user_id,
                decision.start_date,
                decision.end_date,
                decision.meal_type,
                detailed=detailed,
            )
            metadata["result"] = result

        elif decision.action == "today_progress":
            response_text, result = await self.today_progress(user_id)
            metadata["result"] = result

        elif decision.action == "weekly_summary":
            response_text, result = await self.weekly_summary(user_id)
            metadata["result"] = result

        elif decision.action == "get_goals":
            response_text, result = await self.get_goals(user_id)
            metadata["result"] = result

        elif decision.action in {
            "action_sequence",
            "delete_entries",
            "delete_goal",
        }:
            if decision.action == "action_sequence":
                tool_calls = [
                    call.model_dump(mode="json")
                    for call in decision.tool_call_sequence
                ]
            elif decision.action == "delete_entries":
                tool_calls = [
                    {
                        "tool": "delete_entries",
                        "entry_filters": [
                            entry_filter.model_dump(mode="json")
                            for entry_filter in decision.entry_filters
                        ],
                    }
                ]
            else:
                tool_calls = [
                    {
                        "tool": "delete_goal",
                        "goal_selector": decision.goal_selector or "active",
                    }
                ]

            if not tool_calls:
                response_text = (
                    "I could not identify the actions to perform. "
                    "Please state each requested change explicitly."
                )
                message_type = ChatMessageType.ERROR
            else:
                payload, proposal, response_text = (
                    await self.prepare_action_sequence(user_id, tool_calls)
                )
                if not payload["steps"]:
                    response_text = (
                        "I could not prepare any valid actions from that request."
                    )
                    message_type = ChatMessageType.ERROR
                else:
                    action_id = await chat_action_service.create(
                        user_id,
                        conversation_id,
                        "action_sequence",
                        payload,
                    )
                    metadata["action"] = "action_sequence"
                    metadata["proposal"] = proposal
                    message_type = ChatMessageType.ACTION_PREVIEW
                    requires_confirmation = True

        elif decision.action == "log_meal":
            if not decision.entries:
                response_text = (
                    "I could not identify a complete meal entry. "
                    "Please include the food, quantity, and meal type."
                )
                message_type = ChatMessageType.ERROR
            else:
                payload = {
                    "entries": [
                        entry.model_dump(mode="json")
                        for entry in decision.entries
                    ]
                }

                action_id = await chat_action_service.create(
                    user_id,
                    conversation_id,
                    "log_meal",
                    payload,
                )

                metadata["proposal"] = payload
                message_type = ChatMessageType.ACTION_PREVIEW
                requires_confirmation = True

        elif decision.action == "create_goal":
            goal_updates = (
                decision.goal_update.model_dump(exclude_none=True, mode="json")
                if decision.goal_update
                else {}
            )
            response_text = (
                "I opened the new-goal form with sensible defaults and any "
                "targets you provided. Review or change the values there. "
                "Shall I save and activate this new goal?"
            )
            metadata.update(
                {
                    "open_goal_form": True,
                    "proposal": {"goal_update": goal_updates},
                }
            )

        elif decision.action == "activate_previous_goal":
            goals = await goal_service.list(user_id, page=1, limit=100)
            previous_goal = next(
                (goal for goal in goals["items"] if not goal["is_active"]),
                None,
            )
            if previous_goal is None:
                response_text = (
                    "I could not find an older inactive goal to activate. "
                    "I opened Goals so you can review your saved goals."
                )
                metadata["result"] = {"activated_goal": None}
            else:
                activated_goal = await goal_service.activate(
                    user_id,
                    previous_goal["id"],
                    True,
                )
                response_text = (
                    "Done! I deactivated the current goal and activated your "
                    "most recent previous goal. I opened Goals so you can see it."
                )
                metadata["result"] = {"activated_goal": activated_goal}
            metadata["open_goals_page"] = True

        elif decision.action == "update_goal":
            goal_updates = (
                decision.goal_update.model_dump(
                    exclude_none=True,
                    mode="json",
                )
                if decision.goal_update
                else {}
            )

            active_goal = await goal_service.get_active(user_id)
            required_goal_fields = {
                "goal_type",
                "daily_calorie_target",
                "daily_protein_target_g",
                "daily_carbs_target_g",
                "daily_fat_target_g",
            }
            missing_goal_fields = sorted(
                required_goal_fields - goal_updates.keys()
            )

            if not goal_updates:
                response_text = (
                    "I could not identify which goal value to change. "
                    "Please include the target and its new value."
                )
                message_type = ChatMessageType.ERROR
            elif active_goal is None and missing_goal_fields:
                readable_fields = ", ".join(
                    field.replace("daily_", "").replace("_target", "")
                    .replace("_g", "").replace("_", " ")
                    for field in missing_goal_fields
                )
                response_text = (
                    "You do not have an active goal yet. To create one, "
                    f"please also provide: {readable_fields}."
                )
                metadata["missing_fields"] = missing_goal_fields
                message_type = ChatMessageType.ERROR
            else:
                payload = {"goal_update": goal_updates}
                action_type = (
                    "update_goal" if active_goal is not None else "create_goal"
                )
                action_id = await chat_action_service.create(
                    user_id,
                    conversation_id,
                    action_type,
                    payload,
                )

                if action_type == "create_goal":
                    response_text = (
                        "I prepared your new health goal. Review the targets "
                        "below and confirm to activate it."
                    )
                else:
                    response_text = (
                        "I prepared those changes to your active goal. "
                        "Review and confirm them below."
                    )
                metadata["action"] = action_type
                metadata["proposal"] = payload
                message_type = ChatMessageType.ACTION_PREVIEW
                requires_confirmation = True

        assistant_message = await chat_history_service.add_message(
            user_id=user_id,
            conversation_id=conversation_id,
            role=ChatRole.ASSISTANT,
            content=response_text,
            message_type=message_type,
            action_id=action_id,
            metadata=metadata,
        )

        return {
            "conversation_id": conversation_id,
            "user_message": user_message,
            "assistant_message": assistant_message,
            "requires_confirmation": requires_confirmation,
            "action_id": action_id,
        }

    async def list_entries(
        self,
        user_id: str,
        start_date: date | None,
        end_date: date | None,
        meal_type: str | None,
        detailed: bool = False,
    ) -> tuple[str, dict[str, Any]]:
        today = datetime.now(INDIA_TIMEZONE).date()
        selected_start = start_date or today
        selected_end = end_date or selected_start
        start, end = self.date_bounds(selected_start, selected_end)

        result = await entry_service.list(
            user_id=user_id,
            page=1,
            limit=100,
            start_date=start,
            end_date=end,
            meal_type=MealType(meal_type) if meal_type else None,
            search=None,
        )

        items = result["items"]

        if not items:
            meal_label = f" {meal_type}" if meal_type else ""
            return (
                (
                    f"No{meal_label} entries were found between "
                    f"{selected_start} and {selected_end}."
                ),
                result,
            )

        if detailed:
            details = []
            for item in items[:10]:
                micronutrients = item.get("micronutrients") or {}
                micro_text = ", ".join(
                    f"{name.replace('_', ' ')} {value:g}"
                    for name, value in micronutrients.items()
                ) or "no micronutrients recorded"
                details.append(
                    f'{item["food_name"]}: {item["quantity_value"]:g} '
                    f'{item["quantity_unit"]}; {item["calories"]} kcal; '
                    f'protein {item["protein_g"]:g} g, '
                    f'carbs {item["carbs_g"]:g} g, '
                    f'fat {item["fat_g"]:g} g; micronutrients: {micro_text}'
                )
            return (
                f"Here are the full nutrition details for "
                f"{result['pagination']['total']} entries:\n" + "\n".join(details),
                result,
            )

        preview = ", ".join(
            f'{item["food_name"]} ({item["calories"]} kcal)'
            for item in items[:10]
        )

        return (
            f"I found {result['pagination']['total']} entries: {preview}.",
            result,
        )

    async def today_progress(
        self,
        user_id: str,
    ) -> tuple[str, dict[str, Any]]:
        today = datetime.now(INDIA_TIMEZONE).date()
        start, end = self.date_bounds(today, today)

        entries = await entry_service.list(
            user_id=user_id,
            page=1,
            limit=1,
            start_date=start,
            end_date=end,
            meal_type=None,
            search=None,
        )
        goal = await goal_service.get_active(user_id)
        totals = entries["totals"]

        if goal is None:
            text = (
                f"Today you consumed {totals['calories']:.0f} kcal, "
                f"{totals['protein_g']:.1f} g protein, "
                f"{totals['carbs_g']:.1f} g carbs and "
                f"{totals['fat_g']:.1f} g fat. "
                "You do not currently have an active goal."
            )
        else:
            remaining = (
                goal["daily_calorie_target"] - totals["calories"]
            )
            text = (
                f"Today you consumed {totals['calories']:.0f} of "
                f"{goal['daily_calorie_target']} kcal. "
                f"You have {remaining:.0f} kcal remaining. "
                f"Protein is {totals['protein_g']:.1f} of "
                f"{goal['daily_protein_target_g']:.1f} g."
            )

        return text, {"totals": totals, "goal": goal}

    async def weekly_summary(
        self,
        user_id: str,
    ) -> tuple[str, dict[str, Any]]:
        today = datetime.now(INDIA_TIMEZONE).date()
        start_date = today - timedelta(days=6)
        start, end = self.date_bounds(start_date, today)

        entries = await entry_service.list(
            user_id=user_id,
            page=1,
            limit=1,
            start_date=start,
            end_date=end,
            meal_type=None,
            search=None,
        )
        micros = await report_service.micronutrient_summary(
            user_id,
            "7d",
            start_date,
            today,
        )

        totals = entries["totals"]
        average = totals["calories"] / 7

        text = (
            f"During the last seven days you logged "
            f"{entries['pagination']['total']} food entries and consumed "
            f"{totals['calories']:.0f} kcal, averaging "
            f"{average:.0f} kcal per day. Total protein was "
            f"{totals['protein_g']:.1f} g, carbs "
            f"{totals['carbs_g']:.1f} g and fat "
            f"{totals['fat_g']:.1f} g."
        )

        return text, {
            "start_date": start_date.isoformat(),
            "end_date": today.isoformat(),
            "totals": totals,
            "micronutrients": micros["nutrients"],
        }

    async def get_goals(
        self,
        user_id: str,
    ) -> tuple[str, dict[str, Any]]:
        goal = await goal_service.get_active(user_id)

        if goal is None:
            return (
                "You do not currently have an active health goal.",
                {"active_goal": None},
            )

        text = (
            f"Your active goal is to {goal['goal_type']} weight with "
            f"{goal['daily_calorie_target']} kcal, "
            f"{goal['daily_protein_target_g']:.1f} g protein, "
            f"{goal['daily_carbs_target_g']:.1f} g carbs and "
            f"{goal['daily_fat_target_g']:.1f} g fat per day."
        )

        if goal.get("target_weight_kg") is not None:
            text += (
                f" Your target weight is "
                f"{goal['target_weight_kg']:.1f} kg."
            )

        return text, {"active_goal": goal}


chat_service = ChatService()
