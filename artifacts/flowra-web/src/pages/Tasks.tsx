import { useState } from "react";
import { Link } from "react-router-dom";
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
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">할 일</h1>
            <p className="mt-1 text-sm text-slate-500">
              할 일을 추가하고 관리하세요.
            </p>
          </div>
          <Link
            to="/"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            홈으로
          </Link>
        </header>

        <div className="mt-6">
          <TaskForm />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
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

        <div className="mt-4">
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
          <div className="mt-4 text-right text-xs text-slate-500">
            총 {data.pagination.total_items}건
          </div>
        )}
      </div>
    </div>
  );
}
