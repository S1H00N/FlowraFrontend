import { useEffect } from "react";
import { useMutation, useInfiniteQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import {
  applyAiChatMessageAction,
  createAiChatSession,
  deleteAiChatSession,
  listAiChatMessages,
  listAiChatSessions,
  sendAiChatMessage,
  updateAiChatSession,
} from "@/api/aiChat";
import { getErrorCode } from "@/lib/error";
import { SCHEDULES_QUERY_KEY } from "@/hooks/useSchedules";
import { TASKS_QUERY_KEY } from "@/hooks/useTasks";
import { REMINDERS_QUERY_KEY } from "@/hooks/useReminders";
import { TODAY_BRIEFING_QUERY_KEY } from "@/hooks/useTodayBriefing";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  AiChatMessage,
  AiChatSessionsQuery,
  AiChatSession,
  AiChatCursorPagination,
  ApplyAiChatMessageRequest,
  CreateAiChatSessionRequest,
  SendAiChatMessageRequest,
  UpdateAiChatSessionRequest,
} from "@/types";

export const AI_CHAT_QUERY_KEY = ["ai-chat"] as const;
type SessionPage = { sessions: AiChatSession[]; pagination?: AiChatCursorPagination };
type MessagePage = { messages: AiChatMessage[]; pagination?: AiChatCursorPagination };

function nextCursor(page: { pagination?: AiChatCursorPagination }) {
  return page.pagination?.has_more ? page.pagination.next_cursor ?? undefined : undefined;
}

function retryChatQuery(count: number, error: unknown) {
  return getErrorCode(error) !== "INVALID_CURSOR" && count < 2;
}

// Keep deletion markers outside the query cache so late mutations cannot recreate it.
const deletedSessions = new WeakMap<QueryClient, Set<number>>();

function isDeletedSession(qc: QueryClient, sessionId: number) {
  return deletedSessions.get(qc)?.has(sessionId) ?? false;
}

export function aiChatSessionsKey(query: AiChatSessionsQuery = {}) {
  return [...AI_CHAT_QUERY_KEY, "sessions", query] as const;
}

export function aiChatMessagesKey(sessionId: number) {
  return [...AI_CHAT_QUERY_KEY, "messages", sessionId] as const;
}

function mergeChatMessages(
  current: AiChatMessage[] | undefined,
  incoming: AiChatMessage[],
) {
  const byId = new Map<number, AiChatMessage>();
  [...(current ?? []), ...incoming].forEach((message) => {
    byId.set(message.message_id, message);
  });
  return Array.from(byId.values()).sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.message_id - b.message_id;
  });
}

export function useAiChatSessions(
  query: AiChatSessionsQuery = {},
  enabled = true,
) {
  const qc = useQueryClient();
  const result = useInfiniteQuery({
    queryKey: aiChatSessionsKey(query),
    enabled,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: SessionPage) => nextCursor(page),
    retry: retryChatQuery,
    queryFn: async ({ pageParam }) => {
      const res = await listAiChatSessions({ ...query, cursor: pageParam });
      if (!res.success)
        throw new Error(res.message || "AI 대화 목록을 불러오지 못했습니다.");
      return res.data;
    },
  });
  useEffect(() => {
    if (getErrorCode(result.error) === "INVALID_CURSOR" && result.data) {
      void qc.resetQueries({ queryKey: aiChatSessionsKey(query), exact: true });
    }
  }, [result.error, qc]);
  const sessions = new Map<number, AiChatSession>();
  result.data?.pages.forEach((page) => page.sessions.forEach((session) => {
    if (!sessions.has(session.session_id)) sessions.set(session.session_id, session);
  }));
  return { ...result, data: [...sessions.values()] };
}

export function useAiChatMessages(sessionId: number | null, enabled = true) {
  const qc = useQueryClient();
  const result = useInfiniteQuery({
    queryKey: aiChatMessagesKey(sessionId ?? 0),
    enabled: enabled && sessionId !== null,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page: MessagePage) => nextCursor(page),
    retry: retryChatQuery,
    queryFn: async ({ pageParam }) => {
      const res = await listAiChatMessages(sessionId as number, { limit: 50, cursor: pageParam });
      if (!res.success)
        throw new Error(res.message || "AI 대화를 불러오지 못했습니다.");
      return res.data;
    },
  });
  useEffect(() => {
    if (getErrorCode(result.error) === "INVALID_CURSOR" && result.data && sessionId !== null) {
      void qc.resetQueries({ queryKey: aiChatMessagesKey(sessionId), exact: true });
    }
  }, [result.error, qc, sessionId]);
  const messages = new Map<number, AiChatMessage>();
  [...(result.data?.pages ?? [])].reverse().forEach((page) => page.messages.forEach((message) => {
    messages.set(message.message_id, message);
  }));
  return { ...result, data: [...messages.values()] };
}

export function useCreateAiChatSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAiChatSessionRequest = {}) => {
      const res = await createAiChatSession(payload);
      if (!res.success)
        throw new Error(res.message || "AI 대화를 시작하지 못했습니다.");
      return res.data.session;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...AI_CHAT_QUERY_KEY, "sessions"] });
    },
    meta: {
      suppressSuccessToast: true,
      errorMessage: "AI 대화를 시작하지 못했습니다.",
    },
  });
}

