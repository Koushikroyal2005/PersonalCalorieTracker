from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Personal Calorie Tracker API"
    app_env: Literal["development", "testing", "production"] = "development"
    api_prefix: str = "/api"

    mongodb_url: str
    mongodb_database: str = "personal_calorie_tracker"

    jwt_secret_key: str
    access_token_expire_minutes: int = 60

    gemini_api_key: str
    gemini_model: str = "gemini-3.5-flash"
    gemini_fallback_model: str = "gemini-3.1-flash-lite"

    frontend_url: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
