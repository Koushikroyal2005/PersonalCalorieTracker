from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument

from app.infrastructure.database import mongodb


class ChatActionService:
    @property
    def collection(self):
        if mongodb.database is None:
            raise RuntimeError("Database is not connected")
        return mongodb.database["chat_actions"]

    async def create(
        self,
        user_id: str,
        conversation_id: str,
        action_type: str,
        payload: dict[str, Any],
    ) -> str:
        now = datetime.now(timezone.utc)
        document = {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "action_type": action_type,
            "payload": payload,
            "status": "pending",
            "result": None,
            "created_at": now,
            "updated_at": now,
        }

        result = await self.collection.insert_one(document)
        return str(result.inserted_id)

    async def claim(
        self,
        user_id: str,
        action_id: str,
    ) -> dict[str, Any] | None:
        if not ObjectId.is_valid(action_id):
            return None

        document = await self.collection.find_one_and_update(
            {
                "_id": ObjectId(action_id),
                "user_id": user_id,
                "status": "pending",
            },
            {
                "$set": {
                    "status": "processing",
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            return_document=ReturnDocument.AFTER,
        )

        return self.serialize(document) if document else None

    async def complete(
        self,
        user_id: str,
        action_id: str,
        result: dict[str, Any],
    ) -> bool:
        if not ObjectId.is_valid(action_id):
            return False

        update_result = await self.collection.update_one(
            {
                "_id": ObjectId(action_id),
                "user_id": user_id,
                "status": "processing",
            },
            {
                "$set": {
                    "status": "completed",
                    "result": result,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

        return update_result.modified_count == 1

    async def fail(
        self,
        user_id: str,
        action_id: str,
        error_message: str,
    ) -> None:
        if not ObjectId.is_valid(action_id):
            return

        await self.collection.update_one(
            {
                "_id": ObjectId(action_id),
                "user_id": user_id,
                "status": "processing",
            },
            {
                "$set": {
                    "status": "failed",
                    "error": error_message,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )

    async def cancel(
        self,
        user_id: str,
        action_id: str,
    ) -> dict[str, Any] | None:
        if not ObjectId.is_valid(action_id):
            return None

        document = await self.collection.find_one_and_update(
            {
                "_id": ObjectId(action_id),
                "user_id": user_id,
                "status": "pending",
            },
            {
                "$set": {
                    "status": "cancelled",
                    "updated_at": datetime.now(timezone.utc),
                }
            },
            return_document=ReturnDocument.AFTER,
        )

        return self.serialize(document) if document else None

    @staticmethod
    def serialize(
        document: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "id": str(document["_id"]),
            **{
                key: value
                for key, value in document.items()
                if key != "_id"
            },
        }


chat_action_service = ChatActionService()