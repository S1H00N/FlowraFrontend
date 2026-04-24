import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import TaskForm from "@/components/TaskForm";
import TaskItem from "@/components/TaskItem";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import { useTasks } from "@/hooks/useTasks";
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskStatus,
} from "@/types";

type Filter = "all" | TaskStatus;

const filterOptions: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "전체" },
  ...TASK_STATUSES.map((status) => ({
    value: status,
    label: TASK_STATUS_LABELS[status],
  })),
];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

function compareDue(a: Task, b: Task) {
  const aTime = a.due_datetime ? new Date(a.due_datetime).getTime() : Infinity;
  const bTime = b.due_datetime ? new Date(b.due_datetime).getTime() : Infinity;
  return aTime - bTime;
}

function groupTasks(items: Task[]) {
  const todayStart = startOfToday().getTime();
  const todayEnd = endOfToday().getTime();
  const groups = {
    overdue: [] as Task[],
    today: [] as Task[],
    upcoming: [] as Task[],
    done: [] as Task[],
  };

  for (const task of items) {
    if (task.status === "done") {
      groups.done.push(task);
      continue;
    }

    const dueTime = task.due_datetime
      ? new Date(task.due_datetime).getTime()
      : Infinity;

    if (dueTime < todayStart) {
      groups.overdue.push(task);
    } else if (dueTime >= todayStart && dueTime < todayEnd) {
      groups.today.push(task);
    } else {
      groups.upcoming.push(task);
    }
  }

  groups.overdue.sort(compareDue);
  groups.today.sort(compareDue);
  groups.upcoming.sort(compareDue);
  groups.done.sort((a, b) => {
    const aTime = a.completed_at
      ? new Date(a.completed_at).getTime()
      : new Date(a.created_at).getTime();
    const bTime = b.completed_at
      ? new Date(b.completed_at).getTime()
      : new Date(b.created_at).getTime();
    return bTime - aTime;
  });

  return groups;
}

function TaskGroup({
  title,
  description,
  items,
  deepLinkedTaskId,
  empty,
}: {
  title: string;
  description: string;
  items: Task[];
  deepLinkedTaskId: number;
  empty: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {items.length}건
        </span>
      </div>
      <div className="p-3">
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((task) => (
              <TaskItem
                key={task.task_id}
                task={task}
                highlighted={task.task_id === deepLinkedTaskId}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {empty}
          </p>
        )}
      </div>
    </section>
  );
}

export default function Tasks() {
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const deepLinkedTaskId = Number(searchParams.get("task_id"));

  const query = filter === "all" ? {} : { status: filter };
  const { data, isLoading, isError, error, isFetching, refetch } =
    useTasks(query);

  const items = data ?? [];
  const grouped = useMemo(() => groupTasks(items), [items]);

  useEffect(() => {
    if (!deepLinkedTaskId || Number.isNaN(deepLinkedTaskId)) return;
    const el = document.getElementById(`task-${deepLinkedTaskId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [deepLinkedTaskId, items.length]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Task board
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                할 일
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                빠르게 추가하고, 마감 기준으로 오늘 실행할 일을 정리하세요.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              홈으로
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">빠른 추가</h2>
            <p className="mt-1 text-xs text-slate-500">
              입력하면 기본 상태는 할 일(todo)로 저장됩니다.
            </p>
          </div>
          <TaskForm />
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={`h-8 rounded-md px-3 text-xs font-medium transition ${
                  filter === option.value
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {isFetching && (
            <span className="text-xs text-slate-500">새로고침 중...</span>
          )}
        </div>

        <div>
          {isLoading ? (
            <FullSpinner message="할 일을 불러오는 중..." />
          ) : isError ? (
            <ErrorState
              title="할 일을 불러오지 못했습니다"
              message={(error as Error).message}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title={
                filter === "all"
                  ? "할 일이 없습니다"
                  : "이 상태의 할 일이 없습니다"
              }
              description="위 입력창에서 새로운 할 일을 추가해 보세요."
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <TaskGroup
                title="지연"
                description="오늘 이전에 마감된 미완료 항목"
                items={grouped.overdue}
                deepLinkedTaskId={deepLinkedTaskId}
                empty="지연된 할 일이 없습니다."
              />
              <TaskGroup
                title="오늘"
                description="오늘 안에 처리할 항목"
                items={grouped.today}
                deepLinkedTaskId={deepLinkedTaskId}
                empty="오늘 마감인 할 일이 없습니다."
              />
              <TaskGroup
                title="예정"
                description="이후 마감 또는 마감 미지정 항목"
                items={grouped.upcoming}
                deepLinkedTaskId={deepLinkedTaskId}
                empty="예정된 할 일이 없습니다."
              />
              <TaskGroup
                title="완료"
                description="이미 완료 처리한 항목"
                items={grouped.done}
                deepLinkedTaskId={deepLinkedTaskId}
                empty="완료된 할 일이 없습니다."
              />
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="text-right text-xs text-slate-500">
            총 {items.length}건
          </div>
        )}
      </div>
    </AppShell>
  );
}
