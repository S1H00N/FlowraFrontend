import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CalendarClock,
  CheckSquare2,
  Clock3,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useMe } from "@/hooks/useMe";
import { useTodayHome } from "@/hooks/useTodayHome";
import AppShell from "@/components/AppShell";
import ErrorState from "@/components/ui/ErrorState";
import type {
  HomeFocusItem,
  HomeOrganizationSchedule,
  HomeSchedule,
  HomeTask,
  TaskPriority,
} from "@/types";

type TimelineSchedule = HomeSchedule & {
  company_name?: string;
  isOrganization?: boolean;
};

type ResolvedFocusItem =
  | {
      item_type: "schedule" | "company_schedule";
      id: number;
      title: string;
      meta: string;
      href: string | null;
      tone: "sky" | "teal";
    }
  | {
      item_type: "task";
      id: number;
      title: string;
      meta: string;
      href: string;
      tone: "emerald";
      priority: TaskPriority;
    };

const priorityStyles: Record<TaskPriority, string> = {
  urgent: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

const priorityLabels: Record<TaskPriority, string> = {
  urgent: "긴급",
  high: "높음",
  medium: "보통",
  low: "낮음",
};

const priorityRank: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function toDateKey(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDue(iso?: string | null) {
  if (!iso) return "마감 없음";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scheduleLink(schedule: TimelineSchedule) {
  if (schedule.isOrganization) return null;
  const params = new URLSearchParams({
    schedule_id: String(schedule.id),
    date: toDateKey(schedule.start_datetime),
  });
  return `/schedules?${params.toString()}`;
}

function taskLink(task: HomeTask) {
  const params = new URLSearchParams({
    task_id: String(task.id),
  });
  return `/tasks?${params.toString()}`;
}

function MetricCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: "emerald" | "sky" | "rose" | "teal";
  icon: typeof CalendarClock;
}) {
  const toneClass = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    teal: "bg-teal-50 text-teal-700 ring-teal-100",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
            {value}
          </p>
        </div>
        <div className={`rounded-lg p-2 ring-1 ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
        {meta && <span className="text-xs text-slate-500">{meta}</span>}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="h-16 animate-pulse rounded-lg bg-slate-100"
        />
      ))}
    </div>
  );
}

function ScheduleItem({ schedule }: { schedule: TimelineSchedule }) {
  const start = formatTime(schedule.start_datetime);
  const end = formatTime(schedule.end_datetime);
  const link = scheduleLink(schedule);
  const content = (
    <>
      <div className="text-xs font-medium text-slate-500">
        <p className="text-sm text-slate-900">{schedule.all_day ? "종일" : start}</p>
        {!schedule.all_day && end && <p className="mt-0.5">{end}</p>}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-950">
          {schedule.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {schedule.company_name && (
            <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5">
              {schedule.company_name}
            </span>
          )}
          {schedule.location && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{schedule.location}</span>
            </span>
          )}
        </div>
      </div>
      {link && (
        <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-emerald-600" />
      )}
    </>
  );

  const className =
    "group grid grid-cols-[72px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/40";

  return link ? (
    <Link to={link} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function TaskItem({ task }: { task: HomeTask }) {
  return (
    <Link
      to={taskLink(task)}
      className="group block rounded-lg border border-slate-200 bg-white px-3 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/40"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-slate-950">
          {task.title}
        </p>
        <span
          className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium ${
            priorityStyles[task.priority] ?? priorityStyles.medium
          }`}
        >
          {priorityLabels[task.priority] ?? task.priority}
        </span>
      </div>
      <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
        <Clock3 className="h-3 w-3" />
        {formatDue(task.due_datetime)}
      </p>
    </Link>
  );
}

