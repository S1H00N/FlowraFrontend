export type ReminderTargetType =
  | "schedule"
  | "task"
  | "project_work_item"
  | "project_work_assignment";
export type ReminderType = "push" | "in_app";

export interface Reminder {
  reminder_id: number;
  target_type: ReminderTargetType;
  target_id: number;
  remind_at: string;
  reminder_type: ReminderType;
  is_sent?: boolean;
  sent_at?: string | null;
  send_attempts?: number;
  last_send_error_code?: string | null;
  last_send_error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateReminderRequest {
  target_type: ReminderTargetType;
  target_id: string | number;
  remind_at: string;
  reminder_type?: ReminderType;
}

export interface ReminderListQuery {
  target_type?: ReminderTargetType;
  is_sent?: boolean;
  remind_from?: string;
  remind_to?: string;
  // The public list API does not expose target_id as a query parameter yet.
  // Keep this as a client-side filter for per-resource reminder controls.
  target_id?: string | number;
}

export interface UpdateReminderRequest {
  target_type?: ReminderTargetType;
  target_id?: string | number;
  remind_at?: string;
  reminder_type?: ReminderType;
  is_sent?: boolean;
  sent_at?: string | null;
}
