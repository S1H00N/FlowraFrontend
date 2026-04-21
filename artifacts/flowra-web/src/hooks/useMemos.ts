import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createMemo,
  deleteMemo,
  getMemoParseResult,
  listMemos,
  parseMemo,
  updateMemo,
} from "@/api/memos";
import type {
  CreateMemoRequest,
  Memo,
  MemoListQuery,
  MemoParseResult,
  PaginatedData,
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
  return useQuery<PaginatedData<Memo>>({
    queryKey: memosListKey(query),
    queryFn: async () => {
      const res = await listMemos(query);
      if (!res.success) {
        throw new Error(res.message || "메모를 불러오지 못했습니다.");
      }
      return res.data;
    },
    refetchInterval: (q) => {
      const data = q.state.data as PaginatedData<Memo> | undefined;
      const hasInflight = data?.items?.some(
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
      return res.data;
    },
    onSuccess: () => invalidate(),
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
      return res.data;
    },
    onSuccess: () => invalidate(),
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
  });
}

export function useParseMemo() {
  const invalidate = useInvalidateMemos();
  return useMutation({
    mutationFn: async (memoId: number) => {
      const res = await parseMemo(memoId);
      if (!res.success)
        throw new Error(res.message || "AI 파싱 요청에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
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
      return data.parse_status === "pending" ||
        data.parse_status === "processing"
        ? 3000
        : false;
    },
  });
}
