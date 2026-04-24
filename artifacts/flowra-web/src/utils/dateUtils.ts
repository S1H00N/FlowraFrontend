export function toStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseDateInput(input: string): Date | null {
  if (!input) return null;
  const [yyyy, mm, dd] = input.split("-").map(Number);
  if (!yyyy || !mm || !dd) return null;
  return new Date(yyyy, mm - 1, dd);
}

export function buildWeeklyRepeatDates({
  startDate,
  endDate,
  weekdays,
}: {
  startDate: Date;
  endDate: Date;
  weekdays: number[];
}): Date[] {
  const start = toStartOfDay(startDate);
  const end = toStartOfDay(endDate);

  if (end.getTime() < start.getTime()) return [];

  const weekdaySet = new Set(weekdays);
  if (weekdaySet.size === 0) return [];

  const dates: Date[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    if (weekdaySet.has(cursor.getDay())) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function applyDateWithTime(targetDate: Date, sourceDateTime: Date): Date {
  const d = new Date(targetDate);
  d.setHours(
    sourceDateTime.getHours(),
    sourceDateTime.getMinutes(),
    sourceDateTime.getSeconds(),
    sourceDateTime.getMilliseconds(),
  );
  return d;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toOffsetISOString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60);
  const offsetRemainder = absoluteOffset % 60;

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
    `${sign}${pad(offsetHours)}:${pad(offsetRemainder)}`,
  ].join("");
}

export function localInputToOffsetISOString(local: string): string {
  return toOffsetISOString(new Date(local));
}
