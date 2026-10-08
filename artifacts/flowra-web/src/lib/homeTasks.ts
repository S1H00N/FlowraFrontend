import type { Task } from "@/types";

export type TaskPlanStatus =
  | "unplanned"
  | "planned"
  | "active"
  | "past"
  | "completed"
  | "unknown";

// Both the home feed and schedule-detail response provide these fields.
export interface TaskPlanSchedule {
  start_datetime?: string | null;
  end_datetime?: string | null;
  all_day?: boolean;
  is_completed?: boolean;
  completed_at?: string | null;
}

function validCalendarDate(year: number, month: number, day: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function planDateTime(value: string | null | undefined, allDay: boolean) {
  if (!value) return null;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/.exec(
      value,
    );
  if (
    !match ||
    !validCalendarDate(Number(match[1]), Number(match[2]), Number(match[3]))
  )
    return null;
  if (match[4] === undefined) {
    return allDay ? { date: value, time: null } : null;
  }
  if (
    Number(match[4]) > 23 ||
    Number(match[5]) > 59 ||
    Number(match[6] ?? 0) > 59
  )
    return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? { date: null, time } : null;
}

export function taskPlanDateKey(
  schedule: TaskPlanSchedule | null | undefined,
  timezone: string,
) {
  const start = planDateTime(
    schedule?.start_datetime,
    schedule?.all_day === true,
  );
  if (!start) return null;
  // A date-only all-day value already names a calendar day, not UTC midnight.
  return start.date ?? taskDateKey(schedule?.start_datetime, timezone);
}

export function taskPlanStatus(
  task: Pick<Task, "status" | "schedule_id">,
  schedule: TaskPlanSchedule | null | undefined,
  now: Date,
  timezone: string,
): TaskPlanStatus {
  if (task.status === "done") return "completed";
  if (task.schedule_id == null) return "unplanned";
  if (!schedule || !Number.isFinite(now.getTime())) return "unknown";
  // Completing a schedule does not complete its linked Task. An incomplete
  // Task still needs a new plan, even if that schedule's date is in the future.
  if (schedule.is_completed === true) return "past";

  const allDay = schedule.all_day === true;
  const start = planDateTime(schedule.start_datetime, allDay);
  if (!start) return "unknown";
  const hasEnd = schedule.end_datetime != null;
  const end = hasEnd ? planDateTime(schedule.end_datetime, allDay) : null;
  if (hasEnd && !end) return "unknown";
  const today = taskDateKey(now.toISOString(), timezone)!;
  const startDate = taskPlanDateKey(schedule, timezone)!;

  if (start.time !== null && end?.time != null) {
    if (end.time < start.time) return "unknown";
    if (end.time <= now.getTime()) return "past";
    if (start.time > now.getTime()) return "planned";
    return "active";
  }

  if (allDay) {
    const endDate = end
      ? (end.date ?? taskDateKey(schedule.end_datetime, timezone)!)
      : startDate;
    if (endDate < startDate) return "unknown";
    if (end?.time != null && end.time <= now.getTime()) return "past";
    if (endDate < today) return "past";
    if (startDate > today) return "planned";
    // all_day explicitly promises the entire calendar day. A missing end
    // therefore needs no invented duration or timed boundary.
    return "active";
  }

  if (startDate < today) return "past";
  if (start.time! > now.getTime()) return "planned";
  // A same-day start in the past does not tell us whether the schedule ended.
  return "unknown";
}

export function taskDateKey(
  value: string | null | undefined,
  timezone: string,
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function overdueDays(task: Task, today: string, timezone: string) {
  const due = taskDateKey(task.due_datetime, timezone);
  if (!due || task.status === "done") return 0;
  // Compare calendar days, not elapsed hours (including daylight-saving days).
  return Math.max(
    0,
    Math.round((Date.parse(today) - Date.parse(due)) / 86_400_000),
  );
}

export function taskDueLabel(task: Task, today: string, timezone: string) {
  const due = taskDateKey(task.due_datetime, timezone);
  if (!due) return "마감 없음";
  const label = new Date(`${due}T00:00:00`).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
  const late = overdueDays(task, today, timezone);
  return `마감 ${label}${late ? ` · ${late}일 지연` : due === today ? " · 오늘" : ""}`;
}

export function selectTodayTasks(
  tasks: Task[],
  today: string,
  timezone: string,
  scheduleIds: Set<number>,
) {
  const priority = { urgent: 0, high: 1, medium: 2, low: 3 };
  const rank = (task: Task) => {
    if (task.schedule_id && scheduleIds.has(task.schedule_id)) return 0;
    return 1;
  };
  return tasks
    .filter(
      (task) =>
        task.status !== "done" &&
        (taskDateKey(task.due_datetime, timezone) === today ||
          (task.schedule_id != null && scheduleIds.has(task.schedule_id))),
    )
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        priority[a.priority] - priority[b.priority] ||
        (a.due_datetime ?? "9999").localeCompare(b.due_datetime ?? "9999") ||
        a.task_id - b.task_id,
    );
}
