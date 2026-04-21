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
    <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
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
    <li className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-medium text-slate-800">{s.title}</span>
      <span className="text-xs font-medium text-slate-500">
        {formatTime(s.start_datetime)}
      </span>
    </li>
  );
}

function TaskItem({ t }: { t: BriefingPriorityTask }) {
  return (
    <li className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
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
    <div className="rounded-3xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-300">{hint}</p>}
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
        <section className="rounded-[32px] border border-white/70 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.92))] p-6 text-white shadow-[0_30px_90px_rgba(15,23,42,0.22)] sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                Today overview
              </p>
              {meQuery.isLoading ? (
                <div className="mt-4 h-12 w-72 animate-pulse rounded-2xl bg-white/10" />
              ) : (
                <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                  안녕하세요, {displayName}님
                </h1>
              )}
              <p className="mt-3 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                오늘의 일정, 집중해야 할 할 일, 그리고 AI가 정리한 메모를 한 공간에서
                바로 확인할 수 있도록 화면을 다시 구성했습니다.
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
              className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-900 shadow-lg shadow-black/10 transition hover:-translate-y-0.5"
            >
              할 일 확인
            </Link>
            <Link
              to="/schedules"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              일정 보기
            </Link>
            <Link
              to="/memos"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
            >
              메모 작성
            </Link>
            <Link
              to="/categories"
              className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
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
