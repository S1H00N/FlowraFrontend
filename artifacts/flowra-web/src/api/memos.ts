import apiClient from "./client";
import { compactParams, toNullableString, toOptionalString } from "./normalize";
import type {
  AiParseResult,
  ApiListData,
  ApiResponse,
  ApplyMemoRequest,
  ApplyMemoResponse,
  CreateMemoRequest,
  Memo,
  MemoListQuery,
  MemoParseResult,
  UpdateMemoRequest,
} from "@/types";

interface RawMemoParseResult {
  memo?: Memo;
  memo_id?: number;
  parse_status?: Memo["parse_status"];
  result?: AiParseResult | null;
  latest_result?: AiParseResult | null;
  parse_results?: AiParseResult[];
}

type MemoListData = ApiListData<Memo> & { memos?: Memo[] };
type MemoData = Memo | { memo: Memo };

function unwrapMemo(data: MemoData): Memo {
  return "memo" in data ? data.memo : data;
}

function normalizeMemoPayload<T extends CreateMemoRequest | UpdateMemoRequest>(
  payload: T,
) {
  return compactParams({
    ...payload,
    category_id:
      "category_id" in payload ? toNullableString(payload.category_id) : undefined,
  });
}

function normalizeMemoQuery(query: MemoListQuery) {
  return compactParams({
    ...query,
    category_id: toOptionalString(query.category_id),
  });
}

export async function listMemos(query: MemoListQuery = {}) {
  const res = await apiClient.get<ApiResponse<MemoListData>>("/memos", {
    params: normalizeMemoQuery(query),
  });
  return {
    ...res.data,
    data: {
      memos: res.data.data.items ?? res.data.data.memos ?? [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function createMemo(payload: CreateMemoRequest) {
  const res = await apiClient.post<ApiResponse<MemoData>>(
    "/memos",
    normalizeMemoPayload(payload),
  );
  return { ...res.data, data: { memo: unwrapMemo(res.data.data) } };
}

export async function updateMemo(memoId: number, payload: UpdateMemoRequest) {
  const res = await apiClient.patch<ApiResponse<MemoData>>(
    `/memos/${memoId}`,
    normalizeMemoPayload(payload),
  );
  return { ...res.data, data: { memo: unwrapMemo(res.data.data) } };
}

export async function deleteMemo(memoId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/memos/${memoId}`,
  );
  return res.data;
}

export async function parseMemo(memoId: number, force = false) {
  const res = await apiClient.post<
    ApiResponse<Pick<Memo, "memo_id" | "parse_status"> | { memo: Pick<Memo, "memo_id" | "parse_status"> }>
  >(
    `/memos/${memoId}/parse`,
    { force },
  );
  return {
    ...res.data,
    data: {
      memo: "memo" in res.data.data ? res.data.data.memo : res.data.data,
    },
  };
}

export async function getMemoParseResult(memoId: number) {
  const res = await apiClient.get<ApiResponse<RawMemoParseResult>>(
    `/memos/${memoId}/parse-result`,
  );
  const result = res.data.data.latest_result ?? res.data.data.result ?? null;
  const memo: Memo = res.data.data.memo ?? {
    memo_id: res.data.data.memo_id ?? memoId,
    raw_text: "",
    memo_type: "quick",
    source_type: "manual",
    parse_status: res.data.data.parse_status ?? "pending",
    created_at: "",
  };
  return {
    ...res.data,
    data: {
      memo,
      latest_result: result,
      parse_results: res.data.data.parse_results ?? (result ? [result] : []),
    } satisfies MemoParseResult,
  };
}

export async function applyMemo(memoId: number, payload: ApplyMemoRequest) {
  const res = await apiClient.post<ApiResponse<ApplyMemoResponse>>(
    `/memos/${memoId}/apply`,
    compactParams({
      ...payload,
      ai_result_id: toOptionalString(payload.ai_result_id),
      category_id: toOptionalString(payload.category_id),
      schedule_id: toOptionalString(payload.schedule_id),
    }),
  );
  return res.data;
}
