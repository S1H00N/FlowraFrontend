import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getTask } from "@/api/tasks";
import { getSchedule, listSchedules } from "@/api/schedules";
import { SCHEDULES_QUERY_KEY, scheduleDetailKey, useCreateSchedule } from "@/hooks/useSchedules";
import { TASKS_QUERY_KEY, useUpdateTask } from "@/hooks/useTasks";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import { toast } from "@/lib/toast";
import { taskPlanStatus } from "@/lib/homeTasks";
import { toOffsetISOString } from "@/utils/dateUtils";
import type { CreateScheduleRequest, Schedule, Task } from "@/types";

export type RescheduleRecoveryChoice = { scheduleId: number } | { createNew: true };
export interface ScheduleCreationRecovery {
  candidates: Schedule[];
  listChecked: boolean;
}

function creationMayHaveCommitted(error: unknown) {
  const failure = error as {
    code?: string;
    response?: { status?: number; data?: { success?: boolean } };
  };
  if (failure?.code === "ERR_CANCELED") return false;
  const status = failure?.response?.status;
  return !(status && status >= 400 && status < 500 && failure.response?.data?.success === false);
}

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
  const uncertainAttempts = useRef<Record<number, CreateScheduleRequest>>({});
  const [creationRecovery, setCreationRecovery] = useState<Record<number, ScheduleCreationRecovery>>({});

  async function checkCreation(taskId: number, attempt: CreateScheduleRequest) {
    try {
      const res = await listSchedules({ start_from: attempt.start_datetime, start_to: attempt.start_datetime });
      if (!res.success) throw new Error(res.message);
      const candidates = res.data.schedules.filter((schedule) =>
        !schedule.is_completed &&
        schedule.title === attempt.title &&
        Date.parse(schedule.start_datetime) === Date.parse(attempt.start_datetime) &&
        Date.parse(schedule.end_datetime ?? "") === Date.parse(attempt.end_datetime ?? ""),
      );
      setCreationRecovery((current) => ({ ...current, [taskId]: { candidates, listChecked: true } }));
      return candidates;
    } catch (error) {
      if ((error as { code?: string })?.code === "ERR_CANCELED") {
        clearCreationRecovery(taskId);
        throw error;
      }
      setCreationRecovery((current) => ({ ...current, [taskId]: { candidates: [], listChecked: false } }));
      throw new Error("일정 생성 결과를 확인하지 못했어요. 목록을 다시 확인한 뒤 연결할 일정이나 새 일정 만들기를 선택해 주세요.");
    }
  }

  function clearCreationRecovery(taskId: number) {
    delete uncertainAttempts.current[taskId];
    setCreationRecovery((current) => {
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  async function refreshTasks() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY }),
    ]);
  }

  async function save(task: Task, start: Date, duration: number, recoveryChoice?: RescheduleRecoveryChoice) {
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
      let recovered: Schedule | undefined;
      const uncertain = uncertainAttempts.current[task.task_id];
      if (uncertain) {
        const candidates = await checkCreation(task.task_id, uncertain);
        if (!recoveryChoice) {
          throw new Error("일정 생성 응답을 받지 못했어요. 같은 제목과 시간의 일정을 확인하고 연결하거나 새 일정 만들기를 선택해 주세요.");
        }
        if ("scheduleId" in recoveryChoice) {
          if (!candidates.some((item) => item.schedule_id === recoveryChoice.scheduleId)) {
            throw new Error("선택한 일정이 변경됐어요. 갱신된 목록에서 다시 확인해 주세요.");
          }
          const res = await getSchedule(recoveryChoice.scheduleId);
          if (!res.success) throw new Error(res.message || "일정을 확인하지 못했습니다.");
          recovered = res.data.schedule;
          if (recovered.is_completed || recovered.title !== uncertain.title ||
              Date.parse(recovered.start_datetime) !== Date.parse(uncertain.start_datetime) ||
              Date.parse(recovered.end_datetime ?? "") !== Date.parse(uncertain.end_datetime ?? "")) {
            throw new Error("선택한 일정이 변경됐어요. 갱신된 목록에서 다시 확인해 주세요.");
          }
          if (latest.data.task.schedule_id === recovered.schedule_id) {
            clearCreationRecovery(task.task_id);
            await refreshTasks();
            return recovered;
          }
        }
      }
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
      const payload: CreateScheduleRequest = {
          title: latest.data.task.title,
          schedule_type: "personal",
          start_datetime: toOffsetISOString(start),
          end_datetime: toOffsetISOString(
            new Date(start.getTime() + duration * 60_000),
          ),
          all_day: false,
          visibility: "private",
      };
      let schedule = previous ?? recovered;
      if (!schedule) {
        try {
          schedule = await createSchedule.mutateAsync(payload);
        } catch (error) {
          if (creationMayHaveCommitted(error)) {
            uncertainAttempts.current[task.task_id] = payload;
            await queryClient.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
            await checkCreation(task.task_id, payload);
            throw new Error("일정 생성 응답을 받지 못했어요. 같은 제목과 시간의 일정을 확인하고 연결하거나 새 일정 만들기를 선택해 주세요.");
          }
          throw error;
        }
      }
      clearCreationRecovery(task.task_id);
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
  return { save, pending, unlinked, creationRecovery };
}
