import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTask } from "@/api/tasks";
import { getSchedule } from "@/api/schedules";
import { scheduleDetailKey, useCreateSchedule } from "@/hooks/useSchedules";
import { TASKS_QUERY_KEY, useUpdateTask } from "@/hooks/useTasks";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import { toast } from "@/lib/toast";
import { taskPlanStatus } from "@/lib/homeTasks";
import { toOffsetISOString } from "@/utils/dateUtils";
import type { Schedule, Task } from "@/types";

// Reuse the existing one-schedule-per-task relationship. Retain a created
// schedule after a failed link so a retry does not POST another schedule.
export function useTaskReschedule(
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  const queryClient = useQueryClient();
  const createSchedule = useCreateSchedule();
  const updateTask = useUpdateTask();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [unlinked, setUnlinked] = useState<Record<number, Schedule>>({});
  const created = useRef<Record<number, Schedule>>({});

  async function refreshTasks() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY }),
    ]);
  }

  async function save(task: Task, start: Date, duration: number) {
    if (lock.current) return null;
    lock.current = true;
    setPending(true);
    try {
      const latest = await getTask(task.task_id);
      if (!latest.success)
        throw new Error(latest.message || "할 일을 확인하지 못했습니다.");
      if (latest.data.task.status === "done") {
        await refreshTasks();
        throw new Error("이미 완료된 할 일이에요. 목록을 새로고침해 주세요.");
      }
      const previous = created.current[task.task_id];
      // A lost PATCH response may still have linked the schedule successfully.
      if (previous && latest.data.task.schedule_id === previous.schedule_id) {
        delete created.current[task.task_id];
        setUnlinked({ ...created.current });
        await refreshTasks();
        return previous;
      }
      if (
        (latest.data.task.schedule_id ?? null) !== (task.schedule_id ?? null)
      ) {
        await refreshTasks();
        throw new Error(
          "연결된 일정이 변경됐어요. 갱신된 목록에서 일정을 확인해 주세요.",
        );
      }
      // Re-read the actual schedule at save time: a link alone cannot say
      // whether this is still a valid plan. Never replace an active/upcoming
      // plan or guess when the schedule's time is unavailable.
      if (latest.data.task.schedule_id != null) {
        const linked = await getSchedule(latest.data.task.schedule_id);
        if (!linked.success) {
          throw new Error(linked.message || "예정 시간을 확인하지 못했습니다.");
        }
        queryClient.setQueryData(
          scheduleDetailKey(latest.data.task.schedule_id),
          linked.data.schedule,
        );
        const status = taskPlanStatus(
          latest.data.task,
          linked.data.schedule,
          new Date(),
          timezone,
        );
        if (status !== "past") {
          await refreshTasks();
          throw new Error(
            status === "unknown"
              ? "일정의 종료 시간을 확인할 수 없어 재계획하지 못했어요. 일정을 확인해 주세요."
              : "이미 예정된 일정이 있어요. 일정 보기에서 확인해 주세요.",
          );
        }
      }
      const schedule =
        previous ??
        (await createSchedule.mutateAsync({
          title: latest.data.task.title,
          schedule_type: "personal",
          start_datetime: toOffsetISOString(start),
          end_datetime: toOffsetISOString(
            new Date(start.getTime() + duration * 60_000),
          ),
          all_day: false,
          visibility: "private",
        }));
      created.current[task.task_id] = schedule;
      setUnlinked({ ...created.current });
      // Deliberately omit due_datetime, status and all other Task fields.
      await updateTask.mutateAsync({
        taskId: task.task_id,
        payload: { schedule_id: schedule.schedule_id },
      });
      delete created.current[task.task_id];
      setUnlinked({ ...created.current });
      toast.success("마감일을 유지하고 새 일정에 연결했어요.");
      return schedule;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return { save, pending, unlinked };
}
