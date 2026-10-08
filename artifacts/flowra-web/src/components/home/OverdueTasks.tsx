import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import BulkRescheduleModal from "./BulkRescheduleModal";
import RescheduleModal from "./RescheduleModal";
import { useTaskReschedule } from "@/hooks/useTaskReschedule";
import type { HomeTaskPlan } from "@/hooks/useHomeTaskPlans";
import { taskDueLabel, taskPlanDateKey } from "@/lib/homeTasks";
import { taskPlanLabel } from "@/lib/homeTaskPlanLabel";
import type { Task } from "@/types";

function OverdueTaskRow({
  task,
  today,
  timezone,
  plan,
  partial,
  onPlan,
}: {
  task: Task;
  today: string;
  timezone: string;
  plan?: HomeTaskPlan;
  partial: boolean;
  onPlan: () => void;
}) {
  const linkedId = task.schedule_id ?? null;
  const schedule = plan?.schedule;
  const date = schedule ? taskPlanDateKey(schedule, timezone) : null;
  const needsReplan = plan?.status === "unplanned" || plan?.status === "past";
  const status = plan?.error
    ? "일정의 시간을 확인하지 못했어요."
    : plan?.loading
      ? "일정 확인 중…"
      : (taskPlanLabel(schedule, plan?.status ?? "unknown", today, timezone) ??
        "일정의 시간 정보가 필요해요.");

  return (
    <div
      data-testid={`overdue-task-${task.task_id}`}
      className="flex min-w-0 flex-col gap-3 border-b border-slate-100 p-4 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:pr-16"
    >
      <div className="min-w-0 flex-1">
        <Link
          to={`/tasks?task_id=${task.task_id}`}
          className="block truncate text-sm font-medium text-slate-800 hover:text-violet-600"
        >
          {task.title}
        </Link>
        <p className="mt-1 text-xs text-slate-500">
          {taskDueLabel(task, today, timezone)}
        </p>
        {linkedId !== null && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-violet-600">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{status}</span>
          </p>
        )}
        {partial && (
          <p className="mt-2 text-xs text-amber-700">
            생성한 일정에 연결이 필요해요.
          </p>
        )}
      </div>
      <div className="flex shrink-0">
        {linkedId !== null && !needsReplan && !partial ? (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          >
            <Link
              to={`/schedules?schedule_id=${linkedId}${date ? `&date=${date}` : ""}`}
            >
              일정 보기
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
            onClick={onPlan}
          >
            {partial ? "연결 다시 시도" : "재계획"}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function OverdueTasks({
  tasks,
  today,
  timezone,
  plans,
  bulkOpen,
  onBulkChange,
}: {
  tasks: Task[];
  today: string;
  timezone: string;
  plans: ReadonlyMap<number, HomeTaskPlan>;
  bulkOpen: boolean;
  onBulkChange: (open: boolean) => void;
}) {
  const [plan, setPlan] = useState<Task | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const section = useRef<HTMLElement | null>(null);
  const reschedule = useTaskReschedule(timezone);
  const eligibleTasks = tasks.filter((task) => {
    const status = plans.get(task.task_id)?.status;
    return (
      task.status !== "done" && (status === "unplanned" || status === "past")
    );
  });
  useEffect(() => {
    if (!bulkOpen) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest('[role="dialog"]'))
      opener.current = active;
  }, [bulkOpen]);
  const restoreFocus = () => {
    requestAnimationFrame(() => {
      const target =
        opener.current?.isConnected && !opener.current.matches(":disabled")
          ? opener.current
          : (section.current ??
            document.querySelector<HTMLElement>('[aria-label="오늘 할 일"]'));
      target?.focus();
    });
  };
  function openPlan(task: Task) {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPlan(task);
  }
  // Keep an active dialog mounted if a background completion removes its row.
  if (!tasks.length && !plan && !bulkOpen) return null;
  return (
    <>
      {!!tasks.length && (
        <section
          ref={section}
          tabIndex={-1}
          aria-label="밀린 작업"
          className="min-w-0 scroll-mt-20 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <div className="flex flex-col items-start gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:pr-16">
            <div className="flex items-center gap-2.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Clock3 className="h-4 w-4 text-amber-600" />
                밀린 작업
              </h2>
              <span className="text-xs text-slate-500">{tasks.length}개</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!eligibleTasks.length}
              className="hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
              onClick={(event) => {
                opener.current = event.currentTarget;
                onBulkChange(true);
              }}
            >
              한 번에 재계획
            </Button>
          </div>
          <div className="max-h-[32rem] overflow-y-auto">
            {tasks.map((task) => {
              const partial = reschedule.unlinked[task.task_id];
              return (
                <OverdueTaskRow
                  key={task.task_id}
                  task={task}
                  today={today}
                  timezone={timezone}
                  plan={plans.get(task.task_id)}
                  partial={!!partial}
                  onPlan={() => openPlan(task)}
                />
              );
            })}
          </div>
        </section>
      )}
      {bulkOpen && (
        <BulkRescheduleModal
          tasks={eligibleTasks}
          today={today}
          timezone={timezone}
          pending={reschedule.pending}
          unlinked={reschedule.unlinked}
          onClose={() => onBulkChange(false)}
          onRestoreFocus={restoreFocus}
          onSave={(task, start, duration) =>
            reschedule.save(task, start, duration)
          }
        />
      )}
      {plan && (
        <RescheduleModal
          key={plan.task_id}
          task={plan}
          today={today}
          timezone={timezone}
          pending={reschedule.pending}
          existing={reschedule.unlinked[plan.task_id]}
          onClose={() => setPlan(null)}
          onRestoreFocus={restoreFocus}
          onSave={async (start, duration) => {
            const schedule = await reschedule.save(plan, start, duration);
            if (!schedule) return;
            setPlan(null);
          }}
        />
      )}
    </>
  );
}
