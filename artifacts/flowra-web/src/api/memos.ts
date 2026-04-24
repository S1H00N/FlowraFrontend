import apiClient from "./client";
import type {
  ApiResponse,
  ApplyMemoRequest,
  ApplyMemoResponse,
  CreateMemoRequest,
  Memo,
  MemoListQuery,
  MemoParseResult,
  UpdateMemoRequest,
} from "@/types";

export async function listMemos(query: MemoListQuery = {}) {
  const res = await apiClient.get<ApiResponse<{ memos: Memo[] }>>("/memos", {
    params: query,
  });
  return res.data;
}

export async function createMemo(payload: CreateMemoRequest) {
  const res = await apiClient.post<ApiResponse<{ memo: Memo }>>(
    "/memos",
    payload,
  );
  return res.data;
}

export async function updateMemo(memoId: number, payload: UpdateMemoRequest) {
  const res = await apiClient.patch<ApiResponse<{ memo: Memo }>>(
    `/memos/${memoId}`,
    payload,
  );
  return res.data;
}

export async function deleteMemo(memoId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/memos/${memoId}`,
  );
  return res.data;
}

export async function parseMemo(memoId: number, force = false) {
  const res = await apiClient.post<ApiResponse<{ memo: Memo | null }>>(
    `/memos/${memoId}/parse`,
    { force },
  );
  return res.data;
}

export async function getMemoParseResult(memoId: number) {
  const res = await apiClient.get<ApiResponse<MemoParseResult>>(
    `/memos/${memoId}/parse-result`,
  );
  return res.data;
}

export async function applyMemo(memoId: number, payload: ApplyMemoRequest) {
  const res = await apiClient.post<ApiResponse<ApplyMemoResponse>>(
    `/memos/${memoId}/apply`,
    payload,
  );
  return res.data;
}
