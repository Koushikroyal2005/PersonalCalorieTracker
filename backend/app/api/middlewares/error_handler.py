import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: Any = None,
) -> JSONResponse:
    content = {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(content),
    )


async def handle_http_exception(
    _: Request,
    exception: StarletteHTTPException,
) -> JSONResponse:
    message = (
        exception.detail
        if isinstance(exception.detail, str)
        else "Request failed"
    )

    return error_response(
        status_code=exception.status_code,
        code=f"HTTP_{exception.status_code}",
        message=message,
        details=None if isinstance(exception.detail, str) else exception.detail,
    )


async def handle_validation_exception(
    _: Request,
    exception: RequestValidationError,
) -> JSONResponse:
    return error_response(
        status_code=422,
        code="VALIDATION_ERROR",
        message="The request contains invalid data",
        details=exception.errors(),
    )


async def handle_database_exception(
    _: Request,
    exception: PyMongoError,
) -> JSONResponse:
    logger.exception("Database operation failed", exc_info=exception)

    return error_response(
        status_code=503,
        code="DATABASE_ERROR",
        message="The database is temporarily unavailable",
    )


async def handle_unexpected_exception(
    _: Request,
    exception: Exception,
) -> JSONResponse:
    logger.exception("Unexpected application error", exc_info=exception)

    return error_response(
        status_code=500,
        code="INTERNAL_SERVER_ERROR",
        message="An unexpected error occurred",
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(
        StarletteHTTPException,
        handle_http_exception,
    )
    app.add_exception_handler(
        RequestValidationError,
        handle_validation_exception,
    )
    app.add_exception_handler(
        PyMongoError,
        handle_database_exception,
    )
    app.add_exception_handler(
        Exception,
        handle_unexpected_exception,
    )