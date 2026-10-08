import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, ListTodo } from "lucide-react";
import TaskCompletionToggleButton from "@/components/TaskCompletionToggleButton";
import TaskForm from "@/components/TaskForm";
import { taskDueLabel } from "@/lib/homeTasks";
import { TASK_PRIORITY_LABELS, type Task } from "@/types";
import "@/components/tasks/TaskBoardCards.css";

export default function TodayTasks({
  tasks,
  today,
  timezone,
  pending,
  onComplete,
  scheduledLabels,
}: {
  tasks: Task[];
  today: string;
  timezone: string;
  pending: boolean;
  onComplete: (task: Task) => void;
  scheduledLabels?: ReadonlyMap<number, { label: string; link: string }>;
}) {
  const visibleTasks = tasks.slice(0, 4);
  const remainingCount = tasks.length - visibleTasks.length;

  return (
    <section
      aria-label="오늘 할 일"
      tabIndex={-1}
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
            <ListTodo className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800">오늘 할 일</h2>
            <p className="text-xs text-slate-400">
              오늘 예정된 할 일 · 총 {tasks.length}개
            </p>
          </div>
        </div>
      </div>
      {visibleTasks.length ? (
        <div className="flex-1">
          {visibleTasks.map((task) => {
            const scheduled = scheduledLabels?.get(task.task_id);
            return (
              <div
                key={task.task_id}
                className="flex min-w-0 items-center gap-3 border-b border-slate-50 px-4 py-3 last:border-0 hover:bg-slate-50"
              >
                <TaskCompletionToggleButton
                  completed={false}
                  disabled={pending}
                  compact
                  onCompletedChange={() => onComplete(task)}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/tasks?task_id=${task.task_id}`}
                    className="block truncate text-sm text-slate-700 hover:text-violet-600"
                  >
                    {task.title}
                  </Link>
                  <p className="mt-1 text-xs text-slate-500">
                    {taskDueLabel(task, today, timezone)}
                  </p>
                  {scheduled && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-violet-600">
                      <CalendarDays
                        aria-hidden="true"
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      {scheduled.label}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {(task.priority === "urgent" || task.priority === "high") && (
                    <span className="text-xs text-slate-500">
                      {TASK_PRIORITY_LABELS[task.priority]}
                    </span>
                  )}
                  {scheduled && (
                    <Link
                      to={scheduled.link}
                      className="rounded text-xs font-semibold text-violet-600 hover:text-violet-700 focus-visible:outline focus-visible:outline-2"
                    >
                      일정 보기
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
          <div className="px-4 py-3">
            <TaskForm compact defaultDueDate={today} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center px-4 py-4">
          <p className="text-center text-sm text-slate-500">
            오늘 예정된 할 일이 없어요.
          </p>
          <div className="mt-1">
            <TaskForm compact defaultDueDate={today} />
          </div>
        </div>
      )}
      <div className="flex min-h-13 flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
        {remainingCount > 0 && (
          <Link
            to="/tasks"
            className="rounded text-xs text-violet-600 hover:underline focus-visible:outline focus-visible:outline-2"
          >
            {remainingCount}개 더 있어요
          </Link>
        )}
        <Link
          to="/tasks"
          className="ml-auto inline-flex items-center gap-1 rounded-lg text-xs font-semibold text-violet-600 transition hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
        >
          전체 할 일 보기
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
