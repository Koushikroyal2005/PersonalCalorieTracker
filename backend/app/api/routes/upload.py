from io import BytesIO
from typing import Annotated, Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from google.genai.errors import APIError
from PIL import Image, UnidentifiedImageError

from app.api.dependencies.auth import get_current_user
from app.application.services.ai_service import ai_service
from app.schemas.nutrition_extraction import NutritionExtractionResponse

router = APIRouter(prefix="/upload", tags=["AI Upload"])

MAX_IMAGE_BYTES = 8 * 1024 * 1024
IMAGE_FORMATS = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}

CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]


@router.post("/image", response_model=NutritionExtractionResponse)
async def analyze_nutrition_image(
    current_user: CurrentUser,
    image: Annotated[UploadFile, File(description="Food or nutrition image")],
):
    del current_user

    contents = await image.read(MAX_IMAGE_BYTES + 1)
    await image.close()

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded image is empty",
        )

    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="The image must not exceed 8 MB",
        )

    try:
        with Image.open(BytesIO(contents)) as detected_image:
            image_format = detected_image.format
            detected_image.verify()
    except (UnidentifiedImageError, OSError) as error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid image",
        ) from error

    mime_type = IMAGE_FORMATS.get(image_format or "")
    if mime_type is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only JPEG, PNG, and WebP images are supported",
        )

    try:
        return await ai_service.extract_nutrition(
            image_bytes=contents,
            mime_type=mime_type,
        )
    except APIError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini could not analyze the image",
        ) from error
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini returned an invalid nutrition result",
        ) from error