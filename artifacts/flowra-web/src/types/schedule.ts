export type ScheduleType =
  | "personal"
  | "meeting"
  | "fieldwork"
  | "deadline"
  | "other";

export type ScheduleVisibility = "private" | "company";

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

export const SCHEDULE_VISIBILITY_LABELS: Partial<Record<ScheduleVisibility, string>> = {
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

export interface ScheduleListQuery {
  start_from?: string;
  start_to?: string;
  start_date?: string;
  end_date?: string;
  view?: "month" | "week" | "day" | "list";
  category_id?: string | number;
  schedule_type?: ScheduleType;
  page?: number;
  size?: number;
}
