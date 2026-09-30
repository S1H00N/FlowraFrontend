import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { Task } from "@/types";

const ORDER_CHANGED_EVENT = "flowra:schedule-task-order-changed";

function readOrder(key: string): number[] {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value)
      ? value.filter((id): id is number => Number.isSafeInteger(id) && id > 0)
      : [];
  } catch {
    return [];
  }
}

function dueTime(task: Task) {
  if (!task.due_datetime) return Infinity;
  const time = new Date(task.due_datetime).getTime();
  return Number.isNaN(time) ? Infinity : time;
}

/** The server does not expose a task order, so keep each user's order in this browser. */
export function useScheduleTaskOrder(scheduleId: number, tasks: Task[]) {
  const { user } = useAuth();
  const key = `flowra:schedule-task-order:v1:${user?.user_id ?? "guest"}:${scheduleId}`;
  const [storedOrder, setStoredOrder] = useState(() => readOrder(key));

  useEffect(() => {
    const refresh = () => setStoredOrder(readOrder(key));
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener(ORDER_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(ORDER_CHANGED_EVENT, refresh);
    };
  }, [key]);

  const orderedTasks = useMemo(() => {
    const byId = new Map(tasks.map((task) => [task.task_id, task]));
    const saved = storedOrder.flatMap((id) => {
      const task = byId.get(id);
      byId.delete(id);
      return task ? [task] : [];
    });
    const unsaved = [...byId.values()].sort((a, b) => dueTime(a) - dueTime(b));
    const combined = [...saved, ...unsaved];
    return [
      ...combined.filter((task) => task.status !== "done"),
      ...combined.filter((task) => task.status === "done"),
    ];
  }, [tasks, storedOrder]);

  const moveTask = (sourceId: number, targetId: number, after: boolean) => {
    if (sourceId === targetId) return;
    const source = orderedTasks.find((task) => task.task_id === sourceId);
    const target = orderedTasks.find((task) => task.task_id === targetId);
    if (!source || !target || (source.status === "done") !== (target.status === "done")) return;

    const next = orderedTasks.filter((task) => task.task_id !== sourceId);
    const targetIndex = next.findIndex((task) => task.task_id === targetId);
    next.splice(targetIndex + Number(after), 0, source);
    const ids = next.map((task) => task.task_id);
    setStoredOrder(ids);
    try {
      window.localStorage.setItem(key, JSON.stringify(ids));
      window.dispatchEvent(new Event(ORDER_CHANGED_EVENT));
    } catch {
      // The current view still reflects the move when storage is unavailable.
    }
  };

  return { orderedTasks, moveTask };
}
