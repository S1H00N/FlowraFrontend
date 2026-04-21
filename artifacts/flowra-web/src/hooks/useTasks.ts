import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  completeTask,
  createTask,
  deleteTask,
  listTasks,
  updateTask,
} from "@/api/tasks";
import type {
  CreateTaskRequest,
  PaginatedData,
  Task,
  TaskListQuery,
  UpdateTaskRequest,
} from "@/types";

export const TASKS_QUERY_KEY = ["tasks"] as const;

export function tasksListKey(query: TaskListQuery = {}) {
  return [...TASKS_QUERY_KEY, "list", query] as const;
}

export function useTasks(query: TaskListQuery = {}) {
  return useQuery<PaginatedData<Task>>({
    queryKey: tasksListKey(query),
    queryFn: async () => {
      const res = await listTasks(query);
      if (!res.success) {
        throw new Error(res.message || "할 일을 불러오지 못했습니다.");
      }
      return res.data;
    },
  });
}

function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (payload: CreateTaskRequest) => {
      const res = await createTask(payload);
      if (!res.success) throw new Error(res.message || "생성에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async ({
      taskId,
      payload,
    }: {
      taskId: number;
      payload: UpdateTaskRequest;
    }) => {
      const res = await updateTask(taskId, payload);
      if (!res.success) throw new Error(res.message || "수정에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const res = await deleteTask(taskId);
      if (!res.success) throw new Error(res.message || "삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
  });
}

export function useCompleteTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (taskId: number) => {
      const res = await completeTask(taskId);
      if (!res.success)
        throw new Error(res.message || "완료 처리에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
  });
}
