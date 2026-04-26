import apiClient from "./client";
import { compactParams, toNullableString } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CreateRecurringScheduleRequest,
  CreateRecurringScheduleResponse,
  CreateScheduleRequest,
  Schedule,
  ScheduleListQuery,
  UpdateScheduleRequest,
} from "@/types";

type ScheduleListData = Partial<ApiListData<Schedule>> & {
  schedules?: Schedule[];
};
type ScheduleData = Schedule | { schedule: Schedule };
export interface DeleteSchedulesBulkData {
  deleted_count: number;
  failed_ids: number[];
}

function unwrapSchedule(data: ScheduleData): Schedule {
  return "schedule" in data ? data.schedule : data;
}

function normalizeSchedulePayload<
  T extends
    | CreateScheduleRequest
    | UpdateScheduleRequest
    | CreateRecurringScheduleRequest,
>(payload: T) {
  return compactParams({
    ...payload,
    category_id:
      "category_id" in payload
        ? toNullableString(payload.category_id)
        : undefined,
  });
}

function toDateParam(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return value.slice(0, 10);
}

function normalizeScheduleQuery(query: ScheduleListQuery) {
  return compactParams({
    start_date: query.start_date ?? toDateParam(query.start_from),
    end_date: query.end_date ?? toDateParam(query.start_to),
    view: query.view,
    page: query.page,
    size: query.size,
    category_id: Array.isArray(query.category_id)
      ? undefined
      : query.category_id,
    schedule_type: Array.isArray(query.schedule_type)
      ? undefined
      : query.schedule_type,
  });
}

export async function listSchedules(query: ScheduleListQuery = {}) {
  const res = await apiClient.get<ApiResponse<ScheduleListData>>("/schedules", {
    params: normalizeScheduleQuery(query),
  });
  return {
    ...res.data,
    data: {
      schedules: res.data.data.items ?? res.data.data.schedules ?? [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function createSchedule(payload: CreateScheduleRequest) {
  const res = await apiClient.post<ApiResponse<ScheduleData>>(
    "/schedules",
    normalizeSchedulePayload(payload),
  );
  return { ...res.data, data: { schedule: unwrapSchedule(res.data.data) } };
}

export async function createRecurringSchedule(
  payload: CreateRecurringScheduleRequest,
) {
  const res = await apiClient.post<
    ApiResponse<CreateRecurringScheduleResponse>
  >("/schedules/recurring", normalizeSchedulePayload(payload));
  return res.data;
}

export async function updateSchedule(
  scheduleId: number,
  payload: UpdateScheduleRequest,
) {
  const res = await apiClient.patch<ApiResponse<ScheduleData>>(
    `/schedules/${scheduleId}`,
    normalizeSchedulePayload(payload),
  );
  return { ...res.data, data: { schedule: unwrapSchedule(res.data.data) } };
}

export async function deleteSchedule(scheduleId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/schedules/${scheduleId}`,
  );
  return res.data;
}

function shouldFallbackBulkDelete(err: unknown) {
  const response = (
    err as {
      response?: {
        status?: number;
        data?: {
          error?: {
            details?: {
              issues?: Array<{ path?: string }>;
            };
          };
        };
      };
    }
  ).response;
  return (
    response?.status === 400 &&
    response.data?.error?.details?.issues?.some(
      (issue) => issue.path === "schedule_id",
    )
  );
}

export async function deleteSchedulesBulk(scheduleIds: Array<number | string>) {
  try {
    const res = await apiClient.delete<ApiResponse<DeleteSchedulesBulkData>>(
      "/schedules/bulk",
      {
        data: {
          schedule_ids: scheduleIds.map((scheduleId) => String(scheduleId)),
        },
      },
    );
    return res.data;
  } catch (err) {
    if (!shouldFallbackBulkDelete(err)) throw err;

    const failedIds: number[] = [];
    let deletedCount = 0;

    for (const scheduleId of scheduleIds) {
      const numericId = Number(scheduleId);
      try {
        const res = await deleteSchedule(numericId);
        if (res.success) deletedCount += 1;
        else failedIds.push(numericId);
      } catch {
        failedIds.push(numericId);
      }
    }

    return {
      success: true,
      message: "일정이 삭제되었습니다.",
      data: {
        deleted_count: deletedCount,
        failed_ids: failedIds,
      },
    };
  }
}
