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

from app.api.dependencies.auth import get_current_user
from app.application.services.entry_service import entry_service
from app.application.services.pdf_import_service import pdf_import_service
from app.schemas.pdf_import import (
    PDFImportConfirmRequest,
    PDFImportConfirmResponse,
    PDFImportPreviewResponse,
)

router = APIRouter(prefix="/imports/pdf", tags=["PDF Import"])

CurrentUser = Annotated[
    dict[str, Any],
    Depends(get_current_user),
]

MAX_PDF_BYTES = 10 * 1024 * 1024


@router.post(
    "/preview",
    response_model=PDFImportPreviewResponse,
)
async def preview_pdf_import(
    current_user: CurrentUser,
    document: Annotated[
        UploadFile,
        File(description="Food diary PDF"),
    ],
):
    del current_user

    contents = await document.read(MAX_PDF_BYTES + 1)
    filename = document.filename or "food-diary.pdf"
    await document.close()

    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF files are supported",
        )

    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded PDF is empty",
        )

    if len(contents) > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="The PDF must not exceed 10 MB",
        )

    if not contents.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid PDF",
        )

    try:
        extraction = await pdf_import_service.extract_entries(
            contents,
        )
    except APIError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini could not analyze the PDF",
        ) from error
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Gemini returned an invalid PDF result",
        ) from error

    return {
        "filename": filename,
        "total_entries": len(extraction.entries),
        "entries": extraction.entries,
        "warnings": extraction.document_warnings,
    }


@router.post(
    "/confirm",
    response_model=PDFImportConfirmResponse,
    status_code=status.HTTP_201_CREATED,
)
async def confirm_pdf_import(
    request: PDFImportConfirmRequest,
    current_user: CurrentUser,
):
    entry_ids = await entry_service.bulk_create(
        current_user["id"],
        request.entries,
    )

    return {
        "imported_count": len(entry_ids),
        "entry_ids": entry_ids,
    }