import apiClient from "./client";
import type {
  ApiResponse,
  BriefingSchedule,
  BriefingTask,
  HomeAiInsights,
  HomeCompletionStreak,
  HomeCompletionStreakDay,
  HomeCompletionStreakStatus,
  HomeOrganizationSchedule,
  HomeSchedule,
  HomeScheduleDensity,
  HomeScheduleDensityLevel,
  HomeSummary,
  HomeTask,
  HomeTodayQuery,
  ScheduleType,
  TaskPriority,
  TaskStatus,
  TodayHome,
} from "@/types";

type RawSchedule = Partial<BriefingSchedule & HomeSchedule>;
type RawTask = Partial<BriefingTask & HomeTask>;
type RawHomeSummary = Partial<HomeSummary> & {
  schedule_count?: number;
  total_schedule_count?: number;
  task_count?: number;
};

type RawAiInsights = {
  optimal_focus_time?: unknown;
  weekly_completion_rate?: unknown;
  schedule_density?: Partial<HomeScheduleDensity>;
};

type RawCompletionStreak = Partial<HomeCompletionStreak> & {
  week?: unknown[];
};

type RawTodayResponse = Omit<
  Partial<TodayHome>,
  "summary" | "ai_insights" | "completion_streak"
> & {
  schedules?: RawSchedule[];
  company_schedules?: HomeOrganizationSchedule[];
  tasks?: RawTask[];
  overdue_tasks?: RawTask[];
  priority_tasks?: RawTask[];
  unfinished_tasks?: number;
  ai_summary?: string;
  summary?: RawHomeSummary;
  ai_insights?: RawAiInsights;
  completion_streak?: RawCompletionStreak;
};

const scheduleTypes: ScheduleType[] = [
  "personal",
  "meeting",
  "fieldwork",
  "deadline",
  "other",
];
const priorities: TaskPriority[] = ["low", "medium", "high", "urgent"];
const statuses: TaskStatus[] = ["todo", "in_progress", "done", "postponed"];
const densityLevels: HomeScheduleDensityLevel[] = [
  "low",
  "medium",
  "high",
  "overloaded",
];
const streakStatuses: HomeCompletionStreakStatus[] = [
  "completed",
  "missed",
  "pending",
  "empty",
  "future",
];

