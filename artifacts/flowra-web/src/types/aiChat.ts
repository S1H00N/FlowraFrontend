import type {
  AiActionApplyState,
  AiSuggestedAction,
  ApplyMemoRequest,
  ApplyMemoResponse,
} from "./memo";

export type AiChatSessionStatus = "active" | "archived";
export type AiChatMessageRole = "user" | "assistant";
export type AiChatResponseType = "answer" | "suggestion" | "clarification";
export type AiChatActionStatus =
  | "none"
  | "suggested"
  | "partially_applied"
  | "applied";

export interface AiChatSession {
  session_id: number;
  ai_chat_session_id?: number;
  user_id?: number;
  title?: string | null;
  status?: AiChatSessionStatus | string;
  last_message_at?: string | null;
  created_at?: string;
  updated_at?: string | null;
  _count?: {
    messages?: number;
  };
  messages?: AiChatMessage[];
}

export interface AiChatAppliedAction {
  action_index?: number;
  resource_type?: string;
  resource_id?: number;
  created_at?: string;
}

export interface AiChatMessage {
  message_id: number;
  ai_chat_message_id?: number;
  session_id?: number;
  ai_chat_session_id?: number;
  role: AiChatMessageRole | string;
  content: string;
  response_type?: AiChatResponseType | string | null;
  suggested_actions?: AiSuggestedAction[] | null;
  action_status?: AiChatActionStatus | string | null;
  executable_action_indexes?: number[];
  applied_action_indexes?: number[];
  remaining_action_indexes?: number[];
  skipped_action_indexes?: number[];
  action_states?: AiActionApplyState["action_states"];
  applied_actions?: AiChatAppliedAction[];
  created_at?: string;
  updated_at?: string | null;
}

export interface CreateAiChatSessionRequest {
  title?: string;
}

export interface AiChatSessionsQuery {
  status?: AiChatSessionStatus;
  limit?: number;
}

export interface SendAiChatMessageRequest {
  content: string;
}

export interface SendAiChatMessageResponse {
  user_message: AiChatMessage;
  assistant_message: AiChatMessage;
}

export interface ApplyAiChatMessageRequest
  extends Pick<
    ApplyMemoRequest,
    "apply_type" | "action_index" | "category_id" | "schedule_id"
  > {}

export interface ApplyAiChatMessageResponse extends ApplyMemoResponse {
  action_status?: AiChatActionStatus | string;
}
