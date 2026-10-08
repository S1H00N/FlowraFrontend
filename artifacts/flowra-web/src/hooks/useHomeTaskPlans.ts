import { useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { getSchedule } from "@/api/schedules";
import { scheduleDetailKey } from "@/hooks/useSchedules";
import {
  taskPlanStatus,
  type TaskPlanSchedule,
  type TaskPlanStatus,
} from "@/lib/homeTasks";
import type { HomeSchedule, Task } from "@/types";

export interface HomeTaskPlan {
  status: TaskPlanStatus;
  schedule?: TaskPlanSchedule;
  loading: boolean;
  error: boolean;
}

export function useHomeTaskPlans(
  tasks: Task[],
  todaySchedules: HomeSchedule[],
  timezone: string,
) {
  const [now, setNow] = useState(() => new Date());
  const ids = [
    ...new Set(
      tasks.flatMap((task) =>
        task.schedule_id != null ? [task.schedule_id] : [],
      ),
    ),
  ];
  const queries = useQueries({
    queries: ids.map((scheduleId) => ({
      queryKey: scheduleDetailKey(scheduleId),
      queryFn: async () => {
        const response = await getSchedule(scheduleId);
        if (!response.success)
          throw new Error(
            response.message || "일정 정보를 확인하지 못했습니다.",
          );
        return response.data.schedule;
      },
      staleTime: 60_000,
      refetchInterval: 60_000,
    })),
  });
  const summaries = new Map(
    todaySchedules.map((schedule) => [
      schedule.schedule_id ?? schedule.id,
      schedule,
    ]),
  );
  const schedules = ids.map(
    (id, index) => queries[index].data ?? summaries.get(id),
  );
  // Reclassify at a real start/end boundary, even without a network response.
  const nextBoundary = schedules.reduce((next, schedule) => {
    for (const value of [schedule?.start_datetime, schedule?.end_datetime]) {
      const boundary = value ? Date.parse(value) : NaN;
      if (boundary > now.getTime()) next = Math.min(next, boundary);
    }
    return next;
  }, now.getTime() + 60_000);
  useEffect(() => {
    const update = () => setNow(new Date());
    const timer = window.setTimeout(
      update,
      Math.max(1, nextBoundary - Date.now()),
    );
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [now, nextBoundary]);

  const plans = new Map<number, HomeTaskPlan>();
  for (const task of tasks) {
    const index = task.schedule_id == null ? -1 : ids.indexOf(task.schedule_id);
    const query = index < 0 ? undefined : queries[index];
    const schedule = index < 0 ? undefined : schedules[index];
    plans.set(task.task_id, {
      status: query?.isError
        ? "unknown"
        : taskPlanStatus(task, schedule, now, timezone),
      schedule,
      loading: !!query?.isPending && !schedule,
      error: !!query?.isError,
    });
  }
  return { plans, now };
}
