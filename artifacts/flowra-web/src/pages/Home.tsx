import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMe } from "@/hooks/useMe";
import { useTodayBriefing } from "@/hooks/useTodayBriefing";
import AppShell from "@/components/AppShell";
import ErrorState from "@/components/ui/ErrorState";
import type { ReactNode } from "react";
import type {
  BriefingPriorityTask,
  BriefingSchedule,
  TaskPriority,
} from "@/types";

const priorityStyles: Record<TaskPriority, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

const priorityLabels: Record<TaskPriority, string> = {
  urgent: "긴급",
  high: "높음",
  medium: "보통",
  low: "낮음",
};

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ScheduleItem({ s }: { s: BriefingSchedule }) {
  return (
    <li className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100">
      <span className="text-sm font-medium text-slate-800">{s.title}</span>
      <span className="text-xs font-medium text-slate-500">
        {formatTime(s.start_datetime)}
      </span>
    </li>
  );
}

function TaskItem({ t }: { t: BriefingPriorityTask }) {
  return (
    <li className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 transition-colors hover:bg-slate-100">
      <span className="text-sm font-medium text-slate-800">{t.title}</span>
      <span
        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
          priorityStyles[t.priority] ?? priorityStyles.medium
        }`}
      >
        {priorityLabels[t.priority] ?? t.priority}
      </span>
    </li>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-indigo-900">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-500">
        {label}
      </p>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-2 text-xs font-medium text-indigo-400">{hint}</p>}
    </div>
  );
}

export default function Home() {
  const { user: cachedUser } = useAuth();
  const meQuery = useMe();
  const briefingQuery = useTodayBriefing();

  const displayName = meQuery.data?.name ?? cachedUser?.name ?? "사용자";

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-indigo-500">
                Today overview
              </p>
              {meQuery.isLoading ? (
                <div className="mt-4 h-12 w-72 animate-pulse rounded-2xl bg-slate-100" />
              ) : (
                <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  안녕하세요, {displayName}님
                </h1>
              )}
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500 sm:text-base">
                오늘의 일정과 우선순위 할 일, AI가 정리한 메모를 한눈에 확인하세요.
                업무 효율을 높이는 스마트한 하루를 시작해 보세요.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[520px]">
              <MetricCard
                label="일정"
                value={briefingQuery.data?.summary?.schedule_count ?? 0}
                hint="오늘 등록된 일정"
              />
              <MetricCard
                label="할 일"
                value={briefingQuery.data?.summary?.task_count ?? 0}
                hint="처리할 작업"
              />
              <MetricCard
                label="지연"
                value={briefingQuery.data?.summary?.overdue_task_count ?? 0}
                hint="기한이 지난 항목"
              />
              <MetricCard label="브리핑" value={briefingQuery.data ? "ON" : "-"} hint="요약 상태" />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/tasks"
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-indigo-700"
            >
              할 일 확인
            </Link>
            <Link
              to="/schedules"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              일정 보기
            </Link>
            <Link
              to="/memos"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              메모 작성
            </Link>
            <Link
              to="/categories"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              카테고리 정리
            </Link>
          </div>
        </section>

        {meQuery.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">
            사용자 정보를 불러오지 못했습니다: {(meQuery.error as Error).message}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Section
            title="오늘 일정"
            right={
              briefingQuery.data && (
                <span className="text-xs text-slate-500">
                  {briefingQuery.data.summary?.schedule_count ??
                    briefingQuery.data.schedules?.length ??
                    0}
                  건
                </span>
              )
            }
          >
            {briefingQuery.isLoading ? (
              <div className="space-y-2">
                <div className="h-9 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-9 animate-pulse rounded-2xl bg-slate-100" />
              </div>
            ) : briefingQuery.isError ? (
              <ErrorState
                compact
                title="일정을 불러오지 못했습니다"
                message={(briefingQuery.error as Error).message}
                onRetry={() => briefingQuery.refetch()}
                retrying={briefingQuery.isFetching}
              />
            ) : briefingQuery.data &&
              (briefingQuery.data.schedules?.length ?? 0) > 0 ? (
              <ul className="space-y-2">
                {briefingQuery.data.schedules.map((s) => (
                  <ScheduleItem key={s.schedule_id} s={s} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">오늘 일정이 없습니다.</p>
            )}
          </Section>

          <Section
            title="우선순위 할 일"
            right={
              briefingQuery.data && (
                <span className="text-xs text-slate-500">
                  미완료 {briefingQuery.data.summary?.task_count ?? 0}건
                  {(briefingQuery.data.summary?.overdue_task_count ?? 0) > 0 && (
                    <> · 지연 {briefingQuery.data.summary?.overdue_task_count}건</>
                  )}
                </span>
              )
            }
          >
            {briefingQuery.isLoading ? (
              <div className="space-y-2">
                <div className="h-9 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-9 animate-pulse rounded-2xl bg-slate-100" />
              </div>
            ) : briefingQuery.isError ? (
              <ErrorState
                compact
                title="할 일을 불러오지 못했습니다"
                message={(briefingQuery.error as Error).message}
                onRetry={() => briefingQuery.refetch()}
                retrying={briefingQuery.isFetching}
              />
            ) : briefingQuery.data &&
              (briefingQuery.data.tasks?.length ?? 0) > 0 ? (
              <ul className="space-y-2">
                {briefingQuery.data.tasks.map((t) => (
                  <TaskItem key={t.task_id} t={t} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">우선순위 할 일이 없습니다.</p>
            )}
          </Section>
        </div>

        <Section title="AI 요약">
          {briefingQuery.isLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-4 w-2/3 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : briefingQuery.isError ? (
            <ErrorState
              compact
              title="요약을 불러오지 못했습니다"
              message={(briefingQuery.error as Error).message}
              onRetry={() => briefingQuery.refetch()}
              retrying={briefingQuery.isFetching}
            />
          ) : (
            <p className="text-sm leading-relaxed text-slate-700">
              {briefingQuery.data?.ai_summary || "오늘의 요약이 없습니다."}
            </p>
          )}
        </Section>
      </div>
    </AppShell>
  );
}
