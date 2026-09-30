import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export type TaskComposer =
  | { kind: "schedule-add" }
  | { kind: "task-panel"; scheduleId: number }
  | { kind: "task-quick-add"; scheduleId: number | null }
  | { kind: "task-edit"; taskId: number }
  | null;

export const TaskComposerContext = createContext<{
  active: TaskComposer;
  setActive: Dispatch<SetStateAction<TaskComposer>>;
} | null>(null);

export function useTaskComposer() {
  return useContext(TaskComposerContext);
}
