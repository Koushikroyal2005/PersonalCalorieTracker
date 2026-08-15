import api from "../../services/api";
import type {
  ChatActionResult,
  ChatResponse,
  PaginatedChatMessages,
  PaginatedConversations,
  SendChatMessageInput,
} from "../../types/chat";

export async function sendChatMessage(
  input: SendChatMessageInput,
): Promise<ChatResponse> {
  const response = await api.post<ChatResponse>("/chat/messages", input, {
    timeout: 60_000,
  });
  return response.data;
}

export async function fetchChatConversations(
  page = 1,
  limit = 20,
): Promise<PaginatedConversations> {
  const response = await api.get<PaginatedConversations>(
    "/chat/conversations",
    { params: { page, limit } },
  );
  return response.data;
}

export async function fetchChatMessages(
  conversationId: string,
  page = 1,
  limit = 100,
): Promise<PaginatedChatMessages> {
  const response = await api.get<PaginatedChatMessages>(
    `/chat/conversations/${conversationId}/messages`,
    { params: { page, limit } },
  );
  return response.data;
}

export async function confirmChatAction(
  actionId: string,
): Promise<ChatActionResult> {
  const response = await api.post<ChatActionResult>(
    `/chat/actions/${actionId}/confirm`,
  );
  return response.data;
}

export async function cancelChatAction(
  actionId: string,
): Promise<ChatActionResult> {
  const response = await api.post<ChatActionResult>(
    `/chat/actions/${actionId}/cancel`,
  );
  return response.data;
}
