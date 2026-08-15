from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.core.security import hash_password, verify_password
from app.infrastructure.database import mongodb


class EmailAlreadyRegisteredError(Exception):
    pass


class AuthService:
    @property
    def users(self):
        if mongodb.database is None:
            raise RuntimeError("Database is not connected")

        return mongodb.database["users"]

    async def register(
        self,
        email: str,
        full_name: str,
        password: str,
    ) -> dict[str, Any]:
        normalized_email = email.strip().lower()
        now = datetime.now(timezone.utc)

        user_document = {
            "email": normalized_email,
            "full_name": full_name.strip(),
            "password_hash": hash_password(password),
            "created_at": now,
            "updated_at": now,
        }

        try:
            result = await self.users.insert_one(user_document)
        except DuplicateKeyError as error:
            raise EmailAlreadyRegisteredError from error

        user_document["_id"] = result.inserted_id
        return self.serialize_user(user_document)

    async def authenticate(
        self,
        email: str,
        password: str,
    ) -> dict[str, Any] | None:
        user = await self.users.find_one(
            {"email": email.strip().lower()}
        )

        if user is None:
            return None

        if not verify_password(password, user["password_hash"]):
            return None

        return self.serialize_user(user)

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        if not ObjectId.is_valid(user_id):
            return None

        user = await self.users.find_one({"_id": ObjectId(user_id)})
        if user is None:
            return None

        return self.serialize_user(user)

    @staticmethod
    def serialize_user(user: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(user["_id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "created_at": user["created_at"],
        }


auth_service = AuthService()