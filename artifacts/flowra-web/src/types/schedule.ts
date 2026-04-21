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

export const SCHEDULE_VISIBILITY_LABELS: Record<ScheduleVisibility, string> = {
  private: "비공개",
  company: "회사 공개",
};

export interface Schedule {
  schedule_id: number;
  title: string;
  description?: string | null;
  schedule_type: ScheduleType;
  start_datetime: string;
  end_datetime?: string | null;
  all_day: boolean;
  location?: string | null;
  category_id?: number | null;
  visibility: ScheduleVisibility;
  created_at: string;
}

export interface CreateScheduleRequest {
  title: string;
  description?: string;
  schedule_type: ScheduleType;
  start_datetime: string;
  end_datetime?: string;
  all_day: boolean;
  location?: string;
  category_id?: number;
  visibility: ScheduleVisibility;
}

export type UpdateScheduleRequest = Partial<CreateScheduleRequest>;

export interface ScheduleListQuery {
  start_date?: string;
  end_date?: string;
  view?: "month" | "week" | "day" | "list";
  category_id?: number;
  schedule_type?: ScheduleType;
  page?: number;
  size?: number;
}
