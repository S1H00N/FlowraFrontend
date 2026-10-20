import { projectDate, type PlannedPeriod } from "./projectSchedule";

export type ProjectGanttZoom = "day" | "week" | "month";
export interface ProjectGanttPosition { date: string; fraction: number }
export interface ProjectGanttHeader {
  key: string;
  label: string;
  start: string;
  end: string;
  x: number;
  width: number;
  weekend?: boolean;
}
export interface ProjectGanttHeaders { major: ProjectGanttHeader[]; minor: ProjectGanttHeader[] }
export interface ProjectGanttAxis {
  start: string;
  end: string;
  zoom: ProjectGanttZoom;
  width: number;
  weekStartsOn: number;
  /** Headers for the initial viewport. Use getProjectGanttHeaders after scrolling. */
  headers: ProjectGanttHeaders;
  dateToX: (date: string) => number | null;
  positionToX: (position: ProjectGanttPosition) => number | null;
  xToDate: (x: number) => string;
  xToPosition: (x: number) => ProjectGanttPosition | null;
}

const DAY_MS = 86_400_000;
const MIN_DATE = "0001-01-01";
const MAX_DATE = "9999-12-31";
const HEADER_LIMIT = 600;
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const ordinal = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const MIN_ORDINAL = ordinal(MIN_DATE);
const MAX_ORDINAL = ordinal(MAX_DATE);
const mod = (value: number, divisor: number) => (value % divisor + divisor) % divisor;
const parts = (date: string) => date.split("-").map(Number);
const dateKey = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

