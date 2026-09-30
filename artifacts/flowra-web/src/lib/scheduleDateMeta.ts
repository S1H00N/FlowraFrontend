import type { Schedule } from "@/types";

export interface ScheduleDateMeta {
  count: number;
  hasDeadline: boolean;
}

function toDateKey(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayStart(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function scheduleDateRange(schedule: Schedule) {
  const start = new Date(schedule.start_datetime);
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const rawEnd = schedule.end_datetime ? new Date(schedule.end_datetime) : null;
  const safeEnd =
    rawEnd && !Number.isNaN(rawEnd.getTime()) && rawEnd > safeStart
      ? rawEnd
      : new Date(safeStart.getTime() + 60 * 60 * 1000);

  return { start: safeStart, end: safeEnd };
}

export function groupSchedulesByDate(schedules: Schedule[]) {
  const grouped = new Map<string, ScheduleDateMeta>();

  for (const schedule of schedules) {
    const { start, end } = scheduleDateRange(schedule);
    const cursor = dayStart(start);
    const lastDate = dayStart(end);
    let guard = 0;

    while (cursor <= lastDate && guard < 370) {
      const key = toDateKey(cursor);
      const current = grouped.get(key) ?? { count: 0, hasDeadline: false };
      grouped.set(key, {
        count: current.count + 1,
        hasDeadline:
          current.hasDeadline || schedule.schedule_type === "deadline",
      });
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }

  return grouped;
}
