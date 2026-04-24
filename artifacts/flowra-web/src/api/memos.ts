import apiClient from "./client";
import { createSchedule } from "./schedules";
import { createTask } from "./tasks";
import { compactParams, toNullableString, toOptionalString, toOptionalNumber } from "./normalize";
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
  TaskPriority,
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
    category_id: toOptionalNumber(query.category_id),
  });
}

function isNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 404
  );
}

function normalizePriority(priority: unknown): TaskPriority {
  return priority === "low" ||
    priority === "medium" ||
    priority === "high" ||
    priority === "urgent"
    ? priority
    : "medium";
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
    force ? { force } : undefined,
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
  const { apply_type, ...requestPayload } = payload;
  const path =
    apply_type === "schedule"
      ? `/memos/${memoId}/apply/schedule`
      : `/memos/${memoId}/apply/task`;
  try {
    const res = await apiClient.post<ApiResponse<Record<string, unknown>>>(
      path,
      compactParams({
        ...requestPayload,
        override_category_id: toOptionalString(payload.override_category_id),
      }),
    );
    return {
      ...res.data,
      data: {
        apply_type,
        resource: res.data.data as unknown as ApplyMemoResponse["resource"],
      } satisfies ApplyMemoResponse,
    };
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    return applyMemoByCreatingResource(memoId, payload);
  }
}

async function applyMemoByCreatingResource(
  memoId: number,
  payload: ApplyMemoRequest,
) {
  const parseResult = await getMemoParseResult(memoId);
  const result = parseResult.data.latest_result;

  if (payload.apply_type === "schedule") {
    const suggested = result?.suggested_schedule;
    const title = payload.override_title ?? suggested?.title;
    const startDatetime =
      payload.override_start_datetime ?? suggested?.start_datetime;

    if (!title || !startDatetime) {
      throw new Error("Schedule suggestion is missing title or start time.");
    }

    const endDatetime = payload.override_end_datetime ?? suggested?.end_datetime;
    const location = payload.override_location ?? suggested?.location;
    const categoryId = payload.override_category_id;

    const created = await createSchedule({
      title,
      description: suggested?.description,
      schedule_type: "meeting",
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      all_day: false,
      location,
      category_id: categoryId,
      visibility: "private",
    });

    return {
      success: created.success,
      message: created.message,
      data: {
        apply_type: "schedule",
        resource: created.data.schedule,
      },
    } satisfies ApiResponse<ApplyMemoResponse>;
  }

  const suggested = result?.suggested_task;
  const title = payload.override_title ?? suggested?.title;

  if (!title) {
    throw new Error("Task suggestion is missing title.");
  }

  const dueDatetime = payload.override_due_datetime ?? suggested?.due_datetime;
  const priority = normalizePriority(
    payload.override_priority ?? suggested?.priority,
  );
  const categoryId = payload.override_category_id;

  const created = await createTask({
    title,
    description: suggested?.description,
    priority,
    status: "todo",
    due_datetime: dueDatetime,
    category_id: categoryId,
  });

  return {
    success: created.success,
    message: created.message,
    data: {
      apply_type: "task",
      resource: created.data.task,
    },
  } satisfies ApiResponse<ApplyMemoResponse>;
}
