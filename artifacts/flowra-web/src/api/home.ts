import apiClient from "./client";
import type {
  ApiResponse,
  BriefingSchedule,
  BriefingTask,
  HomeOrganizationSchedule,
  HomeSchedule,
  HomeSummary,
  HomeTask,
  HomeTodayQuery,
  ScheduleType,
  TaskPriority,
  TaskStatus,
  TodayBriefing,
  TodayHome,
} from "@/types";

type RawSchedule = Partial<BriefingSchedule & HomeSchedule>;
type RawTask = Partial<BriefingTask & HomeTask>;
type RawHomeSummary = Partial<HomeSummary> & {
  schedule_count?: number;
  total_schedule_count?: number;
  task_count?: number;
};

type RawTodayResponse = Partial<TodayBriefing> &
  Partial<TodayHome> & {
    schedules?: RawSchedule[];
    company_schedules?: HomeOrganizationSchedule[];
    tasks?: RawTask[];
    overdue_tasks?: RawTask[];
    summary?: RawHomeSummary;
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

function list<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
  return statuses.includes(value as TaskStatus) ? (value as TaskStatus) : "todo";
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
  const rawTasks = (data.priority_tasks ??
    data.due_today_tasks ??
    data.tasks ??
    data.overdue_tasks) as RawTask[] | undefined;

  const schedules = list(rawSchedules).map(
    (schedule, index) => toHomeSchedule(schedule, index, date),
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

  return {
    date,
    timezone: data.timezone ?? "Asia/Seoul",
    briefing_text: data.briefing_text ?? data.ai_summary ?? "",
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
        summary.incomplete_task_count ?? data.unfinished_tasks ?? summary.task_count,
        tasks.length,
      ),
    },
    slot_counts: data.slot_counts ?? {
      meeting: 0,
      fieldwork: 0,
      deadline: 0,
      other: 0,
    },
    today_schedules: schedules,
    organization_schedules: organizationSchedules,
    due_today_tasks: tasks,
    focus_items: list(data.focus_items),
  };
}

export async function getTodayHome(query: HomeTodayQuery = {}) {
  const res = await apiClient.get<ApiResponse<RawTodayResponse>>(
    "/briefings/today",
    {
      params: query,
    },
  );
  return { ...res.data, data: briefingToHome(res.data.data) };
}
