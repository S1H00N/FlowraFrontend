import { useState, type DragEvent, type KeyboardEvent } from "react";
import type { Task } from "@/types";

export interface TaskReorderProps {
  dragging: boolean;
  dropPosition: "before" | "after" | null;
  onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  onDrop: (event: DragEvent<HTMLLIElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLLIElement>) => void;
  moveUp?: () => void;
  moveDown?: () => void;
}

export function useLinkedTaskDrag(
  orderedTasks: Task[],
  moveTask: (sourceId: number, targetId: number, after: boolean) => void,
) {
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [target, setTarget] = useState<{
    id: number;
    after: boolean;
  } | null>(null);

  const getReorderProps = (task: Task): TaskReorderProps => ({
    dragging: draggedId === task.task_id,
    dropPosition:
      target?.id === task.task_id
        ? target.after ? "after" : "before"
        : null,
    onDragStart: (event) => {
      if ((event.target as HTMLElement).closest('[data-task-drag-exclude], [role="checkbox"], button[aria-pressed], input, textarea, select')) {
        event.preventDefault();
        return;
      }
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(task.task_id));
      setDraggedId(task.task_id);
      setTarget(null);
    },
    onDragEnd: () => {
      setDraggedId(null);
      setTarget(null);
    },
    onDragOver: (event) => {
      if (draggedId === null || draggedId === task.task_id) return;
      const source = orderedTasks.find((item) => item.task_id === draggedId);
      if (!source || (source.status === "done") !== (task.status === "done")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const after = event.clientY >= event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2;
      setTarget((current) => current?.id === task.task_id && current.after === after ? current : { id: task.task_id, after });
    },
    onDrop: (event) => {
      if (draggedId === null) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      moveTask(draggedId, task.task_id, event.clientY >= rect.top + rect.height / 2);
      setDraggedId(null);
      setTarget(null);
    },
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      const group = orderedTasks.filter((item) => (item.status === "done") === (task.status === "done"));
      const index = group.findIndex((item) => item.task_id === task.task_id);
      const adjacent = group[index + (event.key === "ArrowUp" ? -1 : 1)];
      if (adjacent) moveTask(task.task_id, adjacent.task_id, event.key === "ArrowDown");
    },
  });

  return getReorderProps;
}
