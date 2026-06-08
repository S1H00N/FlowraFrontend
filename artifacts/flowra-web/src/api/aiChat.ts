import apiClient from "./client";
import { compactParams, toOptionalString } from "./normalize";
import type {
  AiChatMessage,
  AiChatSessionsQuery,
  AiChatSession,
  ApiListData,
  ApiResponse,
  ApplyAiChatMessageRequest,
  ApplyAiChatMessageResponse,
  CreateAiChatSessionRequest,
  SendAiChatMessageRequest,
  SendAiChatMessageResponse,
} from "@/types";

type AiChatSessionData = AiChatSession | { session: AiChatSession };
type AiChatSessionsData = ApiListData<AiChatSession> & {
  sessions?: AiChatSession[];
};
type AiChatMessagesData = ApiListData<AiChatMessage> & {
  messages?: AiChatMessage[];
};

function unwrapSession(data: AiChatSessionData): AiChatSession {
  return "session" in data ? data.session : data;
}

function unwrapSessions(data: AiChatSessionsData): AiChatSession[] {
  return data.items ?? data.sessions ?? [];
}

function unwrapMessages(data: AiChatMessagesData): AiChatMessage[] {
  return data.items ?? data.messages ?? [];
}

export async function createAiChatSession(
  payload: CreateAiChatSessionRequest = {},
) {
  const res = await apiClient.post<ApiResponse<AiChatSessionData>>(
    "/ai-chat/sessions",
    compactParams({ ...payload }),
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

export async function sendAiChatMessage(
  sessionId: number,
  payload: SendAiChatMessageRequest,
) {
  const res = await apiClient.post<ApiResponse<SendAiChatMessageResponse>>(
    `/ai-chat/sessions/${sessionId}/messages`,
    payload,
  );
  return res.data;
}

export async function listAiChatMessages(sessionId: number) {
  const res = await apiClient.get<ApiResponse<AiChatMessagesData>>(
    `/ai-chat/sessions/${sessionId}/messages`,
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
