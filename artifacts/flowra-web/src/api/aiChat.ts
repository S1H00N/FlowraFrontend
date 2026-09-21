import axios from "axios";
import apiClient from "./client";
import { compactParams, toOptionalString } from "./normalize";
import type {
  AiChatMessage,
  AiChatMessagesQuery,
  AiChatCursorPagination,
  AiChatSessionsQuery,
  AiChatSession,
  ApiResponse,
  ApplyAiChatMessageRequest,
  ApplyAiChatMessageResponse,
  CreateAiChatSessionRequest,
  SendAiChatMessageRequest,
  SendAiChatMessageResponse,
  UpdateAiChatSessionRequest,
} from "@/types";

type AiChatSessionData = AiChatSession | { session: AiChatSession };
type AiChatSessionsData = {
  items?: AiChatSession[];
  sessions?: AiChatSession[];
  pagination?: AiChatCursorPagination;
};
type AiChatMessagesData = {
  items?: AiChatMessage[];
  messages?: AiChatMessage[];
  pagination?: AiChatCursorPagination;
};

function normalizeMessage(message: AiChatMessage): AiChatMessage {
  const record = message as AiChatMessage & {
    ai_chat_message_id?: number;
    ai_chat_session_id?: number;
  };
  const messageId = record.message_id ?? record.ai_chat_message_id ?? -1;
  const sessionId = record.session_id ?? record.ai_chat_session_id;

  return {
    ...message,
    message_id: messageId,
    ai_chat_message_id: record.ai_chat_message_id ?? messageId,
    session_id: sessionId,
    ai_chat_session_id: record.ai_chat_session_id ?? sessionId,
  };
}

function normalizeSession(session: AiChatSession): AiChatSession {
  const record = session as AiChatSession & {
    ai_chat_session_id?: number;
    messages?: AiChatMessage[];
  };
  const sessionId = record.session_id ?? record.ai_chat_session_id ?? -1;

  return {
    ...session,
    session_id: sessionId,
    ai_chat_session_id: record.ai_chat_session_id ?? sessionId,
    messages: record.messages?.map(normalizeMessage),
  };
}

function unwrapSession(data: AiChatSessionData): AiChatSession {
  return normalizeSession("session" in data ? data.session : data);
}

function unwrapSessions(data: AiChatSessionsData): AiChatSession[] {
  return (data.items ?? data.sessions ?? []).map(normalizeSession);
}

function unwrapMessages(data: AiChatMessagesData): AiChatMessage[] {
  return (data.items ?? data.messages ?? []).map(normalizeMessage);
}

export async function createAiChatSession(
  payload: CreateAiChatSessionRequest = {},
) {
  const body = compactParams({
    title: payload.title?.trim() || undefined,
  });

  const res = await apiClient.post<ApiResponse<AiChatSessionData>>(
    "/ai-chat/sessions",
    body,
  );
  return { ...res.data, data: { session: unwrapSession(res.data.data) } };
}

export async function updateAiChatSession(
  sessionId: number,
  payload: UpdateAiChatSessionRequest,
) {
  const res = await apiClient.patch<ApiResponse<AiChatSessionData>>(
    `/ai-chat/sessions/${sessionId}`,
    compactParams({ title: payload.title?.trim(), status: payload.status }),
  );
  return { ...res.data, data: { session: unwrapSession(res.data.data) } };
}

export async function listAiChatSessions(query: AiChatSessionsQuery = {}) {
  const res = await apiClient.get<ApiResponse<AiChatSessionsData>>(
    "/ai-chat/sessions",
    {
      params: compactParams({ ...query }),
    },
  );
  return {
    ...res.data,
    data: {
      sessions: unwrapSessions(res.data.data),
      pagination: res.data.data.pagination,
    },
  };
}

export async function deleteAiChatSession(sessionId: number) {
  try {
    const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
      `/ai-chat/sessions/${sessionId}`,
    );
    if (res.status !== 204 && !res.data?.success) {
      throw new Error(res.data?.message || "AI 대화를 삭제하지 못했습니다.");
    }
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 404 &&
      error.response.data?.error?.code === "AI_CHAT_SESSION_NOT_FOUND"
    ) return;
    throw error;
  }
}

export async function sendAiChatMessage(
  sessionId: number,
  payload: SendAiChatMessageRequest,
) {
  const content = payload.content.trim();
  // A validation error can follow saving the user message; never resend it automatically.
  const res = await apiClient.post<ApiResponse<SendAiChatMessageResponse>>(
    `/ai-chat/sessions/${sessionId}/messages`,
    { content },
  );

  return {
    ...res.data,
    data: {
      ...res.data.data,
      user_message: normalizeMessage(res.data.data.user_message),
      assistant_message: normalizeMessage(res.data.data.assistant_message),
    },
  };
}

export async function listAiChatMessages(sessionId: number, query: AiChatMessagesQuery = {}) {
  const res = await apiClient.get<ApiResponse<AiChatMessagesData>>(
    `/ai-chat/sessions/${sessionId}/messages`,
    { params: compactParams({ ...query }) },
  );
  return {
    ...res.data,
    data: {
      messages: unwrapMessages(res.data.data),
      pagination: res.data.data.pagination,
    },
  };
}

export async function applyAiChatMessageAction(
  messageId: number,
  payload: ApplyAiChatMessageRequest,
) {
  const res = await apiClient.post<ApiResponse<ApplyAiChatMessageResponse>>(
    `/ai-chat/messages/${messageId}/apply`,
    compactParams({
      ...payload,
      category_id: toOptionalString(payload.category_id),
      schedule_id: toOptionalString(payload.schedule_id),
    }),
  );
  return res.data;
}
