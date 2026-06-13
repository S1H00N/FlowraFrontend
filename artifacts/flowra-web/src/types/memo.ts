import type { Schedule } from "./schedule";
import type { Task, TaskStatus } from "./task";
import type { Reminder } from "./reminder";

export type MemoType = "quick" | "meeting" | "general";
export type MemoSourceType = "manual" | "voice" | "imported";
export type ParseStatus = "pending" | "processing" | "completed" | "failed";

export const MEMO_TYPES: MemoType[] = ["quick", "meeting", "general"];
export const PARSE_STATUSES: ParseStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
];

export const MEMO_TYPE_LABELS: Record<MemoType, string> = {
  quick: "퀵 메모",
  meeting: "회의",
  general: "일반",
};

export const PARSE_STATUS_LABELS: Record<ParseStatus, string> = {
  pending: "대기 중",
  processing: "분석 중",
  completed: "완료",
  failed: "실패",
};

export interface Memo {
  memo_id: number;
  user_id?: number;
  category_id?: number | null;
  raw_text: string;
  memo_type: MemoType;
  source_type: MemoSourceType;
  parse_status: ParseStatus;
  parsed_at?: string | null;
  parse_error_message?: string | null;
  last_ai_result_id?: number | null;
  last_ai_result?: AiParseResult | null;
  created_at: string;
  updated_at?: string | null;
}

export interface CreateMemoRequest {
  raw_text: string;
  memo_type?: MemoType;
  source_type?: MemoSourceType;
  auto_parse?: boolean;
  category_id?: string | number | null;
}

export interface UpdateMemoRequest {
  category_id?: string | number | null;
  raw_text?: string;
  memo_type?: MemoType;
  source_type?: MemoSourceType;
  auto_parse?: boolean;
}

export interface MemoListQuery {
  parse_status?: ParseStatus;
  memo_type?: MemoType;
  category_id?: string | number;
  page?: number;
  size?: number;
}

export interface AiSuggestedSchedule {
  title?: string;
  description?: string | null;
  schedule_type?: Schedule["schedule_type"] | null;
  priority?: Schedule["priority"] | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  all_day?: boolean | null;
  location?: string | null;
  category_id?: number | null;
  visibility?: Schedule["visibility"] | null;
  recurrence?: Schedule["recurrence_rule"];
  reminders?: AiSuggestedReminder[];
}

export interface AiSuggestedTask {
  title?: string;
  description?: string | null;
  priority?: string | null;
  status?: TaskStatus | null;
  due_datetime?: string | null;
  category_id?: number | null;
  location?: string | null;
  reminders?: AiSuggestedReminder[];
}

export interface AiSuggestedReminder {
  remind_at?: string | null;
  offset_minutes?: number | null;
  reminder_type?: Reminder["reminder_type"];
}

export type AiSuggestedActionType =
  | "create_schedule"
  | "create_task"
  | "pending_item";

export type AiSuggestedActionConfidence = "low" | "medium" | "high" | string;
export type AiParseResultStatus =
  | "suggested"
  | "partially_applied"
  | "approved"
  | "rejected";
export type AiAppliedResultStatus =
  | "suggested"
  | "partially_applied"
  | "approved";

export interface AiSuggestedAction {
  type: AiSuggestedActionType;
  related_action_index?: number | null;
  linked_existing_schedule_id?: string | null;
  title?: string;
  description?: string | null;
  schedule_type?: Schedule["schedule_type"] | null;
  priority?: string | null;
  status?: TaskStatus | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  all_day?: boolean | null;
  due_datetime?: string | null;
  location?: string | null;
  visibility?: Schedule["visibility"] | null;
  recurrence?: Schedule["recurrence_rule"] | null;
  reminders?: AiSuggestedReminder[];
  needs_review?: boolean;
  review_reason?: string | null;
  date_uncertain?: boolean;
  time_uncertain?: boolean;
  auto_filled?: boolean;
  source_text?: string | null;
  due_datetime_source?: string | null;
  related_schedule_title?: string | null;
  confidence?: AiSuggestedActionConfidence | null;
}

export interface AiActionState {
  action_index: number;
  action_type?: AiSuggestedActionType | string;
  applicable?: boolean;
  applied?: boolean;
}

export interface AiActionApplyState {
  executable_action_indexes?: number[];
  applied_action_indexes?: number[];
  remaining_action_indexes?: number[];
  skipped_action_indexes?: number[];
  action_states?: AiActionState[];
}

export interface AiAppliedActionResource {
  action_index?: number;
  action_type?: AiSuggestedActionType | string;
  resource_type?: "schedule" | "task" | string;
  resource_id?: number | string;
  schedule_id?: number | string;
  task_id?: number | string;
  schedule?: Schedule;
  task?: Task;
  resource?: Schedule | Task | null;
  resources?: Array<Schedule | Task>;
  created_at?: string;
}

export interface AiParseResult {
  ai_result_id: number;
  memo_id: number;
  user_id?: number;
  detected_type: "schedule" | "task" | "note" | "mixed" | string;
  extracted_title?: string | null;
  extracted_summary?: string | null;
  extracted_start_datetime?: string | null;
  extracted_end_datetime?: string | null;
  extracted_due_datetime?: string | null;
  extracted_priority?: string | null;
  suggested_schedule?: AiSuggestedSchedule | null;
  suggested_task?: AiSuggestedTask | null;
  suggested_actions?: AiSuggestedAction[] | null;
  confidence_score?: number | null;
  model_used?: string | null;
  status?: AiParseResultStatus | string;
  result_status?: AiParseResultStatus | string;
  executable_action_indexes?: number[];
  applied_action_indexes?: number[];
  remaining_action_indexes?: number[];
  action_states?: AiActionState[];
  applied_actions?: AiAppliedActionResource[];
  created_at?: string;
  updated_at?: string;
}

export interface MemoParseResult {
  memo: Memo;
  latest_result: AiParseResult | null;
  parse_results: AiParseResult[];
}

export interface ApplyMemoRequest {
  ai_result_id?: string | number;
  apply_type: "schedule" | "task" | "action" | "all";
  action_index?: number;
  category_id?: string | number;
  schedule_id?: string | number;
}

export interface ApplyMemoResponse {
  apply_type: ApplyMemoRequest["apply_type"];
  result_status?: AiAppliedResultStatus | string;
  executable_action_indexes?: number[];
  applied_action_indexes?: number[];
  remaining_action_indexes?: number[];
  skipped_action_indexes?: number[];
  action_states?: AiActionState[];
  resource: Schedule | Task | null;
  resources?: Array<Schedule | Task>;
  reminders?: Reminder[];
  applied_actions?: AiAppliedActionResource[];
}
