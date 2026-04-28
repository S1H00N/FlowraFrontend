import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  useCreateSchedules,
  useDeleteSchedule,
  useDeleteSchedules,
  useSchedules,
  useUpdateSchedule,
} from "@/hooks/useSchedules";
import { useCompleteTask, useCreateTask, useTasks } from "@/hooks/useTasks";
import { useCategories } from "@/hooks/useCategories";
import {
  TASK_PRIORITIES,
  SCHEDULE_TYPES,
  SCHEDULE_VISIBILITY_LABELS,
  type Schedule,
  type ScheduleType,
  type ScheduleVisibility,
  type Task,
  type TaskPriority,
} from "@/types";
import {
  getClassificationLabel,
  getClassificationOptions,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { getErrorMessage } from "@/lib/error";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import CategorySelect, { CategoryDot } from "@/components/CategorySelect";
import AppShell from "@/components/AppShell";
import {
  localInputToOffsetISOString,
  toOffsetISOString,
} from "@/utils/dateUtils";
import { toast } from "@/lib/toast";

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

interface DayMeta {
  count: number;
  hasDeadline: boolean;
}

type ScheduleCalendarView = "month" | "week" | "day";

interface MonthCalendarCell {
  date: Date;
  currentMonth: boolean;
}

interface ScheduleFormState {
  title: string;
  description: string;
  schedule_type: ScheduleType;
  priority: TaskPriority;
  start_local: string;
  end_local: string;
  all_day: boolean;
  location: string;
  visibility: ScheduleVisibility;
  category_id: number | "";
}

type ScheduleFormSubmitIntent = "manual" | "auto" | "repeat";

interface ScheduleFormSubmitOptions {
  intent?: ScheduleFormSubmitIntent;
}

type ScheduleCompletionFilter = "all" | "active" | "completed";
type RepeatFrequencyUnit = "day" | "week" | "month" | "year";
type RepeatEndMode = "never" | "on" | "after";
type RepeatMonthlyMode = "date" | "nth_weekday" | "last_weekday";
type RepeatPreset =
  | "daily"
  | "weekday"
  | "weekly"
  | "biweekly"
  | "monthly_date"
  | "monthly_weekday"
  | "monthly_last_weekday"
  | "yearly"
  | "custom";

interface ScheduleFilters {
  scheduleTypes: ScheduleType[];
  priorities: TaskPriority[];
  categories: number[];
  completion: ScheduleCompletionFilter;
  q: string;
  location: string;
}

type FilterOptionValue = string | number;

interface InlineFilterOption<TValue extends FilterOptionValue> {
  key: string;
  value: TValue;
  label: string;
}

const defaultScheduleFilters: ScheduleFilters = {
  scheduleTypes: [],
  priorities: [],
  categories: [],
  completion: "all",
  q: "",
  location: "",
};

const repeatWeekdays = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];

const repeatUnitLabels: Record<RepeatFrequencyUnit, string> = {
  day: "일",
  week: "주",
  month: "개월",
  year: "년",
};

const taskPriorityBadge: Record<TaskPriority, string> = {
  urgent: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function parseScheduleCategoryFilters(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function parseScheduleTypeFilters(value: string | null): ScheduleType[] {
  if (!value) return [];
  const allowed = new Set<string>(SCHEDULE_TYPES);
  return value
    .split(",")
    .filter((item): item is ScheduleType => allowed.has(item));
}

function parseSchedulePriorityFilters(value: string | null): TaskPriority[] {
  if (!value) return [];
  const allowed = new Set<string>(TASK_PRIORITIES);
  return value
    .split(",")
    .filter((item): item is TaskPriority => allowed.has(item));
}

function toDateKey(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(local: string): string {
  return localInputToOffsetISOString(local);
}

function dateAtLocalTime(date: Date, hour: number, minute = 0) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatSelectedDate(date?: Date): string {
  if (!date) return "날짜를 선택해 주세요";
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function formatCompactDate(date: Date): string {
  return date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

function formatWeekRange(dates: Date[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return "";
  const sameMonth =
    first.getFullYear() === last.getFullYear() &&
    first.getMonth() === last.getMonth();

  if (sameMonth) {
    return `${first.getFullYear()}년 ${first.getMonth() + 1}월 ${first.getDate()}일 - ${last.getDate()}일`;
  }

  return `${formatCompactDate(first)} - ${formatCompactDate(last)}`;
}

function isToday(date: Date): boolean {
  return toDateKey(date) === toDateKey(new Date());
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

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function buildWeekDates(date: Date): Date[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(start);
    d.setDate(start.getDate() + idx);
    return d;
  });
}

function buildMonthCells(date: Date): Array<Date | null> {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(year, month, day));
  }

  return cells;
}

function buildFullMonthCells(date: Date): MonthCalendarCell[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstOfMonth.getDay() + totalDays) / 7) * 7;
  const firstCell = new Date(firstOfMonth);
  firstCell.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: totalCells }, (_, index) => {
    const cellDate = new Date(firstCell);
    cellDate.setDate(firstCell.getDate() + index);
    return {
      date: cellDate,
      currentMonth: cellDate.getMonth() === month,
    };
  });
}

function dateKeyToLocalInput(dateKey: string, sourceLocal: string) {
  const time = sourceLocal.match(/T\d{2}:\d{2}/)?.[0] ?? "T09:00";
  return `${dateKey}${time}`;
}

function dateFromLocalInput(value: string) {
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

function timeFromLocalInput(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

function localInputFromDate(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputWithDate(
  value: string,
  dateKey: string,
  fallbackTime = "09:00",
) {
  if (!dateKey) return "";
  const time = timeFromLocalInput(value) || fallbackTime;
  return `${dateKey}T${time}`;
}

function localInputWithTime(value: string, time: string, fallbackDate: string) {
  if (!time) return "";
  const dateKey = /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : fallbackDate;
  return `${dateKey}T${time}`;
}

function endLocalAfterStartChange(
  nextStartLocal: string,
  currentEndLocal: string,
  previousStartLocal: string,
) {
  if (!currentEndLocal) return currentEndLocal;

  const nextStart = new Date(nextStartLocal);
  const currentEnd = new Date(currentEndLocal);
  if (Number.isNaN(nextStart.getTime()) || Number.isNaN(currentEnd.getTime())) {
    return currentEndLocal;
  }
  if (currentEnd > nextStart) return currentEndLocal;

  const previousStart = new Date(previousStartLocal);
  const previousEnd = new Date(currentEndLocal);
  const previousDuration =
    !Number.isNaN(previousStart.getTime()) && previousEnd > previousStart
      ? previousEnd.getTime() - previousStart.getTime()
      : 60 * 60 * 1000;
  const duration = Math.max(30 * 60 * 1000, previousDuration);

  return localInputFromDate(new Date(nextStart.getTime() + duration));
}

function normalizeDateKeys(dateKeys: string[]) {
  return [...new Set(dateKeys)]
    .filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey))
    .sort();
}

function buildFormsForDateKeys(form: ScheduleFormState, dateKeys: string[]) {
  return normalizeDateKeys(dateKeys).map((dateKey) => ({
    ...form,
    start_local: dateKeyToLocalInput(dateKey, form.start_local),
    end_local: form.end_local
      ? dateKeyToLocalInput(dateKey, form.end_local)
      : "",
  }));
}

function buildRepeatDateKeys(options: {
  startDate: string;
  interval: number;
  unit: RepeatFrequencyUnit;
  weekdays: number[];
  monthlyMode: RepeatMonthlyMode;
  endMode: RepeatEndMode;
  endDate: string;
  occurrenceCount: number;
}) {
  const {
    startDate,
    interval,
    unit,
    weekdays,
    monthlyMode,
    endMode,
    endDate,
    occurrenceCount,
  } = options;
  if (!startDate) return [];

  const safeInterval = Math.max(1, interval || 1);
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];

  const end =
    endMode === "on" && endDate ? new Date(`${endDate}T00:00:00`) : null;
  if (end && (Number.isNaN(end.getTime()) || end < start)) return [];

  const maxCount =
    endMode === "after"
      ? Math.max(1, Math.min(100, occurrenceCount || 1))
      : endMode === "never"
        ? 30
        : 100;
  const dates: string[] = [];
  const addIfAllowed = (date: Date) => {
    if (end && date > end) return false;
    dates.push(toDateKey(date));
    return dates.length < maxCount;
  };

  if (unit === "day") {
    const cursor = new Date(start);
    while (dates.length < maxCount) {
      if (!addIfAllowed(cursor)) break;
      cursor.setDate(cursor.getDate() + safeInterval);
    }
    return dates;
  }

  if (unit === "week") {
    const weekdaySet =
      weekdays.length > 0 ? new Set(weekdays) : new Set([start.getDay()]);
    const cursor = new Date(start);
    while (dates.length < maxCount) {
      const diffDays = Math.floor(
        (cursor.getTime() - start.getTime()) / 86400000,
      );
      const weekIndex = Math.floor(diffDays / 7);
      if (weekIndex % safeInterval === 0 && weekdaySet.has(cursor.getDay())) {
        if (!addIfAllowed(cursor)) break;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  if (unit === "month") {
    const startDay = start.getDate();
    const startWeekday = start.getDay();
    const startWeekOfMonth = getWeekOfMonth(start);
    for (let offset = 0; dates.length < maxCount; offset += safeInterval) {
      const year = start.getFullYear();
      const month = start.getMonth() + offset;
      const candidate =
        monthlyMode === "last_weekday"
          ? getLastWeekdayOfMonth(year, month, startWeekday)
          : monthlyMode === "nth_weekday"
            ? getNthWeekdayOfMonth(year, month, startWeekday, startWeekOfMonth)
            : new Date(year, month, startDay);
      if (!candidate) continue;
      if (monthlyMode === "date" && candidate.getDate() !== startDay) {
        continue;
      }
      if (!addIfAllowed(candidate)) break;
    }
    return dates;
  }

  for (let offset = 0; dates.length < maxCount; offset += safeInterval) {
    const candidate = new Date(
      start.getFullYear() + offset,
      start.getMonth(),
      start.getDate(),
    );
    if (!addIfAllowed(candidate)) break;
  }

  return dates;
}

function getWeekOfMonth(date: Date) {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

function getNthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  weekOfMonth: number,
) {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const candidate = new Date(year, month, 1 + offset + (weekOfMonth - 1) * 7);
  return candidate.getMonth() === ((month % 12) + 12) % 12 ? candidate : null;
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number) {
  const last = new Date(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return new Date(year, month + 1, -offset);
}

function buildRepeatPresetOptions(startLocal: string) {
  const start = new Date(startLocal);
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const weekday = weekdayLabels[safeStart.getDay()];
  const monthDay = safeStart.getDate();
  const weekOfMonth = getWeekOfMonth(safeStart);
  const monthDayText = `${monthDay}일`;
  const weekdayInMonthText = `${weekOfMonth}번째 ${weekday}`;

  return [
    { value: "daily" as const, title: "매일", detail: "" },
    { value: "weekday" as const, title: "매주 평일", detail: "월-금" },
    { value: "weekly" as const, title: "매주", detail: weekday },
    { value: "biweekly" as const, title: "2주마다", detail: weekday },
    { value: "monthly_date" as const, title: "매월", detail: monthDayText },
    {
      value: "monthly_weekday" as const,
      title: "매월",
      detail: weekdayInMonthText,
    },
    {
      value: "monthly_last_weekday" as const,
      title: "매월",
      detail: `마지막 ${weekday}`,
    },
    {
      value: "yearly" as const,
      title: "매년",
      detail: safeStart.toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
      }),
    },
    { value: "custom" as const, title: "사용자 설정...", detail: "" },
  ];
}

function formFromSchedule(schedule: Schedule): ScheduleFormState {
  return {
    title: schedule.title,
    description: schedule.description ?? "",
    schedule_type: schedule.schedule_type,
    priority: schedule.priority ?? "medium",
    start_local: toLocalInputValue(schedule.start_datetime),
    end_local: toLocalInputValue(schedule.end_datetime),
    all_day: schedule.all_day,
    location: schedule.location ?? "",
    visibility: schedule.visibility,
    category_id: schedule.category_id ?? "",
  };
}

function emptyFormForDate(date: Date): ScheduleFormState {
  const hasExplicitTime =
    date.getHours() !== 0 ||
    date.getMinutes() !== 0 ||
    date.getSeconds() !== 0 ||
    date.getMilliseconds() !== 0;
  const endDate = addMinutes(date, 60);

  return {
    title: "",
    description: "",
    schedule_type: "personal",
    priority: "medium",
    start_local: hasExplicitTime
      ? dateAtLocalTime(date, date.getHours(), date.getMinutes())
      : dateAtLocalTime(date, 9),
    end_local: hasExplicitTime
      ? dateAtLocalTime(endDate, endDate.getHours(), endDate.getMinutes())
      : dateAtLocalTime(date, 10),
    all_day: false,
    location: "",
    visibility: "private",
    category_id: "",
  };
}

function toPayload(form: ScheduleFormState) {
  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    schedule_type: form.schedule_type,
    priority: form.priority,
    start_datetime: fromLocalInputValue(form.start_local),
    end_datetime: form.end_local
      ? fromLocalInputValue(form.end_local)
      : undefined,
    all_day: form.all_day,
    location: form.location.trim() || undefined,
    visibility: form.visibility,
    category_id: form.category_id === "" ? undefined : String(form.category_id),
  };
}

function scheduleFormSignature(form: ScheduleFormState) {
  return JSON.stringify(toPayload(form));
}

function validateForm(form: ScheduleFormState): string | null {
  if (!form.title.trim()) return "일정 제목을 입력해 주세요.";
  if (!form.start_local) return "시작 일시를 선택해 주세요.";

  const start = new Date(form.start_local).getTime();
  if (Number.isNaN(start)) return "시작 일시가 올바르지 않습니다.";

  if (form.end_local) {
    const end = new Date(form.end_local).getTime();
    if (Number.isNaN(end)) return "종료 일시가 올바르지 않습니다.";
    if (end <= start) return "종료 일시는 시작 일시보다 늦어야 합니다.";
  }

  return null;
}

function formatTaskDue(iso?: string | null) {
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

function LinkedTaskRow({
  task,
  completing,
  onComplete,
}: {
  task: Task;
  completing?: boolean;
  onComplete: () => void;
}) {
  const isDone = task.status === "done";
  const classificationSettings = useClassificationSettings();

  return (
    <li className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={isDone || completing}
          onClick={onComplete}
          aria-label={isDone ? "완료됨" : "완료 처리"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            isDone
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 bg-white hover:border-emerald-500"
          } disabled:opacity-60`}
        >
          {isDone ? "✓" : null}
        </button>
        <div className="min-w-0 flex-1">
          <Link
            to={`/tasks?${new URLSearchParams({ task_id: String(task.task_id) })}`}
            className={`block truncate text-sm font-medium hover:text-emerald-700 ${
              isDone ? "text-slate-400 line-through" : "text-slate-900"
            }`}
          >
            {task.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{formatTaskDue(task.due_datetime)}</span>
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
                taskPriorityBadge[task.priority] ?? taskPriorityBadge.medium
              }`}
            >
              {getClassificationLabel(
                classificationSettings,
                "taskPriorities",
                task.priority,
              )}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

function LinkedScheduleTasks({ schedule }: { schedule: Schedule }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState<string | null>(null);
  const tasksQuery = useTasks({
    schedule_id: schedule.schedule_id,
  });
  const createTask = useCreateTask();
  const completeTask = useCompleteTask();
  const classificationSettings = useClassificationSettings();
  const priorityOptions = getClassificationOptions(
    classificationSettings,
    "taskPriorities",
    { enabledOnly: true, include: priority, defaultOnly: true },
  );
  const tasks = useMemo(
    () =>
      [...(tasksQuery.data ?? [])].sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        const aDue = a.due_datetime
          ? new Date(a.due_datetime).getTime()
          : Infinity;
        const bDue = b.due_datetime
          ? new Date(b.due_datetime).getTime()
          : Infinity;
        return aDue - bDue;
      }),
    [tasksQuery.data],
  );

  const handleAdd = async () => {
    const trimmed = title.trim();
    setError(null);
    if (!trimmed) {
      setError("할 일 제목을 입력해 주세요.");
      return;
    }

    try {
      await createTask.mutateAsync({
        title: trimmed,
        status: "todo",
        priority,
        schedule_id: schedule.schedule_id,
        due_datetime: schedule.end_datetime ?? schedule.start_datetime,
        category_id: undefined,
      });
      setTitle("");
      setPriority("medium");
    } catch (err) {
      setError(getErrorMessage(err, "연결된 할 일 추가에 실패했습니다."));
    }
  };

  const handleComplete = async (taskId: number) => {
    setError(null);
    try {
      await completeTask.mutateAsync(taskId);
    } catch (err) {
      setError(getErrorMessage(err, "완료 처리에 실패했습니다."));
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CheckSquare2 className="h-4 w-4 text-emerald-600" />
            연결된 할 일
          </div>
          <p className="mt-1 text-xs text-slate-500">
            이 일정에서 바로 실행 항목을 만들고 완료할 수 있습니다.
          </p>
        </div>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
          {tasks.length}건
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleAdd();
            }
          }}
          placeholder="이 일정에서 해야 할 일"
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        />
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as TaskPriority)
            }
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          >
            {priorityOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={createTask.isPending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {createTask.isPending ? "추가 중..." : "할 일 추가"}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div className="mt-3">
        {tasksQuery.isLoading ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-xs text-slate-500">
            연결된 할 일을 불러오는 중...
          </div>
        ) : tasksQuery.isError ? (
          <div className="rounded-lg border border-red-200 bg-white px-3 py-3 text-xs text-red-700">
            {(tasksQuery.error as Error).message}
          </div>
        ) : tasks.length > 0 ? (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <LinkedTaskRow
                key={task.task_id}
                task={task}
                completing={completeTask.isPending}
                onComplete={() => handleComplete(task.task_id)}
              />
            ))}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-xs text-slate-500">
            아직 연결된 할 일이 없습니다.
          </div>
        )}
      </div>
    </section>
  );
}

