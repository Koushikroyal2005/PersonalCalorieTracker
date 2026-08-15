from datetime import datetime, timezone
from math import ceil
from typing import Any

from bson import ObjectId
from pymongo import DESCENDING, ReturnDocument

from app.infrastructure.database import mongodb
from app.schemas.goal import GoalCreate, GoalUpdate


class InvalidGoalDateRangeError(Exception):
    pass


class GoalService:
    @property
    def collection(self):
        if mongodb.database is None:
            raise RuntimeError("Database is not connected")
        return mongodb.database["goals"]

    async def create(
        self,
        user_id: str,
        request: GoalCreate,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        document = request.model_dump()
        document["goal_type"] = request.goal_type.value
        document["start_date"] = request.start_date.isoformat()
        document["end_date"] = (
            request.end_date.isoformat() if request.end_date else None
        )

        should_activate = document.pop("is_active")
        document.update(
            {
                "user_id": user_id,
                "is_active": False,
                "created_at": now,
                "updated_at": now,
            }
        )

        result = await self.collection.insert_one(document)
        goal_id = str(result.inserted_id)

        if should_activate:
            return await self.activate(user_id, goal_id, True)

        document["_id"] = result.inserted_id
        return self.serialize(document)

    async def list(
        self,
        user_id: str,
        page: int,
        limit: int,
    ) -> dict[str, Any]:
        query = {"user_id": user_id}
        total = await self.collection.count_documents(query)

        cursor = (
            self.collection.find(query)
            .sort("created_at", DESCENDING)
            .skip((page - 1) * limit)
            .limit(limit)
        )
        documents = await cursor.to_list(length=limit)
        total_pages = ceil(total / limit) if total else 0

        return {
            "items": [self.serialize(document) for document in documents],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_previous": page > 1,
            },
        }

    async def get_active(self, user_id: str) -> dict[str, Any] | None:
        document = await self.collection.find_one(
            {"user_id": user_id, "is_active": True}
        )
        return self.serialize(document) if document else None

    async def update(
        self,
        user_id: str,
        goal_id: str,
        request: GoalUpdate,
    ) -> dict[str, Any] | None:
        if not ObjectId.is_valid(goal_id):
            return None

        object_id = ObjectId(goal_id)
        current = await self.collection.find_one(
            {"_id": object_id, "user_id": user_id}
        )
        if current is None:
            return None

        updates = request.model_dump(exclude_unset=True)
        activation = updates.pop("is_active", None)

        if request.goal_type is not None:
            updates["goal_type"] = request.goal_type.value
        if request.start_date is not None:
            updates["start_date"] = request.start_date.isoformat()
        if "end_date" in request.model_fields_set:
            updates["end_date"] = (
                request.end_date.isoformat() if request.end_date else None
            )

        start_date = updates.get("start_date", current["start_date"])
        end_date = updates.get("end_date", current.get("end_date"))
        if end_date is not None and end_date < start_date:
            raise InvalidGoalDateRangeError

        if updates:
            updates["updated_at"] = datetime.now(timezone.utc)
            await self.collection.update_one(
                {"_id": object_id, "user_id": user_id},
                {"$set": updates},
            )

        if activation is not None:
            return await self.activate(user_id, goal_id, activation)

        document = await self.collection.find_one(
            {"_id": object_id, "user_id": user_id}
        )
        return self.serialize(document) if document else None

    async def activate(
        self,
        user_id: str,
        goal_id: str,
        is_active: bool,
    ) -> dict[str, Any] | None:
        if not ObjectId.is_valid(goal_id):
            return None

        object_id = ObjectId(goal_id)
        exists = await self.collection.find_one(
            {"_id": object_id, "user_id": user_id}
        )
        if exists is None:
            return None

        now = datetime.now(timezone.utc)

        if is_active:
            await self.collection.update_many(
                {
                    "user_id": user_id,
                    "is_active": True,
                    "_id": {"$ne": object_id},
                },
                {"$set": {"is_active": False, "updated_at": now}},
            )

        document = await self.collection.find_one_and_update(
            {"_id": object_id, "user_id": user_id},
            {"$set": {"is_active": is_active, "updated_at": now}},
            return_document=ReturnDocument.AFTER,
        )

        return self.serialize(document) if document else None

    async def delete(self, user_id: str, goal_id: str) -> bool:
        if not ObjectId.is_valid(goal_id):
            return False

        result = await self.collection.delete_one(
            {"_id": ObjectId(goal_id), "user_id": user_id}
        )
        return result.deleted_count == 1

    @staticmethod
    def serialize(document: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(document["_id"]),
            **{key: value for key, value in document.items() if key != "_id"},
        }


goal_service = GoalService()