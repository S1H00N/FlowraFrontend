export type TaskStatus = "todo" | "in_progress" | "done" | "postponed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "in_progress",
  "done",
  "postponed",
];

export const TASK_PRIORITIES: TaskPriority[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "할 일",
  in_progress: "진행 중",
  done: "완료",
  postponed: "보류",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  urgent: "긴급",
};

export interface Task {
  task_id: number;
  user_id?: number;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_datetime?: string | null;
  category_id?: number | null;
  schedule_id?: number | null;
  location?: string | null;
  source_memo_id?: number | null;
  source_ai_result_id?: number | null;
  created_at: string;
  updated_at?: string;
  completed_at?: string | null;
}

export interface CreateTaskRequest {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_datetime?: string | null;
  completed_at?: string | null;
  category_id?: string;
  schedule_id?: string;
  location?: string | null;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  due_datetime?: string | null;
  completed_at?: string | null;
  category_id?: string | null;
  schedule_id?: string | null;
  location?: string | null;
}

export interface TaskListQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  category_id?: string;
  schedule_id?: string;
  due_from?: string;
  due_to?: string;
}
