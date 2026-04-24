export type ReminderTargetType = "schedule" | "task";
export type ReminderType = "push" | "in_app" | "email";

export const REMINDER_TYPES: ReminderType[] = ["in_app", "push", "email"];

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  in_app: "앱 알림",
  push: "푸시",
  email: "이메일",
};

export interface Reminder {
  reminder_id: number;
  target_type: ReminderTargetType;
  target_id: number;
  remind_at: string;
  reminder_type: ReminderType;
  is_sent?: boolean;
  sent_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateReminderRequest {
  target_type: ReminderTargetType;
  target_id: string;
  remind_at: string;
  reminder_type: ReminderType;
}

export interface ReminderListQuery {
  target_type?: ReminderTargetType;
  target_id?: string;
  is_sent?: boolean;
  remind_from?: string;
  remind_to?: string;
}

export interface UpdateReminderRequest {
  target_type?: ReminderTargetType;
  target_id?: string;
  remind_at?: string;
  reminder_type?: ReminderType;
  is_sent?: boolean;
  sent_at?: string | null;
}
