export type ChatRole = "user" | "assistant";
export type ChatMessageType =
  | "text"
  | "action_preview"
  | "action_result"
  | "error";

export interface ChatMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  message_type: ChatMessageType;
  action_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

export interface PaginatedConversations {
  items: ChatConversation[];
  pagination: ChatPagination;
}

export interface PaginatedChatMessages {
  items: ChatMessage[];
  pagination: ChatPagination;
}

export interface SendChatMessageInput {
  conversation_id?: string;
  message: string;
}

export interface ChatResponse {
  conversation_id: string;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  requires_confirmation: boolean;
  action_id: string | null;
}

export interface ChatActionResult {
  action_id: string;
  conversation_id: string;
  status: "completed" | "cancelled";
  message: string;
  result: Record<string, unknown>;
  assistant_message: ChatMessage;
}

export interface ProposedChatEntry {
  food_name?: string;
  quantity_value?: number;
  quantity_unit?: string;
  meal_type?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  consumed_at?: string;
}

export interface ChatProposal {
  entries?: ProposedChatEntry[];
  goal_update?: Record<string, string | number | null>;
}
