from fastapi import APIRouter, HTTPException, status

from app.infrastructure.database import mongodb

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("")
async def health_check() -> dict[str, str]:
    return {"status": "healthy"}


@router.get("/database")
async def database_health_check() -> dict[str, str]:
    if mongodb.client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection is unavailable",
        )

    await mongodb.client.admin.command("ping")
    return {
        "status": "healthy",
        "database": "connected",
    }