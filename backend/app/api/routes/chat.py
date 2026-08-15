from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from google.genai.errors import APIError

from app.api.dependencies.auth import get_current_user
from app.application.services.chat_action_executor_service import (
    ChatActionNotFoundError,
    NoActiveGoalError,
    UnsupportedChatActionError,
    chat_action_executor_service,
)
from app.application.services.chat_history_service import (
    chat_history_service,
)
from app.application.services.chat_service import (
    ConversationNotFoundError,
    chat_service,
)
from app.schemas.chat import (
    ChatActionResultResponse,
    ChatRequest,
    ChatResponse,
    PaginatedChatMessagesResponse,
    PaginatedConversationsResponse,
)

router = APIRouter(prefix="/chat", tags=["Chat"])

CurrentUser = Annotated[
    dict[str, Any],
    Depends(get_current_user),
]


@router.get(
    "/conversations",
    response_model=PaginatedConversationsResponse,
)
async def list_conversations(
    current_user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    return await chat_history_service.list_conversations(
        current_user["id"],
        page,
        limit,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=PaginatedChatMessagesResponse,
)
async def list_messages(
    conversation_id: str,
    current_user: CurrentUser,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    result = await chat_history_service.list_messages(
        current_user["id"],
        conversation_id,
        page,
        limit,
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        )

    return result


@router.post(
    "/messages",
    response_model=ChatResponse,
)
async def send_chat_message(
    request: ChatRequest,
    current_user: CurrentUser,
):
    try:
        return await chat_service.process(
            current_user["id"],
            request,
        )
    except ConversationNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found",
        ) from error
    except APIError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="NutriX AI is temporarily unavailable",
        ) from error
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="NutriX AI returned an invalid response",
        ) from error


@router.post(
    "/actions/{action_id}/confirm",
    response_model=ChatActionResultResponse,
)
async def confirm_chat_action(
    action_id: str,
    current_user: CurrentUser,
):
    try:
        return await chat_action_executor_service.confirm(
            current_user["id"],
            action_id,
        )
    except ChatActionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending action not found or already processed",
        ) from error
    except NoActiveGoalError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No active goal is available to update",
        ) from error
    except UnsupportedChatActionError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported chat action",
        ) from error
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The pending action contains invalid data",
        ) from error


@router.post(
    "/actions/{action_id}/cancel",
    response_model=ChatActionResultResponse,
)
async def cancel_chat_action(
    action_id: str,
    current_user: CurrentUser,
):
    try:
        return await chat_action_executor_service.cancel(
            current_user["id"],
            action_id,
        )
    except ChatActionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending action not found or already processed",
        ) from error


