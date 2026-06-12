import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  Bell,
  Bot,
  CalendarDays,
  Check,
  CheckSquare2,
  ClipboardList,
  Download,
  Flame,
  LayoutDashboard,
  NotebookPen,
  PanelLeft,
  PanelRight,
  Rocket,
  RotateCcw,
  Search,
  Settings,
  Siren,
  Sparkles,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCategories } from "@/hooks/useCategories";
import { useMe } from "@/hooks/useMe";
import { useNotificationUnreadCount } from "@/hooks/useNotifications";
import { useSetTaskCompletion } from "@/hooks/useTasks";
import { useTodayHome } from "@/hooks/useTodayHome";
import ErrorState from "@/components/ui/ErrorState";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import type { Category, HomeTask, TaskPriority } from "@/types";

type DashboardFilter = "all" | "urgent" | "high" | "done";

type DashboardTask = HomeTask & {
  done: boolean;
  dueLabel: string;
  estimate: string;
  overdue: boolean;
  tag: string;
};

const priorityOrder: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const priorityConfig: Record<
  TaskPriority,
  { label: string; dot: string; text: string; estimate: string }
> = {
  urgent: {
    label: "긴급",
    dot: "bg-rose-500",
    text: "text-rose-500",
    estimate: "45m",
  },
  high: {
    label: "높음",
    dot: "bg-orange-400",
    text: "text-orange-500",
    estimate: "2h",
  },
  medium: {
    label: "보통",
    dot: "bg-amber-400",
    text: "text-amber-500",
    estimate: "1h",
  },
  low: {
    label: "낮음",
    dot: "bg-slate-300",
    text: "text-slate-400",
    estimate: "3h",
  },
};

const tagColorByName: Record<string, string> = {
  디자인: "bg-violet-100 text-violet-600 border-violet-200",
  개발: "bg-blue-100 text-blue-600 border-blue-200",
  업무: "bg-slate-100 text-slate-500 border-slate-200",
  리서치: "bg-teal-100 text-teal-600 border-teal-200",
  일정: "bg-indigo-100 text-indigo-600 border-indigo-200",
  할일: "bg-slate-100 text-slate-500 border-slate-200",
};

const navItems = [
  { to: "/", label: "홈", icon: LayoutDashboard, end: true },
  { to: "/tasks", label: "할일", icon: CheckSquare2 },
  { to: "/schedules", label: "캘린더", icon: CalendarDays },
  { to: "/memos", label: "메모", icon: NotebookPen },
];

