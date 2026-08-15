from __future__ import annotations

from datetime import datetime, timezone
from math import ceil
from re import escape
from typing import Any

from bson import ObjectId
from pymongo import DESCENDING, ReturnDocument

from app.infrastructure.database import mongodb
from app.schemas.entry import EntryCreate, EntryUpdate, MealType


class EntryService:
    @property
    def collection(self):
        if mongodb.database is None:
            raise RuntimeError("Database is not connected")
        return mongodb.database["food_entries"]

    async def create(
        self,
        user_id: str,
        request: EntryCreate,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc)
        document = request.model_dump()
        document["meal_type"] = request.meal_type.value
        document.update(
            {
                "user_id": user_id,
                "created_at": now,
                "updated_at": now,
            }
        )

        result = await self.collection.insert_one(document)
        document["_id"] = result.inserted_id
        return self.serialize(document)

    async def list(
        self,
        user_id: str,
        page: int,
        limit: int,
        start_date: datetime | None,
        end_date: datetime | None,
        meal_type: MealType | None,
        search: str | None,
    ) -> dict[str, Any]:
        query: dict[str, Any] = {"user_id": user_id}

        if start_date is not None or end_date is not None:
            consumed_filter: dict[str, datetime] = {}
            if start_date is not None:
                consumed_filter["$gte"] = start_date
            if end_date is not None:
                consumed_filter["$lte"] = end_date
            query["consumed_at"] = consumed_filter

        if meal_type is not None:
            query["meal_type"] = meal_type.value

        if search:
            query["food_name"] = {
                "$regex": escape(search),
                "$options": "i",
            }

        total = await self.collection.count_documents(query)
        totals_cursor = await self.collection.aggregate(
            [
                {"$match": query},
                {
                    "$group": {
                        "_id": None,
                        "calories": {"$sum": "$calories"},
                        "protein_g": {"$sum": "$protein_g"},
                        "carbs_g": {"$sum": "$carbs_g"},
                        "fat_g": {"$sum": "$fat_g"},
                    }
                },
            ]
        )
        totals_result = await totals_cursor.to_list(length=1)
        totals = totals_result[0] if totals_result else {
            "calories": 0,
            "protein_g": 0,
            "carbs_g": 0,
            "fat_g": 0,
        }
        cursor = (
            self.collection.find(query)
            .sort("consumed_at", DESCENDING)
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
            "totals": {
                "calories": totals["calories"],
                "protein_g": totals["protein_g"],
                "carbs_g": totals["carbs_g"],
                "fat_g": totals["fat_g"],
            },
        }

    async def get(self, user_id: str, entry_id: str) -> dict[str, Any] | None:
        if not ObjectId.is_valid(entry_id):
            return None

        document = await self.collection.find_one(
            {
                "_id": ObjectId(entry_id),
                "user_id": user_id,
            }
        )
        return self.serialize(document) if document else None

    async def update(
        self,
        user_id: str,
        entry_id: str,
        request: EntryUpdate,
    ) -> dict[str, Any] | None:
        if not ObjectId.is_valid(entry_id):
            return None

        updates = request.model_dump(exclude_unset=True)

        if request.meal_type is not None:
            updates["meal_type"] = request.meal_type.value

        updates["updated_at"] = datetime.now(timezone.utc)

        document = await self.collection.find_one_and_update(
            {
                "_id": ObjectId(entry_id),
                "user_id": user_id,
            },
            {"$set": updates},
            return_document=ReturnDocument.AFTER,
        )

        return self.serialize(document) if document else None

    async def delete(self, user_id: str, entry_id: str) -> bool:
        if not ObjectId.is_valid(entry_id):
            return False

        result = await self.collection.delete_one(
            {
                "_id": ObjectId(entry_id),
                "user_id": user_id,
            }
        )
        return result.deleted_count == 1

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

    async def bulk_create(
        self,
        user_id: str,
        requests: list[EntryCreate],
    ) -> list[str]:
        now = datetime.now(timezone.utc)
        documents: list[dict[str, Any]] = []

        for request in requests:
            document = request.model_dump()
            document["meal_type"] = request.meal_type.value
            document.update(
                {
                    "user_id": user_id,
                    "created_at": now,
                    "updated_at": now,
                }
            )
            documents.append(document)

        result = await self.collection.insert_many(
            documents,
            ordered=True,
        )

        return [str(entry_id) for entry_id in result.inserted_ids]


entry_service = EntryService()
