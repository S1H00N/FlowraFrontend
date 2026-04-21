import apiClient from "./client";
import type {
  ApiResponse,
  CreateTaskRequest,
  PaginatedData,
  Task,
  TaskListQuery,
  UpdateTaskRequest,
} from "@/types";

export async function listTasks(query: TaskListQuery = {}) {
  const res = await apiClient.get<ApiResponse<PaginatedData<Task>>>("/tasks", {
    params: query,
  });
  return res.data;
}

export async function createTask(payload: CreateTaskRequest) {
  const res = await apiClient.post<ApiResponse<Task>>("/tasks", payload);
  return res.data;
}

export async function updateTask(taskId: number, payload: UpdateTaskRequest) {
  const res = await apiClient.patch<ApiResponse<Task>>(
    `/tasks/${taskId}`,
    payload,
  );
  return res.data;
}

export async function deleteTask(taskId: number) {
  const res = await apiClient.delete<ApiResponse<null>>(`/tasks/${taskId}`);
  return res.data;
}

export async function completeTask(taskId: number) {
  const res = await apiClient.patch<ApiResponse<Task>>(
    `/tasks/${taskId}/complete`,
  );
  return res.data;
}
