import { apiClient } from "./client";
import type {
  ApiResponse,
  CreateReminderRequest,
  Reminder,
  ReminderListQuery,
  UpdateReminderRequest,
} from "@/types";

interface RemindersData {
  reminders: Reminder[];
}

export async function listReminders(query: ReminderListQuery = {}) {
  const res = await apiClient.get<ApiResponse<RemindersData>>("/reminders", {
    params: query,
  });
  return res.data;
}

export async function createReminder(payload: CreateReminderRequest) {
  const res = await apiClient.post<ApiResponse<{ reminder: Reminder }>>(
    "/reminders",
    payload,
  );
  return res.data;
}

export async function deleteReminder(reminderId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/reminders/${reminderId}`,
  );
  return res.data;
}

export async function updateReminder(
  reminderId: number,
  payload: UpdateReminderRequest,
) {
  const res = await apiClient.patch<ApiResponse<{ reminder: Reminder }>>(
    `/reminders/${reminderId}`,
    payload,
  );
  return res.data;
}
