import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Plus,
  Search,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import ScheduleLinkedTasks from "@/components/ScheduleLinkedTasks";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import TaskCompletionToggleButton from "@/components/TaskCompletionToggleButton";
import { useCategories } from "@/hooks/useCategories";
import { useSchedules, useCreateSchedules } from "@/hooks/useSchedules";
import { useSetTaskCompletion, useTasks } from "@/hooks/useTasks";
import {
  useCompanyAdminMe,
  useCreateCompanyAdminSchedule,
} from "@/hooks/useCompanyAdmin";
import {
  ScheduleFormPanel,
  emptyFormForDate,
  defaultSchedulePanelFloatingStyle,
  toPayload,
} from "@/pages/Schedules";
import {
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
  medium: "bg-indigo-400",
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

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const cursor = addDays(first, -first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(cursor, index);
    return {
      date,
      key: toDateKey(date),
      currentMonth: date.getMonth() === month.getMonth(),
    };
  });
}

function scheduleDateKey(schedule: Schedule) {
  const start = new Date(schedule.start_datetime);
  return Number.isNaN(start.getTime()) ? "" : toDateKey(start);
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

function groupSchedules(schedules: Schedule[], selectedDate: Date, exact: boolean) {
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
  countsByDate,
  onMoveMonth,
  onSelectDate,
  onShowAll,
}: {
  visibleMonth: Date;
  selectedDateKey: string;
  dateMode: boolean;
  countsByDate: Map<string, number>;
  onMoveMonth: (amount: number) => void;
  onSelectDate: (date: Date) => void;
  onShowAll: () => void;
}) {
  const cells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth]);
  const todayKey = toDateKey(new Date());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-950">
          {formatMonthTitle(visibleMonth)}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMoveMonth(-1)}
            aria-label="이전 달"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMoveMonth(1)}
            aria-label="다음 달"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-slate-400">
        {weekdayLabels.map((label, index) => (
          <span
            key={label}
            className={
              index === 0
                ? "text-rose-500"
                : index === 6
                  ? "text-indigo-500"
                  : undefined
            }
          >
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {cells.map(({ date, key, currentMonth }) => {
          const selected = dateMode && selectedDateKey === key;
          const today = todayKey === key;
          const count = countsByDate.get(key) ?? 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(date)}
              className={`relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition ${
                selected
                  ? "bg-indigo-500 text-white shadow-sm"
                  : today
                    ? "bg-indigo-50 text-indigo-700"
                    : currentMonth
                      ? "text-slate-700 hover:bg-slate-100"
                      : "text-slate-300 hover:bg-slate-50"
              }`}
              aria-label={`${formatFullDate(date)} 일정 ${count}개`}
            >
              {date.getDate()}
              {count > 0 && (
                <span
                  className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                    selected ? "bg-white" : "bg-indigo-500"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onShowAll}
        className="inline-flex h-8 w-full items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
      >
        전체 일정 보기
      </button>
    </div>
  );
}

function ScheduleCard({
  schedule,
  category,
  tasks,
  expanded,
  onToggle,
  onOpenAddTaskPanel,
}: {
  schedule: Schedule;
  category?: Category | null;
  tasks: Task[];
  expanded: boolean;
  onToggle: () => void;
  onOpenAddTaskPanel: () => void;
}) {
  const classificationSettings = useClassificationSettings();
  const completionMutation = useSetTaskCompletion();
  const [error, setError] = useState<string | null>(null);
  const progress = scheduleProgress(tasks, schedule);
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

  return (
    <li className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200/80">
      <div className="relative">
        <span
          className="absolute inset-y-4 left-4 w-1 rounded-full"
          style={{ backgroundColor: accentColor }}
          aria-hidden
        />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="grid min-h-[4.25rem] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-4 pl-8 text-left transition hover:bg-slate-50"
        >
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3
                className={`truncate text-sm font-bold ${
                  progress.completed ? "text-slate-500" : "text-slate-950"
                }`}
              >
                {schedule.title || "제목 없음"}
              </h3>
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
                  className="block h-full rounded-full bg-indigo-500"
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
                  return (
                    <li key={task.task_id} className="flex items-start gap-3">
                      <TaskCompletionToggleButton
                        completed={done}
                        disabled={completionMutation.isPending}
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
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm font-bold text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 sm:w-auto sm:px-4"
              >
                <Plus className="h-4 w-4" />
                할 일 추가
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
          ? "bg-indigo-50 text-indigo-700"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

export default function Tasks() {
  const [selectedDateKey, setSelectedDateKey] = useState(() =>
    toDateKey(new Date()),
  );
  const [dateMode, setDateMode] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [search, setSearch] = useState("");
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
  const companyAdminMeQuery = useCompanyAdminMe();
  const createCompanyScheduleMutation = useCreateCompanyAdminSchedule();
  const tasksQuery = useTasks();
  const categoriesQuery = useCategories("schedule");
  const classificationSettings = useClassificationSettings();
  const schedules = schedulesQuery.data ?? [];
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
  const countsByDate = useMemo(() => {
    const map = new Map<string, number>();
    buildMonthCells(visibleMonth).forEach(({ date, key }) => {
      const count = schedules.filter((schedule) =>
        scheduleOverlapsDate(schedule, date),
      ).length;
      if (count > 0) map.set(key, count);
    });
    return map;
  }, [schedules, visibleMonth]);
  const filteredSchedules = useMemo(() => {
    const today = new Date();
    const keyword = search.trim().toLowerCase();

    return schedules
      .filter((schedule) => {
        const linkedTasks = tasksByScheduleId.get(schedule.schedule_id) ?? [];
        const progress = scheduleProgress(linkedTasks, schedule);
        const useExactDate = dateMode || filter === "today";
        const targetDate = filter === "today" ? today : selectedDate;

        if (useExactDate && !scheduleOverlapsDate(schedule, targetDate)) {
          return false;
        }
        if (!useExactDate && new Date(schedule.start_datetime) < startOfDay(today)) {
          return false;
        }
        if (filter === "active" && progress.completed) return false;
        if (filter === "completed" && !progress.completed) return false;
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
  const groups = useMemo(
    () => groupSchedules(filteredSchedules, selectedDate, dateMode || filter === "today"),
    [dateMode, filter, filteredSchedules, selectedDate],
  );
  const visibleTasks = useMemo(
    () =>
      filteredSchedules.flatMap(
        (schedule) => tasksByScheduleId.get(schedule.schedule_id) ?? [],
      ),
    [filteredSchedules, tasksByScheduleId],
  );
  const visibleDoneCount = visibleTasks.filter(
    (task) => task.status === "done",
  ).length;
  const visibleTaskCount = visibleTasks.length;
  const progressPercent =
    visibleTaskCount > 0
      ? Math.round((visibleDoneCount / visibleTaskCount) * 100)
      : 0;
  const isLoading = schedulesQuery.isLoading || tasksQuery.isLoading;
  const error = schedulesQuery.error ?? tasksQuery.error;
  const isError = schedulesQuery.isError || tasksQuery.isError;
  const isFetching = schedulesQuery.isFetching || tasksQuery.isFetching;
  const sidePanelOpen = scheduleAddPanelOpen || taskPanelScheduleId !== null;

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
              className="h-9 w-64 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </label>
          <button
            type="button"
            onClick={openScheduleAddPanel}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-600"
          >
            <Plus className="h-4 w-4" />새 일정
          </button>
        </div>
      }
      sidebarExtra={
        <MiniCalendar
          visibleMonth={visibleMonth}
          selectedDateKey={selectedDateKey}
          dateMode={dateMode || filter === "today"}
          countsByDate={countsByDate}
          onMoveMonth={(amount) =>
            setVisibleMonth((prev) => addMonths(prev, amount))
          }
          onSelectDate={selectDate}
          onShowAll={showAll}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col bg-[#f7f8fb] dark:bg-slate-950">
        <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <h1 className="text-base font-black text-slate-950">할 일</h1>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-indigo-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-slate-400">
                    완료 {visibleDoneCount} / 전체 {visibleTaskCount}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <FilterButton active={filter === "all" && !dateMode} onClick={showAll}>
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
            </div>

            <label className="relative block min-[760px]:hidden">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="일정 또는 할 일 검색..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
              />
            </label>
          </div>

          {dateMode && filter !== "today" && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
              {formatFullDate(selectedDate)}
              <button
                type="button"
                onClick={showAll}
                aria-label="날짜 선택 해제"
                className="rounded-full p-0.5 hover:bg-indigo-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
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
                  }}
                  retrying={isFetching}
                />
              ) : filteredSchedules.length === 0 ? (
                <EmptyState
                  title="표시할 일정이 없습니다"
                  description="왼쪽 달력에서 날짜를 바꾸거나 새 일정을 추가해 보세요."
                />
              ) : (
                <div className="mx-auto max-w-[82rem] space-y-6">
                  {groups.map((group) => (
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
                            <div key={schedule.schedule_id} className="relative">
                              <ScheduleCard
                                schedule={schedule}
                                category={category}
                                tasks={tasksForSchedule}
                                expanded={expandedScheduleIds.has(
                                  schedule.schedule_id,
                                )}
                                onToggle={() =>
                                  toggleSchedule(schedule.schedule_id)
                                }
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
