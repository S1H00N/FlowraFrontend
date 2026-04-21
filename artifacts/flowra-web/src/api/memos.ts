import apiClient from "./client";
import type {
  ApiResponse,
  CreateMemoRequest,
  Memo,
  MemoListQuery,
  MemoParseResult,
  PaginatedData,
  UpdateMemoRequest,
} from "@/types";

export async function listMemos(query: MemoListQuery = {}) {
  const res = await apiClient.get<ApiResponse<PaginatedData<Memo>>>("/memos", {
    params: query,
  });
  return res.data;
}

export async function createMemo(payload: CreateMemoRequest) {
  const res = await apiClient.post<ApiResponse<Memo>>("/memos", payload);
  return res.data;
}

export async function updateMemo(memoId: number, payload: UpdateMemoRequest) {
  const res = await apiClient.patch<ApiResponse<Memo>>(
    `/memos/${memoId}`,
    payload,
  );
  return res.data;
}

export async function deleteMemo(memoId: number) {
  const res = await apiClient.delete<ApiResponse<null>>(`/memos/${memoId}`);
  return res.data;
}

export async function parseMemo(memoId: number) {
  const res = await apiClient.post<ApiResponse<MemoParseResult>>(
    `/memos/${memoId}/parse`,
  );
  return res.data;
}

export async function getMemoParseResult(memoId: number) {
  const res = await apiClient.get<ApiResponse<MemoParseResult>>(
    `/memos/${memoId}/parse-result`,
  );
  return res.data;
}
