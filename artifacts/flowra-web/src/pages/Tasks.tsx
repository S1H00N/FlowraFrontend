import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Clock3,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import ScheduleLinkedTasks from "@/components/ScheduleLinkedTasks";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import { Checkbox } from "@/components/ui/checkbox";
import TaskCompletionToggleButton from "@/components/TaskCompletionToggleButton";
import { useCategories } from "@/hooks/useCategories";
import {
  useCompanySchedules,
  useDeleteCompanySchedule,
} from "@/hooks/useCompanySchedules";
import { useHolidaysInRange } from "@/hooks/useHolidays";
import {
  useCreateSchedules,
  useDeleteSchedule,
  useDeleteSchedules,
  useSchedules,
  useSetScheduleCompletion,
} from "@/hooks/useSchedules";
import {
  useDeleteTasks,
  useSetTaskCompletion,
  useTasks,
} from "@/hooks/useTasks";
import {
  useCompanyAdminMe,
  useCreateCompanyAdminSchedule,
} from "@/hooks/useCompanyAdmin";
import {
  ScheduleFormPanel,
  companyScheduleToSchedule,
  emptyFormForDate,
  defaultSchedulePanelFloatingStyle,
  groupHolidaysByDate,
  mergeSchedules,
  toPayload,
  type DayMeta,
} from "@/pages/Schedules";
import {
  type Holiday,
  type Schedule,
  type ScheduleType,
  type Task,
  type TaskPriority,
  type Category,
} from "@/types";
import {
  getClassificationLabel,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { getErrorMessage } from "@/lib/error";
import { toast } from "@/lib/toast";
import { useUserSettings, type WeekStartDay } from "@/lib/userSettings";
import { toOffsetISOString } from "@/utils/dateUtils";

type BoardFilter = "all" | "today" | "active" | "completed";

interface ScheduleGroup {
  key: string;
  title: string;
  schedules: Schedule[];
}

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

const scheduleTypeColor: Record<ScheduleType, string> = {
  personal: "#14b8a6",
  meeting: "#6366f1",
  fieldwork: "#8b5cf6",
  deadline: "#f59e0b",
  other: "#64748b",
};

const taskPriorityDot: Record<TaskPriority, string> = {
  low: "bg-slate-300",
  medium: "bg-violet-400",
  high: "bg-amber-400",
  urgent: "bg-rose-500",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function weekStartIndex(weekStart: WeekStartDay) {
  return weekStart === "monday" ? 1 : 0;
}

function daysSinceWeekStart(date: Date, weekStart: WeekStartDay) {
  return (date.getDay() - weekStartIndex(weekStart) + 7) % 7;
}

function orderedWeekdayLabels(weekStart: WeekStartDay) {
  const start = weekStartIndex(weekStart);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = (start + offset) % 7;
    return { day, label: weekdayLabels[day] };
  });
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatMonthTitle(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatScheduleTime(schedule: Schedule) {
  if (schedule.all_day) return "종일";
  const start = new Date(schedule.start_datetime);
  if (Number.isNaN(start.getTime())) return "";

  return start.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTaskDue(iso?: string | null) {
  if (!iso) return "마감 없음";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "마감 없음";

  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scheduleOverlapsDate(schedule: Schedule, date: Date) {
  const dayStart = startOfDay(date).getTime();
  const dayEnd = endOfDay(date).getTime();
  const start = new Date(schedule.start_datetime).getTime();
  const end = schedule.end_datetime
    ? new Date(schedule.end_datetime).getTime()
    : start;

  if (Number.isNaN(start)) return false;
  return start <= dayEnd && (Number.isNaN(end) ? start : end) >= dayStart;
}

function buildMonthCells(month: Date, weekStart: WeekStartDay) {
  const first = startOfMonth(month);
  const cursor = addDays(first, -daysSinceWeekStart(first, weekStart));
  const totalDays = endOfMonth(month).getDate();
  const totalCells =
    Math.ceil((daysSinceWeekStart(first, weekStart) + totalDays) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const date = addDays(cursor, index);
    return {
      date,
      key: toDateKey(date),
      currentMonth: date.getMonth() === month.getMonth(),
    };
  });
}

function scheduleProgress(tasks: Task[], schedule: Schedule) {
  const done = tasks.filter((task) => task.status === "done").length;
  const total = tasks.length;
  const completed = total > 0 ? done === total : !!schedule.is_completed;

  return {
    done,
    total,
    completed,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
  };
}

function sortSchedules(a: Schedule, b: Schedule) {
  return (
    new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
  );
}

function taskDueOnDate(task: Task, date: Date) {
  if (!task.due_datetime) return false;
  const dueTime = new Date(task.due_datetime).getTime();
  if (Number.isNaN(dueTime)) return false;
  return (
    dueTime >= startOfDay(date).getTime() &&
    dueTime <= endOfDay(date).getTime()
  );
}

function taskDueBeforeDate(task: Task, date: Date) {
  if (!task.due_datetime) return false;
  const dueTime = new Date(task.due_datetime).getTime();
  if (Number.isNaN(dueTime)) return false;
  return dueTime < startOfDay(date).getTime();
}

function sortIndependentTasks(a: Task, b: Task) {
  if (a.status === "done" && b.status !== "done") return 1;
  if (a.status !== "done" && b.status === "done") return -1;

  const aDue = a.due_datetime
    ? new Date(a.due_datetime).getTime()
    : Number.POSITIVE_INFINITY;
  const bDue = b.due_datetime
    ? new Date(b.due_datetime).getTime()
    : Number.POSITIVE_INFINITY;
  return aDue - bDue;
}

function groupSchedules(
  schedules: Schedule[],
  selectedDate: Date,
  exact: boolean,
) {
  if (exact) {
    return [
      {
        key: toDateKey(selectedDate),
        title: formatFullDate(selectedDate),
        schedules,
      },
    ];
  }

  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  const buckets: ScheduleGroup[] = [
    { key: "today", title: "오늘", schedules: [] },
    { key: "tomorrow", title: "내일", schedules: [] },
    { key: "week", title: "이번 주", schedules: [] },
    { key: "later", title: "이후", schedules: [] },
  ];

  schedules.forEach((schedule) => {
    const start = startOfDay(new Date(schedule.start_datetime));
    if (Number.isNaN(start.getTime())) return;

    if (start.getTime() === today.getTime()) {
      buckets[0].schedules.push(schedule);
    } else if (start.getTime() === tomorrow.getTime()) {
      buckets[1].schedules.push(schedule);
    } else if (start.getTime() < weekEnd.getTime()) {
      buckets[2].schedules.push(schedule);
    } else {
      buckets[3].schedules.push(schedule);
    }
  });

  return buckets.filter((group) => group.schedules.length > 0);
}

function MiniCalendar({
  visibleMonth,
  selectedDateKey,
  dateMode,
  dateMeta,
  holidaysByDate,
  weekStart,
  onMoveMonth,
  onResetMonth,
  onSelectDate,
}: {
  visibleMonth: Date;
  selectedDateKey: string;
  dateMode: boolean;
  dateMeta: Map<string, DayMeta>;
  holidaysByDate: Map<string, Holiday[]>;
  weekStart: WeekStartDay;
  onMoveMonth: (amount: number) => void;
  onResetMonth: () => void;
  onSelectDate: (date: Date) => void;
}) {
  const today = new Date();
  const isCurrentMonth =
    visibleMonth.getFullYear() === today.getFullYear() &&
    visibleMonth.getMonth() === today.getMonth();
  const weekdayHeaders = useMemo(
    () => orderedWeekdayLabels(weekStart),
    [weekStart],
  );
  const cells = useMemo(
    () => buildMonthCells(visibleMonth, weekStart),
    [visibleMonth, weekStart],
  );
  const todayKey = toDateKey(new Date());
  const selectedWeekSet = useMemo(() => {
    const now = new Date();
    const start = addDays(now, -daysSinceWeekStart(now, weekStart));
    return new Set(
      Array.from({ length: 7 }, (_, offset) => toDateKey(addDays(start, offset))),
    );
  }, [weekStart]);

  return (
    <aside className="w-full px-3 pb-3 pt-2">
      <div className="mb-1 flex h-7 items-center justify-between gap-2">
        {isCurrentMonth ? (
          <span aria-hidden="true" />
        ) : (
          <h2 className="min-w-0 truncate text-sm font-bold text-slate-950">
            {formatMonthTitle(visibleMonth)}
          </h2>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={onResetMonth}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="이번 달로 이동"
              title="이번 달로 이동"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onMoveMonth(-1)}
            aria-label="이전 달"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onMoveMonth(1)}
            aria-label="다음 달"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2">
        <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-slate-400">
          {weekdayHeaders.map(({ day, label }) => (
            <span
              key={day}
              className={
                day === 0
                  ? "text-rose-500"
                  : day === 6
                    ? "text-sky-500"
                    : undefined
              }
            >
              {label}
            </span>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-y-1 overflow-hidden rounded-xl text-center">
          {cells.map(({ date, key, currentMonth }, index) => {
            const selected = dateMode && selectedDateKey === key;
            const today = currentMonth && todayKey === key;
            const highlight = selected || today;
            const meta = dateMeta.get(key);
            const count = meta?.count ?? 0;
            const isHoliday = (holidaysByDate.get(key)?.length ?? 0) > 0;
            const selectedWeek = selectedWeekSet.has(key);
            const column = index % 7;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDate(date)}
                className={`relative flex h-8 items-center justify-center text-xs font-semibold leading-none transition ${
                  selectedWeek && !highlight && column === 0
                    ? "rounded-l-xl"
                    : ""
                } ${
                  selectedWeek && !highlight && column === 6
                    ? "rounded-r-xl"
                    : ""
                } ${selectedWeek && !highlight ? "bg-slate-100" : ""} ${
                  highlight
                    ? "z-10 rounded-lg !bg-red-500 !text-white shadow-sm"
                    : currentMonth
                      ? isHoliday
                        ? "rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                      : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                }`}
                aria-label={`${formatFullDate(date)} 일정 ${count}개`}
              >
                {date.getDate()}
                {count > 0 && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-1 flex items-center justify-center">
                    <span
                      className={`h-1 w-1 rounded-full ${
                        highlight
                          ? "bg-white"
                          : meta?.hasDeadline
                            ? "bg-rose-500"
                            : "bg-violet-500"
                      }`}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

    </aside>
  );
}

function ScheduleCard({
  schedule,
  category,
  tasks,
  expanded,
  deleting,
  selectedSchedule,
  selectedTaskIds,
  onToggle,
  onDelete,
  onToggleScheduleSelection,
  onToggleTaskSelection,
  onOpenAddTaskPanel,
}: {
  schedule: Schedule;
  category?: Category | null;
  tasks: Task[];
  expanded: boolean;
  deleting: boolean;
  selectedSchedule: boolean;
  selectedTaskIds: Set<number>;
  onToggle: () => void;
  onDelete: () => Promise<void>;
  onToggleScheduleSelection: () => void;
  onToggleTaskSelection: (taskId: number) => void;
  onOpenAddTaskPanel: () => void;
}) {
  const classificationSettings = useClassificationSettings();
  const completionMutation = useSetTaskCompletion();
  const scheduleCompletionMutation = useSetScheduleCompletion();
  const [error, setError] = useState<string | null>(null);
  const progress = scheduleProgress(tasks, schedule);
  const scheduleCompleted = !!schedule.is_completed;
  const scheduleCompletionUpdating =
    scheduleCompletionMutation.isPending &&
    scheduleCompletionMutation.variables?.scheduleId === schedule.schedule_id;
  const accentColor =
    category?.color || scheduleTypeColor[schedule.schedule_type] || "#64748b";
  const classificationLabel = getClassificationLabel(
    classificationSettings,
    "scheduleTypes",
    schedule.schedule_type,
  );
  const chipLabel = category?.name ?? classificationLabel;
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        const aDue = a.due_datetime ? new Date(a.due_datetime).getTime() : 0;
        const bDue = b.due_datetime ? new Date(b.due_datetime).getTime() : 0;
        return aDue - bDue;
      }),
    [tasks],
  );

  const handleCompletionChange = async (task: Task, completed: boolean) => {
    if (completed === (task.status === "done")) return;

    setError(null);
    try {
      await completionMutation.mutateAsync({
        taskId: task.task_id,
        completed,
      });
    } catch (err) {
      setError(getErrorMessage(err, "완료 상태 변경에 실패했습니다."));
    }
  };

  const handleScheduleCompletionChange = async (completed: boolean) => {
    if (schedule.is_company_schedule || completed === scheduleCompleted) return;

    setError(null);
    try {
      await scheduleCompletionMutation.mutateAsync({
        scheduleId: schedule.schedule_id,
        completed,
      });
    } catch (err) {
      setError(getErrorMessage(err, "일정 상태 변경에 실패했습니다."));
    }
  };

  const handleDeleteSchedule = async () => {
    const message = schedule.is_company_schedule
      ? `"${schedule.title}" 회사 일정의 삭제 처리를 요청할까요?`
      : `"${schedule.title}" 일정을 삭제하시겠습니까?`;
    if (!confirm(message)) return;

    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(getErrorMessage(err, "일정 삭제에 실패했습니다."));
    }
  };

  return (
    <li
      className={`flowra-list-card overflow-hidden transition ${
        selectedSchedule ? "ring-2 ring-violet-100" : ""
      }`}
    >
      <div className="group relative flex items-center">
        <span
          className="absolute inset-y-4 left-4 w-1 rounded-full"
          style={{ backgroundColor: accentColor }}
          aria-hidden
        />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="grid min-h-[4.25rem] min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-4 pl-8 pr-2 text-left transition hover:bg-slate-50"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3
                className={`truncate text-sm font-bold ${
                  scheduleCompleted
                    ? "text-slate-500 line-through"
                    : "text-slate-950"
                }`}
              >
                {schedule.title || "제목 없음"}
              </h3>
              {scheduleCompleted && (
                <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700">
                  완료
                </span>
              )}
              <span
                className="rounded-md px-2 py-0.5 text-[11px] font-bold"
                style={{
                  backgroundColor: `${accentColor}1A`,
                  color: accentColor,
                }}
              >
                {chipLabel}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {formatScheduleTime(schedule)}
              </span>
              <span>{formatFullDate(new Date(schedule.start_datetime))}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full rounded-full bg-violet-500"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <span className="w-9 text-right text-xs font-medium text-slate-400">
                {progress.done}/{progress.total}
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </div>
        </button>
        {!schedule.is_company_schedule && (
          <TaskCompletionToggleButton
            completed={scheduleCompleted}
            disabled={scheduleCompletionUpdating}
            compact
            onCompletedChange={(completed) =>
              void handleScheduleCompletionChange(completed)
            }
            className="mr-2"
          />
        )}
        <Checkbox
          checked={selectedSchedule}
          onCheckedChange={() => onToggleScheduleSelection()}
          aria-label={`${schedule.title} 삭제 대상으로 선택`}
          title="삭제 대상으로 선택"
          className="mr-2 h-5 w-5 rounded-full"
        />
        <button
          type="button"
          onClick={() => void handleDeleteSchedule()}
          disabled={deleting}
          aria-label={`${schedule.title} 삭제`}
          title="일정 삭제"
          className="mr-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 opacity-100 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-slate-100 px-6 py-4 pl-8">
            {sortedTasks.length > 0 ? (
              <ul className="space-y-3">
                {sortedTasks.map((task) => {
                  const done = task.status === "done";
                  const selected = selectedTaskIds.has(task.task_id);
                  const updatingTask =
                    completionMutation.isPending &&
                    completionMutation.variables?.taskId === task.task_id;
                  return (
                    <li
                      key={task.task_id}
                      className={`group flex items-start gap-3 rounded-lg transition-colors ${
                        selected ? "bg-violet-50/70" : ""
                      }`}
                    >
                      <TaskCompletionToggleButton
                        completed={done}
                        disabled={updatingTask}
                        compact
                        onCompletedChange={(completed) =>
                          handleCompletionChange(task, completed)
                        }
                      />
                      <span
                        className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                          taskPriorityDot[task.priority]
                        }`}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-medium ${
                            done
                              ? "text-slate-400 line-through"
                              : "text-slate-700"
                          }`}
                        >
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {formatTaskDue(task.due_datetime)}
                        </p>
                      </div>
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() =>
                          onToggleTaskSelection(task.task_id)
                        }
                        aria-label={`${task.title} 삭제 대상으로 선택`}
                        title="삭제 대상으로 선택"
                        className="mt-0.5 h-5 w-5 rounded-full"
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-medium text-slate-500">
                아직 연결된 할 일이 없습니다.
              </p>
            )}

            <div className="mt-4">
              <button
                type="button"
                onClick={onOpenAddTaskPanel}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 sm:w-auto sm:px-4"
              >
                <Plus className="h-4 w-4" />할 일 추가
              </button>
            </div>

            {error && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function IndependentTasksSection({
  tasks,
  selectedTaskIds,
  onToggleTaskSelection,
}: {
  tasks: Task[];
  selectedTaskIds: Set<number>;
  onToggleTaskSelection: (taskId: number) => void;
}) {
  const completionMutation = useSetTaskCompletion();
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleCompletionChange = async (task: Task, completed: boolean) => {
    if (completed === (task.status === "done")) return;

    setError(null);
    try {
      await completionMutation.mutateAsync({
        taskId: task.task_id,
        completed,
      });
    } catch (err) {
      setError(getErrorMessage(err, "완료 상태 변경에 실패했습니다."));
    }
  };

  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 border-b border-slate-200/70 pb-2 text-left text-sm font-bold text-slate-500"
      >
        <span>독립 할 일</span>
        <span className="text-slate-400">- {tasks.length}개</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="flowra-list-card mt-3 divide-y divide-slate-100 overflow-hidden">
            {tasks.map((task) => {
              const done = task.status === "done";
              const selected = selectedTaskIds.has(task.task_id);
              const updating =
                completionMutation.isPending &&
                completionMutation.variables?.taskId === task.task_id;
              return (
                <li
                  key={task.task_id}
                  className={`group flex items-start gap-3 px-5 py-4 transition-colors ${
                    selected ? "bg-violet-50/70" : ""
                  }`}
                >
                  <TaskCompletionToggleButton
                    completed={done}
                    disabled={updating}
                    compact
                    onCompletedChange={(completed) =>
                      void handleCompletionChange(task, completed)
                    }
                  />
                  <span
                    className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                      taskPriorityDot[task.priority]
                    }`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-semibold ${
                        done ? "text-slate-400 line-through" : "text-slate-800"
                      }`}
                    >
                      {task.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatTaskDue(task.due_datetime)}
                    </p>
                    {task.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {task.description}
                      </p>
                    )}
                  </div>
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      onToggleTaskSelection(task.task_id)
                    }
                    aria-label={`${task.title} 삭제 대상으로 선택`}
                    title="삭제 대상으로 선택"
                    className="mt-0.5 h-5 w-5 rounded-full"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}

function TaskAddPanelContent({
  schedule,
  category,
  tasks,
  onClose,
}: {
  schedule: Schedule;
  category?: Category | null;
  tasks: Task[];
  onClose: () => void;
}) {
  const classificationSettings = useClassificationSettings();
  const accentColor =
    category?.color || scheduleTypeColor[schedule.schedule_type] || "#64748b";
  const scheduleTypeLabel = getClassificationLabel(
    classificationSettings,
    "scheduleTypes",
    schedule.schedule_type,
  );
  const chipLabel = category?.name ?? scheduleTypeLabel;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-slate-400">
              선택한 일정
            </p>
            <h2 className="mt-1 truncate text-lg font-black text-slate-950">
              {schedule.title || "제목 없음"}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
              <span
                className="rounded-md px-2 py-0.5"
                style={{
                  backgroundColor: `${accentColor}1A`,
                  color: accentColor,
                }}
              >
                {chipLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {formatScheduleTime(schedule)}
              </span>
              <span>{formatFullDate(new Date(schedule.start_datetime))}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="할 일 추가 패널 닫기"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <ScheduleLinkedTasks
          schedule={schedule}
          tasks={tasks}
          variant="panel"
          linkTasks={false}
        />
      </div>
    </div>
  );
}

function TaskAddSidePanel({
  schedule,
  category,
  tasks,
  onClose,
}: {
  schedule: Schedule;
  category?: Category | null;
  tasks: Task[];
  onClose: () => void;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-950/20 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex min-h-0 w-full max-w-md flex-col overflow-hidden border-l border-slate-200 bg-white shadow-xl md:w-[300px] md:max-w-none lg:w-[340px]">
        <TaskAddPanelContent
          schedule={schedule}
          category={category}
          tasks={tasks}
          onClose={onClose}
        />
      </aside>
    </>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-bold transition ${
        active
          ? "flowra-filter-active"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

export default function Tasks() {
  const { weekStart, showHolidays } = useUserSettings();
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    toDateKey(new Date()),
  );
  const [dateMode, setDateMode] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [expandedScheduleIds, setExpandedScheduleIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [scheduleAddPanelOpen, setScheduleAddPanelOpen] = useState(false);
  const [taskPanelScheduleId, setTaskPanelScheduleId] = useState<number | null>(
    null,
  );
  const selectedDate = useMemo(
    () => fromDateKey(selectedDateKey),
    [selectedDateKey],
  );
  const queryRange = useMemo(() => {
    const start = startOfMonth(visibleMonth);
    const end = endOfMonth(addMonths(visibleMonth, 1));
    return {
      start_from: toOffsetISOString(start),
      start_to: toOffsetISOString(end),
    };
  }, [visibleMonth]);
  const schedulesQuery = useSchedules(queryRange);
  const createSchedulesMutation = useCreateSchedules();
  const deleteScheduleMutation = useDeleteSchedule();
  const deleteSchedulesMutation = useDeleteSchedules();
  const companyAdminMeQuery = useCompanyAdminMe();
  const hasCompanyMembership = companyAdminMeQuery.isSuccess;
  const companySchedulesQuery = useCompanySchedules(queryRange, {
    enabled: hasCompanyMembership,
  });
  const createCompanyScheduleMutation = useCreateCompanyAdminSchedule();
  const deleteCompanyScheduleMutation = useDeleteCompanySchedule();
  const tasksQuery = useTasks();
  const deleteTasksMutation = useDeleteTasks();
  const categoriesQuery = useCategories("schedule");
  const classificationSettings = useClassificationSettings();
  const companySchedules = useMemo(
    () =>
      (companySchedulesQuery.data ?? []).map((schedule) =>
        companyScheduleToSchedule(schedule),
      ),
    [companySchedulesQuery.data],
  );
  const schedules = useMemo(
    () => mergeSchedules(schedulesQuery.data ?? [], companySchedules),
    [schedulesQuery.data, companySchedules],
  );
  const tasks = tasksQuery.data ?? [];
  const categoryById = useMemo(
    () =>
      new Map(
        (categoriesQuery.data ?? []).map((category) => [
          category.category_id,
          category,
        ]),
      ),
    [categoriesQuery.data],
  );
  const tasksByScheduleId = useMemo(() => {
    const map = new Map<number, Task[]>();
    tasks.forEach((task) => {
      if (!task.schedule_id) return;
      const list = map.get(task.schedule_id) ?? [];
      list.push(task);
      map.set(task.schedule_id, list);
    });
    return map;
  }, [tasks]);
  const taskPanelSchedule = useMemo(
    () =>
      taskPanelScheduleId === null
        ? null
        : (schedules.find(
            (schedule) => schedule.schedule_id === taskPanelScheduleId,
          ) ?? null),
    [schedules, taskPanelScheduleId],
  );
  const taskPanelCategory = taskPanelSchedule?.category_id
    ? categoryById.get(taskPanelSchedule.category_id)
    : null;
  const taskPanelTasks = taskPanelSchedule
    ? (tasksByScheduleId.get(taskPanelSchedule.schedule_id) ?? [])
    : [];
  const dateMeta = useMemo(() => {
    const map = new Map<string, DayMeta>();
    buildMonthCells(visibleMonth, weekStart).forEach(({ date, key }) => {
      const matching = schedules.filter((schedule) =>
        scheduleOverlapsDate(schedule, date),
      );
      if (matching.length > 0) {
        map.set(key, {
          count: matching.length,
          hasDeadline: matching.some(
            (schedule) => schedule.schedule_type === "deadline",
          ),
        });
      }
    });
    return map;
  }, [schedules, visibleMonth, weekStart]);
  const holidayRange = useMemo(() => {
    const cells = buildMonthCells(visibleMonth, weekStart);
    const first = cells[0]?.date ?? visibleMonth;
    const last = cells[cells.length - 1]?.date ?? visibleMonth;
    return {
      start_date: toDateKey(first),
      end_date: toDateKey(last),
      public_only: true,
    };
  }, [visibleMonth, weekStart]);
  const holidaysQuery = useHolidaysInRange(holidayRange, {
    enabled: showHolidays,
  });
  const holidaysByDate = useMemo(
    () =>
      showHolidays
        ? groupHolidaysByDate(holidaysQuery.data ?? [])
        : new Map<string, Holiday[]>(),
    [holidaysQuery.data, showHolidays],
  );
  const filteredSchedules = useMemo(() => {
    const today = new Date();
    const keyword = search.trim().toLowerCase();

    return schedules
      .filter((schedule) => {
        const linkedTasks = tasksByScheduleId.get(schedule.schedule_id) ?? [];
        const scheduleCompleted = !!schedule.is_completed;
        const useExactDate = dateMode || filter === "today";
        const targetDate = filter === "today" ? today : selectedDate;

        if (useExactDate && !scheduleOverlapsDate(schedule, targetDate)) {
          return false;
        }
        if (
          !useExactDate &&
          new Date(schedule.start_datetime) < startOfDay(today)
        ) {
          return false;
        }
        if (filter === "active" && scheduleCompleted) return false;
        if (filter === "completed" && !scheduleCompleted) return false;
        if (keyword) {
          const category = schedule.category_id
            ? categoryById.get(schedule.category_id)
            : null;
          const haystack = [
            schedule.title,
            schedule.location,
            schedule.description,
            category?.name,
            getClassificationLabel(
              classificationSettings,
              "scheduleTypes",
              schedule.schedule_type,
            ),
            ...linkedTasks.map((task) => task.title),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(keyword)) return false;
        }
        return true;
      })
      .sort(sortSchedules);
  }, [
    categoryById,
    classificationSettings,
    dateMode,
    filter,
    schedules,
    search,
    selectedDate,
    tasksByScheduleId,
  ]);
  const filteredIndependentTasks = useMemo(() => {
    const today = new Date();
    const keyword = search.trim().toLowerCase();
    const useExactDate = dateMode || filter === "today";
    const targetDate = filter === "today" ? today : selectedDate;

    return tasks
      .filter((task) => task.schedule_id == null)
      .filter((task) => {
        if (useExactDate && !taskDueOnDate(task, targetDate)) return false;
        if (!useExactDate && taskDueBeforeDate(task, today)) return false;
        if (filter !== "completed" && task.status === "done") return false;
        if (filter === "completed" && task.status !== "done") return false;

        if (keyword) {
          const haystack = [task.title, task.description, task.location]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(keyword)) return false;
        }

        return true;
      })
      .sort(sortIndependentTasks);
  }, [dateMode, filter, search, selectedDate, tasks]);
  const groups = useMemo(
    () =>
      groupSchedules(
        filteredSchedules,
        selectedDate,
        dateMode || filter === "today",
      ),
    [dateMode, filter, filteredSchedules, selectedDate],
  );
  const visibleTasks = useMemo(
    () => [
      ...filteredIndependentTasks,
      ...filteredSchedules.flatMap(
        (schedule) => tasksByScheduleId.get(schedule.schedule_id) ?? [],
      ),
    ],
    [filteredIndependentTasks, filteredSchedules, tasksByScheduleId],
  );
  const selectableTaskIds = useMemo(
    () => [
      ...filteredIndependentTasks.map((task) => task.task_id),
      ...filteredSchedules
        .filter((schedule) => expandedScheduleIds.has(schedule.schedule_id))
        .flatMap((schedule) =>
          (tasksByScheduleId.get(schedule.schedule_id) ?? []).map(
            (task) => task.task_id,
          ),
        ),
    ],
    [
      expandedScheduleIds,
      filteredIndependentTasks,
      filteredSchedules,
      tasksByScheduleId,
    ],
  );
  const selectableScheduleIds = useMemo(
    () => filteredSchedules.map((schedule) => schedule.schedule_id),
    [filteredSchedules],
  );
  const selectedTaskCount = selectedTaskIds.size;
  const selectedScheduleCount = selectedScheduleIds.size;

  useEffect(() => {
    const selectableIds = new Set(selectableTaskIds);
    setSelectedTaskIds((current) => {
      const next = new Set(
        [...current].filter((taskId) => selectableIds.has(taskId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [selectableTaskIds]);

  useEffect(() => {
    const selectableIds = new Set(selectableScheduleIds);
    setSelectedScheduleIds((current) => {
      const next = new Set(
        [...current].filter((scheduleId) => selectableIds.has(scheduleId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [selectableScheduleIds]);

  const visibleDoneCount = visibleTasks.filter(
    (task) => task.status === "done",
  ).length;
  const visibleTaskCount = visibleTasks.length;
  const progressPercent =
    visibleTaskCount > 0
      ? Math.round((visibleDoneCount / visibleTaskCount) * 100)
      : 0;
  const isLoading =
    schedulesQuery.isLoading ||
    tasksQuery.isLoading ||
    companySchedulesQuery.isLoading;
  const error =
    schedulesQuery.error ?? tasksQuery.error ?? companySchedulesQuery.error;
  const isError =
    schedulesQuery.isError ||
    tasksQuery.isError ||
    companySchedulesQuery.isError;
  const isFetching =
    schedulesQuery.isFetching ||
    tasksQuery.isFetching ||
    companySchedulesQuery.isFetching;
  const sidePanelOpen = scheduleAddPanelOpen || taskPanelScheduleId !== null;
  const deleteSchedulesPending =
    deleteSchedulesMutation.isPending || deleteCompanyScheduleMutation.isPending;

  const toggleTaskSelection = (taskId: number) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const clearTaskSelection = () => {
    setSelectedTaskIds(new Set());
  };

  const toggleScheduleSelection = (scheduleId: number) => {
    setSelectedScheduleIds((current) => {
      const next = new Set(current);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
  };

  const clearScheduleSelection = () => {
    setSelectedScheduleIds(new Set());
  };

  const deleteSelectedTasks = async () => {
    if (selectedTaskIds.size === 0) return;
    if (!confirm(`선택한 할 일 ${selectedTaskIds.size}개를 삭제할까요?`)) {
      return;
    }

    try {
      const result = await deleteTasksMutation.mutateAsync([
        ...selectedTaskIds,
      ]);

      if (result.failedIds.length > 0) {
        setSelectedTaskIds(new Set(result.failedIds));
        toast.error(
          `할 일 ${result.deletedIds.length}개 삭제, ${result.failedIds.length}개 실패`,
        );
        return;
      }

      toast.success(`할 일 ${result.deletedIds.length}개를 삭제했습니다.`);
      clearTaskSelection();
    } catch {
      // The shared mutation error handler shows the failure message.
    }
  };

  const deleteSelectedSchedules = async () => {
    if (selectedScheduleIds.size === 0) return;
    if (!confirm(`선택한 일정 ${selectedScheduleIds.size}개를 삭제할까요?`)) {
      return;
    }

    try {
      const selectedSchedules = filteredSchedules.filter((schedule) =>
        selectedScheduleIds.has(schedule.schedule_id),
      );
      const personalScheduleIds = selectedSchedules
        .filter((schedule) => !schedule.is_company_schedule)
        .map((schedule) => schedule.schedule_id);
      const companySchedules = selectedSchedules.filter(
        (schedule) => schedule.is_company_schedule,
      );
      let deletedCount = 0;
      const failedIds: number[] = [];

      if (personalScheduleIds.length > 0) {
        const result =
          await deleteSchedulesMutation.mutateAsync(personalScheduleIds);
        deletedCount += result.deleted_count;
        failedIds.push(...result.failed_ids);
      }

      for (const schedule of companySchedules) {
        if (schedule.company_schedule_id == null) {
          failedIds.push(schedule.schedule_id);
          continue;
        }

        try {
          await deleteCompanyScheduleMutation.mutateAsync(
            schedule.company_schedule_id,
          );
          deletedCount += 1;
        } catch {
          failedIds.push(schedule.schedule_id);
        }
      }

      setSelectedScheduleIds(new Set(failedIds));

      if (failedIds.length > 0) {
        toast.error(
          `일정 ${deletedCount}개 삭제, ${failedIds.length}개 실패`,
        );
        return;
      }

      toast.success(`일정 ${deletedCount}개를 삭제했습니다.`);
      clearScheduleSelection();
    } catch {
      // The shared mutation error handler shows the failure message.
    }
  };

  const selectDate = (date: Date) => {
    const key = toDateKey(date);
    setSelectedDateKey(key);
    setVisibleMonth(startOfMonth(date));
    setDateMode(true);
    if (filter === "today") setFilter("all");
  };

  const showAll = () => {
    setDateMode(false);
    setFilter("all");
  };

  const toggleSchedule = (scheduleId: number) => {
    setExpandedScheduleIds((prev) => {
      const next = new Set(prev);
      if (next.has(scheduleId)) next.delete(scheduleId);
      else next.add(scheduleId);
      return next;
    });
  };

  const openTaskPanel = (scheduleId: number) => {
    setExpandedScheduleIds((prev) => {
      const next = new Set(prev);
      next.add(scheduleId);
      return next;
    });
    setScheduleAddPanelOpen(false);
    setTaskPanelScheduleId(scheduleId);
  };

  const openScheduleAddPanel = () => {
    setTaskPanelScheduleId(null);
    setScheduleAddPanelOpen(true);
  };

  const deleteScheduleFromBoard = async (schedule: Schedule) => {
    if (schedule.is_company_schedule) {
      if (schedule.company_schedule_id == null) {
        throw new Error("회사 일정 ID를 확인할 수 없습니다.");
      }
      await deleteCompanyScheduleMutation.mutateAsync(
        schedule.company_schedule_id,
      );
    } else {
      await deleteScheduleMutation.mutateAsync(schedule.schedule_id);
    }

    setExpandedScheduleIds((current) => {
      const next = new Set(current);
      next.delete(schedule.schedule_id);
      return next;
    });
    setSelectedScheduleIds((current) => {
      if (!current.has(schedule.schedule_id)) return current;
      const next = new Set(current);
      next.delete(schedule.schedule_id);
      return next;
    });
    setTaskPanelScheduleId((current) =>
      current === schedule.schedule_id ? null : current,
    );
  };

  return (
    <AppShell
      fullBleed
      aiChatButtonOffset={sidePanelOpen ? "340px" : "0px"}
      titleMeta={`완료 ${visibleDoneCount} / 전체 ${visibleTaskCount}`}
      headerActions={
        <div
          className={`flex min-w-0 items-center gap-2 transition-[margin] ${
            sidePanelOpen ? "md:mr-[300px] lg:mr-[340px]" : ""
          }`}
        >
          <label className="relative hidden min-[760px]:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="일정 또는 할 일 검색..."
              className="flowra-input h-9 w-64 pl-9 pr-3 text-sm"
            />
          </label>
          {!sidePanelOpen && (
            <button
              type="button"
              onClick={openScheduleAddPanel}
              className="flowra-primary-button inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />새 일정
            </button>
          )}
        </div>
      }
      sidebarExtra={
        <div data-flowra-schedule-sidebar>
          <MiniCalendar
            visibleMonth={visibleMonth}
            selectedDateKey={selectedDateKey}
            dateMode={dateMode || filter === "today"}
            dateMeta={dateMeta}
            holidaysByDate={holidaysByDate}
            weekStart={weekStart}
            onMoveMonth={(amount) =>
              setVisibleMonth((prev) => addMonths(prev, amount))
            }
            onResetMonth={() => setVisibleMonth(startOfMonth(new Date()))}
            onSelectDate={selectDate}
          />
        </div>
      }
    >
      <div className="flowra-workspace flex h-full min-h-0 flex-col">
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-[82rem]">
            <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <h1 className="text-base font-black text-slate-950">할 일</h1>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-violet-500"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-400">
                      완료 {visibleDoneCount} / 전체 {visibleTaskCount}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <FilterButton
                    active={filter === "all" && !dateMode}
                    onClick={showAll}
                  >
                    전체
                  </FilterButton>
                  <FilterButton
                    active={filter === "today"}
                    onClick={() => {
                      setFilter("today");
                      setDateMode(false);
                      setSelectedDateKey(toDateKey(new Date()));
                      setVisibleMonth(startOfMonth(new Date()));
                    }}
                  >
                    오늘
                  </FilterButton>
                  <FilterButton
                    active={filter === "active"}
                    onClick={() => setFilter("active")}
                  >
                    미완료
                  </FilterButton>
                  <FilterButton
                    active={filter === "completed"}
                    onClick={() => setFilter("completed")}
                  >
                    완료됨
                  </FilterButton>
                </div>

                {selectedTaskCount > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 px-2 py-1 min-[900px]:ml-auto">
                    <span className="px-1 text-xs font-bold text-violet-700">
                      {selectedTaskCount}개 선택
                    </span>
                    <button
                      type="button"
                      onClick={clearTaskSelection}
                      disabled={deleteTasksMutation.isPending}
                      className="inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-500 transition hover:bg-white disabled:opacity-50"
                    >
                      선택 해제
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSelectedTasks()}
                      disabled={deleteTasksMutation.isPending}
                      className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-red-600 px-2.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deleteTasksMutation.isPending ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                )}
                {selectedScheduleCount > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-2 py-1 min-[900px]:ml-auto">
                    <span className="px-1 text-xs font-bold text-red-700">
                      {selectedScheduleCount}개 일정 선택
                    </span>
                    <button
                      type="button"
                      onClick={clearScheduleSelection}
                      disabled={deleteSchedulesPending}
                      className="inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-500 transition hover:bg-white disabled:opacity-50"
                    >
                      선택 해제
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSelectedSchedules()}
                      disabled={deleteSchedulesPending}
                      className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-red-600 px-2.5 text-xs font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deleteSchedulesPending ? "삭제 중..." : "삭제"}
                    </button>
                  </div>
                )}
              </div>

              <label className="relative block min-[760px]:hidden">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="일정 또는 할 일 검색..."
                  className="flowra-input h-10 w-full pl-9 pr-3 text-sm"
                />
              </label>
            </div>

            {dateMode && filter !== "today" && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                {formatFullDate(selectedDate)}
                <button
                  type="button"
                  onClick={showAll}
                  aria-label="날짜 선택 해제"
                  className="rounded-full p-0.5 hover:bg-violet-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="flex h-full min-h-0">
            <div className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6">
              {isLoading ? (
                <FullSpinner message="일정과 할 일을 불러오는 중..." />
              ) : isError ? (
                <ErrorState
                  title="일정과 할 일을 불러오지 못했습니다"
                  message={(error as Error).message}
                  onRetry={() => {
                    void schedulesQuery.refetch();
                    void tasksQuery.refetch();
                    void companySchedulesQuery.refetch();
                  }}
                  retrying={isFetching}
                />
              ) : filteredSchedules.length === 0 &&
                filteredIndependentTasks.length === 0 ? (
                <EmptyState
                  title="표시할 일정이나 할 일이 없습니다"
                  description="필터나 날짜를 바꾸거나 새 일정을 추가해 보세요."
                />
              ) : (
                <div className="mx-auto max-w-[82rem] space-y-6">
                  {filteredIndependentTasks.length > 0 && (
                    <IndependentTasksSection
                      tasks={filteredIndependentTasks}
                      selectedTaskIds={selectedTaskIds}
                      onToggleTaskSelection={toggleTaskSelection}
                    />
                  )}
                  {filteredSchedules.length > 0 &&
                    groups.map((group) => (
                      <section key={group.key} className="space-y-3">
                        <div className="flex items-center gap-2 border-b border-slate-200/70 pb-2 text-sm font-bold text-slate-500">
                          <span>{group.title}</span>
                          <span className="text-slate-400">
                            - {group.schedules.length}개 일정
                          </span>
                        </div>
                        <ul className="space-y-3">
                          {group.schedules.map((schedule) => {
                            const category = schedule.category_id
                              ? categoryById.get(schedule.category_id)
                              : null;
                            const tasksForSchedule =
                              tasksByScheduleId.get(schedule.schedule_id) ?? [];
                            return (
                              <div
                                key={schedule.schedule_id}
                                className="relative"
                              >
                                <ScheduleCard
                                  schedule={schedule}
                                  category={category}
                                  tasks={tasksForSchedule}
                                  expanded={expandedScheduleIds.has(
                                    schedule.schedule_id,
                                  )}
                                  deleting={
                                    schedule.is_company_schedule
                                      ? deleteCompanyScheduleMutation.isPending &&
                                        deleteCompanyScheduleMutation.variables ===
                                          schedule.company_schedule_id
                                      : deleteScheduleMutation.isPending &&
                                        deleteScheduleMutation.variables ===
                                          schedule.schedule_id
                                  }
                                  selectedSchedule={selectedScheduleIds.has(
                                    schedule.schedule_id,
                                  )}
                                  selectedTaskIds={selectedTaskIds}
                                  onToggle={() =>
                                    toggleSchedule(schedule.schedule_id)
                                  }
                                  onDelete={() =>
                                    deleteScheduleFromBoard(schedule)
                                  }
                                  onToggleScheduleSelection={() =>
                                    toggleScheduleSelection(schedule.schedule_id)
                                  }
                                  onToggleTaskSelection={toggleTaskSelection}
                                  onOpenAddTaskPanel={() =>
                                    openTaskPanel(schedule.schedule_id)
                                  }
                                />
                              </div>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                </div>
              )}
            </div>

            {taskPanelSchedule && (
              <>
                {/* 할 일 패널이 Fixed로 뜰 때 컨텐츠를 밀어내기 위한 가상 공간(Placeholder) */}
                <div className="hidden shrink-0 transition-[width] md:block md:w-[300px] lg:w-[340px]" />
                <TaskAddSidePanel
                  schedule={taskPanelSchedule}
                  category={taskPanelCategory}
                  tasks={taskPanelTasks}
                  onClose={() => setTaskPanelScheduleId(null)}
                />
              </>
            )}
            {scheduleAddPanelOpen && (
              <>
                {/* 일정 패널이 Fixed로 뜰 때 컨텐츠를 밀어내기 위한 가상 공간(Placeholder) */}
                <div className="hidden shrink-0 transition-[width] md:block md:w-[300px] lg:w-[340px]" />
                <ScheduleFormPanel
                  mode="create"
                  initial={emptyFormForDate(selectedDate)}
                  isPending={
                    createSchedulesMutation.isPending ||
                    createCompanyScheduleMutation.isPending
                  }
                  onClose={() => setScheduleAddPanelOpen(false)}
                  companyName={companyAdminMeQuery.data?.company?.name}
                  onCompanySubmit={async (payload) => {
                    await createCompanyScheduleMutation.mutateAsync(payload);
                    setScheduleAddPanelOpen(false);
                  }}
                  onSubmit={async (forms) => {
                    const payloads = forms.map((form) => toPayload(form));
                    await createSchedulesMutation.mutateAsync(payloads);
                    setScheduleAddPanelOpen(false);
                  }}
                  floatingStyle={defaultSchedulePanelFloatingStyle}
                  panelLayout="docked"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
