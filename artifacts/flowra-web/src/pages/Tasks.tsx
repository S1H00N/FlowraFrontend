import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FloatingPanelPortalProvider } from "@/components/ui/FloatingPanelPortal";
import {
  ArrowDownWideNarrow,
  CheckSquare2,
  ChevronDown,
  Clock3,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { MiniCalendar } from "@/components/SidebarMiniCalendar";
import ScheduleLinkedTasks from "@/components/ScheduleLinkedTasks";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import {
  ScheduleCard,
  IndependentTasksSection,
} from "@/components/tasks/TaskBoardCards";
import "./Tasks.css";
import { useCategories } from "@/hooks/useCategories";
import {
  useCompanySchedules,
  useDeleteCompanySchedule,
} from "@/hooks/useCompanySchedules";
import { useHolidaysInRange } from "@/hooks/useHolidays";
import {
  useCreateScheduleFriendShare,
  useCreateScheduleShareLink,
  useCreateSchedules,
  useDeleteSchedule,
  useDeleteSchedules,
  useSchedules,
} from "@/hooks/useSchedules";
import { useDeleteTasks, useTasks } from "@/hooks/useTasks";
import {
  useCompanyAdminMe,
  useCreateCompanyAdminSchedule,
} from "@/hooks/useCompanyAdmin";
import {
  ScheduleFormPanel,
  applyScheduleCreateShare,
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
type BoardSort = "time" | "title";

interface ScheduleGroup {
  key: string;
  title: string;
  schedules: Schedule[];
}

const scheduleTypeColor: Record<ScheduleType, string> = {
  personal: "#14b8a6",
  meeting: "#6366f1",
  fieldwork: "#8b5cf6",
  deadline: "#f59e0b",
  other: "#64748b",
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

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? new Date() : date;
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
  const totalCells = 42;

  return Array.from({ length: totalCells }, (_, index) => {
    const date = addDays(cursor, index);
    return {
      date,
      key: toDateKey(date),
      currentMonth: date.getMonth() === month.getMonth(),
    };
  });
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
    dueTime >= startOfDay(date).getTime() && dueTime <= endOfDay(date).getTime()
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

function TaskBoardPanel({
  title,
  children,
  docked,
  style,
  onClose,
}: {
  title: string;
  children: ReactNode;
  docked: boolean;
  style: CSSProperties;
  onClose: () => void;
}) {
  const openerRef = useRef<HTMLElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
    null,
  );

  // Keep the same dialog subtree when docking changes, preserving unsaved inputs.
  // On narrow screens, inert also excludes the existing app shell from tab order.
  useEffect(() => {
    if (docked) return;
    const shell = document.querySelector<HTMLElement>(".flowra-app-shell");
    if (!shell) return;
    const wasInert = shell.inert;
    shell.inert = true;
    return () => {
      shell.inert = wasInert;
    };
  }, [docked]);

  return (
    <DialogPrimitive.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        {!docked && (
          <div
            className="tasks-panel-overlay"
            aria-hidden="true"
            onClick={onClose}
          />
        )}
        <DialogPrimitive.Content
          ref={setPortalContainer}
          className="tasks-add-panel"
          data-docked={docked}
          style={style}
          aria-describedby={undefined}
          aria-modal={!docked || undefined}
          onOpenAutoFocus={() => {
            openerRef.current = document.activeElement as HTMLElement | null;
          }}
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (
              portalContainer?.querySelector(
                '[aria-expanded="true"], [role="listbox"]',
              )
            )
              event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (
              docked ||
              event.key !== "Tab" ||
              event.defaultPrevented ||
              !event.currentTarget.contains(event.target as Node)
            )
              return;
            const controls = [
              ...event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
              ),
            ].filter(
              (element) =>
                element.tabIndex >= 0 && element.getClientRects().length > 0,
            );
            const first = controls[0],
              last = controls.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => {
              if (
                openerRef.current?.isConnected &&
                openerRef.current !== document.body &&
                openerRef.current.getClientRects().length > 0
              )
                openerRef.current.focus();
              else
                [
                  ...document.querySelectorAll<HTMLElement>(
                    "[data-tasks-create]",
                  ),
                ]
                  .find((element) => element.getClientRects().length > 0)
                  ?.focus();
            });
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {title}
          </DialogPrimitive.Title>
          <FloatingPanelPortalProvider value={portalContainer}>
            <div className="tasks-panel-content">{children}</div>
          </FloatingPanelPortalProvider>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
      aria-pressed={active}
      className={`tasks-filter inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-bold transition ${
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
  const [sort, setSort] = useState<BoardSort>("time");
  const [selectionMode, setSelectionMode] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const boardSearchRef = useRef<HTMLInputElement>(null);
  const headerSearchRef = useRef<HTMLInputElement>(null);
  const [panelGeometry, setPanelGeometry] = useState({
    width: 0,
    top: 64,
    height: 0,
    right: 0,
  });

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const measure = () => {
      const rect = workspace.getBoundingClientRect();
      setPanelGeometry({
        width: rect.width,
        top: rect.top,
        height: rect.height,
        right: Math.max(0, window.innerWidth - rect.right),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

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
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k")
        return;
      if (scheduleAddPanelOpen || taskPanelScheduleId !== null) return;
      const target = [headerSearchRef.current, boardSearchRef.current].find(
        (input) => input && input.getClientRects().length > 0,
      );
      if (!target) return;
      event.preventDefault();
      target.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [scheduleAddPanelOpen, taskPanelScheduleId]);
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
  const createShareLinkMutation = useCreateScheduleShareLink();
  const createFriendShareMutation = useCreateScheduleFriendShare();
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
      .sort(
        sort === "title"
          ? (a, b) =>
              a.title.localeCompare(b.title, "ko") || sortSchedules(a, b)
          : sortSchedules,
      );
  }, [
    categoryById,
    classificationSettings,
    dateMode,
    filter,
    schedules,
    search,
    selectedDate,
    tasksByScheduleId,
    sort,
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
        if (filter === "active" && task.status === "done") return false;
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
      .sort(
        sort === "title"
          ? (a, b) =>
              a.title.localeCompare(b.title, "ko") || sortIndependentTasks(a, b)
          : sortIndependentTasks,
      );
  }, [dateMode, filter, search, selectedDate, tasks, sort]);
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
  const dockedPanelOpen = sidePanelOpen && panelGeometry.width >= 960;
  const panelStyle = {
    "--tasks-panel-top": dockedPanelOpen ? panelGeometry.top + "px" : "0px",
    "--tasks-panel-height": dockedPanelOpen
      ? panelGeometry.height + "px"
      : "100dvh",
    "--tasks-panel-right": dockedPanelOpen ? panelGeometry.right + "px" : "0px",
  } as CSSProperties;
  const deleteSchedulesPending =
    deleteSchedulesMutation.isPending ||
    deleteCompanyScheduleMutation.isPending;

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
        toast.error(`일정 ${deletedCount}개 삭제, ${failedIds.length}개 실패`);
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
      aiChatButtonOffset={dockedPanelOpen ? "340px" : "0px"}
      titleMeta={`완료 ${visibleDoneCount} / 전체 ${visibleTaskCount}`}
      headerActions={
        <div className="flex min-w-0 items-center gap-2">
          <label className="relative hidden min-[760px]:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={headerSearchRef}
              type="search"
              aria-label="일정 또는 할 일 검색"
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
              data-tasks-create
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
      <div
        ref={workspaceRef}
        className="flowra-workspace tasks-workspace"
        data-flowra-task-board
        style={panelStyle}
      >
        <div className="tasks-main-region">
          <div className="tasks-management-header">
            <div className="tasks-management-title">
              <h1 className="text-base font-black text-slate-950">할 일</h1>
              <div className="tasks-overall-progress">
                <div className="tasks-overall-track" aria-hidden="true">
                  <span style={{ width: progressPercent + "%" }} />
                </div>
                <span>
                  완료 {visibleDoneCount} / 전체 {visibleTaskCount}
                </span>
              </div>
              {!sidePanelOpen && (
                <button
                  type="button"
                  onClick={openScheduleAddPanel}
                  data-tasks-create
                  className="flowra-primary-button tasks-mobile-create"
                >
                  <Plus aria-hidden="true" className="h-4 w-4" />새 일정
                </button>
              )}
            </div>

            <div className="tasks-toolbar">
              <div
                className="tasks-filters"
                role="group"
                aria-label="할 일 필터"
              >
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
              <div className="tasks-toolbar-actions">
                <label className="tasks-sort">
                  <ArrowDownWideNarrow aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">정렬 방식</span>
                  <select
                    value={sort}
                    onChange={(event) =>
                      setSort(event.target.value as BoardSort)
                    }
                  >
                    <option value="time">시간순</option>
                    <option value="title">이름순</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="tasks-select-mode"
                  aria-pressed={selectionMode}
                  disabled={
                    deleteTasksMutation.isPending || deleteSchedulesPending
                  }
                  onClick={() => {
                    setSelectionMode((current) => !current);
                    clearTaskSelection();
                    clearScheduleSelection();
                  }}
                >
                  <CheckSquare2 aria-hidden="true" className="h-4 w-4" />
                  {selectionMode ? "선택 종료" : "선택"}
                </button>
              </div>
              <label className="tasks-board-search">
                <Search aria-hidden="true" className="h-4 w-4" />
                <span className="sr-only">일정 또는 할 일 검색</span>
                <input
                  ref={boardSearchRef}
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="일정 또는 할 일 검색..."
                />
              </label>
            </div>

            {dateMode && filter !== "today" && (
              <div className="tasks-date-filter">
                <span>{formatFullDate(selectedDate)}</span>
                <button
                  type="button"
                  onClick={showAll}
                  aria-label="날짜 선택 해제"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {selectionMode && (
              <div className="tasks-selection-actions" aria-live="polite">
                {selectedTaskCount === 0 && selectedScheduleCount === 0 && (
                  <span>삭제할 일정이나 할 일을 선택해 주세요.</span>
                )}
                {selectedTaskCount > 0 && (
                  <div>
                    <span>할 일 {selectedTaskCount}개 선택</span>
                    <button
                      type="button"
                      onClick={clearTaskSelection}
                      disabled={deleteTasksMutation.isPending}
                    >
                      선택 해제
                    </button>
                    <button
                      type="button"
                      className="tasks-delete-selection"
                      onClick={() => void deleteSelectedTasks()}
                      disabled={deleteTasksMutation.isPending}
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      {deleteTasksMutation.isPending
                        ? "삭제 중..."
                        : "할 일 삭제"}
                    </button>
                  </div>
                )}
                {selectedScheduleCount > 0 && (
                  <div>
                    <span>일정 {selectedScheduleCount}개 선택</span>
                    <button
                      type="button"
                      onClick={clearScheduleSelection}
                      disabled={deleteSchedulesPending}
                    >
                      선택 해제
                    </button>
                    <button
                      type="button"
                      className="tasks-delete-selection"
                      onClick={() => void deleteSelectedSchedules()}
                      disabled={deleteSchedulesPending}
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      {deleteSchedulesPending ? "삭제 중..." : "일정 삭제"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="tasks-board-content">
            <div className="tasks-list-container">
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
                <div className="tasks-empty">
                  <EmptyState
                    title="표시할 일정이나 할 일이 없습니다"
                    description="필터나 날짜를 바꾸거나 새 일정을 추가해 보세요."
                  />
                  {(search || filter !== "all" || dateMode) && (
                    <button
                      type="button"
                      className="tasks-reset"
                      onClick={() => {
                        setSearch("");
                        showAll();
                      }}
                    >
                      전체 보기
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <p className="tasks-result-summary" role="status">
                    {search ? "검색 결과 · " : ""}일정{" "}
                    {filteredSchedules.length}개 · 독립 할 일{" "}
                    {filteredIndependentTasks.length}개
                  </p>
                  {groups.map((group) => (
                    <section
                      key={group.key}
                      className="tasks-section"
                      aria-label={group.title}
                    >
                      <h2 className="tasks-section-heading">
                        {group.title}
                        <span
                          className="tasks-section-count"
                          aria-label={group.schedules.length + "개 일정"}
                        >
                          {group.schedules.length}
                        </span>
                      </h2>
                      <ul className="tasks-timeline">
                        {group.schedules.map((schedule) => (
                          <ScheduleCard
                            key={schedule.schedule_id}
                            schedule={schedule}
                            category={
                              schedule.category_id
                                ? categoryById.get(schedule.category_id)
                                : null
                            }
                            tasks={
                              tasksByScheduleId.get(schedule.schedule_id) ?? []
                            }
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
                            selectionMode={selectionMode}
                            selectedSchedule={selectedScheduleIds.has(
                              schedule.schedule_id,
                            )}
                            selectedTaskIds={selectedTaskIds}
                            onToggle={() =>
                              toggleSchedule(schedule.schedule_id)
                            }
                            onDelete={() => deleteScheduleFromBoard(schedule)}
                            onToggleScheduleSelection={() =>
                              toggleScheduleSelection(schedule.schedule_id)
                            }
                            onToggleTaskSelection={toggleTaskSelection}
                            onOpenAddTaskPanel={() =>
                              openTaskPanel(schedule.schedule_id)
                            }
                          />
                        ))}
                      </ul>
                    </section>
                  ))}
                  {filteredIndependentTasks.length > 0 && (
                    <IndependentTasksSection
                      tasks={filteredIndependentTasks}
                      selectionMode={selectionMode}
                      selectedTaskIds={selectedTaskIds}
                      onToggleTaskSelection={toggleTaskSelection}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {dockedPanelOpen && (
          <div className="tasks-panel-spacer" aria-hidden="true" />
        )}
        {taskPanelSchedule && (
          <TaskBoardPanel
            title="할 일 추가"
            docked={dockedPanelOpen}
            style={panelStyle}
            onClose={() => setTaskPanelScheduleId(null)}
          >
            <TaskAddPanelContent
              schedule={taskPanelSchedule}
              category={taskPanelCategory}
              tasks={taskPanelTasks}
              onClose={() => setTaskPanelScheduleId(null)}
            />
          </TaskBoardPanel>
        )}
        {scheduleAddPanelOpen && (
          <TaskBoardPanel
            title="새 일정"
            docked={dockedPanelOpen}
            style={panelStyle}
            onClose={() => setScheduleAddPanelOpen(false)}
          >
            <ScheduleFormPanel
              mode="create"
              initial={emptyFormForDate(selectedDate)}
              isPending={
                createSchedulesMutation.isPending ||
                createCompanyScheduleMutation.isPending ||
                createShareLinkMutation.isPending ||
                createFriendShareMutation.isPending
              }
              onClose={() => setScheduleAddPanelOpen(false)}
              companyName={companyAdminMeQuery.data?.company?.name}
              onCompanySubmit={async (payload) => {
                await createCompanyScheduleMutation.mutateAsync(payload);
                setScheduleAddPanelOpen(false);
              }}
              onSubmit={async (forms, options) => {
                const createdSchedules =
                  await createSchedulesMutation.mutateAsync(
                    forms.map((form) => toPayload(form)),
                  );
                try {
                  await applyScheduleCreateShare({
                    schedules: createdSchedules,
                    share: options?.share,
                    createShareLink: createShareLinkMutation.mutateAsync,
                    createFriendShare: createFriendShareMutation.mutateAsync,
                  });
                } catch (err) {
                  toast.error(
                    getErrorMessage(
                      err,
                      "일정은 추가됐지만 공유 설정에 실패했습니다.",
                    ),
                  );
                }
                setScheduleAddPanelOpen(false);
              }}
              floatingStyle={defaultSchedulePanelFloatingStyle}
              panelLayout="docked"
            />
          </TaskBoardPanel>
        )}
      </div>
    </AppShell>
  );
}
