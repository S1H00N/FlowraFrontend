import type { Task } from "@/types";

export const localTaskOrderKey = (userId: number) => ["local-task-order", userId] as const;
const storageKey = (userId: number) => `flowra-task-order:${userId}`;

export function readLocalTaskOrder(userId: number): number[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter((id): id is number => Number.isSafeInteger(id) && id > 0)
      : [];
  } catch {
    return [];
  }
}

export function writeLocalTaskOrder(userId: number, taskIds: number[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(taskIds));
  } catch {
    // A disabled/full browser store still allows ordering during this session.
  }
}

export function orderScheduleTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) =>
    (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity) || a.task_id - b.task_id,
  );
}

export function orderTasks(tasks: Task[], localOrder: number[] = []) {
  const localPositions = new Map(localOrder.map((id, index) => [id, index]));
  const rank = (task: Task) => task.schedule_id == null
    ? localPositions.get(task.task_id) ?? Infinity
    : task.sort_order ?? Infinity;
  const due = (task: Task) => task.due_datetime ? Date.parse(task.due_datetime) : Infinity;
  return [...tasks].sort((a, b) =>
    Number(a.status === "done") - Number(b.status === "done") ||
    rank(a) - rank(b) ||
    due(a) - due(b) ||
    Date.parse(b.created_at) - Date.parse(a.created_at) ||
    a.task_id - b.task_id,
  );
}
