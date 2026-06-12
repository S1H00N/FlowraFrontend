import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Flame,
  PanelRight,
  Rocket,
  Search,
  Siren,
  Sparkles,
  Timer,
  TrendingUp,
  Zap,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useCategories } from "@/hooks/useCategories";
import { useMe } from "@/hooks/useMe";
import { useSetTaskCompletion } from "@/hooks/useTasks";
import { useTodayHome } from "@/hooks/useTodayHome";
import ErrorState from "@/components/ui/ErrorState";
import Spinner from "@/components/ui/Spinner";
import { cn } from "@/lib/utils";
import type {
  Category,
  HomeAiInsights,
  HomeCompletionStreak,
  HomeCompletionStreakDay,
  HomeInsightData,
  HomeTask,
  TaskPriority,
} from "@/types";

type DashboardFilter = "all" | "urgent" | "high";

type DashboardTask = HomeTask & {
  dueLabel: string;
  overdue: boolean;
  tag: string;
};

const weekDayLabels = ["월", "화", "수", "목", "금", "토", "일"];

function insightString(insight: HomeInsightData, keys: string[]) {
  for (const key of keys) {
    const value = insight[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function insightNumber(insight: HomeInsightData, keys: string[]) {
  for (const key of keys) {
    const value = insight[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function insightPercent(
  insight: HomeInsightData,
  percentKeys: string[],
  ratioKeys: string[],
) {
  const percent = insightNumber(insight, percentKeys);
  if (percent !== null) return clampPercent(percent);
  const ratio = insightNumber(insight, ratioKeys);
  return ratio === null ? 0 : clampPercent(ratio * 100);
}

function formatHour(value: number) {
  const hour = Math.min(23, Math.max(0, Math.round(value)));
  return `${String(hour).padStart(2, "0")}:00`;
}

function focusTimeLabel(insight: HomeInsightData) {
  const label = insightString(insight, [
    "label",
    "time_label",
    "time_range",
    "recommended_time",
    "value",
  ]);
  if (label) return label;

  const start = insightString(insight, ["start_time", "start"]);
  const end = insightString(insight, ["end_time", "end"]);
  if (start && end) return `${start}-${end}`;

  const startHour = insightNumber(insight, ["start_hour"]);
  const endHour = insightNumber(insight, ["end_hour"]);
  if (startHour !== null && endHour !== null) {
    return `${formatHour(startHour)}-${formatHour(endHour)}`;
  }

  return "추천 데이터 준비 중";
}

function streakDayLabel(day: HomeCompletionStreakDay, index: number) {
  if (day.label) return day.label;
  if (day.date) {
    const date = new Date(
      day.date.includes("T") ? day.date : `${day.date}T00:00:00`,
    );
    if (!Number.isNaN(date.getTime())) {
      return date
        .toLocaleDateString("ko-KR", { weekday: "short" })
        .replace("요일", "");
    }
  }
  return weekDayLabels[index] ?? String(index + 1);
}

function streakDayHeight(day: HomeCompletionStreakDay) {
  if (day.status === "completed") return 100;
  if (day.status === "pending") return 55;
  if (day.status === "missed") return 28;
  return 12;
}

function sortedStreakWeek(days: HomeCompletionStreakDay[]) {
  return [...days]
    .sort((left, right) => {
      if (!left.date || !right.date) return 0;
      return left.date.localeCompare(right.date);
    })
    .slice(0, 7);
}

const priorityOrder: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const priorityConfig: Record<
  TaskPriority,
  { label: string; dot: string; text: string }
> = {
  urgent: {
    label: "긴급",
    dot: "bg-rose-500",
    text: "text-rose-500",
  },
  high: {
    label: "높음",
    dot: "bg-orange-400",
    text: "text-orange-500",
  },
  medium: {
    label: "보통",
    dot: "bg-amber-400",
    text: "text-amber-500",
  },
  low: {
    label: "낮음",
    dot: "bg-slate-300",
    text: "text-slate-400",
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

function formatDueLabel(iso: string | null | undefined) {
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
  return categories.find((category) => category.category_id === categoryId)
    ?.name;
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
): DashboardTask {
  const overdue = isBeforeToday(task.due_datetime);
  return {
    ...task,
    dueLabel: formatDueLabel(task.due_datetime),
    overdue,
    tag: getTag(task, categories),
  };
}

function sortTasks(tasks: DashboardTask[]) {
  return [...tasks].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    const aDue = a.due_datetime ? new Date(a.due_datetime).getTime() : Infinity;
    const bDue = b.due_datetime ? new Date(b.due_datetime).getTime() : Infinity;
    return aDue - bDue;
  });
}

function taskMatchesFilter(task: DashboardTask, filter: DashboardFilter) {
  if (filter === "urgent") return task.overdue || task.priority === "urgent";
  if (filter === "high") {
    return task.priority === "urgent" || task.priority === "high";
  }
  return true;
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
  focusTime,
  dueTodayCount,
  totalIncompleteCount,
  urgentCount,
  recommendedTask,
}: {
  briefingText: string;
  focusTime: string;
  dueTodayCount: number;
  totalIncompleteCount: number;
  urgentCount: number;
  recommendedTask?: DashboardTask;
}) {
  const hasFocusTime = focusTime !== "추천 데이터 준비 중";
  const summaryText =
    briefingText.trim() ||
    (recommendedTask
      ? `오늘 마감 할 일은 ${dueTodayCount}개입니다. ${priorityConfig[recommendedTask.priority].label} 우선순위인 "${recommendedTask.title}"부터 확인해보세요.`
      : totalIncompleteCount > 0
        ? `오늘 마감된 미완료 할 일은 없습니다. 전체 미완료 할 일 ${totalIncompleteCount}개를 확인해보세요.`
        : "오늘 마감된 미완료 할 일이 없습니다.");
  const tips = [
    recommendedTask ? `${recommendedTask.title} 먼저` : null,
    hasFocusTime ? `${focusTime} 집중 활용` : null,
    urgentCount > 0
      ? `긴급 ${urgentCount}개 우선 처리`
      : dueTodayCount > 0
        ? "오늘 마감 순서대로 정리"
        : null,
  ].filter((tip): tip is string => Boolean(tip));

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
          </div>

          <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-white/95">
            {urgentCount > 0 && (
              <span className="mr-1 rounded bg-white/15 px-1.5 py-0.5 font-semibold">
                긴급 {urgentCount}개
              </span>
            )}
            {summaryText}
          </p>

          {tips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tips.map((tip) => (
                <span
                  key={tip}
                  className="rounded-full bg-white/15 px-2.5 py-1 text-xs text-white/85"
                >
                  {tip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-black/10 px-5 py-3">
        <span className="text-xs text-white/60">오늘 마감 미완료</span>
        <span className="text-xs font-semibold text-white">
          {dueTodayCount}개
        </span>
        <span className="text-xs text-white/50">
          전체 미완료 {totalIncompleteCount}개
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
  attentionCount,
  onChange,
}: {
  active: DashboardFilter;
  attentionCount: number;
  onChange: (filter: DashboardFilter) => void;
}) {
  const tabs: Array<{ key: DashboardFilter; label: string }> = [
    { key: "all", label: "전체" },
    { key: "urgent", label: `긴급 ${attentionCount}` },
    { key: "high", label: "높은 우선순위" },
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
  onToggle: (task: DashboardTask) => void;
}) {
  if (tasks.length === 0) return null;

  return (
    <div>
      <div
        className={cn("flex items-center gap-2 border-b px-4 py-2", headerBg)}
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            dotColor,
            pulse && "animate-pulse",
          )}
        />
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
  onToggle: (task: DashboardTask) => void;
}) {
  const priority = priorityConfig[task.priority] ?? priorityConfig.medium;
  const tagClass =
    tagColorByName[task.tag] ?? "bg-slate-100 text-slate-500 border-slate-200";

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-slate-50 px-4 py-3 transition last:border-0 hover:bg-slate-50",
        task.overdue && "bg-rose-50/30",
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(task)}
        aria-label="완료로 변경"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 transition hover:border-violet-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      />

      <span className={cn("h-2 w-2 shrink-0 rounded-full", priority.dot)} />

      <div className="min-w-0 flex-1">
        <Link
          to={taskLink(task)}
          className="block truncate text-sm text-slate-700 transition hover:text-violet-600"
        >
          {task.title}
        </Link>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cn("text-xs font-medium", priority.text)}>
            {priority.label}
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
  attentionCount,
  onFilterChange,
  onSearchChange,
  onToggle,
}: {
  filter: DashboardFilter;
  search: string;
  tasks: DashboardTask[];
  attentionCount: number;
  onFilterChange: (filter: DashboardFilter) => void;
  onSearchChange: (value: string) => void;
  onToggle: (task: DashboardTask) => void;
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
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 pb-3 pt-4">
        <div className="mr-1 flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            오늘 마감 할 일
          </h2>
          <span className="text-xs text-slate-400">{tasks.length}개</span>
        </div>
        <TaskTabs
          active={filter}
          attentionCount={attentionCount}
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
              (task) => task.overdue || task.priority === "urgent",
            )}
            onToggle={onToggle}
          />
          <PriorityGroup
            label="높은 우선순위"
            dotColor="bg-orange-400"
            headerBg="border-orange-100 bg-orange-50"
            labelColor="text-orange-600"
            tasks={searchedTasks.filter(
              (task) => !task.overdue && task.priority === "high",
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
                !task.overdue &&
                (task.priority === "medium" || task.priority === "low"),
            )}
            onToggle={onToggle}
          />
          {searchedTasks.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-300">
              {normalizedSearch
                ? "검색 결과가 없어요"
                : "오늘 마감된 미완료 할 일이 없어요"}
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
  aiInsights,
  completionStreak,
  recommendedTask,
}: {
  open: boolean;
  aiInsights: HomeAiInsights;
  completionStreak: HomeCompletionStreak;
  recommendedTask?: DashboardTask;
}) {
  if (!open) return null;

  const optimalFocusTime = focusTimeLabel(aiInsights.optimal_focus_time);
  const focusConfidence = insightPercent(
    aiInsights.optimal_focus_time,
    ["confidence_percent", "score_percent", "percent"],
    ["confidence", "score"],
  );
  const weeklyCompletionPercent = insightPercent(
    aiInsights.weekly_completion_rate,
    ["percent", "percentage", "completion_percent"],
    ["rate", "completion_rate"],
  );
  const hasWeeklyCompletion =
    Object.keys(aiInsights.weekly_completion_rate).length > 0;
  const density = aiInsights.schedule_density;
  const densityValue = density.peak_time_label
    ? `${density.percent}% · ${density.peak_time_label}`
    : `${density.percent}%`;
  const focusPrompt =
    optimalFocusTime === "추천 데이터 준비 중"
      ? "우선순위가 높은 작업부터 차분히 시작해보세요."
      : `${optimalFocusTime} 집중 시간대를 활용해 우선순위가 높은 작업부터 처리해보세요.`;
  const week = sortedStreakWeek(completionStreak.week);

  return (
    <aside className="fixed inset-y-0 right-0 z-40 hidden w-[268px] flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-900/10 backdrop-blur xl:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-slate-200 px-4">
        <span className="text-xs font-semibold text-slate-500">AI 패널</span>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
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
              value={optimalFocusTime}
              bar={focusConfidence}
              gradient="from-violet-400 to-indigo-400"
            />
            <InsightCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="이번 주 완료율"
              value={
                hasWeeklyCompletion ? `${weeklyCompletionPercent}%` : "집계 중"
              }
              bar={weeklyCompletionPercent}
              gradient="from-emerald-400 to-teal-400"
            />
            <InsightCard
              icon={<Timer className="h-4 w-4" />}
              label="오늘 일정 밀도"
              value={densityValue}
              bar={clampPercent(density.percent)}
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
            {focusPrompt}
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
                <span
                  className={cn(
                    "text-xs",
                    recommendedTask.overdue
                      ? "text-rose-500"
                      : "text-slate-400",
                  )}
                >
                  {recommendedTask.dueLabel}
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
          {week.length > 0 ? (
            <div className="grid h-16 grid-cols-7 gap-1.5">
              {week.map((day, index) => (
                <div
                  key={day.date ?? `${day.status}-${index}`}
                  className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-1"
                  title={day.status}
                >
                  <div className="flex min-h-0 items-end">
                    <div
                      className={cn(
                        "w-full rounded-sm",
                        day.status === "completed" &&
                          "bg-gradient-to-t from-emerald-500 to-teal-300",
                        day.status === "missed" && "bg-rose-300",
                        day.status === "pending" &&
                          "bg-gradient-to-t from-violet-600 to-indigo-300",
                        (day.status === "empty" || day.status === "future") &&
                          "bg-slate-200",
                      )}
                      style={{ height: `${streakDayHeight(day)}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-center text-[9px]",
                      day.status === "pending"
                        ? "font-semibold text-violet-500"
                        : "text-slate-300",
                    )}
                  >
                    {streakDayLabel(day, index)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-3 text-center text-xs text-slate-300">
              주간 완료 기록을 집계 중입니다.
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}

function LoadingDashboard() {
  return (
    <div>
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
  const setTaskCompletion = useSetTaskCompletion();

  const [rightOpen, setRightOpen] = useState(true);
  const [isXlUp, setIsXlUp] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(min-width: 1280px)").matches;
  });
  const [filter, setFilter] = useState<DashboardFilter>("all");
  const [search, setSearch] = useState("");
  const [checkedOverrides, setCheckedOverrides] = useState<
    Record<number, boolean>
  >({});

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    const handleChange = () => setIsXlUp(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

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
        rawTasks
          .filter(
            (task) =>
              task.status !== "done" && checkedOverrides[task.id] !== true,
          )
          .map((task) => toDashboardTask(task, categories)),
      ),
    [categories, checkedOverrides, rawTasks],
  );

  const totalCount = tasks.length;
  const overdueCount = tasks.filter((task) => task.overdue).length;
  const urgentCount = tasks.filter(
    (task) => task.priority === "urgent",
  ).length;
  const attentionCount = tasks.filter(
    (task) => task.overdue || task.priority === "urgent",
  ).length;
  const highCount = tasks.filter(
    (task) => task.priority === "high",
  ).length;
  const recommendedTask =
    tasks.find((task) => task.overdue || task.priority === "urgent") ??
    tasks.find((task) => task.priority === "high") ??
    tasks[0];
  const dateLabel = formatKoreanDate(homeQuery.data?.date);
  const aiInsights = homeQuery.data?.ai_insights ?? {
    optimal_focus_time: {},
    weekly_completion_rate: {},
    schedule_density: {
      percent: 0,
      level: "low" as const,
      busy_minutes: 0,
      available_minutes: 0,
      scheduled_hours: 0,
      peak_time_label: null,
    },
  };
  const completionStreak = homeQuery.data?.completion_streak ?? {
    days: 0,
    current_days: 0,
    best_days: 0,
    source: "schedule_completed_at",
    week: [],
  };
  const currentStreakDays =
    homeQuery.data?.summary.current_completion_streak_days ??
    completionStreak.current_days;
  const bestStreakDays =
    homeQuery.data?.summary.best_completion_streak_days ??
    completionStreak.best_days;
  const streakSubLabel =
    currentStreakDays > 0 && currentStreakDays >= bestStreakDays
      ? "최고 기록 유지 중"
      : bestStreakDays > 0
        ? `최고 ${bestStreakDays}일`
        : "완료 기록을 시작해보세요";
  const optimalFocusTime = focusTimeLabel(aiInsights.optimal_focus_time);

  const handleCompleteTask = (task: DashboardTask) => {
    setCheckedOverrides((current) => ({ ...current, [task.id]: true }));
    setTaskCompletion.mutate(
      { taskId: task.task_id ?? task.id, completed: true },
      {
        onError: () => {
          setCheckedOverrides((current) => {
            const next = { ...current };
            delete next[task.id];
            return next;
          });
        },
      },
    );
  };

  const rightPanelVisible = isXlUp && rightOpen;
  const rightPanelOffset = rightPanelVisible ? "268px" : "0px";
  const headerRightOffset = rightPanelVisible
    ? "268px"
    : isXlUp
      ? "44px"
      : "0px";
  return (
    <AppShell
      wide
      greeting={
        <div className="min-w-0">
          <p className="truncate text-xs text-slate-400">{dateLabel}</p>
          <h1 className="truncate text-base font-bold leading-tight text-slate-800">
            좋은 아침이에요, {displayName}
          </h1>
        </div>
      }
      aiChatButtonOffset={rightPanelOffset}
      headerRightOffset={headerRightOffset}
    >
      <div
        className={cn(
          "transition-[padding] duration-200",
          rightOpen && "xl:pr-[268px]",
        )}
      >
        {homeQuery.isLoading ? (
          <LoadingDashboard />
        ) : homeQuery.isError ? (
          <ErrorState
            title="홈 대시보드를 불러오지 못했습니다"
            message={(homeQuery.error as Error).message}
            onRetry={() => homeQuery.refetch()}
            retrying={homeQuery.isFetching}
          />
        ) : (
          <>
            <UrgentAlert
              overdueCount={overdueCount}
              urgentCount={urgentCount}
              onView={() => setFilter("urgent")}
            />

            <AiBriefingCard
              briefingText={homeQuery.data?.briefing_text ?? ""}
              focusTime={optimalFocusTime}
              dueTodayCount={totalCount}
              totalIncompleteCount={
                homeQuery.data?.summary.incomplete_task_count ?? totalCount
              }
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
                label="오늘 마감"
                value={totalCount}
                sub="미완료 할 일"
                accent="text-violet-600"
                tone="border-slate-100 bg-white"
                onClick={() => setFilter("all")}
              />
              <StatCard
                label="연속 완료"
                value={
                  <span className="inline-flex items-center gap-1">
                    {currentStreakDays}일{" "}
                    <Flame className="h-5 w-5 text-orange-500" />
                  </span>
                }
                sub={streakSubLabel}
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
              attentionCount={attentionCount}
              onFilterChange={setFilter}
              onSearchChange={setSearch}
              onToggle={handleCompleteTask}
            />
          </>
        )}
      </div>

      <RightAiPanel
        open={rightPanelVisible}
        aiInsights={aiInsights}
        completionStreak={completionStreak}
        recommendedTask={recommendedTask}
      />
      <button
        type="button"
        onClick={() => setRightOpen((open) => !open)}
        aria-label={rightPanelVisible ? "AI 패널 접기" : "AI 패널 열기"}
        title={rightPanelVisible ? "AI 패널 접기" : "AI 패널 열기"}
        className="fixed right-4 top-3.5 z-50 hidden h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent text-slate-500 shadow-none transition hover:bg-slate-100 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 xl:inline-flex"
      >
        <PanelRight className="h-4 w-4" />
      </button>
    </AppShell>
  );
}
