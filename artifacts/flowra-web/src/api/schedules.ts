import apiClient from "./client";
import { compactParams, toNullableString, toOptionalNumber } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CreateScheduleRequest,
  Schedule,
  ScheduleListQuery,
  UpdateScheduleRequest,
} from "@/types";

type ScheduleListData = ApiListData<Schedule> & { schedules?: Schedule[] };
type ScheduleData = Schedule | { schedule: Schedule };

function unwrapSchedule(data: ScheduleData): Schedule {
  return "schedule" in data ? data.schedule : data;
}

function normalizeSchedulePayload<
  T extends CreateScheduleRequest | UpdateScheduleRequest,
>(payload: T) {
  return compactParams({
    ...payload,
    category_id:
      "category_id" in payload ? toNullableString(payload.category_id) : undefined,
  });
}

function normalizeScheduleQuery(query: ScheduleListQuery) {
  const { start_from, start_to, ...rest } = query;
  return compactParams({
    ...rest,
    start_date: query.start_date ?? start_from,
    end_date: query.end_date ?? start_to,
    category_id: toOptionalNumber(query.category_id),
  });
}

export async function listSchedules(query: ScheduleListQuery = {}) {
  const res = await apiClient.get<ApiResponse<ScheduleListData>>(
    "/schedules",
    { params: normalizeScheduleQuery(query) },
  );
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
