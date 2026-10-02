import { useMemo } from "react";
import { useMoveTask, useTaskMovePending, useLocalTaskOrder } from "@/hooks/useTaskBoard";
import { orderTasks } from "@/lib/taskOrder";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error";
import type { Task } from "@/types";
export function useScheduleTaskOrder(scheduleId: number, tasks: Task[]) {
  const order = useLocalTaskOrder();
  const move = useMoveTask();
  const pending = useTaskMovePending();
  const orderedTasks = useMemo(() => orderTasks(tasks, order.data), [tasks, order.data]);
  const moveTask = (sourceId: number, targetId: number, after: boolean) => {
    const task = tasks.find((t) => t.task_id === sourceId);
    if (!task || sourceId === targetId || pending) return;
    move.mutate({ task, scheduleId: scheduleId || null, anchorId: targetId, after }, {
      onError: (error) => toast.error(getErrorMessage(error, "순서 저장에 실패했습니다. 다시 시도해 주세요.")),
    });
  };
  return { orderedTasks, moveTask };
}
