import type { TaskPriority } from "./task";

export type ScheduleType =
  | "personal"
  | "meeting"
  | "fieldwork"
  | "deadline"
  | "other";

export type ScheduleVisibility = "private";

export const SCHEDULE_TYPES: ScheduleType[] = [
  "personal",
  "meeting",
  "fieldwork",
  "deadline",
  "other",
];

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  personal: "개인",
  meeting: "회의",
  fieldwork: "외근",
  deadline: "마감",
  other: "기타",
};

export const SCHEDULE_VISIBILITY_LABELS: Partial<
  Record<ScheduleVisibility, string>
> = {
  private: "비공개",
};

export interface Schedule {
  schedule_id: number;
  user_id?: number;
  title: string;
  description?: string | null;
  schedule_type: ScheduleType;
  priority?: "low" | "medium" | "high" | "urgent";
  is_completed?: boolean;
  start_datetime: string;
  end_datetime?: string | null;
  all_day: boolean;
  location?: string | null;
  category_id?: number | null;
  visibility: ScheduleVisibility;
  recurrence_group_id?: string | null;
  recurrence_sequence?: number | null;
  recurrence_rule?: RecurrenceRule | null;
  source_memo_id?: number | null;
  source_ai_result_id?: number | null;
  created_at: string;
  updated_at?: string;
}

export interface CreateScheduleRequest {
  title: string;
  description?: string | null;
  schedule_type?: ScheduleType;
  priority?: "low" | "medium" | "high" | "urgent";
  is_completed?: boolean;
  start_datetime: string;
  end_datetime?: string | null;
  all_day?: boolean;
  location?: string | null;
  category_id?: string | number | null;
  visibility?: ScheduleVisibility;
}

export interface UpdateScheduleRequest {
  title?: string;
  description?: string | null;
  schedule_type?: ScheduleType;
  priority?: "low" | "medium" | "high" | "urgent";
  is_completed?: boolean;
  start_datetime?: string;
  end_datetime?: string | null;
  all_day?: boolean;
  location?: string | null;
  category_id?: string | number | null;
  visibility?: ScheduleVisibility;
}

export type ScheduleWeekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ScheduleWeekdayAction =
  | "skip"
  | "move_next_day"
  | "move_previous_day";

export interface ScheduleWeekdayRule {
  weekday: ScheduleWeekday;
  action: ScheduleWeekdayAction;
}

export interface RecurrenceRule {
  repeat_interval_days: number;
  repeat_until: string;
  timezone?: string;
  weekday_rules?: ScheduleWeekdayRule[];
  excluded_dates?: string[];
  max_occurrences?: number;
  [key: string]: unknown;
}

export interface CreateRecurringScheduleRequest
  extends CreateScheduleRequest, RecurrenceRule {}

export interface CreateRecurringScheduleResponse {
  recurrence_group_id: string;
  recurrence_rule: RecurrenceRule;
  occurrence_count: number;
  schedules: Schedule[];
}

export interface ScheduleListQuery {
  start_from?: string;
  start_to?: string;
  start_date?: string;
  end_date?: string;
  view?: "month" | "week" | "day" | "list";
  category_id?: string | number | Array<string | number>;
  schedule_type?: ScheduleType | ScheduleType[];
  priority?: TaskPriority | TaskPriority[];
  is_completed?: boolean;
  q?: string;
  location?: string;
  page?: number;
  size?: number;
}
