import { apiClient } from "./client";
import type {
  ApiResponse,
  CreateReminderRequest,
  Reminder,
  ReminderListQuery,
} from "@/types";

interface RemindersData {
  reminders?: Reminder[];
  items?: Reminder[];
}

export async function listReminders(query: ReminderListQuery = {}) {
  const res = await apiClient.get<ApiResponse<RemindersData>>("/reminders", {
    params: query,
  });
  return res.data;
}

export async function createReminder(payload: CreateReminderRequest) {
  const res = await apiClient.post<ApiResponse<Reminder>>(
    "/reminders",
    payload,
  );
  return res.data;
}

export async function deleteReminder(reminderId: number) {
  const res = await apiClient.delete<ApiResponse<unknown>>(
    `/reminders/${reminderId}`,
  );
  return res.data;
}
