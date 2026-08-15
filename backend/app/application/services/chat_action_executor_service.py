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


chat_action_executor_service = ChatActionExecutorService()
