import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ProjectWorkItems from "@/components/ProjectWorkItems";
import { toDateKey } from "@/components/CompactDateTimeInputs";
import DailyBriefing from "@/components/home/DailyBriefing";
import DashboardStats from "@/components/home/DashboardStats";
import TodaySchedule, {
  toDashboardSchedules,
} from "@/components/home/TodaySchedule";
import TodayTasks from "@/components/home/TodayTasks";
import OverdueTasks from "@/components/home/OverdueTasks";
import ErrorState from "@/components/ui/ErrorState";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useMe } from "@/hooks/useMe";
import { useSetTaskCompletion, useTasks } from "@/hooks/useTasks";
import { useTodayHome } from "@/hooks/useTodayHome";
import { useHomeTaskPlans } from "@/hooks/useHomeTaskPlans";
import {
  overdueDays,
  selectTodayTasks,
  taskPlanDateKey,
} from "@/lib/homeTasks";
import { taskPlanLabel } from "@/lib/homeTaskPlanLabel";

export default function Home() {
  const { user } = useAuth();
  const meQuery = useMe();
  const localToday = toDateKey(new Date());
  const localTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const homeQuery = useTodayHome({ date: localToday, timezone: localTimezone });
  const tasksQuery = useTasks({ status: ["todo", "in_progress", "postponed"] });
  const completion = useSetTaskCompletion();
  const [bulkOpen, setBulkOpen] = useState(false);
  const home = homeQuery.data;
  const date = home?.date ?? localToday;
  const timezone = home?.timezone ?? localTimezone;
  const incomplete = useMemo(
    () => (tasksQuery.data ?? []).filter((task) => task.status !== "done"),
    [tasksQuery.data],
  );
  const { plans } = useHomeTaskPlans(
    incomplete,
    home?.today_schedules ?? [],
    timezone,
  );
  const overdue = useMemo(
    () =>
      incomplete
        .filter((task) => overdueDays(task, date, timezone) > 0)
        .sort(
          (a, b) =>
            overdueDays(b, date, timezone) - overdueDays(a, date, timezone),
        ),
    [incomplete, date, timezone],
  );
  const todayTasks = useMemo(
    () =>
      selectTodayTasks(
        incomplete,
        date,
        timezone,
        new Set(
          incomplete.flatMap((task) => {
            const plan = plans.get(task.task_id);
            return task.schedule_id != null &&
              (plan?.status === "active" ||
                (plan?.status === "planned" &&
                  plan.schedule &&
                  taskPlanDateKey(plan.schedule, timezone) === date))
              ? [task.schedule_id]
              : [];
          }),
        ),
      ),
    [incomplete, date, timezone, plans],
  );
  const overdueRows = useMemo(() => {
    const todayIds = new Set(todayTasks.map((task) => task.task_id));
    return overdue.filter((task) => !todayIds.has(task.task_id));
  }, [overdue, todayTasks]);
  const replanCount = overdueRows.filter((task) => {
    const status = plans.get(task.task_id)?.status;
    return status === "unplanned" || status === "past";
  }).length;
  const scheduledLabels = new Map<number, { label: string; link: string }>();
  for (const task of todayTasks) {
    const plan = plans.get(task.task_id);
    if (plan?.status !== "planned" && plan?.status !== "active") continue;
    const label = taskPlanLabel(plan.schedule, plan.status, date, timezone);
    if (label && task.schedule_id != null) {
      const scheduleDate = plan.schedule
        ? taskPlanDateKey(plan.schedule, timezone)
        : null;
      scheduledLabels.set(task.task_id, {
        label,
        link: `/schedules?schedule_id=${task.schedule_id}${scheduleDate ? `&date=${scheduleDate}` : ""}`,
      });
    }
  }
  const schedules = useMemo(
    () =>
      toDashboardSchedules(
        date,
        home?.today_schedules ?? [],
        home?.organization_schedules ?? [],
      ),
    [date, home?.today_schedules, home?.organization_schedules],
  );
  const tasksReady = tasksQuery.isSuccess;
  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <AppShell
      wide
      greeting={
        <div className="min-w-0">
          <p className="truncate text-xs text-slate-400">{dateLabel}</p>
          <h1 className="truncate text-base font-bold leading-tight text-slate-800">
            좋은 하루예요, {meQuery.data?.name ?? user?.name ?? "사용자"}
          </h1>
        </div>
      }
    >
      {homeQuery.isLoading ? (
        <div role="status" aria-label="홈 불러오는 중" className="space-y-5">
          <div className="h-28 animate-pulse rounded-2xl bg-violet-100" />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <div
                key={key}
                className="h-28 animate-pulse rounded-xl bg-white"
              />
            ))}
          </div>
          <Spinner />
        </div>
      ) : homeQuery.isError ? (
        <ErrorState
          title="홈 대시보드를 불러오지 못했습니다"
          message={homeQuery.error.message}
          onRetry={() => void homeQuery.refetch()}
          retrying={homeQuery.isFetching}
        />
      ) : (
        <div className="min-w-0 space-y-5">
          <DailyBriefing
            scheduleCount={
              home?.summary.today_schedule_count ?? schedules.length
            }
            incompleteCount={
              tasksReady
                ? incomplete.length
                : (home?.summary.incomplete_task_count ?? null)
            }
            overdueCount={tasksReady ? overdue.length : null}
            replanCount={tasksReady ? replanCount : null}
          />
          <DashboardStats
            scheduleCount={
              home?.summary.today_schedule_count ?? schedules.length
            }
            incompleteCount={
              tasksReady
                ? incomplete.length
                : (home?.summary.incomplete_task_count ?? null)
            }
            overdueCount={tasksReady ? overdue.length : null}
            streak={home?.summary.current_completion_streak_days ?? 0}
            bestStreak={home?.summary.best_completion_streak_days ?? 0}
          />
          <div
            className="grid min-w-0 items-stretch gap-5 lg:grid-cols-2"
            data-testid="home-today-panels"
          >
            <TodaySchedule schedules={schedules} date={date} />
            {tasksQuery.isError ? (
              <ErrorState
                title="할 일을 불러오지 못했습니다"
                message={tasksQuery.error.message}
                onRetry={() => void tasksQuery.refetch()}
                retrying={tasksQuery.isFetching}
              />
            ) : tasksQuery.isLoading ? (
              <div
                role="status"
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500"
              >
                <Spinner size="xs" />할 일을 불러오는 중...
              </div>
            ) : (
              <TodayTasks
                tasks={todayTasks}
                today={date}
                timezone={timezone}
                scheduledLabels={scheduledLabels}
                pending={completion.isPending}
                onComplete={(task) => {
                  if (!completion.isPending)
                    completion.mutate({
                      taskId: task.task_id,
                      completed: true,
                    });
                }}
              />
            )}
          </div>
          <OverdueTasks
            tasks={tasksReady ? overdueRows : []}
            today={date}
            timezone={timezone}
            plans={plans}
            bulkOpen={bulkOpen}
            onBulkChange={setBulkOpen}
          />
          <ProjectWorkItems
            items={home?.project_work_items ?? []}
            title="오늘 프로젝트 업무"
          />
          <ProjectWorkItems
            items={home?.overdue_project_work_items ?? []}
            title="기한 지난 업무"
            overdue
          />
        </div>
      )}
    </AppShell>
  );
}
