import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  applyAiChatMessageAction,
  createAiChatSession,
  deleteAiChatSession,
  listAiChatMessages,
  listAiChatSessions,
  sendAiChatMessage,
} from "@/api/aiChat";
import { SCHEDULES_QUERY_KEY } from "@/hooks/useSchedules";
import { TASKS_QUERY_KEY } from "@/hooks/useTasks";
import { REMINDERS_QUERY_KEY } from "@/hooks/useReminders";
import { TODAY_BRIEFING_QUERY_KEY } from "@/hooks/useTodayBriefing";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  AiChatMessage,
  AiChatSessionsQuery,
  AiChatSession,
  ApplyAiChatMessageRequest,
  CreateAiChatSessionRequest,
  SendAiChatMessageRequest,
} from "@/types";

export const AI_CHAT_QUERY_KEY = ["ai-chat"] as const;

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
  return useQuery<AiChatSession[]>({
    queryKey: aiChatSessionsKey(query),
    enabled,
    queryFn: async () => {
      const res = await listAiChatSessions(query);
      if (!res.success)
        throw new Error(res.message || "AI 대화 목록을 불러오지 못했습니다.");
      return res.data.sessions ?? [];
    },
  });
}

export function useAiChatMessages(sessionId: number | null, enabled = true) {
  return useQuery<AiChatMessage[]>({
    queryKey: aiChatMessagesKey(sessionId ?? 0),
    enabled: enabled && sessionId !== null,
    queryFn: async () => {
      const res = await listAiChatMessages(sessionId as number);
      if (!res.success)
        throw new Error(res.message || "AI 대화를 불러오지 못했습니다.");
      return res.data.messages ?? [];
    },
  });
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
      qc.setQueriesData<AiChatSession[]>(
        { queryKey: [...AI_CHAT_QUERY_KEY, "sessions"] },
        (current) => current?.filter((session) => session.session_id !== sessionId),
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
      qc.setQueryData<AiChatMessage[]>(
        aiChatMessagesKey(variables.sessionId),
        (current) =>
          mergeChatMessages(current, [
            data.user_message,
            data.assistant_message,
          ]),
      );
      qc.invalidateQueries({ queryKey: [...AI_CHAT_QUERY_KEY, "sessions"] });
    },
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
    meta: {
      successMessage: "AI 제안을 적용했습니다.",
      errorMessage: "AI 제안 적용에 실패했습니다.",
    },
  });
}