function InlineFilterGroup<TValue extends FilterOptionValue>({
  label,
  selectedValues,
  options,
  visibleCount = 4,
  onClear,
  onToggle,
}: {
  label: string;
  selectedValues: TValue[];
  options: InlineFilterOption<TValue>[];
  visibleCount?: number;
  onClear: () => void;
  onToggle: (value: TValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(
    () => new Set<FilterOptionValue>(selectedValues),
    [selectedValues],
  );
  const visibleOptions = options.slice(0, visibleCount);
  const moreOptions = options.slice(visibleCount);

  const optionButtonClass = (selected: boolean) =>
    `h-8 shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-semibold transition ${
      selected
        ? "bg-emerald-600 text-white shadow-sm"
        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
    }`;

  return (
    <div>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="relative mt-1">
        <div className="flex h-10 min-w-0 items-center gap-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onClear();
            }}
            className={`h-8 shrink-0 whitespace-nowrap rounded-md px-2 text-xs font-semibold transition ${
              selectedValues.length === 0
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            전체
          </button>
          {visibleOptions.map((option) => {
            const selected = selectedSet.has(option.value);
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onToggle(option.value)}
                className={optionButtonClass(selected)}
                title={option.label}
              >
                {option.label}
              </button>
            );
          })}
          {moreOptions.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className={`ml-auto inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold transition ${
                moreOptions.some((option) => selectedSet.has(option.value))
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
              aria-expanded={open}
            >
              더보기
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {open && moreOptions.length > 0 && (
          <div className="absolute right-0 top-11 z-30 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-xl shadow-slate-200">
            <div className="max-h-64 overflow-y-auto">
              {moreOptions.map((option) => {
                const selected = selectedSet.has(option.value);
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onToggle(option.value)}
                    className={`flex h-9 w-full items-center justify-between gap-2 rounded-md px-3 text-left text-xs font-semibold transition ${
                      selected
                        ? "bg-emerald-600 text-white"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                    title={option.label}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected && <span className="shrink-0">선택됨</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleFormPanel({
  mode,
  initial,
  schedule,
  isPending,
  onClose,
  onDelete,
  deletePending,
  onSubmit,
}: {
  mode: "create" | "edit" | "repeat";
  initial: ScheduleFormState;
  schedule?: Schedule | null;
  isPending?: boolean;
  onClose: () => void;
  onDelete?: () => Promise<void> | void;
  deletePending?: boolean;
  onSubmit: (
    forms: ScheduleFormState[],
    options?: ScheduleFormSubmitOptions,
  ) => Promise<void> | void;
}) {
  const [form, setForm] = useState(initial);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const onSubmitRef = useRef(onSubmit);
  const lastAutoSaveSignatureRef = useRef(scheduleFormSignature(initial));
  const autoSaveSequenceRef = useRef(0);
  const syncingInitialSignatureRef = useRef<string | null>(null);
  const initialSignature = scheduleFormSignature(initial);
  const [selectedDates, setSelectedDates] = useState<string[]>([
    initial.start_local.slice(0, 10),
  ]);
  const [selectedDateMonth, setSelectedDateMonth] = useState(() => {
    const date = new Date(initial.start_local);
    return Number.isNaN(date.getTime())
      ? new Date()
      : new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [repeatStartDate, setRepeatStartDate] = useState(
    initial.start_local.slice(0, 10),
  );
  const [repeatEndDate, setRepeatEndDate] = useState(
    initial.start_local.slice(0, 10),
  );
  const [repeatDays, setRepeatDays] = useState<number[]>([
    new Date(initial.start_local).getDay(),
  ]);
  const [repeatPresetOpen, setRepeatPresetOpen] = useState(false);
  const [repeatEnabled, setRepeatEnabled] = useState(mode === "repeat");
  const [repeatPreset, setRepeatPreset] = useState<RepeatPreset>("weekly");
  const [repeatInterval, setRepeatInterval] = useState(1);
  const [repeatUnit, setRepeatUnit] = useState<RepeatFrequencyUnit>("week");
  const [repeatMonthlyMode, setRepeatMonthlyMode] =
    useState<RepeatMonthlyMode>("date");
  const [repeatEndMode, setRepeatEndMode] = useState<RepeatEndMode>("never");
  const [repeatOccurrenceCount, setRepeatOccurrenceCount] = useState(4);
  const classificationSettings = useClassificationSettings();
  const scheduleTypeOptions = getClassificationOptions(
    classificationSettings,
    "scheduleTypes",
    { enabledOnly: true, include: form.schedule_type, defaultOnly: true },
  );
  const priorityOptions = getClassificationOptions(
    classificationSettings,
    "taskPriorities",
    { enabledOnly: true, include: form.priority, defaultOnly: true },
  );
  const repeatPreviewDates = useMemo(
    () =>
      buildRepeatDateKeys({
        startDate: repeatStartDate,
        interval: repeatInterval,
        unit: repeatUnit,
        weekdays: repeatDays,
        monthlyMode: repeatMonthlyMode,
        endMode: repeatEndMode,
        endDate: repeatEndDate,
        occurrenceCount: repeatOccurrenceCount,
      }),
    [
      repeatEndDate,
      repeatDays,
      repeatEndMode,
      repeatInterval,
      repeatMonthlyMode,
      repeatOccurrenceCount,
      repeatStartDate,
      repeatUnit,
    ],
  );
  const repeatPresetOptions = useMemo(
    () =>
      buildRepeatPresetOptions(
        dateKeyToLocalInput(repeatStartDate, form.start_local),
      ),
    [form.start_local, repeatStartDate],
  );
  const selectedRepeatPreset =
    repeatPresetOptions.find((option) => option.value === repeatPreset) ??
    repeatPresetOptions[2];
  const isRepeatMode =
    mode === "repeat" ||
    ((mode === "create" || mode === "edit") && repeatEnabled);
  const selectedDateCells = useMemo(
    () => buildMonthCells(selectedDateMonth),
    [selectedDateMonth],
  );
  const targetDateKeys = isRepeatMode
    ? repeatPreviewDates
    : mode === "create"
      ? normalizeDateKeys(selectedDates)
      : [form.start_local.slice(0, 10)];
  const targetDateSet = useMemo(
    () => new Set(targetDateKeys),
    [targetDateKeys],
  );
  const previewForms =
    mode === "create" || isRepeatMode
      ? buildFormsForDateKeys(form, targetDateKeys)
      : [form];
  const autoSaveSignature = useMemo(
    () => scheduleFormSignature(form),
    [form],
  );

  useEffect(() => {
    syncingInitialSignatureRef.current = initialSignature;
    setForm(initial);
    setSelectedDates([initial.start_local.slice(0, 10)]);
    setRepeatStartDate(initial.start_local.slice(0, 10));
    setRepeatEndDate(initial.start_local.slice(0, 10));
    setRepeatDays([new Date(initial.start_local).getDay()]);
    lastAutoSaveSignatureRef.current = initialSignature;
    setAutoSaveState("idle");
    setError(null);
  }, [initialSignature]);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

  useEffect(() => {
    if (mode !== "edit" || !schedule) return;

    if (syncingInitialSignatureRef.current) {
      if (autoSaveSignature === syncingInitialSignatureRef.current) {
        syncingInitialSignatureRef.current = null;
      }
      return;
    }

    if (autoSaveSignature === lastAutoSaveSignatureRef.current) {
      return;
    }

    const validationError = validateForm(form);
    if (validationError) {
      setAutoSaveState("error");
      setError(validationError);
      return;
    }

    setError(null);
    setAutoSaveState("saving");
    const sequence = autoSaveSequenceRef.current + 1;
    autoSaveSequenceRef.current = sequence;

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await onSubmitRef.current([form], { intent: "auto" });
          if (autoSaveSequenceRef.current !== sequence) return;
          lastAutoSaveSignatureRef.current = autoSaveSignature;
          setAutoSaveState("saved");
        } catch (err) {
          if (autoSaveSequenceRef.current !== sequence) return;
          setAutoSaveState("error");
          setError(getErrorMessage(err, "자동 저장에 실패했습니다."));
        }
      })();
    }, 700);

    return () => window.clearTimeout(timer);
  }, [autoSaveSignature, form, mode, schedule]);

  const moveSelectedDateMonth = (offset: number) => {
    setSelectedDateMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  };

  const toggleSelectedDate = (dateKey: string) => {
    setSelectedDates((prev) =>
      prev.includes(dateKey)
        ? prev.filter((item) => item !== dateKey)
        : normalizeDateKeys([...prev, dateKey]),
    );
  };

  const toggleRepeatDay = (day: number) => {
    setRepeatDays((prev) =>
      prev.includes(day)
        ? prev.filter((item) => item !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  };

  const applyRepeatPreset = (preset: RepeatPreset) => {
    const start = new Date(`${repeatStartDate}T00:00:00`);
    const startWeekday = Number.isNaN(start.getTime())
      ? new Date().getDay()
      : start.getDay();

    setRepeatPreset(preset);
    setRepeatPresetOpen(false);

    if (preset === "custom") return;

    if (preset === "daily") {
      setRepeatInterval(1);
      setRepeatUnit("day");
      setRepeatMonthlyMode("date");
      setRepeatDays([startWeekday]);
      return;
    }

    if (preset === "weekday") {
      setRepeatInterval(1);
      setRepeatUnit("week");
      setRepeatMonthlyMode("date");
      setRepeatDays([1, 2, 3, 4, 5]);
      return;
    }

    if (preset === "weekly" || preset === "biweekly") {
      setRepeatInterval(preset === "biweekly" ? 2 : 1);
      setRepeatUnit("week");
      setRepeatMonthlyMode("date");
      setRepeatDays([startWeekday]);
      return;
    }

    if (
      preset === "monthly_date" ||
      preset === "monthly_weekday" ||
      preset === "monthly_last_weekday"
    ) {
      setRepeatInterval(1);
      setRepeatUnit("month");
      setRepeatMonthlyMode(
        preset === "monthly_date"
          ? "date"
          : preset === "monthly_weekday"
            ? "nth_weekday"
            : "last_weekday",
      );
      setRepeatDays([startWeekday]);
      return;
    }

    setRepeatInterval(1);
    setRepeatUnit("year");
    setRepeatMonthlyMode("date");
    setRepeatDays([startWeekday]);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === "create" && !isRepeatMode && targetDateKeys.length === 0) {
      setError("추가할 날짜를 하나 이상 선택해 주세요.");
      return;
    }

    if (isRepeatMode && targetDateKeys.length === 0) {
      setError("반복 조건에 맞는 날짜가 없습니다.");
      return;
    }

    if ((mode === "create" || isRepeatMode) && targetDateKeys.length > 100) {
      setError("한 번에 추가할 수 있는 일정은 최대 100개입니다.");
      return;
    }

    for (const item of previewForms) {
      const validationError = validateForm(item);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    try {
      await onSubmit(previewForms, { intent: "manual" });
    } catch (err) {
      setError(getErrorMessage(err, "저장에 실패했습니다."));
    }
  };

  const handleApplyRepeat = async () => {
    setError(null);

    if (!isRepeatMode || targetDateKeys.length === 0) {
      setError("반복 조건에 맞는 날짜가 없습니다.");
      return;
    }
    if (targetDateKeys.length > 100) {
      setError("한 번에 추가할 수 있는 일정은 최대 100개입니다.");
      return;
    }

    for (const item of previewForms) {
      const validationError = validateForm(item);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    try {
      await onSubmit(previewForms, { intent: "repeat" });
      setAutoSaveState("saved");
    } catch (err) {
      setAutoSaveState("error");
      setError(getErrorMessage(err, "반복 일정 생성에 실패했습니다."));
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const confirmed = confirm(
      "정말 이 일정을 삭제할까요?\n삭제 후에는 되돌릴 수 없습니다.",
    );
    if (!confirmed) return;

    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(getErrorMessage(err, "삭제에 실패했습니다."));
    }
  };

  const updateStartLocal = (nextStartLocal: string) => {
    const nextDateKey = dateFromLocalInput(nextStartLocal);
    if (nextDateKey) {
      setRepeatStartDate(nextDateKey);
      setSelectedDateMonth(new Date(`${nextDateKey}T00:00:00`));
    }

    setForm((prev) => ({
      ...prev,
      start_local: nextStartLocal,
      end_local: endLocalAfterStartChange(
        nextStartLocal,
        prev.end_local,
        prev.start_local,
      ),
    }));
  };

  const updateEndLocal = (nextEndLocal: string) => {
    setForm((prev) => ({
      ...prev,
      end_local: nextEndLocal,
    }));
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-950/20 xl:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl xl:sticky xl:top-24 xl:z-0 xl:max-h-[calc(100vh-7rem)] xl:rounded-lg xl:border xl:shadow-sm xl:shadow-slate-200/60">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-emerald-50/45 px-5 py-4">
          <div>
            <p className="text-xs font-medium text-emerald-700">
              {mode === "edit"
                ? "일정 관리"
                : mode === "repeat"
                  ? "반복 일정"
                  : "새 일정"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              {mode === "edit"
                ? "일정 수정"
                : mode === "repeat"
                  ? "반복 일정 추가"
                  : "일정 추가"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto bg-slate-50/50 p-5"
        >
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">제목</span>
              <input
                type="text"
                required
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="일정 제목"
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            {isRepeatMode ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">
                    시작 시간
                  </span>
                  <input
                    type="time"
                    required
                    value={timeFromLocalInput(form.start_local)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        start_local: localInputWithTime(
                          form.start_local,
                          event.target.value,
                          repeatStartDate,
                        ),
                      })
                    }
                    className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">
                    종료 시간
                  </span>
                  <input
                    type="time"
                    value={timeFromLocalInput(form.end_local)}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        end_local: event.target.value
                          ? localInputWithTime(
                              form.end_local,
                              event.target.value,
                              repeatStartDate,
                            )
                          : "",
                      })
                    }
                    className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/50">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">
                      시작 날짜
                    </span>
                    <input
                      type="date"
                      required
                      value={dateFromLocalInput(form.start_local)}
                      onChange={(event) =>
                        updateStartLocal(
                          localInputWithDate(
                            form.start_local,
                            event.target.value,
                            "09:00",
                          ),
                        )
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">
                      종료 날짜
                    </span>
                    <input
                      type="date"
                      value={
                        dateFromLocalInput(form.end_local) ||
                        dateFromLocalInput(form.start_local)
                      }
                      onChange={(event) =>
                        updateEndLocal(
                          localInputWithDate(
                            form.end_local || form.start_local,
                            event.target.value,
                            timeFromLocalInput(form.end_local) ||
                              timeFromLocalInput(form.start_local) ||
                              "10:00",
                          ),
                        )
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>
                </div>

                <div
                  className={`mt-3 grid gap-3 sm:grid-cols-2 ${
                    form.all_day ? "opacity-50" : ""
                  }`}
                >
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">
                      시작 시간
                    </span>
                    <input
                      type="time"
                      required={!form.all_day}
                      disabled={form.all_day}
                      value={timeFromLocalInput(form.start_local)}
                      onChange={(event) =>
                        updateStartLocal(
                          localInputWithTime(
                            form.start_local,
                            event.target.value,
                            dateFromLocalInput(form.start_local),
                          ),
                        )
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">
                      종료 시간
                    </span>
                    <input
                      type="time"
                      disabled={form.all_day}
                      value={timeFromLocalInput(form.end_local)}
                      onChange={(event) =>
                        updateEndLocal(
                          event.target.value
                            ? localInputWithTime(
                                form.end_local || form.start_local,
                                event.target.value,
                                dateFromLocalInput(form.end_local) ||
                                  dateFromLocalInput(form.start_local),
                              )
                            : "",
                        )
                      }
                      className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
                    />
                  </label>
                </div>
              </div>
            )}

            <label className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm">
              <input
                type="checkbox"
                checked={form.all_day}
                onChange={(event) =>
                  setForm({ ...form, all_day: event.target.checked })
                }
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              종일 일정
            </label>

            {(mode === "create" || mode === "repeat" || mode === "edit") && (
              <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/50">
                {mode === "create" || mode === "edit" ? (
                  <label className="mb-3 block">
                    <span className="text-xs font-medium text-slate-600">
                      반복 설정
                    </span>
                    <select
                      value={repeatEnabled ? repeatPreset : "none"}
                      onChange={(event) => {
                        const nextPreset = event.target.value;
                        if (nextPreset === "none") {
                          setRepeatEnabled(false);
                          setRepeatPresetOpen(false);
                          return;
                        }
                        setRepeatEnabled(true);
                        applyRepeatPreset(nextPreset as RepeatPreset);
                      }}
                      className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="none">반복 안 함</option>
                      {repeatPresetOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {mode === "edit" && !isRepeatMode ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    반복 안 함으로 저장되어 있어요. 반복 설정을 선택하면 이 일정의
                    정보를 기준으로 반복 일정을 만들 수 있습니다.
                  </p>
                ) : !isRepeatMode ? (
                  <div className="space-y-3">
                    <div className="rounded-lg bg-slate-50/80 p-3 ring-1 ring-slate-200">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => moveSelectedDateMonth(-1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          aria-label="이전 달"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>
                        <div className="text-sm font-semibold text-slate-900">
                          {formatMonthTitle(selectedDateMonth)}
                        </div>
                        <button
                          type="button"
                          onClick={() => moveSelectedDateMonth(1)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          aria-label="다음 달"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-medium text-slate-500">
                        {weekdayLabels.map((label, index) => (
                          <span
                            key={`create-${label}-${index}`}
                            className={
                              index === 0
                                ? "text-rose-500"
                                : index === 6
                                  ? "text-sky-500"
                                  : undefined
                            }
                          >
                            {label}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 grid grid-cols-7 gap-1">
                        {selectedDateCells.map((day, index) => {
                          if (!day) {
                            return (
                              <div
                                key={`create-date-blank-${index}`}
                                className="aspect-square"
                              />
                            );
                          }

                          const dateKey = toDateKey(day);
                          const selected = targetDateSet.has(dateKey);

                          return (
                            <button
                              key={dateKey}
                              type="button"
                              onClick={() => toggleSelectedDate(dateKey)}
                              className={`aspect-square rounded-md text-sm font-medium transition ${
                                selected
                                  ? "bg-emerald-600 text-white shadow-sm"
                                  : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                              }`}
                              aria-pressed={selected}
                            >
                              {day.getDate()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">
                        선택 {targetDateKeys.length}개
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedDates([])}
                        disabled={targetDateKeys.length === 0}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                      >
                        선택 초기화
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() =>
                            setRepeatPresetOpen((current) => !current)
                          }
                          className="flex h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-medium text-slate-900 shadow-sm hover:bg-slate-50"
                        >
                          <span>
                            {selectedRepeatPreset.title}
                            {selectedRepeatPreset.detail ? (
                              <span className="ml-2 text-slate-500">
                                {selectedRepeatPreset.detail}
                              </span>
                            ) : null}
                          </span>
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        </button>
                        {repeatPresetOpen ? (
                          <div className="absolute left-0 right-0 top-12 z-20 rounded-lg border border-slate-200 bg-white p-2 shadow-xl shadow-slate-200">
                            {repeatPresetOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => applyRepeatPreset(option.value)}
                                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition ${
                                  repeatPreset === option.value
                                    ? "bg-emerald-600 text-white"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                                }`}
                              >
                                <span className="font-medium">
                                  {option.title}
                                </span>
                                {option.detail ? (
                                  <span
                                    className={
                                      repeatPreset === option.value
                                        ? "text-white/80"
                                        : "text-slate-400"
                                    }
                                  >
                                    {option.detail}
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="grid gap-3">
                          <label className="block min-w-0">
                            <span className="text-xs font-medium text-slate-600">
                              시작일
                            </span>
                            <input
                              type="date"
                              value={repeatStartDate}
                              onChange={(event) => {
                                const nextDate = event.target.value;
                                const next = new Date(`${nextDate}T00:00:00`);
                                setRepeatStartDate(nextDate);
                                if (
                                  repeatPreset !== "custom" &&
                                  repeatPreset !== "weekday" &&
                                  !Number.isNaN(next.getTime())
                                ) {
                                  setRepeatDays([next.getDay()]);
                                }
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                            />
                          </label>
                          <label className="block min-w-0">
                            <span className="text-xs font-medium text-slate-600">
                              반복 주기
                            </span>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              value={repeatInterval}
                              onChange={(event) => {
                                setRepeatPreset("custom");
                                setRepeatInterval(
                                  Math.max(1, Number(event.target.value) || 1),
                                );
                              }}
                              className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                            />
                          </label>
                          <label className="block min-w-0">
                            <span className="text-xs font-medium text-slate-600">
                              단위
                            </span>
                            <select
                              value={repeatUnit}
                              onChange={(event) => {
                                setRepeatPreset("custom");
                                setRepeatUnit(
                                  event.target.value as RepeatFrequencyUnit,
                                );
                              }}
                              className="mt-1 h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                            >
                              {Object.entries(repeatUnitLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        </div>

                        {repeatUnit === "week" ? (
                          <div className="mt-4">
                            <div className="text-xs font-medium text-slate-600">
                              반복 요일
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {repeatWeekdays.map((day) => (
                                <button
                                  key={day.value}
                                  type="button"
                                  onClick={() => {
                                    setRepeatPreset("custom");
                                    toggleRepeatDay(day.value);
                                  }}
                                  className={`h-8 min-w-8 rounded-full px-2 text-xs font-medium transition ${
                                    repeatDays.includes(day.value)
                                      ? "bg-emerald-600 text-white shadow-sm"
                                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  }`}
                                >
                                  {day.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {repeatUnit === "month" ? (
                          <label className="mt-4 block">
                            <span className="text-xs font-medium text-slate-600">
                              월간 방식
                            </span>
                            <select
                              value={repeatMonthlyMode}
                              onChange={(event) => {
                                setRepeatPreset("custom");
                                setRepeatMonthlyMode(
                                  event.target.value as RepeatMonthlyMode,
                                );
                              }}
                              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                            >
                              <option value="date">같은 날짜</option>
                              <option value="nth_weekday">n번째 요일</option>
                              <option value="last_weekday">마지막 요일</option>
                            </select>
                          </label>
                        ) : null}

                        <div className="mt-5 space-y-3">
                          <div className="text-xs font-medium text-slate-600">
                            종료
                          </div>
                          <label className="flex min-w-0 items-center gap-3 text-sm text-slate-700">
                            <input
                              type="radio"
                              checked={repeatEndMode === "never"}
                              onChange={() => setRepeatEndMode("never")}
                              className="h-4 w-4 accent-emerald-600"
                            />
                            종료 없음
                          </label>
                          <label className="flex min-w-0 items-center gap-3 text-sm text-slate-700">
                            <input
                              type="radio"
                              checked={repeatEndMode === "on"}
                              onChange={() => setRepeatEndMode("on")}
                              className="h-4 w-4 accent-emerald-600"
                            />
                            날짜 지정
                            <input
                              type="date"
                              value={repeatEndDate}
                              onChange={(event) =>
                                setRepeatEndDate(event.target.value)
                              }
                              disabled={repeatEndMode !== "on"}
                              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                            />
                          </label>
                          <label className="flex min-w-0 items-center gap-3 text-sm text-slate-700">
                            <input
                              type="radio"
                              checked={repeatEndMode === "after"}
                              onChange={() => setRepeatEndMode("after")}
                              className="h-4 w-4 accent-emerald-600"
                            />
                            횟수 지정
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={repeatOccurrenceCount}
                              onChange={(event) =>
                                setRepeatOccurrenceCount(
                                  Math.max(1, Number(event.target.value) || 1),
                                )
                              }
                              disabled={repeatEndMode !== "after"}
                              className="h-10 w-20 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                            />
                            <span className="text-slate-400">회</span>
                          </label>
                        </div>
                      </div>
                      {mode === "edit" ? (
                        <button
                          type="button"
                          onClick={handleApplyRepeat}
                          disabled={isPending || targetDateKeys.length <= 1}
                          className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isPending
                            ? "반복 일정 생성 중..."
                            : `반복 일정 만들기 (${Math.max(0, targetDateKeys.length - 1)}개 추가)`}
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  일정 유형
                </span>
                <select
                  value={form.schedule_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      schedule_type: event.target.value as ScheduleType,
                    })
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {scheduleTypeOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  우선순위
                </span>
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      priority: event.target.value as TaskPriority,
                    })
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                >
                  {priorityOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">장소</span>
                <div className="relative mt-1">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={form.location}
                    onChange={(event) =>
                      setForm({ ...form, location: event.target.value })
                    }
                    placeholder="회의실, 카페, 고객사 등"
                    className="h-11 w-full rounded-lg border border-slate-200 px-9 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </label>

              <div>
                <span className="text-xs font-medium text-slate-600">
                  카테고리
                </span>
                <CategorySelect
                  type="schedule"
                  value={form.category_id}
                  onChange={(value) => setForm({ ...form, category_id: value })}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setDetailsOpen((open) => !open)}
                className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50"
              >
                상세 설정
                <span className="text-xs text-slate-400">
                  {detailsOpen ? "접기" : "열기"}
                </span>
              </button>

              {detailsOpen && (
                <div className="space-y-4 border-t border-slate-200 p-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">
                      설명
                    </span>
                    <textarea
                      rows={3}
                      value={form.description}
                      onChange={(event) =>
                        setForm({ ...form, description: event.target.value })
                      }
                      placeholder="상세 설명"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">
                      공개 여부
                    </span>
                    <select
                      value={form.visibility}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          visibility: event.target.value as ScheduleVisibility,
                        })
                      }
                      className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    >
                      {Object.entries(SCHEDULE_VISIBILITY_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {mode === "edit" && schedule && (
              <LinkedScheduleTasks schedule={schedule} />
            )}
          </div>
        </form>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white p-4">
          {mode === "edit" && schedule && onDelete ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deletePending}
              className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
            >
              {deletePending ? "삭제 중..." : "삭제"}
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center justify-end gap-2">
            {mode === "edit" ? (
              <span
                className={`mr-auto text-xs font-medium ${
                  autoSaveState === "error"
                    ? "text-red-600"
                    : autoSaveState === "saving"
                      ? "text-amber-600"
                      : "text-slate-500"
                }`}
              >
                {autoSaveState === "saving"
                  ? "자동 저장 중..."
                  : autoSaveState === "error"
                    ? "자동 저장 실패"
                    : autoSaveState === "saved"
                      ? "자동 저장됨"
                      : "변경 시 자동 저장"}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              취소
            </button>
            {mode !== "edit" ? (
              <button
                type="submit"
                disabled={isPending}
                onClick={(event) => {
                  const formEl = event.currentTarget
                    .closest("aside")
                    ?.querySelector("form");
                  formEl?.requestSubmit();
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {isPending ? "저장 중..." : "추가"}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}

function MiniCalendar({
  calendarView,
  visibleMonth,
  selectedKey,
  dateMeta,
  monthCells,
  weekDates,
  onMoveMonth,
  onSelectDate,
  onSetCalendarView,
}: {
  calendarView: "month" | "week";
  visibleMonth: Date;
  selectedKey: string;
  dateMeta: Map<string, DayMeta>;
  monthCells: Array<Date | null>;
  weekDates: Date[];
  onMoveMonth: (offset: number) => void;
  onSelectDate: (date: Date) => void;
  onSetCalendarView: (view: "month" | "week") => void;
}) {
  const renderMarker = (meta?: DayMeta, selected?: boolean) => {
    if (!meta || meta.count === 0) return null;
    const dotClass = selected
      ? "bg-white"
      : meta.hasDeadline
        ? "bg-rose-500"
        : "bg-teal-500";

    return (
      <span className="pointer-events-none absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {meta.count > 1 ? (
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        ) : null}
      </span>
    );
  };

  return (
    <aside className="rounded-lg border border-slate-200/80 bg-white/95 p-4 shadow-sm shadow-slate-200/60 xl:sticky xl:top-0 xl:self-start">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMoveMonth(-1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Calendar
          </p>
          <p className="mt-0.5 text-base font-semibold text-slate-950">
            {formatMonthTitle(visibleMonth)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onMoveMonth(1)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-emerald-50 hover:text-emerald-700"
          aria-label="다음 달"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 rounded-lg bg-slate-100/80 p-1 text-xs">
        {(["month", "week"] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => onSetCalendarView(view)}
            className={`h-8 rounded-md font-semibold transition ${
              calendarView === view
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {view === "month" ? "월간" : "주간"}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {calendarView === "month" ? (
          <>
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400">
              {weekdayLabels.map((label, index) => (
                <span
                  key={label}
                  className={
                    index === 0
                      ? "text-rose-500"
                      : index === 6
                        ? "text-sky-500"
                        : undefined
                  }
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {monthCells.map((day, index) => {
                if (!day)
                  return <div key={`blank-${index}`} className="h-10" />;
                const key = toDateKey(day);
                const selected = key === selectedKey;
                const meta = dateMeta.get(key);
                const today = isToday(day);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectDate(day)}
                    className={`relative h-10 rounded-lg text-sm font-semibold transition ${
                      selected
                        ? "bg-emerald-600 text-white shadow-sm shadow-emerald-200"
                        : meta
                          ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100 hover:bg-emerald-100"
                          : today
                            ? "bg-slate-100 text-slate-950 ring-1 ring-slate-200 hover:bg-slate-200"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                    aria-label={`${formatCompactDate(day)} 일정 ${meta?.count ?? 0}건`}
                  >
                    {day.getDate()}
                    {renderMarker(meta, selected)}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {weekDates.map((day) => {
              const key = toDateKey(day);
              const selected = key === selectedKey;
              const meta = dateMeta.get(key);
              const today = isToday(day);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDate(day)}
                  className={`relative flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition ${
                    selected
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                      : today
                        ? "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="font-semibold">
                    {weekdayLabels[day.getDay()]}
                  </span>
                  <span className="flex items-center gap-2">
                    {meta?.count ? (
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[11px] ${
                          selected
                            ? "bg-white/15 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {meta.count}
                      </span>
                    ) : null}
                    <span className="text-base font-semibold">
                      {day.getDate()}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function TimelineItem({
  schedule,
  highlighted,
  selectable,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  deleting,
}: {
  schedule: Schedule;
  highlighted?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const { data: categories = [] } = useCategories("schedule");
  const classificationSettings = useClassificationSettings();
  const category = categories.find(
    (c) => c.category_id === schedule.category_id,
  );
  const accentColor =
    category?.color ??
    (schedule.schedule_type === "deadline" ? "#f43f5e" : "#10b981");

  return (
    <li
      id={`schedule-${schedule.schedule_id}`}
      className={`group relative overflow-hidden rounded-lg border bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:border-emerald-200 hover:shadow-md ${
        highlighted
          ? "border-emerald-300 ring-2 ring-emerald-100"
          : "border-slate-200"
      }`}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <div className="flex items-start gap-4 pl-1">
        {selectable && (
          <label className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              aria-label={`${schedule.title} 선택`}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
          </label>
        )}

        <div className="w-20 shrink-0 text-xs font-medium text-slate-500">
          {schedule.all_day ? (
            <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
              종일
            </span>
          ) : (
            <>
              <p className="text-sm font-semibold text-slate-950">
                {formatTime(schedule.start_datetime)}
              </p>
              {schedule.end_datetime && (
                <p className="mt-1">{formatTime(schedule.end_datetime)}</p>
              )}
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={`truncate text-sm font-semibold ${
                schedule.is_completed
                  ? "text-slate-400 line-through"
                  : "text-slate-950"
              }`}
            >
              {schedule.title}
            </h3>
            {schedule.is_completed && (
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                완료
              </span>
            )}
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
              {getClassificationLabel(
                classificationSettings,
                "scheduleTypes",
                schedule.schedule_type,
              )}
            </span>
            {schedule.priority && (
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                  taskPriorityBadge[schedule.priority] ??
                  taskPriorityBadge.medium
                }`}
              >
                {getClassificationLabel(
                  classificationSettings,
                  "taskPriorities",
                  schedule.priority,
                )}
              </span>
            )}
            {category && (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                <CategoryDot color={category.color} />
                {category.name}
              </span>
            )}
          </div>

          {(schedule.location || schedule.description) && (
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              {schedule.location && (
                <p className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {schedule.location}
                </p>
              )}
              {schedule.description && (
                <p className="whitespace-pre-wrap leading-5">
                  {schedule.description}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            aria-label="수정"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label="삭제"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}

function SchedulePreviewButton({
  schedule,
  onOpen,
  categoryColors,
  muted = false,
}: {
  schedule: Schedule;
  onOpen: () => void;
  categoryColors: Map<number, string>;
  muted?: boolean;
}) {
  const color = scheduleAccentColor(schedule, categoryColors);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className={`flex min-h-6 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition hover:brightness-95 hover:ring-1 hover:ring-emerald-200 ${
        schedule.is_completed ? "opacity-70" : ""
      } ${muted ? "opacity-60" : ""}`}
      style={{
        backgroundColor: colorWithAlpha(color, "18"),
        color,
        boxShadow: `inset 3px 0 0 ${color}`,
      }}
    >
      <span className="shrink-0 font-medium">
        {schedule.all_day ? "종일" : formatTime(schedule.start_datetime)}
      </span>
      <span className="truncate">{schedule.title}</span>
    </button>
  );
}

function MonthSchedulePreview({
  schedule,
  categoryColors,
  active,
  muted = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  schedule: Schedule;
  categoryColors: Map<number, string>;
  active?: boolean;
  muted?: boolean;
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    kind: WeekScheduleInteractionKind,
  ) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
}) {
  const color = scheduleAccentColor(schedule, categoryColors);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${schedule.title} 일정 이동`}
      onPointerDown={(event) => onPointerDown(event, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={`relative flex min-h-6 w-full min-w-0 touch-none cursor-grab items-center gap-2 overflow-hidden rounded-lg px-2 py-1 text-left text-xs transition hover:brightness-95 active:cursor-grabbing ${
        schedule.is_completed ? "opacity-70" : ""
      } ${muted ? "opacity-60" : ""} ${
        active ? "ring-2 ring-emerald-400 ring-offset-1" : "hover:ring-1 hover:ring-emerald-200"
      }`}
      style={{
        backgroundColor: colorWithAlpha(color, "18"),
        color,
        boxShadow: `inset 3px 0 0 ${color}`,
      }}
    >
      <span
        role="presentation"
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
        onPointerDown={(event) => onPointerDown(event, "resize-left")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <span
        role="presentation"
        className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize"
        onPointerDown={(event) => onPointerDown(event, "resize-right")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
      <span className="shrink-0 font-medium">
        {schedule.all_day ? "종일" : formatTime(schedule.start_datetime)}
      </span>
      <span className="truncate">{schedule.title}</span>
    </div>
  );
}

function MonthScheduleGrid({
  cells,
  schedulesByDate,
  selectedKey,
  categoryColors,
  activeScheduleId,
  onOpenDay,
  onOpenSchedule,
  onCreateDay,
  onScheduleTimeChange,
}: {
  cells: MonthCalendarCell[];
  schedulesByDate: Map<string, Schedule[]>;
  selectedKey: string;
  categoryColors: Map<number, string>;
  activeScheduleId?: number | null;
  onOpenDay: (date: Date) => void;
  onOpenSchedule: (schedule: Schedule) => void;
  onCreateDay: (date: Date) => void;
  onScheduleTimeChange: ScheduleTimeChangeHandler;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] =
    useState<WeekScheduleInteraction | null>(null);
  const rowCount = Math.max(1, Math.ceil(cells.length / 7));

  const beginMonthInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    kind: WeekScheduleInteractionKind,
    schedule: Schedule,
  ) => {
    const grid = gridRef.current;
    if (!grid) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const { start, end } = scheduleDateRange(schedule);
    setInteraction({
      kind,
      schedule,
      scheduleId: schedule.schedule_id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      previewOffsetX: 0,
      previewOffsetY: 0,
      originalStart: start,
      originalEnd: end,
      start,
      end,
      gridRect: grid.getBoundingClientRect(),
    });
  };

  const updateMonthInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const columnWidth = interaction.gridRect.width / 7;
    const rowHeight = interaction.gridRect.height / rowCount;
    const dayDelta =
      Math.round((event.clientX - interaction.startClientX) / columnWidth) +
      Math.round((event.clientY - interaction.startClientY) / rowHeight) * 7;
    const minDurationMs = minTimedScheduleMinutes * 60 * 1000;

    let start = interaction.start;
    let end = interaction.end;

    if (interaction.kind === "move") {
      start = addDays(interaction.originalStart, dayDelta);
      end = addDays(interaction.originalEnd, dayDelta);
    } else if (interaction.kind === "resize-left") {
      const nextStart = addDays(interaction.originalStart, dayDelta);
      const maxStart = new Date(interaction.originalEnd.getTime() - minDurationMs);
      start = nextStart > maxStart ? maxStart : nextStart;
      end = interaction.originalEnd;
    } else {
      const nextEnd = addDays(interaction.originalEnd, dayDelta);
      const minEnd = new Date(interaction.originalStart.getTime() + minDurationMs);
      start = interaction.originalStart;
      end = nextEnd < minEnd ? minEnd : nextEnd;
    }

    setInteraction((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, start, end }
        : current,
    );
  };

  const endMonthInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const changed =
      interaction.start.getTime() !== interaction.originalStart.getTime() ||
      interaction.end.getTime() !== interaction.originalEnd.getTime();
    const shouldOpen =
      !changed &&
      interaction.kind === "move" &&
      Math.abs(event.clientX - interaction.startClientX) < 4 &&
      Math.abs(event.clientY - interaction.startClientY) < 4;
    const finishedInteraction = interaction;

    setInteraction(null);

    if (shouldOpen) {
      onOpenSchedule(finishedInteraction.schedule);
      return;
    }

    if (changed) {
      const nextDurationMs =
        finishedInteraction.end.getTime() - finishedInteraction.start.getTime();
      const nextAllDay = finishedInteraction.schedule.all_day
        ? nextDurationMs >= allDayLikeThresholdMs
        : finishedInteraction.schedule.all_day;
      const changeOptions = { allDay: nextAllDay };

      void onScheduleTimeChange(
        finishedInteraction.schedule,
        finishedInteraction.start,
        finishedInteraction.end,
        changeOptions,
      );
      onOpenSchedule(
        scheduleWithDraftTime(
          finishedInteraction.schedule,
          finishedInteraction.start,
          finishedInteraction.end,
          changeOptions,
        ),
      );
    }
  };

  return (
    <div className="overflow-hidden bg-white">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 text-center text-xs font-medium text-slate-500">
        {weekdayLabels.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className={`py-3 ${
              index === 0 ? "text-rose-500" : index === 6 ? "text-sky-500" : ""
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div ref={gridRef} className="grid grid-cols-7">
        {cells.map(({ date: day, currentMonth }, index) => {
          const key = toDateKey(day);
          const schedules = schedulesByDate.get(key) ?? [];
          const selected = key === selectedKey;
          const today = isToday(day);
          const visibleSchedules = schedules.slice(0, 4);
          const hiddenCount = Math.max(
            0,
            schedules.length - visibleSchedules.length,
          );

          return (
            <div
              key={key}
              onClick={() => onOpenDay(day)}
              className={`group min-h-[144px] cursor-pointer border-b border-r border-slate-100 p-2.5 transition hover:bg-emerald-50/40 sm:p-3 ${
                (index + 1) % 7 === 0 ? "border-r-0" : ""
              } ${currentMonth ? "bg-white" : "bg-slate-50/70 text-slate-300"} ${
                selected
                  ? "bg-emerald-50 ring-2 ring-inset ring-emerald-400"
                  : ""
              }`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDay(day);
                }}
                className={`ml-auto flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold transition ${
                  selected
                    ? "bg-emerald-600 text-white"
                    : today
                      ? "bg-emerald-600 text-white"
                      : currentMonth
                        ? "text-slate-800 hover:bg-slate-100"
                        : "text-slate-300 hover:bg-slate-100"
                }`}
              >
                {day.getDate()}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onCreateDay(day);
                }}
                className="mt-2 inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 opacity-100 transition hover:bg-emerald-50 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Plus className="h-3.5 w-3.5" />
                일정
              </button>
              <div className="mt-2 space-y-1.5">
                {visibleSchedules.map((schedule) => (
                  <MonthSchedulePreview
                    key={schedule.schedule_id}
                    schedule={schedule}
                    categoryColors={categoryColors}
                    active={
                      activeScheduleId === schedule.schedule_id ||
                      interaction?.scheduleId === schedule.schedule_id
                    }
                    muted={!currentMonth}
                    onPointerDown={(event, kind) =>
                      beginMonthInteraction(event, kind, schedule)
                    }
                    onPointerMove={updateMonthInteraction}
                    onPointerUp={endMonthInteraction}
                    onPointerCancel={() => setInteraction(null)}
                  />
                ))}
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDay(day);
                    }}
                    className="w-full rounded-lg px-2 py-1 text-left text-xs font-semibold text-slate-500 transition hover:bg-white hover:text-slate-800"
                  >
                    + {hiddenCount} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const weekHourHeight = 48;
const weekTimeColumnWidth = 64;
const weekHours = Array.from({ length: 24 }, (_, hour) => hour);
const weekSnapMinutes = 15;
const minTimedScheduleMinutes = 30;
const allDayLikeThresholdMs = 24 * 60 * 60 * 1000;

type WeekScheduleInteractionKind = "move" | "resize-left" | "resize-right";
type WeekScheduleInteractionSurface = "time" | "all-day";

interface WeekScheduleDraft {
  scheduleId: number;
  start: Date;
  end: Date;
}

interface WeekScheduleInteraction extends WeekScheduleDraft {
  kind: WeekScheduleInteractionKind;
  surface?: WeekScheduleInteractionSurface;
  schedule: Schedule;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  previewOffsetX: number;
  previewOffsetY: number;
  settling?: boolean;
  originalStart: Date;
  originalEnd: Date;
  gridRect: DOMRect;
}

interface ScheduleBlockMetrics {
  left: number;
  width: number;
  top: number;
  height: number;
}

interface TimedScheduleLayout {
  schedule: Schedule;
  start: Date;
  end: Date;
  metrics: ScheduleBlockMetrics;
  lane: number;
  laneCount: number;
}

interface AllDayScheduleLayout {
  schedule: Schedule;
  startIndex: number;
  endIndex: number;
  lane: number;
  laneCount: number;
}

interface OptimisticScheduleTime {
  start: string;
  end: string;
  allDay?: boolean;
}

interface ScheduleTimeChangeOptions {
  allDay?: boolean;
}

type ScheduleTimeChangeHandler = (
  schedule: Schedule,
  start: Date,
  end: Date,
  options?: ScheduleTimeChangeOptions,
) => Promise<void> | void;

function scheduleWithDraftTime(
  schedule: Schedule,
  start: Date,
  end: Date,
  options?: ScheduleTimeChangeOptions,
): Schedule {
  return {
    ...schedule,
    start_datetime: toOffsetISOString(start),
    end_datetime: toOffsetISOString(end),
    all_day: options?.allDay ?? schedule.all_day,
  };
}

function formatHourLabel(hour: number) {
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${displayHour}시`;
}

function formatTimezoneLabel() {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes === 0
    ? `GMT${sign}${hours}`
    : `GMT${sign}${hours}:${pad(minutes)}`;
}

function colorWithAlpha(color: string, alphaHex: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alphaHex}`;
  return color;
}

function scheduleAccentColor(
  schedule: Schedule,
  categoryColors: Map<number, string>,
) {
  return (
    (schedule.category_id
      ? categoryColors.get(schedule.category_id)
      : undefined) ??
    (schedule.schedule_type === "deadline" ? "#f43f5e" : "#10b981")
  );
}

function weekdayToneClass(day: Date, selected = false) {
  if (isToday(day)) {
    return "bg-emerald-50/95 text-emerald-800 shadow-[inset_0_-2px_0_rgba(16,185,129,0.45)]";
  }
  if (day.getDay() === 0) {
    return selected
      ? "bg-rose-50/90 text-rose-700"
      : "bg-rose-50/45 text-rose-600";
  }
  if (day.getDay() === 6) {
    return selected
      ? "bg-sky-50/90 text-sky-700"
      : "bg-sky-50/45 text-sky-600";
  }
  return selected ? "bg-emerald-50/80 text-slate-950" : "text-slate-500";
}

function weekdayColumnClass(day: Date, selected = false) {
  if (isToday(day)) {
    return "bg-emerald-50/35 shadow-[inset_2px_0_0_rgba(16,185,129,0.18),inset_-2px_0_0_rgba(16,185,129,0.18)]";
  }
  if (selected) return "bg-emerald-50/20";
  if (day.getDay() === 0) return "bg-rose-50/20";
  if (day.getDay() === 6) return "bg-sky-50/20";
  return "";
}

function minutesFromStartOfDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getHours() * 60 + date.getMinutes();
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

function scheduleDurationMs(schedule: Schedule) {
  const { start, end } = scheduleDateRange(schedule);
  return end.getTime() - start.getTime();
}

function isAllDayLikeSchedule(schedule: Schedule) {
  return (
    schedule.all_day || scheduleDurationMs(schedule) >= allDayLikeThresholdMs
  );
}

function schedulePreviewTimeLabel(schedule: Schedule) {
  if (schedule.all_day) return "종일";
  return formatTime(schedule.start_datetime);
}

function dayBounds(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function scheduleOverlapsRange(schedule: Schedule, start: Date, end: Date) {
  const range = scheduleDateRange(schedule);
  return range.start <= end && range.end >= start;
}

function scheduleOverlapsDay(schedule: Schedule, date: Date) {
  const { start, end } = dayBounds(date);
  return scheduleOverlapsRange(schedule, start, end);
}

function dateRangeOverlapsDay(startDate: Date, endDate: Date, date: Date) {
  const { start, end } = dayBounds(date);
  return startDate <= end && endDate >= start;
}

function allDaySpanIndexesFromDates(
  startDate: Date,
  endDate: Date,
  weekDates: Date[],
) {
  const indexes = weekDates
    .map((day, index) =>
      dateRangeOverlapsDay(startDate, endDate, day) ? index : -1,
    )
    .filter((index) => index >= 0);

  if (indexes.length === 0) return null;

  return {
    startIndex: Math.min(...indexes),
    endIndex: Math.max(...indexes),
  };
}

function uniqueSchedulesFromMap(schedulesByDate: Map<string, Schedule[]>) {
  const byId = new Map<number, Schedule>();
  for (const schedules of schedulesByDate.values()) {
    for (const schedule of schedules) {
      byId.set(schedule.schedule_id, schedule);
    }
  }
  return [...byId.values()];
}

function minuteOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function snapToWeekGrid(minutes: number) {
  return Math.round(minutes / weekSnapMinutes) * weekSnapMinutes;
}

function addDays(date: Date, dayDelta: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + dayDelta);
  return next;
}

function addMinutes(date: Date, minuteDelta: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minuteDelta);
  return next;
}

function clampDate(date: Date, min: Date, max: Date) {
  if (date < min) return new Date(min);
  if (date > max) return new Date(max);
  return date;
}

function scheduleBlockStyleFromDates(
  startDate: Date,
  endDate: Date,
  weekDates: Date[],
): CSSProperties {
  const metrics = scheduleBlockMetricsFromDates(startDate, endDate, weekDates);
  if (!metrics) return {};

  return scheduleBlockStyleFromMetrics(metrics);
}

function scheduleBlockStyleFromMetrics(
  metrics: ScheduleBlockMetrics,
  lane = 0,
  laneCount = 1,
): CSSProperties {
  const safeLaneCount = Math.max(1, laneCount);
  const laneWidth = metrics.width / safeLaneCount;
  const laneLeft = metrics.left + laneWidth * lane;
  const sideInset = safeLaneCount > 1 ? 3 : 4;
  const widthInset = safeLaneCount > 1 ? 5 : 8;

  return {
    top: `${metrics.top}px`,
    height: `${metrics.height}px`,
    left: `calc(${laneLeft}% + ${sideInset}px)`,
    width: `calc(${laneWidth}% - ${widthInset}px)`,
  };
}

function scheduleBlockMetricsFromDates(
  startDate: Date,
  endDate: Date,
  weekDates: Date[],
): ScheduleBlockMetrics | null {
  if (weekDates.length === 0) return null;

  const startMinutes = minuteOfDay(startDate);
  const rawEndMinutes = minuteOfDay(endDate);
  const endMinutes =
    toDateKey(endDate) !== toDateKey(startDate)
      ? rawEndMinutes > startMinutes
        ? rawEndMinutes
        : startMinutes + minTimedScheduleMinutes
      : rawEndMinutes;
  const duration = Math.max(minTimedScheduleMinutes, endMinutes - startMinutes);
  const startKey = toDateKey(startDate);
  const endKey = toDateKey(endDate);
  const rawStartIndex = weekDates.findIndex((day) => toDateKey(day) === startKey);
  const rawEndIndex = weekDates.findIndex((day) => toDateKey(day) === endKey);
  const firstDay = weekDates[0];
  const startIndex =
    rawStartIndex >= 0
      ? rawStartIndex
      : startDate < firstDay
        ? 0
        : weekDates.length - 1;
  const endIndex =
    rawEndIndex >= 0
      ? rawEndIndex
      : endDate < firstDay
        ? 0
        : weekDates.length - 1;
  const span = Math.max(
    1,
    Math.min(weekDates.length - startIndex, endIndex - startIndex + 1),
  );

  return {
    top: (startMinutes / 60) * weekHourHeight,
    height: (duration / 60) * weekHourHeight,
    left: (startIndex / weekDates.length) * 100,
    width: (span / weekDates.length) * 100,
  };
}

function scheduleBlocksOverlap(
  first: ScheduleBlockMetrics,
  second: ScheduleBlockMetrics,
) {
  const firstRight = first.left + first.width;
  const secondRight = second.left + second.width;
  const firstBottom = first.top + first.height;
  const secondBottom = second.top + second.height;

  return (
    first.left < secondRight &&
    firstRight > second.left &&
    first.top < secondBottom &&
    firstBottom > second.top
  );
}

function layoutTimedSchedules(
  schedules: Schedule[],
  weekDates: Date[],
): TimedScheduleLayout[] {
  const blocks = schedules
    .map((schedule) => {
      const { start, end } = scheduleDateRange(schedule);
      const metrics = scheduleBlockMetricsFromDates(start, end, weekDates);
      return metrics ? { schedule, start, end, metrics } : null;
    })
    .filter(
      (
        item,
      ): item is Omit<TimedScheduleLayout, "lane" | "laneCount"> =>
        item !== null,
    );

  const singleDayBlocks = blocks.filter(
    (block) => toDateKey(block.start) === toDateKey(block.end),
  );
  const lanesByScheduleId = new Map<number, { lane: number; laneCount: number }>();

  for (const block of blocks) {
    if (toDateKey(block.start) !== toDateKey(block.end)) {
      lanesByScheduleId.set(block.schedule.schedule_id, {
        lane: 0,
        laneCount: 1,
      });
    }
  }

  const parent = singleDayBlocks.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  const union = (first: number, second: number) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot;
  };

  for (let i = 0; i < singleDayBlocks.length; i += 1) {
    for (let j = i + 1; j < singleDayBlocks.length; j += 1) {
      if (
        scheduleBlocksOverlap(
          singleDayBlocks[i].metrics,
          singleDayBlocks[j].metrics,
        )
      ) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, typeof singleDayBlocks>();
  singleDayBlocks.forEach((block, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(block);
    else groups.set(root, [block]);
  });

  for (const group of groups.values()) {
    const sorted = [...group].sort((first, second) => {
      const firstTime = first.start.getTime();
      const secondTime = second.start.getTime();
      if (firstTime !== secondTime) return firstTime - secondTime;
      if (first.metrics.top !== second.metrics.top) {
        return first.metrics.top - second.metrics.top;
      }
      return first.metrics.left - second.metrics.left;
    });
    const lanes: typeof singleDayBlocks[] = [];

    for (const block of sorted) {
      const laneIndex = lanes.findIndex((laneBlocks) =>
        laneBlocks.every(
          (laneBlock) =>
            !scheduleBlocksOverlap(laneBlock.metrics, block.metrics),
        ),
      );
      const targetLane = laneIndex >= 0 ? laneIndex : lanes.length;
      if (!lanes[targetLane]) lanes[targetLane] = [];
      lanes[targetLane].push(block);
      lanesByScheduleId.set(block.schedule.schedule_id, {
        lane: targetLane,
        laneCount: 1,
      });
    }

    for (const block of group) {
      const lane = lanesByScheduleId.get(block.schedule.schedule_id)?.lane ?? 0;
      lanesByScheduleId.set(block.schedule.schedule_id, {
        lane,
        laneCount: lanes.length,
      });
    }
  }

  return blocks.map((block) => {
    const laneInfo = lanesByScheduleId.get(block.schedule.schedule_id);
    return {
      ...block,
      lane: laneInfo?.lane ?? 0,
      laneCount: laneInfo?.laneCount ?? 1,
    };
  });
}

function layoutAllDaySchedules(
  schedules: Schedule[],
  weekDates: Date[],
): AllDayScheduleLayout[] {
  const blocks = schedules
    .map((schedule) => {
      const indexes = weekDates
        .map((day, index) =>
          scheduleOverlapsDay(schedule, day) ? index : -1,
        )
        .filter((index) => index >= 0);
      if (indexes.length === 0) return null;

      return {
        schedule,
        startIndex: Math.min(...indexes),
        endIndex: Math.max(...indexes),
      };
    })
    .filter(
      (
        block,
      ): block is Omit<AllDayScheduleLayout, "lane" | "laneCount"> =>
        block !== null,
    )
    .sort((first, second) => {
      if (first.startIndex !== second.startIndex) {
        return first.startIndex - second.startIndex;
      }
      const firstSpan = first.endIndex - first.startIndex;
      const secondSpan = second.endIndex - second.startIndex;
      if (firstSpan !== secondSpan) return secondSpan - firstSpan;
      return first.schedule.schedule_id - second.schedule.schedule_id;
    });
  const lanes: Array<{ endIndex: number }> = [];
  const laneByScheduleId = new Map<number, number>();

  for (const block of blocks) {
    const laneIndex = lanes.findIndex((lane) => lane.endIndex < block.startIndex);
    const targetLane = laneIndex >= 0 ? laneIndex : lanes.length;
    lanes[targetLane] = { endIndex: block.endIndex };
    laneByScheduleId.set(block.schedule.schedule_id, targetLane);
  }

  return blocks.map((block) => ({
    ...block,
    lane: laneByScheduleId.get(block.schedule.schedule_id) ?? 0,
    laneCount: Math.max(1, lanes.length),
  }));
}

function WeekScheduleGrid({
  weekDates,
  schedulesByDate,
  selectedKey,
  categoryColors,
  activeScheduleId,
  onOpenDay,
  onOpenSchedule,
  onCreateDay,
  onScheduleTimeChange,
}: {
  weekDates: Date[];
  schedulesByDate: Map<string, Schedule[]>;
  selectedKey: string;
  categoryColors: Map<number, string>;
  activeScheduleId?: number | null;
  onOpenDay: (date: Date) => void;
  onOpenSchedule: (schedule: Schedule) => void;
  onCreateDay: (date: Date) => void;
  onScheduleTimeChange: ScheduleTimeChangeHandler;
}) {
  const dayCount = weekDates.length;
  const now = new Date();
  const todayKey = toDateKey(now);
  const todayIndex = weekDates.findIndex((day) => toDateKey(day) === todayKey);
  const nowTop = (minuteOfDay(now) / 60) * weekHourHeight;
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const allDayGridRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dropSettleTimeoutRef = useRef<number | null>(null);
  const [interaction, setInteraction] =
    useState<WeekScheduleInteraction | null>(null);
  const [hoveredScheduleId, setHoveredScheduleId] = useState<number | null>(
    null,
  );
  const visibleSchedules = useMemo(() => {
    const firstDay = weekDates[0];
    const lastDay = weekDates[weekDates.length - 1] ?? firstDay;
    if (!firstDay || !lastDay) return [];

    const rangeStart = dayBounds(firstDay).start;
    const rangeEnd = dayBounds(lastDay).end;
    return uniqueSchedulesFromMap(schedulesByDate).filter((schedule) =>
      scheduleOverlapsRange(schedule, rangeStart, rangeEnd),
    );
  }, [schedulesByDate, weekDates]);
  const allDayLikeSchedules = useMemo(
    () => visibleSchedules.filter(isAllDayLikeSchedule),
    [visibleSchedules],
  );
  const allDayScheduleLayouts = useMemo(
    () => layoutAllDaySchedules(allDayLikeSchedules, weekDates),
    [allDayLikeSchedules, weekDates],
  );
  const allDayLaneCount = allDayScheduleLayouts.reduce(
    (count, layout) => Math.max(count, layout.laneCount),
    1,
  );
  const allDayRowHeight = Math.max(42, 30 + allDayLaneCount * 24);
  const timedSchedules = useMemo(
    () =>
      visibleSchedules
        .filter((schedule) => !isAllDayLikeSchedule(schedule))
        .sort(
          (a, b) =>
            new Date(a.start_datetime).getTime() -
            new Date(b.start_datetime).getTime(),
        ),
    [visibleSchedules],
  );
  const timedScheduleLayouts = useMemo(
    () => layoutTimedSchedules(timedSchedules, weekDates),
    [timedSchedules, weekDates],
  );

  const beginInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    kind: WeekScheduleInteractionKind,
    schedule: Schedule,
  ) => {
    const grid = gridRef.current;
    if (!grid) return;

    if (dropSettleTimeoutRef.current !== null) {
      window.clearTimeout(dropSettleTimeoutRef.current);
      dropSettleTimeoutRef.current = null;
    }

    event.preventDefault();
    event.stopPropagation();

    event.currentTarget.setPointerCapture(event.pointerId);

    const { start, end } = scheduleDateRange(schedule);
    setInteraction({
      kind,
      surface: "time",
      schedule,
      scheduleId: schedule.schedule_id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      previewOffsetX: 0,
      previewOffsetY: 0,
      originalStart: start,
      originalEnd: end,
      start,
      end,
      gridRect: grid.getBoundingClientRect(),
    });
  };

  function movePreviewOffsetToTarget(
    draft: WeekScheduleInteraction,
  ): { x: number; y: number } | null {
    const originalMetrics = scheduleBlockMetricsFromDates(
      draft.originalStart,
      draft.originalEnd,
      weekDates,
    );
    const targetMetrics = scheduleBlockMetricsFromDates(
      draft.start,
      draft.end,
      weekDates,
    );
    if (!originalMetrics || !targetMetrics) return null;

    return {
      x:
        ((targetMetrics.left - originalMetrics.left) / 100) *
        draft.gridRect.width,
      y: targetMetrics.top - originalMetrics.top,
    };
  }

  const updateInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const columnWidth = interaction.gridRect.width / weekDates.length;
    const rawOffsetX = event.clientX - interaction.startClientX;
    const rawOffsetY = event.clientY - interaction.startClientY;
    const dayDelta = Math.round(
      rawOffsetX / columnWidth,
    );
    const minuteDelta = snapToWeekGrid(
      (rawOffsetY / weekHourHeight) * 60,
    );
    const duration = Math.max(
      minTimedScheduleMinutes * 60 * 1000,
      interaction.originalEnd.getTime() - interaction.originalStart.getTime(),
    );
    const minStart = new Date(weekDates[0]);
    minStart.setHours(0, 0, 0, 0);
    const maxStart = new Date(weekDates[weekDates.length - 1]);
    maxStart.setHours(23, 59, 0, 0);

    let start = interaction.start;
    let end = interaction.end;
    let previewOffsetX = interaction.previewOffsetX;
    let previewOffsetY = interaction.previewOffsetY;

    if (interaction.kind === "move") {
      start = addMinutes(addDays(interaction.originalStart, dayDelta), minuteDelta);
      start = clampDate(start, minStart, maxStart);
      end = new Date(start.getTime() + duration);
      const originalMetrics = scheduleBlockMetricsFromDates(
        interaction.originalStart,
        interaction.originalEnd,
        weekDates,
      );

      if (originalMetrics) {
        const leftPx = (originalMetrics.left / 100) * interaction.gridRect.width;
        const widthPx =
          (originalMetrics.width / 100) * interaction.gridRect.width;
        const topPx = originalMetrics.top;
        const minX = -leftPx;
        const maxX = interaction.gridRect.width - leftPx - widthPx;
        const minY = -topPx;
        const maxY = weekHourHeight * 24 - topPx - originalMetrics.height;

        previewOffsetX = Math.min(maxX, Math.max(minX, rawOffsetX));
        previewOffsetY = Math.min(maxY, Math.max(minY, rawOffsetY));
      } else {
        previewOffsetX = rawOffsetX;
        previewOffsetY = rawOffsetY;
      }
    } else if (interaction.kind === "resize-left") {
      const maxResizeStart = new Date(
        interaction.originalEnd.getTime() - minTimedScheduleMinutes * 60 * 1000,
      );
      start = clampDate(
        addDays(interaction.originalStart, dayDelta),
        minStart,
        maxResizeStart,
      );
      end = interaction.originalEnd;
    } else {
      const minResizeEnd = new Date(
        interaction.originalStart.getTime() +
          minTimedScheduleMinutes * 60 * 1000,
      );
      end = addDays(interaction.originalEnd, dayDelta);
      if (end < minResizeEnd) end = minResizeEnd;
      start = interaction.originalStart;
    }

    setInteraction((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, start, end, previewOffsetX, previewOffsetY }
        : current,
    );
  };

  const endInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const changed =
      interaction.start.getTime() !== interaction.originalStart.getTime() ||
      interaction.end.getTime() !== interaction.originalEnd.getTime();
    const shouldOpen =
      !changed &&
      interaction.kind === "move" &&
      Math.abs(event.clientX - interaction.startClientX) < 4 &&
      Math.abs(event.clientY - interaction.startClientY) < 4;
    const finishedInteraction = interaction;

    if (shouldOpen) {
      setInteraction(null);
      onOpenSchedule(finishedInteraction.schedule);
      return;
    }

    if (changed) {
      const targetOffset =
        finishedInteraction.kind === "move"
          ? movePreviewOffsetToTarget(finishedInteraction)
          : null;

      setInteraction({
        ...finishedInteraction,
        previewOffsetX:
          targetOffset?.x ?? finishedInteraction.previewOffsetX,
        previewOffsetY:
          targetOffset?.y ?? finishedInteraction.previewOffsetY,
        settling: true,
      });

      void onScheduleTimeChange(
        finishedInteraction.schedule,
        finishedInteraction.start,
        finishedInteraction.end,
      );
      onOpenSchedule(
        scheduleWithDraftTime(
          finishedInteraction.schedule,
          finishedInteraction.start,
          finishedInteraction.end,
        ),
      );

      dropSettleTimeoutRef.current = window.setTimeout(() => {
        setInteraction((current) =>
          current?.pointerId === finishedInteraction.pointerId &&
          current.settling
            ? null
            : current,
        );
        dropSettleTimeoutRef.current = null;
      }, 170);
      return;
    }

    setInteraction(null);
  };

  const beginAllDayInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    kind: WeekScheduleInteractionKind,
    schedule: Schedule,
  ) => {
    const grid = allDayGridRef.current;
    if (!grid) return;

    if (dropSettleTimeoutRef.current !== null) {
      window.clearTimeout(dropSettleTimeoutRef.current);
      dropSettleTimeoutRef.current = null;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const { start, end } = scheduleDateRange(schedule);
    setInteraction({
      kind,
      surface: "all-day",
      schedule,
      scheduleId: schedule.schedule_id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      previewOffsetX: 0,
      previewOffsetY: 0,
      originalStart: start,
      originalEnd: end,
      start,
      end,
      gridRect: grid.getBoundingClientRect(),
    });
  };

  const updateAllDayInteraction = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      !interaction ||
      interaction.pointerId !== event.pointerId ||
      interaction.surface !== "all-day"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const columnWidth = interaction.gridRect.width / weekDates.length;
    const rawOffsetX = event.clientX - interaction.startClientX;
    const dayDelta = Math.round(rawOffsetX / columnWidth);
    const rangeStart = dayBounds(weekDates[0]).start;
    const rangeEnd = dayBounds(weekDates[weekDates.length - 1]).end;
    const minDurationMs = minTimedScheduleMinutes * 60 * 1000;
    const duration = Math.max(
      minDurationMs,
      interaction.originalEnd.getTime() - interaction.originalStart.getTime(),
    );

    let start = interaction.start;
    let end = interaction.end;

    if (interaction.kind === "move") {
      start = clampDate(
        addDays(interaction.originalStart, dayDelta),
        rangeStart,
        rangeEnd,
      );
      end = new Date(start.getTime() + duration);
    } else if (interaction.kind === "resize-left") {
      const maxStart = new Date(interaction.originalEnd.getTime() - minDurationMs);
      start = clampDate(
        addDays(interaction.originalStart, dayDelta),
        rangeStart,
        maxStart < rangeStart ? rangeStart : maxStart,
      );
      end = interaction.originalEnd;
    } else {
      const nextEnd = addDays(interaction.originalEnd, dayDelta);
      const minEnd = new Date(interaction.originalStart.getTime() + minDurationMs);
      start = interaction.originalStart;
      end = nextEnd < minEnd ? minEnd : nextEnd;
    }

    setInteraction((current) =>
      current && current.pointerId === event.pointerId
        ? {
            ...current,
            start,
            end,
            previewOffsetX: rawOffsetX,
            previewOffsetY: 0,
          }
        : current,
    );
  };

  const endAllDayInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      !interaction ||
      interaction.pointerId !== event.pointerId ||
      interaction.surface !== "all-day"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const changed =
      interaction.start.getTime() !== interaction.originalStart.getTime() ||
      interaction.end.getTime() !== interaction.originalEnd.getTime();
    const shouldOpen =
      !changed &&
      interaction.kind === "move" &&
      Math.abs(event.clientX - interaction.startClientX) < 4 &&
      Math.abs(event.clientY - interaction.startClientY) < 4;
    const finishedInteraction = interaction;

    setInteraction(null);

    if (shouldOpen) {
      onOpenSchedule(finishedInteraction.schedule);
      return;
    }

    if (changed) {
      const nextDurationMs =
        finishedInteraction.end.getTime() - finishedInteraction.start.getTime();
      const nextAllDay = finishedInteraction.schedule.all_day
        ? nextDurationMs >= allDayLikeThresholdMs
        : finishedInteraction.schedule.all_day;
      const changeOptions = { allDay: nextAllDay };

      void onScheduleTimeChange(
        finishedInteraction.schedule,
        finishedInteraction.start,
        finishedInteraction.end,
        changeOptions,
      );
      onOpenSchedule(
        scheduleWithDraftTime(
          finishedInteraction.schedule,
          finishedInteraction.start,
          finishedInteraction.end,
          changeOptions,
        ),
      );
    }
  };

  const dateFromGridPointer = (
    event: ReactMouseEvent<HTMLElement>,
    fallbackDay: Date,
  ) => {
    const grid = gridRef.current;
    if (!grid) return fallbackDay;

    const rect = grid.getBoundingClientRect();
    const columnWidth = rect.width / dayCount;
    const dayIndex = Math.min(
      dayCount - 1,
      Math.max(0, Math.floor((event.clientX - rect.left) / columnWidth)),
    );
    const rawMinutes = ((event.clientY - rect.top) / weekHourHeight) * 60;
    const snappedMinutes = Math.min(
      23 * 60 + 45,
      Math.max(0, snapToWeekGrid(rawMinutes)),
    );
    const date = new Date(weekDates[dayIndex] ?? fallbackDay);
    date.setHours(
      Math.floor(snappedMinutes / 60),
      snappedMinutes % 60,
      0,
      0,
    );
    return date;
  };

  const createFromGridPointer = (
    event: ReactMouseEvent<HTMLElement>,
    fallbackDay: Date,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onCreateDay(dateFromGridPointer(event, fallbackDay));
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || todayIndex < 0) return;

    requestAnimationFrame(() => {
      container.scrollTop = Math.max(0, nowTop - container.clientHeight / 2);
    });
  }, [nowTop, todayIndex]);

  useEffect(
    () => () => {
      if (dropSettleTimeoutRef.current !== null) {
        window.clearTimeout(dropSettleTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <div ref={scrollContainerRef} className="h-full overflow-auto bg-white">
      <div style={{ minWidth: dayCount === 1 ? 520 : 920 }}>
        <div
          className="sticky top-0 z-30 grid border-b border-slate-100 bg-slate-50/95 shadow-[0_1px_0_rgba(226,232,240,0.9)] backdrop-blur"
          style={{
            gridTemplateColumns: `${weekTimeColumnWidth}px repeat(${dayCount}, minmax(0, 1fr))`,
          }}
        >
          <div className="flex items-center justify-center border-r border-slate-100 px-2 text-[11px] text-slate-500">
            {formatTimezoneLabel()}
          </div>
          {weekDates.map((day) => {
            const key = toDateKey(day);
            const selected = key === selectedKey;
            const today = isToday(day);

            return (
              <button
                key={key}
                type="button"
                onClick={() => onOpenDay(day)}
                className={`flex h-11 items-center justify-center gap-1 border-r border-slate-100 text-xs font-medium transition last:border-r-0 hover:bg-white ${weekdayToneClass(day, selected)}`}
              >
                <span>{weekdayLabels[day.getDay()]}</span>
                <span
                  className={
                    today
                      ? "flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white"
                      : selected
                        ? "font-semibold text-slate-950"
                        : ""
                  }
                >
                  {day.getDate()}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className="sticky top-11 z-30 grid border-b border-slate-100 bg-white/95 shadow-[0_1px_0_rgba(226,232,240,0.85)] backdrop-blur"
          style={{
            gridTemplateColumns: `${weekTimeColumnWidth}px repeat(${dayCount}, minmax(0, 1fr))`,
          }}
        >
          <div
            className="flex items-start justify-center border-r border-slate-100 px-2 pt-3 text-[11px] text-slate-500"
            style={{ minHeight: allDayRowHeight }}
          >
            All-day
          </div>
          <div
            ref={allDayGridRef}
            className="relative grid"
            style={{
              gridColumn: `span ${dayCount} / span ${dayCount}`,
              gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))`,
              minHeight: allDayRowHeight,
            }}
          >
            {weekDates.map((day) => {
              const key = toDateKey(day);

              return (
                <div
                  key={`all-day-${key}`}
                  className={`border-r border-slate-100 px-1.5 py-1.5 last:border-r-0 ${weekdayColumnClass(day, selectedKey === key)}`}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCreateDay(day);
                    }}
                    className="inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {allDayScheduleLayouts.map((layout) => {
              const { schedule, startIndex, endIndex, lane } = layout;
              const color = scheduleAccentColor(schedule, categoryColors);
              const activeDraft =
                interaction?.surface === "all-day" &&
                interaction.scheduleId === schedule.schedule_id
                  ? interaction
                  : null;
              const activeSpan = activeDraft
                ? allDaySpanIndexesFromDates(
                    activeDraft.start,
                    activeDraft.end,
                    weekDates,
                  )
                : null;
              const displayStartIndex = activeSpan?.startIndex ?? startIndex;
              const displayEndIndex = activeSpan?.endIndex ?? endIndex;
              const span = displayEndIndex - displayStartIndex + 1;
              const selected = activeScheduleId === schedule.schedule_id;

              return (
                <div
                  key={`all-day-bar-${schedule.schedule_id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Move ${schedule.title}`}
                  onPointerDown={(event) =>
                    beginAllDayInteraction(event, "move", schedule)
                  }
                  onPointerMove={updateAllDayInteraction}
                  onPointerUp={endAllDayInteraction}
                  onPointerCancel={(event) => {
                    if (interaction?.pointerId === event.pointerId) {
                      setInteraction(null);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenSchedule(schedule);
                    }
                  }}
                  className={`absolute h-5 touch-none overflow-hidden rounded-md px-2 pr-4 text-left text-[11px] font-semibold leading-5 transition-[left,width,box-shadow,filter,opacity,transform] duration-150 ease-out hover:brightness-95 focus:outline-none ${
                    activeDraft
                      ? "z-40 scale-[1.01] cursor-grabbing shadow-lg"
                      : "z-20 cursor-grab"
                  } ${
                    selected
                      ? "ring-2 ring-emerald-400 ring-offset-1"
                      : "hover:ring-1 hover:ring-emerald-200"
                  }`}
                  style={{
                    top: 26 + lane * 24,
                    left: `calc(${(displayStartIndex / dayCount) * 100}% + 4px)`,
                    width: `calc(${(span / dayCount) * 100}% - 8px)`,
                    backgroundColor: colorWithAlpha(color, "18"),
                    color,
                    boxShadow: `inset 3px 0 0 ${color}, 0 0 0 1px ${colorWithAlpha(color, "30")}`,
                  }}
                >
                  <span
                    role="presentation"
                    className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize rounded-l-md transition hover:bg-white/40"
                    onPointerDown={(event) =>
                      beginAllDayInteraction(event, "resize-left", schedule)
                    }
                    onPointerMove={updateAllDayInteraction}
                    onPointerUp={endAllDayInteraction}
                    onPointerCancel={(event) => {
                      if (interaction?.pointerId === event.pointerId) {
                        setInteraction(null);
                      }
                    }}
                  />
                  <span
                    role="presentation"
                    className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize rounded-r-md transition hover:bg-white/40"
                    onPointerDown={(event) =>
                      beginAllDayInteraction(event, "resize-right", schedule)
                    }
                    onPointerMove={updateAllDayInteraction}
                    onPointerUp={endAllDayInteraction}
                    onPointerCancel={(event) => {
                      if (interaction?.pointerId === event.pointerId) {
                        setInteraction(null);
                      }
                    }}
                  />
                  <span className="pointer-events-none mr-1">{schedule.title}</span>
                  <span className="pointer-events-none font-medium opacity-80">
                    {schedulePreviewTimeLabel(schedule)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="grid"
          style={{
            gridTemplateColumns: `${weekTimeColumnWidth}px repeat(${dayCount}, minmax(0, 1fr))`,
          }}
        >
          <div className="relative border-r border-slate-100">
            {weekHours.map((hour) => (
              <div
                key={hour}
                className="flex justify-end whitespace-nowrap border-b border-slate-100 pr-1.5 pt-1 text-[11px] text-slate-500"
                style={{ height: weekHourHeight }}
              >
                {formatHourLabel(hour)}
              </div>
            ))}
          </div>

          <div
            ref={gridRef}
            className="relative grid"
            style={{
              gridColumn: `span ${dayCount} / span ${dayCount}`,
              gridTemplateColumns: `repeat(${dayCount}, minmax(0, 1fr))`,
              height: weekHourHeight * 24,
            }}
          >
            <div className="pointer-events-none absolute inset-0">
              {weekHours.map((hour) => (
                <div
                  key={`line-${hour}`}
                  className="border-b border-slate-100"
                  style={{ height: weekHourHeight }}
                />
              ))}
            </div>

            {todayIndex >= 0 && (
              <div
                className="pointer-events-none absolute left-0 right-0 z-20 border-t border-rose-400"
                style={{ top: nowTop }}
              >
                <span
                  className="absolute -top-2 whitespace-nowrap rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  style={{ left: -weekTimeColumnWidth + 4 }}
                >
                  {formatTime(now.toISOString())}
                </span>
                <span
                  className="absolute -top-[3px] h-1.5 w-1.5 rounded-full bg-rose-500"
                  style={{ left: `${(todayIndex / dayCount) * 100}%` }}
                />
              </div>
            )}

            {weekDates.map((day) => {
              const key = toDateKey(day);
              const selected = key === selectedKey;

              return (
                <div
                  key={`timed-${key}`}
                  onDoubleClick={(event) => createFromGridPointer(event, day)}
                  onContextMenu={(event) => createFromGridPointer(event, day)}
                  className={`relative border-r border-slate-100 transition hover:bg-emerald-50/20 last:border-r-0 ${weekdayColumnClass(day, selected)}`}
                />
              );
            })}

            {timedScheduleLayouts.map((layout) => {
              const { schedule, start, end, metrics, lane, laneCount } = layout;
              const color = scheduleAccentColor(schedule, categoryColors);
              const activeDraft =
                interaction?.scheduleId === schedule.schedule_id
                  ? interaction
                  : null;
              const selected = activeScheduleId === schedule.schedule_id;
              const hovered = hoveredScheduleId === schedule.schedule_id;
              const blockStyle = scheduleBlockStyleFromMetrics(
                metrics,
                lane,
                laneCount,
              );

              return (
                <div
                  key={schedule.schedule_id}
                  id={`schedule-${schedule.schedule_id}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${schedule.title} 일정 이동`}
                  onPointerDown={(event) =>
                    beginInteraction(event, "move", schedule)
                  }
                  onPointerEnter={() => {
                    setHoveredScheduleId(schedule.schedule_id);
                  }}
                  onPointerLeave={() => setHoveredScheduleId(null)}
                  onPointerMove={updateInteraction}
                  onPointerUp={endInteraction}
                  onPointerCancel={() => {
                    setInteraction(null);
                  }}
                  onFocus={() => {
                    setHoveredScheduleId(schedule.schedule_id);
                  }}
                  onBlur={() => setHoveredScheduleId(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenSchedule(schedule);
                    }
                  }}
                  className={`absolute z-10 origin-top-left touch-none cursor-grab overflow-hidden rounded-lg px-2 py-1 text-left text-xs font-medium transition-[box-shadow,filter,opacity,transform,left,top,width,height] duration-150 ease-out hover:scale-[1.02] hover:brightness-95 focus:scale-[1.02] active:cursor-grabbing ${
                    selected
                      ? "ring-2 ring-emerald-400 ring-offset-1"
                      : "hover:ring-1 hover:ring-emerald-200"
                  } ${activeDraft ? "opacity-45 saturate-75" : ""}`}
                  style={{
                    ...blockStyle,
                    zIndex:
                      selected || hovered
                        ? 35
                        : activeDraft
                          ? 12
                          : 10 + lane,
                    backgroundColor: colorWithAlpha(color, "24"),
                    borderLeft: `3px solid ${color}`,
                    color,
                    boxShadow: activeDraft
                      ? `0 0 0 1px ${colorWithAlpha(color, "28")}`
                      : `0 0 0 1px ${colorWithAlpha(color, "40")}`,
                  }}
                >
                  <span
                    role="presentation"
                    className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize"
                    onPointerDown={(event) =>
                      beginInteraction(event, "resize-left", schedule)
                    }
                    onPointerMove={updateInteraction}
                    onPointerUp={endInteraction}
                    onPointerCancel={() => {
                      setInteraction(null);
                    }}
                  />
                  <span
                    role="presentation"
                    className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize"
                    onPointerDown={(event) =>
                      beginInteraction(event, "resize-right", schedule)
                    }
                    onPointerMove={updateInteraction}
                    onPointerUp={endInteraction}
                    onPointerCancel={() => {
                      setInteraction(null);
                    }}
                  />
                  <span className="block truncate pr-2">{schedule.title}</span>
                  <span className="block truncate pr-2 text-[10px] opacity-80">
                    {formatTime(start.toISOString())} - {formatTime(end.toISOString())}
                  </span>
                </div>
              );
            })}

            {interaction && interaction.surface !== "all-day" && !interaction.settling && (
              <div
                className="pointer-events-none absolute z-40 rounded-lg bg-white/35 transition-[left,top,width,height,opacity] duration-150 ease-out"
                style={{
                  ...scheduleBlockStyleFromDates(
                    interaction.start,
                    interaction.end,
                    weekDates,
                  ),
                  border: `1.5px solid ${scheduleAccentColor(
                    interaction.schedule,
                    categoryColors,
                  )}`,
                  boxShadow: `0 0 0 3px ${colorWithAlpha(
                    scheduleAccentColor(interaction.schedule, categoryColors),
                    "18",
                  )}`,
                }}
              />
            )}

            {interaction && interaction.surface !== "all-day" && (
              <div
                className={`pointer-events-none absolute z-50 touch-none overflow-hidden rounded-lg px-2 py-1 text-left text-xs font-semibold shadow-2xl will-change-transform transition-[box-shadow,opacity,transform] ${
                  interaction.settling
                    ? "duration-[170ms] ease-out"
                    : "duration-75 ease-out"
                }`}
                style={{
                  ...scheduleBlockStyleFromDates(
                    interaction.kind === "move"
                      ? interaction.originalStart
                      : interaction.start,
                    interaction.kind === "move"
                      ? interaction.originalEnd
                      : interaction.end,
                    weekDates,
                  ),
                  backgroundColor: colorWithAlpha(
                    scheduleAccentColor(interaction.schedule, categoryColors),
                    "66",
                  ),
                  borderLeft: `3px solid ${scheduleAccentColor(
                    interaction.schedule,
                    categoryColors,
                  )}`,
                  color: scheduleAccentColor(interaction.schedule, categoryColors),
                  boxShadow: `0 18px 34px rgba(15,23,42,0.18), 0 0 0 1.5px ${scheduleAccentColor(
                    interaction.schedule,
                    categoryColors,
                  )}, inset 0 0 0 1px ${colorWithAlpha(
                    scheduleAccentColor(interaction.schedule, categoryColors),
                    "55",
                  )}`,
                  transform:
                    interaction.kind === "move"
                      ? `translate3d(${interaction.previewOffsetX}px, ${interaction.previewOffsetY}px, 0) scale(1.01)`
                      : "scale(1.01)",
                }}
              >
                <span className="block truncate pr-2">
                  {interaction.schedule.title}
                </span>
                <span className="block truncate pr-2 text-[10px] opacity-85">
                  {formatTime(interaction.start.toISOString())} -{" "}
                  {formatTime(interaction.end.toISOString())}
                </span>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default function Schedules() {
  const [searchParams, setSearchParams] = useSearchParams();
  const classificationSettings = useClassificationSettings();
  const deepLinkedScheduleIdParam = searchParams.get("schedule_id");
  const deepLinkedScheduleId = deepLinkedScheduleIdParam
    ? Number(deepLinkedScheduleIdParam)
    : null;
  const deepLinkedDate = searchParams.get("date");
  const initialDate = deepLinkedDate ? new Date(deepLinkedDate) : new Date();
  const safeInitialDate = Number.isNaN(initialDate.getTime())
    ? new Date()
    : initialDate;
  const deepLinkHandledRef = useRef(false);

  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [scheduleView, setScheduleView] =
    useState<ScheduleCalendarView>("week");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () =>
      new Date(safeInitialDate.getFullYear(), safeInitialDate.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState<Date>(safeInitialDate);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [optimisticScheduleTimes, setOptimisticScheduleTimes] = useState<
    Map<number, OptimisticScheduleTime>
  >(() => new Map());
  const [panelMode, setPanelMode] = useState<
    "create" | "edit" | "repeat" | null
  >(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [filters, setFilters] = useState<ScheduleFilters>(() => {
    const completion = searchParams.get(
      "completion",
    ) as ScheduleCompletionFilter | null;
    return {
      scheduleTypes: parseScheduleTypeFilters(searchParams.get("type")),
      priorities: parseSchedulePriorityFilters(searchParams.get("priority")),
      categories: parseScheduleCategoryFilters(searchParams.get("category")),
      completion:
        completion === "active" || completion === "completed"
          ? completion
          : "all",
      q: searchParams.get("q") ?? "",
      location: searchParams.get("location") ?? "",
    };
  });

  const createSchedulesMutation = useCreateSchedules();
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteSchedule();
  const bulkDeleteMutation = useDeleteSchedules();
  const categoriesQuery = useCategories("schedule");
  const categoryColors = useMemo(
    () =>
      new Map(
        (categoriesQuery.data ?? []).map((category) => [
          category.category_id,
          category.color,
        ]),
      ),
    [categoriesQuery.data],
  );

  const clearDeepLinkParams = useCallback(() => {
    if (!searchParams.has("schedule_id") && !searchParams.has("date")) return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("schedule_id");
    nextParams.delete("date");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const updateFilters = useCallback(
    (patch: Partial<ScheduleFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        const params = new URLSearchParams(searchParams);
        params.delete("schedule_id");
        params.delete("date");

        if (next.scheduleTypes.length === 0) params.delete("type");
        else params.set("type", next.scheduleTypes.join(","));

        if (next.priorities.length === 0) params.delete("priority");
        else params.set("priority", next.priorities.join(","));

        if (next.categories.length === 0) params.delete("category");
        else params.set("category", next.categories.join(","));

        if (next.completion === "all") params.delete("completion");
        else params.set("completion", next.completion);

        if (next.q.trim()) params.set("q", next.q.trim());
        else params.delete("q");

        if (next.location.trim()) params.set("location", next.location.trim());
        else params.delete("location");

        setSearchParams(params, { replace: true });
        return next;
      });
    },
    [searchParams, setSearchParams],
  );

  const resetFilters = useCallback(() => {
    setFilters(defaultScheduleFilters);
    const params = new URLSearchParams(searchParams);
    params.delete("schedule_id");
    params.delete("date");
    params.delete("type");
    params.delete("priority");
    params.delete("category");
    params.delete("completion");
    params.delete("q");
    params.delete("location");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const monthRange = useMemo(() => {
    const start = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      -6,
    );
    start.setHours(0, 0, 0, 0);
    const end = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      7,
    );
    end.setHours(23, 59, 59, 999);
    return {
      startFrom: toOffsetISOString(start),
      startTo: toOffsetISOString(end),
    };
  }, [visibleMonth]);

  const { data, isLoading, isError, error, isFetching, refetch } = useSchedules(
    {
      start_from: monthRange.startFrom,
      start_to: monthRange.startTo,
      view: "month",
    },
  );
  const scheduleTypeFilterOptions = getClassificationOptions(
    classificationSettings,
    "scheduleTypes",
    { enabledOnly: true, defaultOnly: true },
  );
  const priorityFilterOptions = getClassificationOptions(
    classificationSettings,
    "taskPriorities",
    { enabledOnly: true, defaultOnly: true },
  );

  const items = useMemo(() => {
    const keyword = filters.q.trim().toLowerCase();
    const locationKeyword = filters.location.trim().toLowerCase();
    return [...(data ?? [])]
      .map((schedule) => {
        const optimisticTime = optimisticScheduleTimes.get(schedule.schedule_id);
        if (!optimisticTime) return schedule;

        return {
          ...schedule,
          start_datetime: optimisticTime.start,
          end_datetime: optimisticTime.end,
          all_day: optimisticTime.allDay ?? schedule.all_day,
        };
      })
      .filter((schedule) => {
        if (filters.completion === "active" && schedule.is_completed) {
          return false;
        }
        if (filters.completion === "completed" && !schedule.is_completed) {
          return false;
        }
        if (
          filters.scheduleTypes.length > 0 &&
          !filters.scheduleTypes.includes(schedule.schedule_type)
        ) {
          return false;
        }
        if (
          filters.priorities.length > 0 &&
          (!schedule.priority ||
            !filters.priorities.includes(schedule.priority))
        ) {
          return false;
        }
        if (
          filters.categories.length > 0 &&
          (!schedule.category_id ||
            !filters.categories.includes(schedule.category_id))
        ) {
          return false;
        }
        if (keyword) {
          const haystack =
            `${schedule.title} ${schedule.description ?? ""} ${schedule.location ?? ""}`.toLowerCase();
          if (!haystack.includes(keyword)) return false;
        }
        if (locationKeyword) {
          const location = (schedule.location ?? "").toLowerCase();
          if (!location.includes(locationKeyword)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.start_datetime).getTime() -
          new Date(b.start_datetime).getTime(),
      );
  }, [
    data,
    filters.categories,
    filters.completion,
    filters.location,
    filters.priorities,
    filters.q,
    filters.scheduleTypes,
    optimisticScheduleTimes,
  ]);
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.scheduleTypes.length > 0) count += 1;
    if (filters.priorities.length > 0) count += 1;
    if (filters.categories.length > 0) count += 1;
    if (filters.completion !== "all") count += 1;
    if (filters.q.trim()) count += 1;
    if (filters.location.trim()) count += 1;
    return count;
  }, [filters]);
  const scheduleFilterChips = useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      reset: Partial<ScheduleFilters>;
    }> = [];
    filters.scheduleTypes.forEach((scheduleType) => {
      chips.push({
        key: `type-${scheduleType}`,
        label: getClassificationLabel(
          classificationSettings,
          "scheduleTypes",
          scheduleType,
        ),
        reset: {
          scheduleTypes: filters.scheduleTypes.filter(
            (item) => item !== scheduleType,
          ),
        },
      });
    });
    filters.priorities.forEach((priority) => {
      chips.push({
        key: `priority-${priority}`,
        label: getClassificationLabel(
          classificationSettings,
          "taskPriorities",
          priority,
        ),
        reset: {
          priorities: filters.priorities.filter((item) => item !== priority),
        },
      });
    });
    filters.categories.forEach((categoryId) => {
      const category = categoriesQuery.data?.find(
        (item) => item.category_id === categoryId,
      );
      chips.push({
        key: `category-${categoryId}`,
        label: category?.name ?? `카테고리 ${categoryId}`,
        reset: {
          categories: filters.categories.filter((item) => item !== categoryId),
        },
      });
    });
    if (filters.completion === "active") {
      chips.push({
        key: "completion",
        label: "미완료",
        reset: { completion: "all" },
      });
    }
    if (filters.completion === "completed") {
      chips.push({
        key: "completion",
        label: "완료",
        reset: { completion: "all" },
      });
    }
    if (filters.q.trim()) {
      chips.push({
        key: "q",
        label: `검색: ${filters.q.trim()}`,
        reset: { q: "" },
      });
    }
    if (filters.location.trim()) {
      chips.push({
        key: "location",
        label: `장소: ${filters.location.trim()}`,
        reset: { location: "" },
      });
    }
    return chips;
  }, [categoriesQuery.data, classificationSettings, filters]);

  const schedulesByDate = useMemo(() => {
    const grouped = new Map<string, Schedule[]>();
    for (const schedule of items) {
      const key = toDateKey(schedule.start_datetime);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(schedule);
      else grouped.set(key, [schedule]);
    }
    return grouped;
  }, [items]);

  const dateMeta = useMemo(() => {
    const meta = new Map<string, DayMeta>();
    for (const [key, schedules] of schedulesByDate.entries()) {
      meta.set(key, {
        count: schedules.length,
        hasDeadline: schedules.some(
          (schedule) => schedule.schedule_type === "deadline",
        ),
      });
    }
    return meta;
  }, [schedulesByDate]);

  const monthCells = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) {
      cells.push(new Date(year, month, day));
    }
    return cells;
  }, [visibleMonth]);
  const mainMonthCells = useMemo(
    () => buildFullMonthCells(visibleMonth),
    [visibleMonth],
  );

  const selectedKey = toDateKey(selectedDate);
  const selectedSchedules = useMemo(
    () => items.filter((schedule) => scheduleOverlapsDay(schedule, selectedDate)),
    [items, selectedDate],
  );
  const weekDates = useMemo(() => buildWeekDates(selectedDate), [selectedDate]);
  const weekSchedules = useMemo(() => {
    const firstDay = weekDates[0];
    const lastDay = weekDates[weekDates.length - 1] ?? firstDay;
    if (!firstDay || !lastDay) return [];
    return items.filter((schedule) =>
      scheduleOverlapsRange(
        schedule,
        dayBounds(firstDay).start,
        dayBounds(lastDay).end,
      ),
    );
  }, [items, weekDates]);
  const monthVisibleSchedules = useMemo(
    () =>
      mainMonthCells.flatMap(
        (cell) => schedulesByDate.get(toDateKey(cell.date)) ?? [],
      ),
    [mainMonthCells, schedulesByDate],
  );
  const currentViewSchedules =
    scheduleView === "month"
      ? monthVisibleSchedules
      : scheduleView === "week"
        ? weekSchedules
        : selectedSchedules;
  const currentViewLabel =
    scheduleView === "month"
      ? formatMonthTitle(visibleMonth)
      : scheduleView === "week"
        ? formatWeekRange(weekDates)
        : formatSelectedDate(selectedDate);
  const selectedScheduleCount = selectedScheduleIds.size;
  const monthScheduleCount = items.length;
  const deadlineCount = useMemo(
    () =>
      items.filter((schedule) => schedule.schedule_type === "deadline").length,
    [items],
  );
  const completedCount = useMemo(
    () => items.filter((schedule) => schedule.is_completed).length,
    [items],
  );

  useEffect(() => {
    if (optimisticScheduleTimes.size === 0 || !data) return;

    setOptimisticScheduleTimes((prev) => {
      let changed = false;
      const next = new Map(prev);

      for (const schedule of data) {
        const optimisticTime = next.get(schedule.schedule_id);
        if (!optimisticTime) continue;

        const serverStart = new Date(schedule.start_datetime).getTime();
        const serverEnd = new Date(schedule.end_datetime ?? "").getTime();
        const optimisticStart = new Date(optimisticTime.start).getTime();
        const optimisticEnd = new Date(optimisticTime.end).getTime();
        const optimisticAllDay = optimisticTime.allDay ?? schedule.all_day;

        if (
          serverStart === optimisticStart &&
          schedule.all_day === optimisticAllDay &&
          (serverEnd === optimisticEnd ||
            (Number.isNaN(serverEnd) && Number.isNaN(optimisticEnd)))
        ) {
          next.delete(schedule.schedule_id);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [data, optimisticScheduleTimes.size]);

  useEffect(() => {
    setSelectedScheduleIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(
        selectedSchedules.map((item) => item.schedule_id),
      );
      const next = new Set(
        [...prev].filter((scheduleId) => visibleIds.has(scheduleId)),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [selectedSchedules]);

  useEffect(() => {
    if (
      deepLinkHandledRef.current ||
      !deepLinkedScheduleId ||
      Number.isNaN(deepLinkedScheduleId) ||
      items.length === 0
    ) {
      return;
    }

    const target = items.find(
      (schedule) => schedule.schedule_id === deepLinkedScheduleId,
    );
    if (!target) return;

    const targetDate = new Date(target.start_datetime);
    if (Number.isNaN(targetDate.getTime())) return;

    setSelectedDate(targetDate);
    setVisibleMonth(
      new Date(targetDate.getFullYear(), targetDate.getMonth(), 1),
    );
    deepLinkHandledRef.current = true;

    requestAnimationFrame(() => {
      document
        .getElementById(`schedule-${deepLinkedScheduleId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [deepLinkedScheduleId, items]);

  const moveMonth = (offset: number) => {
    clearDeepLinkParams();
    setVisibleMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + offset, 1);
      setSelectedDate(new Date(next.getFullYear(), next.getMonth(), 1));
      return next;
    });
  };

  const moveCurrentRange = (offset: number) => {
    if (scheduleView === "month") {
      moveMonth(offset);
      return;
    }

    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + offset * (scheduleView === "week" ? 7 : 1));
    selectDate(next);
  };

  const selectDate = (date: Date) => {
    clearDeepLinkParams();
    setSelectedScheduleIds(new Set());
    setSelectedDate(date);
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const toggleScheduleSelection = (scheduleId: number) => {
    setSelectedScheduleIds((prev) => {
      const next = new Set(prev);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
  };

  const selectAllCurrentDaySchedules = () => {
    setSelectedScheduleIds(
      new Set(selectedSchedules.map((schedule) => schedule.schedule_id)),
    );
  };

  const clearSelectedSchedules = () => {
    setSelectedScheduleIds(new Set());
  };

  const deleteSelectedSchedules = async () => {
    if (selectedScheduleIds.size === 0) return;
    if (!confirm(`선택한 일정 ${selectedScheduleIds.size}개를 삭제할까요?`)) {
      return;
    }

    const ids = [...selectedScheduleIds];
    const result = await bulkDeleteMutation.mutateAsync(ids);
    setSelectedScheduleIds(new Set());
    const failedCount = result.failed_ids.length;
    toast.success(
      failedCount > 0
        ? `일정 ${result.deleted_count}개 삭제, ${failedCount}개 실패`
        : `일정 ${result.deleted_count}개가 삭제되었습니다.`,
    );
  };

  const openCreatePanel = (date = selectedDate) => {
    selectDate(date);
    setEditingSchedule(null);
    setPanelMode("create");
  };

  const openEditPanel = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setPanelMode("edit");
  };

  const moveScheduleOnCalendar = async (
    schedule: Schedule,
    start: Date,
    end: Date,
    options?: ScheduleTimeChangeOptions,
  ) => {
    const nextStart = toOffsetISOString(start);
    const nextEnd = toOffsetISOString(end);
    const nextAllDay = options?.allDay ?? schedule.all_day;

    setOptimisticScheduleTimes((prev) => {
      const next = new Map(prev);
      next.set(schedule.schedule_id, {
        start: nextStart,
        end: nextEnd,
        allDay: nextAllDay,
      });
      return next;
    });

    try {
      await updateMutation.mutateAsync({
        scheduleId: schedule.schedule_id,
        payload: {
          start_datetime: nextStart,
          end_datetime: nextEnd,
          all_day: nextAllDay,
        },
      });
      selectDate(start);
    } catch (error) {
      setOptimisticScheduleTimes((prev) => {
        const next = new Map(prev);
        next.delete(schedule.schedule_id);
        return next;
      });
      throw error;
    }
  };

  const closePanel = () => {
    setPanelMode(null);
    setEditingSchedule(null);
  };

  const formInitial =
    panelMode === "edit" && editingSchedule
      ? formFromSchedule(editingSchedule)
      : emptyFormForDate(selectedDate);

  const panelKey =
    panelMode === "edit" && editingSchedule
      ? `edit-${editingSchedule.schedule_id}`
      : `${panelMode ?? "create"}-${selectedKey}`;

  const allDaySchedules = selectedSchedules.filter(
    isAllDayLikeSchedule,
  );
  const timedSchedules = selectedSchedules.filter(
    (schedule) => !isAllDayLikeSchedule(schedule),
  );

  return (
    <AppShell fullBleed>
      <div className="h-[calc(100dvh-5.5rem)] min-h-0 overflow-hidden bg-white">
        <section className="sr-only">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
              일정
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              시간표와 약속을 정리합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "선택한 날짜", value: `${selectedSchedules.length}건` },
              { label: "현재 범위", value: `${monthScheduleCount}건` },
              { label: "마감", value: `${deadlineCount}건` },
              { label: "완료", value: `${completedCount}건` },
            ].map((metric) => (
              <span
                key={metric.label}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm text-slate-600"
              >
                {metric.label}
                <strong className="font-semibold text-slate-950">
                  {metric.value}
                </strong>
              </span>
            ))}
          </div>
        </section>

        <div
          className={`grid h-full min-h-0 gap-0 ${
            scheduleView === "month"
              ? panelMode
                ? "xl:grid-cols-[minmax(0,1fr)_390px]"
                : "xl:grid-cols-1"
              : panelMode
                ? "xl:grid-cols-[320px_minmax(0,1fr)_390px]"
                : "xl:grid-cols-[320px_minmax(0,1fr)]"
          }`}
        >
          {scheduleView !== "month" && (
            <MiniCalendar
              calendarView={calendarView}
              visibleMonth={visibleMonth}
              selectedKey={selectedKey}
              dateMeta={dateMeta}
              monthCells={monthCells}
              weekDates={weekDates}
              onMoveMonth={moveMonth}
              onSelectDate={selectDate}
              onSetCalendarView={setCalendarView}
            />
          )}

          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-x border-slate-200 bg-white">
            <div className="flex flex-col gap-4 border-b border-slate-100 bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-700">
                  {scheduleView === "month"
                    ? "월간 보기"
                    : scheduleView === "week"
                      ? "주간 보기"
                      : formatCompactDate(selectedDate)}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                  {currentViewLabel}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {scheduleView === "month"
                    ? "이번 달"
                    : scheduleView === "week"
                      ? "이번 주"
                      : "선택한 날짜"}{" "}
                  일정 {currentViewSchedules.length}건
                  {isFetching && " · 업데이트 중"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((open) => !open)}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${
                    filtersOpen
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  필터
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    selectDate(today);
                  }}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Today
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveCurrentRange(-1)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                    aria-label="이전 범위"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCurrentRange(1)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
                    aria-label="다음 범위"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1 text-xs">
                  {(
                    [
                      ["month", "월"],
                      ["week", "주"],
                      ["day", "일"],
                    ] as const
                  ).map(([view, label]) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setScheduleView(view)}
                      className={`h-8 min-w-10 rounded-lg px-3 font-semibold transition ${
                        scheduleView === view
                          ? "bg-white text-emerald-700 shadow-sm"
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {scheduleView === "day" && selectedSchedules.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={selectAllCurrentDaySchedules}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={clearSelectedSchedules}
                      disabled={selectedScheduleCount === 0}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      선택 해제
                    </button>
                    <button
                      type="button"
                      onClick={deleteSelectedSchedules}
                      disabled={
                        selectedScheduleCount === 0 ||
                        bulkDeleteMutation.isPending
                      }
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {bulkDeleteMutation.isPending
                        ? "삭제 중..."
                        : `선택 삭제 ${selectedScheduleCount || ""}`.trim()}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => openCreatePanel()}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <CalendarDays className="h-4 w-4" />+ 일정 추가
                </button>
              </div>
            </div>

            {scheduleFilterChips.length > 0 && (
              <div className="border-b border-slate-100 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  {scheduleFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => updateFilters(chip.reset)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                      aria-label={`${chip.label} 필터 제거`}
                    >
                      <span>{chip.label}</span>
                      <X className="h-3 w-3 text-emerald-500" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    초기화
                  </button>
                </div>
              </div>
            )}

            {filtersOpen && (
              <div className="relative z-20 border-b border-slate-100 bg-slate-50/60 px-5 py-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-200/70">
                  <div className="grid gap-3 xl:grid-cols-[1.35fr_1fr_1fr_1fr]">
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">
                        검색
                      </span>
                      <div className="relative mt-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          value={filters.q}
                          onChange={(event) =>
                            updateFilters({ q: event.target.value })
                          }
                          placeholder="제목, 설명, 장소"
                          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-9 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                        />
                      </div>
                    </label>

                    <InlineFilterGroup
                      label="일정 유형"
                      selectedValues={filters.scheduleTypes}
                      options={scheduleTypeFilterOptions.map((option) => ({
                        key: option.key,
                        value: option.value,
                        label: option.label,
                      }))}
                      visibleCount={4}
                      onClear={() => updateFilters({ scheduleTypes: [] })}
                      onToggle={(value) => {
                        const selected = filters.scheduleTypes.includes(value);
                        updateFilters({
                          scheduleTypes: selected
                            ? filters.scheduleTypes.filter(
                                (item) => item !== value,
                              )
                            : [...filters.scheduleTypes, value],
                        });
                      }}
                    />

                    <InlineFilterGroup
                      label="우선순위"
                      selectedValues={filters.priorities}
                      options={priorityFilterOptions.map((option) => ({
                        key: option.key,
                        value: option.value,
                        label: option.label,
                      }))}
                      visibleCount={4}
                      onClear={() => updateFilters({ priorities: [] })}
                      onToggle={(value) => {
                        const selected = filters.priorities.includes(value);
                        updateFilters({
                          priorities: selected
                            ? filters.priorities.filter(
                                (item) => item !== value,
                              )
                            : [...filters.priorities, value],
                        });
                      }}
                    />

                    <InlineFilterGroup
                      label="카테고리"
                      selectedValues={filters.categories}
                      options={(categoriesQuery.data ?? []).map((category) => ({
                        key: String(category.category_id),
                        value: category.category_id,
                        label: category.name,
                      }))}
                      visibleCount={1}
                      onClear={() => updateFilters({ categories: [] })}
                      onToggle={(value) => {
                        const selected = filters.categories.includes(value);
                        updateFilters({
                          categories: selected
                            ? filters.categories.filter(
                                (item) => item !== value,
                              )
                            : [...filters.categories, value],
                        });
                      }}
                    />
                  </div>

                  <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr]">
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">
                        장소
                      </span>
                      <input
                        type="search"
                        value={filters.location}
                        onChange={(event) =>
                          updateFilters({ location: event.target.value })
                        }
                        placeholder="장소 키워드"
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">
                        완료 여부
                      </span>
                      <select
                        value={filters.completion}
                        onChange={(event) =>
                          updateFilters({
                            completion: event.target
                              .value as ScheduleCompletionFilter,
                          })
                        }
                        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-slate-50/70 px-3 text-sm outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                      >
                        <option value="all">전체</option>
                        <option value="active">미완료</option>
                        <option value="completed">완료</option>
                      </select>
                    </label>
                  </div>
                </div>
              </div>
            )}

            <div
              className={
                scheduleView === "week"
                  ? "min-h-0 flex-1 overflow-hidden p-0"
                  : scheduleView === "month"
                    ? "min-h-0 flex-1 overflow-auto p-0"
                    : "min-h-0 flex-1 overflow-auto p-5"
              }
            >
              {isLoading ? (
                <FullSpinner message="일정을 불러오는 중..." />
              ) : isError ? (
                <ErrorState
                  title="일정을 불러오지 못했습니다"
                  message={(error as Error).message}
                  onRetry={() => refetch()}
                  retrying={isFetching}
                />
              ) : scheduleView === "month" ? (
                <MonthScheduleGrid
                  cells={mainMonthCells}
                  schedulesByDate={schedulesByDate}
                  selectedKey={selectedKey}
                  categoryColors={categoryColors}
                  activeScheduleId={editingSchedule?.schedule_id ?? null}
                  onOpenDay={(date) => {
                    selectDate(date);
                    setScheduleView("day");
                  }}
                  onCreateDay={(date) => openCreatePanel(date)}
                  onOpenSchedule={(schedule) => {
                    selectDate(new Date(schedule.start_datetime));
                    openEditPanel(schedule);
                  }}
                  onScheduleTimeChange={moveScheduleOnCalendar}
                />
              ) : scheduleView === "week" ? (
                <WeekScheduleGrid
                  weekDates={weekDates}
                  schedulesByDate={schedulesByDate}
                  selectedKey={selectedKey}
                  categoryColors={categoryColors}
                  activeScheduleId={editingSchedule?.schedule_id ?? null}
                  onOpenDay={(date) => {
                    selectDate(date);
                    setScheduleView("day");
                  }}
                  onCreateDay={(date) => openCreatePanel(date)}
                  onOpenSchedule={(schedule) => {
                    selectDate(new Date(schedule.start_datetime));
                    openEditPanel(schedule);
                  }}
                  onScheduleTimeChange={moveScheduleOnCalendar}
                />
              ) : scheduleView === "day" ? (
                <WeekScheduleGrid
                  weekDates={[selectedDate]}
                  schedulesByDate={schedulesByDate}
                  selectedKey={selectedKey}
                  categoryColors={categoryColors}
                  activeScheduleId={editingSchedule?.schedule_id ?? null}
                  onOpenDay={selectDate}
                  onCreateDay={(date) => openCreatePanel(date)}
                  onOpenSchedule={(schedule) => {
                    selectDate(new Date(schedule.start_datetime));
                    openEditPanel(schedule);
                  }}
                  onScheduleTimeChange={moveScheduleOnCalendar}
                />
              ) : selectedSchedules.length === 0 ? (
                <EmptyState
                  title="선택한 날짜에 일정이 없습니다"
                  description="오른쪽 패널에서 새 일정을 추가해 보세요."
                />
              ) : (
                <div className="space-y-5">
                  {allDaySchedules.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        종일 일정
                      </div>
                      <ul className="space-y-2">
                        {allDaySchedules.map((schedule) => (
                          <TimelineItem
                            key={schedule.schedule_id}
                            schedule={schedule}
                            highlighted={
                              schedule.schedule_id === deepLinkedScheduleId
                            }
                            selectable
                            selected={selectedScheduleIds.has(
                              schedule.schedule_id,
                            )}
                            onToggleSelect={() =>
                              toggleScheduleSelection(schedule.schedule_id)
                            }
                            onEdit={() => openEditPanel(schedule)}
                            onDelete={async () => {
                              if (!confirm("정말 삭제하시겠습니까?")) return;
                              await deleteMutation.mutateAsync(
                                schedule.schedule_id,
                              );
                            }}
                            deleting={deleteMutation.isPending}
                          />
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      일간 타임라인
                    </div>
                    {timedSchedules.length > 0 ? (
                      <ul className="space-y-2">
                        {timedSchedules.map((schedule) => (
                          <TimelineItem
                            key={schedule.schedule_id}
                            schedule={schedule}
                            highlighted={
                              schedule.schedule_id === deepLinkedScheduleId
                            }
                            selectable
                            selected={selectedScheduleIds.has(
                              schedule.schedule_id,
                            )}
                            onToggleSelect={() =>
                              toggleScheduleSelection(schedule.schedule_id)
                            }
                            onEdit={() => openEditPanel(schedule)}
                            onDelete={async () => {
                              if (!confirm("정말 삭제하시겠습니까?")) return;
                              await deleteMutation.mutateAsync(
                                schedule.schedule_id,
                              );
                            }}
                            deleting={deleteMutation.isPending}
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        시간 지정 일정이 없습니다.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {panelMode && (
            <ScheduleFormPanel
              key={panelKey}
              mode={panelMode}
              initial={formInitial}
              schedule={editingSchedule}
              isPending={
                panelMode === "edit"
                  ? updateMutation.isPending || createSchedulesMutation.isPending
                  : panelMode === "create" || panelMode === "repeat"
                  ? createSchedulesMutation.isPending
                  : updateMutation.isPending
              }
              onClose={closePanel}
              deletePending={deleteMutation.isPending}
              onDelete={
                panelMode === "edit" && editingSchedule
                  ? async () => {
                      await deleteMutation.mutateAsync(
                        editingSchedule.schedule_id,
                      );
                      closePanel();
                    }
                  : undefined
              }
              onSubmit={async (forms, options) => {
                const intent = options?.intent ?? "manual";

                if (intent === "repeat" && editingSchedule) {
                  const [baseForm, ...additionalForms] = forms;
                  if (baseForm) {
                    await updateMutation.mutateAsync({
                      scheduleId: editingSchedule.schedule_id,
                      payload: toPayload(baseForm),
                    });
                  }
                  if (additionalForms.length > 0) {
                    await createSchedulesMutation.mutateAsync(
                      additionalForms.map((form) => toPayload(form)),
                    );
                  }
                  return;
                }

                if (panelMode === "create" || panelMode === "repeat") {
                  const payloads = forms.map((form) => toPayload(form));
                  const createdSchedules =
                    await createSchedulesMutation.mutateAsync(payloads);
                  const firstCreated = createdSchedules[0];
                  const firstPayload = payloads[0];
                  const start = new Date(
                    firstCreated?.start_datetime ??
                      firstPayload?.start_datetime,
                  );
                  if (!Number.isNaN(start.getTime())) {
                    selectDate(start);
                  }
                  closePanel();
                } else if (editingSchedule) {
                  await updateMutation.mutateAsync({
                    scheduleId: editingSchedule.schedule_id,
                    payload: toPayload(forms[0]),
                  });
                }
              }}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
