import apiClient from "./client";
import { toOffsetISOString } from "@/utils/dateUtils";
import type {
  ApiResponse,
  CreateTaskRequest,
  Task,
  TaskListQuery,
  UpdateTaskRequest,
} from "@/types";

export async function listTasks(query: TaskListQuery = {}) {
  const res = await apiClient.get<ApiResponse<{ tasks: Task[] }>>("/tasks", {
    params: query,
  });
  return res.data;
}

export async function createTask(payload: CreateTaskRequest) {
  const res = await apiClient.post<ApiResponse<{ task: Task }>>(
    "/tasks",
    payload,
  );
  return res.data;
}

export async function updateTask(taskId: number, payload: UpdateTaskRequest) {
  const res = await apiClient.patch<ApiResponse<{ task: Task }>>(
    `/tasks/${taskId}`,
    payload,
  );
  return res.data;
}

export async function deleteTask(taskId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/tasks/${taskId}`,
  );
  return res.data;
}

export async function completeTask(taskId: number) {
  const res = await apiClient.patch<ApiResponse<{ task: Task }>>(
    `/tasks/${taskId}`,
    {
      status: "done",
      completed_at: toOffsetISOString(new Date()),
    },
  );
  return res.data;
}