function list<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function firstNonBlankString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function recordOr(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function densityLevelOr(value: unknown): HomeScheduleDensityLevel {
  return densityLevels.includes(value as HomeScheduleDensityLevel)
    ? (value as HomeScheduleDensityLevel)
    : "low";
}

function streakStatusOr(value: unknown): HomeCompletionStreakStatus {
  return streakStatuses.includes(value as HomeCompletionStreakStatus)
    ? (value as HomeCompletionStreakStatus)
    : "empty";
}

function normalizeScheduleDensity(
  value: Partial<HomeScheduleDensity> | undefined,
): HomeScheduleDensity {
  return {
    percent: numberOr(value?.percent, 0),
    level: densityLevelOr(value?.level),
    busy_minutes: numberOr(value?.busy_minutes, 0),
    available_minutes: numberOr(value?.available_minutes, 0),
    scheduled_hours: numberOr(value?.scheduled_hours, 0),
    peak_time_label:
      typeof value?.peak_time_label === "string" ? value.peak_time_label : null,
  };
}

function normalizeStreakDay(value: unknown): HomeCompletionStreakDay {
  const day = recordOr(value);
  return {
    ...day,
    date:
      typeof day.date === "string"
        ? day.date
        : typeof day.day_date === "string"
          ? day.day_date
          : undefined,
    label:
      typeof day.label === "string"
        ? day.label
        : typeof day.day_label === "string"
          ? day.day_label
          : undefined,
    status: streakStatusOr(day.status ?? day.state),
  };
}

function scheduleTypeOr(value: unknown): ScheduleType {
  return scheduleTypes.includes(value as ScheduleType)
    ? (value as ScheduleType)
    : "personal";
}

function priorityOr(value: unknown): TaskPriority {
  return priorities.includes(value as TaskPriority)
    ? (value as TaskPriority)
    : "medium";
}

function statusOr(value: unknown): TaskStatus {
  return statuses.includes(value as TaskStatus)
    ? (value as TaskStatus)
    : "todo";
}

function fallbackDate(date?: string) {
  return date ? `${date}T00:00:00+09:00` : new Date().toISOString();
}

function toHomeSchedule(
  schedule: RawSchedule,
  index: number,
  date?: string,
): HomeSchedule {
  const id = schedule.schedule_id ?? schedule.id ?? index + 1;
  return {
    id,
    schedule_id: schedule.schedule_id ?? id,
    title: schedule.title ?? "Untitled schedule",
    description: schedule.description,
    schedule_type: scheduleTypeOr(schedule.schedule_type),
    start_datetime: schedule.start_datetime ?? fallbackDate(date),
    end_datetime: schedule.end_datetime,
    all_day: schedule.all_day ?? false,
    location: schedule.location,
    category_id: schedule.category_id,
    priority: schedule.priority,
    is_completed: schedule.is_completed,
    completed_at: schedule.completed_at,
  };
}

function toHomeTask(task: RawTask, index: number): HomeTask {
  const id = task.task_id ?? task.id ?? index + 1;
  return {
    id,
    task_id: task.task_id ?? id,
    title: task.title ?? "Untitled task",
    description: task.description,
    priority: priorityOr(task.priority),
    status: statusOr(task.status),
    due_datetime: task.due_datetime,
    schedule_id: task.schedule_id,
    category_id: task.category_id,
  };
}

function briefingToHome(raw: RawTodayResponse | undefined): TodayHome {
  const data = raw ?? {};
  const date = data.date ?? new Date().toISOString().slice(0, 10);
  const summary = (data.summary ?? {}) as RawHomeSummary;

  const rawSchedules = (data.today_schedules ?? data.schedules) as
    | RawSchedule[]
    | undefined;
  const rawTasks = (data.due_today_tasks ??
    data.priority_tasks ??
    data.tasks ??
    data.overdue_tasks) as RawTask[] | undefined;

  const schedules = list(rawSchedules).map((schedule, index) =>
    toHomeSchedule(schedule, index, date),
  );
  const organizationSchedules = list(
    data.organization_schedules ?? data.company_schedules,
  );
  const tasks = list(rawTasks).map((task, index) => toHomeTask(task, index));

  const todayScheduleCount = numberOr(
    summary.today_schedule_count ??
      summary.total_schedule_count ??
      summary.schedule_count,
    schedules.length + organizationSchedules.length,
  );
  const rawCompletionStreak = data.completion_streak ?? {};
  const currentStreakDays = numberOr(
    summary.current_completion_streak_days,
    numberOr(rawCompletionStreak.current_days ?? rawCompletionStreak.days, 0),
  );
  const bestStreakDays = numberOr(
    summary.best_completion_streak_days,
    numberOr(rawCompletionStreak.best_days, currentStreakDays),
  );
  const completionStreak: HomeCompletionStreak = {
    days: numberOr(rawCompletionStreak.days, currentStreakDays),
    current_days: numberOr(rawCompletionStreak.current_days, currentStreakDays),
    best_days: numberOr(rawCompletionStreak.best_days, bestStreakDays),
    source:
      typeof rawCompletionStreak.source === "string"
        ? rawCompletionStreak.source
        : "schedule_completed_at",
    week: list(rawCompletionStreak.week).map(normalizeStreakDay),
  };
  const rawAiInsights = data.ai_insights ?? {};
  const aiInsights: HomeAiInsights = {
    optimal_focus_time: recordOr(rawAiInsights.optimal_focus_time),
    weekly_completion_rate: recordOr(rawAiInsights.weekly_completion_rate),
    schedule_density: normalizeScheduleDensity(rawAiInsights.schedule_density),
  };

  return {
    date,
    timezone: data.timezone ?? "Asia/Seoul",
    briefing_text: firstNonBlankString(data.briefing_text, data.ai_summary),
    summary: {
      today_schedule_count: todayScheduleCount,
      today_personal_schedule_count: numberOr(
        summary.today_personal_schedule_count,
        schedules.length,
      ),
      today_company_schedule_count: numberOr(
        summary.today_company_schedule_count,
        organizationSchedules.length,
      ),
      today_deadline_schedule_count: numberOr(
        summary.today_deadline_schedule_count,
        0,
      ),
      incomplete_task_count: numberOr(
        summary.incomplete_task_count ??
          data.unfinished_tasks ??
          summary.task_count,
        tasks.length,
      ),
      current_completion_streak_days: currentStreakDays,
      best_completion_streak_days: bestStreakDays,
    },
    slot_counts: data.slot_counts ?? {
      meeting: 0,
      fieldwork: 0,
      deadline: 0,
      other: 0,
    },
    ai_insights: aiInsights,
    completion_streak: completionStreak,
    today_schedules: schedules,
    organization_schedules: organizationSchedules,
    due_today_tasks: tasks,
    focus_items: list(data.focus_items),
  };
}

export async function getTodayHome(query: HomeTodayQuery = {}) {
  const res = await apiClient.get<ApiResponse<RawTodayResponse>>(
    "/home/today",
    {
      params: query,
    },
  );
  return { ...res.data, data: briefingToHome(res.data.data) };
}
