import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMe } from "@/hooks/useMe";
import { useTodayBriefing } from "@/hooks/useTodayBriefing";
import type { BriefingPriorityTask, BriefingSchedule, Priority } from "@/types";

const priorityStyles: Record<Priority, string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

const priorityLabels: Record<Priority, string> = {
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
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ScheduleItem({ s }: { s: BriefingSchedule }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
      <span className="text-sm text-slate-800">{s.title}</span>
      <span className="text-xs font-medium text-slate-500">
        {formatTime(s.start_datetime)}
      </span>
    </li>
  );
}

function TaskItem({ t }: { t: BriefingPriorityTask }) {
  return (
    <li className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
      <span className="text-sm text-slate-800">{t.title}</span>
      <span
        className={`rounded border px-2 py-0.5 text-xs font-medium ${priorityStyles[t.priority]}`}
      >
        {priorityLabels[t.priority]}
      </span>
    </li>
  );
}

export default function Home() {
  const { user: cachedUser, logout } = useAuth();
  const meQuery = useMe();
  const briefingQuery = useTodayBriefing();

  const displayName = meQuery.data?.name ?? cachedUser?.name ?? "사용자";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="flex items-start justify-between">
          <div>
            {meQuery.isLoading ? (
              <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
            ) : (
              <h1 className="text-2xl font-bold">
                안녕하세요, {displayName}님 👋
              </h1>
            )}
            <p className="mt-1 text-sm text-slate-500">오늘의 브리핑을 확인하세요.</p>
          </div>
          <div className="flex gap-2">
            <Link
              to="/schedules"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              캘린더
            </Link>
            <Link
              to="/tasks"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              할 일
            </Link>
            <Link
              to="/memos"
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              메모
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              로그아웃
            </button>
          </div>
        </header>

        {meQuery.isError && (
          <div className="mt-6 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            사용자 정보를 불러오지 못했습니다: {(meQuery.error as Error).message}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Section
            title="오늘 일정"
            right={
              briefingQuery.data && (
                <span className="text-xs text-slate-500">
                  {briefingQuery.data.today_schedules.length}건
                </span>
              )
            }
          >
            {briefingQuery.isLoading ? (
              <div className="space-y-2">
                <div className="h-9 animate-pulse rounded bg-slate-100" />
                <div className="h-9 animate-pulse rounded bg-slate-100" />
              </div>
            ) : briefingQuery.isError ? (
              <p className="text-sm text-red-600">
                불러오기 실패: {(briefingQuery.error as Error).message}
              </p>
            ) : briefingQuery.data && briefingQuery.data.today_schedules.length > 0 ? (
              <ul className="space-y-2">
                {briefingQuery.data.today_schedules.map((s) => (
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
                  미완료 {briefingQuery.data.unfinished_tasks}건
                </span>
              )
            }
          >
            {briefingQuery.isLoading ? (
              <div className="space-y-2">
                <div className="h-9 animate-pulse rounded bg-slate-100" />
                <div className="h-9 animate-pulse rounded bg-slate-100" />
              </div>
            ) : briefingQuery.isError ? (
              <p className="text-sm text-red-600">
                불러오기 실패: {(briefingQuery.error as Error).message}
              </p>
            ) : briefingQuery.data && briefingQuery.data.priority_tasks.length > 0 ? (
              <ul className="space-y-2">
                {briefingQuery.data.priority_tasks.map((t) => (
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
              <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
            </div>
          ) : briefingQuery.isError ? (
            <p className="text-sm text-red-600">
              불러오기 실패: {(briefingQuery.error as Error).message}
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-slate-700">
              {briefingQuery.data?.ai_summary || "오늘의 요약이 없습니다."}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
