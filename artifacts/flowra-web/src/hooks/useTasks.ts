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
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CreateTaskRequest,
  Task,
  TaskListQuery,
  UpdateTaskRequest,
} from "@/types";

export const TASKS_QUERY_KEY = ["tasks"] as const;

export function tasksListKey(query: TaskListQuery = {}) {
  return [...TASKS_QUERY_KEY, "list", query] as const;
}

export function useTasks(query: TaskListQuery = {}) {
  return useQuery<Task[]>({
    queryKey: tasksListKey(query),
    queryFn: async () => {
      const res = await listTasks(query);
      if (!res.success) {
        throw new Error(res.message || "할 일을 불러오지 못했습니다.");
      }
      return res.data.tasks ?? [];
    },
  });
}

function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    qc.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  return useMutation({
    mutationFn: async (payload: CreateTaskRequest) => {
      const res = await createTask(payload);
      if (!res.success) throw new Error(res.message || "생성에 실패했습니다.");
      return res.data.task;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "할 일을 추가했습니다.",
      errorMessage: "할 일 추가에 실패했습니다.",
    },
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
      return res.data.task;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "할 일을 수정했습니다.",
      errorMessage: "할 일 수정에 실패했습니다.",
    },
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
    meta: {
      successMessage: "할 일을 삭제했습니다.",
      errorMessage: "할 일 삭제에 실패했습니다.",
    },
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
    meta: {
      successMessage: "완료로 표시했습니다.",
      errorMessage: "완료 처리에 실패했습니다.",
    },
  });
}
