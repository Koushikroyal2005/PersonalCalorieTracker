import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.middlewares.error_handler import register_exception_handlers
from app.api.routes.auth import router as auth_router
from app.api.routes.chat import router as chat_router
from app.api.routes.entries import router as entries_router
from app.api.routes.goals import router as goals_router
from app.api.routes.health import router as health_router
from app.api.routes.pdf_import import router as pdf_import_router
from app.api.routes.reports import router as reports_router
from app.api.routes.upload import router as upload_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.infrastructure.database import mongodb

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info(
        "Starting %s in %s mode",
        settings.app_name,
        settings.app_env,
    )
    await mongodb.connect()
    logger.info("API startup complete; documentation is available at /docs")
    try:
        yield
    finally:
        logger.info("Shutting down API")
        await mongodb.disconnect()


app = FastAPI(
    title=settings.app_name,
    description="Backend API for tracking meals, nutrition, and health goals.",
    version="0.1.0",
    lifespan=lifespan,
)
register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(auth_router, prefix=settings.api_prefix)
app.include_router(entries_router, prefix=settings.api_prefix)
app.include_router(goals_router, prefix=settings.api_prefix)
app.include_router(reports_router, prefix=settings.api_prefix)
app.include_router(upload_router, prefix=settings.api_prefix)
app.include_router(pdf_import_router, prefix=settings.api_prefix)
app.include_router(chat_router, prefix=settings.api_prefix)
