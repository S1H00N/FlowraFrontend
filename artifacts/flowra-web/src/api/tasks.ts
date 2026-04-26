import apiClient from "./client";
import { toOffsetISOString } from "@/utils/dateUtils";
import { compactParams, toCommaParam, toNullableString } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CreateTaskRequest,
  Task,
  TaskListQuery,
  UpdateTaskRequest,
} from "@/types";

type TaskListData = Partial<ApiListData<Task>> & { tasks?: Task[] };
type TaskData = Task | { task: Task };

function unwrapTask(data: TaskData): Task {
  return "task" in data ? data.task : data;
}

function normalizeTaskPayload<T extends CreateTaskRequest | UpdateTaskRequest>(
  payload: T,
) {
  return compactParams({
    ...payload,
    category_id:
      "category_id" in payload ? toNullableString(payload.category_id) : undefined,
    schedule_id:
      "schedule_id" in payload ? toNullableString(payload.schedule_id) : undefined,
  });
}

function normalizeTaskQuery(query: TaskListQuery) {
  return compactParams({
    status: toCommaParam(query.status),
    priority: toCommaParam(query.priority),
    category_id: toCommaParam(query.category_id),
    schedule_id: toCommaParam(query.schedule_id),
    schedule_filter: query.schedule_id ? undefined : query.schedule_filter,
    q: query.q,
    due_from: query.due_from,
    due_to: query.due_to,
  });
}

export async function listTasks(query: TaskListQuery = {}) {
  const res = await apiClient.get<ApiResponse<TaskListData>>("/tasks", {
    params: normalizeTaskQuery(query),
  });
  return {
    ...res.data,
    data: {
      tasks: res.data.data.items ?? res.data.data.tasks ?? [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function createTask(payload: CreateTaskRequest) {
  const res = await apiClient.post<ApiResponse<TaskData>>(
    "/tasks",
    normalizeTaskPayload(payload),
  );
  return { ...res.data, data: { task: unwrapTask(res.data.data) } };
}

export async function updateTask(taskId: number, payload: UpdateTaskRequest) {
  const res = await apiClient.patch<ApiResponse<TaskData>>(
    `/tasks/${taskId}`,
    normalizeTaskPayload(payload),
  );
  return { ...res.data, data: { task: unwrapTask(res.data.data) } };
}

export async function deleteTask(taskId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/tasks/${taskId}`,
  );
  return res.data;
}

export async function completeTask(taskId: number) {
  const res = await apiClient.patch<ApiResponse<TaskData>>(
    `/tasks/${taskId}`,
    {
      status: "done",
      completed_at: toOffsetISOString(new Date()),
    },
  );
  return { ...res.data, data: { task: unwrapTask(res.data.data) } };
}
