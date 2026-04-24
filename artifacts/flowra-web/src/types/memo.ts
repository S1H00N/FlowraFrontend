import type { Schedule } from "./schedule";
import type { Task } from "./task";

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
  category_id?: string;
}

export interface UpdateMemoRequest {
  category_id?: string | null;
  raw_text?: string;
  memo_type?: MemoType;
  source_type?: MemoSourceType;
  auto_parse?: boolean;
}

export interface MemoListQuery {
  parse_status?: ParseStatus;
  memo_type?: MemoType;
  category_id?: string;
}

export interface AiSuggestedSchedule {
  title?: string;
  description?: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  location?: string | null;
  category_id?: number | null;
}

export interface AiSuggestedTask {
  title?: string;
  description?: string | null;
  priority?: string | null;
  due_datetime?: string | null;
  category_id?: number | null;
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
  confidence_score?: number | null;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MemoParseResult {
  memo: Memo;
  latest_result: AiParseResult | null;
  parse_results: AiParseResult[];
}

export interface ApplyMemoRequest {
  ai_result_id?: string;
  apply_type: "schedule" | "task";
  category_id?: string;
  schedule_id?: string;
}

export interface ApplyMemoResponse {
  apply_type: "schedule" | "task";
  resource: Schedule | Task;
}
