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
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_datetime?: string | null;
  category_id?: number | null;
  schedule_id?: number | null;
  location?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_datetime?: string;
  category_id?: number;
  schedule_id?: number;
  location?: string;
}

export type UpdateTaskRequest = Partial<CreateTaskRequest>;

export interface TaskListQuery {
  status?: TaskStatus;
  priority?: TaskPriority;
  page?: number;
  size?: number;
  sort_by?: "created_at" | "due_datetime" | "priority";
  sort_order?: "asc" | "desc";
}