function FocusItem({ item, index }: { item: ResolvedFocusItem; index: number }) {
  const iconClass = {
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    teal: "border-teal-200 bg-teal-50 text-teal-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  }[item.tone];

  const content = (
    <>
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold ${iconClass}`}
      >
        {index + 1}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-slate-950">
            {item.title}
          </p>
          {item.item_type === "task" && (
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                priorityStyles[item.priority] ?? priorityStyles.medium
              }`}
            >
              {priorityLabels[item.priority] ?? item.priority}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
      </div>
      {item.href && (
        <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:text-emerald-600" />
      )}
    </>
  );

  const className =
    "group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/40";

  return item.href ? (
    <Link to={item.href} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

function sortPriorityTasks(tasks: HomeTask[] = []) {
  return [...tasks].sort((a, b) => {
    const priorityDiff = priorityRank[a.priority] - priorityRank[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    const aDue = a.due_datetime ? new Date(a.due_datetime).getTime() : Infinity;
    const bDue = b.due_datetime ? new Date(b.due_datetime).getTime() : Infinity;
    return aDue - bDue;
  });
}

function organizationToTimeline(
  schedule: HomeOrganizationSchedule,
): TimelineSchedule {
  return {
    id: schedule.id,
    title: schedule.title,
    description: schedule.description,
    schedule_type: schedule.schedule_type,
    start_datetime: schedule.start_datetime,
    end_datetime: schedule.end_datetime,
    all_day: schedule.all_day,
    location: schedule.location,
    category_id: null,
    company_name: schedule.company_name,
    isOrganization: true,
  };
}

function resolveFocusItems({
  focusItems,
  schedules,
  tasks,
}: {
  focusItems?: HomeFocusItem[];
  schedules: TimelineSchedule[];
  tasks: HomeTask[];
}): ResolvedFocusItem[] {
  const resolved: ResolvedFocusItem[] = [];

  for (const focus of focusItems ?? []) {
    if (focus.item_type === "task") {
      const task = tasks.find((item) => item.id === focus.id);
      if (!task) continue;
      resolved.push({
        item_type: "task",
        id: task.id,
        title: task.title,
        meta: `마감 ${formatDue(task.due_datetime)}`,
        href: taskLink(task),
        tone: "emerald",
        priority: task.priority,
      });
      continue;
    }

    const schedule = schedules.find(
      (item) =>
        item.id === focus.id &&
        (focus.item_type === "company_schedule"
          ? item.isOrganization
          : !item.isOrganization),
    );
    if (!schedule) continue;

    const link = scheduleLink(schedule);
    resolved.push({
      item_type: focus.item_type,
      id: schedule.id,
      title: schedule.title,
      meta: schedule.all_day
        ? "종일 일정"
        : `${formatTime(schedule.start_datetime)}${schedule.end_datetime ? ` - ${formatTime(schedule.end_datetime)}` : ""}`,
      href: link,
      tone: schedule.isOrganization ? "teal" : "sky",
    });
  }

  if (resolved.length > 0) return resolved.slice(0, 3);

  const fallbackTasks = tasks.slice(0, 2).map<ResolvedFocusItem>((task) => ({
    item_type: "task",
    id: task.id,
    title: task.title,
    meta: `마감 ${formatDue(task.due_datetime)}`,
    href: taskLink(task),
    tone: "emerald",
    priority: task.priority,
  }));
  const fallbackSchedules = schedules
    .slice(0, Math.max(0, 3 - fallbackTasks.length))
    .map<ResolvedFocusItem>((schedule) => ({
      item_type: schedule.isOrganization ? "company_schedule" : "schedule",
      id: schedule.id,
      title: schedule.title,
      meta: schedule.all_day
        ? "종일 일정"
        : `${formatTime(schedule.start_datetime)}${schedule.end_datetime ? ` - ${formatTime(schedule.end_datetime)}` : ""}`,
      href: scheduleLink(schedule),
      tone: schedule.isOrganization ? "teal" : "sky",
    }));

  return [...fallbackTasks, ...fallbackSchedules].slice(0, 3);
}

export default function Home() {
  const { user: cachedUser } = useAuth();
  const meQuery = useMe();
  const homeQuery = useTodayHome();

  const displayName = meQuery.data?.name ?? cachedUser?.name ?? "사용자";
  const schedules: TimelineSchedule[] = [
    ...(homeQuery.data?.today_schedules ?? []),
    ...(homeQuery.data?.organization_schedules ?? []).map(organizationToTimeline),
  ].sort(
    (a, b) =>
      new Date(a.start_datetime).getTime() -
      new Date(b.start_datetime).getTime(),
  );
  const priorityTasks = sortPriorityTasks(homeQuery.data?.due_today_tasks);
  const focusItems = resolveFocusItems({
    focusItems: homeQuery.data?.focus_items,
    schedules,
    tasks: priorityTasks,
  });
  const summary = homeQuery.data?.summary;
  const briefingText = homeQuery.data?.briefing_text;
  const todayLabel = new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <AppShell>
      <div className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-medium text-emerald-700">
                {todayLabel}
              </p>
              {meQuery.isLoading ? (
                <div className="mt-2 h-8 w-64 animate-pulse rounded-md bg-slate-100" />
              ) : (
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                  {displayName}님, 오늘은 여기서 시작하세요.
                </h1>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/tasks"
                className="inline-flex h-9 items-center justify-center rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
              >
                할 일 정리
              </Link>
              <Link
                to="/schedules"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                일정 보기
              </Link>
              <Link
                to="/memos"
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                메모 작성
              </Link>
            </div>
          </div>

          {meQuery.isError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              사용자 정보를 불러오지 못했습니다:{" "}
              {(meQuery.error as Error).message}
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="오늘 일정"
            value={summary?.today_schedule_count ?? 0}
            hint="시간순으로 확인할 일정"
            tone="sky"
            icon={CalendarClock}
          />
          <MetricCard
            label="미완료"
            value={summary?.incomplete_task_count ?? 0}
            hint="오늘 처리해야 할 작업"
            tone="emerald"
            icon={CheckSquare2}
          />
          <MetricCard
            label="지연"
            value={summary?.today_deadline_schedule_count ?? 0}
            hint="오늘 마감 일정"
            tone="rose"
            icon={AlertTriangle}
          />
          <MetricCard
            label="AI 브리핑"
            value={
              homeQuery.isLoading ? "..." : homeQuery.data ? "ON" : "-"
            }
            hint="오늘 요약 상태"
            tone="teal"
            icon={BrainCircuit}
          />
        </section>

        <Panel
          title="오늘의 집중 항목"
          meta={homeQuery.data ? `${focusItems.length}개` : undefined}
        >
          {homeQuery.isLoading ? (
            <LoadingRows />
          ) : homeQuery.isError ? (
            <ErrorState
              compact
              title="집중 항목을 불러오지 못했습니다"
              message={(homeQuery.error as Error).message}
              onRetry={() => homeQuery.refetch()}
              retrying={homeQuery.isFetching}
            />
          ) : focusItems.length > 0 ? (
            <div className="grid gap-2 lg:grid-cols-3">
              {focusItems.map((item, index) => (
                <FocusItem
                  key={`${item.item_type}-${item.id}`}
                  item={item}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-7 text-center">
              <p className="text-sm font-medium text-slate-700">
                지금 바로 집중할 항목이 없습니다.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                메모나 할 일을 추가하면 여기에서 먼저 볼 수 있습니다.
              </p>
            </div>
          )}
        </Panel>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Panel
            title="오늘 일정"
            meta={
              homeQuery.data
                ? `${summary?.today_schedule_count ?? schedules.length}건`
                : undefined
            }
          >
            {homeQuery.isLoading ? (
              <LoadingRows />
            ) : homeQuery.isError ? (
              <ErrorState
                compact
                title="일정을 불러오지 못했습니다"
                message={(homeQuery.error as Error).message}
                onRetry={() => homeQuery.refetch()}
                retrying={homeQuery.isFetching}
              />
            ) : schedules.length > 0 ? (
              <div className="space-y-2">
                {schedules.map((schedule) => (
                  <ScheduleItem
                    key={`${schedule.isOrganization ? "org" : "personal"}-${schedule.id}`}
                    schedule={schedule}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  오늘 등록된 일정이 없습니다.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  집중할 시간을 확보하기 좋은 날입니다.
                </p>
              </div>
            )}
          </Panel>

          <Panel
            title="우선순위 할 일"
            meta={
              homeQuery.data
                ? `오늘 마감 ${priorityTasks.length}건`
                : undefined
            }
          >
            {homeQuery.isLoading ? (
              <LoadingRows />
            ) : homeQuery.isError ? (
              <ErrorState
                compact
                title="할 일을 불러오지 못했습니다"
                message={(homeQuery.error as Error).message}
                onRetry={() => homeQuery.refetch()}
                retrying={homeQuery.isFetching}
              />
            ) : priorityTasks.length > 0 ? (
              <div className="space-y-2">
                {priorityTasks.map((task) => (
                  <TaskItem key={task.id} task={task} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-slate-700">
                  우선 처리할 할 일이 없습니다.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  새 작업이 생기면 할 일 화면에서 추가하세요.
                </p>
              </div>
            )}
          </Panel>
        </div>

        <Panel title="AI 요약">
          {homeQuery.isLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-full animate-pulse rounded-md bg-slate-100" />
              <div className="h-4 w-2/3 animate-pulse rounded-md bg-slate-100" />
            </div>
          ) : homeQuery.isError ? (
            <ErrorState
              compact
              title="요약을 불러오지 못했습니다"
              message={(homeQuery.error as Error).message}
              onRetry={() => homeQuery.refetch()}
              retrying={homeQuery.isFetching}
            />
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-7 text-slate-700">
                {briefingText || "오늘의 요약이 없습니다."}
              </p>
              {homeQuery.data?.slot_counts && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries({
                    meeting: "회의",
                    fieldwork: "외근",
                    deadline: "마감",
                    other: "기타",
                  }).map(([key, label]) => (
                    <span
                      key={key}
                      className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600"
                    >
                      {label}{" "}
                      {
                        homeQuery.data?.slot_counts[
                          key as keyof typeof homeQuery.data.slot_counts
                        ]
                      }
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
