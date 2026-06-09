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

interface ApiErrorBody {
  success?: boolean;
  message?: string;
  error?: {
    code?: string;
    details?: {
      issues?: Array<{
        path?: string | string[];
        message?: string;
      }>;
    };
  };
}

type AiChatSessionData = AiChatSession | { session: AiChatSession };
type AiChatSessionsData = ApiListData<AiChatSession> & {
  sessions?: AiChatSession[];
};
type AiChatMessagesData = ApiListData<AiChatMessage> & {
  messages?: AiChatMessage[];
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

function getValidationIssues(err: unknown) {
  const response = err as {
    response?: {
      data?: ApiErrorBody;
    };
  };
  const body = response.response?.data;
  if (body?.error?.code !== "VALIDATION_ERROR") return [];
  return body.error.details?.issues ?? [];
}

function includesIssuePath(
  issues: Array<{ path?: string | string[]; message?: string }>,
  field: string,
) {
  return issues.some((issue) => {
    const path = Array.isArray(issue.path)
      ? issue.path.join(".")
      : issue.path;
    return path === field || path?.startsWith(`${field}.`);
  });
}

function hasUnknownFieldIssue(
  issues: Array<{ path?: string | string[]; message?: string }>,
  field: string,
) {
  return issues.some((issue) => {
    const path = Array.isArray(issue.path)
      ? issue.path.join(".")
      : issue.path;
    return (
      path === field &&
      /unknown|unrecognized|not allowed|unexpected/i.test(
        issue.message ?? "",
      )
    );
  });
}

export async function createAiChatSession(
  payload: CreateAiChatSessionRequest = {},
) {
  const body = compactParams({
    title: payload.title?.trim() || undefined,
  });

  let res;
  try {
    res = await apiClient.post<ApiResponse<AiChatSessionData>>(
      "/ai-chat/sessions",
      body,
    );
  } catch (err) {
    const issues = getValidationIssues(err);
    if (!hasUnknownFieldIssue(issues, "title")) throw err;

    res = await apiClient.post<ApiResponse<AiChatSessionData>>(
      "/ai-chat/sessions",
      {},
    );
  }
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
  const content = payload.content.trim();
  let res;

  try {
    res = await apiClient.post<ApiResponse<SendAiChatMessageResponse>>(
      `/ai-chat/sessions/${sessionId}/messages`,
      { content },
    );
  } catch (err) {
    const issues = getValidationIssues(err);
    const shouldRetryWithMessage =
      includesIssuePath(issues, "message") ||
      hasUnknownFieldIssue(issues, "content");

    if (!shouldRetryWithMessage) throw err;

    res = await apiClient.post<ApiResponse<SendAiChatMessageResponse>>(
      `/ai-chat/sessions/${sessionId}/messages`,
      { message: content },
    );
  }

  return {
    ...res.data,
    data: {
      ...res.data.data,
      user_message: normalizeMessage(res.data.data.user_message),
      assistant_message: normalizeMessage(res.data.data.assistant_message),
    },
  };
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