export function useDeleteAiChatSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAiChatSession,
    onSuccess: async (_data, sessionId) => {
      const deleted = deletedSessions.get(qc) ?? new Set<number>();
      deleted.add(sessionId);
      deletedSessions.set(qc, deleted);
      await qc.cancelQueries({ queryKey: [...AI_CHAT_QUERY_KEY, "sessions"] });
      await qc.cancelQueries({ queryKey: aiChatMessagesKey(sessionId) });
      qc.setQueriesData<InfiniteData<SessionPage>>(
        { queryKey: [...AI_CHAT_QUERY_KEY, "sessions"] },
        (current) => current && ({ ...current, pages: current.pages.map((page) => ({
          ...page, sessions: page.sessions.filter((session) => session.session_id !== sessionId),
        })) }),
      );
      qc.removeQueries({ queryKey: aiChatMessagesKey(sessionId) });
      void qc.invalidateQueries({ queryKey: [...AI_CHAT_QUERY_KEY, "sessions"] });
    },
    meta: {
      successMessage: "대화를 삭제했습니다.",
      errorMessage: "대화를 삭제하지 못했습니다. 다시 시도해 주세요.",
    },
  });
}

export function useUpdateAiChatSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, payload }: { sessionId: number; payload: UpdateAiChatSessionRequest }) => {
      const res = await updateAiChatSession(sessionId, payload);
      if (!res.success) throw new Error(res.message || "대화를 수정하지 못했습니다.");
      return res.data.session;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: AI_CHAT_QUERY_KEY });
    },
    meta: { suppressSuccessToast: true, errorMessage: "대화를 수정하지 못했습니다." },
  });
}

export function useSendAiChatMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      payload,
    }: {
      sessionId: number;
      payload: SendAiChatMessageRequest;
    }) => {
      try {
        const res = await sendAiChatMessage(sessionId, payload);
        if (isDeletedSession(qc, sessionId)) return;
        if (!res.success)
          throw new Error(res.message || "AI 메시지 전송에 실패했습니다.");
        return res.data;
      } catch (error) {
        // A request already running on the server can finish with 404 after deletion.
        if (isDeletedSession(qc, sessionId)) return;
        throw error;
      }
    },
    onSuccess: (data, variables) => {
      if (!data || isDeletedSession(qc, variables.sessionId)) return;
      qc.setQueryData<InfiniteData<MessagePage>>(
        aiChatMessagesKey(variables.sessionId),
        (current) => {
          const incoming = [data.user_message, data.assistant_message];
          if (!current) return { pages: [{ messages: incoming }], pageParams: [undefined] };
          return { ...current, pages: current.pages.map((page, index) => index === 0
            ? { ...page, messages: mergeChatMessages(page.messages, incoming) }
            : page) };
        },
      );
      qc.invalidateQueries({ queryKey: [...AI_CHAT_QUERY_KEY, "sessions"] });
    },
    onError: async (_error, variables) => {
      if (isDeletedSession(qc, variables.sessionId)) return;
      await qc.invalidateQueries({ queryKey: aiChatMessagesKey(variables.sessionId) });
      await qc.invalidateQueries({ queryKey: [...AI_CHAT_QUERY_KEY, "sessions"] });
    },
    retry: false,
    meta: {
      suppressSuccessToast: true,
      errorMessage: "AI 메시지 전송에 실패했습니다.",
    },
  });
}

export function useApplyAiChatMessageAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      messageId,
      payload,
    }: {
      messageId: number;
      sessionId?: number;
      payload: ApplyAiChatMessageRequest;
    }) => {
      const res = await applyAiChatMessageAction(messageId, payload);
      if (!res.success)
        throw new Error(res.message || "AI 제안 적용에 실패했습니다.");
      return res.data;
    },
    onSuccess: (_data, variables) => {
      if (variables.sessionId) {
        qc.invalidateQueries({
          queryKey: aiChatMessagesKey(variables.sessionId),
        });
      }
      qc.invalidateQueries({ queryKey: AI_CHAT_QUERY_KEY });
      qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: REMINDERS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
      qc.invalidateQueries({ queryKey: TODAY_BRIEFING_QUERY_KEY });
    },
    onError: async (error, variables) => {
      // Conflicts and lost responses can leave the stored state ahead of the UI.
      if (variables.sessionId && !isDeletedSession(qc, variables.sessionId)) {
        await qc.invalidateQueries({ queryKey: aiChatMessagesKey(variables.sessionId) });
      }
      if (getErrorCode(error) === "AI_CHAT_SESSION_ARCHIVED") {
        await qc.invalidateQueries({ queryKey: [...AI_CHAT_QUERY_KEY, "sessions"] });
      }
      if (getErrorCode(error) === "AI_CHAT_ACTION_ALREADY_APPLIED") {
        await Promise.all([
          TASKS_QUERY_KEY, SCHEDULES_QUERY_KEY, REMINDERS_QUERY_KEY,
          TODAY_HOME_QUERY_KEY, TODAY_BRIEFING_QUERY_KEY,
        ].map((queryKey) => qc.invalidateQueries({ queryKey })));
      }
    },
    retry: false,
    meta: {
      successMessage: "AI 제안을 적용했습니다.",
      errorMessage: "AI 제안 적용에 실패했습니다.",
    },
  });
}
