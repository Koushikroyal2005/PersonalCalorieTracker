from datetime import datetime, timezone
from math import ceil
from typing import Any

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING

from app.infrastructure.database import mongodb
from app.schemas.chat import ChatMessageType, ChatRole


class ChatHistoryService:
    @property
    def conversations(self):
        if mongodb.database is None:
            raise RuntimeError("Database is not connected")
        return mongodb.database["chat_conversations"]

    @property
    def messages(self):
        if mongodb.database is None:
            raise RuntimeError("Database is not connected")
        return mongodb.database["chat_messages"]

    async def create_conversation(
        self,
        user_id: str,
        title: str,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        document = {
            "user_id": user_id,
            "title": title[:100],
            "created_at": now,
            "updated_at": now,
        }

        result = await self.conversations.insert_one(document)
        document["_id"] = result.inserted_id
        return self.serialize(document)

    async def get_conversation(
        self,
        user_id: str,
        conversation_id: str,
    ) -> dict[str, Any] | None:
        if not ObjectId.is_valid(conversation_id):
            return None

        document = await self.conversations.find_one(
            {
                "_id": ObjectId(conversation_id),
                "user_id": user_id,
            }
        )

        return self.serialize(document) if document else None

    async def list_conversations(
        self,
        user_id: str,
        page: int,
        limit: int,
    ) -> dict[str, Any]:
        query = {"user_id": user_id}
        total = await self.conversations.count_documents(query)

        cursor = (
            self.conversations.find(query)
            .sort("updated_at", DESCENDING)
            .skip((page - 1) * limit)
            .limit(limit)
        )
        documents = await cursor.to_list(length=limit)
        total_pages = ceil(total / limit) if total else 0

        return {
            "items": [self.serialize(item) for item in documents],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            },
        }

    async def add_message(
        self,
        user_id: str,
        conversation_id: str,
        role: ChatRole,
        content: str,
        message_type: ChatMessageType = ChatMessageType.TEXT,
        action_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)

        document = {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "role": role.value,
            "content": content,
            "message_type": message_type.value,
            "action_id": action_id,
            "metadata": metadata or {},
            "created_at": now,
        }

        result = await self.messages.insert_one(document)
        document["_id"] = result.inserted_id

        await self.conversations.update_one(
            {
                "_id": ObjectId(conversation_id),
                "user_id": user_id,
            },
            {"$set": {"updated_at": now}},
        )

        return self.serialize(document)

    async def list_messages(
        self,
        user_id: str,
        conversation_id: str,
        page: int,
        limit: int,
    ) -> dict[str, Any] | None:
        conversation = await self.get_conversation(
            user_id,
            conversation_id,
        )
        if conversation is None:
            return None

        query = {
            "user_id": user_id,
            "conversation_id": conversation_id,
        }
        total = await self.messages.count_documents(query)

        cursor = (
            self.messages.find(query)
            .sort("created_at", ASCENDING)
            .skip((page - 1) * limit)
            .limit(limit)
        )
        documents = await cursor.to_list(length=limit)
        total_pages = ceil(total / limit) if total else 0

        return {
            "items": [self.serialize(item) for item in documents],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            },
        }
    
    async def recent_messages(
        self,
        user_id: str,
        conversation_id: str,
        limit: int = 10,
    ) -> list[dict[str, str]]:
        cursor = (
            self.messages.find(
                {
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                },
                {
                    "role": 1,
                    "content": 1,
                },
            )
            .sort("created_at", DESCENDING)
            .limit(limit)
        )

        documents = await cursor.to_list(length=limit)
        documents.reverse()

        return [
            {
                "role": document["role"],
                "content": document["content"],
            }
            for document in documents
        ]

    @staticmethod
    def serialize(document: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(document["_id"]),
            **{
                key: value
                for key, value in document.items()
                if key != "_id"
            },
        }


chat_history_service = ChatHistoryService()