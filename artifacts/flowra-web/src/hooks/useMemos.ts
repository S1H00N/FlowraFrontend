import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  applyMemo,
  createMemo,
  deleteMemo,
  getMemoParseResult,
  listMemos,
  parseMemo,
  updateMemo,
} from "@/api/memos";
import { SCHEDULES_QUERY_KEY } from "@/hooks/useSchedules";
import { TASKS_QUERY_KEY } from "@/hooks/useTasks";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  ApplyMemoRequest,
  CreateMemoRequest,
  Memo,
  MemoListQuery,
  MemoParseResult,
  UpdateMemoRequest,
} from "@/types";

export const MEMOS_QUERY_KEY = ["memos"] as const;

export function memosListKey(query: MemoListQuery = {}) {
  return [...MEMOS_QUERY_KEY, "list", query] as const;
}

export function memoParseResultKey(memoId: number) {
  return [...MEMOS_QUERY_KEY, "parse-result", memoId] as const;
}

export function useMemos(query: MemoListQuery = {}) {
  return useQuery<Memo[]>({
    queryKey: memosListKey(query),
    queryFn: async () => {
      const res = await listMemos(query);
      if (!res.success) {
        throw new Error(res.message || "메모를 불러오지 못했습니다.");
      }
      return res.data.memos ?? [];
    },
    refetchInterval: (q) => {
      const data = q.state.data as Memo[] | undefined;
      const hasInflight = data?.some(
        (m) => m.parse_status === "pending" || m.parse_status === "processing",
      );
      return hasInflight ? 3000 : false;
    },
  });
}

function useInvalidateMemos() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: MEMOS_QUERY_KEY });
}

export function useCreateMemo() {
  const invalidate = useInvalidateMemos();
  return useMutation({
    mutationFn: async (payload: CreateMemoRequest) => {
      const res = await createMemo(payload);
      if (!res.success) throw new Error(res.message || "생성에 실패했습니다.");
      return res.data.memo;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "메모를 추가했습니다.",
      errorMessage: "메모 추가에 실패했습니다.",
    },
  });
}

export function useUpdateMemo() {
  const invalidate = useInvalidateMemos();
  return useMutation({
    mutationFn: async ({
      memoId,
      payload,
    }: {
      memoId: number;
      payload: UpdateMemoRequest;
    }) => {
      const res = await updateMemo(memoId, payload);
      if (!res.success) throw new Error(res.message || "수정에 실패했습니다.");
      return res.data.memo;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "메모를 수정했습니다.",
      errorMessage: "메모 수정에 실패했습니다.",
    },
  });
}

export function useDeleteMemo() {
  const invalidate = useInvalidateMemos();
  return useMutation({
    mutationFn: async (memoId: number) => {
      const res = await deleteMemo(memoId);
      if (!res.success) throw new Error(res.message || "삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "메모를 삭제했습니다.",
      errorMessage: "메모 삭제에 실패했습니다.",
    },
  });
}

export function useParseMemo() {
  const invalidate = useInvalidateMemos();
  return useMutation({
    mutationFn: async (input: number | { memoId: number; force?: boolean }) => {
      const memoId = typeof input === "number" ? input : input.memoId;
      const force = typeof input === "number" ? false : input.force;
      const res = await parseMemo(memoId, force);
      if (!res.success)
        throw new Error(res.message || "AI 파싱 요청에 실패했습니다.");
      return res.data.memo;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "AI 분석을 시작했습니다.",
      errorMessage: "AI 분석 요청에 실패했습니다.",
    },
  });
}

export function useMemoParseResult(memoId: number | null, enabled = true) {
  return useQuery<MemoParseResult>({
    queryKey: memoParseResultKey(memoId ?? 0),
    enabled: enabled && memoId !== null,
    queryFn: async () => {
      const res = await getMemoParseResult(memoId as number);
      if (!res.success)
        throw new Error(res.message || "파싱 결과를 불러오지 못했습니다.");
      return res.data;
    },
    refetchInterval: (q) => {
      const data = q.state.data as MemoParseResult | undefined;
      if (!data) return false;
      return data.memo.parse_status === "pending" ||
        data.memo.parse_status === "processing"
        ? 3000
        : false;
    },
  });
}

export function useApplyMemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      memoId,
      payload,
    }: {
      memoId: number;
      payload: ApplyMemoRequest;
    }) => {
      const res = await applyMemo(memoId, payload);
      if (!res.success)
        throw new Error(res.message || "AI 결과 적용에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEMOS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
    },
    meta: {
      successMessage: "AI 결과를 실행 항목으로 만들었습니다.",
      errorMessage: "AI 결과 적용에 실패했습니다.",
    },
  });
}
