from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal

from app.infrastructure.database import mongodb

ReportPeriod = Literal["7d", "30d", "90d"]
ReportView = Literal["daily", "weekly"]


class ReportService:
    @property
    def entries(self):
        if mongodb.database is None:
            raise RuntimeError("Database is not connected")
        return mongodb.database["food_entries"]

    @property
    def goals(self):
        if mongodb.database is None:
            raise RuntimeError("Database is not connected")
        return mongodb.database["goals"]

    @staticmethod
    def date_bounds(
        period: ReportPeriod,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> tuple[datetime, datetime]:
        local_timezone = timezone(timedelta(hours=5, minutes=30))
        if start_date is not None and end_date is not None:
            start = datetime.combine(start_date, time.min, local_timezone)
            end = datetime.combine(
                end_date + timedelta(days=1),
                time.min,
                local_timezone,
            )
            return start.astimezone(timezone.utc), end.astimezone(timezone.utc)

        days = {"7d": 7, "30d": 30, "90d": 90}[period]
        end = datetime.now(timezone.utc)
        return end - timedelta(days=days), end

    @staticmethod
    def group_format(view: ReportView) -> str:
        return "%Y-%m-%d" if view == "daily" else "%G-W%V"

    @staticmethod
    def period_labels(
        period: ReportPeriod,
        view: ReportView,
        start_date: date | None,
        end_date: date | None,
    ) -> list[str]:
        if start_date is None or end_date is None:
            days = {"7d": 7, "30d": 30, "90d": 90}[period]
            end_date = datetime.now(
                timezone(timedelta(hours=5, minutes=30))
            ).date()
            start_date = end_date - timedelta(days=days - 1)

        labels: list[str] = []
        current = start_date
        while current <= end_date:
            if view == "daily":
                label = current.isoformat()
            else:
                iso_year, iso_week, _ = current.isocalendar()
                label = f"{iso_year}-W{iso_week:02d}"
            if not labels or labels[-1] != label:
                labels.append(label)
            current += timedelta(days=1)
        return labels

    async def calorie_trend(
        self,
        user_id: str,
        period: ReportPeriod,
        view: ReportView,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        start, end = self.date_bounds(period, start_date, end_date)
        pipeline = [
            {
                "$match": {
                    "user_id": user_id,
                    "consumed_at": {"$gte": start, "$lt": end},
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": self.group_format(view),
                            "date": "$consumed_at",
                            "timezone": "Asia/Kolkata",
                        }
                    },
                    "calories": {"$sum": "$calories"},
                }
            },
            {"$sort": {"_id": 1}},
        ]

        cursor = await self.entries.aggregate(pipeline)
        results = await cursor.to_list(length=None)

        totals = {item["_id"]: item["calories"] for item in results}
        return {
            "points": [
                {"period": label, "calories": totals.get(label, 0)}
                for label in self.period_labels(
                    period,
                    view,
                    start_date,
                    end_date,
                )
            ]
        }

    async def macro_trend(
        self,
        user_id: str,
        period: ReportPeriod,
        view: ReportView,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        start, end = self.date_bounds(period, start_date, end_date)
        pipeline = [
            {
                "$match": {
                    "user_id": user_id,
                    "consumed_at": {"$gte": start, "$lt": end},
                }
            },
            {
                "$group": {
                    "_id": {
                        "$dateToString": {
                            "format": self.group_format(view),
                            "date": "$consumed_at",
                            "timezone": "Asia/Kolkata",
                        }
                    },
                    "protein_g": {"$sum": "$protein_g"},
                    "carbs_g": {"$sum": "$carbs_g"},
                    "fat_g": {"$sum": "$fat_g"},
                }
            },
            {"$sort": {"_id": 1}},
        ]

        cursor = await self.entries.aggregate(pipeline)
        results = await cursor.to_list(length=None)

        totals = {item["_id"]: item for item in results}
        return {
            "points": [
                {
                    "period": label,
                    "protein_g": totals.get(label, {}).get("protein_g", 0),
                    "carbs_g": totals.get(label, {}).get("carbs_g", 0),
                    "fat_g": totals.get(label, {}).get("fat_g", 0),
                }
                for label in self.period_labels(
                    period,
                    view,
                    start_date,
                    end_date,
                )
            ]
        }

    async def micronutrient_summary(
        self,
        user_id: str,
        period: ReportPeriod,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        start, end = self.date_bounds(period, start_date, end_date)
        pipeline = [
            {
                "$match": {
                    "user_id": user_id,
                    "consumed_at": {"$gte": start, "$lt": end},
                }
            },
            {
                "$project": {
                    "nutrients": {"$objectToArray": "$micronutrients"}
                }
            },
            {"$unwind": "$nutrients"},
            {
                "$group": {
                    "_id": "$nutrients.k",
                    "amount": {"$sum": "$nutrients.v"},
                }
            },
            {"$sort": {"_id": 1}},
        ]

        cursor = await self.entries.aggregate(pipeline)
        results = await cursor.to_list(length=None)

        return {
            "nutrients": [
                {"name": item["_id"], "amount": item["amount"]}
                for item in results
            ]
        }

    async def goal_comparison(
        self,
        user_id: str,
        selected_date: date,
        end_date: date | None = None,
    ) -> dict[str, Any]:
        selected_end_date = end_date or selected_date
        start, end = self.date_bounds("7d", selected_date, selected_end_date)

        pipeline = [
            {
                "$match": {
                    "user_id": user_id,
                    "consumed_at": {"$gte": start, "$lt": end},
                }
            },
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

        cursor = await self.entries.aggregate(pipeline)
        totals = await cursor.to_list(length=1)
        actual = totals[0] if totals else {
            "calories": 0,
            "protein_g": 0,
            "carbs_g": 0,
            "fat_g": 0,
        }

        goal = await self.goals.find_one(
            {"user_id": user_id, "is_active": True}
        )

        if goal is None:
            return {
                "date": selected_date,
                "end_date": selected_end_date,
                "has_active_goal": False,
                "calories": None,
                "protein_g": None,
                "carbs_g": None,
                "fat_g": None,
            }

        mappings = {
            "calories": "daily_calorie_target",
            "protein_g": "daily_protein_target_g",
            "carbs_g": "daily_carbs_target_g",
            "fat_g": "daily_fat_target_g",
        }

        response: dict[str, Any] = {
            "date": selected_date,
            "end_date": selected_end_date,
            "has_active_goal": True,
        }

        day_count = (selected_end_date - selected_date).days + 1

        for nutrient, target_field in mappings.items():
            target = float(goal[target_field]) * day_count
            consumed = float(actual.get(nutrient, 0))

            response[nutrient] = {
                "target": target,
                "actual": consumed,
                "remaining": target - consumed,
                "percentage": round(
                    consumed / target * 100,
                    2,
                ) if target else 0,
            }

        return response


report_service = ReportService()
