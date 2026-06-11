import { apiClient } from "./client";
import { compactParams, toOptionalString } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CreateReminderRequest,
  Reminder,
  ReminderListQuery,
  UpdateReminderRequest,
} from "@/types";

interface RemindersData {
  reminders: Reminder[];
}

type ReminderListData = ApiListData<Reminder> & { reminders?: Reminder[] };
type ReminderData = Reminder | { reminder: Reminder };

function unwrapReminder(data: ReminderData): Reminder {
  return "reminder" in data ? data.reminder : data;
}

export async function listReminders(query: ReminderListQuery = {}) {
  const res = await apiClient.get<ApiResponse<ReminderListData>>("/reminders", {
    params: compactParams({
      target_type: query.target_type,
      is_sent: query.is_sent === undefined ? undefined : String(query.is_sent),
      remind_from: query.remind_from,
      remind_to: query.remind_to,
    }),
  });
  const targetId = toOptionalString(query.target_id);
  const reminders = res.data.data.items ?? res.data.data.reminders ?? [];
  return {
    ...res.data,
    data: {
      reminders: targetId
        ? reminders.filter((reminder) => String(reminder.target_id) === targetId)
        : reminders,
    } satisfies RemindersData,
  };
}

export async function getReminder(reminderId: number) {
  const res = await apiClient.get<ApiResponse<ReminderData>>(
    `/reminders/${reminderId}`,
  );
  return { ...res.data, data: { reminder: unwrapReminder(res.data.data) } };
}

export async function createReminder(payload: CreateReminderRequest) {
  const res = await apiClient.post<ApiResponse<ReminderData>>(
    "/reminders",
    compactParams({
      ...payload,
      target_id: toOptionalString(payload.target_id),
    }),
  );
  return { ...res.data, data: { reminder: unwrapReminder(res.data.data) } };
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
  const res = await apiClient.patch<ApiResponse<ReminderData>>(
    `/reminders/${reminderId}`,
    compactParams({
      ...payload,
      target_id: toOptionalString(payload.target_id),
    }),
  );
  return { ...res.data, data: { reminder: unwrapReminder(res.data.data) } };
}
