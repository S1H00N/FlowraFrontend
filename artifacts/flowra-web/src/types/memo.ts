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
  raw_text: string;
  memo_type: MemoType;
  source_type: MemoSourceType;
  parse_status: ParseStatus;
  parsed_at?: string | null;
  parse_error_message?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface CreateMemoRequest {
  raw_text: string;
  memo_type: MemoType;
  source_type: MemoSourceType;
  auto_parse?: boolean;
}

export interface UpdateMemoRequest {
  raw_text?: string;
  memo_type?: MemoType;
}

export interface MemoListQuery {
  parse_status?: ParseStatus;
  memo_type?: MemoType;
  page?: number;
  size?: number;
}

export interface MemoParseResult {
  memo_id: number;
  parse_status: ParseStatus;
  result?: {
    ai_result_id: number;
    detected_type: string;
    suggested_schedule?: {
      title: string;
      description?: string | null;
      start_datetime?: string | null;
      end_datetime?: string | null;
      location?: string | null;
      category_id?: number | null;
    } | null;
    suggested_task?: {
      title: string;
      description?: string | null;
      priority?: string | null;
      due_datetime?: string | null;
      category_id?: number | null;
    } | null;
    confidence_score?: number;
    status?: string;
    created_at?: string;
  } | null;
}
