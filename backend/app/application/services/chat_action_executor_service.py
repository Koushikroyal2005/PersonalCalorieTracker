from typing import Any

from app.application.services.chat_action_service import (
    chat_action_service,
)
from app.application.services.chat_history_service import (
    chat_history_service,
)
from app.application.services.entry_service import entry_service
from app.application.services.goal_service import goal_service
from app.schemas.chat import ChatMessageType, ChatRole
from app.schemas.entry import EntryCreate
from app.schemas.goal import GoalCreate, GoalUpdate


class ChatActionNotFoundError(Exception):
    pass


class NoActiveGoalError(Exception):
    pass


class UnsupportedChatActionError(Exception):
    pass


class ChatActionExecutorService:
    async def confirm(
        self,
        user_id: str,
        action_id: str,
    ) -> dict[str, Any]:
        action = await chat_action_service.claim(
            user_id,
            action_id,
        )

        if action is None:
            raise ChatActionNotFoundError

        try:
            if action["action_type"] == "log_meal":
                result, message = await self.confirm_meals(
                    user_id,
                    action["payload"],
                )
            elif action["action_type"] == "update_goal":
                result, message = await self.confirm_goal(
                    user_id,
                    action["payload"],
                )
            elif action["action_type"] == "create_goal":
                result, message = await self.create_goal(
                    user_id,
                    action["payload"],
                )
            elif action["action_type"] == "action_sequence":
                result, message = await self.confirm_action_sequence(
                    user_id,
                    action["payload"],
                )
            else:
                raise UnsupportedChatActionError

            completed = await chat_action_service.complete(
                user_id,
                action_id,
                result,
            )
            if not completed:
                raise RuntimeError("Could not complete the chat action")

        except Exception as error:
            await chat_action_service.fail(
                user_id,
                action_id,
                str(error),
            )
            raise

        assistant_message = await chat_history_service.add_message(
            user_id=user_id,
            conversation_id=action["conversation_id"],
            role=ChatRole.ASSISTANT,
            content=message,
            message_type=ChatMessageType.ACTION_RESULT,
            action_id=action_id,
            metadata={
                "action": action["action_type"],
                "status": "completed",
                "result": result,
            },
        )

        return {
            "action_id": action_id,
            "conversation_id": action["conversation_id"],
            "status": "completed",
            "message": message,
            "result": result,
            "assistant_message": assistant_message,
        }

    async def cancel(
        self,
        user_id: str,
        action_id: str,
    ) -> dict[str, Any]:
        action = await chat_action_service.cancel(
            user_id,
            action_id,
        )

        if action is None:
            raise ChatActionNotFoundError

        message = "Okay, I cancelled that action. Nothing was changed."

        assistant_message = await chat_history_service.add_message(
            user_id=user_id,
            conversation_id=action["conversation_id"],
            role=ChatRole.ASSISTANT,
            content=message,
            message_type=ChatMessageType.ACTION_RESULT,
            action_id=action_id,
            metadata={
                "action": action["action_type"],
                "status": "cancelled",
            },
        )

        return {
            "action_id": action_id,
            "conversation_id": action["conversation_id"],
            "status": "cancelled",
            "message": message,
            "result": {},
            "assistant_message": assistant_message,
        }

    async def confirm_meals(
        self,
        user_id: str,
        payload: dict[str, Any],
    ) -> tuple[dict[str, Any], str]:
        entries = [
            EntryCreate.model_validate(entry)
            for entry in payload.get("entries", [])
        ]

        if not entries:
            raise ValueError("The action contains no meal entries")

        entry_ids = await entry_service.bulk_create(
            user_id,
            entries,
        )

        count = len(entry_ids)
        noun = "entry" if count == 1 else "entries"

        return (
            {
                "imported_count": count,
                "entry_ids": entry_ids,
            },
            f"Done! I added {count} meal {noun} to your food log.",
        )

    async def confirm_goal(
        self,
        user_id: str,
        payload: dict[str, Any],
    ) -> tuple[dict[str, Any], str]:
        active_goal = await goal_service.get_active(user_id)

        if active_goal is None:
            raise NoActiveGoalError

        updates = GoalUpdate.model_validate(
            payload.get("goal_update", {})
        )

        updated_goal = await goal_service.update(
            user_id,
            active_goal["id"],
            updates,
        )

        if updated_goal is None:
            raise NoActiveGoalError

        return (
            {"goal": updated_goal},
            "Done! I updated your active health goal.",
        )

    async def create_goal(
        self,
        user_id: str,
        payload: dict[str, Any],
    ) -> tuple[dict[str, Any], str]:
        goal_data = {
            **payload.get("goal_update", {}),
            "is_active": True,
        }
        request = GoalCreate.model_validate(goal_data)
        created_goal = await goal_service.create(user_id, request)

        return (
            {"goal": created_goal},
            "Done! I created and activated your new health goal.",
        )

    async def confirm_action_sequence(
        self,
        user_id: str,
        payload: dict[str, Any],
    ) -> tuple[dict[str, Any], str]:
        steps = payload.get("steps", [])
        if not steps:
            raise ValueError("The action sequence contains no steps")

        # Validate every structured mutation before changing any stored data.
        for step in steps:
            if step.get("tool") == "log_meal":
                for entry in step.get("entries", []):
                    EntryCreate.model_validate(entry)
            elif step.get("tool") == "update_goal":
                GoalUpdate.model_validate(step.get("goal_update", {}))
            elif step.get("tool") == "create_goal":
                GoalCreate.model_validate(
                    {**step.get("goal_update", {}), "is_active": True}
                )

        results: list[dict[str, Any]] = []
        summaries: list[str] = []

        for step in steps:
            tool = step.get("tool")

            if tool == "delete_entries":
                deleted_ids: list[str] = []
                for entry_id in step.get("entry_ids", []):
                    if await entry_service.delete(user_id, entry_id):
                        deleted_ids.append(entry_id)
                count = len(deleted_ids)
                noun = "entry" if count == 1 else "entries"
                results.append(
                    {
                        "tool": tool,
                        "deleted_count": count,
                        "entry_ids": deleted_ids,
                    }
                )
                summaries.append(f"deleted {count} food {noun}")

            elif tool == "log_meal":
                entries = [
                    EntryCreate.model_validate(entry)
                    for entry in step.get("entries", [])
                ]
                entry_ids = await entry_service.bulk_create(user_id, entries)
                count = len(entry_ids)
                noun = "entry" if count == 1 else "entries"
                results.append(
                    {
                        "tool": tool,
                        "imported_count": count,
                        "entry_ids": entry_ids,
                    }
                )
                summaries.append(f"added {count} meal {noun}")

            elif tool == "delete_goal":
                goal_id = step.get("goal_id")
                deleted = bool(
                    goal_id and await goal_service.delete(user_id, goal_id)
                )
                results.append(
                    {
                        "tool": tool,
                        "deleted": deleted,
                        "goal_id": goal_id,
                    }
                )
                summaries.append(
                    "deleted the selected goal"
                    if deleted
                    else "found no selected goal to delete"
                )

            elif tool == "update_goal":
                result, _ = await self.confirm_goal(user_id, step)
                results.append({"tool": tool, **result})
                summaries.append("updated the active goal")

            elif tool == "create_goal":
                result, _ = await self.create_goal(user_id, step)
                results.append({"tool": tool, **result})
                summaries.append("created and activated a new goal")

            elif tool == "activate_previous_goal":
                goal_id = step.get("goal_id")
                activated_goal = (
                    await goal_service.activate(user_id, goal_id, True)
                    if goal_id
                    else None
                )
                results.append(
                    {
                        "tool": tool,
                        "goal": activated_goal,
                        "goal_id": goal_id,
                    }
                )
                summaries.append(
                    "activated the previous goal"
                    if activated_goal
                    else "found no previous goal to activate"
                )

            else:
                raise UnsupportedChatActionError

        sequence_summary = ", then ".join(summaries)
        return (
            {"steps": results},
            f"Done! I {sequence_summary}.",
        )


chat_action_executor_service = ChatActionExecutorService()
