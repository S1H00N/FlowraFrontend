import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  completeTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  setTaskCompletion,
  updateTask,
} from "@/api/tasks";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import { toOffsetISOString } from "@/utils/dateUtils";
import type {
  CreateTaskRequest,
  Task,
  TaskListQuery,
  TaskStatus,
  UpdateTaskRequest,
} from "@/types";

export const TASKS_QUERY_KEY = ["tasks"] as const;

export function tasksListKey(query: TaskListQuery = {}) {
  return [...TASKS_QUERY_KEY, "list", query] as const;
}

export function taskDetailKey(taskId: number) {
  return [...TASKS_QUERY_KEY, "detail", taskId] as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function taskListQueryFromKey(queryKey: QueryKey): TaskListQuery | null {
  if (
    queryKey[0] !== TASKS_QUERY_KEY[0] ||
    queryKey[1] !== "list" ||
    !isRecord(queryKey[2])
  ) {
    return null;
  }

  return queryKey[2] as TaskListQuery;
}

function toFilterValues<T>(value: T | T[] | undefined) {
  if (value === undefined || value === null || value === "") return [];
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item))
    .filter(Boolean);
}

function matchesFilter<T>(
  filterValue: T | T[] | undefined,
  taskValue: T | null | undefined,
) {
  const filters = toFilterValues(filterValue);
  if (filters.length === 0) return true;
  if (taskValue === undefined || taskValue === null) return false;
  return filters.includes(String(taskValue));
}

function dateTimeValue(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function taskMatchesListQuery(task: Task, query: TaskListQuery) {
  if (!matchesFilter(query.status, task.status)) return false;
  if (!matchesFilter(query.priority, task.priority)) return false;
  if (!matchesFilter(query.category_id, task.category_id)) return false;
  if (!matchesFilter(query.schedule_id, task.schedule_id)) return false;

  if (query.schedule_filter === "linked" && !task.schedule_id) return false;
  if (query.schedule_filter === "unlinked" && task.schedule_id) return false;

  if (query.q?.trim()) {
    const keyword = query.q.trim().toLowerCase();
    const haystack = [task.title, task.description, task.location]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(keyword)) return false;
  }

  if (query.due_from || query.due_to) {
    const dueTime = dateTimeValue(task.due_datetime);
    if (dueTime === null) return query.include_no_due === true;

    const dueFrom = dateTimeValue(query.due_from);
    if (dueFrom !== null && dueTime < dueFrom) return false;

    const dueTo = dateTimeValue(query.due_to);
    if (dueTo !== null && dueTime > dueTo) return false;
  }

  return true;
}

function upsertTasks(current: Task[] | undefined, next: Task[]) {
  const tasksById = new Map<number, Task>();

  for (const task of current ?? []) {
    tasksById.set(task.task_id, task);
  }

  for (const task of next) {
    tasksById.set(task.task_id, task);
  }

  return [...tasksById.values()];
}

function syncCreatedTaskToListCaches(queryClient: QueryClient, task: Task) {
  queryClient
    .getQueryCache()
    .findAll({ queryKey: TASKS_QUERY_KEY })
    .forEach((query) => {
      const listQuery = taskListQueryFromKey(query.queryKey);
      if (!listQuery || !taskMatchesListQuery(task, listQuery)) return;

      queryClient.setQueryData<Task[]>(query.queryKey, (current) =>
        upsertTasks(current, [task]),
      );
    });
}

function syncUpdatedTaskToListCaches(queryClient: QueryClient, task: Task) {
  queryClient
    .getQueryCache()
    .findAll({ queryKey: TASKS_QUERY_KEY })
    .forEach((query) => {
      const listQuery = taskListQueryFromKey(query.queryKey);
      if (!listQuery) return;

      queryClient.setQueryData<Task[]>(query.queryKey, (current) => {
        const tasks = current ?? [];
        const hasTask = tasks.some((item) => item.task_id === task.task_id);
        const matches = taskMatchesListQuery(task, listQuery);

        if (!hasTask && !matches) return current;
        if (!hasTask && matches) return upsertTasks(tasks, [task]);
        if (!matches) {
          return tasks.filter((item) => item.task_id !== task.task_id);
        }

        return tasks.map((item) =>
          item.task_id === task.task_id ? { ...item, ...task } : item,
        );
      });
    });
}

function updateTaskCompletionInListCaches(
  queryClient: QueryClient,
  taskId: number,
  completed: boolean,
) {
  const status: TaskStatus = completed ? "done" : "todo";
  const completedAt = completed ? toOffsetISOString(new Date()) : null;

  queryClient
    .getQueryCache()
    .findAll({ queryKey: TASKS_QUERY_KEY })
    .forEach((query) => {
      const listQuery = taskListQueryFromKey(query.queryKey);
      if (!listQuery) return;

      queryClient.setQueryData<Task[]>(query.queryKey, (current) => {
        if (!current?.some((task) => task.task_id === taskId)) return current;

        return current
          .map((task) =>
            task.task_id === taskId
              ? {
                  ...task,
                  status,
                  completed_at: completedAt,
                }
              : task,
          )
          .filter((task) => taskMatchesListQuery(task, listQuery));
      });
    });
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

export function useTask(taskId: number | null, enabled = true) {
  return useQuery<Task>({
    queryKey: taskDetailKey(taskId ?? 0),
    enabled: enabled && taskId !== null,
    queryFn: async () => {
      const res = await getTask(taskId as number);
      if (!res.success) {
        throw new Error(res.message || "할 일을 불러오지 못했습니다.");
      }
      return res.data.task;
    },
  });
}

function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
  };
}

export function useCreateTask() {
  const invalidate = useInvalidateTasks();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTaskRequest) => {
      const res = await createTask(payload);
      if (!res.success) throw new Error(res.message || "생성에 실패했습니다.");
      return res.data.task;
    },
    onSuccess: (task) => {
      syncCreatedTaskToListCaches(queryClient, task);
      invalidate();
    },
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

export function useSetTaskCompletion() {
  const invalidate = useInvalidateTasks();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      completed,
    }: {
      taskId: number;
      completed: boolean;
    }) => {
      const res = await setTaskCompletion(taskId, completed);
      if (!res.success)
        throw new Error(res.message || "완료 상태 변경에 실패했습니다.");
      return res.data.task;
    },
    onMutate: async ({ taskId, completed }) => {
      await queryClient.cancelQueries({ queryKey: TASKS_QUERY_KEY });
      updateTaskCompletionInListCaches(queryClient, taskId, completed);
    },
    onSuccess: (task) => {
      syncUpdatedTaskToListCaches(queryClient, task);
      invalidate();
    },
    onError: () => invalidate(),
    meta: {
      successMessage: "완료 상태를 변경했습니다.",
      errorMessage: "완료 상태 변경에 실패했습니다.",
    },
  });
}