function taskLink(task: HomeTask) {
  const params = new URLSearchParams({
    task_id: String(task.task_id ?? task.id),
  });
  return `/tasks?${params.toString()}`;
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function isBeforeToday(iso?: string | null) {
  if (!iso) return false;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < startOfToday().getTime();
}

function daysLate(iso?: string | null) {
  if (!iso) return 0;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return 0;
  due.setHours(0, 0, 0, 0);
  return Math.max(
    0,
    Math.ceil((startOfToday().getTime() - due.getTime()) / 86_400_000),
  );
}

function formatDueLabel(iso: string | null | undefined, done: boolean) {
  if (done) return "완료";
  if (!iso) return "마감 없음";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() < today.getTime()) {
    return `지연 ${daysLate(iso)}일`;
  }

  if (target.getTime() === today.getTime()) {
    return `오늘 ${date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  if (target.getTime() === tomorrow.getTime()) return "내일";

  return date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

function formatKoreanDate(input?: string) {
  const date = input ? new Date(`${input}T00:00:00`) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function categoryName(categories: Category[], categoryId?: number | null) {
  if (!categoryId) return null;
  return categories.find((category) => category.category_id === categoryId)?.name;
}

function getTag(task: HomeTask, categories: Category[]) {
  return (
    categoryName(categories, task.category_id) ??
    (task.schedule_id ? "일정" : task.priority === "urgent" ? "업무" : "할일")
  );
}

function toDashboardTask(
  task: HomeTask,
  categories: Category[],
  checkedOverrides: Record<number, boolean>,
): DashboardTask {
  const done = checkedOverrides[task.id] ?? task.status === "done";
  const overdue = !done && isBeforeToday(task.due_datetime);
  return {
    ...task,
    done,
    dueLabel: formatDueLabel(task.due_datetime, done),
    estimate: priorityConfig[task.priority]?.estimate ?? "1h",
    overdue,
    tag: getTag(task, categories),
  };
}

function sortTasks(tasks: DashboardTask[]) {
  return [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    const aDue = a.due_datetime ? new Date(a.due_datetime).getTime() : Infinity;
    const bDue = b.due_datetime ? new Date(b.due_datetime).getTime() : Infinity;
    return aDue - bDue;
  });
}

function taskMatchesFilter(task: DashboardTask, filter: DashboardFilter) {
  if (filter === "done") return task.done;
  if (filter === "urgent") return !task.done && (task.overdue || task.priority === "urgent");
  if (filter === "high") {
    return !task.done && (task.priority === "urgent" || task.priority === "high");
  }
  return true;
}

function Sidebar({
  open,
  displayName,
  onToggle,
}: {
  open: boolean;
  displayName: string;
  onToggle: () => void;
}) {
  const initials = displayName.slice(0, 1).toUpperCase() || "U";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col overflow-hidden border-r border-slate-200 bg-white py-5 shadow-sm transition-all duration-200 min-[720px]:flex",
        open ? "w-56" : "w-14",
      )}
    >
      <div
        className={cn(
          "mb-8 flex items-center gap-2.5 px-3",
          open ? "justify-between" : "justify-center",
        )}
      >
        {open && (
          <Link to="/" className="flex min-w-0 items-center gap-2 pl-1">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
              T
            </span>
            <span className="truncate text-sm font-bold text-slate-700">
              TodoAI
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "사이드바 접기" : "사이드바 펼치기"}
          title={open ? "사이드바 접기" : "사이드바 펼치기"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-100 hover:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={!open ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl text-sm font-medium transition",
                  open ? "px-3 py-2.5" : "justify-center py-2.5",
                  isActive
                    ? "bg-violet-50 text-violet-700"
                    : "text-slate-400 hover:bg-slate-50 hover:text-slate-600",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {open && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-1.5">
        <div
          className={cn(
            "flex items-center gap-2.5 px-2 py-2",
            !open && "justify-center",
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-rose-500 text-xs font-bold text-white">
            {initials}
          </span>
          {open && (
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-600">
                {displayName}
              </p>
              <p className="truncate text-[10px] text-slate-400">
                개인 워크스페이스
              </p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur min-[720px]:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium",
                isActive ? "text-violet-700" : "text-slate-500",
              )
            }
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function TopBar({
  dateLabel,
  displayName,
  overdueCount,
  unreadCount,
}: {
  dateLabel: string;
  displayName: string;
  overdueCount: number;
  unreadCount: number;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-4 backdrop-blur sm:px-6">
      <div className="min-w-0">
        <p className="truncate text-xs text-slate-400">{dateLabel}</p>
        <h1 className="truncate text-base font-bold leading-tight text-slate-800">
          좋은 아침이에요, {displayName}
        </h1>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            지연 {overdueCount}개
          </span>
        )}
        <button
          type="button"
          aria-label="알림"
          title="알림"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 min-w-3 rounded-full bg-rose-500 px-0.5 text-[9px] font-bold leading-3 text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

function UrgentAlert({
  overdueCount,
  urgentCount,
  onView,
}: {
  overdueCount: number;
  urgentCount: number;
  onView: () => void;
}) {
  if (overdueCount === 0 && urgentCount === 0) return null;

  return (
    <section className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
      <Siren className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-rose-700">
          즉시 처리가 필요한 항목이 있어요
        </p>
        <p className="mt-0.5 text-xs text-rose-500">
          {overdueCount > 0 && `지연된 작업 ${overdueCount}개`}
          {overdueCount > 0 && urgentCount > 0 && " · "}
          {urgentCount > 0 && `긴급 작업 ${urgentCount}개`}
        </p>
      </div>
      <button
        type="button"
        onClick={onView}
        className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-rose-600 px-3 text-xs font-medium text-white transition hover:bg-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
      >
        바로 보기
      </button>
    </section>
  );
}

function AiBriefingCard({
  briefingText,
  progress,
  doneCount,
  totalCount,
  urgentCount,
  recommendedTask,
}: {
  briefingText: string;
  progress: number;
  doneCount: number;
  totalCount: number;
  urgentCount: number;
  recommendedTask?: DashboardTask;
}) {
  const summaryText =
    briefingText ||
    (recommendedTask
      ? `${priorityConfig[recommendedTask.priority].label} 작업 "${recommendedTask.title}"을 먼저 처리해보세요. 오전 집중 시간대에는 가장 부담이 큰 항목부터 정리하는 흐름을 추천합니다.`
      : "오늘의 할 일을 정리하면 AI가 우선순위와 집중 시간을 함께 제안합니다.");

  return (
    <section className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600 shadow-lg shadow-violet-200/50">
      <div className="relative p-5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,255,255,0.12),transparent_55%)]" />
        <div className="relative">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              <span className="text-xs font-medium text-white">
                AI 데일리 브리핑
              </span>
            </div>
            <span className="text-xs text-white/50">방금 생성됨</span>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 text-xs text-white/50 transition hover:text-white/80"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              다시 생성
            </button>
          </div>

          <p className="mb-3 text-sm leading-relaxed text-white/95">
            {urgentCount > 0 && (
              <span className="mr-1 rounded bg-white/15 px-1.5 py-0.5 font-semibold">
                긴급 {urgentCount}개
              </span>
            )}
            {summaryText}
          </p>

          <div className="flex flex-wrap gap-2">
            {[
              recommendedTask
                ? `${recommendedTask.title} 먼저`
                : "우선순위 먼저 정리",
              "오전 집중 시간 활용",
              "이후 개발 작업 진행",
            ].map((tip) => (
              <span
                key={tip}
                className="rounded-full bg-white/15 px-2.5 py-1 text-xs text-white/85"
              >
                {tip}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 bg-black/10 px-5 py-3">
        <span className="text-xs text-white/60">오늘 진행률</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-white/80 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-xs font-semibold text-white">{progress}%</span>
        <span className="text-xs text-white/50">
          ({doneCount}/{totalCount})
        </span>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  tone,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub: string;
  accent: string;
  tone: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <p className="mb-1 text-xs text-slate-400">{label}</p>
      <p className={cn("text-2xl font-bold", accent)}>{value}</p>
      <p className="mt-0.5 text-xs text-slate-400">{sub}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "rounded-xl border p-4 text-left shadow-sm transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
          tone,
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={cn("rounded-xl border p-4 shadow-sm", tone)}>{content}</div>
  );
}

function TaskTabs({
  active,
  urgentCount,
  onChange,
}: {
  active: DashboardFilter;
  urgentCount: number;
  onChange: (filter: DashboardFilter) => void;
}) {
  const tabs: Array<{ key: DashboardFilter; label: string }> = [
    { key: "all", label: "전체" },
    { key: "urgent", label: `긴급 ${urgentCount}` },
    { key: "high", label: "높은 우선순위" },
    { key: "done", label: "완료" },
  ];

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
            active === tab.key
              ? "bg-violet-100 text-violet-700"
              : "text-slate-400 hover:text-slate-600",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function PriorityGroup({
  label,
  dotColor,
  headerBg,
  labelColor,
  pulse,
  tasks,
  onToggle,
}: {
  label: string;
  dotColor: string;
  headerBg: string;
  labelColor: string;
  pulse?: boolean;
  tasks: DashboardTask[];
  onToggle: (task: DashboardTask, completed: boolean) => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <div>
      <div className={cn("flex items-center gap-2 border-b px-4 py-2", headerBg)}>
        <span className={cn("h-2 w-2 rounded-full", dotColor, pulse && "animate-pulse")} />
        <span className={cn("text-xs font-semibold uppercase", labelColor)}>
          {label}
        </span>
      </div>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onToggle={onToggle} />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
}: {
  task: DashboardTask;
  onToggle: (task: DashboardTask, completed: boolean) => void;
}) {
  const priority = priorityConfig[task.priority] ?? priorityConfig.medium;
  const tagClass =
    tagColorByName[task.tag] ?? "bg-slate-100 text-slate-500 border-slate-200";

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-slate-50 px-4 py-3 transition last:border-0 hover:bg-slate-50",
        task.done && "opacity-45",
        task.overdue && !task.done && "bg-rose-50/30",
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(task, !task.done)}
        aria-label={task.done ? "미완료로 변경" : "완료로 변경"}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300",
          task.done
            ? "border-violet-500 bg-violet-500"
            : "border-slate-300 hover:border-violet-400",
        )}
      >
        {task.done && <Check className="h-3 w-3 text-white" />}
      </button>

      <span className={cn("h-2 w-2 shrink-0 rounded-full", priority.dot)} />

      <div className="min-w-0 flex-1">
        <Link
          to={taskLink(task)}
          className={cn(
            "block truncate text-sm transition hover:text-violet-600",
            task.done
              ? "text-slate-400 line-through"
              : "text-slate-700",
          )}
        >
          {task.title}
        </Link>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cn("text-xs font-medium", priority.text)}>
            {priority.label}
          </span>
          <span className="text-xs text-slate-200">·</span>
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Timer className="h-3 w-3" />
            {task.estimate}
          </span>
        </div>
      </div>

      <span
        className={cn(
          "hidden shrink-0 rounded-full border px-2 py-0.5 text-xs sm:inline-flex",
          tagClass,
        )}
      >
        {task.tag}
      </span>
      <span
        className={cn(
          "w-20 shrink-0 text-right text-xs",
          task.overdue ? "font-medium text-rose-500" : "text-slate-300",
        )}
      >
        {task.dueLabel}
      </span>
    </div>
  );
}

function TaskListPanel({
  filter,
  search,
  tasks,
  urgentCount,
  onFilterChange,
  onSearchChange,
  onToggle,
}: {
  filter: DashboardFilter;
  search: string;
  tasks: DashboardTask[];
  urgentCount: number;
  onFilterChange: (filter: DashboardFilter) => void;
  onSearchChange: (value: string) => void;
  onToggle: (task: DashboardTask, completed: boolean) => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const searchedTasks = normalizedSearch
    ? tasks.filter((task) =>
        [task.title, task.tag, priorityConfig[task.priority].label]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : tasks;
  const filteredTasks = searchedTasks.filter((task) =>
    taskMatchesFilter(task, filter),
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 pb-3 pt-4">
        <TaskTabs
          active={filter}
          urgentCount={urgentCount}
          onChange={onFilterChange}
        />
        <label className="relative ml-auto hidden sm:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="할일 검색..."
            className="w-44 rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-600 placeholder:text-slate-300 transition focus:border-violet-400 focus:outline-none"
          />
        </label>
      </div>

      <label className="relative mx-4 mt-3 block sm:hidden">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="할일 검색..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-600 placeholder:text-slate-300 transition focus:border-violet-400 focus:outline-none"
        />
      </label>

      {filter === "all" ? (
        <div className="mt-3 sm:mt-0">
          <PriorityGroup
            label="긴급 · 즉시 처리"
            dotColor="bg-rose-500"
            headerBg="border-rose-100 bg-rose-50"
            labelColor="text-rose-600"
            pulse
            tasks={searchedTasks.filter(
              (task) => !task.done && (task.overdue || task.priority === "urgent"),
            )}
            onToggle={onToggle}
          />
          <PriorityGroup
            label="높은 우선순위"
            dotColor="bg-orange-400"
            headerBg="border-orange-100 bg-orange-50"
            labelColor="text-orange-600"
            tasks={searchedTasks.filter(
              (task) => !task.done && !task.overdue && task.priority === "high",
            )}
            onToggle={onToggle}
          />
          <PriorityGroup
            label="일반"
            dotColor="bg-slate-300"
            headerBg="border-slate-100 bg-slate-50"
            labelColor="text-slate-400"
            tasks={searchedTasks.filter(
              (task) =>
                !task.done &&
                !task.overdue &&
                (task.priority === "medium" || task.priority === "low"),
            )}
            onToggle={onToggle}
          />
          <PriorityGroup
            label="완료"
            dotColor="bg-emerald-400"
            headerBg="border-slate-100 bg-slate-50"
            labelColor="text-slate-400"
            tasks={searchedTasks.filter((task) => task.done)}
            onToggle={onToggle}
          />
          {searchedTasks.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-300">
              해당하는 항목이 없어요
            </div>
          )}
        </div>
      ) : (
        <div>
          {filteredTasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={onToggle} />
          ))}
          {filteredTasks.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-300">
              해당하는 항목이 없어요
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function InsightCard({
  icon,
  label,
  value,
  bar,
  gradient,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  bar: number;
  gradient: string;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center text-slate-400">
          {icon}
        </span>
        <div>
          <p className="text-[10px] text-slate-400">{label}</p>
          <p className="text-xs font-semibold text-slate-700">{value}</p>
        </div>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-slate-200">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r", gradient)}
          style={{ width: `${bar}%` }}
        />
      </div>
    </div>
  );
}

function RightAiPanel({
  open,
  progress,
  recommendedTask,
  onToggle,
}: {
  open: boolean;
  progress: number;
  recommendedTask?: DashboardTask;
  onToggle: () => void;
}) {
  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col overflow-hidden transition-all duration-200 xl:flex",
        open ? "w-[268px] border-l border-slate-200 bg-white" : "w-9 bg-slate-50",
      )}
    >
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-slate-200",
          open ? "justify-between px-4" : "justify-center",
        )}
      >
        {open && <span className="text-xs font-semibold text-slate-500">AI 패널</span>}
        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? "AI 패널 접기" : "AI 패널 펼치기"}
          title={open ? "AI 패널 접기" : "AI 패널 펼치기"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-100 hover:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">
                AI 인사이트
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </div>
            <div className="space-y-2">
              <InsightCard
                icon={<Zap className="h-4 w-4" />}
                label="최적 집중 시간"
                value="오전 9-11시"
                bar={85}
                gradient="from-violet-400 to-indigo-400"
              />
              <InsightCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="이번 주 완료율"
                value={`${Math.max(progress, 1)}%`}
                bar={Math.max(progress, 8)}
                gradient="from-emerald-400 to-teal-400"
              />
              <InsightCard
                icon={<Timer className="h-4 w-4" />}
                label="평균 작업 시간"
                value="1.8시간"
                bar={60}
                gradient="from-amber-400 to-orange-400"
              />
            </div>
          </section>

          <section className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-violet-600">
              <Sparkles className="h-3.5 w-3.5" />
              지금 시작하기 좋아요
            </p>
            <p className="mb-3 text-xs leading-relaxed text-slate-500">
              오전 집중 시간대예요. 긴급 작업을 먼저 처리하세요.
            </p>
            {recommendedTask ? (
              <div className="mb-3 rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
                <span className="rounded border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                  {priorityConfig[recommendedTask.priority].label}
                </span>
                <p className="mt-1.5 text-sm font-semibold leading-snug text-slate-700">
                  {recommendedTask.title}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs text-rose-500">
                    {recommendedTask.overdue ? recommendedTask.dueLabel : "우선 처리"}
                  </span>
                  <span className="text-xs text-slate-300">·</span>
                  <span className="text-xs text-slate-400">
                    {recommendedTask.estimate}
                  </span>
                </div>
              </div>
            ) : (
              <div className="mb-3 rounded-xl border border-violet-100 bg-white p-3 text-xs text-slate-400 shadow-sm">
                추천할 작업이 아직 없습니다.
              </div>
            )}
            <Link
              to={recommendedTask ? taskLink(recommendedTask) : "/tasks"}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500"
            >
              <Rocket className="h-3.5 w-3.5" />
              바로 시작
            </Link>
          </section>

          <section className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-semibold text-slate-400">
              이번 주 진행 현황
            </p>
            <div className="flex h-14 items-end gap-1.5">
              {[
                { h: 40, label: "월" },
                { h: 65, label: "화" },
                { h: 30, label: "수" },
                { h: 80, label: "목" },
                { h: 55, label: "금" },
                { h: 74, label: "토" },
                { h: Math.max(progress, 12), label: "오늘" },
              ].map((bar, index) => (
                <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: `${bar.h}%`,
                      background:
                        index === 6
                          ? "linear-gradient(to top,#7c3aed,#818cf8)"
                          : "#e2e8f0",
                    }}
                  />
                  <span
                    className={cn(
                      "text-[9px]",
                      index === 6
                        ? "font-semibold text-violet-500"
                        : "text-slate-300",
                    )}
                  >
                    {bar.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold text-slate-400">빠른 실행</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: Bot, label: "AI 요약", to: "/memos" },
                { icon: ClipboardList, label: "템플릿", to: "/memos" },
                { icon: Download, label: "내보내기", to: "/tasks" },
                { icon: Settings, label: "설정", to: "/settings" },
              ].map((action) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={action.label}
                    to={action.to}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{action.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}

function LoadingDashboard() {
  return (
    <div className="p-6">
      <div className="mb-4 h-20 animate-pulse rounded-xl bg-rose-50" />
      <div className="mb-5 h-48 animate-pulse rounded-2xl bg-violet-200" />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl bg-white" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

export default function Home() {
  const { user: cachedUser } = useAuth();
  const meQuery = useMe();
  const homeQuery = useTodayHome();
  const categoriesQuery = useCategories("task");
  const unreadCountQuery = useNotificationUnreadCount();
  const setTaskCompletion = useSetTaskCompletion();

  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [search, setSearch] = useState("");
  const [checkedOverrides, setCheckedOverrides] = useState<Record<number, boolean>>(
    {},
  );

  const displayName = meQuery.data?.name ?? cachedUser?.name ?? "사용자";
  const rawTasks = homeQuery.data?.due_today_tasks ?? [];
  const categories = categoriesQuery.data ?? [];

  useEffect(() => {
    setCheckedOverrides((current) => {
      const validIds = new Set(rawTasks.map((task) => task.id));
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => validIds.has(Number(id))),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [rawTasks]);

  const tasks = useMemo(
    () =>
      sortTasks(
        rawTasks.map((task) =>
          toDashboardTask(task, categories, checkedOverrides),
        ),
      ),
    [categories, checkedOverrides, rawTasks],
  );

  const totalCount = tasks.length;
  const doneCount = tasks.filter((task) => task.done).length;
  const overdueCount = tasks.filter((task) => task.overdue && !task.done).length;
  const urgentCount = tasks.filter(
    (task) => !task.done && task.priority === "urgent",
  ).length;
  const highCount = tasks.filter(
    (task) => !task.done && task.priority === "high",
  ).length;
  const progress =
    totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const recommendedTask =
    tasks.find((task) => !task.done && (task.overdue || task.priority === "urgent")) ??
    tasks.find((task) => !task.done && task.priority === "high") ??
    tasks.find((task) => !task.done);
  const dateLabel = formatKoreanDate(homeQuery.data?.date);

  const handleToggleTask = (task: DashboardTask, completed: boolean) => {
    setCheckedOverrides((current) => ({ ...current, [task.id]: completed }));
    setTaskCompletion.mutate(
      { taskId: task.task_id ?? task.id, completed },
      {
        onError: () => {
          setCheckedOverrides((current) => ({
            ...current,
            [task.id]: task.done,
          }));
        },
      },
    );
  };

  return (
    <div className="min-h-screen overflow-hidden bg-slate-50 font-sans text-slate-800">
      <Sidebar
        open={leftOpen}
        displayName={displayName}
        onToggle={() => setLeftOpen((open) => !open)}
      />

      <div
        className={cn(
          "flex min-h-screen transition-all duration-200",
          leftOpen ? "min-[720px]:ml-56" : "min-[720px]:ml-14",
        )}
      >
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar
            dateLabel={dateLabel}
            displayName={displayName}
            overdueCount={overdueCount}
            unreadCount={unreadCountQuery.data ?? 0}
          />

          <div className="flex-1 overflow-auto pb-24 min-[720px]:pb-6">
            {homeQuery.isLoading ? (
              <LoadingDashboard />
            ) : homeQuery.isError ? (
              <div className="p-6">
                <ErrorState
                  title="홈 대시보드를 불러오지 못했습니다"
                  message={(homeQuery.error as Error).message}
                  onRetry={() => homeQuery.refetch()}
                  retrying={homeQuery.isFetching}
                />
              </div>
            ) : (
              <div className="p-4 sm:p-6">
                <UrgentAlert
                  overdueCount={overdueCount}
                  urgentCount={urgentCount}
                  onView={() => setFilter("urgent")}
                />

                <AiBriefingCard
                  briefingText={homeQuery.data?.briefing_text ?? ""}
                  progress={progress}
                  doneCount={doneCount}
                  totalCount={totalCount}
                  urgentCount={urgentCount}
                  recommendedTask={recommendedTask}
                />

                <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="긴급"
                    value={urgentCount}
                    sub="즉시 처리"
                    accent="text-rose-600"
                    tone="border-rose-100 bg-rose-50"
                    onClick={() => setFilter("urgent")}
                  />
                  <StatCard
                    label="높은 우선순위"
                    value={highCount}
                    sub="오늘 내 완료"
                    accent="text-orange-600"
                    tone="border-orange-100 bg-orange-50"
                    onClick={() => setFilter("high")}
                  />
                  <StatCard
                    label="완료"
                    value={doneCount}
                    sub={`전체 ${totalCount}개 중`}
                    accent="text-emerald-600"
                    tone="border-slate-100 bg-white"
                    onClick={() => setFilter("done")}
                  />
                  <StatCard
                    label="연속 완료"
                    value={
                      <span className="inline-flex items-center gap-1">
                        6일 <Flame className="h-5 w-5 text-orange-500" />
                      </span>
                    }
                    sub="최고 기록 중"
                    accent="text-amber-600"
                    tone="border-slate-100 bg-white"
                  />
                </section>

                {setTaskCompletion.isPending && (
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-400">
                    <Spinner size="xs" />
                    완료 상태를 저장하는 중...
                  </div>
                )}

                <TaskListPanel
                  filter={filter}
                  search={search}
                  tasks={tasks}
                  urgentCount={urgentCount}
                  onFilterChange={setFilter}
                  onSearchChange={setSearch}
                  onToggle={handleToggleTask}
                />
              </div>
            )}
          </div>
        </main>

        <RightAiPanel
          open={rightOpen}
          progress={progress}
          recommendedTask={recommendedTask}
          onToggle={() => setRightOpen((open) => !open)}
        />
      </div>

      <MobileBottomNav />
    </div>
  );
}
