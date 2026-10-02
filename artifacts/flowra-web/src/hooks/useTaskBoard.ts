import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTasks, reorderScheduleTasks, updateTask } from "@/api/tasks";
import { useAuth } from "@/contexts/AuthContext";
import { findCachedTask, syncUpdatedTaskToListCaches, taskDetailKey, TASKS_QUERY_KEY } from "@/hooks/useTasks";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import { getErrorCode } from "@/lib/error";
import { localTaskOrderKey, orderTasks, orderScheduleTasks, readLocalTaskOrder, writeLocalTaskOrder } from "@/lib/taskOrder";
import type { Schedule, Task } from "@/types";

export const TASK_MOVE_KEY = ["task-move"] as const;
export interface TaskMove {
  task: Task;
  scheduleId: number | null;
  destinationSchedule?: Schedule;
  anchorId?: number;
  after?: boolean;
}

/** Independent task ordering is a browser preference; the API only orders linked tasks. */
export function useLocalTaskOrder() {
  const { user } = useAuth();
  const userId = user?.user_id ?? 0;
  return useQuery({
    queryKey: localTaskOrderKey(userId),
    queryFn: () => readLocalTaskOrder(userId),
    initialData: () => readLocalTaskOrder(userId),
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useTaskMovePending() {
  return useIsMutating({ mutationKey: TASK_MOVE_KEY }) > 0;
}

async function getFullScheduleTasks(scheduleId: number) {
  // Never pass the visible status, search, or date filters to a bulk reorder.
  const res = await listTasks({ schedule_id: scheduleId });
  if (!res.success) throw new Error(res.message || "할 일 순서를 불러오지 못했습니다.");
  return orderScheduleTasks(res.data.tasks);
}

function insertTask(tasks: Task[], move: TaskMove, task: Task) {
  const destination = tasks.filter((item) => item.task_id !== task.task_id);
  let index = destination.length;
  if (move.anchorId !== undefined) {
    const anchor = destination.findIndex((item) => item.task_id === move.anchorId);
    if (anchor < 0) throw new Error("할 일 목록이 변경되었습니다. 최신 목록에서 다시 시도해 주세요.");
    index = anchor + Number(!!move.after);
  }
  destination.splice(index, 0, task);
  return destination;
}

export function useMoveTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const userId = user?.user_id ?? 0;
  const localKey = localTaskOrderKey(userId);
  return useMutation({
    mutationKey: TASK_MOVE_KEY,
    retry: false,
    mutationFn: async (move: TaskMove) => {
      const sourceScheduleId = move.task.schedule_id ?? null;
      if (move.scheduleId === null) {
        if (sourceScheduleId === null) return { tasks: [] as Task[] };
        const res = await updateTask(move.task.task_id, { schedule_id: null });
        if (!res.success) throw new Error(res.message || "할 일을 이동하지 못했습니다.");
        return { tasks: [res.data.task] };
      }
      if (sourceScheduleId !== move.scheduleId && move.anchorId === undefined) {
        // The server appends atomically when sort_order is omitted.
        const res = await updateTask(move.task.task_id, { schedule_id: String(move.scheduleId) });
        if (!res.success) throw new Error(res.message || "할 일을 이동하지 못했습니다.");
        return { tasks: [res.data.task] };
      }
      const fullList = await getFullScheduleTasks(move.scheduleId);
      if (sourceScheduleId === move.scheduleId && !fullList.some((task) => task.task_id === move.task.task_id)) {
        throw new Error("할 일 목록이 변경되었습니다. 최신 목록에서 다시 시도해 주세요.");
      }
      const destination = insertTask(fullList, move, { ...move.task, schedule_id: move.scheduleId });
      if (sourceScheduleId === move.scheduleId) {
        const res = await reorderScheduleTasks(move.scheduleId, { task_ids: destination.map((task) => String(task.task_id)) });
        if (!res.success) throw new Error(res.message || "순서 저장에 실패했습니다.");
        return res.data;
      }
      const res = await updateTask(move.task.task_id, {
        schedule_id: String(move.scheduleId),
        sort_order: destination.findIndex((task) => task.task_id === move.task.task_id),
      });
      if (!res.success) throw new Error(res.message || "할 일을 이동하지 못했습니다.");
      return { tasks: [res.data.task] };
    },
    onMutate: async (move) => {
      await qc.cancelQueries({ queryKey: TASKS_QUERY_KEY });
      const previousLists = qc.getQueriesData<Task[]>({ queryKey: [...TASKS_QUERY_KEY, "list"] });
      const previousTask = findCachedTask(qc, move.task.task_id) ?? move.task;
      const previousLocalOrder = qc.getQueryData<number[]>(localKey) ?? readLocalTaskOrder(userId);
      const all = new Map<number, Task>();
      for (const [, tasks] of previousLists) for (const task of tasks ?? []) all.set(task.task_id, task);
      const destination = orderTasks([...all.values()].filter((task) =>
        task.task_id !== move.task.task_id && (task.schedule_id ?? null) === move.scheduleId,
      ), previousLocalOrder);
      let optimistic = { ...previousTask, schedule_id: move.scheduleId, ...(move.scheduleId === null ? { sort_order: null } : {}) };
      // A missing cached anchor is checked against the complete server list before saving.
      const cachedMove = move.anchorId !== undefined && !destination.some((task) => task.task_id === move.anchorId)
        ? { ...move, anchorId: undefined } : move;
      const next = insertTask(destination, cachedMove, optimistic);
      if (move.scheduleId === null) qc.setQueryData(localKey, next.map((task) => task.task_id));
      else {
        next.forEach((task, sort_order) => syncUpdatedTaskToListCaches(qc, { ...task, sort_order }));
        optimistic = { ...optimistic, sort_order: next.findIndex((task) => task.task_id === optimistic.task_id) };
      }
      syncUpdatedTaskToListCaches(qc, optimistic);
      qc.setQueryData(taskDetailKey(optimistic.task_id), optimistic);
      return { previousLists, previousTask, previousLocalOrder };
    },
    onSuccess: ({ tasks }, move) => {
      for (const task of tasks) {
        syncUpdatedTaskToListCaches(qc, task);
        qc.setQueryData(taskDetailKey(task.task_id), task);
      }
      if (move.scheduleId === null) writeLocalTaskOrder(userId, qc.getQueryData<number[]>(localKey) ?? []);
    },
    onError: (_error, _move, context) => {
      if (!context) return;
      for (const [key, tasks] of context.previousLists) qc.setQueryData(key, tasks);
      qc.setQueryData(taskDetailKey(context.previousTask.task_id), context.previousTask);
      qc.setQueryData(localKey, context.previousLocalOrder);
    },
    onSettled: (_data, error, move) => {
      // TASK_ORDER_MISMATCH must refresh hidden/completed rows before a retry.
      if (getErrorCode(error) === "TASK_ORDER_MISMATCH" || move.scheduleId !== null || move.task.schedule_id != null || error) {
        const refresh = Promise.all([
          qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
          qc.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY }),
        ]);
        // A saved move can finish while lists refresh in the background.
        // Failed moves keep the lock until refreshed data is ready for retry.
        if (error) return refresh;
        void refresh;
      }
      return undefined;
    },
  });
}
