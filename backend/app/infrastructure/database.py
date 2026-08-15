from pymongo import ASCENDING, DESCENDING, AsyncMongoClient, IndexModel
from pymongo.server_api import ServerApi

from app.core.config import get_settings


class MongoDatabase:
    def __init__(self) -> None:
        self.client: AsyncMongoClient | None = None
        self.database = None

    async def connect(self) -> None:
        settings = get_settings()

        self.client = AsyncMongoClient(
            settings.mongodb_url,
            server_api=ServerApi("1"),
            serverSelectionTimeoutMS=5000,
        )

        await self.client.admin.command("ping")
        self.database = self.client[settings.mongodb_database]
        await self._create_indexes()

    async def _create_indexes(self) -> None:
        if self.database is None:
            raise RuntimeError("Database is not connected")

        await self.database["users"].create_indexes(
            [
                IndexModel(
                    [("email", ASCENDING)],
                    unique=True,
                    name="users_email_unique",
                )
            ]
        )

        await self.database["food_entries"].create_indexes(
            [
                IndexModel(
                    [("user_id", ASCENDING), ("consumed_at", DESCENDING)],
                    name="entries_user_consumed",
                ),
                IndexModel(
                    [
                        ("user_id", ASCENDING),
                        ("meal_type", ASCENDING),
                        ("consumed_at", DESCENDING),
                    ],
                    name="entries_user_meal_consumed",
                ),
            ]
        )

        await self.database["goals"].create_indexes(
            [
                IndexModel(
                    [("user_id", ASCENDING), ("start_date", DESCENDING)],
                    name="goals_user_start_date",
                ),
                IndexModel(
                    [("user_id", ASCENDING)],
                    unique=True,
                    partialFilterExpression={"is_active": True},
                    name="goals_one_active_per_user",
                ),
            ]
        )

        await self.database["chat_conversations"].create_indexes(
            [
                IndexModel(
                    [
                        ("user_id", ASCENDING),
                        ("updated_at", DESCENDING),
                    ],
                    name="chat_conversations_user_updated",
                )
            ]
        )

        await self.database["chat_messages"].create_indexes(
            [
                IndexModel(
                    [
                        ("user_id", ASCENDING),
                        ("conversation_id", ASCENDING),
                        ("created_at", ASCENDING),
                    ],
                    name="chat_messages_conversation_created",
                )
            ]
        )

        await self.database["chat_actions"].create_indexes(
            [
                IndexModel(
                    [
                        ("user_id", ASCENDING),
                        ("status", ASCENDING),
                        ("created_at", DESCENDING),
                    ],
                    name="chat_actions_user_status_created",
                )
            ]
        )

    async def disconnect(self) -> None:
        if self.client is not None:
            await self.client.close()

        self.client = None
        self.database = None


mongodb = MongoDatabase()