function ordinalDate(value: number) {
  return Number.isFinite(value) && value >= MIN_ORDINAL && value <= MAX_ORDINAL
    ? new Date(Math.floor(value) * DAY_MS).toISOString().slice(0, 10) : "";
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function monthParts(serial: number) {
  return { year: Math.floor(serial / 12), month: mod(serial, 12) + 1 };
}

/** Date-only arithmetic uses UTC only as an integer calendar-day ordinal. */
export function addProjectGanttDays(value: string, days: number) {
  const date = projectDate(value);
  return date && Number.isFinite(days) ? ordinalDate(ordinal(date) + Math.trunc(days)) : "";
}

/** Calendar months retain the day where possible, including leap-year February. */
export function addProjectGanttMonths(value: string, months: number) {
  const date = projectDate(value);
  if (!date || !Number.isFinite(months)) return "";
  const [year, month, day] = parts(date);
  const next = monthParts(year * 12 + month - 1 + Math.trunc(months));
  return next.year >= 1 && next.year <= 9999
    ? dateKey(next.year, next.month, Math.min(day, daysInMonth(next.year, next.month))) : "";
}

/** Signed distance: a later `to` date produces a positive number. */
export function projectGanttDayDistance(from: string, to: string): number | null {
  const start = projectDate(from);
  const end = projectDate(to);
  return start && end ? Math.round(ordinal(end) - ordinal(start)) : null;
}

/** The server's effective progress is authoritative, including a manual zero. */
export function getProjectGanttProgress(source: { progress_percent?: number | null }) {
  const value = source.progress_percent;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function normalizedPeriod(source: PlannedPeriod) {
  const start = projectDate(source.planned_start_date);
  const end = projectDate(source.planned_end_date);
  const invalid = !!((source.planned_start_date && !start) || (source.planned_end_date && !end) ||
    (start && end && start > end));
  return { start, end, invalid };
}

export function getProjectGanttRange(project: PlannedPeriod, items: readonly PlannedPeriod[], today: string) {
  const period = normalizedPeriod(project);
  if (!period.invalid && period.start && period.end)
    return { start: period.start, end: period.end, source: "project" as const };
  let start = "";
  let end = "";
  for (const item of items) {
    const plan = normalizedPeriod(item);
    if (plan.invalid) continue;
    for (const date of [plan.start, plan.end]) {
      if (!date) continue;
      if (!start || date < start) start = date;
      if (!end || date > end) end = date;
    }
  }
  if (start && end) return { start, end, source: "items" as const };
  const current = projectDate(today);
  if (!current) throw new RangeError("오늘 날짜를 확인할 수 없습니다.");
  return { start: current, end: current, source: "today" as const };
}

export function createProjectGanttAxis(
  from: string, to: string, zoom: ProjectGanttZoom, weekStart: "sunday" | "monday" | number = "sunday",
): ProjectGanttAxis {
  let start = projectDate(from);
  let end = projectDate(to);
  if (!start || !end || start > end) throw new RangeError("간트 날짜 범위를 확인해 주세요.");
  const weekStartsOn = weekStart === "monday" ? 1 : weekStart === "sunday" ? 0
    : Number.isInteger(weekStart) && weekStart >= 0 && weekStart <= 6 ? weekStart : 0;
  if (zoom === "month") {
    const [startYear, startMonth] = parts(start);
    const [endYear, endMonth] = parts(end);
    start = dateKey(startYear, startMonth, 1);
    end = dateKey(endYear, endMonth, daysInMonth(endYear, endMonth));
  } else if (zoom === "week") {
    const startOffset = mod(ordinal(start) + 4 - weekStartsOn, 7);
    const endOffset = mod(ordinal(end) + 4 - weekStartsOn, 7);
    start = ordinalDate(Math.max(MIN_ORDINAL, ordinal(start) - startOffset));
    end = ordinalDate(Math.min(MAX_ORDINAL, ordinal(end) + 6 - endOffset));
  }
  const startOrdinal = ordinal(start);
  const endOrdinal = ordinal(end);
  const [startYear, startMonth] = parts(start);
  const startMonthSerial = startYear * 12 + startMonth - 1;
  const dayWidth = zoom === "day" ? 43 : 143 / 7;
  function ordinalX(day: number) {
    if (zoom !== "month") return (day - startOrdinal) * dayWidth;
    // An exclusive bound may be the first day of year 10000; it is a coordinate,
    // never a DATE value passed to the API or exposed as an editable plan.
    if (day >= MAX_ORDINAL + 1) return (10000 * 12 - startMonthSerial) * 176;
    const date = ordinalDate(Math.floor(day));
    const [year, month, calendarDay] = parts(date);
    return (year * 12 + month - 1 - startMonthSerial +
      (calendarDay - 1 + day - Math.floor(day)) / daysInMonth(year, month)) * 176;
  }
  const dateToX = (value: string) => {
    const date = projectDate(value);
    return date ? ordinalX(ordinal(date)) : null;
  };
  const positionToX = (position: ProjectGanttPosition) => {
    const date = projectDate(position.date);
    return date && Number.isFinite(position.fraction) && position.fraction >= 0 && position.fraction <= 1
      ? ordinalX(ordinal(date) + position.fraction) : null;
  };
  const xToPosition = (x: number): ProjectGanttPosition | null => {
    if (!Number.isFinite(x)) return null;
    let day: number;
    if (zoom === "month") {
      const serial = startMonthSerial + x / 176;
      const whole = Math.floor(serial);
      const { year, month } = monthParts(whole);
      if (year < 1 || year > 9999) return null;
      day = ordinal(dateKey(year, month, 1)) + (serial - whole) * daysInMonth(year, month);
    } else day = startOrdinal + x / dayWidth;
    // Avoid a representational epsilon putting a calendar boundary on yesterday.
    const nearest = Math.round(day);
    if (Math.abs(day - nearest) < 1e-8) day = nearest;
    const date = ordinalDate(Math.floor(day));
    return date ? { date, fraction: day - Math.floor(day) } : null;
  };
  const axis: ProjectGanttAxis = {
    start, end, zoom, weekStartsOn, width: ordinalX(endOrdinal + 1),
    dateToX, positionToX, xToPosition, xToDate: (x) => xToPosition(x)?.date ?? "",
    headers: { major: [], minor: [] },
  };
  axis.headers = getProjectGanttHeaders(axis);
  return axis;
}

/** Only the viewport's header units are materialized, regardless of project age. */
export function getProjectGanttHeaders(axis: ProjectGanttAxis, scrollX = 0, viewportWidth = 1200): ProjectGanttHeaders {
  const width = Number.isFinite(viewportWidth) ? Math.max(0, viewportWidth) : 1200;
  const left = Math.min(axis.width, Math.max(0, Number.isFinite(scrollX) ? scrollX : 0));
  const right = Math.min(axis.width, left + width);
  const firstDate = axis.xToDate(Math.min(left, Math.max(0, axis.width - 0.001))) || axis.start;
  const lastDate = axis.xToDate(Math.min(right, Math.max(0, axis.width - 0.001))) || axis.end;
  const first = Math.max(ordinal(axis.start), ordinal(firstDate));
  const last = Math.min(ordinal(axis.end), ordinal(lastDate));
  const axisEnd = ordinal(axis.end) + 1;
  const headers: ProjectGanttHeaders = { major: [], minor: [] };
  function segment(day: number, until: number, label: string, key: string, weekend?: boolean): ProjectGanttHeader {
    const clippedStart = Math.max(day, ordinal(axis.start));
    const clippedEnd = Math.min(until, axisEnd);
    const start = ordinalDate(clippedStart);
    const end = ordinalDate(clippedEnd - 1);
    const x = axis.dateToX(start)!;
    const endX = clippedEnd === axisEnd ? axis.width : axis.dateToX(ordinalDate(clippedEnd))!;
    return { key, label, start, end, x, width: endX - x, weekend };
  }
  const [year, month] = parts(ordinalDate(first));
  let cursor = ordinal(dateKey(year, axis.zoom === "month" ? 1 : month, 1));
  for (let count = 0; cursor <= last && count < HEADER_LIMIT; count += 1) {
    const [currentYear, currentMonth] = parts(ordinalDate(cursor));
    const next = axis.zoom === "month"
      ? currentYear === 9999 ? MAX_ORDINAL + 1 : ordinal(dateKey(currentYear + 1, 1, 1))
      : cursor + daysInMonth(currentYear, currentMonth);
    headers.major.push(segment(cursor, next,
      axis.zoom === "month" ? `${currentYear}년` : `${currentYear}년 ${currentMonth}월`, `major:${cursor}`));
    cursor = next;
  }
  if (axis.zoom === "month") cursor = ordinal(dateKey(year, month, 1));
  else if (axis.zoom === "week") cursor = first - mod(first + 4 - axis.weekStartsOn, 7);
  else cursor = first;
  for (let count = 0; cursor <= last && count < HEADER_LIMIT; count += 1) {
    const safeCursor = Math.max(MIN_ORDINAL, cursor);
    const [currentYear, currentMonth, day] = parts(ordinalDate(safeCursor));
    const weekday = mod(safeCursor + 4, 7);
    const next = axis.zoom === "month" ? cursor + daysInMonth(currentYear, currentMonth)
      : cursor + (axis.zoom === "week" ? 7 : 1);
    const label = axis.zoom === "month" ? `${currentMonth}월`
      : axis.zoom === "week" ? `${currentMonth}/${day}` : `${day} ${WEEKDAY_LABELS[weekday]}`;
    headers.minor.push(segment(safeCursor, next, label, `minor:${cursor}`,
      axis.zoom === "day" && (weekday === 0 || weekday === 6)));
    cursor = next;
  }
  return headers;
}

export interface ProjectGanttPeriod {
  kind: "period" | "start" | "end" | "unset" | "invalid";
  start: string;
  end: string;
  x?: number;
  width?: number;
  message: string;
}

export function getProjectGanttPeriod(source: PlannedPeriod, axis: ProjectGanttAxis): ProjectGanttPeriod {
  const { start, end, invalid } = normalizedPeriod(source);
  if (invalid) return { kind: "invalid", start, end, message: "계획 날짜 확인 필요" };
  if (!start && !end) return { kind: "unset", start, end, message: "기간 미설정" };
  if (start && end) {
    const x = axis.dateToX(start)!;
    // End is inclusive. A same-day period therefore retains a full day's width.
    const endX = axis.positionToX({ date: end, fraction: 1 })!;
    return { kind: "period", start, end, x, width: endX - x, message: `${start} ~ ${end}` };
  }
  if (start) return { kind: "start", start, end, x: axis.dateToX(start)!, message: `시작일 ${start} · 종료일 미설정` };
  return { kind: "end", start, end, x: axis.dateToX(end)!, message: `종료일 ${end} · 시작일 미설정` };
}
