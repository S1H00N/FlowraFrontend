import type { TaskPriority } from "./task";
import type { FriendPreset, PublicUserSummary } from "./friend";

export type ScheduleType =
  | "personal"
  | "meeting"
  | "fieldwork"
  | "deadline"
  | "other";

export type ScheduleVisibility = "private" | "link" | "friends";
export type EditableScheduleVisibility = "private";

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
  link: "링크 공유",
  friends: "친구 공유",
};

export interface Schedule {
  schedule_id: number;
  company_schedule_id?: number;
  is_company_schedule?: boolean;
  company?: {
    company_id: number;
    public_uid?: string;
    name: string;
    status?: string;
  };
  user_id?: number;
  title: string;
  description?: string | null;
  schedule_type: ScheduleType;
  priority?: "low" | "medium" | "high" | "urgent";
  is_completed?: boolean;
  completed_at?: string | null;
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
  source_type?: string | null;
  is_shared?: boolean;
  shared_permission?: ScheduleSharePermission | null;
  targets?: Array<Record<string, unknown>>;
  is_collaboration?: boolean;
  approval_status?: string | null;
  approval_summary?: Record<string, unknown> | null;
  origin_department?: unknown;
  created_by_company_member?: unknown;
  updated_by_company_member?: unknown;
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

export type ScheduleSharePermission = "viewer" | "editor";
export type ScheduleShareStatus = "active" | "revoked";
export type ScheduleShareLinkStatus = "active" | "disabled";
export type ScheduleShareSourceType =
  | "manual"
  | "link"
  | "all_friends"
  | "preset";

export interface ScheduleShare {
  schedule_share_id: number;
  schedule_id: number;
  shared_user_id?: number | null;
  shared_user?: PublicUserSummary | null;
  permission: ScheduleSharePermission | string;
  status: ScheduleShareStatus | string;
  source_type?: ScheduleShareSourceType | string | null;
  source_preset_id?: number | null;
  source_preset_version?: number | null;
  source_preset?: FriendPreset | null;
  joined_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleShareLink {
  schedule_share_link_id: number;
  schedule_id: number;
  token?: string;
  permission: ScheduleSharePermission | string;
  status: ScheduleShareLinkStatus | string;
  max_uses?: number | null;
  used_count?: number;
  expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateScheduleShareLinkRequest {
  permission: ScheduleSharePermission;
  max_uses?: number | null;
  expires_at?: string | null;
}

export interface CreateScheduleShareLinkResponse {
  share_link: ScheduleShareLink;
  url: string;
  token: string;
}

export interface UpdateScheduleShareLinkRequest {
  permission?: ScheduleSharePermission;
  status?: ScheduleShareLinkStatus;
  max_uses?: number | null;
  expires_at?: string | null;
}

export interface ScheduleShareLinkPreview {
  schedule: Pick<
    Schedule,
    | "schedule_id"
    | "title"
    | "description"
    | "schedule_type"
    | "start_datetime"
    | "end_datetime"
    | "all_day"
    | "location"
  >;
  owner: PublicUserSummary;
  permission: ScheduleSharePermission | string;
  max_uses?: number | null;
  used_count?: number;
  expires_at?: string | null;
  requires_login: boolean;
}

export interface JoinScheduleShareLinkResponse {
  share: ScheduleShare;
  schedule: Schedule;
  owner: PublicUserSummary;
  joined: boolean;
}

export interface CreateScheduleFriendShareRequest {
  scope: "all_friends" | "preset";
  permission: ScheduleSharePermission;
  friend_preset_id?: string | number;
}

export interface CreateScheduleFriendShareResponse {
  schedule_id: number;
  scope: "all_friends" | "preset";
  friend_preset_id?: number | null;
  friend_preset_version?: number | null;
  permission: ScheduleSharePermission | string;
  shared_count: number;
  shares: ScheduleShare[];
}

export interface UpdateScheduleShareRequest {
  permission?: ScheduleSharePermission;
  status?: ScheduleShareStatus;
}

export interface SharedSchedule {
  schedule_share_id: number;
  permission: ScheduleSharePermission | string;
  status: ScheduleShareStatus | string;
  joined_at?: string | null;
  owner?: PublicUserSummary;
  schedule: Schedule;
}

export interface SharedSchedulesQuery {
  start_from?: string;
  start_to?: string;
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
  category_id?: string | number | Array<string | number>;
  schedule_type?: ScheduleType | ScheduleType[];
  priority?: TaskPriority | TaskPriority[];
  is_completed?: boolean;
  q?: string;
  location?: string;
  page?: number;
  size?: number;
}
