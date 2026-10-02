import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import TaskItem from "@/components/TaskItem";
import { useLinkedTaskDrag } from "@/hooks/useLinkedTaskDrag";
import { useScheduleTaskOrder } from "@/hooks/useScheduleTaskOrder";
import type { Schedule, Task } from "@/types";
import { useTaskMoveContext } from "./TaskMoveContext";

/** Keep task keys in one list so completing/reordering a row preserves keyboard focus. */
export default function TaskList({
  tasks,
  schedule,
  selectionMode,
  selectedTaskIds,
  onToggleTaskSelection,
}: {
  tasks: Task[];
  schedule?: Schedule;
  selectionMode: boolean;
  selectedTaskIds: Set<number>;
  onToggleTaskSelection: (taskId: number) => void;
}) {
  const id = useId();
  const [showCompleted, setShowCompleted] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const moves = useTaskMoveContext();
  useEffect(() => {
    if (moves?.lastMoved?.scheduleId === (schedule?.schedule_id ?? null)) {
      setShowAll(true);
      setShowCompleted(true);
    }
  }, [moves?.lastMoved, schedule?.schedule_id]);
  const { orderedTasks, moveTask } = useScheduleTaskOrder(
    schedule?.schedule_id ?? 0,
    tasks,
  );
  const getReorderProps = useLinkedTaskDrag(orderedTasks, moveTask);
  const sorted = orderedTasks;
  const active = sorted.filter((task) => task.status !== "done");
  const done = sorted.filter((task) => task.status === "done");
  // Keep the rendered order stable when entering selection mode.
  const expanded = showCompleted;
  const previewLimit = schedule && !showAll ? 3 : Infinity;
  const visible = new Set(
    active.slice(0, previewLimit).map((task) => task.task_id),
  );
  const renderTask = (task: Task) => (
    <TaskItem
      key={task.task_id}
      task={task}
      schedule={schedule}
      compact
      hidden={task.status === "done" ? !expanded : !visible.has(task.task_id)}
      selectionMode={selectionMode}
      selected={selectedTaskIds.has(task.task_id)}
      onToggleSelection={() => onToggleTaskSelection(task.task_id)}
      onCompleting={() => {
        setShowCompleted(true);
        setShowAll(true);
      }}
      highlighted={moves?.lastMoved?.task.task_id === task.task_id}
      reorder={selectionMode ? undefined : moves ? moves.row(task, sorted) : getReorderProps(task)}
    />
  );
  return (
    <ul
      id={id}
      className={
        schedule ? "tasks-subtasks tasks-linked-list" : "tasks-subtasks"
      }
      aria-label={schedule ? `${schedule.title} 할 일` : "독립 할 일 목록"}
    >
      {[
        ...active.map(renderTask),
        ...(schedule && active.length > 3
          ? [
              <li key="more-toggle" className="tasks-list-control">
                <button
                  type="button"
                  className="tasks-completed-toggle"
                  aria-expanded={showAll}
                  aria-controls={id}
                  disabled={selectionMode && showAll}
                  onClick={() => setShowAll((value) => !value)}
                >
                  {showAll ? "간략히 보기" : `+ ${active.length - 3}개 더 보기`}
                </button>
              </li>,
            ]
          : []),
        ...(done.length
          ? [
              <li
                key="completed-toggle"
                className="tasks-completed-group"
                data-collapsed={!expanded}
              >
                <button
                  type="button"
                  className="tasks-completed-toggle"
                  aria-expanded={expanded}
                  aria-controls={id}
                  disabled={selectionMode && expanded}
                  onClick={() => setShowCompleted((value) => !value)}
                >
                  <ChevronDown
                    className={`tasks-chevron${expanded ? " tasks-chevron-open" : ""}`}
                    aria-hidden="true"
                  />
                  완료된 할 일 {done.length}개
                </button>
              </li>,
            ]
          : []),
        ...done.map(renderTask),
      ]}
    </ul>
  );
}
