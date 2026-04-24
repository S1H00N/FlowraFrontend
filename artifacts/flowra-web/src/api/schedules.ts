import apiClient from "./client";
import type {
  ApiResponse,
  CreateScheduleRequest,
  Schedule,
  ScheduleListQuery,
  UpdateScheduleRequest,
} from "@/types";

export async function listSchedules(query: ScheduleListQuery = {}) {
  const res = await apiClient.get<ApiResponse<{ schedules: Schedule[] }>>(
    "/schedules",
    { params: query },
  );
  return res.data;
}

export async function createSchedule(payload: CreateScheduleRequest) {
  const res = await apiClient.post<ApiResponse<{ schedule: Schedule }>>(
    "/schedules",
    payload,
  );
  return res.data;
}

export async function updateSchedule(
  scheduleId: number,
  payload: UpdateScheduleRequest,
) {
  const res = await apiClient.patch<ApiResponse<{ schedule: Schedule }>>(
    `/schedules/${scheduleId}`,
    payload,
  );
  return res.data;
}

export async function deleteSchedule(scheduleId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/schedules/${scheduleId}`,
  );
  return res.data;
}
