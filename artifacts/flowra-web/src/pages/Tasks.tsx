import { useState } from "react";
import { Link } from "react-router-dom";
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
  type TaskStatus,
} from "@/types";

type Filter = "all" | TaskStatus;

export default function Tasks() {
  const [filter, setFilter] = useState<Filter>("all");

  const query = filter === "all" ? {} : { status: filter };
  const { data, isLoading, isError, error, isFetching, refetch } =
    useTasks(query);

  const items = data?.items ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Task board
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                할 일
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                해야 할 일을 입력하고 상태별로 빠르게 걸러보세요.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
            >
              홈으로
            </Link>
          </div>
        </section>

        <div className="mt-6">
          <TaskForm />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === "all"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            전체
          </button>
          {TASK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                filter === s
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {TASK_STATUS_LABELS[s]}
            </button>
          ))}
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
              description="위 폼에서 새로운 할 일을 추가해 보세요."
            />
          ) : (
            <ul className="space-y-2">
              {items.map((t) => (
                <TaskItem key={t.task_id} task={t} />
              ))}
            </ul>
          )}
        </div>

        {data?.pagination && data.pagination.total_items > 0 && (
          <div className="text-right text-xs text-slate-500">
            총 {data.pagination.total_items}건
          </div>
        )}
      </div>
    </AppShell>
  );
}
