import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import {
  Building2,
  CalendarDays,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Flag,
  Globe2,
  Info,
  Link2,
  LockKeyhole,
  MapPin,
  PanelRight,
  Pencil,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  Shapes,
  Tag,
  Trash2,
  UserRound,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  useCreateScheduleFriendShare,
  useCreateScheduleShareLink,
  useCreateSchedules,
  useDeleteSchedule,
  useDeleteSchedules,
  useSchedules,
  useSetScheduleCompletion,
  useUpdateSchedule,
} from "@/hooks/useSchedules";
import { useCompanySchedules } from "@/hooks/useCompanySchedules";
import {
  useCompanyAdminDepartments,
  useCompanyAdminMe,
  useCreateCompanyAdminSchedule,
} from "@/hooks/useCompanyAdmin";
import {
  getCompanyScheduleApprovalId,
  useApproveCompanyScheduleApproval,
  useCompanyScheduleApprovals,
  useRejectCompanyScheduleApproval,
} from "@/hooks/useCompanyScheduleApprovals";
import { useCategories } from "@/hooks/useCategories";
import { useFriendPresets } from "@/hooks/useFriendPresets";
import { useFriends } from "@/hooks/useFriends";
import { useHolidaysInRange } from "@/hooks/useHolidays";
import {
  TASK_PRIORITIES,
  SCHEDULE_TYPES,
  SCHEDULE_VISIBILITY_LABELS,
  type CompanyAdminDepartment,
  type CompanyScheduleApproval,
  type CompanySchedule,
  type CompanyScheduleCreateTarget,
  type CreateScheduleFriendShareRequest,
  type CreateCompanyScheduleRequest,
  type CreateScheduleFriendShareResponse,
  type CreateScheduleShareLinkRequest,
  type CreateScheduleShareLinkResponse,
  type Holiday,
  type Schedule,
  type ScheduleSharePermission,
  type ScheduleType,
  type ScheduleVisibility,
  type TaskPriority,
} from "@/types";
import {
  getClassificationLabel,
  getClassificationOptions,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { useUserSettings, type WeekStartDay } from "@/lib/userSettings";
import { getErrorMessage } from "@/lib/error";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import AppShell from "@/components/AppShell";
import ScheduleLinkedTasks from "@/components/ScheduleLinkedTasks";
import TaskCompletionToggleButton from "@/components/TaskCompletionToggleButton";
import CustomSelect, {
  type CustomSelectOption,
} from "@/components/ui/CustomSelect";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  localInputToOffsetISOString,
  toOffsetISOString,
} from "@/utils/dateUtils";
import { toast } from "@/lib/toast";
import {
  CategoryMetaChip,
  ListCardMeta,
  PriorityMetaChip,
  TypeMetaChip,
} from "@/components/ListCardMeta";

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const defaultWeekStart: WeekStartDay = "sunday";

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

export interface DayMeta {
  count: number;
  hasDeadline: boolean;
}

type ScheduleCalendarView = "month" | "week" | "day";

const scheduleViewOptions: Array<{
  value: ScheduleCalendarView;
  label: string;
  shortcut: string;
}> = [
  { value: "day", label: "일", shortcut: "D" },
  { value: "week", label: "주", shortcut: "W" },
  { value: "month", label: "월", shortcut: "M" },
];

const scheduleViewShortcutMap: Partial<Record<string, ScheduleCalendarView>> =
  scheduleViewOptions.reduce(
    (acc, option) => {
      acc[option.shortcut.toLowerCase()] = option.value;
      return acc;
    },
    {} as Partial<Record<string, ScheduleCalendarView>>,
  );

function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable]"),
  );
}

const scheduleTypeSelectMeta: Record<
  ScheduleType,
  { label: string; color: string; description: string }
> = {
  personal: {
    label: "개인",
    color: "#14b8a6",
    description: "개인 일정",
  },
  meeting: {
    label: "업무",
    color: "#3b82f6",
    description: "업무 관련 일정",
  },
  fieldwork: {
    label: "학교",
    color: "#8b5cf6",
    description: "학교와 학습 일정",
  },
  deadline: {
    label: "기념일",
    color: "#f59e0b",
    description: "기억해야 할 날",
  },
  other: {
    label: "기타",
    color: "#64748b",
    description: "그 밖의 일정",
  },
};

const prioritySelectMeta: Record<
  TaskPriority,
  { color: string; description: string }
> = {
  low: {
    color: "#64748b",
    description: "여유 있게 처리",
  },
  medium: {
    color: "#8b5cf6",
    description: "기본 우선순위",
  },
  high: {
    color: "#f59e0b",
    description: "주의가 필요한 일정",
  },
  urgent: {
    color: "#ef4444",
    description: "가장 먼저 확인",
  },
};

const emptyCategoryColor = "#cbd5e1";
const fallbackCategoryColor = "#94a3b8";
const holidayAccentColor = "#e11d48";
const untitledScheduleTitle = "제목 없음";

interface MonthCalendarCell {
  date: Date;
  currentMonth: boolean;
}

export interface ScheduleFormState {
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

type ScheduleSelectPreviewPatch = Partial<
  Pick<ScheduleFormState, "schedule_type" | "priority" | "category_id">
>;

type ScheduleSelectField = keyof ScheduleSelectPreviewPatch;

type ScheduleSelectDisplayState = Record<ScheduleSelectField, boolean>;

export type ScheduleFormSubmitIntent = "manual" | "auto" | "repeat";

export type ScheduleCreateShareOption =
  | {
      kind: "link";
      permission: ScheduleSharePermission;
    }
  | {
      kind: "friends";
      scope: "all_friends";
      permission: ScheduleSharePermission;
    }
  | {
      kind: "friends";
      scope: "preset";
      friend_preset_id: number;
      permission: ScheduleSharePermission;
    };

export interface ScheduleFormSubmitOptions {
  intent?: ScheduleFormSubmitIntent;
  share?: ScheduleCreateShareOption;
}

interface ScheduleCreateDraft {
  start: Date;
  end: Date;
  allDay?: boolean;
}

interface OpenCreatePanelOptions {
  selectTargetDate?: boolean;
}

type PreviewSchedule = Schedule & {
  is_preview: true;
};

type ScheduleCompletionFilter = "all" | "active" | "completed";
export type SchedulePanelLayout = "floating" | "docked";
type ScheduleOwnerType = "personal" | "company";
type ScheduleOwnerFilter = "all" | ScheduleOwnerType;
type PersonalScheduleAttendeeKind = "friend" | "email";

interface PersonalScheduleAttendee {
  id: string;
  kind: PersonalScheduleAttendeeKind;
  email: string;
  name?: string;
  status: "invited_friend" | "pending_invite";
}

type RepeatFrequencyUnit = "day" | "week" | "month" | "year";
type RepeatEndMode = "never" | "on" | "after";
type RepeatEndType = "never" | "until" | "count";
type RepeatMonthlyMode = "date" | "nth_weekday" | "last_weekday";
type RepeatType =
  | "none"
  | "daily"
  | "weekdays"
  | "weekends"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "monthly-nth-weekday"
  | "monthly-last-weekday"
  | "yearly"
  | "custom"
  | "selected-dates";
type BasicRepeatType = Exclude<
  RepeatType,
  "none" | "custom" | "selected-dates"
>;
type CustomRepeatWeekday = "SU" | "MO" | "TU" | "WE" | "TH" | "FR" | "SA";

interface CustomRepeat {
  interval: number;
  unit: RepeatFrequencyUnit;
  weekdays: CustomRepeatWeekday[];
  endType: RepeatEndType;
  endDate: string | null;
  count: number | null;
}

interface RepeatTypeOption {
  label: string;
  value: RepeatType;
  summary?: string;
  dividerBefore?: boolean;
}

const repeatEndOptions: Array<{ value: RepeatEndType; label: string }> = [
  { value: "never", label: "계속 반복" },
  { value: "until", label: "날짜까지 반복" },
  { value: "count", label: "횟수만큼 반복" },
];

interface ScheduleFilters {
  owner: ScheduleOwnerFilter;
  scheduleTypes: ScheduleType[];
  priorities: TaskPriority[];
  categories: number[];
  completion: ScheduleCompletionFilter;
  q: string;
}

type FilterOptionValue = string | number;

interface InlineFilterOption<TValue extends FilterOptionValue> {
  key: string;
  value: TValue;
  label: string;
  colorDot?: string;
  description?: string;
}

type SchedulePanelAnchorElement =
  | HTMLElement
  | { clientX: number; clientY: number }
  | null;

export type SchedulePanelFloatingStyle = CSSProperties & {
  "--schedule-panel-left"?: string;
  "--schedule-panel-top"?: string;
  "--schedule-panel-max-height"?: string;
};

function CompactDateInput({
  value,
  onChange,
  required = false,
  disabled = false,
  ariaLabel,
  inputRef,
  onCommit,
  onOpen,
  minDate,
  calendarBoundaryRef,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  onCommit?: () => void;
  onOpen?: () => void;
  minDate?: string;
  calendarBoundaryRef?: { current: HTMLElement | null };
  className?: string;
}) {
  const normalizedMinDate =
    minDate && /^\d{4}-\d{2}-\d{2}$/.test(minDate) ? minDate : null;
  const clampDateKey = (dateKey: string) =>
    normalizedMinDate && dateKey < normalizedMinDate
      ? normalizedMinDate
      : dateKey;
  const effectiveValue = clampDateKey(value);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(formatDateInputDisplay(effectiveValue));
  const [previewDateKey, setPreviewDateKey] = useState(effectiveValue);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = new Date(`${effectiveValue}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? new Date()
      : new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [calendarStyle, setCalendarStyle] = useState<CSSProperties>({});
  const [calendarReady, setCalendarReady] = useState(false);
  const containerRef = useRef<HTMLLabelElement | null>(null);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const closingFromOutsidePointerRef = useRef(false);
  const highlightedDateKey = previewDateKey || effectiveValue;
  const selectedDate = new Date(`${highlightedDateKey}T00:00:00`);
  const selectedKey = Number.isNaN(selectedDate.getTime())
    ? ""
    : toDateKey(selectedDate);
  const canResetVisibleMonth = !isCurrentMonth(visibleMonth);
  const { weekStart } = useUserSettings();
  const weekdayHeaders = useMemo(
    () => orderedWeekdayLabels(weekStart),
    [weekStart],
  );

  useEffect(() => {
    setDraft(formatDateInputDisplay(effectiveValue));
    setPreviewDateKey(effectiveValue);
    const date = new Date(`${effectiveValue}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [effectiveValue]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
    setCalendarReady(false);
  }, [disabled]);

  const updateCalendarPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") {
      setCalendarReady(false);
      return;
    }

    const calendarWidth = 280;
    const calendarHeight = 328;
    const margin = 8;
    const gap = 10;
    const inputRect = container.getBoundingClientRect();
    const boundaryRect = calendarBoundaryRef?.current?.getBoundingClientRect();
    const panelRect = container.closest("aside")?.getBoundingClientRect();
    const maxLeft = window.innerWidth - calendarWidth - margin;
    const maxTop = window.innerHeight - calendarHeight - margin;
    const clampLeft = (left: number) =>
      Math.max(margin, Math.min(left, maxLeft));
    const clampTop = (top: number) => Math.max(margin, Math.min(top, maxTop));

    if (boundaryRect) {
      const topNearInput = clampTop(inputRect.top);
      const leftNearInput = clampLeft(inputRect.left);
      const candidates = [
        { left: boundaryRect.right + gap, top: topNearInput },
        { left: boundaryRect.left - calendarWidth - gap, top: topNearInput },
        { left: leftNearInput, top: boundaryRect.bottom + gap },
        { left: leftNearInput, top: boundaryRect.top - calendarHeight - gap },
      ];
      const fitsViewport = ({ left, top }: { left: number; top: number }) =>
        left >= margin &&
        left + calendarWidth <= window.innerWidth - margin &&
        top >= margin &&
        top + calendarHeight <= window.innerHeight - margin;
      const visibleArea = ({ left, top }: { left: number; top: number }) => {
        const visibleWidth =
          Math.min(left + calendarWidth, window.innerWidth - margin) -
          Math.max(left, margin);
        const visibleHeight =
          Math.min(top + calendarHeight, window.innerHeight - margin) -
          Math.max(top, margin);
        return Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
      };
      const bestCandidate =
        candidates.find(fitsViewport) ??
        [...candidates].sort((a, b) => visibleArea(b) - visibleArea(a))[0];

      setCalendarStyle({
        left: Math.round(bestCandidate.left),
        top: Math.round(bestCandidate.top),
        width: calendarWidth,
      });
      setCalendarReady(true);
      return;
    }

    const availableLeft = panelRect
      ? panelRect.left - calendarWidth - margin
      : inputRect.left;
    const left = clampLeft(availableLeft);
    const top = clampTop(inputRect.top);

    setCalendarStyle({
      left: Math.round(left),
      top: Math.round(top),
      width: calendarWidth,
    });
    setCalendarReady(true);
  }, [calendarBoundaryRef]);

  useLayoutEffect(() => {
    if (!open) {
      setCalendarReady(false);
      return;
    }

    updateCalendarPosition();
    window.addEventListener("resize", updateCalendarPosition);
    window.addEventListener("scroll", updateCalendarPosition, true);

    return () => {
      window.removeEventListener("resize", updateCalendarPosition);
      window.removeEventListener("scroll", updateCalendarPosition, true);
    };
  }, [open, updateCalendarPosition]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (containerRef.current?.contains(target) ||
          calendarRef.current?.contains(target))
      ) {
        return;
      }

      closingFromOutsidePointerRef.current = true;
      commitDate(draft);
      closeCalendar();
      window.setTimeout(() => {
        closingFromOutsidePointerRef.current = false;
      }, 0);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [draft, open]);

  const openCalendar = () => {
    onOpen?.();
    if (!open) setCalendarReady(false);
    setOpen(true);
  };

  const closeCalendar = () => {
    setOpen(false);
    setCalendarReady(false);
  };

  const commitDate = (nextValue: string) => {
    const normalized = normalizeDateInput(nextValue, effectiveValue);
    if (normalized) {
      const nextDateKey = clampDateKey(normalized);
      onChange(nextDateKey);
      setDraft(formatDateInputDisplay(nextDateKey));
      setPreviewDateKey(nextDateKey);
      closeCalendar();
      onCommit?.();
      return;
    }

    setDraft(formatDateInputDisplay(effectiveValue));
    setPreviewDateKey(effectiveValue);
  };

  const selectDate = (date: Date) => {
    const dateKey = clampDateKey(toDateKey(date));
    onChange(dateKey);
    setDraft(formatDateInputDisplay(dateKey));
    setPreviewDateKey(dateKey);
    setVisibleMonth(getCalendarViewMonth(dateKey));
    closeCalendar();
    onCommit?.();
  };

  return (
    <label
      ref={containerRef}
      className={`relative flex h-9 min-w-0 items-center gap-2 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-slate-900 transition ${
        disabled
          ? "cursor-not-allowed text-slate-400"
          : "hover:border-slate-200 hover:bg-white focus-within:border-violet-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100"
      } ${className}`}
      onBlur={(event) => {
        if (closingFromOutsidePointerRef.current) return;
        if (event.currentTarget.contains(event.relatedTarget)) return;
        commitDate(draft);
        closeCalendar();
      }}
    >
      <input
        ref={inputRef}
        type="text"
        name="flowra_date_input"
        autoComplete="none"
        required={required}
        disabled={disabled}
        value={draft}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const normalized = normalizeDateInput(nextDraft, effectiveValue);
          if (normalized) {
            const nextDateKey = clampDateKey(normalized);
            setPreviewDateKey(nextDateKey);
            setVisibleMonth(getCalendarViewMonth(nextDateKey));
          }
          openCalendar();
        }}
        onFocus={(event) => {
          openCalendar();
          setPreviewDateKey(effectiveValue);
          event.currentTarget.select();
          window.requestAnimationFrame(updateCalendarPosition);
        }}
        onClick={(event) => event.currentTarget.select()}
        onMouseUp={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDate(draft);
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const currentDraft =
              normalizeDateInput(draft, effectiveValue) ||
              effectiveValue ||
              toDateKey(new Date());
            const nextDateKey = clampDateKey(
              moveDateByKeyboard(
                currentDraft,
                event.key === "ArrowDown" ? 1 : -1,
                event.shiftKey,
              ),
            );
            setDraft(formatDateInputDisplay(nextDateKey));
            setPreviewDateKey(nextDateKey);
            setVisibleMonth(getCalendarViewMonth(nextDateKey));
            openCalendar();
          }
          if (event.key === "Escape") {
            setDraft(formatDateInputDisplay(effectiveValue));
            setPreviewDateKey(effectiveValue);
            setVisibleMonth(getCalendarViewMonth(effectiveValue));
            closeCalendar();
          }
        }}
        aria-label={ariaLabel}
        aria-expanded={open && !disabled}
        className="h-full min-w-0 flex-1 bg-transparent p-0 text-sm font-medium text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
      />
      {open && !disabled
        ? renderFloatingPortal(
            <div
              ref={calendarRef}
              style={{
                ...calendarStyle,
                visibility: calendarReady ? undefined : "hidden",
              }}
              className="schedule-date-popover fixed z-[160] rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-slate-100 shadow-xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold">
                  {formatMonthTitle(visibleMonth)}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      setVisibleMonth(
                        getCalendarViewMonth(toDateKey(new Date())),
                      )
                    }
                    className={`h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-neutral-800 hover:text-white ${
                      canResetVisibleMonth ? "inline-flex" : "hidden"
                    }`}
                    aria-label="Go to current month"
                    title="Go to current month"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      setVisibleMonth(
                        (prev) =>
                          new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                      )
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-neutral-800 hover:text-white"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() =>
                      setVisibleMonth(
                        (prev) =>
                          new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                      )
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-neutral-800 hover:text-white"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-500">
                {weekdayHeaders.map(({ day, label }) => (
                  <span key={day}>{label}</span>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {buildMonthCells(visibleMonth, weekStart).map((date, index) => {
                  if (!date) {
                    return (
                      <div key={`blank-${index}`} className="aspect-square" />
                    );
                  }

                  const dateKey = toDateKey(date);
                  const disabled =
                    normalizedMinDate !== null && dateKey < normalizedMinDate;

                  return (
                    <button
                      key={dateKey}
                      type="button"
                      disabled={disabled}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        if (!disabled) selectDate(date);
                      }}
                      className={`aspect-square rounded-md text-sm font-medium transition ${
                        dateKey === selectedKey
                          ? "bg-violet-500 text-white"
                          : disabled
                            ? "cursor-not-allowed text-slate-600"
                            : "text-slate-200 hover:bg-neutral-800"
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>,
          )
        : null}
    </label>
  );
}

function generateTimeOptions() {
  return Array.from({ length: 96 }, (_, index) => {
    const totalMinutes = index * 15;
    return `${pad(Math.floor(totalMinutes / 60))}:${pad(totalMinutes % 60)}`;
  });
}

const timeDropdownOptions = generateTimeOptions();
const timeHistoryStorageKey = "flowra-schedule-time-history";
const visibleTimeOptionCount = 7;

function timeToMinutes(value: string) {
  const normalized = normalizeTimeInput(value);
  if (!normalized) return null;

  const [hourText, minuteText] = normalized.split(":");
  return Number(hourText) * 60 + Number(minuteText);
}

function buildSelectionTimeOptions(value: string) {
  const normalized = normalizeTimeInput(value);
  if (!normalized) {
    return timeDropdownOptions;
  }

  if (timeDropdownOptions.includes(normalized)) {
    return timeDropdownOptions;
  }

  return Array.from(new Set([normalized, ...timeDropdownOptions]))
    .sort((a, b) => (timeToMinutes(a) ?? 0) - (timeToMinutes(b) ?? 0))
    .slice(0, timeDropdownOptions.length + 1);
}

function normalizeTimeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const compactMatch = /^(\d{1,2})(\d{2})$/.exec(trimmed);
  const colonMatch = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  const shortHourMatch = /^(\d{1,2})$/.exec(trimmed);

  const hourText =
    colonMatch?.[1] ?? compactMatch?.[1] ?? shortHourMatch?.[1] ?? "";
  const minuteText =
    colonMatch?.[2] ?? compactMatch?.[2] ?? (shortHourMatch ? "00" : "");

  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return `${pad(hour)}:${pad(minute)}`;
}

function normalizeTimeOnConfirm(value: string) {
  return normalizeTimeInput(value);
}

function normalizeCompleteTimeDraft(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const compactMatch = /^(\d{1,2})(\d{2})$/.exec(trimmed);
  const colonMatch = /^(\d{1,2}):(\d{2})$/.exec(trimmed);

  const hourText = colonMatch?.[1] ?? compactMatch?.[1] ?? "";
  const minuteText = colonMatch?.[2] ?? compactMatch?.[2] ?? "";
  if (!hourText || !minuteText) return null;

  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return `${pad(hour)}:${pad(minute)}`;
}

function timeOptionMatchesDraft(option: string, draft: string) {
  const trimmed = draft.trim();
  if (!trimmed) return false;

  if (trimmed.includes(":")) {
    const [hourText, minuteText = ""] = trimmed.split(":");
    const hour = Number(hourText);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false;
    return option.startsWith(`${pad(hour)}:${minuteText}`);
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return false;

  if (digits.length <= 2) {
    const hour = Number(digits);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return false;
    return option.startsWith(`${pad(hour)}:`);
  }

  return option.replace(":", "").startsWith(digits);
}

function buildAmbiguousTimeOptions(draft: string) {
  const digits = draft.trim().replace(/\D/g, "");
  if (!digits) return [];

  const candidates: string[] = [];
  const addCandidate = (hourText: string, minuteText: string) => {
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (
      Number.isInteger(hour) &&
      Number.isInteger(minute) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ) {
      candidates.push(`${pad(hour)}:${pad(minute)}`);
    }
  };

  if (digits.length === 2) {
    addCandidate(digits, "00");
    addCandidate("00", digits);
  }

  if (digits.length === 3) {
    addCandidate(digits.slice(0, 1), digits.slice(1));
    addCandidate(digits.slice(0, 2), `${digits.slice(2)}0`);
    addCandidate(digits.slice(0, 2), `0${digits.slice(2)}`);
  }

  if (digits.length === 4) {
    addCandidate(digits.slice(0, 2), digits.slice(2));
  }

  return Array.from(new Set(candidates));
}

function generateTimeInputCandidates(draft: string) {
  const draftTimeOption = normalizeCompleteTimeDraft(draft);
  const trimmed = draft.trim();
  const colonMatch = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  const minuteDraftOption = (() => {
    if (!colonMatch) return null;

    const hour = Number(colonMatch[1]);
    const minuteText = colonMatch[2];
    const minute =
      minuteText.length === 1 ? Number(`${minuteText}0`) : Number(minuteText);

    if (
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      return null;
    }

    return `${pad(hour)}:${pad(minute)}`;
  })();
  const matches = timeDropdownOptions.filter((option) =>
    timeOptionMatchesDraft(option, draft),
  );
  const merged = [
    draftTimeOption,
    minuteDraftOption,
    ...buildAmbiguousTimeOptions(draft),
    ...matches,
  ].filter((option): option is string => !!option);

  return Array.from(new Set(merged)).slice(0, 7);
}

function CompactTimeInput({
  value,
  onChange,
  required = false,
  disabled = false,
  ariaLabel,
  variant = "boxed",
  onCommit,
  inputRef,
  onValidDraftChange,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  variant?: "boxed" | "plain";
  onCommit?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  onValidDraftChange?: (value: string) => void;
}) {
  const boxed = variant === "boxed";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(formatTimeInputDisplay(value));
  const [userTyping, setUserTyping] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [lockedTimeOptions, setLockedTimeOptions] = useState<string[] | null>(
    null,
  );
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectingOptionRef = useRef(false);
  const closingFromOutsidePointerRef = useRef(false);
  const activeOptionSourceRef = useRef<"auto" | "keyboard" | "pointer">("auto");

  useEffect(() => {
    if (userTyping) return;
    setDraft(formatTimeInputDisplay(value));
  }, [userTyping, value]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(timeHistoryStorageKey);
  }, []);

  const commitTime = (
    nextValue: string,
    options: { advance?: boolean } = {},
  ) => {
    const normalized = normalizeTimeOnConfirm(nextValue);
    if (normalized) {
      onChange(normalized);
      setDraft(normalized);
      setOpen(false);
      setUserTyping(false);
      setLockedTimeOptions(null);
      if (options.advance) {
        onCommit?.();
      }
      return;
    }

    setDraft(formatTimeInputDisplay(value));
    setUserTyping(false);
    setLockedTimeOptions(null);
  };
  const selectTimeOption = (option: string) => {
    selectingOptionRef.current = true;
    commitTime(option, { advance: true });

    window.setTimeout(() => {
      selectingOptionRef.current = false;
    }, 0);
  };
  const draftTimeOption = normalizeCompleteTimeDraft(draft);
  const isBlankDraft = draft.trim() === "";
  const selectedTimeOption = draftTimeOption || normalizeTimeInput(value) || "";
  const selectionTimeOptions = useMemo(
    () => buildSelectionTimeOptions(selectedTimeOption),
    [selectedTimeOption],
  );
  const suggestedTimeOptions = useMemo(
    () =>
      userTyping && !isBlankDraft
        ? generateTimeInputCandidates(draft)
        : selectionTimeOptions,
    [draft, isBlankDraft, selectionTimeOptions, userTyping],
  );
  const visibleTimeOptions = lockedTimeOptions ?? suggestedTimeOptions;
  const timeDropdownMaxHeight =
    userTyping && !isBlankDraft ? 224 : visibleTimeOptionCount * 32 + 8;
  const previewTimeOption = (option: string, index: number) => {
    activeOptionSourceRef.current = "pointer";
    setLockedTimeOptions((current) => current ?? visibleTimeOptions);
    setActiveOptionIndex(index);
    setDraft(option);
    onValidDraftChange?.(option);
  };

  useEffect(() => {
    if (!open) return;
    if (lockedTimeOptions) return;
    const currentOptionIndex = visibleTimeOptions.findIndex(
      (option) => option === draftTimeOption || option === value,
    );
    activeOptionSourceRef.current = "auto";
    setActiveOptionIndex(currentOptionIndex >= 0 ? currentOptionIndex : 0);
  }, [draftTimeOption, lockedTimeOptions, open, value, visibleTimeOptions]);

  useEffect(() => {
    if (!open) return;
    if (activeOptionSourceRef.current === "pointer") return;
    const activeOption = optionRefs.current[activeOptionIndex];
    activeOption?.scrollIntoView({
      block: userTyping && !isBlankDraft ? "nearest" : "center",
    });
  }, [activeOptionIndex, isBlankDraft, open, userTyping, visibleTimeOptions]);

  const updateDropdownPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;

    const dropdownWidth = 184;
    const margin = 8;
    const inputRect = container.getBoundingClientRect();
    const panelRect = container.closest("aside")?.getBoundingClientRect();
    const availableLeft = panelRect
      ? panelRect.left - dropdownWidth - margin
      : inputRect.left;
    const left = Math.max(margin, availableLeft);
    const maxTop = window.innerHeight - timeDropdownMaxHeight - margin;
    const top = Math.max(margin, Math.min(inputRect.top, maxTop));

    setDropdownStyle({
      left,
      top,
      width: dropdownWidth,
    });
  }, [timeDropdownMaxHeight]);

  useEffect(() => {
    if (!open) return;

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);

    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (containerRef.current?.contains(target) ||
          dropdownRef.current?.contains(target))
      ) {
        return;
      }

      closingFromOutsidePointerRef.current = true;
      commitTime(draft);
      setOpen(false);
      window.setTimeout(() => {
        closingFromOutsidePointerRef.current = false;
      }, 0);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [draft, open]);

  return (
    <div
      ref={containerRef}
      className={`relative flex h-9 min-w-0 items-center gap-2 rounded-md text-sm font-medium text-slate-900 transition focus-within:ring-2 focus-within:ring-violet-100 ${
        boxed
          ? "w-full border border-transparent bg-transparent px-2 hover:border-slate-200 hover:bg-white focus-within:border-violet-300 focus-within:bg-white"
          : "w-auto px-0"
      } ${disabled ? "bg-slate-100 text-slate-400" : ""}`}
      onBlur={(event) => {
        if (selectingOptionRef.current) return;
        if (closingFromOutsidePointerRef.current) return;
        if (event.currentTarget.contains(event.relatedTarget)) return;
        commitTime(draft);
        setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        name="flowra_time_input"
        autoComplete="none"
        required={required}
        disabled={disabled}
        value={draft}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          setUserTyping(true);
          setLockedTimeOptions(null);
          const normalized = normalizeCompleteTimeDraft(nextDraft);
          if (normalized) {
            onValidDraftChange?.(normalized);
          }
          setOpen(true);
        }}
        onFocus={(event) => {
          setOpen(true);
          setUserTyping(false);
          setLockedTimeOptions(null);
          event.currentTarget.select();
          window.requestAnimationFrame(updateDropdownPosition);
        }}
        onClick={(event) => {
          setOpen(true);
          setUserTyping(false);
          setLockedTimeOptions(null);
          event.currentTarget.select();
          window.requestAnimationFrame(updateDropdownPosition);
        }}
        onMouseUp={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            if (visibleTimeOptions.length > 0) {
              setLockedTimeOptions(visibleTimeOptions);
              const nextIndex =
                (activeOptionIndex + 1) % visibleTimeOptions.length;
              activeOptionSourceRef.current = "keyboard";
              setActiveOptionIndex(nextIndex);
              const nextOption = visibleTimeOptions[nextIndex];
              setDraft(nextOption);
              onValidDraftChange?.(nextOption);
            }
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            if (visibleTimeOptions.length > 0) {
              setLockedTimeOptions(visibleTimeOptions);
              const nextIndex =
                (activeOptionIndex - 1 + visibleTimeOptions.length) %
                visibleTimeOptions.length;
              activeOptionSourceRef.current = "keyboard";
              setActiveOptionIndex(nextIndex);
              const nextOption = visibleTimeOptions[nextIndex];
              setDraft(nextOption);
              onValidDraftChange?.(nextOption);
            }
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (open && visibleTimeOptions[activeOptionIndex]) {
              selectTimeOption(visibleTimeOptions[activeOptionIndex]);
              return;
            }
            commitTime(draft, { advance: true });
          }
          if (event.key === "Escape") {
            setDraft(formatTimeInputDisplay(value));
            setOpen(false);
            setUserTyping(false);
            setLockedTimeOptions(null);
          }
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="h-full min-w-0 flex-1 bg-transparent p-0 text-sm font-medium tabular-nums text-slate-900 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
      />
      {open && !disabled && (
        <div
          ref={dropdownRef}
          style={{ ...dropdownStyle, maxHeight: timeDropdownMaxHeight }}
          className="fixed z-[70] overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-1 shadow-xl"
          role="listbox"
          onWheel={(event) => event.stopPropagation()}
          onPointerDownCapture={() => {
            selectingOptionRef.current = true;
          }}
        >
          {visibleTimeOptions.map((option, index) => (
            <button
              key={option}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              tabIndex={-1}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectTimeOption(option);
              }}
              onPointerMove={() => previewTimeOption(option, index)}
              onClick={() => selectTimeOption(option)}
              className={`flex h-8 w-full items-center rounded-md px-2 text-left text-sm font-medium tabular-nums transition ${
                index === activeOptionIndex
                  ? "bg-neutral-800 text-violet-200"
                  : option === draftTimeOption || option === value
                    ? "bg-neutral-800 text-violet-200"
                    : "text-slate-100 hover:bg-neutral-800"
              }`}
              aria-selected={index === activeOptionIndex}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const defaultScheduleFilters: ScheduleFilters = {
  owner: "all",
  scheduleTypes: [],
  priorities: [],
  categories: [],
  completion: "all",
  q: "",
};

const COMPANY_SCHEDULE_ID_OFFSET = 1_000_000_000;
const PREVIEW_SCHEDULE_ID_OFFSET = 2_000_000_000;
const companyScheduleAccent = "#7c3aed";
const schedulePanelLayoutStorageKey = "flowra-schedule-panel-layout";
const scheduleSidebarToggleButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent text-slate-500 shadow-none transition hover:bg-slate-100 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300";
const scheduleOwnerOptions: Array<{ value: ScheduleOwnerType; label: string }> =
  [
    { value: "personal", label: "개인 일정" },
    { value: "company", label: "회사 일정" },
  ];
const scheduleOwnerFilterOptions: Array<{
  value: ScheduleOwnerFilter;
  label: string;
  description: string;
}> = [
  {
    value: "all",
    label: "전체 일정",
    description: "개인 일정과 회사 일정을 함께 보기",
  },
  {
    value: "personal",
    label: "개인 일정",
    description: "내 개인 일정만 보기",
  },
  {
    value: "company",
    label: "회사 일정",
    description: "회사에서 공유한 일정만 보기",
  },
];
const scheduleOwnerFilterColors: Record<ScheduleOwnerFilter, string> = {
  all: "#64748b",
  personal: "#14b8a6",
  company: companyScheduleAccent,
};
const personalAttendeeSuggestions: PersonalScheduleAttendee[] = [];
type ScheduleCreateShareTargetKind = "link" | "all_friends" | "preset";
type ScheduleCreateShareTab = "friends" | "presets";
const scheduleVisibilityScopeOptions = [
  {
    value: "private",
    label: SCHEDULE_VISIBILITY_LABELS.private ?? "비공개",
    icon: LockKeyhole,
    disabled: false,
  },
  { value: "invite", label: "사용자 초대", icon: UserPlus, disabled: true },
  { value: "group", label: "그룹", icon: Users, disabled: true },
] as const;

export const defaultSchedulePanelFloatingStyle: SchedulePanelFloatingStyle = {
  "--schedule-panel-left": "calc(100vw - 402px)",
  "--schedule-panel-top": "8px",
  "--schedule-panel-max-height": "calc(100vh - 16px)",
};

function getInitialSchedulePanelLayout(): SchedulePanelLayout {
  if (typeof window === "undefined") return "floating";
  return window.localStorage.getItem(schedulePanelLayoutStorageKey) === "docked"
    ? "docked"
    : "floating";
}

function getSchedulePanelClassName(layout: SchedulePanelLayout) {
  const base =
    "fixed inset-y-0 right-0 z-50 flex min-h-0 w-full max-w-md flex-col overflow-hidden border-l border-slate-200 bg-white shadow-xl";
  const inline =
    "md:fixed md:inset-y-0 md:right-0 md:z-50 md:h-auto md:max-h-none md:w-[300px] md:max-w-none md:rounded-none md:border-y-0 md:border-l md:border-r-0 md:shadow-none lg:w-[340px]";
  const floating =
    "xl:fixed xl:z-50 xl:inset-auto xl:left-[var(--schedule-panel-left)] xl:top-[var(--schedule-panel-top)] xl:right-auto xl:bottom-auto xl:h-auto xl:max-h-[var(--schedule-panel-max-height)] xl:w-[390px] xl:max-w-[calc(100vw-24px)] xl:rounded-2xl xl:border xl:border-slate-200 xl:shadow-2xl xl:shadow-slate-900/10";
  const docked =
    "md:fixed md:inset-y-0 md:right-0 md:z-50 md:h-auto md:max-h-none md:w-[300px] md:max-w-none md:rounded-none md:border-y-0 md:border-l md:border-r-0 md:shadow-none lg:w-[340px]";

  return `${base} ${inline} ${layout === "floating" ? floating : docked}`;
}

function isSchedulePanelPointAnchor(
  anchor: SchedulePanelAnchorElement,
): anchor is { clientX: number; clientY: number } {
  return !!anchor && "clientX" in anchor && "clientY" in anchor;
}

function isCompanySchedule(schedule: Schedule) {
  return (
    schedule.is_company_schedule === true ||
    schedule.company_schedule_id != null ||
    schedule.schedule_id <= -COMPANY_SCHEDULE_ID_OFFSET
  );
}

function scheduleOwnerType(schedule: Schedule): ScheduleOwnerType {
  return isCompanySchedule(schedule) ? "company" : "personal";
}

function scheduleOwnerFilterLabel(value: ScheduleOwnerFilter) {
  return (
    scheduleOwnerFilterOptions.find((option) => option.value === value)
      ?.label ?? "전체 일정"
  );
}

function isPreviewSchedule(schedule: Schedule) {
  return (schedule as Partial<PreviewSchedule>).is_preview === true;
}

function isReadonlySchedule(schedule: Schedule) {
  return isCompanySchedule(schedule) || isPreviewSchedule(schedule);
}

function useSchedulePanelFloatingStyle(
  anchorElement: SchedulePanelAnchorElement,
  open: boolean,
): SchedulePanelFloatingStyle {
  const [style, setStyle] = useState<SchedulePanelFloatingStyle>(
    defaultSchedulePanelFloatingStyle,
  );

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const margin = 8;
      const gap = 12;
      const panelWidth = 390;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxHeight = Math.max(420, viewportHeight - margin * 2);
      const anchorPoint = isSchedulePanelPointAnchor(anchorElement)
        ? anchorElement
        : null;
      const anchorRect =
        anchorElement &&
        typeof HTMLElement !== "undefined" &&
        anchorElement instanceof HTMLElement &&
        anchorElement.isConnected
          ? anchorElement.getBoundingClientRect()
          : null;
      const maxLeft = Math.max(margin, viewportWidth - panelWidth - margin);

      let top = anchorRect
        ? anchorRect.top
        : anchorPoint
          ? anchorPoint.clientY
          : 8;
      let left = anchorRect
        ? anchorRect.right + gap
        : anchorPoint
          ? anchorPoint.clientX + gap
          : maxLeft;

      if (anchorRect) {
        const rightSpace = viewportWidth - anchorRect.right - gap - margin;
        const leftSpace = anchorRect.left - gap - margin;

        if (rightSpace < panelWidth && leftSpace >= panelWidth) {
          left = anchorRect.left - gap - panelWidth;
        } else if (rightSpace < panelWidth) {
          left = anchorRect.left;
        }
      } else if (anchorPoint) {
        const rightSpace = viewportWidth - anchorPoint.clientX - gap - margin;
        const leftSpace = anchorPoint.clientX - gap - margin;

        if (rightSpace < panelWidth && leftSpace >= panelWidth) {
          left = anchorPoint.clientX - gap - panelWidth;
        }
      }

      left = Math.min(maxLeft, Math.max(margin, left));
      top = Math.min(
        Math.max(margin, top),
        Math.max(margin, viewportHeight - maxHeight - margin),
      );

      setStyle({
        "--schedule-panel-left": `${Math.round(left)}px`,
        "--schedule-panel-top": `${Math.round(top)}px`,
        "--schedule-panel-max-height": `${Math.round(maxHeight)}px`,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorElement, open]);

  return style;
}

function companyScheduleSyntheticId(companyScheduleId: number) {
  return -(COMPANY_SCHEDULE_ID_OFFSET + companyScheduleId);
}

function companyScheduleSourceId(schedule: Schedule) {
  if (schedule.company_schedule_id != null) return schedule.company_schedule_id;
  if (schedule.schedule_id <= -COMPANY_SCHEDULE_ID_OFFSET) {
    return Math.abs(schedule.schedule_id) - COMPANY_SCHEDULE_ID_OFFSET;
  }
  return schedule.schedule_id;
}

function scheduleIdentityKey(schedule: Schedule) {
  return isCompanySchedule(schedule)
    ? `company:${companyScheduleSourceId(schedule)}`
    : `personal:${schedule.schedule_id}`;
}

export function mergeSchedules(
  schedules: Schedule[],
  companySchedules: Schedule[],
) {
  const byIdentity = new Map<string, Schedule>();

  for (const schedule of [...schedules, ...companySchedules]) {
    byIdentity.set(scheduleIdentityKey(schedule), schedule);
  }

  return [...byIdentity.values()];
}

function normalizeScheduleType(value: unknown): ScheduleType {
  return SCHEDULE_TYPES.includes(value as ScheduleType)
    ? (value as ScheduleType)
    : "other";
}

export function companyScheduleToSchedule(schedule: CompanySchedule): Schedule {
  return {
    schedule_id: companyScheduleSyntheticId(schedule.company_schedule_id),
    company_schedule_id: schedule.company_schedule_id,
    is_company_schedule: true,
    company: schedule.company,
    title: schedule.title,
    description: schedule.description ?? null,
    schedule_type: normalizeScheduleType(schedule.schedule_type),
    is_completed: false,
    start_datetime: schedule.start_datetime,
    end_datetime: schedule.end_datetime ?? null,
    all_day: schedule.all_day,
    location: schedule.location ?? null,
    category_id: null,
    visibility: "private",
    source_type: schedule.source_type,
    is_collaboration: schedule.is_collaboration,
    approval_status: schedule.approval_status,
    approval_summary: schedule.approval_summary,
    origin_department: schedule.origin_department ?? null,
    created_by_company_member: schedule.created_by_company_member ?? null,
    updated_by_company_member: schedule.updated_by_company_member ?? null,
    targets: schedule.targets,
    created_at: schedule.created_at ?? schedule.start_datetime,
    updated_at: schedule.updated_at,
  };
}

const repeatUnitLabels: Record<RepeatFrequencyUnit, string> = {
  day: "일",
  week: "주",
  month: "개월",
  year: "년",
};

const customRepeatWeekdays: Array<{
  value: CustomRepeatWeekday;
  label: string;
  day: number;
}> = [
  { value: "SU", label: "일", day: 0 },
  { value: "MO", label: "월", day: 1 },
  { value: "TU", label: "화", day: 2 },
  { value: "WE", label: "수", day: 3 },
  { value: "TH", label: "목", day: 4 },
  { value: "FR", label: "금", day: 5 },
  { value: "SA", label: "토", day: 6 },
];

const weekdayCodeByDay = customRepeatWeekdays.reduce(
  (acc, option) => {
    acc[option.day] = option.value;
    return acc;
  },
  {} as Record<number, CustomRepeatWeekday>,
);

const weekdayDayByCode = customRepeatWeekdays.reduce(
  (acc, option) => {
    acc[option.value] = option.day;
    return acc;
  },
  {} as Record<CustomRepeatWeekday, number>,
);

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

function parseScheduleOwnerFilter(value: string | null): ScheduleOwnerFilter {
  return value === "personal" || value === "company" ? value : "all";
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
  return `${date.getFullYear()}\uB144 ${date.getMonth() + 1}\uC6D4`;
}

function formatSelectedDate(date?: Date): string {
  if (!date) return "날짜 선택";
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
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

function formatDatePart(date: Date): string {
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  const dateText = `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;

  return includeYear
    ? `${String(date.getFullYear()).slice(-2)}.${dateText}(${weekday})`
    : `${dateText}(${weekday})`;
}

function formatDateInputDisplay(dateKey: string): string {
  const compactDate = dateKey ? new Date(`${dateKey}T00:00:00`) : null;
  if (!compactDate || Number.isNaN(compactDate.getTime())) return "날짜 선택";
  return formatDatePart(compactDate);
  if (!dateKey) return "날짜 선택";
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "날짜 선택";
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();

  return date.toLocaleDateString("ko-KR", {
    ...(includeYear ? { year: "2-digit" as const } : {}),
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatDateRange(startLocal: string, endLocal: string) {
  const startDateKey = dateFromLocalInput(startLocal);
  const endDateKey = dateFromLocalInput(endLocal) || startDateKey;
  if (!startDateKey) return "";

  const start = new Date(`${startDateKey}T00:00:00`);
  const end = new Date(`${endDateKey}T00:00:00`);
  if (Number.isNaN(start.getTime())) return "";

  const startText = formatDatePart(start);
  if (startDateKey === endDateKey || Number.isNaN(end.getTime())) {
    return startText;
  }

  return `${startText} -> ${formatDatePart(end)}`;
}

function formatTimeRange(startLocal: string, endLocal: string) {
  const startTime = timeFromLocalInput(startLocal);
  const endTime = timeFromLocalInput(endLocal);
  if (!startTime || !endTime) return "";
  return `${startTime} -> ${endTime}`;
}

function normalizeDateInput(value: string, baseDateKey: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const baseDate = new Date(`${baseDateKey}T00:00:00`);
  const fallbackYear = Number.isNaN(baseDate.getTime())
    ? new Date().getFullYear()
    : baseDate.getFullYear();
  let year = fallbackYear;
  let month = 0;
  let day = 0;

  const fullMatch = /^(\d{4})[-/.\s]*(\d{1,2})[-/.\s]*(\d{1,2})/.exec(trimmed);
  const shortMatch = /^(\d{1,2})[-/.\s]+(\d{1,2})/.exec(trimmed);
  const compactMatch = /^(\d{4})(\d{2})(\d{2})$/.exec(trimmed);
  const compactShortMatch = /^(\d{1,2})(\d{2})$/.exec(trimmed);

  if (compactMatch) {
    year = Number(compactMatch[1]);
    month = Number(compactMatch[2]);
    day = Number(compactMatch[3]);
  } else if (fullMatch) {
    year = Number(fullMatch[1]);
    month = Number(fullMatch[2]);
    day = Number(fullMatch[3]);
  } else if (shortMatch) {
    month = Number(shortMatch[1]);
    day = Number(shortMatch[2]);
  } else if (compactShortMatch) {
    month = Number(compactShortMatch[1]);
    day = Number(compactShortMatch[2]);
  } else {
    return null;
  }

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return toDateKey(date);
}

function moveDateByKeyboard(
  dateKey: string,
  direction: -1 | 1,
  weekly = false,
) {
  const base = new Date(`${dateKey}T00:00:00`);
  const date = Number.isNaN(base.getTime()) ? new Date() : base;
  date.setDate(date.getDate() + direction * (weekly ? 7 : 1));
  return toDateKey(date);
}

function getCalendarViewMonth(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    : new Date(date.getFullYear(), date.getMonth(), 1);
}

function isCurrentMonth(date: Date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
}

function getDurationText(startLocal: string, endLocal: string) {
  const start = new Date(startLocal);
  const end = new Date(endLocal || startLocal);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const totalMinutes = Math.max(
    0,
    Math.round((end.getTime() - start.getTime()) / 60000),
  );
  if (totalMinutes === 0) return "";

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}\uC77C`);
  if (hours > 0) parts.push(`${hours}\uC2DC\uAC04`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}\uBD84`);
  return parts.join(" ");
}

function formatTimeInputDisplay(value: string) {
  if (!value) return "--:--";
  const [hourText, minuteText = "00"] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;

  return `${pad(hour)}:${pad(minute)}`;
}

function formatWeekRange(dates: Date[]): string {
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return "";

  const formatRangeDate = (date: Date, includeYear: boolean) => {
    const weekday = weekdayLabels[date.getDay()];
    const dateText = `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;

    return includeYear
      ? `${date.getFullYear()}.${dateText}(${weekday})`
      : `${dateText}(${weekday})`;
  };

  return `${formatRangeDate(first, true)}~${formatRangeDate(
    last,
    first.getFullYear() !== last.getFullYear(),
  )}`;
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

function startOfWeek(
  date: Date,
  weekStart: WeekStartDay = defaultWeekStart,
): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysSinceWeekStart(d, weekStart));
  return d;
}

function buildWeekDates(
  date: Date,
  weekStart: WeekStartDay = defaultWeekStart,
): Date[] {
  const start = startOfWeek(date, weekStart);
  return Array.from({ length: 7 }, (_, idx) => {
    const d = new Date(start);
    d.setDate(start.getDate() + idx);
    return d;
  });
}

function buildMonthCells(
  date: Date,
  weekStart: WeekStartDay = defaultWeekStart,
): Array<Date | null> {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstWeekday = daysSinceWeekStart(new Date(year, month, 1), weekStart);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(year, month, day));
  }

  return cells;
}

function buildFullMonthCells(
  date: Date,
  options: {
    fixedWeeks?: number;
    startDate?: Date;
    weekStart?: WeekStartDay;
  } = {},
): MonthCalendarCell[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const weekStart = options.weekStart ?? defaultWeekStart;
  const firstOfMonth = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const naturalCells =
    Math.ceil((daysSinceWeekStart(firstOfMonth, weekStart) + totalDays) / 7) *
    7;
  const fixedCells = options.fixedWeeks ? options.fixedWeeks * 7 : null;
  const totalCells = fixedCells
    ? Math.max(naturalCells, fixedCells)
    : naturalCells;
  const firstCell = options.startDate
    ? new Date(options.startDate)
    : new Date(firstOfMonth);
  if (!options.startDate) {
    firstCell.setDate(
      firstOfMonth.getDate() - daysSinceWeekStart(firstOfMonth, weekStart),
    );
  }
  firstCell.setHours(0, 0, 0, 0);

  return Array.from({ length: totalCells }, (_, index) => {
    const cellDate = new Date(firstCell);
    cellDate.setDate(firstCell.getDate() + index);
    return {
      date: cellDate,
      currentMonth: cellDate.getMonth() === month,
    };
  });
}

function monthCalendarWindowStart(
  date: Date,
  weekStart: WeekStartDay = defaultWeekStart,
) {
  const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  firstOfMonth.setHours(0, 0, 0, 0);
  return startOfWeek(firstOfMonth, weekStart);
}

function dominantMonthInWindow(startDate: Date, dayCount = 42) {
  const counts = new Map<string, { date: Date; count: number }>();

  for (let offset = 0; offset < dayCount; offset += 1) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + offset);
    const key = `${day.getFullYear()}-${day.getMonth()}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else {
      counts.set(key, {
        date: new Date(day.getFullYear(), day.getMonth(), 1),
        count: 1,
      });
    }
  }

  return (
    [...counts.values()].sort((first, second) => {
      if (first.count !== second.count) return second.count - first.count;
      return first.date.getTime() - second.date.getTime();
    })[0]?.date ?? new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  );
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

function localInputForDateKey(dateKey: string, sourceLocal: string) {
  const source = new Date(sourceLocal);
  const target = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(source.getTime()) || Number.isNaN(target.getTime())) {
    return dateKeyToLocalInput(dateKey, sourceLocal);
  }

  target.setHours(source.getHours(), source.getMinutes(), 0, 0);
  return localInputFromDate(target);
}

function shiftLocalRangeToDateKey(
  startLocal: string,
  endLocal: string,
  dateKey: string,
) {
  const shiftedStartLocal = localInputForDateKey(dateKey, startLocal);
  if (!endLocal) {
    return {
      start_local: shiftedStartLocal,
      end_local: "",
    };
  }

  const originalStart = new Date(startLocal);
  const originalEnd = new Date(endLocal);
  const shiftedStart = new Date(shiftedStartLocal);
  if (
    Number.isNaN(originalStart.getTime()) ||
    Number.isNaN(originalEnd.getTime()) ||
    Number.isNaN(shiftedStart.getTime())
  ) {
    return {
      start_local: shiftedStartLocal,
      end_local: dateKeyToLocalInput(dateKey, endLocal),
    };
  }

  const duration = originalEnd.getTime() - originalStart.getTime();
  return {
    start_local: shiftedStartLocal,
    end_local:
      duration > 0
        ? localInputFromDate(new Date(shiftedStart.getTime() + duration))
        : dateKeyToLocalInput(dateKey, endLocal),
  };
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

function nextDateKey(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  date.setDate(date.getDate() + 1);
  return toDateKey(date);
}

function endLocalWithTimeAfterEndTimeChange(
  startLocal: string,
  currentEndLocal: string,
  nextEndTime: string,
) {
  if (!nextEndTime) return "";

  const startDateKey = dateFromLocalInput(startLocal);
  const endDateKey = dateFromLocalInput(currentEndLocal) || startDateKey;
  const nextEndLocal = localInputWithTime(
    currentEndLocal || startLocal,
    nextEndTime,
    endDateKey,
  );
  const start = new Date(startLocal);
  const end = new Date(nextEndLocal);

  if (
    !startDateKey ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end > start
  ) {
    return nextEndLocal;
  }

  return `${nextDateKey(startDateKey)}T${nextEndTime}`;
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

export function groupHolidaysByDate(holidays: Holiday[]) {
  const grouped = new Map<string, Holiday[]>();

  for (const holiday of holidays) {
    if (
      holiday.is_public_holiday === false ||
      !/^\d{4}-\d{2}-\d{2}$/.test(holiday.date)
    ) {
      continue;
    }

    const bucket = grouped.get(holiday.date);
    if (bucket) bucket.push(holiday);
    else grouped.set(holiday.date, [holiday]);
  }

  return grouped;
}

function buildFormsForDateKeys(form: ScheduleFormState, dateKeys: string[]) {
  return normalizeDateKeys(dateKeys).map((dateKey) => ({
    ...form,
    ...shiftLocalRangeToDateKey(form.start_local, form.end_local, dateKey),
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

function formatYearlyRepeatDay(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function buildRepeatTypeOptions(startLocal: string): RepeatTypeOption[] {
  const start = new Date(startLocal);
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const weekday = weekdayLabels[safeStart.getDay()];
  const weekdaySummary = `${weekday}요일`;

  return [
    { value: "daily", label: "1일마다" },
    {
      value: "weekdays",
      label: "평일마다",
      summary: "월~금",
      dividerBefore: true,
    },
    { value: "weekends", label: "주말마다", summary: "토~일" },
    {
      value: "weekly",
      label: "1주마다",
      summary: weekdaySummary,
      dividerBefore: true,
    },
    {
      value: "biweekly",
      label: "2주마다",
      summary: weekdaySummary,
    },
    {
      value: "monthly",
      label: "1개월마다",
      summary: `${safeStart.getDate()}일`,
      dividerBefore: true,
    },
    {
      value: "monthly-last-weekday",
      label: "1개월마다",
      summary: `마지막 ${weekdaySummary}`,
    },
    {
      value: "yearly",
      label: "1년마다",
      summary: formatYearlyRepeatDay(safeStart),
      dividerBefore: true,
    },
    {
      value: "custom",
      label: "사용자 지정",
      summary: `2주마다 ${weekdaySummary}`,
      dividerBefore: true,
    },
    {
      value: "selected-dates",
      label: "날짜 직접 선택",
    },
  ];
}

function formatRepeatEndSummary(
  repeatEndType: RepeatEndType,
  repeatUntilDate: string | null,
  repeatCount: number | null,
) {
  if (repeatEndType === "until" && repeatUntilDate) {
    return `${formatKoreanDate(repeatUntilDate)}까지`;
  }

  if (repeatEndType === "count" && repeatCount) {
    return `${repeatCount}회 반복 후 종료`;
  }

  return "계속 반복";
}

function formatKoreanDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getRepeatEndMode(endType: RepeatEndType): RepeatEndMode {
  if (endType === "until") return "on";
  if (endType === "count") return "after";
  return "never";
}

function isRuleRepeatType(type: RepeatType): type is BasicRepeatType {
  return type !== "none" && type !== "custom" && type !== "selected-dates";
}

function defaultCustomRepeat(startDateKey: string): CustomRepeat {
  const start = new Date(`${startDateKey}T00:00:00`);
  const weekday = Number.isNaN(start.getTime())
    ? weekdayCodeByDay[new Date().getDay()]
    : weekdayCodeByDay[start.getDay()];

  return {
    interval: 2,
    unit: "week",
    weekdays: [weekday],
    endType: "never",
    endDate: null,
    count: null,
  };
}

function cloneCustomRepeat(value: CustomRepeat): CustomRepeat {
  return {
    ...value,
    weekdays: [...value.weekdays],
  };
}

function customWeekdaysToDays(weekdays: CustomRepeatWeekday[]) {
  return weekdays
    .map((weekday) => weekdayDayByCode[weekday])
    .filter((day) => Number.isInteger(day));
}

function getBasicRepeatConfig(type: BasicRepeatType, startDateKey: string) {
  const start = new Date(`${startDateKey}T00:00:00`);
  const weekday = Number.isNaN(start.getTime())
    ? new Date().getDay()
    : start.getDay();

  switch (type) {
    case "daily":
      return {
        interval: 1,
        unit: "day" as const,
        weekdays: [weekday],
        monthlyMode: "date" as const,
      };
    case "weekdays":
      return {
        interval: 1,
        unit: "week" as const,
        weekdays: [1, 2, 3, 4, 5],
        monthlyMode: "date" as const,
      };
    case "weekends":
      return {
        interval: 1,
        unit: "week" as const,
        weekdays: [0, 6],
        monthlyMode: "date" as const,
      };
    case "weekly":
      return {
        interval: 1,
        unit: "week" as const,
        weekdays: [weekday],
        monthlyMode: "date" as const,
      };
    case "biweekly":
      return {
        interval: 2,
        unit: "week" as const,
        weekdays: [weekday],
        monthlyMode: "date" as const,
      };
    case "monthly":
      return {
        interval: 1,
        unit: "month" as const,
        weekdays: [weekday],
        monthlyMode: "date" as const,
      };
    case "monthly-nth-weekday":
      return {
        interval: 1,
        unit: "month" as const,
        weekdays: [weekday],
        monthlyMode: "nth_weekday" as const,
      };
    case "monthly-last-weekday":
      return {
        interval: 1,
        unit: "month" as const,
        weekdays: [weekday],
        monthlyMode: "last_weekday" as const,
      };
    case "yearly":
      return {
        interval: 1,
        unit: "year" as const,
        weekdays: [weekday],
        monthlyMode: "date" as const,
      };
  }
}

function buildBasicRepeatDateKeys(options: {
  type: BasicRepeatType;
  startDate: string;
  endType: RepeatEndType;
  endDate: string | null;
  count: number | null;
}) {
  const config = getBasicRepeatConfig(options.type, options.startDate);
  return buildRepeatDateKeys({
    startDate: options.startDate,
    interval: config.interval,
    unit: config.unit,
    weekdays: config.weekdays,
    monthlyMode: config.monthlyMode,
    endMode: getRepeatEndMode(options.endType),
    endDate: options.endDate ?? "",
    occurrenceCount: options.count ?? 1,
  });
}

function buildCustomRepeatDateKeys(
  startDate: string,
  customRepeat: CustomRepeat,
) {
  const fallbackStart = new Date(`${startDate}T00:00:00`);
  const fallbackWeekday = Number.isNaN(fallbackStart.getTime())
    ? new Date().getDay()
    : fallbackStart.getDay();
  const weekdays = customWeekdaysToDays(customRepeat.weekdays);

  return buildRepeatDateKeys({
    startDate,
    interval: customRepeat.interval,
    unit: customRepeat.unit,
    weekdays: weekdays.length > 0 ? weekdays : [fallbackWeekday],
    monthlyMode: "date",
    endMode: getRepeatEndMode(customRepeat.endType),
    endDate: customRepeat.endDate ?? "",
    occurrenceCount: customRepeat.count ?? 1,
  });
}

function formatCustomRepeatSummary(customRepeat: CustomRepeat) {
  const safeInterval = Math.max(1, customRepeat.interval || 1);
  const unitLabel = repeatUnitLabels[customRepeat.unit];
  const intervalText =
    safeInterval === 1 && customRepeat.unit === "day"
      ? "매일"
      : safeInterval === 1 && customRepeat.unit === "week"
        ? "매주"
        : safeInterval === 1 && customRepeat.unit === "month"
          ? "매월"
          : safeInterval === 1 && customRepeat.unit === "year"
            ? "매년"
            : `${safeInterval}${unitLabel}마다`;
  const weekdayText =
    customRepeat.unit === "week" && customRepeat.weekdays.length > 0
      ? ` ${customRepeat.weekdays
          .map((weekday) => {
            const label =
              customRepeatWeekdays.find((option) => option.value === weekday)
                ?.label ?? "";
            return label ? `${label}요일` : "";
          })
          .filter(Boolean)
          .join(", ")}`
      : "";
  const endText =
    customRepeat.endType === "until" && customRepeat.endDate
      ? ` · ${formatKoreanDate(customRepeat.endDate)}까지`
      : customRepeat.endType === "count" && customRepeat.count
        ? ` · ${customRepeat.count}회 후 종료`
        : "";

  return `${intervalText}${weekdayText}${endText}`;
}

function formatSelectedDatesSummary(dateKeys: string[]) {
  const normalized = normalizeDateKeys(dateKeys);
  if (normalized.length === 0) return "선택한 날짜 없음";
  return `선택한 날짜 ${normalized.length}개`;
}

function formatRepeatOptionSummary(
  option: RepeatTypeOption,
  customRepeat: CustomRepeat,
  customSelectedDates: string[],
) {
  const { label, summary } = getRepeatOptionDisplayParts(
    option,
    customRepeat,
    customSelectedDates,
  );
  return summary ? `${label} ${summary}` : label;
}

function getRepeatOptionDisplayParts(
  option: RepeatTypeOption,
  customRepeat: CustomRepeat,
  customSelectedDates: string[],
) {
  if (option.value === "custom") {
    return {
      label: option.label,
      summary: formatCustomRepeatSummary(customRepeat),
    };
  }

  if (option.value === "selected-dates") {
    return {
      label: option.label,
      summary: formatSelectedDatesSummary(customSelectedDates),
    };
  }

  if (option.value === "daily") {
    return {
      label: "매일",
      summary: undefined,
    };
  }

  if (option.value === "weekly") {
    return {
      label: "매주",
      summary: option.summary,
    };
  }

  if (option.value === "monthly" || option.value === "monthly-last-weekday") {
    return {
      label: "매월",
      summary: option.summary,
    };
  }

  if (option.value === "yearly") {
    return {
      label: "매년",
      summary: option.summary,
    };
  }

  return {
    label: option.label,
    summary: option.summary,
  };
}

function getRepeatOptionMenuParts(
  option: RepeatTypeOption,
  customRepeat: CustomRepeat,
  customSelectedDates: string[],
) {
  if (option.value === "custom") {
    return {
      label: option.label,
      summary: formatCustomRepeatSummary(customRepeat),
    };
  }

  if (option.value === "selected-dates") {
    return {
      label: option.label,
      summary: formatSelectedDatesSummary(customSelectedDates),
    };
  }

  return {
    label: option.label,
    summary: option.summary,
  };
}

function renderFloatingPortal(content: ReactNode) {
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
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

export function emptyFormForDate(date: Date): ScheduleFormState {
  const hasExplicitTime =
    date.getHours() !== 0 ||
    date.getMinutes() !== 0 ||
    date.getSeconds() !== 0 ||
    date.getMilliseconds() !== 0;
  const endDate = addMinutes(date, 30);

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
      : dateAtLocalTime(date, 9, 30),
    all_day: false,
    location: "",
    visibility: "private",
    category_id: "",
  };
}

function formFromCreateDraft(draft: ScheduleCreateDraft): ScheduleFormState {
  const start = Number.isNaN(draft.start.getTime()) ? new Date() : draft.start;
  const end =
    !Number.isNaN(draft.end.getTime()) && draft.end > start
      ? draft.end
      : addMinutes(start, 30);

  return {
    ...emptyFormForDate(start),
    start_local: localInputFromDate(start),
    end_local: localInputFromDate(end),
    all_day: draft.allDay ?? false,
  };
}

function formForScheduleOwner(
  form: ScheduleFormState,
  owner: ScheduleOwnerType,
) {
  return owner === "company" && form.schedule_type === "personal"
    ? { ...form, schedule_type: "meeting" as const }
    : form;
}

function allDayCreateDraftForDate(date: Date): ScheduleCreateDraft {
  const { start, end } = dayBounds(date);
  return { start, end, allDay: true };
}

function allDayCreateDraftForRange(startDate: Date, endDate: Date) {
  return {
    start: dayBounds(startDate).start,
    end: dayBounds(endDate).end,
    allDay: true,
  };
}

export function toPayload(form: ScheduleFormState) {
  const allDay = shouldUseAllDayLaneForForm(form);

  return {
    title: normalizeScheduleTitle(form.title),
    description: form.description.trim() || undefined,
    schedule_type: form.schedule_type,
    priority: form.priority,
    start_datetime: fromLocalInputValue(form.start_local),
    end_datetime: form.end_local
      ? fromLocalInputValue(form.end_local)
      : undefined,
    all_day: allDay,
    location: form.location.trim() || undefined,
    visibility: form.visibility === "private" ? ("private" as const) : undefined,
    category_id: form.category_id === "" ? undefined : String(form.category_id),
  };
}

async function copyTextToClipboard(text: string) {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof navigator.clipboard.writeText !== "function"
  ) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function applyScheduleCreateShare({
  schedules,
  share,
  createShareLink,
  createFriendShare,
}: {
  schedules: Schedule[];
  share?: ScheduleCreateShareOption;
  createShareLink: (vars: {
    scheduleId: number;
    payload: CreateScheduleShareLinkRequest;
  }) => Promise<CreateScheduleShareLinkResponse>;
  createFriendShare: (vars: {
    scheduleId: number;
    payload: CreateScheduleFriendShareRequest;
  }) => Promise<CreateScheduleFriendShareResponse>;
}) {
  if (!share || schedules.length === 0) return;

  if (share.kind === "link") {
    const links: string[] = [];

    for (const schedule of schedules) {
      const result = await createShareLink({
        scheduleId: schedule.schedule_id,
        payload: {
          permission: share.permission,
          max_uses: null,
          expires_at: null,
        },
      });
      links.push(result.url);
    }

    const firstLink = links[0];
    if (firstLink) {
      const copied = await copyTextToClipboard(firstLink);
      toast.success(
        copied
          ? "공유 링크를 만들고 복사했습니다."
          : "공유 링크를 만들었습니다.",
      );
    }
    return;
  }

  for (const schedule of schedules) {
    await createFriendShare({
      scheduleId: schedule.schedule_id,
      payload:
        share.scope === "preset"
          ? {
              scope: "preset",
              friend_preset_id: share.friend_preset_id,
              permission: share.permission,
            }
          : {
              scope: "all_friends",
              permission: share.permission,
            },
    });
  }
}

function previewScheduleFromForm(
  form: ScheduleFormState,
  index: number,
  source?: Schedule | null,
): PreviewSchedule | null {
  const start = new Date(form.start_local);
  if (Number.isNaN(start.getTime())) return null;

  const end =
    form.end_local && !Number.isNaN(new Date(form.end_local).getTime())
      ? fromLocalInputValue(form.end_local)
      : null;
  const allDay = shouldUseAllDayLaneForForm(form);

  return {
    schedule_id:
      source?.schedule_id ?? -(PREVIEW_SCHEDULE_ID_OFFSET + index + 1),
    user_id: source?.user_id,
    title: normalizeScheduleTitle(form.title),
    description: form.description.trim() || null,
    schedule_type: form.schedule_type,
    priority: form.priority,
    is_completed: source?.is_completed ?? false,
    start_datetime: fromLocalInputValue(form.start_local),
    end_datetime: end,
    all_day: allDay,
    location: form.location.trim() || null,
    category_id: form.category_id === "" ? null : Number(form.category_id),
    visibility: form.visibility,
    recurrence_group_id: source?.recurrence_group_id ?? null,
    recurrence_sequence: source?.recurrence_sequence ?? null,
    recurrence_rule: source?.recurrence_rule ?? null,
    source_memo_id: source?.source_memo_id ?? null,
    source_ai_result_id: source?.source_ai_result_id ?? null,
    source_type: source?.source_type ?? null,
    targets: source?.targets,
    created_at: source?.created_at ?? fromLocalInputValue(form.start_local),
    updated_at: source?.updated_at,
    is_preview: true,
  };
}

function scheduleFormSignature(form: ScheduleFormState) {
  return JSON.stringify(toPayload(form));
}

function normalizeScheduleTitle(title: string) {
  return title.trim() || untitledScheduleTitle;
}

function validateForm(form: ScheduleFormState): string | null {
  if (!form.start_local) return "시작 일시를 선택해 주세요.";

  const start = new Date(form.start_local).getTime();
  if (Number.isNaN(start)) return "시작 일시가 올바르지 않습니다.";

  if (form.end_local) {
    const end = new Date(form.end_local).getTime();
    if (Number.isNaN(end)) return "종료 일시가 올바르지 않습니다.";
    if (end <= start) return "종료 시간은 시작 시간보다 늦어야 합니다.";
  }

  return null;
}

function FilterDropdown<TValue extends FilterOptionValue>({
  label,
  icon,
  selectedValues,
  options,
  multiple = true,
  allLabel = "전체",
  onClear,
  onSelect,
}: {
  label: string;
  icon: ReactNode;
  selectedValues: TValue[];
  options: InlineFilterOption<TValue>[];
  multiple?: boolean;
  allLabel?: string;
  onClear?: () => void;
  onSelect: (value: TValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [previewValues, setPreviewValues] = useState<TValue[] | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const displayValues = previewValues ?? selectedValues;
  const displaySet = useMemo(
    () => new Set<FilterOptionValue>(displayValues),
    [displayValues],
  );
  const displayOptions = options.filter((option) =>
    displaySet.has(option.value),
  );
  const summary =
    displayOptions.length === 0
      ? allLabel
      : displayOptions.length === 1
        ? displayOptions[0].label
        : `${displayOptions[0].label} 외 ${displayOptions.length - 1}`;

  const updateMenuPosition = useCallback(() => {
    if (typeof window === "undefined") return;

    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const panelRect = button
      .closest("[data-schedule-filter-panel]")
      ?.getBoundingClientRect();
    const margin = 10;
    const gap = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(
      Math.max(rect.width, 224),
      Math.max(160, Math.min(280, viewportWidth - margin * 2)),
    );
    const maxHeight = Math.min(288, Math.max(140, viewportHeight - margin * 2));

    if (viewportWidth < 768) {
      setMenuStyle({
        left: margin,
        top: Math.max(margin, viewportHeight - maxHeight - margin),
        width: viewportWidth - margin * 2,
        maxHeight,
      });
      return;
    }

    const boundaryLeft = panelRect?.left ?? rect.left;
    const boundaryRight = panelRect?.right ?? rect.right;
    const boundaryTop = panelRect?.top ?? rect.top;
    const boundaryBottom = panelRect?.bottom ?? rect.bottom;
    const placementOrder: Array<"right" | "left" | "bottom" | "top"> = [
      "right",
      "left",
      "bottom",
      "top",
    ];
    const positionFor = (placement: "right" | "left" | "bottom" | "top") => {
      if (placement === "right") {
        return { left: boundaryRight + gap, top: rect.top };
      }
      if (placement === "left") {
        return { left: boundaryLeft - width - gap, top: rect.top };
      }
      if (placement === "top") {
        return { left: rect.left, top: boundaryTop - maxHeight - gap };
      }
      return { left: rect.left, top: boundaryBottom + gap };
    };
    const fits = ({ left, top }: { left: number; top: number }) =>
      left >= margin &&
      left + width <= viewportWidth - margin &&
      top >= margin &&
      top + maxHeight <= viewportHeight - margin;
    const fitsHorizontally = ({ left }: { left: number }) =>
      left >= margin && left + width <= viewportWidth - margin;
    const preferredPosition =
      placementOrder.map(positionFor).find(fits) ??
      placementOrder.map(positionFor).find(fitsHorizontally) ??
      positionFor("right");

    const left = Math.min(
      Math.max(margin, preferredPosition.left),
      Math.max(margin, viewportWidth - width - margin),
    );
    const top = Math.min(
      Math.max(margin, preferredPosition.top),
      Math.max(margin, viewportHeight - maxHeight - margin),
    );

    setMenuStyle({
      left: Math.round(left),
      top: Math.round(top),
      width: Math.round(width),
      maxHeight: Math.round(maxHeight),
    });
  }, []);

  useEffect(() => {
    if (!open) setPreviewValues(null);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (containerRef.current?.contains(target) ||
          menuRef.current?.contains(target))
      ) {
        return;
      }

      setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [open]);

  const previewOption = (value: TValue) => {
    if (!multiple) {
      setPreviewValues([value]);
      return;
    }

    setPreviewValues(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value],
    );
  };

  const commitOption = (value: TValue) => {
    onSelect(value);
    setPreviewValues(null);
    if (!multiple) setOpen(false);
  };

  const previewClear = () => setPreviewValues([]);

  const renderOption = (
    option: InlineFilterOption<TValue>,
    selected: boolean,
  ) => (
    <button
      key={option.key}
      type="button"
      onClick={() => commitOption(option.value)}
      onMouseEnter={() => previewOption(option.value)}
      onFocus={() => previewOption(option.value)}
      className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold outline-none transition ${
        selected
          ? "bg-white/10 text-white"
          : "text-zinc-200 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white"
      }`}
      title={option.label}
    >
      <span className="flex min-w-0 items-center gap-2">
        {option.colorDot ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: option.colorDot }}
          />
        ) : null}
        <span className="min-w-0">
          <span className="block truncate">{option.label}</span>
          {option.description ? (
            <span
              className={`mt-0.5 block truncate text-[11px] font-medium ${
                selected ? "text-zinc-300" : "text-zinc-500"
              }`}
            >
              {option.description}
            </span>
          ) : null}
        </span>
      </span>
      {selected ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-violet-400" />
      ) : null}
    </button>
  );

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            data-schedule-filter-menu
            style={menuStyle}
            className="fixed z-[160] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-100 shadow-2xl shadow-zinc-950/30 outline-none"
            onPointerDown={(event) => event.stopPropagation()}
            onMouseLeave={() => setPreviewValues(null)}
          >
            <div
              className="scrollbar-none overflow-y-auto"
              style={{ maxHeight: menuStyle.maxHeight }}
            >
              {multiple && onClear ? (
                <button
                  type="button"
                  onClick={() => {
                    onClear();
                    setPreviewValues(null);
                    setOpen(false);
                  }}
                  onMouseEnter={previewClear}
                  onFocus={previewClear}
                  className={`flex h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs font-semibold outline-none transition ${
                    displayValues.length === 0
                      ? "bg-white/10 text-white"
                      : "text-zinc-200 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white"
                  }`}
                >
                  <span>{allLabel}</span>
                  {displayValues.length === 0 ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                  ) : null}
                </button>
              ) : null}
              {options.map((option) =>
                renderOption(option, displaySet.has(option.value)),
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className="relative min-w-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border px-2 text-left text-sm font-medium shadow-none outline-none transition ${
          open
            ? "border-violet-300 bg-white ring-2 ring-violet-100"
            : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white"
        }`}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-slate-400">{icon}</span>
          <span className="shrink-0 text-slate-500">{label}</span>
          <span className="min-w-0 truncate text-slate-900">{summary}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${
            open ? "rotate-180 text-violet-500" : ""
          }`}
        />
      </button>
      {menu}
    </div>
  );
}

function ScheduleOwnerViewSelector({
  value,
  onChange,
}: {
  value: ScheduleOwnerFilter;
  onChange: (value: ScheduleOwnerFilter) => void;
}) {
  const selectedLabel = scheduleOwnerFilterLabel(value);
  const renderIcon = (owner: ScheduleOwnerFilter, className: string) => {
    if (owner === "company") return <Building2 className={className} />;
    if (owner === "personal") return <UserRound className={className} />;
    return <Users className={className} />;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold shadow-sm transition hover:bg-slate-50 ${
            value === "all"
              ? "border-slate-200 bg-white text-slate-900"
              : "border-violet-200 bg-violet-50 text-violet-700"
          }`}
          aria-label="일정 보기 선택"
        >
          {renderIcon(value, "h-3.5 w-3.5 shrink-0")}
          <span className="hidden max-w-24 truncate min-[420px]:inline">
            {selectedLabel}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52 border-slate-800 bg-neutral-900 p-1.5 text-slate-100 shadow-xl"
      >
        {scheduleOwnerFilterOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className={`gap-3 rounded-md px-2.5 py-2 text-sm text-slate-200 focus:bg-neutral-800 focus:text-white ${
              value === option.value ? "bg-neutral-800" : ""
            }`}
          >
            <span className="flex h-4 w-4 items-center justify-center text-violet-400">
              {value === option.value ? <Check className="h-4 w-4" /> : null}
            </span>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
              style={{
                backgroundColor: scheduleOwnerFilterColors[option.value],
              }}
              aria-hidden
            />
            <span className="min-w-0">
              <span
                className={`block truncate font-medium ${
                  value === option.value ? "text-violet-200" : "text-slate-100"
                }`}
              >
                {option.label}
              </span>
              <span className="block truncate text-[11px] text-slate-500">
                {option.description}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScheduleFilterPanel({
  filters,
  activeCount,
  scheduleTypeOptions,
  priorityOptions,
  categoryOptions,
  onUpdate,
  onReset,
  onClose,
}: {
  filters: ScheduleFilters;
  activeCount: number;
  scheduleTypeOptions: InlineFilterOption<ScheduleType>[];
  priorityOptions: InlineFilterOption<TaskPriority>[];
  categoryOptions: InlineFilterOption<number>[];
  onUpdate: (patch: Partial<ScheduleFilters>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnKey);
    return () => window.removeEventListener("keydown", closeOnKey);
  }, [onClose]);

  const toggleScheduleType = (value: ScheduleType) => {
    const selected = filters.scheduleTypes.includes(value);
    onUpdate({
      scheduleTypes: selected
        ? filters.scheduleTypes.filter((item) => item !== value)
        : [...filters.scheduleTypes, value],
    });
  };
  const togglePriority = (value: TaskPriority) => {
    const selected = filters.priorities.includes(value);
    onUpdate({
      priorities: selected
        ? filters.priorities.filter((item) => item !== value)
        : [...filters.priorities, value],
    });
  };
  const toggleCategory = (value: number) => {
    const selected = filters.categories.includes(value);
    onUpdate({
      categories: selected
        ? filters.categories.filter((item) => item !== value)
        : [...filters.categories, value],
    });
  };
  const completionOptions: InlineFilterOption<ScheduleCompletionFilter>[] = [
    { key: "all", value: "all", label: "전체" },
    { key: "active", value: "active", label: "미완료" },
    { key: "completed", value: "completed", label: "완료" },
  ];
  const ownerOptions: InlineFilterOption<ScheduleOwnerFilter>[] =
    scheduleOwnerFilterOptions.map((option) => ({
      key: option.value,
      value: option.value,
      label: option.label,
      colorDot: scheduleOwnerFilterColors[option.value],
      description: option.description,
    }));

  return (
    <div className="flex max-h-[min(34rem,calc(100vh-6rem))] flex-col overflow-hidden">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Search className="h-4 w-4 text-violet-600" />
          <h2 className="text-base font-semibold text-slate-950">필터</h2>
          {activeCount > 0 && (
            <span className="rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            초기화
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="필터 패널 닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4">
        <label className="block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={filters.q}
              onChange={(event) => onUpdate({ q: event.target.value })}
              placeholder="검색"
              aria-label="검색"
              className="h-10 w-full rounded-md border border-transparent bg-transparent px-9 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-200 hover:bg-white focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
            />
          </div>
        </label>

        <div className="grid gap-2">
          <FilterDropdown
            label="보기"
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
            selectedValues={[filters.owner]}
            options={ownerOptions}
            multiple={false}
            onSelect={(value) => onUpdate({ owner: value })}
          />

          <FilterDropdown
            label="상태"
            icon={<CheckSquare2 className="h-4 w-4" aria-hidden="true" />}
            selectedValues={[filters.completion]}
            options={completionOptions}
            multiple={false}
            onSelect={(value) => onUpdate({ completion: value })}
          />

          <FilterDropdown
            label="유형"
            icon={<Shapes className="h-4 w-4" aria-hidden="true" />}
            selectedValues={filters.scheduleTypes}
            options={scheduleTypeOptions}
            onClear={() => onUpdate({ scheduleTypes: [] })}
            onSelect={toggleScheduleType}
          />

          <FilterDropdown
            label="중요도"
            icon={<Flag className="h-4 w-4" aria-hidden="true" />}
            selectedValues={filters.priorities}
            options={priorityOptions}
            onClear={() => onUpdate({ priorities: [] })}
            onSelect={togglePriority}
          />

          <FilterDropdown
            label="카테고리"
            icon={<Tag className="h-4 w-4" aria-hidden="true" />}
            selectedValues={filters.categories}
            options={categoryOptions}
            onClear={() => onUpdate({ categories: [] })}
            onSelect={toggleCategory}
          />
        </div>
      </div>
    </div>
  );
}

export function ScheduleFormPanel({
  mode,
  initial,
  schedule,
  isPending,
  onClose,
  onDelete,
  deletePending,
  onCompletionChange,
  completionPending,
  onSubmit,
  onCompanySubmit,
  companyName,
  companyDepartmentLabel,
  ownCompanyDepartmentId,
  defaultOwner = "personal",
  onPreviewChange,
  floatingStyle,
  panelLayout,
}: {
  mode: "create" | "edit" | "repeat";
  initial: ScheduleFormState;
  schedule?: Schedule | null;
  isPending?: boolean;
  onClose: () => void;
  onDelete?: () => Promise<void> | void;
  deletePending?: boolean;
  onCompletionChange?: (completed: boolean) => Promise<void> | void;
  completionPending?: boolean;
  onSubmit: (
    forms: ScheduleFormState[],
    options?: ScheduleFormSubmitOptions,
  ) => Promise<void> | void;
  onCompanySubmit?: (
    payload: CreateCompanyScheduleRequest,
  ) => Promise<void> | void;
  companyName?: string;
  companyDepartmentLabel?: string;
  ownCompanyDepartmentId?: number | null;
  defaultOwner?: ScheduleOwnerType;
  onPreviewChange?: (forms: ScheduleFormState[]) => void;
  floatingStyle: SchedulePanelFloatingStyle;
  panelLayout: SchedulePanelLayout;
}) {
  const ownerInitialForm = formForScheduleOwner(initial, defaultOwner);
  const [form, setForm] = useState<ScheduleFormState>(ownerInitialForm);
  const [allDay, setAllDay] = useState(ownerInitialForm.all_day);
  const [scheduleOwner, setScheduleOwner] =
    useState<ScheduleOwnerType>(defaultOwner);
  const [companyTargets, setCompanyTargets] = useState<
    CompanyScheduleCreateTarget[]
  >([]);
  const [companyCollaborationEnabled, setCompanyCollaborationEnabled] =
    useState(false);
  const [companyDepartmentPickerOpen, setCompanyDepartmentPickerOpen] =
    useState(false);
  const [personalAttendees, setPersonalAttendees] = useState<
    PersonalScheduleAttendee[]
  >([]);
  const [personalAttendeeOpen, setPersonalAttendeeOpen] = useState(false);
  const [personalAttendeeQuery, setPersonalAttendeeQuery] = useState("");
  const [shareTargetOpen, setShareTargetOpen] = useState(false);
  const [shareTargetTab, setShareTargetTab] =
    useState<ScheduleCreateShareTab>("friends");
  const [shareTargetKind, setShareTargetKind] =
    useState<ScheduleCreateShareTargetKind>("link");
  const [shareSearchQuery, setShareSearchQuery] = useState("");
  const [selectedFriendPresetId, setSelectedFriendPresetId] = useState<
    number | null
  >(null);
  const [sharePermission] = useState<ScheduleSharePermission>("viewer");
  const [error, setError] = useState<string | null>(null);
  const [, setAutoSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const endTimeInputRef = useRef<HTMLInputElement | null>(null);
  const startDateInputRef = useRef<HTMLInputElement | null>(null);
  const endDateInputRef = useRef<HTMLInputElement | null>(null);
  const repeatTypeDropdownRef = useRef<HTMLDivElement | null>(null);
  const repeatEndDropdownRef = useRef<HTMLDivElement | null>(null);
  const repeatTypePopupRef = useRef<HTMLDivElement | null>(null);
  const repeatEndPopupRef = useRef<HTMLDivElement | null>(null);
  const customRepeatPopupRef = useRef<HTMLDivElement | null>(null);
  const selectedDatesPopupRef = useRef<HTMLDivElement | null>(null);
  const repeatTypeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const repeatEndTriggerRef = useRef<HTMLButtonElement | null>(null);
  const repeatUntilDateButtonRef = useRef<HTMLButtonElement | null>(null);
  const shareTargetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shareTargetPopupRef = useRef<HTMLDivElement | null>(null);
  const repeatOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const repeatEndOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const repeatCountInputRef = useRef<HTMLInputElement | null>(null);
  const selectedDateButtonRefs = useRef<
    Record<string, HTMLButtonElement | null>
  >({});
  const lastAutoSaveSignatureRef = useRef(
    scheduleFormSignature(ownerInitialForm),
  );
  const syncingInitialSignatureRef = useRef<string | null>(null);
  const initialSignature = scheduleFormSignature(ownerInitialForm);
  const [selectedDates, setSelectedDates] = useState<string[]>([
    initial.start_local.slice(0, 10),
  ]);
  const [customSelectedDates, setCustomSelectedDates] = useState<string[]>([]);
  const [repeatStartDate, setRepeatStartDate] = useState(
    initial.start_local.slice(0, 10),
  );
  const [repeatTypeOpen, setRepeatTypeOpen] = useState(false);
  const [repeatEndOpen, setRepeatEndOpen] = useState(false);
  const [customRepeatOpen, setCustomRepeatOpen] = useState(false);
  const [selectedDatesOpen, setSelectedDatesOpen] = useState(false);
  const [repeatTypePopupStyle, setRepeatTypePopupStyle] =
    useState<CSSProperties>({});
  const [repeatEndPopupStyle, setRepeatEndPopupStyle] = useState<CSSProperties>(
    {},
  );
  const [customRepeatPopupStyle, setCustomRepeatPopupStyle] =
    useState<CSSProperties>({});
  const [selectedDatesPopupStyle, setSelectedDatesPopupStyle] =
    useState<CSSProperties>({});
  const [shareTargetPopupStyle, setShareTargetPopupStyle] =
    useState<CSSProperties>({});
  const [selectedRepeatOption, setSelectedRepeatOption] = useState<RepeatType>(
    mode === "repeat" ? "weekly" : "none",
  );
  const [previewRepeatOption, setPreviewRepeatOption] =
    useState<RepeatType | null>(null);
  const [, setActiveRepeatOptionIndex] = useState(0);
  const [activeRepeatEndOptionIndex, setActiveRepeatEndOptionIndex] =
    useState(0);
  const [repeatEnabled, setRepeatEnabled] = useState(mode === "repeat");
  const [includeHolidayRepeats, setIncludeHolidayRepeats] = useState(true);
  const [draftIncludeHolidayRepeats, setDraftIncludeHolidayRepeats] =
    useState(true);
  const [repeatEndType, setRepeatEndType] = useState<RepeatEndType>("never");
  const [repeatUntilDate, setRepeatUntilDate] = useState<string | null>(null);
  const [repeatCount, setRepeatCount] = useState<number | null>(null);
  const [customRepeat, setCustomRepeat] = useState<CustomRepeat>(() =>
    defaultCustomRepeat(initial.start_local.slice(0, 10)),
  );
  const [draftCustomRepeat, setDraftCustomRepeat] = useState<CustomRepeat>(() =>
    defaultCustomRepeat(initial.start_local.slice(0, 10)),
  );
  const [draftRepeatDates, setDraftRepeatDates] = useState<string[]>([]);
  const [repeatUntilCalendarMonth, setRepeatUntilCalendarMonth] = useState(() =>
    getCalendarViewMonth(initial.start_local.slice(0, 10)),
  );
  const [selectedDatesCalendarMonth, setSelectedDatesCalendarMonth] = useState(
    () => getCalendarViewMonth(initial.start_local.slice(0, 10)),
  );
  const [activeSelectedDateKey, setActiveSelectedDateKey] = useState(
    initial.start_local.slice(0, 10),
  );
  const [selectedDatesError, setSelectedDatesError] = useState<string | null>(
    null,
  );
  const [previewStartLocal, setPreviewStartLocal] = useState<string | null>(
    null,
  );
  const [previewEndLocal, setPreviewEndLocal] = useState<string | null>(null);
  const [selectPreviewDisplayPatch, setSelectPreviewDisplayPatch] =
    useState<ScheduleSelectPreviewPatch>({});
  const [selectPreviewPatch, setSelectPreviewPatch] =
    useState<ScheduleSelectPreviewPatch>({});
  const [selectDisplayTouched, setSelectDisplayTouched] =
    useState<ScheduleSelectDisplayState>({
      schedule_type: mode !== "create",
      priority: mode !== "create",
      category_id: mode !== "create" && initial.category_id !== "",
    });
  const { weekStart } = useUserSettings();
  const weekdayHeaders = useMemo(
    () => orderedWeekdayLabels(weekStart),
    [weekStart],
  );
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
  const {
    data: scheduleCategories = [],
    isLoading: scheduleCategoriesLoading,
  } = useCategories("schedule");
  const isCompanyScheduleDraft =
    mode === "create" && scheduleOwner === "company" && !!onCompanySubmit;
  const personalShareEnabled = mode === "create" && !isCompanyScheduleDraft;
  const friendsQuery = useFriends({ enabled: personalShareEnabled });
  const friendPresetsQuery = useFriendPresets({ enabled: personalShareEnabled });
  const departmentsQuery = useCompanyAdminDepartments(
    isCompanyScheduleDraft && companyCollaborationEnabled,
  );
  const scheduleTypeSelectOptions = useMemo<CustomSelectOption<ScheduleType>[]>(
    () =>
      scheduleTypeOptions.map((option) => {
        const meta = scheduleTypeSelectMeta[option.value];
        return {
          label: meta?.label ?? option.label,
          value: option.value,
          colorDot: meta?.color,
        };
      }),
    [scheduleTypeOptions],
  );
  const prioritySelectOptions = useMemo<CustomSelectOption<TaskPriority>[]>(
    () =>
      priorityOptions.map((option) => {
        const meta = prioritySelectMeta[option.value];
        return {
          label: option.label,
          value: option.value,
          colorDot: meta?.color,
        };
      }),
    [priorityOptions],
  );
  const categorySelectOptions = useMemo<CustomSelectOption<number | "">[]>(
    () => [
      {
        label: "카테고리 없음",
        value: "",
        colorDot: emptyCategoryColor,
        description: "분류 없이 저장",
      },
      ...scheduleCategories.map((category) => ({
        label: category.name,
        value: category.category_id,
        colorDot: category.color || fallbackCategoryColor,
      })),
    ],
    [scheduleCategories],
  );
  const formStartDateKey = dateFromLocalInput(form.start_local);
  const formEndDateKey = dateFromLocalInput(form.end_local) || formStartDateKey;
  const repeatType = selectedRepeatOption;
  const displayRepeatOption = previewRepeatOption ?? selectedRepeatOption;
  const repeatEndSummary = formatRepeatEndSummary(
    repeatEndType,
    repeatUntilDate,
    repeatCount,
  );
  const repeatTypeOptions = useMemo(
    () =>
      buildRepeatTypeOptions(
        dateKeyToLocalInput(formStartDateKey, form.start_local),
      ),
    [form.start_local, formStartDateKey],
  );
  const displayRepeatTypeOption =
    repeatTypeOptions.find((option) => option.value === displayRepeatOption) ??
    repeatTypeOptions[0];
  const ruleRepeatDateKeys = useMemo(() => {
    if (repeatType === "custom") {
      return buildCustomRepeatDateKeys(repeatStartDate, customRepeat);
    }

    if (isRuleRepeatType(repeatType)) {
      return buildBasicRepeatDateKeys({
        type: repeatType,
        startDate: repeatStartDate,
        endType: repeatEndType,
        endDate: repeatUntilDate,
        count: repeatCount,
      });
    }

    return [];
  }, [
    customRepeat,
    repeatCount,
    repeatEndType,
    repeatStartDate,
    repeatType,
    repeatUntilDate,
  ]);
  const isRepeatMode =
    repeatType !== "none" &&
    repeatType !== "selected-dates" &&
    (mode === "repeat" ||
      ((mode === "create" || mode === "edit") && repeatEnabled));
  const isSelectedDatesMode = repeatType === "selected-dates";
  const repeatHolidayRangeQuery = useMemo(() => {
    if (!isRepeatMode || ruleRepeatDateKeys.length === 0) {
      return null;
    }

    const normalizedDateKeys = normalizeDateKeys(ruleRepeatDateKeys);
    if (normalizedDateKeys.length === 0) return null;

    return {
      start_date: normalizedDateKeys[0],
      end_date: normalizedDateKeys[normalizedDateKeys.length - 1],
      public_only: true,
    };
  }, [isRepeatMode, ruleRepeatDateKeys]);
  const { data: repeatHolidays = [] } = useHolidaysInRange(
    repeatHolidayRangeQuery,
    { enabled: Boolean(repeatHolidayRangeQuery) },
  );
  const repeatHolidayDateSet = useMemo(
    () =>
      new Set(
        repeatHolidays
          .filter((holiday) => holiday.is_public_holiday !== false)
          .map((holiday) => holiday.date),
      ),
    [repeatHolidays],
  );
  const repeatHolidayDateKeys = useMemo(() => {
    if (!isRepeatMode || repeatHolidayDateSet.size === 0) return [];
    return normalizeDateKeys(
      ruleRepeatDateKeys.filter((dateKey) => repeatHolidayDateSet.has(dateKey)),
    );
  }, [isRepeatMode, repeatHolidayDateSet, ruleRepeatDateKeys]);
  const repeatHolidayCount = repeatHolidayDateKeys.length;
  const showRepeatHolidayControl =
    isRepeatMode && ruleRepeatDateKeys.length > 0;
  const effectiveRuleRepeatDateKeys = useMemo(() => {
    if (!showRepeatHolidayControl || includeHolidayRepeats) {
      return ruleRepeatDateKeys;
    }

    return ruleRepeatDateKeys.filter(
      (dateKey) => !repeatHolidayDateSet.has(dateKey),
    );
  }, [
    includeHolidayRepeats,
    repeatHolidayDateSet,
    ruleRepeatDateKeys,
    showRepeatHolidayControl,
  ]);
  const draftCustomRepeatDateKeys = useMemo(
    () => buildCustomRepeatDateKeys(repeatStartDate, draftCustomRepeat),
    [draftCustomRepeat, repeatStartDate],
  );
  const draftCustomRepeatHolidayRangeQuery = useMemo(() => {
    if (!customRepeatOpen || draftCustomRepeatDateKeys.length === 0) {
      return null;
    }

    const normalizedDateKeys = normalizeDateKeys(draftCustomRepeatDateKeys);
    if (normalizedDateKeys.length === 0) return null;

    return {
      start_date: normalizedDateKeys[0],
      end_date: normalizedDateKeys[normalizedDateKeys.length - 1],
      public_only: true,
    };
  }, [customRepeatOpen, draftCustomRepeatDateKeys]);
  const { data: draftCustomRepeatHolidays = [] } = useHolidaysInRange(
    draftCustomRepeatHolidayRangeQuery,
    { enabled: Boolean(draftCustomRepeatHolidayRangeQuery) },
  );
  const draftCustomRepeatHolidayDateSet = useMemo(
    () =>
      new Set(
        draftCustomRepeatHolidays
          .filter((holiday) => holiday.is_public_holiday !== false)
          .map((holiday) => holiday.date),
      ),
    [draftCustomRepeatHolidays],
  );
  const draftCustomRepeatHolidayDateKeys = useMemo(() => {
    if (draftCustomRepeatHolidayDateSet.size === 0) return [];
    return normalizeDateKeys(
      draftCustomRepeatDateKeys.filter((dateKey) =>
        draftCustomRepeatHolidayDateSet.has(dateKey),
      ),
    );
  }, [draftCustomRepeatDateKeys, draftCustomRepeatHolidayDateSet]);
  const draftCustomRepeatHolidayCount = draftCustomRepeatHolidayDateKeys.length;
  const showDraftCustomRepeatHolidayControl =
    customRepeatOpen && draftCustomRepeatDateKeys.length > 0;
  const customSelectedDateKeys = useMemo(
    () => normalizeDateKeys(customSelectedDates),
    [customSelectedDates],
  );
  const targetDateKeys = isRepeatMode
    ? effectiveRuleRepeatDateKeys
    : repeatType === "selected-dates"
      ? customSelectedDateKeys
      : mode === "create"
        ? normalizeDateKeys(selectedDates)
        : [form.start_local.slice(0, 10)];
  const previewForm = useMemo(
    () => ({ ...form, ...selectPreviewPatch }),
    [form, selectPreviewPatch],
  );
  const hasPreviewDisplayField = (field: ScheduleSelectField) =>
    Object.prototype.hasOwnProperty.call(selectPreviewDisplayPatch, field);
  const optionLabelOrFallback = <TValue extends string | number>(
    options: readonly CustomSelectOption<TValue>[],
    value: TValue,
    fallback: string,
  ) =>
    options.find((option) => Object.is(option.value, value))?.label ?? fallback;
  const getSelectTriggerLabel = <TValue extends string | number>(
    field: ScheduleSelectField,
    value: TValue,
    options: readonly CustomSelectOption<TValue>[],
    fallback: string,
  ) => {
    if (hasPreviewDisplayField(field)) {
      return optionLabelOrFallback(
        options,
        selectPreviewDisplayPatch[field] as TValue,
        fallback,
      );
    }

    if (selectDisplayTouched[field]) {
      return optionLabelOrFallback(options, value, fallback);
    }

    return fallback;
  };
  const getSelectTriggerColorDot = <TValue extends string | number>(
    field: ScheduleSelectField,
    value: TValue,
    options: readonly CustomSelectOption<TValue>[],
  ) => {
    const displayValue = hasPreviewDisplayField(field)
      ? (selectPreviewDisplayPatch[field] as TValue)
      : selectDisplayTouched[field]
        ? value
        : null;

    if (displayValue === null) return null;

    return (
      options.find((option) => Object.is(option.value, displayValue))
        ?.colorDot ?? null
    );
  };
  const markSelectDisplayTouched = (field: ScheduleSelectField) => {
    setSelectDisplayTouched((prev) =>
      prev[field] ? prev : { ...prev, [field]: true },
    );
  };
  const scheduleTypeTriggerLabel = getSelectTriggerLabel(
    "schedule_type",
    form.schedule_type,
    scheduleTypeSelectOptions,
    "유형",
  );
  const priorityTriggerLabel = getSelectTriggerLabel(
    "priority",
    form.priority,
    prioritySelectOptions,
    "중요도",
  );
  const categoryTriggerLabel = getSelectTriggerLabel(
    "category_id",
    form.category_id,
    categorySelectOptions,
    "카테고리",
  );
  const scheduleTypeTriggerColorDot = getSelectTriggerColorDot(
    "schedule_type",
    form.schedule_type,
    scheduleTypeSelectOptions,
  );
  const priorityTriggerColorDot = getSelectTriggerColorDot(
    "priority",
    form.priority,
    prioritySelectOptions,
  );
  const categoryTriggerColorDot = getSelectTriggerColorDot(
    "category_id",
    form.category_id,
    categorySelectOptions,
  );
  const repeatControlLabel = formatRepeatOptionSummary(
    displayRepeatTypeOption,
    customRepeat,
    customSelectedDateKeys,
  );
  const repeatControlDisplay = getRepeatOptionDisplayParts(
    displayRepeatTypeOption,
    customRepeat,
    customSelectedDateKeys,
  );
  const previewForms = isCompanyScheduleDraft
    ? [previewForm]
    : mode === "create" || isRepeatMode || isSelectedDatesMode
      ? buildFormsForDateKeys(previewForm, targetDateKeys)
      : [previewForm];
  const displayStartLocal = previewStartLocal ?? form.start_local;
  const displayEndLocal = previewEndLocal ?? form.end_local;
  const formTimeRangeLabel = formatTimeRange(
    displayStartLocal,
    displayEndLocal,
  );
  const formDateRangeLabel = formatDateRange(
    displayStartLocal,
    displayEndLocal,
  );
  const formDurationLabel = allDay
    ? ""
    : getDurationText(displayStartLocal, displayEndLocal);
  const autoSaveSignature = useMemo(() => scheduleFormSignature(form), [form]);
  const hasUnsavedFormChanges = autoSaveSignature !== initialSignature;
  const hasSelectPreview = Object.keys(selectPreviewPatch).length > 0;
  const shouldShowFormPreview =
    mode !== "edit" ||
    hasUnsavedFormChanges ||
    hasSelectPreview ||
    isRepeatMode ||
    isSelectedDatesMode;
  const previewFormsSignature = previewForms
    .map((item) => scheduleFormSignature(item))
    .join("\n");

  const syncDescriptionTextareaHeight = useCallback(
    (textarea = descriptionTextareaRef.current) => {
      if (!textarea) return;

      const minHeight = 36;
      const maxHeight = 160;
      textarea.style.height = "auto";
      const nextHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight),
      );
      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY =
        textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    },
    [],
  );

  useLayoutEffect(() => {
    syncDescriptionTextareaHeight();
  }, [form.description, syncDescriptionTextareaHeight]);

  useEffect(() => {
    syncingInitialSignatureRef.current = initialSignature;
    setForm(ownerInitialForm);
    setAllDay(ownerInitialForm.all_day);
    setScheduleOwner(defaultOwner);
    setCompanyTargets([]);
    setCompanyCollaborationEnabled(false);
    setCompanyDepartmentPickerOpen(false);
    setPersonalAttendees([]);
    setPersonalAttendeeOpen(false);
    setPersonalAttendeeQuery("");
    setShareTargetOpen(false);
    setShareTargetTab("friends");
    setShareTargetKind("link");
    setShareSearchQuery("");
    setSelectedFriendPresetId(null);
    setSelectedDates([initial.start_local.slice(0, 10)]);
    setCustomSelectedDates([]);
    setRepeatStartDate(initial.start_local.slice(0, 10));
    setRepeatTypeOpen(false);
    setRepeatEndOpen(false);
    setCustomRepeatOpen(false);
    setSelectedDatesOpen(false);
    setPreviewRepeatOption(null);
    setSelectedRepeatOption(mode === "repeat" ? "weekly" : "none");
    setRepeatEnabled(mode === "repeat");
    setIncludeHolidayRepeats(true);
    setDraftIncludeHolidayRepeats(true);
    setRepeatEndType("never");
    setRepeatUntilDate(null);
    setRepeatCount(null);
    const nextCustomRepeat = defaultCustomRepeat(
      initial.start_local.slice(0, 10),
    );
    setCustomRepeat(nextCustomRepeat);
    setDraftCustomRepeat(cloneCustomRepeat(nextCustomRepeat));
    setDraftRepeatDates([]);
    setRepeatUntilCalendarMonth(
      getCalendarViewMonth(initial.start_local.slice(0, 10)),
    );
    setSelectedDatesCalendarMonth(
      getCalendarViewMonth(initial.start_local.slice(0, 10)),
    );
    setActiveSelectedDateKey(initial.start_local.slice(0, 10));
    setSelectedDatesError(null);
    lastAutoSaveSignatureRef.current = initialSignature;
    setAutoSaveState("idle");
    setPreviewStartLocal(null);
    setPreviewEndLocal(null);
    setSelectPreviewDisplayPatch({});
    setSelectPreviewPatch({});
    setSelectDisplayTouched({
      schedule_type: mode !== "create",
      priority: mode !== "create",
      category_id: mode !== "create" && initial.category_id !== "",
    });
    setError(null);
  }, [defaultOwner, initialSignature, mode]);

  useEffect(() => {
    onPreviewChange?.(shouldShowFormPreview ? previewForms : []);
  }, [onPreviewChange, previewFormsSignature, shouldShowFormPreview]);

  useEffect(() => {
    return () => {
      onPreviewChange?.([]);
    };
  }, [onPreviewChange]);

  const updateSelectPreview = <TField extends keyof ScheduleSelectPreviewPatch>(
    field: TField,
    value: ScheduleSelectPreviewPatch[TField] | null,
  ) => {
    setSelectPreviewDisplayPatch((prev) => {
      const next = { ...prev };

      if (value === null) {
        delete next[field];
      } else {
        next[field] = value;
      }

      return next;
    });
    setSelectPreviewPatch((prev) => {
      const next = { ...prev };

      if (value === null || Object.is(value, form[field])) {
        delete next[field];
      } else {
        next[field] = value;
      }

      return next;
    });
  };

  const updateFloatingPopupPosition = useCallback(
    (
      anchor: HTMLElement | null,
      setStyle: (style: CSSProperties) => void,
      width: number,
      maxHeight: number,
      placement: "bottom" | "right" | "left" | "top" = "right",
    ) => {
      if (!anchor || typeof window === "undefined") return;

      const margin = 10;
      const gap = 10;
      const rect = anchor.getBoundingClientRect();
      const panelRect = anchor.closest("aside")?.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxPopupHeight = Math.min(maxHeight, viewportHeight - margin * 2);

      if (viewportWidth < 768) {
        setStyle({
          left: margin,
          top: Math.max(margin, viewportHeight - maxPopupHeight - margin),
          width: viewportWidth - margin * 2,
          maxHeight: maxPopupHeight,
        });
        return;
      }

      const panelRight = panelRect?.right ?? rect.right;
      const panelLeft = panelRect?.left ?? rect.left;
      const placementOrder: Array<"right" | "left" | "bottom" | "top"> =
        placement === "right"
          ? ["right", "left", "bottom", "top"]
          : placement === "left"
            ? ["left", "right", "bottom", "top"]
            : placement === "bottom"
              ? ["bottom", "right", "left", "top"]
              : ["top", "right", "left", "bottom"];
      const positionFor = (
        nextPlacement: "right" | "left" | "bottom" | "top",
      ) => {
        if (nextPlacement === "right") {
          return { left: panelRight + gap, top: rect.top };
        }
        if (nextPlacement === "left") {
          return { left: panelLeft - width - gap, top: rect.top };
        }
        if (nextPlacement === "top") {
          return { left: rect.left, top: rect.top - maxPopupHeight - gap };
        }
        return { left: rect.left, top: rect.bottom + gap };
      };
      const fits = ({ left, top }: { left: number; top: number }) =>
        left >= margin &&
        left + width <= viewportWidth - margin &&
        top >= margin &&
        top + maxPopupHeight <= viewportHeight - margin;
      const fitsHorizontally = ({ left }: { left: number }) =>
        left >= margin && left + width <= viewportWidth - margin;
      const preferredPosition =
        placementOrder.map(positionFor).find(fits) ??
        placementOrder.map(positionFor).find(fitsHorizontally) ??
        positionFor(placement);

      let left = preferredPosition.left;
      let top = preferredPosition.top;

      left = Math.min(
        Math.max(margin, left),
        Math.max(margin, viewportWidth - width - margin),
      );
      top = Math.min(
        Math.max(margin, top),
        Math.max(margin, viewportHeight - maxPopupHeight - margin),
      );

      setStyle({
        left: Math.round(left),
        top: Math.round(top),
        width,
        maxHeight: maxPopupHeight,
      });
    },
    [],
  );

  useEffect(() => {
    if (
      !repeatTypeOpen &&
      !repeatEndOpen &&
      !customRepeatOpen &&
      !selectedDatesOpen
    ) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (repeatTypeDropdownRef.current?.contains(target) ||
          repeatEndDropdownRef.current?.contains(target) ||
          repeatTypePopupRef.current?.contains(target) ||
          repeatEndPopupRef.current?.contains(target) ||
          customRepeatPopupRef.current?.contains(target) ||
          selectedDatesPopupRef.current?.contains(target) ||
          (target instanceof Element &&
            (target.closest(".schedule-basic-options-select-menu") ||
              target.closest(".schedule-date-popover"))))
      ) {
        return;
      }

      setRepeatTypeOpen(false);
      setRepeatEndOpen(false);
      setCustomRepeatOpen(false);
      setSelectedDatesOpen(false);
      setPreviewRepeatOption(null);
      setSelectedDatesError(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRepeatTypeOpen(false);
      setRepeatEndOpen(false);
      setCustomRepeatOpen(false);
      setSelectedDatesOpen(false);
      setPreviewRepeatOption(null);
      setSelectedDatesError(null);
      const triggerToFocus = repeatEndOpen
        ? repeatEndTriggerRef.current
        : repeatTypeTriggerRef.current;
      triggerToFocus?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsideClick, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [customRepeatOpen, repeatEndOpen, repeatTypeOpen, selectedDatesOpen]);

  useEffect(() => {
    if (!repeatTypeOpen) return;

    const updatePosition = () =>
      updateFloatingPopupPosition(
        repeatTypeTriggerRef.current,
        setRepeatTypePopupStyle,
        260,
        560,
        "right",
      );

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [repeatTypeOpen, updateFloatingPopupPosition]);

  useEffect(() => {
    if (!repeatEndOpen) return;

    const updatePosition = () =>
      updateFloatingPopupPosition(
        repeatEndTriggerRef.current,
        setRepeatEndPopupStyle,
        repeatEndType === "until" ? 280 : 260,
        repeatEndType === "until" ? 560 : 260,
        "right",
      );

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [repeatEndOpen, repeatEndType, updateFloatingPopupPosition]);

  useEffect(() => {
    if (!customRepeatOpen) return;

    const updatePosition = () =>
      updateFloatingPopupPosition(
        repeatTypeTriggerRef.current,
        setCustomRepeatPopupStyle,
        352,
        560,
        "right",
      );

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [customRepeatOpen, updateFloatingPopupPosition]);

  useEffect(() => {
    if (!selectedDatesOpen) return;

    const updatePosition = () =>
      updateFloatingPopupPosition(
        repeatTypeTriggerRef.current,
        setSelectedDatesPopupStyle,
        280,
        340,
        "right",
      );

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [selectedDatesOpen, updateFloatingPopupPosition]);

  useEffect(() => {
    if (!shareTargetOpen) return;

    const updatePosition = () =>
      updateFloatingPopupPosition(
        shareTargetTriggerRef.current,
        setShareTargetPopupStyle,
        340,
        620,
        "left",
      );

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [shareTargetOpen, updateFloatingPopupPosition]);

  useEffect(() => {
    if (!shareTargetOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (shareTargetTriggerRef.current?.contains(target) ||
          shareTargetPopupRef.current?.contains(target))
      ) {
        return;
      }

      setShareTargetOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShareTargetOpen(false);
      shareTargetTriggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsideClick, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [shareTargetOpen]);

  useEffect(() => {
    if (!repeatTypeOpen) return;

    const selectedIndex = Math.max(
      0,
      repeatTypeOptions.findIndex(
        (option) => option.value === selectedRepeatOption,
      ),
    );
    setActiveRepeatOptionIndex(selectedIndex);
    setPreviewRepeatOption(null);
    window.requestAnimationFrame(() => {
      repeatOptionRefs.current[selectedIndex]?.focus();
    });
  }, [repeatTypeOpen, repeatTypeOptions, selectedRepeatOption]);

  useEffect(() => {
    if (!repeatEndOpen) return;

    const selectedIndex = Math.max(
      0,
      repeatEndOptions.findIndex((option) => option.value === repeatEndType),
    );
    setActiveRepeatEndOptionIndex(selectedIndex);
    window.requestAnimationFrame(() => {
      repeatEndOptionRefs.current[selectedIndex]?.focus();
    });
  }, [repeatEndOpen]);

  useEffect(() => {
    if (!selectedDatesOpen) return;

    const activeDate = new Date(`${activeSelectedDateKey}T00:00:00`);
    if (!Number.isNaN(activeDate.getTime())) {
      setSelectedDatesCalendarMonth(
        new Date(activeDate.getFullYear(), activeDate.getMonth(), 1),
      );
    }

    window.requestAnimationFrame(() => {
      selectedDateButtonRefs.current[activeSelectedDateKey]?.focus();
    });
  }, [activeSelectedDateKey, selectedDatesOpen]);

  useEffect(() => {
    if (mode !== "create") return;

    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [initialSignature, mode]);

  useEffect(() => {
    if (mode !== "edit" || !schedule) return;

    if (syncingInitialSignatureRef.current) {
      if (autoSaveSignature === syncingInitialSignatureRef.current) {
        syncingInitialSignatureRef.current = null;
      }
      return;
    }

    setAutoSaveState(
      autoSaveSignature === lastAutoSaveSignatureRef.current
        ? "idle"
        : "saving",
    );
    setError(null);
  }, [autoSaveSignature, mode, schedule]);

  const closeRepeatTypeMenu = (options: { focusTrigger?: boolean } = {}) => {
    setRepeatTypeOpen(false);
    setPreviewRepeatOption(null);
    if (options.focusTrigger) {
      window.requestAnimationFrame(() => repeatTypeTriggerRef.current?.focus());
    }
  };

  const closeRepeatEndMenu = (options: { focusTrigger?: boolean } = {}) => {
    setRepeatEndOpen(false);
    if (options.focusTrigger) {
      window.requestAnimationFrame(() => repeatEndTriggerRef.current?.focus());
    }
  };

  const syncCustomRepeatEnd = (
    endType: RepeatEndType,
    endDate: string | null,
    count: number | null,
  ) => {
    if (repeatType !== "custom") return;

    setCustomRepeat((prev) => ({
      ...prev,
      endType,
      endDate: endType === "until" ? endDate : null,
      count: endType === "count" ? count : null,
    }));
  };

  const openCustomRepeatPopover = () => {
    setDraftCustomRepeat(cloneCustomRepeat(customRepeat));
    setDraftIncludeHolidayRepeats(includeHolidayRepeats);
    setRepeatTypeOpen(false);
    setRepeatEndOpen(false);
    setSelectedDatesOpen(false);
    setPreviewRepeatOption(null);
    setCustomRepeatOpen(true);
  };

  const openSelectedDatesPopover = () => {
    const normalizedDates = normalizeDateKeys(
      customSelectedDates.length > 0
        ? customSelectedDates
        : [formStartDateKey || toDateKey(new Date())],
    );
    const initialDateKey =
      normalizedDates[0] || formStartDateKey || toDateKey(new Date());

    setDraftRepeatDates(normalizedDates);
    setCustomSelectedDates(normalizedDates);
    setSelectedRepeatOption("selected-dates");
    setRepeatEnabled(true);
    setRepeatEndType("never");
    setRepeatUntilDate(null);
    setRepeatCount(null);
    setSelectedDatesError(null);
    setActiveSelectedDateKey(initialDateKey);
    setSelectedDatesCalendarMonth(getCalendarViewMonth(initialDateKey));
    setRepeatTypeOpen(false);
    setRepeatEndOpen(false);
    setCustomRepeatOpen(false);
    setPreviewRepeatOption(null);
    setSelectedDatesOpen(true);
  };

  const commitRepeatType = (nextType: RepeatType) => {
    if (nextType === "custom") {
      openCustomRepeatPopover();
      return;
    }

    if (nextType === "selected-dates") {
      openSelectedDatesPopover();
      return;
    }

    setSelectedRepeatOption(nextType);
    setRepeatEnabled(nextType !== "none");
    setCustomRepeatOpen(false);
    setSelectedDatesOpen(false);
    closeRepeatTypeMenu({ focusTrigger: true });

    if (nextType === "none") {
      setSelectedDates([form.start_local.slice(0, 10)]);
      setRepeatEndType("never");
      setRepeatUntilDate(null);
      setRepeatCount(null);
    }
  };

  const moveRepeatPreview = (nextIndex: number) => {
    const boundedIndex =
      (nextIndex + repeatTypeOptions.length) % repeatTypeOptions.length;
    const option = repeatTypeOptions[boundedIndex];
    setActiveRepeatOptionIndex(boundedIndex);
    setPreviewRepeatOption(option.value);
    window.requestAnimationFrame(() => {
      repeatOptionRefs.current[boundedIndex]?.focus();
    });
  };

  const renderRepeatTypeControl = (
    className: string,
    options: { showIcon?: boolean } = {},
  ) => {
    const showIcon = options.showIcon ?? true;

    return (
      <div ref={repeatTypeDropdownRef} className="relative flex w-full min-w-0">
        <button
          ref={repeatTypeTriggerRef}
          type="button"
          onClick={() => {
            setRepeatEndOpen(false);
            setCustomRepeatOpen(false);
            setSelectedDatesOpen(false);
            if (repeatTypeOpen) {
              closeRepeatTypeMenu();
            } else {
              setRepeatTypeOpen(true);
            }
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " " ||
              event.key === "ArrowDown"
            ) {
              event.preventDefault();
              setRepeatEndOpen(false);
              setCustomRepeatOpen(false);
              setSelectedDatesOpen(false);
              setRepeatTypeOpen(true);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              closeRepeatTypeMenu({ focusTrigger: true });
            }
          }}
          className={className}
          aria-haspopup="menu"
          aria-expanded={repeatTypeOpen}
          aria-controls="repeat-type-menu"
          aria-label={repeatControlLabel}
        >
          {showIcon ? <Repeat2 className="h-4 w-4 shrink-0" /> : null}
          <span className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left">
            <span className="shrink-0">{repeatControlDisplay.label}</span>
            {repeatControlDisplay.summary ? (
              <span className="min-w-0 truncate text-xs font-medium text-slate-500">
                {repeatControlDisplay.summary}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition ${
              repeatTypeOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
    );
  };

  const renderRepeatTypePopover = () => {
    if (!repeatTypeOpen) return null;

    return renderFloatingPortal(
      <div
        id="repeat-type-menu"
        ref={repeatTypePopupRef}
        role="menu"
        style={repeatTypePopupStyle}
        onMouseLeave={() => setPreviewRepeatOption(null)}
        className="fixed z-[120] outline-none"
      >
        <div className="max-h-[inherit] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-100 shadow-2xl shadow-zinc-950/30">
          <div className="space-y-0.5">
            {repeatTypeOptions.map((option, index) => {
              const selected = selectedRepeatOption === option.value;
              const previewed = displayRepeatOption === option.value;
              const menuParts = getRepeatOptionMenuParts(
                option,
                customRepeat,
                customSelectedDateKeys,
              );
              const summaryBelow = option.value === "selected-dates";

              return (
                <div key={option.value}>
                  {option.dividerBefore ? (
                    <div className="my-0.5 border-t border-zinc-800" />
                  ) : null}
                  <button
                    ref={(node) => {
                      repeatOptionRefs.current[index] = node;
                    }}
                    type="button"
                    role="menuitem"
                    aria-selected={selected}
                    onMouseEnter={() => {
                      setActiveRepeatOptionIndex(index);
                      setPreviewRepeatOption(option.value);
                    }}
                    onFocus={() => {
                      setActiveRepeatOptionIndex(index);
                      setPreviewRepeatOption(option.value);
                    }}
                    onClick={() => commitRepeatType(option.value)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveRepeatPreview(index + 1);
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveRepeatPreview(index - 1);
                      }
                      if (event.key === "Home") {
                        event.preventDefault();
                        moveRepeatPreview(0);
                      }
                      if (event.key === "End") {
                        event.preventDefault();
                        moveRepeatPreview(repeatTypeOptions.length - 1);
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        commitRepeatType(option.value);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        closeRepeatTypeMenu({ focusTrigger: true });
                      }
                    }}
                    className={`grid w-full items-center rounded-lg px-3 py-1.5 text-left text-sm outline-none transition ${
                      summaryBelow
                        ? "min-h-11 grid-cols-[minmax(0,1fr)_1.25rem] gap-2"
                        : "min-h-8 grid-cols-[max-content_minmax(0,1fr)_1.25rem] gap-3"
                    } ${
                      selected
                        ? "bg-white/10 text-white"
                        : previewed
                          ? "bg-white/10 text-white"
                          : "text-zinc-200 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white"
                    }`}
                  >
                    {summaryBelow ? (
                      <span className="min-w-0">
                        <span className="block truncate font-medium">
                          {menuParts.label}
                        </span>
                        {menuParts.summary ? (
                          <span className="mt-0.5 block truncate text-xs font-semibold text-zinc-500">
                            {menuParts.summary}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <>
                        <span className="whitespace-nowrap font-medium">
                          {menuParts.label}
                        </span>
                        <span className="min-w-0 truncate text-right text-xs font-semibold text-zinc-500">
                          {menuParts.summary ?? ""}
                        </span>
                      </>
                    )}
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                        selected ? "text-violet-400" : "text-transparent"
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>,
    );
  };

  const handleAllDayChange = (nextAllDay: boolean) => {
    setAllDay(nextAllDay);
    setPreviewStartLocal(null);
    setPreviewEndLocal(null);
    setForm((prev) => ({
      ...prev,
      all_day: nextAllDay,
      end_local: nextAllDay
        ? localInputWithDate(
            prev.end_local || prev.start_local,
            dateFromLocalInput(prev.start_local),
            timeFromLocalInput(prev.end_local) ||
              timeFromLocalInput(prev.start_local) ||
              "10:00",
          )
        : prev.end_local,
    }));
  };

  const syncRepeatStartDate = (nextDateKey: string) => {
    const next = new Date(`${nextDateKey}T00:00:00`);
    if (Number.isNaN(next.getTime())) return;

    setRepeatStartDate(nextDateKey);
    if (repeatUntilDate && repeatUntilDate < nextDateKey) {
      setRepeatUntilDate(nextDateKey);
      setRepeatUntilCalendarMonth(getCalendarViewMonth(nextDateKey));
      if (repeatEndType === "until") {
        syncCustomRepeatEnd("until", nextDateKey, null);
      }
    }
  };

  const handleStartDateChange = (nextDateKey: string) => {
    const nextStartLocal = localInputWithDate(
      form.start_local,
      nextDateKey,
      "09:00",
    );

    if (!allDay) {
      updateStartLocal(nextStartLocal);
      syncRepeatStartDate(nextDateKey);
      return;
    }

    if (nextDateKey) {
      setRepeatStartDate(nextDateKey);
      if (mode === "create" && selectedDates.length <= 1) {
        setSelectedDates([nextDateKey]);
      }
    }
    syncRepeatStartDate(nextDateKey);

    setPreviewStartLocal(null);
    setPreviewEndLocal(null);
    setForm((prev) => {
      return {
        ...prev,
        start_local: nextStartLocal,
        end_local: localInputWithDate(
          prev.end_local || prev.start_local,
          nextDateKey,
          timeFromLocalInput(prev.end_local) ||
            timeFromLocalInput(prev.start_local) ||
            "10:00",
        ),
      };
    });
  };

  const renderAllDayControl = (className: string) => (
    <label className={className}>
      <input
        type="checkbox"
        checked={allDay}
        onChange={(event) => handleAllDayChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`relative inline-flex h-3.5 w-7 shrink-0 items-center rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-violet-200 ${
          allDay
            ? "border-violet-500 bg-violet-500"
            : "border-slate-300 bg-slate-100"
        }`}
      >
        <span
          className={`absolute h-2.5 w-2.5 rounded-full bg-white shadow-sm transition ${
            allDay ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
      종일
    </label>
  );

  const handleRepeatEnabledChange = (nextEnabled: boolean) => {
    setRepeatEnabled(nextEnabled);
    setIncludeHolidayRepeats(true);
    setRepeatTypeOpen(false);
    setRepeatEndOpen(false);
    setCustomRepeatOpen(false);
    setSelectedDatesOpen(false);
    setPreviewRepeatOption(null);

    if (nextEnabled) {
      if (selectedRepeatOption === "none") {
        setSelectedRepeatOption("weekly");
      }
      return;
    }

    setSelectedRepeatOption("none");
    setSelectedDates([form.start_local.slice(0, 10)]);
    setRepeatEndType("never");
    setRepeatUntilDate(null);
    setRepeatCount(null);
  };

  const renderRepeatEnabledControl = (className: string) => (
    <label className={className}>
      <input
        type="checkbox"
        checked={repeatEnabled}
        onChange={(event) => handleRepeatEnabledChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`relative inline-flex h-3.5 w-7 shrink-0 items-center rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-violet-200 ${
          repeatEnabled
            ? "border-violet-500 bg-violet-500"
            : "border-slate-300 bg-slate-100"
        }`}
      >
        <span
          className={`absolute h-2.5 w-2.5 rounded-full bg-white shadow-sm transition ${
            repeatEnabled ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
      반복
    </label>
  );

  const chooseRepeatEndType = (nextEndType: RepeatEndType) => {
    setRepeatEndType(nextEndType);

    if (nextEndType === "never") {
      setRepeatUntilDate(null);
      setRepeatCount(null);
      syncCustomRepeatEnd("never", null, null);
      closeRepeatEndMenu({ focusTrigger: true });
      return;
    }

    if (nextEndType === "until") {
      const nextDate =
        repeatUntilDate && repeatUntilDate >= repeatStartDate
          ? repeatUntilDate
          : repeatStartDate;
      setRepeatCount(null);
      setRepeatUntilDate(nextDate);
      setRepeatUntilCalendarMonth(getCalendarViewMonth(nextDate));
      syncCustomRepeatEnd("until", nextDate, null);
      window.requestAnimationFrame(() => {
        repeatUntilDateButtonRef.current?.focus();
      });
      return;
    }

    const nextCount = repeatCount ?? 10;
    setRepeatUntilDate(null);
    setRepeatCount(nextCount);
    syncCustomRepeatEnd("count", null, nextCount);
    window.requestAnimationFrame(() => repeatCountInputRef.current?.focus());
  };

  const selectRepeatUntilDate = (dateKey: string) => {
    if (dateKey < repeatStartDate) return;

    setRepeatEndType("until");
    setRepeatCount(null);
    setRepeatUntilDate(dateKey);
    setRepeatUntilCalendarMonth(getCalendarViewMonth(dateKey));
    syncCustomRepeatEnd("until", dateKey, null);
  };

  const moveRepeatUntilCalendarMonth = (offset: number) => {
    setRepeatUntilCalendarMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  };

  const moveRepeatEndOption = (nextIndex: number) => {
    const boundedIndex =
      (nextIndex + repeatEndOptions.length) % repeatEndOptions.length;
    setActiveRepeatEndOptionIndex(boundedIndex);
    window.requestAnimationFrame(() => {
      repeatEndOptionRefs.current[boundedIndex]?.focus();
    });
  };

  const renderRepeatEndControl = (className: string) => (
    <div ref={repeatEndDropdownRef} className="relative flex w-full min-w-0">
      <button
        ref={repeatEndTriggerRef}
        type="button"
        onClick={() => {
          setRepeatTypeOpen(false);
          setCustomRepeatOpen(false);
          setSelectedDatesOpen(false);
          setRepeatEndOpen((open) => !open);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" ||
            event.key === " " ||
            event.key === "ArrowDown" ||
            event.key === "ArrowUp"
          ) {
            event.preventDefault();
            setRepeatTypeOpen(false);
            setCustomRepeatOpen(false);
            setSelectedDatesOpen(false);
            setRepeatEndOpen(true);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            closeRepeatEndMenu({ focusTrigger: true });
          }
        }}
        className={className}
        aria-haspopup="dialog"
        aria-expanded={repeatEndOpen}
        aria-controls="repeat-end-menu"
        aria-label={`반복 종료: ${repeatEndSummary}`}
      >
        <span className="min-w-0 flex-1 truncate text-left">
          {repeatEndSummary}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition ${
            repeatEndOpen ? "rotate-180" : ""
          }`}
        />
      </button>
    </div>
  );

  const renderRepeatEndPopover = () => {
    if (!repeatEndOpen) return null;

    const repeatUntilDateKey = repeatUntilDate ?? repeatStartDate;
    const repeatUntilTodayKey = toDateKey(new Date());
    const canResetRepeatUntilCalendarMonth =
      toDateKey(repeatUntilCalendarMonth) !==
      toDateKey(getCalendarViewMonth(repeatUntilDateKey));

    return renderFloatingPortal(
      <div
        id="repeat-end-menu"
        ref={repeatEndPopupRef}
        role="dialog"
        aria-label="반복 종료"
        style={repeatEndPopupStyle}
        className="fixed z-[120] max-h-[inherit] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 text-zinc-100 shadow-2xl shadow-zinc-950/30 outline-none"
      >
        <div role="menu" className="space-y-0.5">
          {repeatEndOptions.map(({ value, label }, index) => {
            const selected = repeatEndType === value;
            const active = activeRepeatEndOptionIndex === index;
            return (
              <button
                key={value}
                ref={(node) => {
                  repeatEndOptionRefs.current[index] = node;
                }}
                type="button"
                role="menuitem"
                aria-selected={selected}
                onClick={() => chooseRepeatEndType(value)}
                onFocus={() => setActiveRepeatEndOptionIndex(index)}
                onMouseEnter={() => setActiveRepeatEndOptionIndex(index)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveRepeatEndOption(index + 1);
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveRepeatEndOption(index - 1);
                  }
                  if (event.key === "Home") {
                    event.preventDefault();
                    moveRepeatEndOption(0);
                  }
                  if (event.key === "End") {
                    event.preventDefault();
                    moveRepeatEndOption(repeatEndOptions.length - 1);
                  }
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    chooseRepeatEndType(value);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeRepeatEndMenu({ focusTrigger: true });
                  }
                }}
                className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition ${
                  selected
                    ? "bg-white/10 text-white"
                    : active
                      ? "bg-white/10 text-white"
                      : "text-zinc-200 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white"
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                    selected ? "text-violet-400" : "text-transparent"
                  }`}
                >
                  <Check className="h-4 w-4" />
                </span>
              </button>
            );
          })}
        </div>

        {repeatEndType === "until" ? (
          <div className="mt-1 border-t border-zinc-800 px-2 pt-2">
            <div className="mb-1 text-xs font-semibold text-zinc-400">
              종료 날짜
            </div>
            <button
              ref={repeatUntilDateButtonRef}
              type="button"
              onClick={() =>
                setRepeatUntilCalendarMonth(
                  getCalendarViewMonth(repeatUntilDateKey),
                )
              }
              className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-left text-sm font-medium text-zinc-100 outline-none transition hover:border-zinc-600 hover:bg-zinc-800 focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
              aria-label="반복 종료 날짜"
            >
              <span>{repeatUntilDateKey}</span>
              <CalendarDays className="h-4 w-4 text-zinc-400" />
            </button>
            <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-slate-100">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">
                  {formatMonthTitle(repeatUntilCalendarMonth)}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      setRepeatUntilCalendarMonth(
                        getCalendarViewMonth(repeatUntilDateKey),
                      )
                    }
                    className={`h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-neutral-800 hover:text-white ${
                      canResetRepeatUntilCalendarMonth
                        ? "inline-flex"
                        : "hidden"
                    }`}
                    aria-label="선택한 날짜 월로 이동"
                    title="선택한 날짜 월로 이동"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRepeatUntilCalendarMonth(-1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-neutral-800 hover:text-white"
                    aria-label="이전 달"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRepeatUntilCalendarMonth(1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-neutral-800 hover:text-white"
                    aria-label="다음 달"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-500">
                {weekdayHeaders.map(({ day, label }) => (
                  <span key={day}>{label}</span>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {buildMonthCells(repeatUntilCalendarMonth, weekStart).map(
                  (date, index) => {
                    if (!date) {
                      return (
                        <div
                          key={`repeat-until-blank-${index}`}
                          className="aspect-square"
                        />
                      );
                    }

                    const dateKey = toDateKey(date);
                    const selected = dateKey === repeatUntilDateKey;
                    const today = dateKey === repeatUntilTodayKey;
                    const disabled = dateKey < repeatStartDate;

                    return (
                      <button
                        key={dateKey}
                        type="button"
                        disabled={disabled}
                        aria-selected={selected}
                        onClick={() => selectRepeatUntilDate(dateKey)}
                        className={`aspect-square rounded-md text-sm font-semibold outline-none transition ${
                          selected
                            ? "bg-violet-500 text-white shadow-sm"
                            : disabled
                              ? "cursor-not-allowed text-zinc-600"
                              : today
                                ? "text-violet-300 ring-1 ring-violet-600/60 hover:bg-neutral-800"
                                : "text-slate-200 hover:bg-neutral-800 hover:text-white"
                        }`}
                      >
                        {date.getDate()}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
            <div className="mt-1 text-xs font-medium text-zinc-400">
              {formatRepeatEndSummary(
                "until",
                repeatUntilDate ?? repeatStartDate,
                null,
              )}
            </div>
          </div>
        ) : null}

        {repeatEndType === "count" ? (
          <div className="mt-1 border-t border-zinc-800 px-2 pt-2">
            <div className="mb-1 text-xs font-semibold text-zinc-400">
              반복 횟수
            </div>
            <input
              ref={repeatCountInputRef}
              type="number"
              min={1}
              max={100}
              value={repeatCount ?? 10}
              onChange={(event) => {
                const nextCount = Math.max(1, Number(event.target.value) || 1);
                setRepeatCount(nextCount);
                syncCustomRepeatEnd("count", null, nextCount);
              }}
              className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 outline-none transition [color-scheme:dark] focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20"
            />
            <div className="mt-1 text-xs font-medium text-zinc-400">
              {formatRepeatEndSummary("count", null, repeatCount ?? 10)}
            </div>
          </div>
        ) : null}
      </div>,
    );
  };

  const updateDraftCustomRepeat = (patch: Partial<CustomRepeat>) => {
    setDraftCustomRepeat((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  const toggleDraftCustomWeekday = (weekday: CustomRepeatWeekday) => {
    setDraftCustomRepeat((prev) => {
      const nextWeekdays = prev.weekdays.includes(weekday)
        ? prev.weekdays.filter((item) => item !== weekday)
        : [...prev.weekdays, weekday].sort(
            (a, b) => weekdayDayByCode[a] - weekdayDayByCode[b],
          );

      return {
        ...prev,
        weekdays: nextWeekdays,
      };
    });
  };

  const cancelCustomRepeat = () => {
    setCustomRepeatOpen(false);
    setDraftCustomRepeat(cloneCustomRepeat(customRepeat));
    setDraftIncludeHolidayRepeats(includeHolidayRepeats);
    repeatTypeTriggerRef.current?.focus();
  };

  const completeCustomRepeat = () => {
    const safeInterval = Math.max(1, Number(draftCustomRepeat.interval) || 1);
    const fallbackWeekday =
      weekdayCodeByDay[new Date(`${repeatStartDate}T00:00:00`).getDay()] ??
      weekdayCodeByDay[new Date().getDay()];
    const normalized: CustomRepeat = {
      ...draftCustomRepeat,
      interval: safeInterval,
      weekdays:
        draftCustomRepeat.unit === "week" &&
        draftCustomRepeat.weekdays.length === 0
          ? [fallbackWeekday]
          : [...draftCustomRepeat.weekdays],
      endDate:
        draftCustomRepeat.endType === "until"
          ? (draftCustomRepeat.endDate ?? repeatStartDate)
          : null,
      count:
        draftCustomRepeat.endType === "count"
          ? Math.max(1, Number(draftCustomRepeat.count) || 4)
          : null,
    };

    setCustomRepeat(normalized);
    setIncludeHolidayRepeats(draftIncludeHolidayRepeats);
    setSelectedRepeatOption("custom");
    setRepeatEnabled(true);
    setRepeatEndType(normalized.endType);
    setRepeatUntilDate(normalized.endDate);
    setRepeatCount(normalized.count);
    setCustomRepeatOpen(false);
    repeatTypeTriggerRef.current?.focus();
  };

  const toggleDraftRepeatDate = (dateKey: string) => {
    const selected = draftRepeatDates.includes(dateKey);
    const next =
      selected && draftRepeatDates.length > 1
        ? draftRepeatDates.filter((item) => item !== dateKey)
        : selected
          ? draftRepeatDates
          : [...draftRepeatDates, dateKey];
    const normalizedDates = normalizeDateKeys(next);

    setDraftRepeatDates(normalizedDates);
    setCustomSelectedDates(normalizedDates);
    if (normalizedDates.length > 0) {
      setSelectedRepeatOption("selected-dates");
      setRepeatEnabled(true);
    }
    setSelectedDatesError(null);
  };

  const moveSelectedDatesMonth = (offset: number) => {
    setSelectedDatesCalendarMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  };

  const moveActiveSelectedDate = (offset: number) => {
    const base = new Date(`${activeSelectedDateKey}T00:00:00`);
    const next = Number.isNaN(base.getTime()) ? new Date() : base;
    next.setDate(next.getDate() + offset);
    setActiveSelectedDateKey(toDateKey(next));
  };

  const renderCustomRepeatPopover = () => {
    if (!customRepeatOpen) return null;

    return renderFloatingPortal(
      <div
        ref={customRepeatPopupRef}
        role="dialog"
        aria-label="사용자 지정 반복"
        style={customRepeatPopupStyle}
        className="fixed z-[120] max-h-[min(560px,calc(100vh-20px))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl shadow-slate-200/80 outline-none"
      >
        <h3 className="text-base font-semibold text-slate-950">반복</h3>

        <div className="mt-4 flex items-center gap-2">
          <input
            id="custom-repeat-interval"
            type="number"
            min={1}
            value={draftCustomRepeat.interval}
            onChange={(event) =>
              updateDraftCustomRepeat({
                interval: Math.max(1, Number(event.target.value) || 1),
              })
            }
            className="h-9 w-14 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            aria-label="반복 간격"
          />
          <div className="relative">
            <select
              value={draftCustomRepeat.unit}
              onChange={(event) =>
                updateDraftCustomRepeat({
                  unit: event.target.value as RepeatFrequencyUnit,
                })
              }
              className="h-9 w-20 appearance-none rounded-md border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              aria-label="반복 단위"
            >
              <option value="day">일</option>
              <option value="week">주</option>
              <option value="month">개월</option>
              <option value="year">년</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-300" />
          </div>
          <span className="text-sm font-medium text-slate-600">마다</span>
        </div>

        {draftCustomRepeat.unit === "week" ? (
          <div className="mt-4 flex items-center gap-2">
            {customRepeatWeekdays.map((weekday) => {
              const selected = draftCustomRepeat.weekdays.includes(
                weekday.value,
              );
              return (
                <button
                  key={weekday.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleDraftCustomWeekday(weekday.value)}
                  className={`h-7 w-7 rounded-full border text-xs font-semibold transition ${
                    selected
                      ? "border-violet-500 bg-violet-500 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                  }`}
                >
                  {weekday.label}
                </button>
              );
            })}
            <span className="text-sm font-medium text-slate-600">에</span>
          </div>
        ) : null}

        <div className="mt-5 text-sm font-medium text-slate-700">종료</div>
        <div className="mt-3 space-y-3">
          <label className="flex h-7 items-center gap-3 text-sm font-medium text-slate-700">
            <input
              type="radio"
              name="custom-repeat-end"
              checked={draftCustomRepeat.endType === "never"}
              onChange={() =>
                updateDraftCustomRepeat({
                  endType: "never",
                  endDate: null,
                  count: null,
                })
              }
              className="h-4 w-4 accent-violet-500"
            />
            종료일 없음
          </label>

          <div className="flex h-9 items-center gap-3">
            <input
              type="radio"
              name="custom-repeat-end"
              checked={draftCustomRepeat.endType === "until"}
              onChange={() =>
                updateDraftCustomRepeat({
                  endType: "until",
                  endDate: draftCustomRepeat.endDate ?? repeatStartDate,
                  count: null,
                })
              }
              className="h-4 w-4 accent-violet-500"
              aria-label="날짜에 종료"
            />
            <CompactDateInput
              value={draftCustomRepeat.endDate ?? repeatStartDate}
              minDate={repeatStartDate}
              calendarBoundaryRef={customRepeatPopupRef}
              ariaLabel="반복 종료 날짜"
              className="w-32"
              onOpen={() =>
                updateDraftCustomRepeat({
                  endType: "until",
                  endDate: draftCustomRepeat.endDate ?? repeatStartDate,
                  count: null,
                })
              }
              onChange={(dateKey) =>
                updateDraftCustomRepeat({
                  endType: "until",
                  endDate: dateKey,
                  count: null,
                })
              }
            />
            <span className="text-sm font-medium text-slate-600">
              종료일 지정
            </span>
          </div>

          <label className="flex h-9 items-center gap-3 text-sm font-medium">
            <input
              type="radio"
              name="custom-repeat-end"
              checked={draftCustomRepeat.endType === "count"}
              onChange={() =>
                updateDraftCustomRepeat({
                  endType: "count",
                  endDate: null,
                  count: draftCustomRepeat.count ?? 4,
                })
              }
              className="h-4 w-4 accent-violet-500"
            />
            <input
              type="number"
              min={1}
              value={draftCustomRepeat.count ?? 4}
              disabled={draftCustomRepeat.endType !== "count"}
              onChange={(event) =>
                updateDraftCustomRepeat({
                  endType: "count",
                  endDate: null,
                  count: Math.max(1, Number(event.target.value) || 1),
                })
              }
              className="h-9 w-16 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
              aria-label="반복 횟수"
            />
            <span
              className={`text-sm ${
                draftCustomRepeat.endType === "count"
                  ? "text-slate-700"
                  : "text-slate-300"
              }`}
            >
              반복 횟수 지정
            </span>
          </label>
        </div>

        {showDraftCustomRepeatHolidayControl ? (
          <div className="mt-5 flex items-start justify-between gap-4 border-t border-slate-100 pt-4">
            <div className="text-sm font-medium text-slate-700">
              공휴일에도 반복
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draftIncludeHolidayRepeats}
              onClick={() =>
                setDraftIncludeHolidayRepeats((current) => !current)
              }
              className="group flex min-w-[7rem] flex-col items-end rounded-md text-right outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                {draftIncludeHolidayRepeats ? "켬" : "끔"}
                <span
                  className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
                    draftIncludeHolidayRepeats
                      ? "bg-violet-500"
                      : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${
                      draftIncludeHolidayRepeats
                        ? "translate-x-4"
                        : "translate-x-0"
                    }`}
                  />
                </span>
              </span>
              <span className="mt-1 text-xs font-medium text-slate-500">
                공휴일 {draftCustomRepeatHolidayCount}개{" "}
                {draftIncludeHolidayRepeats ? "포함" : "제외"}
              </span>
            </button>
          </div>
        ) : null}

        <div className="mt-7 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancelCustomRepeat}
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={completeCustomRepeat}
            className="h-9 rounded-md bg-violet-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-600"
          >
            완료
          </button>
        </div>
      </div>,
    );
  };

  const renderSelectedDatesPopover = () => {
    if (!selectedDatesOpen) return null;

    const draftDateSet = new Set(draftRepeatDates);
    const todayKey = toDateKey(new Date());

    return renderFloatingPortal(
      <div
        ref={selectedDatesPopupRef}
        role="dialog"
        aria-label="날짜 직접 선택"
        style={selectedDatesPopupStyle}
        className="fixed z-[120] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-slate-100 shadow-2xl outline-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">
            {formatMonthTitle(selectedDatesCalendarMonth)}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => moveSelectedDatesMonth(-1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-neutral-800 hover:text-white"
              aria-label="이전 달"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => moveSelectedDatesMonth(1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-neutral-800 hover:text-white"
              aria-label="다음 달"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div role="grid" aria-label="반복 날짜 선택 달력">
          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-500">
            {weekdayHeaders.map(({ day, label }) => (
              <span key={day}>{label}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {buildMonthCells(selectedDatesCalendarMonth, weekStart).map(
              (date, index) => {
                if (!date) {
                  return (
                    <div key={`blank-${index}`} className="aspect-square" />
                  );
                }

                const dateKey = toDateKey(date);
                const selected = draftDateSet.has(dateKey);
                const today = dateKey === todayKey;
                const active = dateKey === activeSelectedDateKey;

                return (
                  <button
                    key={dateKey}
                    ref={(node) => {
                      selectedDateButtonRefs.current[dateKey] = node;
                    }}
                    type="button"
                    role="gridcell"
                    aria-selected={selected}
                    tabIndex={active ? 0 : -1}
                    onFocus={() => setActiveSelectedDateKey(dateKey)}
                    onClick={() => toggleDraftRepeatDate(dateKey)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft") {
                        event.preventDefault();
                        moveActiveSelectedDate(-1);
                      }
                      if (event.key === "ArrowRight") {
                        event.preventDefault();
                        moveActiveSelectedDate(1);
                      }
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveActiveSelectedDate(-7);
                      }
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveActiveSelectedDate(7);
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleDraftRepeatDate(dateKey);
                      }
                    }}
                    className={`aspect-square rounded-md text-sm font-semibold outline-none transition ${
                      selected
                        ? "bg-violet-500 text-white shadow-sm"
                        : today
                          ? "text-violet-300 ring-1 ring-violet-600/60 hover:bg-neutral-800"
                          : "text-slate-200 hover:bg-neutral-800 hover:text-white"
                    } ${active && !selected ? "ring-2 ring-violet-500/40" : ""}`}
                  >
                    {date.getDate()}
                  </button>
                );
              },
            )}
          </div>
        </div>

        {selectedDatesError ? (
          <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-100">
            {selectedDatesError}
          </p>
        ) : null}
      </div>,
    );
  };

  const normalizeAttendeeEmail = (value: string) => value.trim().toLowerCase();

  const isValidAttendeeEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

  const personalAttendeeKey = (attendee: PersonalScheduleAttendee) =>
    `${attendee.kind}:${normalizeAttendeeEmail(attendee.email)}`;

  const personalAttendeeLabel = (attendee: PersonalScheduleAttendee) =>
    attendee.name || attendee.email;

  const filteredPersonalAttendeeSuggestions =
    personalAttendeeSuggestions.filter((attendee) => {
      const query = personalAttendeeQuery.trim().toLowerCase();
      const selected = personalAttendees.some(
        (item) =>
          normalizeAttendeeEmail(item.email) ===
          normalizeAttendeeEmail(attendee.email),
      );

      if (selected) return false;
      if (!query) return true;

      return (
        attendee.name?.toLowerCase().includes(query) ||
        attendee.email.toLowerCase().includes(query)
      );
    });
  const shareFriends = useMemo(
    () =>
      (friendsQuery.data ?? []).filter(
        (item) => item.status === "accepted" && item.friend,
      ),
    [friendsQuery.data],
  );
  const shareSearch = shareSearchQuery.trim().toLowerCase();
  const filteredShareFriends = useMemo(() => {
    if (!shareSearch) return shareFriends;

    return shareFriends.filter((item) => {
      const name = item.friend.name.toLowerCase();
      const publicUid = item.friend.public_uid.toLowerCase();
      return name.includes(shareSearch) || publicUid.includes(shareSearch);
    });
  }, [shareFriends, shareSearch]);
  const filteredFriendPresets = useMemo(() => {
    const presets = friendPresetsQuery.data ?? [];
    if (!shareSearch) return presets;

    return presets.filter((preset) =>
      preset.name.toLowerCase().includes(shareSearch),
    );
  }, [friendPresetsQuery.data, shareSearch]);
  const selectedFriendPreset = useMemo(
    () =>
      (friendPresetsQuery.data ?? []).find(
        (preset) => preset.friend_preset_id === selectedFriendPresetId,
      ) ?? null,
    [friendPresetsQuery.data, selectedFriendPresetId],
  );
  const shareSelectionReady =
    form.visibility === "private" ||
    shareTargetKind === "link" ||
    shareTargetKind === "all_friends" ||
    (shareTargetKind === "preset" && selectedFriendPresetId !== null);
  const shareTargetLabel =
    form.visibility === "private"
      ? "비공개"
      : shareTargetKind === "link"
        ? "링크 공유"
        : shareTargetKind === "preset"
          ? (selectedFriendPreset?.name ?? "그룹 프리셋")
          : "전체 친구";
  const shareTargetHint =
    form.visibility === "private"
      ? "나만 볼 수 있습니다."
      : shareTargetKind === "link"
        ? "링크로 초대합니다."
        : shareTargetKind === "preset"
          ? `${selectedFriendPreset?.members.length ?? 0}명에게 공유합니다.`
          : `${shareFriends.length}명에게 공유합니다.`;

  const addPersonalAttendee = (attendee: PersonalScheduleAttendee) => {
    setError(null);
    setPersonalAttendees((prev) => {
      const attendeeEmail = normalizeAttendeeEmail(attendee.email);
      if (
        prev.some(
          (item) => normalizeAttendeeEmail(item.email) === attendeeEmail,
        )
      ) {
        return prev;
      }

      return [...prev, attendee];
    });
    setPersonalAttendeeQuery("");
  };

  const addPersonalEmailInvite = () => {
    const email = personalAttendeeQuery.trim();
    if (!isValidAttendeeEmail(email)) {
      setError("초대할 이메일을 입력해 주세요.");
      return;
    }

    addPersonalAttendee({
      id: `email:${normalizeAttendeeEmail(email)}`,
      kind: "email",
      email,
      status: "pending_invite",
    });
    setPersonalAttendeeOpen(false);
  };

  const removePersonalAttendee = (attendee: PersonalScheduleAttendee) => {
    const attendeeEmail = normalizeAttendeeEmail(attendee.email);
    setPersonalAttendees((prev) =>
      prev.filter(
        (item) => normalizeAttendeeEmail(item.email) !== attendeeEmail,
      ),
    );
  };

  const setPrivateVisibility = () => {
    setForm((prev) => ({ ...prev, visibility: "private" }));
    setShareTargetOpen(false);
  };

  const openShareTargetPicker = () => {
    if (shareTargetOpen) {
      setShareTargetOpen(false);
      return;
    }

    if (form.visibility === "private") {
      setForm((prev) => ({ ...prev, visibility: "link" }));
      setShareTargetKind("link");
    }
    setShareTargetOpen(true);
  };

  const selectShareTarget = (
    kind: ScheduleCreateShareTargetKind,
    presetId?: number,
  ) => {
    setShareTargetKind(kind);
    setForm((prev) => ({
      ...prev,
      visibility: kind === "link" ? "link" : "friends",
    }));
    if (kind === "preset") {
      setSelectedFriendPresetId(presetId ?? null);
    }
  };

  const buildShareOption = (): ScheduleCreateShareOption | undefined | null => {
    if (
      mode !== "create" ||
      isCompanyScheduleDraft ||
      form.visibility === "private"
    ) {
      return undefined;
    }

    if (previewForms.length !== 1) {
      setError("공유 일정은 한 번에 하나씩 추가해 주세요.");
      return null;
    }

    if (shareTargetKind === "link") {
      return { kind: "link", permission: sharePermission };
    }

    if (shareTargetKind === "all_friends") {
      return {
        kind: "friends",
        scope: "all_friends",
        permission: sharePermission,
      };
    }

    if (selectedFriendPresetId === null) {
      setShareTargetTab("presets");
      setShareTargetOpen(true);
      setError("공유할 그룹 프리셋을 선택해 주세요.");
      return null;
    }

    return {
      kind: "friends",
      scope: "preset",
      friend_preset_id: selectedFriendPresetId,
      permission: sharePermission,
    };
  };

  const companyTargetKey = (target: CompanyScheduleCreateTarget) => {
    if (target.target_type === "company") return "company";
    if (target.target_type === "department") {
      return `department:${target.department_id}`;
    }

    return `member:${target.company_member_id}`;
  };

  const getCompanyTargetLabel = (target: CompanyScheduleCreateTarget) => {
    if (target.target_type === "company") {
      return companyName ?? "회사 전체";
    }

    if (target.target_type === "department") {
      const department = (departmentsQuery.data ?? []).find(
        (item) => item.department_id === target.department_id,
      );
      return department
        ? renderDepartmentLabel(department)
        : `부서 ${target.department_id}`;
    }

    return `팀원 ${target.company_member_id}`;
  };

  const addCompanyTargetValue = (target: CompanyScheduleCreateTarget | null) => {
    if (!target) {
      setError("추가할 부서를 선택해 주세요.");
      return;
    }

    setError(null);
    setCompanyTargets((prev) => {
      if (target.target_type === "company") return [target];

      const next = prev.filter((item) => item.target_type !== "company");
      const nextKey = companyTargetKey(target);
      if (next.some((item) => companyTargetKey(item) === nextKey)) {
        return next;
      }

      return [...next, target];
    });
  };

  const addCompanyDepartmentTarget = (departmentId: number) => {
    addCompanyTargetValue({
      target_type: "department",
      department_id: departmentId,
    });
    setCompanyDepartmentPickerOpen(false);
  };

  const removeCompanyTarget = (target: CompanyScheduleCreateTarget) => {
    const targetKey = companyTargetKey(target);
    setCompanyTargets((prev) =>
      prev.filter((item) => companyTargetKey(item) !== targetKey),
    );
  };

  const renderDepartmentLabel = (department: CompanyAdminDepartment) =>
    `${department.name}${department.code ? ` (${department.code})` : ""}`;

  const getDepartmentAvatarLabel = (label: string) =>
    Array.from(label.trim())[0] ?? "부";

  const ownDepartmentLabel = companyDepartmentLabel?.trim() || "내 소속 부서";
  const normalizedOwnCompanyDepartmentId =
    typeof ownCompanyDepartmentId === "number" &&
    Number.isFinite(ownCompanyDepartmentId) &&
    ownCompanyDepartmentId > 0
      ? ownCompanyDepartmentId
      : null;
  const companyDepartmentTargets = companyTargets.filter(
    (
      target,
    ): target is Extract<
      CompanyScheduleCreateTarget,
      { target_type: "department" }
    > => target.target_type === "department",
  );
  const selectedCompanyDepartmentIds = new Set(
    companyDepartmentTargets.map((target) => target.department_id),
  );
  const availableCompanyDepartments = (departmentsQuery.data ?? []).filter(
    (department) =>
      department.department_id !== normalizedOwnCompanyDepartmentId &&
      !selectedCompanyDepartmentIds.has(department.department_id),
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (isCompanyScheduleDraft) {
      const validationError = validateForm(form);
      if (validationError) {
        setError(validationError);
        return;
      }
      if (companyCollaborationEnabled && companyTargets.length === 0) {
        setError("협업 요청할 부서를 하나 이상 추가해 주세요.");
        return;
      }

      try {
        await onCompanySubmit({
          title: normalizeScheduleTitle(form.title),
          description: form.description.trim() || undefined,
          schedule_type: form.schedule_type,
          start_datetime: fromLocalInputValue(form.start_local),
          end_datetime: form.end_local
            ? fromLocalInputValue(form.end_local)
            : undefined,
          all_day: shouldUseAllDayLaneForForm(form),
          location: form.location.trim() || undefined,
          status: "active",
          targets: companyCollaborationEnabled ? companyTargets : [],
        });
      } catch (err) {
        setError(getErrorMessage(err, "회사 일정 추가에 실패했습니다."));
      }
      return;
    }

    if (mode === "create" && !isRepeatMode && targetDateKeys.length === 0) {
      setError("추가할 날짜를 하나 이상 선택해 주세요.");
      return;
    }

    if ((isRepeatMode || isSelectedDatesMode) && targetDateKeys.length === 0) {
      setError(
        isSelectedDatesMode
          ? "날짜를 하나 이상 선택해 주세요."
          : "반복 조건에 맞는 날짜가 없습니다.",
      );
      return;
    }

    if (
      (mode === "create" || isRepeatMode) &&
      !isSelectedDatesMode &&
      targetDateKeys.length > 100
    ) {
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
      const share = buildShareOption();
      if (share === null) return;

      await onSubmit(previewForms, { intent: "manual", share });
      if (mode === "edit") {
        lastAutoSaveSignatureRef.current = scheduleFormSignature(form);
        setAutoSaveState("saved");
      }
    } catch (err) {
      if (mode === "edit") {
        setAutoSaveState("error");
      }
      setError(getErrorMessage(err, "저장에 실패했습니다."));
    }
  };

  const handleApplyRepeat = async () => {
    setError(null);

    if (
      (!isRepeatMode && !isSelectedDatesMode) ||
      targetDateKeys.length === 0
    ) {
      setError(
        isSelectedDatesMode
          ? "날짜를 하나 이상 선택해 주세요."
          : "반복 조건에 맞는 날짜가 없습니다.",
      );
      return;
    }
    if (!isSelectedDatesMode && targetDateKeys.length > 100) {
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

  const handleCompletionToggle = async () => {
    if (!schedule || !onCompletionChange) return;

    setError(null);
    try {
      await onCompletionChange(!schedule.is_completed);
    } catch (err) {
      setError(getErrorMessage(err, "일정 상태 변경에 실패했습니다."));
    }
  };

  const updateStartLocal = (
    nextStartLocal: string,
    options: { defaultEndFromStart?: boolean } = {},
  ) => {
    const nextDateKey = dateFromLocalInput(nextStartLocal);
    if (nextDateKey) {
      setRepeatStartDate(nextDateKey);
      if (mode === "create" && selectedDates.length <= 1) {
        setSelectedDates([nextDateKey]);
      }
    }

    setPreviewStartLocal(null);
    setPreviewEndLocal(null);
    setForm((prev) => {
      const nextStart = new Date(nextStartLocal);
      const defaultEndLocal = Number.isNaN(nextStart.getTime())
        ? prev.end_local
        : localInputFromDate(new Date(nextStart.getTime() + 30 * 60 * 1000));

      return {
        ...prev,
        start_local: nextStartLocal,
        end_local: options.defaultEndFromStart
          ? defaultEndLocal
          : endLocalAfterStartChange(
              nextStartLocal,
              prev.end_local,
              prev.start_local,
            ),
      };
    });
  };

  const updateEndLocal = (nextEndLocal: string) => {
    setPreviewEndLocal(null);
    setForm((prev) => ({
      ...prev,
      end_local: nextEndLocal,
    }));
  };

  const settingsRowButtonClass =
    "flex h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-transparent px-2.5 text-xs font-medium text-slate-900 outline-none transition hover:border-slate-200 hover:bg-white focus-visible:border-violet-300 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-violet-100";
  const settingsRowLabelClass = "px-2 text-xs font-medium text-slate-500";
  const compactFieldGroupClass = "border-b border-slate-200/70 pb-2";
  const compactSelectClass =
    "h-9 rounded-md border-transparent bg-transparent px-2 shadow-none hover:border-slate-200 hover:bg-white hover:shadow-none focus-visible:border-violet-300 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-violet-100 data-[state=open]:border-violet-300 data-[state=open]:bg-white data-[state=open]:ring-2 data-[state=open]:ring-violet-100 disabled:bg-transparent disabled:shadow-none";
  const compactFieldFrameClass =
    "rounded-md border border-transparent bg-transparent px-2 transition hover:border-slate-200 hover:bg-white focus-within:border-violet-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100";
  const compactInnerInputClass =
    "h-9 w-full min-w-0 bg-transparent p-0 text-xs font-medium text-slate-900 outline-none placeholder:text-slate-400";
  const handleScheduleOwnerChange = (value: ScheduleOwnerType) => {
    setScheduleOwner(value);
    setForm((prev) =>
      value === "company" && prev.schedule_type === "personal"
        ? { ...prev, schedule_type: "meeting", visibility: "private" }
        : { ...prev, visibility: value === "company" ? "private" : prev.visibility },
    );
    setCompanyTargets([]);
    setCompanyCollaborationEnabled(false);
    setCompanyDepartmentPickerOpen(false);
    setPersonalAttendees([]);
    setPersonalAttendeeOpen(false);
    setPersonalAttendeeQuery("");
    setShareTargetOpen(false);
    setShareTargetTab("friends");
    setShareTargetKind("link");
    setShareSearchQuery("");
    setSelectedFriendPresetId(null);
  };
  const scheduleOwnerSelect =
    mode === "create" && onCompanySubmit ? (
      <CustomSelect
        ariaLabel="일정 종류"
        triggerLabel={
          scheduleOwnerOptions.find((option) => option.value === scheduleOwner)
            ?.label
        }
        value={scheduleOwner}
        options={scheduleOwnerOptions}
        className="h-9 w-auto rounded-md border-transparent bg-transparent px-2.5 text-sm shadow-none hover:border-slate-200 hover:bg-slate-50 hover:shadow-none focus-visible:border-violet-300 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-violet-100 data-[state=open]:border-violet-300 data-[state=open]:bg-white data-[state=open]:ring-2 data-[state=open]:ring-violet-100 disabled:bg-transparent disabled:shadow-none"
        side="right"
        sideOffset={10}
        floatingBoundary="panel"
        menuTone="dark"
        contentClassName="schedule-basic-options-select-menu z-[160] border-0"
        onChange={handleScheduleOwnerChange}
      />
    ) : null;

  const handleCompanyCollaborationToggle = (checked: boolean) => {
    setCompanyCollaborationEnabled(checked);
    if (!checked) {
      setCompanyTargets([]);
      setCompanyDepartmentPickerOpen(false);
      setError(null);
    }
  };

  const renderCompanyTeamScopeControl = () => {
    const helperText = companyCollaborationEnabled
      ? "협업 부서는 부서장 승인 후 일정에 참여합니다."
      : "협업 요청을 켜면 다른 부서를 승인 요청할 수 있습니다.";

    return (
      <div className={compactFieldGroupClass}>
        <div className="flex items-center justify-between gap-3 px-2">
          <div className="text-sm font-semibold text-slate-700">참여 부서</div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">
              협업 요청
            </span>
            <Switch
              checked={companyCollaborationEnabled}
              onCheckedChange={handleCompanyCollaborationToggle}
              aria-label="협업 요청 사용"
              className="shadow-none"
            />
          </div>
        </div>

        <div className="mt-2 space-y-2">
          <div className="flex min-h-[60px] min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold text-white">
              {getDepartmentAvatarLabel(ownDepartmentLabel)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-slate-800">
                {ownDepartmentLabel}
              </div>
              <div className="truncate text-xs font-medium text-slate-400">
                내 소속 부서 · 자동 포함
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-600">
              주최
            </span>
          </div>

          {companyCollaborationEnabled
            ? companyDepartmentTargets.map((target) => {
                const label = getCompanyTargetLabel(target);
                return (
                  <div
                    key={companyTargetKey(target)}
                    className="flex min-h-[60px] min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-500 text-sm font-bold text-white">
                      {getDepartmentAvatarLabel(label)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">
                        {label}
                      </div>
                      <div className="truncate text-xs font-semibold text-amber-500">
                        승인 대기중
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCompanyTarget(target)}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-100"
                      aria-label={`${label} 제거`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            : null}

          {companyCollaborationEnabled ? (
            <Popover
              open={companyDepartmentPickerOpen}
              onOpenChange={setCompanyDepartmentPickerOpen}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-[60px] w-full min-w-0 items-center gap-3 rounded-lg border border-dashed border-violet-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-violet-500 transition hover:border-violet-300 hover:bg-violet-50/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
                  aria-label="협업 부서 추가"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-500">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className="truncate">협업 부서 추가</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="left"
                sideOffset={8}
                className="z-[170] w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
              >
                <div className="px-1 pb-2">
                  <div className="text-xs font-bold text-slate-700">
                    협업 부서 선택
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-slate-400">
                    승인 요청할 부서를 선택해 주세요.
                  </div>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {departmentsQuery.isLoading ? (
                    <div className="rounded-md bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-400">
                      부서를 불러오는 중입니다.
                    </div>
                  ) : availableCompanyDepartments.length > 0 ? (
                    availableCompanyDepartments.map((department) => {
                      const label = renderDepartmentLabel(department);
                      return (
                        <button
                          key={department.department_id}
                          type="button"
                          onClick={() =>
                            addCompanyDepartmentTarget(department.department_id)
                          }
                          className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                            {getDepartmentAvatarLabel(label)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                            {label}
                          </span>
                          <Plus className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-md bg-slate-50 px-3 py-4 text-center text-xs font-semibold text-slate-400">
                      추가 가능한 부서가 없습니다.
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}

          <div className="flex items-start gap-1.5 px-2 pt-0.5 text-[11px] font-medium text-slate-400">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{helperText}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderPersonalAttendeeControl = () => {
    const canInviteByEmail = isValidAttendeeEmail(personalAttendeeQuery);

    return (
      <div className={compactFieldGroupClass}>
        <div className={settingsRowLabelClass}>참석자</div>
        <Popover
          open={personalAttendeeOpen}
          onOpenChange={setPersonalAttendeeOpen}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`${compactFieldFrameClass} mt-1 flex h-9 w-full min-w-0 items-center gap-2.5 text-left outline-none`}
              aria-label="참석자 선택"
            >
              <UserPlus className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1" aria-hidden="true" />
              <Plus className="h-4 w-4 shrink-0 text-slate-400" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="left"
            sideOffset={8}
            className="z-[170] w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                name="flowra_attendee_search"
                autoComplete="none"
                value={personalAttendeeQuery}
                onChange={(event) =>
                  setPersonalAttendeeQuery(event.target.value)
                }
                placeholder="이름 또는 이메일"
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-8 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              />
            </div>

            <div className="mt-2">
              <div className="px-1.5 text-[11px] font-semibold text-slate-500">
                초대된 친구
              </div>
              <div className="mt-1 max-h-32 overflow-y-auto">
                {filteredPersonalAttendeeSuggestions.length > 0 ? (
                  filteredPersonalAttendeeSuggestions.map((attendee) => (
                    <button
                      key={personalAttendeeKey(attendee)}
                      type="button"
                      onClick={() => addPersonalAttendee(attendee)}
                      className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
                    >
                      <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate">
                        {personalAttendeeLabel(attendee)}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-3 text-xs font-medium text-slate-400">
                    초대된 친구가 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-2 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={addPersonalEmailInvite}
                disabled={!canInviteByEmail}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                <UserPlus className="h-3.5 w-3.5" />새 이메일 초대
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {personalAttendees.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {personalAttendees.map((attendee) => {
              const label = personalAttendeeLabel(attendee);
              return (
                <span
                  key={personalAttendeeKey(attendee)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-violet-100 bg-violet-50 px-2 py-1 text-xs font-semibold text-violet-700"
                >
                  <span className="truncate">{label}</span>
                  <button
                    type="button"
                    onClick={() => removePersonalAttendee(attendee)}
                    className="-mr-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-violet-600 transition hover:bg-violet-100 hover:text-violet-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                    aria-label={`${label} 제거`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const shareAvatarLabel = (name: string) => {
    const normalized = name.trim();
    return normalized ? Array.from(normalized).slice(0, 2).join("") : "친구";
  };

  const renderShareTargetPopoverContent = () => {
    if (!shareTargetOpen) return null;

    return renderFloatingPortal(
      <div
        id="schedule-share-target-popover"
        ref={shareTargetPopupRef}
        style={shareTargetPopupStyle}
        className="fixed z-[180] outline-none"
      >
        <div className="max-h-[inherit] overflow-y-auto rounded-2xl border border-slate-100 bg-white p-0 text-slate-950 shadow-2xl shadow-slate-900/15">
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-950">공유 대상 선택</h3>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">
            {shareTargetHint}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShareTargetOpen(false)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
          aria-label="공유 대상 선택 닫기"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={() => selectShareTarget("link")}
          className={`flex h-11 w-full items-center gap-3 rounded-xl border px-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 ${
            shareTargetKind === "link"
              ? "border-violet-200 bg-violet-50 text-violet-700"
              : "border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white"
          }`}
        >
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-violet-600 shadow-sm">
            <Link2 className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold">링크 공유</span>
            <span className="block truncate text-[11px] font-medium text-slate-400">
              링크를 받은 사람이 참가합니다.
            </span>
          </span>
          <span
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
              shareTargetKind === "link"
                ? "border-violet-500 bg-violet-600 text-white"
                : "border-slate-200 bg-white"
            }`}
            aria-hidden="true"
          >
            {shareTargetKind === "link" ? <Check className="h-3 w-3" /> : null}
          </span>
        </button>
      </div>

      <div className="border-t border-slate-100 px-4 pt-3">
        <div className="flex gap-5 border-b border-slate-100">
          {[
            { value: "friends" as const, label: "친구 선택" },
            { value: "presets" as const, label: "그룹 프리셋" },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setShareTargetTab(tab.value)}
              className={`relative h-8 text-xs font-bold transition focus:outline-none ${
                shareTargetTab === tab.value
                  ? "text-slate-950"
                  : "text-slate-400 hover:text-slate-700"
              }`}
            >
              {tab.label}
              {shareTargetTab === tab.value ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-slate-950" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <input
            type="text"
            name="flowra_share_target_search"
            autoComplete="none"
            value={shareSearchQuery}
            onChange={(event) => setShareSearchQuery(event.target.value)}
            placeholder="이름 검색"
            className="h-10 w-full rounded-lg border border-slate-100 bg-slate-50 px-9 text-xs font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-violet-200 focus:bg-white focus:ring-2 focus:ring-violet-100"
          />
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto px-4 py-3">
        {shareTargetTab === "friends" ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => selectShareTarget("all_friends")}
              className={`flex h-12 w-full items-center gap-3 rounded-xl px-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 ${
                shareTargetKind === "all_friends"
                  ? "bg-violet-50"
                  : "hover:bg-slate-50"
              }`}
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
                <Users className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-950">
                  전체 친구
                </span>
                <span className="block text-[11px] font-semibold text-slate-400">
                  {shareFriends.length}명
                </span>
              </span>
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  shareTargetKind === "all_friends"
                    ? "border-violet-500 bg-violet-600 text-white"
                    : "border-slate-200 bg-white"
                }`}
                aria-hidden="true"
              >
                {shareTargetKind === "all_friends" ? (
                  <Check className="h-3 w-3" />
                ) : null}
              </span>
            </button>

            <div className="pt-1 text-[11px] font-semibold text-slate-400">
              친구 목록
            </div>
            {friendsQuery.isLoading ? (
              <div className="rounded-xl bg-slate-50 px-3 py-5 text-center text-xs font-semibold text-slate-400">
                친구 목록을 불러오는 중입니다.
              </div>
            ) : filteredShareFriends.length > 0 ? (
              filteredShareFriends.map((item, index) => {
                const friend = item.friend;
                return (
                  <div
                    key={friend.public_uid}
                    className="flex h-11 items-center gap-3 rounded-xl px-2"
                  >
                    <span
                      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        index % 3 === 0
                          ? "bg-pink-100 text-pink-700"
                          : index % 3 === 1
                            ? "bg-blue-100 text-blue-700"
                            : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {shareAvatarLabel(friend.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
                      {friend.name}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400">
                      친구
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl bg-slate-50 px-3 py-5 text-center text-xs font-semibold text-slate-400">
                표시할 친구가 없습니다.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {friendPresetsQuery.isLoading ? (
              <div className="rounded-xl bg-slate-50 px-3 py-5 text-center text-xs font-semibold text-slate-400">
                그룹 프리셋을 불러오는 중입니다.
              </div>
            ) : filteredFriendPresets.length > 0 ? (
              filteredFriendPresets.map((preset) => {
                const selected =
                  shareTargetKind === "preset" &&
                  selectedFriendPresetId === preset.friend_preset_id;
                return (
                  <button
                    key={preset.friend_preset_id}
                    type="button"
                    onClick={() =>
                      selectShareTarget("preset", preset.friend_preset_id)
                    }
                    className={`flex h-12 w-full items-center gap-3 rounded-xl px-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 ${
                      selected ? "bg-violet-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                      <Users className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-950">
                        {preset.name}
                      </span>
                      <span className="block text-[11px] font-semibold text-slate-400">
                        {preset.members.length}명
                      </span>
                    </span>
                    <span
                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-violet-500 bg-violet-600 text-white"
                          : "border-slate-200 bg-white"
                      }`}
                      aria-hidden="true"
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="rounded-xl bg-slate-50 px-3 py-5 text-center text-xs font-semibold text-slate-400">
                표시할 그룹 프리셋이 없습니다.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 p-3">
        <button
          type="button"
          disabled={!shareSelectionReady}
          onClick={() => setShareTargetOpen(false)}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-violet-600 px-3 text-sm font-bold text-white shadow-lg shadow-violet-600/20 transition hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none"
        >
          공유하기
        </button>
        </div>
        </div>
      </div>,
    );
  };

  const renderCreateVisibilityControl = () => (
    <div className={compactFieldGroupClass}>
      <div className="mt-1 flex h-12 min-w-0 items-center gap-3 rounded-lg px-2">
        <Globe2 className="h-4 w-4 shrink-0 text-violet-500" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-600">공개 범위</div>
          <div className="truncate text-[11px] font-medium text-slate-400">
            {shareTargetLabel}
          </div>
        </div>
        <div
          role="radiogroup"
          aria-label="공개 범위"
          className="grid shrink-0 grid-cols-2 gap-1 rounded-full bg-slate-100 p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={form.visibility === "private"}
            onClick={setPrivateVisibility}
            className={`inline-flex h-8 min-w-[58px] items-center justify-center rounded-full px-3 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 ${
              form.visibility === "private"
                ? "bg-white text-slate-700 shadow-sm"
                : "text-slate-400 hover:text-slate-700"
            }`}
          >
            비공개
          </button>
          <button
            ref={shareTargetTriggerRef}
            type="button"
            role="radio"
            aria-checked={form.visibility !== "private"}
            aria-expanded={shareTargetOpen}
            aria-controls={
              shareTargetOpen ? "schedule-share-target-popover" : undefined
            }
            onClick={openShareTargetPicker}
            className={`inline-flex h-8 min-w-[58px] items-center justify-center rounded-full px-3 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 ${
                  form.visibility !== "private"
                    ? "bg-violet-600 text-white shadow-sm shadow-violet-600/20"
                    : "text-slate-400 hover:text-slate-700"
                }`}
              >
                공개
              </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-950/20 md:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        style={floatingStyle}
        className={getSchedulePanelClassName(panelLayout)}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5">
          <div className="min-w-0">
            {scheduleOwnerSelect ??
              (mode !== "create" ? (
                <>
                  <p className="text-xs font-semibold text-violet-700">
                    개인 일정
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-950">
                    {mode === "edit" ? "일정 수정" : "반복 일정 추가"}
                  </h2>
                </>
              ) : null)}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {mode === "edit" && schedule && onDelete ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deletePending}
                aria-label="일정 삭제"
                title="일정 삭제"
                className="order-1 inline-flex h-9 w-9 items-center justify-center rounded-md bg-red-50 text-red-500 transition hover:bg-red-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletePending ? (
                  <RotateCcw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="일정 추가 패널 닫기"
              className={`order-2 ${scheduleSidebarToggleButtonClass}`}
            >
              <PanelRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          autoComplete="none"
          className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4"
        >
          <div className="space-y-2">
            {mode === "edit" && schedule && onCompletionChange ? (
              <div className="px-1 pb-1">
                <button
                  type="button"
                  onClick={handleCompletionToggle}
                  disabled={completionPending}
                  aria-pressed={!!schedule.is_completed}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-full px-3 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                    schedule.is_completed
                      ? "bg-violet-50 text-violet-700 ring-1 ring-violet-100 hover:bg-violet-100 focus-visible:ring-violet-200"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 focus-visible:ring-slate-200"
                  }`}
                >
                  {completionPending ? (
                    <RotateCcw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {completionPending
                    ? "상태 변경 중..."
                    : schedule.is_completed
                      ? "완료 해제"
                      : "완료 표시"}
                </button>
              </div>
            ) : null}
            <label className="block border-b border-slate-200/70 pb-2">
              <input
                ref={titleInputRef}
                type="text"
                name="flowra_schedule_title"
                autoComplete="none"
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="일정 제목"
                className="h-11 w-full rounded-md border border-transparent bg-transparent px-2 text-base font-medium text-slate-950 outline-none transition-[border-color,background-color,opacity,box-shadow] duration-150 placeholder:text-slate-400 hover:border-slate-200 hover:bg-white/60 focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
              />
            </label>

            <div className="flex items-start gap-3 px-1 py-1">
              <Clock3 className="hidden" />
              <div className="min-w-0 flex-1">
                {!allDay ? (
                  <div
                    className="grid max-w-full grid-cols-[1.5rem_7.25rem_1.1rem_minmax(0,1fr)] items-center gap-1.5"
                    title={formTimeRangeLabel}
                  >
                    <span className="hidden">시간</span>
                    <span className="flex h-9 items-center justify-center text-slate-400">
                      <Clock3 className="h-4 w-4" />
                    </span>
                    <div className="w-[4.75rem] min-w-0">
                      <CompactTimeInput
                        required={!allDay}
                        disabled={allDay}
                        value={timeFromLocalInput(form.start_local)}
                        ariaLabel="시작 시간"
                        onCommit={() => endTimeInputRef.current?.focus()}
                        onValidDraftChange={(value) => {
                          const nextStartLocal = localInputWithTime(
                            form.start_local,
                            value,
                            dateFromLocalInput(form.start_local),
                          );
                          setPreviewStartLocal(nextStartLocal);
                          setPreviewEndLocal(
                            endLocalAfterStartChange(
                              nextStartLocal,
                              form.end_local,
                              form.start_local,
                            ),
                          );
                        }}
                        onChange={(value) =>
                          updateStartLocal(
                            localInputWithTime(
                              form.start_local,
                              value,
                              dateFromLocalInput(form.start_local),
                            ),
                            { defaultEndFromStart: true },
                          )
                        }
                      />
                    </div>
                    <span className="whitespace-nowrap text-center text-slate-300">
                      →
                    </span>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className="w-[4.75rem] min-w-0">
                        <CompactTimeInput
                          disabled={allDay}
                          value={timeFromLocalInput(form.end_local)}
                          ariaLabel="종료 시간"
                          inputRef={endTimeInputRef}
                          onValidDraftChange={(value) =>
                            setPreviewEndLocal(
                              endLocalWithTimeAfterEndTimeChange(
                                previewStartLocal ?? form.start_local,
                                form.end_local,
                                value,
                              ),
                            )
                          }
                          onChange={(value) =>
                            updateEndLocal(
                              value
                                ? endLocalWithTimeAfterEndTimeChange(
                                    form.start_local,
                                    form.end_local,
                                    value,
                                  )
                                : "",
                            )
                          }
                        />
                      </div>
                      {formDurationLabel && (
                        <span className="block min-w-0 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-xs font-normal text-slate-400 opacity-80">
                          {formDurationLabel}
                        </span>
                      )}
                    </div>
                  </div>
                ) : null}

                {false && (
                  <div className="hidden">
                    <div className="mt-2 flex max-w-full justify-start">
                      <CompactDateInput
                        required
                        value={formStartDateKey}
                        ariaLabel="시작 날짜"
                        inputRef={startDateInputRef}
                        className="w-40 max-w-full"
                        onChange={handleStartDateChange}
                      />
                    </div>
                  </div>
                )}
                <div
                  className="mt-2 grid max-w-full grid-cols-[1.5rem_7.25rem_1.1rem_minmax(0,1fr)] items-center gap-1.5"
                  title={formDateRangeLabel}
                >
                  <span
                    className={
                      allDay
                        ? "flex h-9 items-center justify-center text-slate-400"
                        : "invisible h-9"
                    }
                  >
                    {allDay ? <CalendarDays className="h-4 w-4" /> : "날짜"}
                  </span>
                  <CompactDateInput
                    required
                    disabled={repeatEnabled}
                    value={formStartDateKey}
                    ariaLabel="시작 날짜"
                    inputRef={startDateInputRef}
                    className="w-[7.25rem]"
                    onCommit={() => {
                      window.requestAnimationFrame(() =>
                        endDateInputRef.current?.focus(),
                      );
                    }}
                    onChange={handleStartDateChange}
                  />
                  <span className="whitespace-nowrap text-center text-slate-300">
                    →
                  </span>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <CompactDateInput
                      disabled={repeatEnabled}
                      value={formEndDateKey}
                      ariaLabel="종료 날짜"
                      inputRef={endDateInputRef}
                      className="w-[7.25rem]"
                      onChange={(value) =>
                        updateEndLocal(
                          localInputWithDate(
                            form.end_local || form.start_local,
                            value,
                            timeFromLocalInput(form.end_local) ||
                              timeFromLocalInput(form.start_local) ||
                              "10:00",
                          ),
                        )
                      }
                    />
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2 px-1">
                    {renderAllDayControl(
                      `inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-xs font-medium transition ${
                        allDay
                          ? "bg-violet-50 text-violet-700 ring-1 ring-violet-100"
                          : "text-slate-700 hover:bg-slate-50"
                      }`,
                    )}
                    {!isCompanyScheduleDraft &&
                      renderRepeatEnabledControl(
                        `inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-xs font-medium transition ${
                          repeatEnabled
                            ? "bg-violet-50 text-violet-700 ring-1 ring-violet-100"
                            : "text-slate-700 hover:bg-slate-50"
                        }`,
                      )}
                  </div>

                  {repeatEnabled && !isCompanyScheduleDraft ? (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
                        <div className={settingsRowLabelClass}>반복 주기</div>
                        {renderRepeatTypeControl(
                          `${settingsRowButtonClass} ${
                            repeatTypeOpen
                              ? "border-slate-200 bg-white text-slate-900"
                              : repeatType !== "none"
                                ? "text-slate-900"
                                : "text-slate-700 hover:bg-slate-50"
                          }`,
                          { showIcon: false },
                        )}
                      </div>

                      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
                        <div className={settingsRowLabelClass}>반복 종료</div>
                        {renderRepeatEndControl(
                          `${settingsRowButtonClass} ${
                            repeatEndOpen
                              ? "border-slate-200 bg-white"
                              : "text-slate-800"
                          }`,
                        )}
                      </div>

                      {showRepeatHolidayControl ? (
                        <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2">
                          <div
                            className={`${settingsRowLabelClass} whitespace-nowrap pt-2.5`}
                          >
                            공휴일에도 반복
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={includeHolidayRepeats}
                            onClick={() =>
                              setIncludeHolidayRepeats((current) => !current)
                            }
                            className="flex min-h-9 w-full items-start justify-between gap-3 rounded-md px-2.5 py-1.5 text-left outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-100"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-medium text-slate-900">
                                {includeHolidayRepeats ? "켬" : "끔"}
                              </span>
                              <span className="mt-0.5 block text-xs font-medium text-slate-500">
                                공휴일 {repeatHolidayCount}개{" "}
                                {includeHolidayRepeats ? "포함" : "제외"}
                              </span>
                            </span>
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
                                includeHolidayRepeats
                                  ? "bg-violet-500"
                                  : "bg-slate-200"
                              }`}
                            >
                              <span
                                className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${
                                  includeHolidayRepeats
                                    ? "translate-x-4"
                                    : "translate-x-0"
                                }`}
                              />
                            </span>
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="space-y-2 border-t border-slate-200/70 pt-2">
                    <div className={compactFieldGroupClass}>
                      <div className="min-w-0">
                        <CustomSelect
                          ariaLabel="유형"
                          triggerLabel={scheduleTypeTriggerLabel}
                          triggerColorDot={scheduleTypeTriggerColorDot}
                          triggerIcon={
                            <Shapes className="h-4 w-4" aria-hidden="true" />
                          }
                          value={form.schedule_type}
                          options={scheduleTypeSelectOptions}
                          className={compactSelectClass}
                          side="right"
                          sideOffset={10}
                          floatingBoundary="panel"
                          menuTone="dark"
                          contentClassName="schedule-basic-options-select-menu z-[160]"
                          onPreviewChange={(value) =>
                            updateSelectPreview("schedule_type", value)
                          }
                          onChange={(value) => {
                            markSelectDisplayTouched("schedule_type");
                            setForm({
                              ...form,
                              schedule_type: value,
                            });
                          }}
                        />
                      </div>
                    </div>

                    <div className={compactFieldGroupClass}>
                      <div className="min-w-0">
                        <CustomSelect
                          ariaLabel="중요도"
                          triggerLabel={priorityTriggerLabel}
                          triggerColorDot={priorityTriggerColorDot}
                          triggerIcon={
                            <Flag className="h-4 w-4" aria-hidden="true" />
                          }
                          value={form.priority}
                          options={prioritySelectOptions}
                          className={compactSelectClass}
                          side="right"
                          sideOffset={10}
                          floatingBoundary="panel"
                          menuTone="dark"
                          contentClassName="schedule-basic-options-select-menu z-[160]"
                          onPreviewChange={(value) =>
                            updateSelectPreview("priority", value)
                          }
                          onChange={(value) => {
                            markSelectDisplayTouched("priority");
                            setForm({
                              ...form,
                              priority: value,
                            });
                          }}
                        />
                      </div>
                    </div>

                    <div className={compactFieldGroupClass}>
                      <CustomSelect
                        ariaLabel="카테고리"
                        triggerLabel={categoryTriggerLabel}
                        triggerColorDot={categoryTriggerColorDot}
                        triggerIcon={
                          <Tag className="h-4 w-4" aria-hidden="true" />
                        }
                        value={form.category_id}
                        options={categorySelectOptions}
                        disabled={scheduleCategoriesLoading}
                        placeholder="카테고리 없음"
                        className={compactSelectClass}
                        side="right"
                        sideOffset={10}
                        floatingBoundary="panel"
                        menuTone="dark"
                        contentClassName="schedule-basic-options-select-menu z-[160]"
                        onPreviewChange={(value) =>
                          updateSelectPreview("category_id", value)
                        }
                        onChange={(value) => {
                          markSelectDisplayTouched("category_id");
                          setForm({ ...form, category_id: value });
                        }}
                      />
                    </div>

                    {mode === "create"
                      ? isCompanyScheduleDraft
                        ? renderCompanyTeamScopeControl()
                        : renderPersonalAttendeeControl()
                      : null}

                    <label className={`block ${compactFieldGroupClass}`}>
                      <div className={compactFieldFrameClass}>
                        <div className="flex min-w-0 items-center gap-2.5">
                          <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                          <input
                            type="text"
                            name="flowra_schedule_location"
                            autoComplete="none"
                            value={form.location}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                location: event.target.value,
                              })
                            }
                            placeholder="장소"
                            className={compactInnerInputClass}
                          />
                        </div>
                      </div>
                    </label>

                    <div className={compactFieldGroupClass}>
                      <div className={compactFieldFrameClass}>
                        <textarea
                          ref={descriptionTextareaRef}
                          rows={1}
                          value={form.description}
                          onChange={(event) => {
                            setForm({
                              ...form,
                              description: event.target.value,
                            });
                            syncDescriptionTextareaHeight(event.currentTarget);
                          }}
                          placeholder="설명"
                          className="h-9 min-h-9 w-full resize-none bg-transparent py-1.5 text-xs font-medium leading-6 text-slate-900 outline-none transition-[height] duration-150 placeholder:text-slate-400"
                        />
                      </div>
                    </div>

                    {mode === "create" && !isCompanyScheduleDraft
                      ? renderCreateVisibilityControl()
                      : null}

                    <div className={`${compactFieldGroupClass} hidden`}>
                      <div className={settingsRowLabelClass}>공개 범위</div>
                      <div className="relative mt-1">
                        <div
                          role="radiogroup"
                          aria-label="공개 범위"
                          aria-disabled="true"
                          aria-hidden="true"
                          className="grid grid-cols-3 gap-1 rounded-md border border-slate-200 bg-white p-1"
                        >
                          {scheduleVisibilityScopeOptions.map((option) => {
                            const Icon = option.icon;
                            const selected = option.value === form.visibility;

                            return (
                              <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                disabled
                                onClick={() => {
                                  if (option.value === "private") {
                                    setForm({
                                      ...form,
                                      visibility: option.value,
                                    });
                                  }
                                }}
                                className={`inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-100 disabled:cursor-not-allowed disabled:text-slate-400 ${
                                  selected
                                    ? "bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-100"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 disabled:hover:bg-transparent"
                                }`}
                              >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div
                          role="status"
                          className="absolute inset-0 z-10 flex items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-xs font-semibold text-slate-500 shadow-inner"
                        >
                          현재 개발중...
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {mode === "edit" && (isRepeatMode || isSelectedDatesMode) ? (
              <div className="border-t border-slate-200/70 px-1 pt-3">
                <button
                  type="button"
                  onClick={handleApplyRepeat}
                  disabled={
                    isPending ||
                    (isSelectedDatesMode
                      ? targetDateKeys.length === 0
                      : targetDateKeys.length <= 1)
                  }
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-violet-600 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending
                    ? "반복 일정 생성 중..."
                    : isSelectedDatesMode
                      ? `선택 날짜 적용 (${targetDateKeys.length}개)`
                      : `반복 일정 만들기 (${Math.max(0, targetDateKeys.length - 1)}개 추가)`}
                </button>
              </div>
            ) : null}

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {mode === "edit" && schedule && (
              <ScheduleLinkedTasks schedule={schedule} />
            )}
          </div>
        </form>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white/95 px-4 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.04)] backdrop-blur">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 w-full min-w-0 items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
          >
            <X className="h-4 w-4" />
            닫기
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={(event) => {
              const formEl = event.currentTarget
                .closest("aside")
                ?.querySelector("form");
              formEl?.requestSubmit();
            }}
            className="inline-flex h-12 w-full min-w-0 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(124,58,237,0.22)] transition hover:bg-violet-700 hover:shadow-[0_10px_22px_rgba(124,58,237,0.28)] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 active:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {isPending ? (
              <RotateCcw className="h-4 w-4 animate-spin" />
            ) : mode === "edit" ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {isPending ? "저장 중..." : mode === "edit" ? "저장" : "추가"}
          </button>
        </div>
      </aside>
      {renderRepeatTypePopover()}
      {renderRepeatEndPopover()}
      {renderCustomRepeatPopover()}
      {renderSelectedDatesPopover()}
      {renderShareTargetPopoverContent()}
    </>
  );
}

function MiniCalendar({
  visibleMonth,
  selectedKey,
  dateMeta,
  holidaysByDate,
  weekDates,
  weekStart,
  onMoveMonth,
  onResetMonth,
  onSelectDate,
}: {
  visibleMonth: Date;
  selectedKey: string;
  dateMeta: Map<string, DayMeta>;
  holidaysByDate: Map<string, Holiday[]>;
  weekDates: Date[];
  weekStart: WeekStartDay;
  onMoveMonth: (offset: number) => void;
  onResetMonth: () => void;
  onSelectDate: (date: Date) => void;
}) {
  const today = new Date();
  const isCurrentMonth =
    visibleMonth.getFullYear() === today.getFullYear() &&
    visibleMonth.getMonth() === today.getMonth();
  const compactCells = useMemo(
    () => buildFullMonthCells(visibleMonth, { weekStart }),
    [visibleMonth, weekStart],
  );
  const weekdayHeaders = useMemo(
    () => orderedWeekdayLabels(weekStart),
    [weekStart],
  );
  const selectedWeekSet = useMemo(
    () => new Set(weekDates.map((day) => toDateKey(day))),
    [weekDates],
  );
  const renderMarker = (meta?: DayMeta, selected?: boolean) => {
    if (!meta || meta.count === 0) return null;
    const dotClass = selected
      ? "bg-white"
      : meta.hasDeadline
        ? "bg-rose-500"
        : "bg-violet-500";

    return (
      <span className="pointer-events-none absolute inset-x-0 bottom-1 flex items-center justify-center">
        <span className={`h-1 w-1 rounded-full ${dotClass}`} />
      </span>
    );
  };

  return (
    <aside className="w-full px-3 pb-3 pt-2">
      <div className="mb-1 flex h-7 items-center justify-between gap-2">
        {isCurrentMonth ? (
          <span aria-hidden="true" />
        ) : (
          <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
            {formatMonthTitle(visibleMonth)}
          </p>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={onResetMonth}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Return to selected date"
              title="Return to selected date"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onMoveMonth(-1)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Previous month"
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onMoveMonth(1)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Next month"
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
          {compactCells.map(({ date: day, currentMonth }, index) => {
            const key = toDateKey(day);
            const selected = key === selectedKey;
            const meta = dateMeta.get(key);
            const today = isToday(day);
            const isHoliday = (holidaysByDate.get(key)?.length ?? 0) > 0;
            const selectedWeek = selectedWeekSet.has(key);
            const column = index % 7;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectDate(day)}
                className={`relative flex h-8 items-center justify-center text-xs font-semibold leading-none transition ${
                  selectedWeek && !selected && column === 0
                    ? "rounded-l-xl"
                    : ""
                } ${
                  selectedWeek && !selected && column === 6
                    ? "rounded-r-xl"
                    : ""
                } ${selectedWeek && !selected ? "bg-slate-100" : ""} ${
                  selected
                    ? "z-10 rounded-lg !bg-red-500 !text-white shadow-sm"
                    : currentMonth
                      ? today
                        ? "rounded-lg !bg-red-500 !text-white shadow-sm"
                        : isHoliday
                          ? "rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                      : "text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                }`}
                aria-label={`${formatCompactDate(day)} schedule count ${meta?.count ?? 0}`}
              >
                {day.getDate()}
                {currentMonth ? renderMarker(meta, selected) : null}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ExpandableScheduleDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const canToggle = hasOverflow || expanded;

  useLayoutEffect(() => {
    if (expanded) return;

    const element = textRef.current;
    if (!element) return;

    const updateOverflow = () => {
      setHasOverflow(element.scrollHeight > element.clientHeight + 1);
    };

    updateOverflow();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);

    return () => observer.disconnect();
  }, [expanded, text]);

  const toggle = (event: ReactMouseEvent) => {
    if (!canToggle) return;

    event.stopPropagation();
    setExpanded((current) => !current);
  };

  return (
    <div>
      <p
        ref={textRef}
        onClick={canToggle ? toggle : undefined}
        title={
          canToggle ? (expanded ? "설명 접기" : "설명 전체 보기") : undefined
        }
        className={`whitespace-pre-wrap break-words leading-5 ${
          expanded ? "" : "line-clamp-2"
        } ${canToggle ? "cursor-pointer" : ""}`}
      >
        {text}
      </p>
      {canToggle && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={expanded ? "설명 접기" : "설명 전체 보기"}
          title={expanded ? "설명 접기" : "설명 전체 보기"}
          className="mt-1 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          <span>{expanded ? "접기" : "전체 보기"}</span>
        </button>
      )}
    </div>
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
  onEdit: (anchorElement?: SchedulePanelAnchorElement) => void;
  onDelete: () => void;
  deleting?: boolean;
}) {
  const { data: categories = [] } = useCategories("schedule");
  const classificationSettings = useClassificationSettings();
  const completionMutation = useSetScheduleCompletion();
  const category = categories.find(
    (c) => c.category_id === schedule.category_id,
  );
  const preview = isPreviewSchedule(schedule);
  const company = isCompanySchedule(schedule);
  const readOnly = company || preview;
  const creator = company ? companyScheduleCreatorDisplay(schedule) : null;
  const accentColor = scheduleAccentColor(schedule);
  const cardColor =
    (company ? companyScheduleAccent : category?.color) ??
    fallbackCategoryColor;
  const completionPending =
    completionMutation.isPending &&
    completionMutation.variables?.scheduleId === schedule.schedule_id;

  const handleCompletionChange = async (completed: boolean) => {
    if (completed === !!schedule.is_completed) return;

    try {
      await completionMutation.mutateAsync({
        scheduleId: schedule.schedule_id,
        completed,
      });
    } catch (err) {
      toast.error(getErrorMessage(err, "일정 상태 변경에 실패했습니다."));
    }
  };

  return (
    <li
      id={`schedule-${schedule.schedule_id}`}
      onClick={company ? (event) => onEdit(event.currentTarget) : undefined}
      className={`group relative overflow-hidden rounded-lg border bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:border-violet-200 hover:shadow-md ${
        company ? "cursor-pointer" : ""
      } ${
        highlighted
          ? "border-violet-300 ring-2 ring-violet-100"
          : preview
            ? "border-dashed border-violet-300"
            : "border-slate-200"
      }`}
      style={{ backgroundColor: colorWithAlpha(cardColor, "10") }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: accentColor }}
        aria-hidden
      />
      <div className="flex items-start gap-4 pl-1">
        {selectable && !readOnly && (
          <label className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              aria-label={`${schedule.title} select schedule`}
              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
          </label>
        )}

        <div className="w-20 shrink-0 text-xs font-medium text-slate-500">
          {schedule.all_day ? (
            <span className="rounded-md bg-violet-50 px-2 py-1 font-semibold text-violet-700">
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
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <PriorityDot schedule={schedule} />
            <h3
              className={`min-w-[10rem] max-w-full flex-1 truncate text-sm font-semibold ${
                schedule.is_completed
                  ? "text-slate-400 line-through"
                  : "text-slate-950"
              }`}
            >
              {schedule.title}
            </h3>
            {schedule.is_completed && (
              <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                완료
              </span>
            )}
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                company
                  ? "border-violet-200 bg-violet-50 text-violet-700"
                  : "border-violet-200 bg-violet-50 text-violet-700"
              }`}
            >
              {company ? "회사" : "개인"}
            </span>
            {preview && (
              <span
                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                  preview
                    ? "border-violet-200 bg-violet-50 text-violet-700"
                    : "border-violet-200 bg-violet-50 text-violet-700"
                }`}
              >
                {preview ? "미리보기" : "회사"}
              </span>
            )}
            {company && schedule.company?.name && (
              <span className="rounded-md border border-violet-100 bg-violet-50/70 px-2 py-0.5 text-[11px] text-violet-700">
                {schedule.company.name}
              </span>
            )}
          </div>

          <ListCardMeta className="mt-2">
            <TypeMetaChip>
              {getClassificationLabel(
                classificationSettings,
                "scheduleTypes",
                schedule.schedule_type,
              )}
            </TypeMetaChip>
            {schedule.priority && (
              <PriorityMetaChip priority={schedule.priority}>
                {getClassificationLabel(
                  classificationSettings,
                  "taskPriorities",
                  schedule.priority,
                )}
              </PriorityMetaChip>
            )}
            {category && <CategoryMetaChip category={category} />}
            {creator && (
              <span
                className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-violet-100 bg-white px-2 py-0.5 text-[11px] font-medium leading-5 text-slate-600"
                title={
                  creator.email
                    ? `추가한 사람: ${creator.label} (${creator.email})`
                    : `추가한 사람: ${creator.label}`
                }
              >
                <UserRound className="h-3 w-3 shrink-0 text-violet-500" />
                <span className="shrink-0 text-slate-400">추가</span>
                <span className="min-w-0 truncate">{creator.label}</span>
              </span>
            )}
          </ListCardMeta>

          {(schedule.location || schedule.description) && (
            <div className="mt-2 space-y-1 text-xs text-slate-500">
              {schedule.location && (
                <p className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {schedule.location}
                </p>
              )}
              {schedule.description && (
                <ExpandableScheduleDescription text={schedule.description} />
              )}
            </div>
          )}
        </div>

        {readOnly ? (
          <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
            {preview ? "저장 전" : "조회 전용"}
          </span>
        ) : (
          <div className="flex shrink-0 gap-1">
            <TaskCompletionToggleButton
              completed={!!schedule.is_completed}
              disabled={completionPending}
              onCompletedChange={(completed) =>
                void handleCompletionChange(completed)
              }
              className="h-8 w-8 rounded-lg"
            />
            <button
              type="button"
              onClick={(event) => onEdit(event.currentTarget)}
              aria-label="Edit"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
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
        )}
      </div>
    </li>
  );
}

function toPositiveScheduleNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function asScheduleRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function scheduleRecordString(
  record: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function companyScheduleMemberDisplay(value: unknown) {
  const member = asScheduleRecord(value);
  if (!member) return null;

  const user = asScheduleRecord(member.user);
  const label =
    scheduleRecordString(member, ["name", "display_name", "full_name"]) ??
    scheduleRecordString(user, ["name", "display_name", "full_name"]) ??
    scheduleRecordString(member, ["email"]) ??
    scheduleRecordString(user, ["email"]);
  if (!label) return null;

  const email =
    scheduleRecordString(member, ["email"]) ??
    scheduleRecordString(user, ["email"]);

  return {
    label,
    email: email && email !== label ? email : null,
  };
}

function companyScheduleCreatorDisplay(schedule: Schedule) {
  const record = schedule as unknown as Record<string, unknown>;

  return companyScheduleMemberDisplay(
    schedule.created_by_company_member ??
      record.created_by_member ??
      record.created_by ??
      record.creator,
  );
}

function companyScheduleTargetDepartmentId(target: Record<string, unknown>) {
  const department = asScheduleRecord(target.department);
  const targetType = String(target.target_type ?? target.type ?? "");

  return toPositiveScheduleNumber(
    target.department_id ??
      target.target_department_id ??
      department?.department_id ??
      (targetType === "department" ? target.target_id : null),
  );
}

function companyScheduleTargetStatusLabel(status?: string | null) {
  switch (status) {
    case "active":
      return "참여 중";
    case "rejected":
      return "반려";
    case "removed":
      return "제외됨";
    case "pending":
      return "승인 대기";
    case "approved":
      return "승인됨";
    default:
      return status || "상태 미확인";
  }
}

function companyScheduleStatusClassName(status?: string | null) {
  if (status === "active" || status === "approved") {
    return "border-violet-100 bg-violet-50 text-violet-700";
  }
  if (status === "rejected" || status === "removed" || status === "cancelled") {
    return "border-red-100 bg-red-50 text-red-700";
  }
  return "border-amber-100 bg-amber-50 text-amber-700";
}

function companyScheduleTargetLabel(
  target: Record<string, unknown>,
  departments: CompanyAdminDepartment[],
) {
  const department = asScheduleRecord(target.department);
  const member = asScheduleRecord(target.member);
  const departmentId = companyScheduleTargetDepartmentId(target);
  const departmentName =
    scheduleRecordString(department, ["name"]) ??
    departments.find((item) => item.department_id === departmentId)?.name;
  const memberName = scheduleRecordString(member, ["name", "email"]);
  const targetName = scheduleRecordString(target, ["name", "title", "label"]);

  return (
    departmentName ??
    memberName ??
    targetName ??
    (departmentId ? `부서 ${departmentId}` : "협업 대상")
  );
}

const companyScheduleApprovalTypeLabels: Record<string, string> = {
  create_collaboration: "협업 일정 승인",
  update_collaboration: "협업 일정 수정 승인",
  delete_schedule: "협업 일정 삭제 승인",
  remove_department_target: "협업 부서 제외 승인",
};

function companyScheduleApprovalTypeLabel(type: string) {
  return companyScheduleApprovalTypeLabels[type] ?? "회사 일정 승인";
}

function companyScheduleApprovalTitle(approval: CompanyScheduleApproval) {
  return (
    approval.company_schedule?.title ??
    approval.schedule?.title ??
    String(approval.title ?? "회사 일정")
  );
}

function companyScheduleApprovalTargetLabel(approval: CompanyScheduleApproval) {
  const targetDepartment =
    approval.target_department ?? approval.department ?? null;
  return (
    targetDepartment?.name ??
    (approval.target_department_id
      ? `부서 ${approval.target_department_id}`
      : null)
  );
}

function companyScheduleApprovalCreatedAt(approval: CompanyScheduleApproval) {
  const createdAt = approval.created_at;
  if (!createdAt) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return null;
  return `${formatSelectedDate(date)} ${formatTime(createdAt)}`;
}

function CompanyScheduleApprovalPopover({
  approverApprovals,
  requestedApprovals,
  loading,
  actionPending,
  onApprove,
  onReject,
}: {
  approverApprovals: CompanyScheduleApproval[];
  requestedApprovals: CompanyScheduleApproval[];
  loading?: boolean;
  actionPending?: boolean;
  onApprove: (approval: CompanyScheduleApproval) => void;
  onReject: (approval: CompanyScheduleApproval) => void;
}) {
  const pendingCount = approverApprovals.length + requestedApprovals.length;

  const renderApprovalList = (
    title: string,
    approvals: CompanyScheduleApproval[],
    actionable: boolean,
  ) => (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-700">{title}</h3>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
          {approvals.length}
        </span>
      </div>
      {approvals.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs font-medium text-slate-400">
          승인 대기 요청이 없습니다.
        </p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {approvals.map((approval, index) => {
            const approvalId = getCompanyScheduleApprovalId(approval);
            const targetLabel = companyScheduleApprovalTargetLabel(approval);
            const createdAt = companyScheduleApprovalCreatedAt(approval);

            return (
              <article
                key={approvalId ?? `${approval.approval_type}-${index}`}
                className="rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-700">
                    <CheckSquare2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-950">
                      {companyScheduleApprovalTitle(approval)}
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">
                      {companyScheduleApprovalTypeLabel(approval.approval_type)}
                      {targetLabel ? ` · ${targetLabel}` : ""}
                    </p>
                    {createdAt && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {createdAt}
                      </p>
                    )}
                  </div>
                </div>
                {actionable && (
                  <div className="mt-3 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onReject(approval)}
                      disabled={actionPending || !approvalId}
                      className="inline-flex h-7 items-center justify-center rounded-md border border-red-200 bg-white px-2.5 text-[11px] font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      반려
                    </button>
                    <button
                      type="button"
                      onClick={() => onApprove(approval)}
                      disabled={actionPending || !approvalId}
                      className="inline-flex h-7 items-center justify-center rounded-md border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50"
                    >
                      승인
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="회사 일정 승인함"
          title="회사 일정 승인함"
          className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
        >
          <CheckSquare2 className="h-4 w-4" />
          {pendingCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
              {pendingCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="z-[160] w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl shadow-slate-900/10"
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">협업 승인</p>
            <p className="mt-0.5 text-xs text-slate-500">
              내 승인함과 내가 보낸 요청
            </p>
          </div>
          {loading && (
            <span className="text-[11px] font-semibold text-slate-400">
              불러오는 중
            </span>
          )}
        </div>
        <div className="grid gap-3">
          {renderApprovalList("내 승인함", approverApprovals, true)}
          {renderApprovalList("내 요청", requestedApprovals, false)}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ScheduleReadonlyPanel({
  schedule,
  onClose,
  departments,
  floatingStyle,
  panelLayout,
}: {
  schedule: Schedule;
  onClose: () => void;
  departments: CompanyAdminDepartment[];
  floatingStyle: SchedulePanelFloatingStyle;
  panelLayout: SchedulePanelLayout;
}) {
  const classificationSettings = useClassificationSettings();
  const { start, end } = scheduleDateRange(schedule);
  const sameDay = toDateKey(start) === toDateKey(end);
  const dateLabel = sameDay
    ? formatSelectedDate(start)
    : `${formatSelectedDate(start)} - ${formatSelectedDate(end)}`;
  const timeLabel = schedule.all_day
    ? "종일"
    : `${formatTime(schedule.start_datetime)}${
        schedule.end_datetime ? ` - ${formatTime(schedule.end_datetime)}` : ""
      }`;
  const creator = companyScheduleCreatorDisplay(schedule);
  const targets = (schedule.targets ?? []) as Array<Record<string, unknown>>;
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-950/20 md:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        style={floatingStyle}
        className={getSchedulePanelClassName(panelLayout)}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-violet-700">회사 일정</p>
            <h2 className="mt-1 truncate text-base font-semibold text-slate-950">
              {schedule.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onClose}
              aria-label="일정 패널 닫기"
              title="일정 패널 닫기"
              className={`order-2 ${scheduleSidebarToggleButtonClass}`}
            >
              <PanelRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Edit"
              className="order-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-500">회사</dt>
              <dd className="mt-1 font-medium text-slate-900">
                {schedule.company?.name ?? "회사 일정"}
              </dd>
            </div>
            {creator && (
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  추가한 사람
                </dt>
                <dd className="mt-1 flex min-w-0 items-center gap-1.5 text-slate-900">
                  <UserRound className="h-4 w-4 shrink-0 text-violet-500" />
                  <span className="min-w-0 truncate font-medium">
                    {creator.label}
                  </span>
                  {creator.email && (
                    <span className="min-w-0 truncate text-xs text-slate-500">
                      {creator.email}
                    </span>
                  )}
                </dd>
              </div>
            )}
            {(schedule.approval_status || schedule.is_collaboration) && (
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  협업 상태
                </dt>
                <dd className="mt-1 flex flex-wrap items-center gap-1.5">
                  {schedule.is_collaboration && (
                    <span className="rounded-md border border-violet-100 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                      협업 일정
                    </span>
                  )}
                  {schedule.approval_status && (
                    <span
                      className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${companyScheduleStatusClassName(
                        schedule.approval_status,
                      )}`}
                    >
                      {companyScheduleTargetStatusLabel(
                        schedule.approval_status,
                      )}
                    </span>
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-slate-500">
                날짜와 시간
              </dt>
              <dd className="mt-1 text-slate-900">
                {dateLabel}
                <span className="ml-2 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">
                  {timeLabel}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Type</dt>
              <dd className="mt-1 text-slate-900">
                {getClassificationLabel(
                  classificationSettings,
                  "scheduleTypes",
                  schedule.schedule_type,
                )}
              </dd>
            </div>
            {targets.length > 0 && (
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  참여 부서
                </dt>
                <dd className="mt-2 space-y-1.5">
                  {targets.map((target, index) => {
                    const status = String(
                      target.status ?? target.approval_status ?? "",
                    );
                    const label = companyScheduleTargetLabel(
                      target,
                      departments,
                    );

                    return (
                      <div
                        key={`${label}-${index}`}
                        className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2"
                      >
                        <span className="truncate text-xs font-semibold text-slate-800">
                          {label}
                        </span>
                        <span
                          className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${companyScheduleStatusClassName(
                            status,
                          )}`}
                        >
                          {companyScheduleTargetStatusLabel(status)}
                        </span>
                      </div>
                    );
                  })}
                </dd>
              </div>
            )}
            {schedule.location && (
              <div>
                <dt className="text-xs font-medium text-slate-500">장소</dt>
                <dd className="mt-1 flex items-center gap-1 text-slate-900">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  {schedule.location}
                </dd>
              </div>
            )}
            {schedule.description && (
              <div>
                <dt className="text-xs font-medium text-slate-500">설명</dt>
                <dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">
                  {schedule.description}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </aside>
    </>
  );
}

function HolidayMonthPreview({
  holiday,
  muted = false,
  className = "",
  style,
}: {
  holiday: Holiday;
  muted?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`relative flex h-5 w-full min-w-0 items-center overflow-hidden rounded-md bg-rose-50 px-2 text-left text-[11px] font-semibold leading-5 text-rose-700 ${
        muted ? "opacity-60" : ""
      } ${className}`}
      style={{
        boxShadow: `inset 3px 0 0 ${holidayAccentColor}, 0 0 0 1px rgba(225,29,72,0.18)`,
        ...style,
      }}
      aria-label={`공휴일 ${holiday.name}`}
    >
      <span className="truncate">{holiday.name}</span>
    </div>
  );
}

const monthScheduleTopOffset = 36;
const monthScheduleLaneHeight = 24;
const monthGridMinHeight = "36rem";
const monthPreviewCardLimit = 2;

interface MonthScheduleSegment {
  schedule: Schedule;
  rowIndex: number;
  startIndex: number;
  endIndex: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

function layoutMonthScheduleSegments(
  schedules: Schedule[],
  cells: MonthCalendarCell[],
  holidaysByDate: Map<string, Holiday[]>,
): MonthScheduleSegment[] {
  const rowCount = Math.max(1, Math.ceil(cells.length / 7));
  const segmentsByRow = Array.from(
    { length: rowCount },
    () => [] as Array<Omit<MonthScheduleSegment, "lane">>,
  );
  const sortedSchedules = [...schedules].sort((first, second) => {
    const firstRange = scheduleDateRange(first);
    const secondRange = scheduleDateRange(second);
    const startDelta = firstRange.start.getTime() - secondRange.start.getTime();
    if (startDelta !== 0) return startDelta;

    const firstDuration = firstRange.end.getTime() - firstRange.start.getTime();
    const secondDuration =
      secondRange.end.getTime() - secondRange.start.getTime();
    if (firstDuration !== secondDuration) return secondDuration - firstDuration;

    return first.schedule_id - second.schedule_id;
  });

  for (const schedule of sortedSchedules) {
    const range = scheduleDateRange(schedule);

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const rowStartIndex = rowIndex * 7;
      const rowEndIndex = Math.min(rowStartIndex + 6, cells.length - 1);
      let startIndex = -1;
      let endIndex = -1;

      for (let index = rowStartIndex; index <= rowEndIndex; index += 1) {
        const cell = cells[index];
        if (!cell || !dateRangeOverlapsDay(range.start, range.end, cell.date)) {
          continue;
        }

        if (startIndex < 0) startIndex = index;
        endIndex = index;
      }

      if (startIndex < 0 || endIndex < 0) continue;

      const startCell = cells[startIndex];
      const endCell = cells[endIndex];
      const startBounds = dayBounds(startCell.date);
      const endBounds = dayBounds(endCell.date);

      segmentsByRow[rowIndex].push({
        schedule,
        rowIndex,
        startIndex,
        endIndex,
        continuesBefore: range.start < startBounds.start,
        continuesAfter: range.end > endBounds.end,
      });
    }
  }

  const preferredLaneByScheduleId = new Map<number, number>();
  const result: MonthScheduleSegment[] = [];

  segmentsByRow.forEach((rowSegments, rowIndex) => {
    const rowStartIndex = rowIndex * 7;
    const rowEndIndex = Math.min(rowStartIndex + 6, cells.length - 1);
    const occupiedLanesByIndex = new Map<number, Set<number>>();

    for (let index = rowStartIndex; index <= rowEndIndex; index += 1) {
      const cell = cells[index];
      if (!cell) continue;

      const holidayLaneCount = Math.min(
        holidaysByDate.get(toDateKey(cell.date))?.length ?? 0,
        monthPreviewCardLimit,
      );
      const occupiedLanes = new Set<number>();

      for (let lane = 0; lane < holidayLaneCount; lane += 1) {
        occupiedLanes.add(lane);
      }

      occupiedLanesByIndex.set(index, occupiedLanes);
    }

    const isLaneAvailable = (
      segment: Omit<MonthScheduleSegment, "lane">,
      lane: number,
    ) => {
      for (
        let index = segment.startIndex;
        index <= segment.endIndex;
        index += 1
      ) {
        if (occupiedLanesByIndex.get(index)?.has(lane)) {
          return false;
        }
      }

      return true;
    };

    const occupyLane = (
      segment: Omit<MonthScheduleSegment, "lane">,
      lane: number,
    ) => {
      for (
        let index = segment.startIndex;
        index <= segment.endIndex;
        index += 1
      ) {
        let occupiedLanes = occupiedLanesByIndex.get(index);
        if (!occupiedLanes) {
          occupiedLanes = new Set<number>();
          occupiedLanesByIndex.set(index, occupiedLanes);
        }
        occupiedLanes.add(lane);
      }
    };

    const sortedRowSegments = [...rowSegments].sort((first, second) => {
      if (first.startIndex !== second.startIndex) {
        return first.startIndex - second.startIndex;
      }

      const firstSpan = first.endIndex - first.startIndex;
      const secondSpan = second.endIndex - second.startIndex;
      if (firstSpan !== secondSpan) return secondSpan - firstSpan;

      return first.schedule.schedule_id - second.schedule.schedule_id;
    });

    for (const segment of sortedRowSegments) {
      const preferredLane = preferredLaneByScheduleId.get(
        segment.schedule.schedule_id,
      );
      let targetLane =
        preferredLane !== undefined && isLaneAvailable(segment, preferredLane)
          ? preferredLane
          : -1;

      if (targetLane < 0) {
        targetLane = 0;
        while (!isLaneAvailable(segment, targetLane)) {
          targetLane += 1;
        }
      }

      occupyLane(segment, targetLane);
      preferredLaneByScheduleId.set(segment.schedule.schedule_id, targetLane);
      result.push({ ...segment, lane: targetLane });
    }
  });

  return result.sort((first, second) => {
    if (first.rowIndex !== second.rowIndex) {
      return first.rowIndex - second.rowIndex;
    }
    if (first.lane !== second.lane) return first.lane - second.lane;
    return first.startIndex - second.startIndex;
  });
}

function countVisibleMonthSchedulesByDate(
  segments: MonthScheduleSegment[],
  cells: MonthCalendarCell[],
  contentCapacitiesByDate: Map<string, number>,
) {
  const counts = new Map<string, number>();

  for (const segment of segments) {
    if (
      !isMonthScheduleSegmentVisible(segment, cells, contentCapacitiesByDate)
    ) {
      continue;
    }

    for (
      let index = segment.startIndex;
      index <= segment.endIndex;
      index += 1
    ) {
      const cell = cells[index];
      if (!cell) continue;

      const key = toDateKey(cell.date);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

function isMonthScheduleSegmentVisible(
  segment: MonthScheduleSegment,
  cells: MonthCalendarCell[],
  contentCapacitiesByDate: Map<string, number>,
) {
  for (let index = segment.startIndex; index <= segment.endIndex; index += 1) {
    const cell = cells[index];
    if (!cell) return false;

    const contentCapacity = contentCapacitiesByDate.get(toDateKey(cell.date));
    if (segment.lane >= (contentCapacity ?? 0)) return false;
  }

  return true;
}

function MonthSchedulePreview({
  schedule,
  categoryColors,
  active,
  muted = false,
  readOnly = false,
  continuesBefore = false,
  continuesAfter = false,
  canResizeStart = true,
  canResizeEnd = true,
  className = "",
  style,
  onOpen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  schedule: Schedule;
  categoryColors: Map<number, string>;
  active?: boolean;
  muted?: boolean;
  readOnly?: boolean;
  continuesBefore?: boolean;
  continuesAfter?: boolean;
  canResizeStart?: boolean;
  canResizeEnd?: boolean;
  className?: string;
  style?: CSSProperties;
  onOpen: (anchorElement?: SchedulePanelAnchorElement) => void;
  onPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    kind: WeekScheduleInteractionKind,
  ) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
}) {
  const accentColor = scheduleAccentColor(schedule);
  const cardColor = scheduleCardColor(schedule, categoryColors);
  const title = normalizeScheduleTitle(schedule.title);
  const preview = isPreviewSchedule(schedule);
  const barShadow = [
    continuesBefore ? null : `inset 3px 0 0 ${accentColor}`,
    `0 0 0 1px ${colorWithAlpha(cardColor, "24")}`,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${schedule.title} ${readOnly ? "open" : "select"}`}
      onClick={(event) => {
        if (!readOnly) return;
        event.stopPropagation();
        onOpen(event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        event.stopPropagation();
        onOpen(event.currentTarget);
      }}
      onPointerDown={(event) => {
        if (readOnly) {
          event.stopPropagation();
          return;
        }
        onPointerDown(event, "move");
      }}
      onPointerMove={readOnly ? undefined : onPointerMove}
      onPointerUp={readOnly ? undefined : onPointerUp}
      onPointerCancel={readOnly ? undefined : onPointerCancel}
      className={`relative flex h-5 w-full min-w-0 touch-none items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[11px] font-semibold leading-5 transition hover:brightness-95 ${
        readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
      } ${
        schedule.is_completed ? "opacity-70" : ""
      } ${muted ? "opacity-60" : ""} ${
        active
          ? "ring-2 ring-violet-400 ring-offset-1"
          : "hover:ring-1 hover:ring-violet-200"
      } ${preview ? "border border-dashed" : ""} ${
        continuesBefore ? "rounded-l-none pl-1" : ""
      } ${continuesAfter ? "rounded-r-none pr-1" : ""} ${className}`}
      style={{
        backgroundColor: colorWithAlpha(cardColor, "18"),
        borderColor: preview ? colorWithAlpha(cardColor, "80") : undefined,
        color: accentColor,
        boxShadow: barShadow,
        ...style,
      }}
    >
      {!readOnly && (
        <>
          {canResizeStart && (
            <span
              role="presentation"
              className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize"
              onPointerDown={(event) => onPointerDown(event, "resize-left")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            />
          )}
          {canResizeEnd && (
            <span
              role="presentation"
              className="absolute inset-y-0 right-0 z-10 w-2 cursor-ew-resize"
              onPointerDown={(event) => onPointerDown(event, "resize-right")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
            />
          )}
        </>
      )}
      <PriorityDot schedule={schedule} />
      {preview && <PreviewPriorityBadge schedule={schedule} />}
      <span className="truncate">{title}</span>
    </div>
  );
}

function MonthScheduleGrid({
  cells,
  schedulesByDate,
  holidaysByDate,
  selectedKey,
  categoryColors,
  activeScheduleId,
  weekStart,
  onOpenDay,
  onOpenSchedule,
  onCreateDay,
  onScheduleTimeChange,
  onMoveWeek,
}: {
  cells: MonthCalendarCell[];
  schedulesByDate: Map<string, Schedule[]>;
  holidaysByDate: Map<string, Holiday[]>;
  selectedKey: string;
  categoryColors: Map<number, string>;
  activeScheduleId?: number | null;
  weekStart: WeekStartDay;
  onOpenDay: (date: Date) => void;
  onOpenSchedule: (
    schedule: Schedule,
    anchorElement?: SchedulePanelAnchorElement,
  ) => void;
  onCreateDay: (
    date: Date,
    anchorElement?: SchedulePanelAnchorElement,
    draft?: ScheduleCreateDraft,
  ) => void;
  onScheduleTimeChange: ScheduleTimeChangeHandler;
  onMoveWeek: (offset: number) => void;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const wheelAccumulatorRef = useRef(0);
  const wheelResetTimeoutRef = useRef<number | null>(null);
  const [interaction, setInteraction] =
    useState<WeekScheduleInteraction | null>(null);
  const rowCount = Math.max(1, Math.ceil(cells.length / 7));
  const [maxVisibleItems, setMaxVisibleItems] = useState(3);
  const weekdayHeaders = useMemo(
    () => orderedWeekdayLabels(weekStart),
    [weekStart],
  );

  useEffect(() => {
    return () => {
      if (wheelResetTimeoutRef.current !== null) {
        window.clearTimeout(wheelResetTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const updateVisibleItemCapacity = () => {
      const rowHeight = grid.getBoundingClientRect().height / rowCount;
      const rawSlots = Math.floor(
        (rowHeight - monthScheduleTopOffset + 4) / monthScheduleLaneHeight,
      );
      const nextSlots = Math.max(
        1,
        Math.min(4, Number.isFinite(rawSlots) ? rawSlots : 3),
      );
      setMaxVisibleItems((current) =>
        current === nextSlots ? current : nextSlots,
      );
    };

    updateVisibleItemCapacity();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateVisibleItemCapacity);
      return () => {
        window.removeEventListener("resize", updateVisibleItemCapacity);
      };
    }

    const resizeObserver = new ResizeObserver(updateVisibleItemCapacity);
    resizeObserver.observe(grid);
    return () => resizeObserver.disconnect();
  }, [rowCount]);

  const monthSchedules = useMemo(
    () => uniqueSchedulesFromMap(schedulesByDate),
    [schedulesByDate],
  );
  const displayMonthSchedules = useMemo(() => {
    if (!interaction) return monthSchedules;

    const changeOptions = {
      allDay: interaction.targetAllDay ?? interaction.schedule.all_day,
    };

    return monthSchedules.map((schedule) =>
      schedule.schedule_id === interaction.scheduleId
        ? scheduleWithDraftTime(
            schedule,
            interaction.start,
            interaction.end,
            changeOptions,
          )
        : schedule,
    );
  }, [interaction, monthSchedules]);
  const monthScheduleSegments = useMemo(
    () =>
      layoutMonthScheduleSegments(displayMonthSchedules, cells, holidaysByDate),
    [cells, displayMonthSchedules, holidaysByDate],
  );
  const maxPreviewContentSlots = Math.min(
    maxVisibleItems,
    monthPreviewCardLimit,
  );
  const contentCapacitiesByDate = useMemo(() => {
    let capacities = new Map(
      cells.map((cell) => [toDateKey(cell.date), maxPreviewContentSlots]),
    );
    const hiddenContentCapacity = Math.max(
      0,
      Math.min(maxPreviewContentSlots, maxVisibleItems - 1),
    );

    for (let pass = 0; pass < cells.length; pass += 1) {
      const visibleScheduleCounts = countVisibleMonthSchedulesByDate(
        monthScheduleSegments,
        cells,
        capacities,
      );
      let changed = false;

      for (const cell of cells) {
        const key = toDateKey(cell.date);
        const holidays = holidaysByDate.get(key) ?? [];
        const schedules = schedulesByDate.get(key) ?? [];
        const contentCapacity = capacities.get(key) ?? maxPreviewContentSlots;
        const visibleHolidayCount = Math.min(holidays.length, contentCapacity);
        const visibleScheduleCount = visibleScheduleCounts.get(key) ?? 0;
        const hasHiddenItems =
          holidays.length + schedules.length >
          visibleHolidayCount + visibleScheduleCount;

        if (!hasHiddenItems || contentCapacity <= hiddenContentCapacity) {
          continue;
        }

        capacities.set(key, hiddenContentCapacity);
        changed = true;
      }

      if (!changed) {
        break;
      }
    }

    return capacities;
  }, [
    cells,
    holidaysByDate,
    maxPreviewContentSlots,
    maxVisibleItems,
    monthScheduleSegments,
    schedulesByDate,
  ]);
  const visibleMonthScheduleCountByDate = useMemo(
    () =>
      countVisibleMonthSchedulesByDate(
        monthScheduleSegments,
        cells,
        contentCapacitiesByDate,
      ),
    [cells, contentCapacitiesByDate, monthScheduleSegments],
  );

  const isInteractiveCellTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    Boolean(target.closest("button,a,input,textarea,select,[role='button']"));

  const handleDayCellDoubleClick = (
    event: ReactMouseEvent<HTMLDivElement>,
    date: Date,
  ) => {
    if (isInteractiveCellTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    onCreateDay(date, event.currentTarget);
  };

  const beginMonthInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    kind: WeekScheduleInteractionKind,
    schedule: Schedule,
  ) => {
    if (isReadonlySchedule(schedule)) {
      event.stopPropagation();
      onOpenSchedule(schedule, event.currentTarget);
      return;
    }

    const grid = gridRef.current;
    if (!grid) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const { start, end } = schedule.all_day
      ? allDayDraftRange(schedule)
      : scheduleDateRange(schedule);
    setInteraction({
      kind,
      schedule,
      scheduleId: schedule.schedule_id,
      targetAllDay: schedule.all_day,
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
    const minDurationMs = interaction.targetAllDay
      ? allDayMinimumDurationMs
      : minTimedScheduleMinutes * 60 * 1000;

    let start = interaction.start;
    let end = interaction.end;

    if (interaction.kind === "move") {
      start = addDays(interaction.originalStart, dayDelta);
      end = addDays(interaction.originalEnd, dayDelta);
    } else if (interaction.kind === "resize-left") {
      const nextStart = addDays(interaction.originalStart, dayDelta);
      const maxStart = new Date(
        interaction.originalEnd.getTime() - minDurationMs,
      );
      start = nextStart > maxStart ? maxStart : nextStart;
      end = interaction.originalEnd;
    } else {
      const nextEnd = addDays(interaction.originalEnd, dayDelta);
      const minEnd = new Date(
        interaction.originalStart.getTime() + minDurationMs,
      );
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
      onOpenSchedule(finishedInteraction.schedule, event.currentTarget);
      return;
    }

    if (changed) {
      const nextAllDay =
        finishedInteraction.targetAllDay ??
        finishedInteraction.schedule.all_day;
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
        event.currentTarget,
      );
    }
  };

  const handleMonthWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return;

    const rawDelta = event.deltaY;
    if (rawDelta === 0) return;

    event.preventDefault();
    event.stopPropagation();

    const normalizedDelta =
      event.deltaMode === 1
        ? rawDelta * 40
        : event.deltaMode === 2
          ? rawDelta * window.innerHeight
          : rawDelta;
    const wheelStepThreshold = 48;

    wheelAccumulatorRef.current += normalizedDelta;

    if (wheelResetTimeoutRef.current !== null) {
      window.clearTimeout(wheelResetTimeoutRef.current);
    }

    if (Math.abs(wheelAccumulatorRef.current) >= wheelStepThreshold) {
      onMoveWeek(wheelAccumulatorRef.current > 0 ? 1 : -1);
      wheelAccumulatorRef.current = 0;
    }

    wheelResetTimeoutRef.current = window.setTimeout(() => {
      wheelAccumulatorRef.current = 0;
      wheelResetTimeoutRef.current = null;
    }, 160);
  };

  return (
    <div
      className="flex h-full min-h-[36rem] flex-col overflow-hidden bg-white"
      style={{ minHeight: monthGridMinHeight }}
      onWheel={handleMonthWheel}
    >
      <div className="grid shrink-0 grid-cols-7 border-b border-slate-100 bg-slate-50/95 text-center text-xs font-medium text-slate-500">
        {weekdayHeaders.map(({ day, label }) => (
          <span
            key={day}
            className={`py-2.5 ${
              day === 0 ? "text-rose-500" : day === 6 ? "text-sky-500" : ""
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <div
        ref={gridRef}
        className="relative grid min-h-0 flex-1 grid-cols-7"
        style={{
          gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
        }}
      >
        {cells.map(({ date: day, currentMonth }, index) => {
          const key = toDateKey(day);
          const holidays = holidaysByDate.get(key) ?? [];
          const isHoliday = holidays.length > 0;
          const schedules = schedulesByDate.get(key) ?? [];
          const selected = key === selectedKey;
          const today = isToday(day);
          const contentCapacity = contentCapacitiesByDate.get(key) ?? 0;
          const visibleHolidayCount = Math.min(
            holidays.length,
            contentCapacity,
          );
          const visibleScheduleCount =
            visibleMonthScheduleCountByDate.get(key) ?? 0;
          const hiddenCount =
            Math.max(0, holidays.length - visibleHolidayCount) +
            Math.max(0, schedules.length - visibleScheduleCount);
          const moreButtonToneClass = selected
            ? "bg-violet-50 text-violet-800 hover:bg-violet-100"
            : currentMonth
              ? isHoliday
                ? "bg-rose-50/30 text-rose-800 hover:bg-rose-50"
                : "bg-white text-slate-700 hover:bg-slate-50"
              : "bg-slate-50/70 text-slate-500 hover:bg-slate-100";

          return (
            <div
              key={key}
              onDoubleClick={(event) => handleDayCellDoubleClick(event, day)}
              className={`relative min-h-0 cursor-default overflow-hidden border-b border-r border-slate-100 p-1.5 transition hover:bg-violet-50/40 sm:p-2 ${
                (index + 1) % 7 === 0 ? "border-r-0" : ""
              } ${
                currentMonth
                  ? isHoliday && !selected
                    ? "bg-rose-50/30"
                    : "bg-white"
                  : "bg-slate-50/70 text-slate-300"
              } ${
                selected ? "bg-violet-50 ring-2 ring-inset ring-violet-400" : ""
              }`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenDay(day);
                }}
                className={`ml-auto flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold transition ${
                  selected
                    ? "bg-violet-600 text-white"
                    : today
                      ? "bg-violet-600 text-white"
                      : currentMonth
                        ? isHoliday
                          ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                          : "text-slate-800 hover:bg-slate-100"
                        : "text-slate-300 hover:bg-slate-100"
                }`}
              >
                {day.getDate()}
              </button>
              <div className="group/month-add-zone absolute left-1.5 right-10 top-1.5 z-10 h-6 sm:left-2 sm:top-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCreateDay(day, event.currentTarget);
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-md px-0 text-xs font-semibold text-violet-700 opacity-100 transition hover:bg-violet-50 focus-visible:opacity-100 sm:w-auto sm:px-2 sm:opacity-0 sm:group-hover/month-add-zone:opacity-100"
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  추가
                </button>
              </div>
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenDay(day);
                  }}
                  className={`absolute bottom-1.5 left-1.5 right-1.5 z-30 truncate rounded px-1 py-0.5 text-left text-xs font-medium transition sm:left-2 sm:right-2 ${moreButtonToneClass}`}
                >
                  +{hiddenCount}개 더보기
                </button>
              )}
            </div>
          );
        })}
        <div
          className="pointer-events-none absolute inset-0 z-20 grid grid-cols-7"
          style={{
            gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
          }}
        >
          {cells.flatMap(({ date: day, currentMonth }, index) => {
            const key = toDateKey(day);
            const holidays = holidaysByDate.get(key) ?? [];
            const contentCapacity = contentCapacitiesByDate.get(key) ?? 0;
            const visibleHolidays = holidays.slice(0, contentCapacity);

            return visibleHolidays.map((holiday, holidayIndex) => (
              <HolidayMonthPreview
                key={`month-holiday-${holiday.holiday_id}-${key}`}
                holiday={holiday}
                muted={!currentMonth}
                className="pointer-events-none z-20"
                style={{
                  alignSelf: "start",
                  gridColumn: `${(index % 7) + 1} / span 1`,
                  gridRow: `${Math.floor(index / 7) + 1} / span 1`,
                  marginLeft: 4,
                  marginRight: 4,
                  marginTop:
                    monthScheduleTopOffset +
                    holidayIndex * monthScheduleLaneHeight,
                  width: "auto",
                }}
              />
            ));
          })}
          {monthScheduleSegments.map((segment) => {
            if (
              !isMonthScheduleSegmentVisible(
                segment,
                cells,
                contentCapacitiesByDate,
              )
            ) {
              return null;
            }

            const { schedule } = segment;
            const startColumn = segment.startIndex % 7;
            const span = segment.endIndex - segment.startIndex + 1;
            const top =
              monthScheduleTopOffset + segment.lane * monthScheduleLaneHeight;
            const firstCell = cells[segment.startIndex];
            const selected =
              activeScheduleId === schedule.schedule_id ||
              interaction?.scheduleId === schedule.schedule_id;

            return (
              <MonthSchedulePreview
                key={`${schedule.schedule_id}-${segment.rowIndex}-${segment.startIndex}`}
                schedule={schedule}
                categoryColors={categoryColors}
                active={selected}
                muted={!firstCell?.currentMonth}
                readOnly={isReadonlySchedule(schedule)}
                continuesBefore={segment.continuesBefore}
                continuesAfter={segment.continuesAfter}
                canResizeStart={!segment.continuesBefore}
                canResizeEnd={!segment.continuesAfter}
                className={`pointer-events-auto ${selected ? "z-30" : "z-20"}`}
                style={{
                  alignSelf: "start",
                  gridColumn: `${startColumn + 1} / span ${span}`,
                  gridRow: `${segment.rowIndex + 1} / span 1`,
                  marginLeft: 4,
                  marginRight: 4,
                  marginTop: top,
                  width: "auto",
                }}
                onOpen={(anchorElement) =>
                  onOpenSchedule(schedule, anchorElement)
                }
                onPointerDown={(event, kind) =>
                  beginMonthInteraction(event, kind, schedule)
                }
                onPointerMove={updateMonthInteraction}
                onPointerUp={endMonthInteraction}
                onPointerCancel={() => setInteraction(null)}
              />
            );
          })}
        </div>
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
const allDayMinimumDurationMs = allDayLikeThresholdMs - 1;

type WeekScheduleInteractionKind =
  | "move"
  | "resize-left"
  | "resize-right"
  | "resize-top"
  | "resize-bottom";
type WeekScheduleInteractionSurface = "time" | "all-day";

interface WeekScheduleDraft {
  scheduleId: number;
  start: Date;
  end: Date;
}

interface WeekScheduleInteraction extends WeekScheduleDraft {
  kind: WeekScheduleInteractionKind;
  surface?: WeekScheduleInteractionSurface;
  targetAllDay?: boolean;
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

interface WeekCreateInteraction {
  surface: WeekScheduleInteractionSurface;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  dragged: boolean;
  anchorStart: Date;
  start: Date;
  end: Date;
}

interface WeekCreateContextMenu {
  left: number;
  top: number;
  clientX: number;
  clientY: number;
  start: Date;
  end: Date;
  allDay: boolean;
}

interface ScheduleBlockMetrics {
  left: number;
  width: number;
  top: number;
  height: number;
}

const scheduleBlockOverlapTolerance = 0.001;

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
  const allDay =
    options?.allDay ??
    (schedule.all_day || shouldUseAllDayLaneForRange(start, end));

  return {
    ...schedule,
    start_datetime: toOffsetISOString(start),
    end_datetime: toOffsetISOString(end),
    all_day: allDay,
  };
}

function formatHourLabel(hour: number) {
  return `${pad(hour)}:00`;
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
  _categoryColors?: Map<number, string>,
) {
  if (isCompanySchedule(schedule)) return companyScheduleAccent;

  return (
    scheduleTypeSelectMeta[schedule.schedule_type]?.color ??
    (schedule.schedule_type === "deadline" ? "#f43f5e" : "#7c3aed")
  );
}

function scheduleCardColor(
  schedule: Schedule,
  categoryColors: Map<number, string>,
) {
  if (isCompanySchedule(schedule)) return companyScheduleAccent;

  return (
    (schedule.category_id
      ? categoryColors.get(schedule.category_id)
      : undefined) ?? fallbackCategoryColor
  );
}

function schedulePriorityColor(schedule: Schedule) {
  const priority = schedule.priority ?? "medium";
  return prioritySelectMeta[priority]?.color ?? prioritySelectMeta.medium.color;
}

function PriorityDot({
  schedule,
  className = "",
}: {
  schedule: Schedule;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10 ${className}`}
      style={{ backgroundColor: schedulePriorityColor(schedule) }}
    />
  );
}

function PreviewPriorityBadge({
  schedule,
  className = "",
}: {
  schedule: Schedule;
  className?: string;
}) {
  const classificationSettings = useClassificationSettings();
  const priority = schedule.priority ?? "medium";
  const label = getClassificationLabel(
    classificationSettings,
    "taskPriorities",
    priority,
  );

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded bg-white/75 px-1 text-[10px] font-semibold ${className}`}
    >
      중요도 {label}
    </span>
  );
}

function weekdayToneClass(day: Date, selected = false, holiday = false) {
  if (isToday(day)) {
    return "bg-violet-50/95 text-violet-800 shadow-[inset_0_-2px_0_rgba(124,58,237,0.45)]";
  }
  if (holiday || day.getDay() === 0) {
    return selected
      ? "bg-rose-50/90 text-rose-700"
      : "bg-rose-50/45 text-rose-600";
  }
  if (day.getDay() === 6) {
    return selected ? "bg-sky-50/90 text-sky-700" : "bg-sky-50/45 text-sky-600";
  }
  return selected ? "bg-violet-50/80 text-slate-950" : "text-slate-500";
}

function weekdayColumnClass(day: Date, selected = false, holiday = false) {
  if (isToday(day)) {
    return "bg-violet-50/35 shadow-[inset_2px_0_0_rgba(124,58,237,0.18),inset_-2px_0_0_rgba(124,58,237,0.18)]";
  }
  if (selected) return "bg-violet-50/20";
  if (holiday || day.getDay() === 0) return "bg-rose-50/20";
  if (day.getDay() === 6) return "bg-sky-50/20";
  return "";
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

function allDayDraftRange(schedule: Schedule) {
  const { start, end } = scheduleDateRange(schedule);
  return {
    start: dayBounds(start).start,
    end: dayBounds(end).end,
  };
}

function timedDropDurationMs(schedule: Schedule) {
  const duration = scheduleDurationMs(schedule);
  if (!schedule.all_day && duration < allDayLikeThresholdMs) {
    return Math.max(minTimedScheduleMinutes * 60 * 1000, duration);
  }
  return 60 * 60 * 1000;
}

function scheduleDurationMs(schedule: Schedule) {
  const { start, end } = scheduleDateRange(schedule);
  return end.getTime() - start.getTime();
}

function dateRangeSpansMultipleDays(start: Date, end: Date) {
  return toDateKey(start) !== toDateKey(end);
}

function shouldUseAllDayLaneForRange(start: Date, end?: Date | null) {
  if (!end) return false;
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false;
  }
  if (end <= start) return false;

  return (
    dateRangeSpansMultipleDays(start, end) ||
    end.getTime() - start.getTime() >= allDayLikeThresholdMs
  );
}

function shouldUseAllDayLaneForForm(form: ScheduleFormState) {
  const start = new Date(form.start_local);
  const end = form.end_local ? new Date(form.end_local) : null;
  return form.all_day || shouldUseAllDayLaneForRange(start, end);
}

function scheduleCreateDraftForTimedRange(start: Date, end: Date) {
  if (shouldUseAllDayLaneForRange(start, end)) {
    return allDayCreateDraftForRange(start, end);
  }

  return { start, end, allDay: false };
}

function isAllDayLikeSchedule(schedule: Schedule) {
  const { start, end } = scheduleDateRange(schedule);
  return (
    schedule.all_day ||
    shouldUseAllDayLaneForRange(start, end) ||
    scheduleDurationMs(schedule) >= allDayLikeThresholdMs
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

function groupSchedulesByOverlappingDate(schedules: Schedule[]) {
  const grouped = new Map<string, Schedule[]>();

  for (const schedule of schedules) {
    const { start, end } = scheduleDateRange(schedule);
    const cursor = dayBounds(start).start;
    const lastDay = dayBounds(end).start;
    let guard = 0;

    while (cursor <= lastDay && guard < 370) {
      const key = toDateKey(cursor);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(schedule);
      else grouped.set(key, [schedule]);

      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }

  for (const bucket of grouped.values()) {
    bucket.sort(
      (first, second) =>
        new Date(first.start_datetime).getTime() -
          new Date(second.start_datetime).getTime() ||
        first.schedule_id - second.schedule_id,
    );
  }

  return grouped;
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
  const rawStartIndex = weekDates.findIndex(
    (day) => toDateKey(day) === startKey,
  );
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
    first.left < secondRight - scheduleBlockOverlapTolerance &&
    firstRight > second.left + scheduleBlockOverlapTolerance &&
    first.top < secondBottom - scheduleBlockOverlapTolerance &&
    firstBottom > second.top + scheduleBlockOverlapTolerance
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
      (item): item is Omit<TimedScheduleLayout, "lane" | "laneCount"> =>
        item !== null,
    );

  const singleDayBlocks = blocks.filter(
    (block) => toDateKey(block.start) === toDateKey(block.end),
  );
  const lanesByScheduleId = new Map<
    number,
    { lane: number; laneCount: number }
  >();

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
    const lanes: (typeof singleDayBlocks)[] = [];

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
        .map((day, index) => (scheduleOverlapsDay(schedule, day) ? index : -1))
        .filter((index) => index >= 0);
      if (indexes.length === 0) return null;

      return {
        schedule,
        startIndex: Math.min(...indexes),
        endIndex: Math.max(...indexes),
      };
    })
    .filter(
      (block): block is Omit<AllDayScheduleLayout, "lane" | "laneCount"> =>
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
    const laneIndex = lanes.findIndex(
      (lane) => lane.endIndex < block.startIndex,
    );
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
  holidaysByDate,
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
  holidaysByDate: Map<string, Holiday[]>;
  selectedKey: string;
  categoryColors: Map<number, string>;
  activeScheduleId?: number | null;
  onOpenDay: (date: Date) => void;
  onOpenSchedule: (
    schedule: Schedule,
    anchorElement?: SchedulePanelAnchorElement,
  ) => void;
  onCreateDay: (
    date: Date,
    anchorElement?: SchedulePanelAnchorElement,
    draft?: ScheduleCreateDraft,
  ) => void;
  onScheduleTimeChange: ScheduleTimeChangeHandler;
}) {
  const dayCount = weekDates.length;
  const now = new Date();
  const todayKey = toDateKey(now);
  const todayIndex = weekDates.findIndex((day) => toDateKey(day) === todayKey);
  const nowTop = (minuteOfDay(now) / 60) * weekHourHeight;
  const currentTimeColumnLeft =
    todayIndex >= 0 && dayCount > 0 ? (todayIndex / dayCount) * 100 : 0;
  const currentTimeColumnWidth = dayCount > 0 ? 100 / dayCount : 100;
  const visibleRangeKey = weekDates.map((day) => toDateKey(day)).join("|");
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const allDayGridRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dropSettleTimeoutRef = useRef<number | null>(null);
  const lastAutoScrolledRangeKeyRef = useRef<string | null>(null);
  const [interaction, setInteraction] =
    useState<WeekScheduleInteraction | null>(null);
  const [createInteraction, setCreateInteraction] =
    useState<WeekCreateInteraction | null>(null);
  const [createContextMenu, setCreateContextMenu] =
    useState<WeekCreateContextMenu | null>(null);
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
  const holidayLaneCount = useMemo(
    () =>
      weekDates.reduce(
        (count, day) =>
          Math.max(count, holidaysByDate.get(toDateKey(day))?.length ?? 0),
        0,
      ),
    [holidaysByDate, weekDates],
  );
  const scheduleAllDayLaneCount = allDayScheduleLayouts.reduce(
    (count, layout) => Math.max(count, layout.laneCount),
    0,
  );
  const allDayRowHeight = Math.max(
    42,
    30 + Math.max(1, holidayLaneCount + scheduleAllDayLaneCount) * 24,
  );
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
    if (isReadonlySchedule(schedule)) {
      event.stopPropagation();
      onOpenSchedule(schedule, event.currentTarget);
      return;
    }

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
    const dayDelta = Math.round(rawOffsetX / columnWidth);
    const minuteDelta = snapToWeekGrid((rawOffsetY / weekHourHeight) * 60);
    const duration = Math.max(
      minTimedScheduleMinutes * 60 * 1000,
      interaction.originalEnd.getTime() - interaction.originalStart.getTime(),
    );
    const minDurationMs = minTimedScheduleMinutes * 60 * 1000;
    const minStart = new Date(weekDates[0]);
    minStart.setHours(0, 0, 0, 0);
    const maxStart = new Date(weekDates[weekDates.length - 1]);
    maxStart.setHours(23, 59, 0, 0);

    let start = interaction.start;
    let end = interaction.end;
    let previewOffsetX = interaction.previewOffsetX;
    let previewOffsetY = interaction.previewOffsetY;

    if (interaction.kind === "move") {
      start = addMinutes(
        addDays(interaction.originalStart, dayDelta),
        minuteDelta,
      );
      start = clampDate(start, minStart, maxStart);
      end = new Date(start.getTime() + duration);
      const originalMetrics = scheduleBlockMetricsFromDates(
        interaction.originalStart,
        interaction.originalEnd,
        weekDates,
      );

      if (originalMetrics) {
        const leftPx =
          (originalMetrics.left / 100) * interaction.gridRect.width;
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
        interaction.originalEnd.getTime() - minDurationMs,
      );
      start = clampDate(
        addDays(interaction.originalStart, dayDelta),
        minStart,
        maxResizeStart,
      );
      end = interaction.originalEnd;
    } else if (interaction.kind === "resize-right") {
      const minResizeEnd = new Date(
        interaction.originalStart.getTime() + minDurationMs,
      );
      end = addDays(interaction.originalEnd, dayDelta);
      if (end < minResizeEnd) end = minResizeEnd;
      start = interaction.originalStart;
    } else if (interaction.kind === "resize-top") {
      const startDay = dayBounds(interaction.originalStart);
      const maxResizeStart = new Date(
        interaction.originalEnd.getTime() - minDurationMs,
      );
      const maxResizeStartInDay =
        maxResizeStart < startDay.end ? maxResizeStart : startDay.end;
      start = clampDate(
        addMinutes(interaction.originalStart, minuteDelta),
        startDay.start,
        maxResizeStartInDay,
      );
      end = interaction.originalEnd;
    } else {
      const endDay = dayBounds(interaction.originalEnd);
      const minResizeEnd = new Date(
        interaction.originalStart.getTime() + minDurationMs,
      );
      const maxResizeEnd =
        endDay.end < minResizeEnd ? minResizeEnd : endDay.end;
      end = clampDate(
        addMinutes(interaction.originalEnd, minuteDelta),
        minResizeEnd,
        maxResizeEnd,
      );
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
      onOpenSchedule(finishedInteraction.schedule, event.currentTarget);
      return;
    }

    if (changed) {
      const targetOffset =
        finishedInteraction.kind === "move"
          ? movePreviewOffsetToTarget(finishedInteraction)
          : null;

      setInteraction({
        ...finishedInteraction,
        previewOffsetX: targetOffset?.x ?? finishedInteraction.previewOffsetX,
        previewOffsetY: targetOffset?.y ?? finishedInteraction.previewOffsetY,
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
        event.currentTarget,
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
    if (isReadonlySchedule(schedule)) {
      event.stopPropagation();
      onOpenSchedule(schedule, event.currentTarget);
      return;
    }

    const grid = allDayGridRef.current;
    if (!grid) return;

    if (dropSettleTimeoutRef.current !== null) {
      window.clearTimeout(dropSettleTimeoutRef.current);
      dropSettleTimeoutRef.current = null;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const { start, end } = allDayDraftRange(schedule);
    setInteraction({
      kind,
      surface: "all-day",
      schedule,
      scheduleId: schedule.schedule_id,
      targetAllDay: true,
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

  const updateAllDayInteraction = (event: ReactPointerEvent<HTMLElement>) => {
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
    const rawOffsetY = event.clientY - interaction.startClientY;
    const dayDelta = Math.round(rawOffsetX / columnWidth);
    const rangeStart = dayBounds(weekDates[0]).start;
    const rangeEnd = dayBounds(weekDates[weekDates.length - 1]).start;
    const minDurationMs = allDayMinimumDurationMs;
    const duration = Math.max(
      minDurationMs,
      interaction.originalEnd.getTime() - interaction.originalStart.getTime(),
    );

    let start = interaction.start;
    let end = interaction.end;
    let targetAllDay = true;

    const timedGrid = gridRef.current;
    const timedGridRect = timedGrid?.getBoundingClientRect();
    const isDroppingToTimeGrid =
      interaction.kind === "move" &&
      !!timedGridRect &&
      event.clientY >= timedGridRect.top;

    if (isDroppingToTimeGrid) {
      start = dateFromGridPointer(event, interaction.originalStart);
      end = new Date(
        start.getTime() + timedDropDurationMs(interaction.schedule),
      );
      targetAllDay = false;
    } else if (interaction.kind === "move") {
      start = clampDate(
        addDays(interaction.originalStart, dayDelta),
        rangeStart,
        rangeEnd,
      );
      end = new Date(start.getTime() + duration);
    } else if (interaction.kind === "resize-left") {
      const maxStart = new Date(
        interaction.originalEnd.getTime() - minDurationMs,
      );
      start = clampDate(
        addDays(interaction.originalStart, dayDelta),
        rangeStart,
        maxStart < rangeStart ? rangeStart : maxStart,
      );
      end = interaction.originalEnd;
    } else {
      const nextEnd = addDays(interaction.originalEnd, dayDelta);
      const minEnd = new Date(
        interaction.originalStart.getTime() + minDurationMs,
      );
      start = interaction.originalStart;
      end = nextEnd < minEnd ? minEnd : nextEnd;
    }

    setInteraction((current) =>
      current && current.pointerId === event.pointerId
        ? {
            ...current,
            start,
            end,
            targetAllDay,
            previewOffsetX: targetAllDay ? rawOffsetX : 0,
            previewOffsetY: targetAllDay ? 0 : rawOffsetY,
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
      onOpenSchedule(finishedInteraction.schedule, event.currentTarget);
      return;
    }

    if (changed) {
      const nextAllDay = finishedInteraction.targetAllDay ?? true;
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
        event.currentTarget,
      );
    }
  };

  const dateFromGridPointer = (
    event: Pick<ReactMouseEvent<HTMLElement>, "clientX" | "clientY">,
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
    date.setHours(Math.floor(snappedMinutes / 60), snappedMinutes % 60, 0, 0);
    return date;
  };

  const normalizeTimedCreateRange = (
    anchorStart: Date,
    pointerDate: Date,
    dragged: boolean,
  ) => {
    if (!dragged) {
      return { start: anchorStart, end: addMinutes(anchorStart, 30) };
    }

    const minDurationMs = minTimedScheduleMinutes * 60 * 1000;
    const rawStart = pointerDate < anchorStart ? pointerDate : anchorStart;
    const rawEnd = pointerDate < anchorStart ? anchorStart : pointerDate;
    const end =
      rawEnd.getTime() - rawStart.getTime() < minDurationMs
        ? new Date(rawStart.getTime() + minDurationMs)
        : rawEnd;

    return { start: rawStart, end };
  };

  const allDayIndexFromPointer = (
    event: Pick<ReactPointerEvent<HTMLElement>, "clientX">,
    fallbackIndex: number,
  ) => {
    const grid = allDayGridRef.current;
    if (!grid) return fallbackIndex;

    const rect = grid.getBoundingClientRect();
    const columnWidth = rect.width / dayCount;
    return Math.min(
      dayCount - 1,
      Math.max(0, Math.floor((event.clientX - rect.left) / columnWidth)),
    );
  };

  const normalizeAllDayCreateRange = (
    anchorStart: Date,
    pointerIndex: number,
  ) => {
    const anchorIndex = weekDates.findIndex(
      (day) => toDateKey(day) === toDateKey(anchorStart),
    );
    const safeAnchorIndex = anchorIndex >= 0 ? anchorIndex : 0;
    const startIndex = Math.min(safeAnchorIndex, pointerIndex);
    const endIndex = Math.max(safeAnchorIndex, pointerIndex);
    const start = dayBounds(weekDates[startIndex] ?? anchorStart).start;
    const end = dayBounds(weekDates[endIndex] ?? anchorStart).end;

    return { start, end };
  };

  const beginTimedCreate = (
    event: ReactPointerEvent<HTMLElement>,
    fallbackDay: Date,
  ) => {
    if (event.button !== 0) return;

    const start = dateFromGridPointer(event, fallbackDay);
    const end = addMinutes(start, 30);

    event.preventDefault();
    event.stopPropagation();

    event.currentTarget.setPointerCapture(event.pointerId);

    setCreateInteraction({
      surface: "time",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      dragged: false,
      anchorStart: start,
      start,
      end,
    });
  };

  const updateTimedCreate = (
    event: ReactPointerEvent<HTMLElement>,
    fallbackDay: Date,
  ) => {
    if (
      !createInteraction ||
      createInteraction.pointerId !== event.pointerId ||
      createInteraction.surface !== "time"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const dragged =
      Math.abs(event.clientX - createInteraction.startClientX) >= 4 ||
      Math.abs(event.clientY - createInteraction.startClientY) >= 4;
    const pointerDate = dateFromGridPointer(event, fallbackDay);
    const { start, end } = normalizeTimedCreateRange(
      createInteraction.anchorStart,
      pointerDate,
      dragged,
    );

    setCreateInteraction((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, dragged: current.dragged || dragged, start, end }
        : current,
    );
  };

  const endTimedCreate = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      !createInteraction ||
      createInteraction.pointerId !== event.pointerId ||
      createInteraction.surface !== "time"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const finishedInteraction = createInteraction;
    const draft = scheduleCreateDraftForTimedRange(
      finishedInteraction.start,
      finishedInteraction.end,
    );
    setCreateInteraction(null);
    onCreateDay(
      draft.start,
      { clientX: event.clientX, clientY: event.clientY },
      draft,
    );
  };

  const beginAllDayCreate = (
    event: ReactPointerEvent<HTMLElement>,
    day: Date,
  ) => {
    if (event.button !== 0) return;

    const start = dayBounds(day).start;
    const end = dayBounds(day).end;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    setCreateInteraction({
      surface: "all-day",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      dragged: false,
      anchorStart: start,
      start,
      end,
    });
  };

  const updateAllDayCreate = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      !createInteraction ||
      createInteraction.pointerId !== event.pointerId ||
      createInteraction.surface !== "all-day"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const dragged =
      Math.abs(event.clientX - createInteraction.startClientX) >= 4 ||
      Math.abs(event.clientY - createInteraction.startClientY) >= 4;
    const pointerIndex = allDayIndexFromPointer(event, 0);
    const { start, end } = normalizeAllDayCreateRange(
      createInteraction.anchorStart,
      pointerIndex,
    );

    setCreateInteraction((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, dragged: current.dragged || dragged, start, end }
        : current,
    );
  };

  const endAllDayCreate = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      !createInteraction ||
      createInteraction.pointerId !== event.pointerId ||
      createInteraction.surface !== "all-day"
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const finishedInteraction = createInteraction;
    const dragged =
      finishedInteraction.dragged ||
      Math.abs(event.clientX - finishedInteraction.startClientX) >= 4 ||
      Math.abs(event.clientY - finishedInteraction.startClientY) >= 4;

    setCreateInteraction(null);
    if (!dragged) return;

    onCreateDay(finishedInteraction.start, event.currentTarget, {
      start: finishedInteraction.start,
      end: finishedInteraction.end,
      allDay: true,
    });
  };

  const panelAnchorFromPointer = (
    event: ReactMouseEvent<HTMLElement>,
  ): SchedulePanelAnchorElement => ({
    clientX: event.clientX,
    clientY: event.clientY,
  });

  const showCreateContextMenu = (
    event: ReactMouseEvent<HTMLElement>,
    fallbackDay: Date,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const start = dateFromGridPointer(event, fallbackDay);
    const menuWidth = 164;
    const menuHeight = 44;
    const margin = 8;

    setCreateContextMenu({
      left: Math.min(
        window.innerWidth - menuWidth - margin,
        Math.max(margin, event.clientX),
      ),
      top: Math.min(
        window.innerHeight - menuHeight - margin,
        Math.max(margin, event.clientY),
      ),
      clientX: event.clientX,
      clientY: event.clientY,
      start,
      end: addMinutes(start, 30),
      allDay: false,
    });
  };

  useEffect(() => {
    if (!createContextMenu) return;

    const closeMenu = () => setCreateContextMenu(null);
    const closeOnKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };

    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("keydown", closeOnKey);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("keydown", closeOnKey);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [createContextMenu]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || todayIndex < 0) return;
    if (lastAutoScrolledRangeKeyRef.current === visibleRangeKey) return;

    lastAutoScrolledRangeKeyRef.current = visibleRangeKey;
    const frame = requestAnimationFrame(() => {
      container.scrollTop = Math.max(0, nowTop - container.clientHeight / 2);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [todayIndex, visibleRangeKey]);

  useEffect(
    () => () => {
      if (dropSettleTimeoutRef.current !== null) {
        window.clearTimeout(dropSettleTimeoutRef.current);
      }
    },
    [],
  );

  return (
    <div
      ref={scrollContainerRef}
      className="scrollbar-none h-full overflow-auto bg-white"
    >
      {createContextMenu && (
        <div
          className="fixed z-[70] min-w-40 rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-slate-900/10"
          style={{
            left: createContextMenu.left,
            top: createContextMenu.top,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
            onClick={() => {
              const menu = createContextMenu;
              setCreateContextMenu(null);
              onCreateDay(
                menu.start,
                { clientX: menu.clientX, clientY: menu.clientY },
                {
                  start: menu.start,
                  end: menu.end,
                  allDay: menu.allDay,
                },
              );
            }}
          >
            <Plus className="h-4 w-4" />이 시간에 일정 추가
          </button>
        </div>
      )}
      <div className="min-w-0">
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
            const isHoliday = (holidaysByDate.get(key)?.length ?? 0) > 0;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onOpenDay(day)}
                className={`flex h-11 items-center justify-center gap-1 border-r border-slate-100 text-xs font-medium transition last:border-r-0 hover:bg-white ${weekdayToneClass(day, selected, isHoliday)}`}
              >
                <span>{weekdayLabels[day.getDay()]}</span>
                <span
                  className={
                    today
                      ? "flex h-6 min-w-6 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-semibold text-white"
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
            종일
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
              const isHoliday = (holidaysByDate.get(key)?.length ?? 0) > 0;

              return (
                <div
                  key={`all-day-${key}`}
                  onPointerDown={(event) => beginAllDayCreate(event, day)}
                  onPointerMove={updateAllDayCreate}
                  onPointerUp={endAllDayCreate}
                  onPointerCancel={(event) => {
                    if (createInteraction?.pointerId === event.pointerId) {
                      setCreateInteraction(null);
                    }
                  }}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const bounds = dayBounds(day);
                    onCreateDay(day, panelAnchorFromPointer(event), {
                      start: bounds.start,
                      end: bounds.end,
                      allDay: true,
                    });
                  }}
                  className={`border-r border-slate-100 px-1.5 py-1.5 last:border-r-0 ${weekdayColumnClass(day, selectedKey === key, isHoliday)}`}
                >
                  <button
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      const bounds = dayBounds(day);
                      onCreateDay(day, event.currentTarget, {
                        start: bounds.start,
                        end: bounds.end,
                        allDay: true,
                      });
                    }}
                    className="inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {weekDates.flatMap((day, dayIndex) => {
              const key = toDateKey(day);
              const holidays = holidaysByDate.get(key) ?? [];

              return holidays.map((holiday, holidayIndex) => (
                <div
                  key={`week-holiday-${holiday.holiday_id}-${key}`}
                  className="pointer-events-none absolute z-20 h-5 overflow-hidden rounded-md bg-rose-50 px-2 text-left text-[11px] font-semibold leading-5 text-rose-700"
                  style={{
                    top: 26 + holidayIndex * 24,
                    left: `calc(${(dayIndex / dayCount) * 100}% + 4px)`,
                    width: `calc(${(1 / dayCount) * 100}% - 8px)`,
                    boxShadow: `inset 3px 0 0 ${holidayAccentColor}, 0 0 0 1px rgba(225,29,72,0.18)`,
                  }}
                  aria-label={`공휴일 ${holiday.name}`}
                >
                  <span>{holiday.name}</span>
                </div>
              ));
            })}
            {createInteraction?.surface === "all-day" &&
              createInteraction.dragged &&
              (() => {
                const activeSpan = allDaySpanIndexesFromDates(
                  createInteraction.start,
                  createInteraction.end,
                  weekDates,
                );
                if (!activeSpan) return null;

                const span = activeSpan.endIndex - activeSpan.startIndex + 1;

                return (
                  <div
                    className="pointer-events-none absolute top-1.5 z-40 h-7 rounded-md bg-violet-100/90 px-2 text-left text-[11px] font-semibold leading-7 text-violet-800 shadow-sm ring-1 ring-violet-300"
                    style={{
                      left: `calc(${(activeSpan.startIndex / dayCount) * 100}% + 4px)`,
                      width: `calc(${(span / dayCount) * 100}% - 8px)`,
                    }}
                  >
                    일정 배치
                  </div>
                );
              })()}
            {allDayScheduleLayouts.map((layout) => {
              const { schedule, startIndex, endIndex, lane } = layout;
              const accentColor = scheduleAccentColor(schedule);
              const cardColor = scheduleCardColor(schedule, categoryColors);
              const activeDraft =
                interaction?.surface === "all-day" &&
                interaction.scheduleId === schedule.schedule_id
                  ? interaction
                  : null;
              const activeSpan =
                activeDraft?.targetAllDay === false
                  ? null
                  : activeDraft
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
              const preview = isPreviewSchedule(schedule);
              const readOnly = isReadonlySchedule(schedule);

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
                      onOpenSchedule(schedule, event.currentTarget);
                    }
                  }}
                  className={`absolute h-5 touch-none overflow-hidden rounded-md px-2 pr-4 text-left text-[11px] font-semibold leading-5 transition-[left,width,box-shadow,filter,opacity,transform] duration-150 ease-out hover:brightness-95 focus:outline-none ${
                    activeDraft
                      ? "z-40 scale-[1.01] cursor-grabbing shadow-lg"
                      : readOnly
                        ? "z-20 cursor-pointer"
                        : "z-20 cursor-grab"
                  } ${
                    selected
                      ? "ring-2 ring-violet-400 ring-offset-1"
                      : "hover:ring-1 hover:ring-violet-200"
                  } ${preview ? "border border-dashed" : ""}`}
                  style={{
                    top: 26 + holidayLaneCount * 24 + lane * 24,
                    left: `calc(${(displayStartIndex / dayCount) * 100}% + 4px)`,
                    width: `calc(${(span / dayCount) * 100}% - 8px)`,
                    backgroundColor: colorWithAlpha(cardColor, "18"),
                    borderColor: preview
                      ? colorWithAlpha(cardColor, "80")
                      : undefined,
                    color: accentColor,
                    boxShadow: `inset 3px 0 0 ${accentColor}, 0 0 0 1px ${colorWithAlpha(cardColor, "30")}`,
                  }}
                >
                  {!readOnly && (
                    <>
                      <span
                        role="presentation"
                        className="absolute inset-y-0 left-0 z-20 w-3 cursor-ew-resize rounded-l-md transition hover:bg-white/45"
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
                        className="absolute inset-y-0 right-0 z-20 w-3 cursor-ew-resize rounded-r-md transition hover:bg-white/45"
                        onPointerDown={(event) =>
                          beginAllDayInteraction(
                            event,
                            "resize-right",
                            schedule,
                          )
                        }
                        onPointerMove={updateAllDayInteraction}
                        onPointerUp={endAllDayInteraction}
                        onPointerCancel={(event) => {
                          if (interaction?.pointerId === event.pointerId) {
                            setInteraction(null);
                          }
                        }}
                      />
                    </>
                  )}
                  <PriorityDot
                    schedule={schedule}
                    className="pointer-events-none mr-1 align-middle"
                  />
                  {readOnly && (
                    <span className="pointer-events-none mr-1 rounded bg-white/60 px-1 text-[10px]">
                      {preview ? "미리보기" : "회사"}
                    </span>
                  )}
                  {preview && (
                    <PreviewPriorityBadge
                      schedule={schedule}
                      className="pointer-events-none mr-1"
                    />
                  )}
                  <span className="pointer-events-none mr-1">
                    {schedule.title}
                  </span>
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
                className="pointer-events-none absolute left-0 right-0 z-20"
                style={{ top: nowTop }}
              >
                <span className="absolute left-0 right-0 -top-px border-t border-rose-300/70" />
                <span
                  className="absolute -top-1 h-2 border-l-2 border-rose-500"
                  style={{
                    left: `${currentTimeColumnLeft}%`,
                  }}
                />
                <span
                  className="absolute -top-px border-t-2 border-rose-500"
                  style={{
                    left: `${currentTimeColumnLeft}%`,
                    width: `calc(${currentTimeColumnWidth}% - 12px)`,
                  }}
                />
                <span
                  className="absolute -top-2 whitespace-nowrap rounded bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                  style={{ left: -weekTimeColumnWidth + 4 }}
                >
                  {formatTime(now.toISOString())}
                </span>
              </div>
            )}

            {weekDates.map((day) => {
              const key = toDateKey(day);
              const selected = key === selectedKey;
              const isHoliday = (holidaysByDate.get(key)?.length ?? 0) > 0;

              return (
                <div
                  key={`timed-${key}`}
                  onPointerDown={(event) => beginTimedCreate(event, day)}
                  onPointerMove={(event) => updateTimedCreate(event, day)}
                  onPointerUp={endTimedCreate}
                  onPointerCancel={(event) => {
                    if (createInteraction?.pointerId === event.pointerId) {
                      setCreateInteraction(null);
                    }
                  }}
                  onContextMenu={(event) => showCreateContextMenu(event, day)}
                  className={`relative border-r border-slate-100 transition hover:bg-violet-50/20 last:border-r-0 ${weekdayColumnClass(day, selected, isHoliday)}`}
                />
              );
            })}

            {createInteraction?.surface === "time" &&
              createInteraction.dragged && (
                <div
                  className="pointer-events-none absolute z-40 rounded-lg bg-violet-100/85 px-2 py-1 text-xs font-semibold text-violet-800 shadow-sm ring-1 ring-violet-300"
                  style={scheduleBlockStyleFromDates(
                    createInteraction.start,
                    createInteraction.end,
                    weekDates,
                  )}
                >
                  <span className="block truncate">새 일정</span>
                  <span className="block truncate text-[10px] opacity-80">
                    {formatTime(createInteraction.start.toISOString())} -{" "}
                    {formatTime(createInteraction.end.toISOString())}
                  </span>
                </div>
              )}

            {timedScheduleLayouts.map((layout) => {
              const { schedule, start, end, metrics, lane, laneCount } = layout;
              const accentColor = scheduleAccentColor(schedule);
              const cardColor = scheduleCardColor(schedule, categoryColors);
              const activeDraft =
                interaction?.scheduleId === schedule.schedule_id
                  ? interaction
                  : null;
              const selected = activeScheduleId === schedule.schedule_id;
              const hovered = hoveredScheduleId === schedule.schedule_id;
              const preview = isPreviewSchedule(schedule);
              const readOnly = isReadonlySchedule(schedule);
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
                  aria-label={`${schedule.title} schedule block`}
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
                      onOpenSchedule(schedule, event.currentTarget);
                    }
                  }}
                  className={`absolute z-10 origin-top-left touch-none overflow-hidden rounded-lg px-2 py-1 text-left text-xs font-medium transition-[box-shadow,filter,opacity,transform,left,top,width,height] duration-150 ease-out hover:scale-[1.02] hover:brightness-95 focus:scale-[1.02] ${
                    readOnly
                      ? "cursor-pointer"
                      : "cursor-grab active:cursor-grabbing"
                  } ${
                    selected
                      ? "ring-2 ring-violet-400 ring-offset-1"
                      : "hover:ring-1 hover:ring-violet-200"
                  } ${activeDraft ? "opacity-45 saturate-75" : ""} ${
                    preview ? "border border-dashed" : ""
                  }`}
                  style={{
                    ...blockStyle,
                    zIndex:
                      selected || hovered ? 35 : activeDraft ? 12 : 10 + lane,
                    backgroundColor: colorWithAlpha(cardColor, "24"),
                    borderLeft: `3px solid ${accentColor}`,
                    borderColor: preview
                      ? colorWithAlpha(cardColor, "80")
                      : undefined,
                    color: accentColor,
                    boxShadow: activeDraft
                      ? `0 0 0 1px ${colorWithAlpha(cardColor, "28")}`
                      : `0 0 0 1px ${colorWithAlpha(cardColor, "40")}`,
                  }}
                >
                  {!readOnly && (
                    <>
                      <span
                        role="presentation"
                        className="absolute inset-y-0 left-0 z-20 w-2 cursor-ew-resize transition hover:bg-white/35"
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
                        className="absolute inset-y-0 right-0 z-20 w-2 cursor-ew-resize transition hover:bg-white/35"
                        onPointerDown={(event) =>
                          beginInteraction(event, "resize-right", schedule)
                        }
                        onPointerMove={updateInteraction}
                        onPointerUp={endInteraction}
                        onPointerCancel={() => {
                          setInteraction(null);
                        }}
                      />
                      <span
                        role="presentation"
                        className="absolute inset-x-2 top-0 z-30 h-2 cursor-ns-resize rounded-t-md transition hover:bg-white/45"
                        onPointerDown={(event) =>
                          beginInteraction(event, "resize-top", schedule)
                        }
                        onPointerMove={updateInteraction}
                        onPointerUp={endInteraction}
                        onPointerCancel={() => {
                          setInteraction(null);
                        }}
                      />
                      <span
                        role="presentation"
                        className="absolute inset-x-2 bottom-0 z-30 h-2 cursor-ns-resize rounded-b-md transition hover:bg-white/45"
                        onPointerDown={(event) =>
                          beginInteraction(event, "resize-bottom", schedule)
                        }
                        onPointerMove={updateInteraction}
                        onPointerUp={endInteraction}
                        onPointerCancel={() => {
                          setInteraction(null);
                        }}
                      />
                    </>
                  )}
                  {readOnly && (
                    <span className="mb-0.5 inline-flex rounded bg-white/60 px-1 text-[10px] font-semibold">
                      {preview ? "미리보기" : "회사"}
                    </span>
                  )}
                  {preview && (
                    <PreviewPriorityBadge
                      schedule={schedule}
                      className="mb-0.5"
                    />
                  )}
                  <span className="flex min-w-0 items-center gap-1.5 pr-2">
                    <PriorityDot schedule={schedule} />
                    <span className="min-w-0 truncate">{schedule.title}</span>
                  </span>
                  <span className="block truncate pr-2 text-[10px] opacity-80">
                    {formatTime(start.toISOString())} -{" "}
                    {formatTime(end.toISOString())}
                  </span>
                </div>
              );
            })}

            {interaction &&
              (interaction.surface !== "all-day" ||
                interaction.targetAllDay === false) &&
              !interaction.settling && (
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
                      scheduleCardColor(interaction.schedule, categoryColors),
                      "18",
                    )}`,
                  }}
                />
              )}

            {interaction &&
              (interaction.surface !== "all-day" ||
                interaction.targetAllDay === false) && (
                <div
                  className={`pointer-events-none absolute z-50 touch-none overflow-hidden rounded-lg px-2 py-1 text-left text-xs font-semibold shadow-2xl will-change-transform transition-[box-shadow,opacity,transform] ${
                    interaction.settling
                      ? "duration-[170ms] ease-out"
                      : "duration-75 ease-out"
                  }`}
                  style={{
                    ...scheduleBlockStyleFromDates(
                      interaction.kind === "move" &&
                        interaction.surface !== "all-day"
                        ? interaction.originalStart
                        : interaction.start,
                      interaction.kind === "move" &&
                        interaction.surface !== "all-day"
                        ? interaction.originalEnd
                        : interaction.end,
                      weekDates,
                    ),
                    backgroundColor: colorWithAlpha(
                      scheduleCardColor(interaction.schedule, categoryColors),
                      "66",
                    ),
                    borderLeft: `3px solid ${scheduleAccentColor(
                      interaction.schedule,
                      categoryColors,
                    )}`,
                    color: scheduleAccentColor(
                      interaction.schedule,
                      categoryColors,
                    ),
                    boxShadow: `0 18px 34px rgba(15,23,42,0.18), 0 0 0 1.5px ${scheduleAccentColor(
                      interaction.schedule,
                      categoryColors,
                    )}, inset 0 0 0 1px ${colorWithAlpha(
                      scheduleCardColor(interaction.schedule, categoryColors),
                      "55",
                    )}`,
                    transform:
                      interaction.kind === "move" &&
                      interaction.surface !== "all-day"
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
  const { showHolidays, weekStart } = useUserSettings();
  const deepLinkedScheduleIdParam = searchParams.get("schedule_id");
  const deepLinkedScheduleId = deepLinkedScheduleIdParam
    ? Number(deepLinkedScheduleIdParam)
    : null;
  const deepLinkedDate = searchParams.get("date");
  const createPanelRequested = searchParams.get("create") === "1";
  const initialDate = deepLinkedDate ? new Date(deepLinkedDate) : new Date();
  const safeInitialDate = Number.isNaN(initialDate.getTime())
    ? new Date()
    : initialDate;
  const deepLinkHandledRef = useRef(false);

  const [scheduleView, setScheduleView] =
    useState<ScheduleCalendarView>("week");
  const [desktopFiltersOpen, setDesktopFiltersOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () =>
      new Date(safeInitialDate.getFullYear(), safeInitialDate.getMonth(), 1),
  );
  const [visibleWindowStart, setVisibleWindowStart] = useState(() =>
    monthCalendarWindowStart(safeInitialDate, weekStart),
  );
  const [miniCalendarMonth, setMiniCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
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
  const [schedulePanelLayout, setSchedulePanelLayout] =
    useState<SchedulePanelLayout>(getInitialSchedulePanelLayout);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [viewingSchedule, setViewingSchedule] = useState<Schedule | null>(null);
  const [draftCreateForm, setDraftCreateForm] =
    useState<ScheduleFormState | null>(null);
  const [draftPreviewForms, setDraftPreviewForms] = useState<
    ScheduleFormState[]
  >([]);
  const [panelAnchorElement, setPanelAnchorElement] =
    useState<SchedulePanelAnchorElement>(null);
  const [filters, setFilters] = useState<ScheduleFilters>(() => {
    const completion = searchParams.get(
      "completion",
    ) as ScheduleCompletionFilter | null;
    const keyword = searchParams.get("q") ?? "";
    const legacyLocationKeyword = searchParams.get("location") ?? "";
    return {
      owner: parseScheduleOwnerFilter(searchParams.get("owner")),
      scheduleTypes: parseScheduleTypeFilters(searchParams.get("type")),
      priorities: parseSchedulePriorityFilters(searchParams.get("priority")),
      categories: parseScheduleCategoryFilters(searchParams.get("category")),
      completion:
        completion === "active" || completion === "completed"
          ? completion
          : "all",
      q: keyword || legacyLocationKeyword,
    };
  });

  const createSchedulesMutation = useCreateSchedules();
  const createShareLinkMutation = useCreateScheduleShareLink();
  const createFriendShareMutation = useCreateScheduleFriendShare();
  const updateMutation = useUpdateSchedule();
  const scheduleCompletionMutation = useSetScheduleCompletion();
  const deleteMutation = useDeleteSchedule();
  const bulkDeleteMutation = useDeleteSchedules();
  const categoriesQuery = useCategories("schedule");
  const companyAdminMeQuery = useCompanyAdminMe();
  const hasCompanyMembership = companyAdminMeQuery.isSuccess;
  const activeCompanyDepartment = companyAdminMeQuery.data?.department;
  const activeCompanyDepartmentLabel = activeCompanyDepartment?.name
    ? `${activeCompanyDepartment.name}${
        activeCompanyDepartment.code ? ` (${activeCompanyDepartment.code})` : ""
      }`
    : undefined;
  const activeCompanyDepartmentId = Number(
    activeCompanyDepartment?.department_id ??
      companyAdminMeQuery.data?.department_id,
  );
  const ownCompanyDepartmentId =
    Number.isFinite(activeCompanyDepartmentId) && activeCompanyDepartmentId > 0
      ? activeCompanyDepartmentId
      : null;
  const companyDepartmentsQuery = useCompanyAdminDepartments(
    hasCompanyMembership || !!viewingSchedule,
  );
  const createCompanyScheduleMutation = useCreateCompanyAdminSchedule();
  const companyApprovalsEnabled = hasCompanyMembership;
  const approverApprovalsQuery = useCompanyScheduleApprovals(
    { status: "pending", role: "approver" },
    companyApprovalsEnabled,
  );
  const requestedApprovalsQuery = useCompanyScheduleApprovals(
    { status: "pending", role: "requested" },
    companyApprovalsEnabled,
  );
  const approveCompanyScheduleApprovalMutation =
    useApproveCompanyScheduleApproval();
  const rejectCompanyScheduleApprovalMutation =
    useRejectCompanyScheduleApproval();

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

  useEffect(() => {
    window.localStorage.setItem(
      schedulePanelLayoutStorageKey,
      schedulePanelLayout,
    );
  }, [schedulePanelLayout]);

  useEffect(() => {
    setVisibleWindowStart(monthCalendarWindowStart(visibleMonth, weekStart));
  }, [weekStart]);

  useEffect(() => {
    if (!searchParams.has("location")) return;

    const params = new URLSearchParams(searchParams);
    const legacyLocationKeyword = params.get("location")?.trim();
    if (!params.get("q")?.trim() && legacyLocationKeyword) {
      params.set("q", legacyLocationKeyword);
    }
    params.delete("location");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const updateDraftPreviewForms = useCallback((forms: ScheduleFormState[]) => {
    setDraftPreviewForms(forms);
  }, []);

  const clearDeepLinkParams = useCallback(() => {
    if (
      !searchParams.has("schedule_id") &&
      !searchParams.has("date") &&
      !searchParams.has("create")
    ) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("schedule_id");
    nextParams.delete("date");
    nextParams.delete("create");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const updateFilters = useCallback(
    (patch: Partial<ScheduleFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        const params = new URLSearchParams(searchParams);
        params.delete("schedule_id");
        params.delete("date");
        params.delete("create");
        params.delete("location");

        if (next.owner === "all") params.delete("owner");
        else params.set("owner", next.owner);

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
    params.delete("create");
    params.delete("owner");
    params.delete("type");
    params.delete("priority");
    params.delete("category");
    params.delete("completion");
    params.delete("q");
    params.delete("location");
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams]);

  const monthRange = useMemo(() => {
    const start = new Date(visibleWindowStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(visibleWindowStart);
    end.setDate(visibleWindowStart.getDate() + 41);
    end.setHours(23, 59, 59, 999);
    return {
      startFrom: toOffsetISOString(start),
      startTo: toOffsetISOString(end),
      startDate: toDateKey(start),
      endDate: toDateKey(end),
    };
  }, [visibleWindowStart]);
  const miniCalendarHolidayRange = useMemo(() => {
    const cells = buildFullMonthCells(miniCalendarMonth, { weekStart });
    const first = cells[0]?.date ?? miniCalendarMonth;
    const last = cells[cells.length - 1]?.date ?? miniCalendarMonth;

    return {
      start_date: toDateKey(first),
      end_date: toDateKey(last),
      public_only: true,
    };
  }, [miniCalendarMonth, weekStart]);

  const schedulesQuery = useSchedules({
    start_from: monthRange.startFrom,
    start_to: monthRange.startTo,
  });
  const companySchedulesQuery = useCompanySchedules(
    {
      start_from: monthRange.startFrom,
      start_to: monthRange.startTo,
    },
    {
      enabled: hasCompanyMembership,
    },
  );
  const holidaysQuery = useHolidaysInRange(
    {
      start_date: monthRange.startDate,
      end_date: monthRange.endDate,
      public_only: true,
    },
    {
      enabled: showHolidays,
    },
  );
  const miniCalendarHolidaysQuery = useHolidaysInRange(
    miniCalendarHolidayRange,
    { enabled: showHolidays },
  );
  const data = schedulesQuery.data;
  const companySchedules = useMemo(
    () =>
      (companySchedulesQuery.data ?? []).map((schedule) =>
        companyScheduleToSchedule(schedule),
      ),
    [companySchedulesQuery.data],
  );
  const isLoading = schedulesQuery.isLoading || companySchedulesQuery.isLoading;
  const error = schedulesQuery.error ?? companySchedulesQuery.error;
  const isFetching =
    schedulesQuery.isFetching || companySchedulesQuery.isFetching;
  const refetchSchedules = () => {
    void schedulesQuery.refetch();
    void companySchedulesQuery.refetch();
    if (showHolidays) void holidaysQuery.refetch();
  };
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

  const draftPreviewSchedules = useMemo(() => {
    if (!panelMode || viewingSchedule || draftPreviewForms.length === 0) {
      return [];
    }

    return draftPreviewForms
      .map((form, index) =>
        previewScheduleFromForm(
          form,
          index,
          panelMode === "edit" && index === 0 ? editingSchedule : null,
        ),
      )
      .filter((schedule): schedule is PreviewSchedule => schedule !== null);
  }, [draftPreviewForms, editingSchedule, panelMode, viewingSchedule]);

  const filteredItems = useMemo(() => {
    const keyword = filters.q.trim().toLowerCase();
    return mergeSchedules(data ?? [], companySchedules)
      .map((schedule) => {
        const optimisticTime = optimisticScheduleTimes.get(
          schedule.schedule_id,
        );
        if (!optimisticTime) return schedule;

        return {
          ...schedule,
          start_datetime: optimisticTime.start,
          end_datetime: optimisticTime.end,
          all_day: optimisticTime.allDay ?? schedule.all_day,
        };
      })
      .filter((schedule) => {
        if (
          filters.owner !== "all" &&
          scheduleOwnerType(schedule) !== filters.owner
        ) {
          return false;
        }
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
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.start_datetime).getTime() -
          new Date(b.start_datetime).getTime(),
      );
  }, [
    companySchedules,
    data,
    filters.categories,
    filters.completion,
    filters.owner,
    filters.priorities,
    filters.q,
    filters.scheduleTypes,
    optimisticScheduleTimes,
  ]);

  const items = useMemo(() => {
    if (draftPreviewSchedules.length === 0) return filteredItems;

    const previewIds = new Set(
      draftPreviewSchedules.map((schedule) => schedule.schedule_id),
    );

    return [
      ...filteredItems.filter(
        (schedule) => !previewIds.has(schedule.schedule_id),
      ),
      ...draftPreviewSchedules,
    ].sort(
      (a, b) =>
        new Date(a.start_datetime).getTime() -
        new Date(b.start_datetime).getTime(),
    );
  }, [draftPreviewSchedules, filteredItems]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.owner !== "all") count += 1;
    if (filters.scheduleTypes.length > 0) count += 1;
    if (filters.priorities.length > 0) count += 1;
    if (filters.categories.length > 0) count += 1;
    if (filters.completion !== "all") count += 1;
    if (filters.q.trim()) count += 1;
    return count;
  }, [filters]);
  const scheduleFilterChips = useMemo(() => {
    const chips: Array<{
      key: string;
      label: string;
      reset: Partial<ScheduleFilters>;
    }> = [];
    if (filters.owner !== "all") {
      chips.push({
        key: "owner",
        label: scheduleOwnerFilterLabel(filters.owner),
        reset: { owner: "all" },
      });
    }
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
        label: `검색 ${filters.q.trim()}`,
        reset: { q: "" },
      });
    }
    return chips;
  }, [categoriesQuery.data, classificationSettings, filters]);

  const schedulesByDate = useMemo(() => {
    return groupSchedulesByOverlappingDate(items);
  }, [items]);
  const holidaysByDate = useMemo(
    () =>
      showHolidays
        ? groupHolidaysByDate(holidaysQuery.data ?? [])
        : new Map<string, Holiday[]>(),
    [holidaysQuery.data, showHolidays],
  );
  const miniCalendarHolidaysByDate = useMemo(
    () =>
      showHolidays
        ? groupHolidaysByDate(miniCalendarHolidaysQuery.data ?? [])
        : new Map<string, Holiday[]>(),
    [miniCalendarHolidaysQuery.data, showHolidays],
  );

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

  const mainMonthCells = useMemo(
    () =>
      buildFullMonthCells(visibleMonth, {
        fixedWeeks: 6,
        startDate: visibleWindowStart,
        weekStart,
      }),
    [visibleMonth, visibleWindowStart, weekStart],
  );

  const selectedKey = toDateKey(selectedDate);
  const todayKey = toDateKey(new Date());
  const todayWeekDates = useMemo(
    () => buildWeekDates(new Date(), weekStart),
    [weekStart],
  );
  const selectedSchedules = useMemo(
    () =>
      items.filter((schedule) => scheduleOverlapsDay(schedule, selectedDate)),
    [items, selectedDate],
  );
  const editableSelectedSchedules = useMemo(
    () => selectedSchedules.filter((schedule) => !isReadonlySchedule(schedule)),
    [selectedSchedules],
  );
  const weekDates = useMemo(
    () => buildWeekDates(selectedDate, weekStart),
    [selectedDate, weekStart],
  );
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
  const monthVisibleSchedules = useMemo(() => {
    const byId = new Map<number, Schedule>();
    for (const cell of mainMonthCells) {
      for (const schedule of schedulesByDate.get(toDateKey(cell.date)) ?? []) {
        byId.set(schedule.schedule_id, schedule);
      }
    }
    return [...byId.values()];
  }, [mainMonthCells, schedulesByDate]);
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
  const currentViewRangeName =
    scheduleView === "month"
      ? "이번 달"
      : scheduleView === "week"
        ? "이번 주"
        : "선택한 날짜";
  const currentViewSummary = `${currentViewLabel} · ${currentViewRangeName} 일정 ${currentViewSchedules.length}건${
    isFetching ? " 불러오는 중" : ""
  }`;
  const selectedScheduleViewOption =
    scheduleViewOptions.find((option) => option.value === scheduleView) ??
    scheduleViewOptions[1];
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
    setVisibleWindowStart(monthCalendarWindowStart(targetDate, weekStart));
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
      const nextSelectedDate = new Date(next.getFullYear(), next.getMonth(), 1);
      setSelectedDate(nextSelectedDate);
      setVisibleWindowStart(monthCalendarWindowStart(next, weekStart));
      return next;
    });
  };

  const moveMiniCalendarMonth = (offset: number) => {
    setMiniCalendarMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1),
    );
  };

  const resetMiniCalendarMonth = () => {
    const today = new Date();
    setMiniCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const moveCurrentRange = (offset: number) => {
    if (scheduleView === "month") {
      moveMonth(offset);
      return;
    }

    const next = new Date(selectedDate);
    next.setDate(
      selectedDate.getDate() + offset * (scheduleView === "week" ? 7 : 1),
    );
    selectDate(next);
  };

  const selectDate = (date: Date) => {
    clearDeepLinkParams();
    setSelectedScheduleIds(new Set());
    setSelectedDate(date);
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setVisibleWindowStart(monthCalendarWindowStart(date, weekStart));
  };

  const moveVisibleWeek = (offset: number) => {
    clearDeepLinkParams();
    setVisibleWindowStart((prev) => {
      const next = addDays(prev, offset * 7);
      setVisibleMonth(dominantMonthInWindow(next));
      return next;
    });
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
      new Set(
        editableSelectedSchedules.map((schedule) => schedule.schedule_id),
      ),
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

  const closeFilters = () => {
    setDesktopFiltersOpen(false);
    setMobileFiltersOpen(false);
  };

  const changeScheduleView = useCallback((view: ScheduleCalendarView) => {
    setScheduleView(view);
  }, []);

  const updateOwnerView = (owner: ScheduleOwnerFilter) => {
    updateFilters({ owner });
  };

  const openCreatePanel = (
    date = selectedDate,
    anchorElement: SchedulePanelAnchorElement = null,
    draft?: ScheduleCreateDraft,
    options?: OpenCreatePanelOptions,
  ) => {
    closeFilters();
    if (options?.selectTargetDate !== false) {
      selectDate(date);
    } else {
      clearDeepLinkParams();
      setSelectedScheduleIds(new Set());
    }
    setPanelAnchorElement(anchorElement);
    setViewingSchedule(null);
    setEditingSchedule(null);
    setDraftCreateForm(draft ? formFromCreateDraft(draft) : null);
    setDraftPreviewForms([]);
    setPanelMode("create");
  };

  const openCreateSidebarPanel = (
    date = selectedDate,
    draft?: ScheduleCreateDraft,
    options?: OpenCreatePanelOptions,
  ) => {
    setSchedulePanelLayout("docked");
    openCreatePanel(
      date,
      null,
      scheduleView === "month"
        ? {
            ...(draft ?? allDayCreateDraftForDate(date)),
            allDay: true,
          }
        : draft,
      options,
    );
  };

  useEffect(() => {
    if (!createPanelRequested) return;

    const requestedDate = deepLinkedDate
      ? new Date(`${deepLinkedDate}T00:00:00`)
      : selectedDate;
    const safeRequestedDate = Number.isNaN(requestedDate.getTime())
      ? selectedDate
      : requestedDate;

    openCreateSidebarPanel(safeRequestedDate);
  }, [createPanelRequested, deepLinkedDate]);

  const openEditPanel = (
    schedule: Schedule,
    anchorElement: SchedulePanelAnchorElement = null,
  ) => {
    if (isPreviewSchedule(schedule)) return;

    closeFilters();
    setPanelAnchorElement(anchorElement);
    setDraftCreateForm(null);
    setDraftPreviewForms([]);

    if (isCompanySchedule(schedule)) {
      setEditingSchedule(null);
      setPanelMode(null);
      setViewingSchedule(schedule);
      return;
    }

    setViewingSchedule(null);
    setEditingSchedule(schedule);
    setPanelMode("edit");
  };

  const moveScheduleOnCalendar = async (
    schedule: Schedule,
    start: Date,
    end: Date,
    options?: ScheduleTimeChangeOptions,
  ) => {
    if (isPreviewSchedule(schedule)) {
      return;
    }

    if (isCompanySchedule(schedule)) {
      toast.info("회사 일정은 조회 전용입니다.");
      return;
    }

    const nextStart = toOffsetISOString(start);
    const nextEnd = toOffsetISOString(end);
    const nextAllDay =
      options?.allDay ??
      (schedule.all_day || shouldUseAllDayLaneForRange(start, end));

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
    setViewingSchedule(null);
    setDraftCreateForm(null);
    setDraftPreviewForms([]);
    setPanelAnchorElement(null);
  };

  const formInitial =
    panelMode === "edit" && editingSchedule
      ? formFromSchedule(editingSchedule)
      : (draftCreateForm ?? emptyFormForDate(selectedDate));

  const panelKey =
    panelMode === "edit" && editingSchedule
      ? `edit-${editingSchedule.schedule_id}`
      : `${panelMode ?? "create"}-${
          draftCreateForm ? scheduleFormSignature(draftCreateForm) : selectedKey
        }`;

  const allDaySchedules = selectedSchedules.filter(isAllDayLikeSchedule);
  const timedSchedules = selectedSchedules.filter(
    (schedule) => !isAllDayLikeSchedule(schedule),
  );
  const schedulePanelOpen = panelMode !== null || viewingSchedule !== null;
  const sidePanelOpen = schedulePanelOpen;
  const dockedPanelOpen = sidePanelOpen && schedulePanelLayout === "docked";
  const floatingPanelOpen = sidePanelOpen && schedulePanelLayout === "floating";
  const headerPanelOffsetClass = dockedPanelOpen
    ? "md:mr-[300px] lg:mr-[340px]"
    : floatingPanelOpen
      ? "md:mr-[300px] lg:mr-[340px] xl:mr-0"
      : "";
  const floatingPanelStyle = useSchedulePanelFloatingStyle(
    panelAnchorElement,
    floatingPanelOpen,
  );

  useEffect(() => {
    const handleScheduleViewShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        schedulePanelOpen ||
        desktopFiltersOpen ||
        mobileFiltersOpen ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }

      const nextView = scheduleViewShortcutMap[event.key.toLowerCase()];
      if (!nextView) return;

      event.preventDefault();
      changeScheduleView(nextView);
    };

    window.addEventListener("keydown", handleScheduleViewShortcut);
    return () => {
      window.removeEventListener("keydown", handleScheduleViewShortcut);
    };
  }, [
    changeScheduleView,
    desktopFiltersOpen,
    mobileFiltersOpen,
    schedulePanelOpen,
  ]);

  const handleApproveCompanyScheduleApproval = (
    approval: CompanyScheduleApproval,
  ) => {
    const approvalId = toPositiveScheduleNumber(
      getCompanyScheduleApprovalId(approval),
    );
    if (!approvalId) {
      toast.error("승인 요청 ID를 찾지 못했습니다.");
      return;
    }

    void approveCompanyScheduleApprovalMutation
      .mutateAsync({ approvalId })
      .catch(() => undefined);
  };

  const handleRejectCompanyScheduleApproval = (
    approval: CompanyScheduleApproval,
  ) => {
    const approvalId = toPositiveScheduleNumber(
      getCompanyScheduleApprovalId(approval),
    );
    if (!approvalId) {
      toast.error("승인 요청 ID를 찾지 못했습니다.");
      return;
    }

    void rejectCompanyScheduleApprovalMutation
      .mutateAsync({ approvalId })
      .catch(() => undefined);
  };

  return (
    <AppShell
      fullBleed
      titleMeta={currentViewSummary}
      aiChatButtonOffset={sidePanelOpen ? "340px" : "0px"}
      headerActions={
        <div
          data-flowra-schedule-controls
          className={`flex items-center gap-1 transition-[margin] ${headerPanelOffsetClass}`}
        >
          <div className="flex items-center gap-1 rounded-lg bg-slate-50 px-1.5 py-1">
            <Popover
              open={desktopFiltersOpen}
              onOpenChange={(open) => {
                setDesktopFiltersOpen(open);
                if (open) setMobileFiltersOpen(false);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="검색 및 필터"
                  title="검색 및 필터"
                  className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm transition ${
                    desktopFiltersOpen || activeFilterCount > 0
                      ? "border-violet-200 bg-violet-50 text-violet-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <Search className="h-4 w-4" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent
                data-schedule-filter-panel
                align="start"
                sideOffset={8}
                collisionPadding={12}
                onInteractOutside={(event) => {
                  const target = event.target;
                  if (
                    target instanceof Element &&
                    target.closest("[data-schedule-filter-menu]")
                  ) {
                    event.preventDefault();
                  }
                }}
                className="z-[160] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl shadow-slate-900/10"
              >
                <ScheduleFilterPanel
                  filters={filters}
                  activeCount={activeFilterCount}
                  scheduleTypeOptions={scheduleTypeFilterOptions.map(
                    (option) => ({
                      key: option.key,
                      value: option.value,
                      label:
                        scheduleTypeSelectMeta[option.value]?.label ??
                        option.label,
                      colorDot: scheduleTypeSelectMeta[option.value]?.color,
                    }),
                  )}
                  priorityOptions={priorityFilterOptions.map((option) => ({
                    key: option.key,
                    value: option.value,
                    label: option.label,
                    colorDot: prioritySelectMeta[option.value]?.color,
                  }))}
                  categoryOptions={(categoriesQuery.data ?? []).map(
                    (category) => ({
                      key: String(category.category_id),
                      value: category.category_id,
                      label: category.name,
                      colorDot: category.color || fallbackCategoryColor,
                    }),
                  )}
                  onUpdate={updateFilters}
                  onReset={resetFilters}
                  onClose={() => setDesktopFiltersOpen(false)}
                />
              </PopoverContent>
            </Popover>
            <ScheduleOwnerViewSelector
              value={filters.owner}
              onChange={updateOwnerView}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-8 min-w-14 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                  aria-label="보기 선택"
                >
                  {selectedScheduleViewOption.label}
                  <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 border-slate-800 bg-neutral-900 p-1.5 text-slate-100 shadow-xl"
              >
                {scheduleViewOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => changeScheduleView(option.value)}
                    className={`gap-3 rounded-md px-2.5 py-2 text-sm text-slate-200 focus:bg-neutral-800 focus:text-white ${
                      scheduleView === option.value ? "bg-neutral-800" : ""
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center text-violet-400">
                      {scheduleView === option.value && (
                        <Check className="h-4 w-4" />
                      )}
                    </span>
                    <span
                      className={`font-medium ${
                        scheduleView === option.value
                          ? "text-violet-200"
                          : "text-slate-100"
                      }`}
                    >
                      {option.label}
                    </span>
                    <span className="ml-auto text-xs text-slate-500">
                      {option.shortcut}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                selectDate(today);
              }}
              className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
            >
              오늘
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveCurrentRange(-1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
                aria-label={scheduleView === "month" ? "이전 달" : "이전 범위"}
              >
                {scheduleView === "month" ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => moveCurrentRange(1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
                aria-label={scheduleView === "month" ? "다음 달" : "다음 범위"}
              >
                {scheduleView === "month" ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
          {companyApprovalsEnabled && (
            <CompanyScheduleApprovalPopover
              approverApprovals={approverApprovalsQuery.data ?? []}
              requestedApprovals={requestedApprovalsQuery.data ?? []}
              loading={
                approverApprovalsQuery.isLoading ||
                requestedApprovalsQuery.isLoading
              }
              actionPending={
                approveCompanyScheduleApprovalMutation.isPending ||
                rejectCompanyScheduleApprovalMutation.isPending
              }
              onApprove={handleApproveCompanyScheduleApproval}
              onReject={handleRejectCompanyScheduleApproval}
            />
          )}
          {!dockedPanelOpen && (
            <button
              type="button"
              onClick={() => openCreateSidebarPanel()}
              aria-label="일정 추가 사이드바 열기"
              title="일정 추가 사이드바 열기"
              className={scheduleSidebarToggleButtonClass}
            >
              <PanelRight className="h-4 w-4" />
            </button>
          )}
        </div>
      }
      sidebarExtra={
        scheduleView !== "month" ? (
          <div data-flowra-schedule-sidebar>
            <MiniCalendar
              visibleMonth={miniCalendarMonth}
              selectedKey={todayKey}
              dateMeta={dateMeta}
              holidaysByDate={miniCalendarHolidaysByDate}
              weekDates={todayWeekDates}
              weekStart={weekStart}
              onMoveMonth={moveMiniCalendarMonth}
              onResetMonth={resetMiniCalendarMonth}
              onSelectDate={selectDate}
            />
          </div>
        ) : null
      }
    >
      <div
        data-flowra-schedule-page
        className="flowra-workspace h-full min-h-0 overflow-hidden"
      >
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
              { label: "이번 달", value: `${monthScheduleCount}건` },
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
            sidePanelOpen
              ? dockedPanelOpen
                ? "md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_340px]"
                : "md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-1"
              : "md:grid-cols-1 xl:grid-cols-1"
          }`}
        >
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 bg-white px-4 py-2 min-[600px]:hidden">
              <Popover
                open={mobileFiltersOpen}
                onOpenChange={(open) => {
                  setMobileFiltersOpen(open);
                  if (open) setDesktopFiltersOpen(false);
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="검색 및 필터"
                    title="검색 및 필터"
                    className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-sm transition ${
                      mobileFiltersOpen || activeFilterCount > 0
                        ? "border-violet-200 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                  >
                    <Search className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  data-schedule-filter-panel
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  onInteractOutside={(event) => {
                    const target = event.target;
                    if (
                      target instanceof Element &&
                      target.closest("[data-schedule-filter-menu]")
                    ) {
                      event.preventDefault();
                    }
                  }}
                  className="z-[160] w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl shadow-slate-900/10"
                >
                  <ScheduleFilterPanel
                    filters={filters}
                    activeCount={activeFilterCount}
                    scheduleTypeOptions={scheduleTypeFilterOptions.map(
                      (option) => ({
                        key: option.key,
                        value: option.value,
                        label:
                          scheduleTypeSelectMeta[option.value]?.label ??
                          option.label,
                        colorDot: scheduleTypeSelectMeta[option.value]?.color,
                      }),
                    )}
                    priorityOptions={priorityFilterOptions.map((option) => ({
                      key: option.key,
                      value: option.value,
                      label: option.label,
                      colorDot: prioritySelectMeta[option.value]?.color,
                    }))}
                    categoryOptions={(categoriesQuery.data ?? []).map(
                      (category) => ({
                        key: String(category.category_id),
                        value: category.category_id,
                        label: category.name,
                        colorDot: category.color || fallbackCategoryColor,
                      }),
                    )}
                    onUpdate={updateFilters}
                    onReset={resetFilters}
                    onClose={() => setMobileFiltersOpen(false)}
                  />
                </PopoverContent>
              </Popover>
              <ScheduleOwnerViewSelector
                value={filters.owner}
                onChange={updateOwnerView}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 min-w-14 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
                    aria-label="보기 선택"
                  >
                    {selectedScheduleViewOption.label}
                    <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-48 border-slate-800 bg-neutral-900 p-1.5 text-slate-100 shadow-xl"
                >
                  {scheduleViewOptions.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onSelect={() => changeScheduleView(option.value)}
                      className={`gap-3 rounded-md px-2.5 py-2 text-sm text-slate-200 focus:bg-neutral-800 focus:text-white ${
                        scheduleView === option.value ? "bg-neutral-800" : ""
                      }`}
                    >
                      <span className="flex h-4 w-4 items-center justify-center text-violet-400">
                        {scheduleView === option.value && (
                          <Check className="h-4 w-4" />
                        )}
                      </span>
                      <span
                        className={`font-medium ${
                          scheduleView === option.value
                            ? "text-violet-200"
                            : "text-slate-100"
                        }`}
                      >
                        {option.label}
                      </span>
                      <span className="ml-auto text-xs text-slate-500">
                        {option.shortcut}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  selectDate(today);
                }}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
              >
                오늘
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveCurrentRange(-1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label={
                    scheduleView === "month" ? "이전 달" : "이전 범위"
                  }
                >
                  {scheduleView === "month" ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronLeft className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => moveCurrentRange(1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  aria-label={
                    scheduleView === "month" ? "다음 달" : "다음 범위"
                  }
                >
                  {scheduleView === "month" ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </div>
              {scheduleView === "day" &&
                editableSelectedSchedules.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={selectAllCurrentDaySchedules}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={clearSelectedSchedules}
                      disabled={selectedScheduleCount === 0}
                      className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
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
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {bulkDeleteMutation.isPending
                        ? "삭제 중..."
                        : `선택 삭제 ${selectedScheduleCount || ""}`.trim()}
                    </button>
                  </>
                )}
            </div>

            {scheduleView === "day" && editableSelectedSchedules.length > 0 && (
              <div className="hidden items-center justify-end gap-2 border-b border-slate-100 bg-white px-4 py-2 min-[600px]:flex">
                <button
                  type="button"
                  onClick={selectAllCurrentDaySchedules}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  전체 선택
                </button>
                <button
                  type="button"
                  onClick={clearSelectedSchedules}
                  disabled={selectedScheduleCount === 0}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  선택 해제
                </button>
                <button
                  type="button"
                  onClick={deleteSelectedSchedules}
                  disabled={
                    selectedScheduleCount === 0 || bulkDeleteMutation.isPending
                  }
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  {bulkDeleteMutation.isPending
                    ? "삭제 중..."
                    : `선택 삭제 ${selectedScheduleCount || ""}`.trim()}
                </button>
              </div>
            )}

            {scheduleFilterChips.length > 0 && (
              <div className="border-b border-slate-100 px-4 py-2">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {scheduleFilterChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => updateFilters(chip.reset)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                      aria-label={`${chip.label} 필터 제거`}
                    >
                      <span>{chip.label}</span>
                      <X className="h-3 w-3 text-violet-500" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    <RotateCcw className="h-3 w-3" />
                    필터 초기화
                  </button>
                </div>
              </div>
            )}

            <div
              className={
                scheduleView === "week"
                  ? "min-h-0 flex-1 overflow-hidden p-0"
                  : scheduleView === "month"
                    ? "min-h-0 flex-1 overflow-auto p-0"
                    : "scrollbar-none min-h-0 flex-1 overflow-auto p-5"
              }
            >
              {isLoading ? (
                <FullSpinner message="일정을 불러오는 중..." />
              ) : error ? (
                <ErrorState
                  title="일정을 불러오지 못했습니다"
                  message={(error as Error).message}
                  onRetry={refetchSchedules}
                  retrying={isFetching}
                />
              ) : scheduleView === "month" ? (
                <MonthScheduleGrid
                  cells={mainMonthCells}
                  schedulesByDate={schedulesByDate}
                  holidaysByDate={holidaysByDate}
                  selectedKey={selectedKey}
                  categoryColors={categoryColors}
                  activeScheduleId={
                    editingSchedule?.schedule_id ??
                    viewingSchedule?.schedule_id ??
                    null
                  }
                  weekStart={weekStart}
                  onOpenDay={(date) => {
                    selectDate(date);
                    changeScheduleView("day");
                  }}
                  onCreateDay={(date, _anchorElement, draft) =>
                    openCreateSidebarPanel(date, draft, {
                      selectTargetDate: false,
                    })
                  }
                  onOpenSchedule={(schedule, anchorElement) => {
                    if (isPreviewSchedule(schedule)) return;
                    selectDate(new Date(schedule.start_datetime));
                    openEditPanel(schedule, anchorElement);
                  }}
                  onScheduleTimeChange={moveScheduleOnCalendar}
                  onMoveWeek={moveVisibleWeek}
                />
              ) : scheduleView === "week" ? (
                <WeekScheduleGrid
                  weekDates={weekDates}
                  schedulesByDate={schedulesByDate}
                  holidaysByDate={holidaysByDate}
                  selectedKey={selectedKey}
                  categoryColors={categoryColors}
                  activeScheduleId={
                    editingSchedule?.schedule_id ??
                    viewingSchedule?.schedule_id ??
                    null
                  }
                  onOpenDay={(date) => {
                    selectDate(date);
                    changeScheduleView("day");
                  }}
                  onCreateDay={(date, anchorElement, draft) =>
                    openCreatePanel(date, anchorElement, draft)
                  }
                  onOpenSchedule={(schedule, anchorElement) => {
                    if (isPreviewSchedule(schedule)) return;
                    selectDate(new Date(schedule.start_datetime));
                    openEditPanel(schedule, anchorElement);
                  }}
                  onScheduleTimeChange={moveScheduleOnCalendar}
                />
              ) : scheduleView === "day" ? (
                <WeekScheduleGrid
                  weekDates={[selectedDate]}
                  schedulesByDate={schedulesByDate}
                  holidaysByDate={holidaysByDate}
                  selectedKey={selectedKey}
                  categoryColors={categoryColors}
                  activeScheduleId={
                    editingSchedule?.schedule_id ??
                    viewingSchedule?.schedule_id ??
                    null
                  }
                  onOpenDay={selectDate}
                  onCreateDay={(date, anchorElement, draft) =>
                    openCreatePanel(date, anchorElement, draft)
                  }
                  onOpenSchedule={(schedule, anchorElement) => {
                    if (isPreviewSchedule(schedule)) return;
                    selectDate(new Date(schedule.start_datetime));
                    openEditPanel(schedule, anchorElement);
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
                            onEdit={(anchorElement) =>
                              openEditPanel(schedule, anchorElement)
                            }
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
                      시간 지정 일정
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
                            onEdit={(anchorElement) =>
                              openEditPanel(schedule, anchorElement)
                            }
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

          {viewingSchedule && (
            <ScheduleReadonlyPanel
              schedule={viewingSchedule}
              onClose={closePanel}
              departments={companyDepartmentsQuery.data ?? []}
              floatingStyle={floatingPanelStyle}
              panelLayout={schedulePanelLayout}
            />
          )}

          {panelMode && !viewingSchedule && (
            <ScheduleFormPanel
              key={panelKey}
              mode={panelMode}
              initial={formInitial}
              schedule={editingSchedule}
              isPending={
                panelMode === "edit"
                  ? updateMutation.isPending ||
                    createSchedulesMutation.isPending
                  : panelMode === "create" || panelMode === "repeat"
                    ? createSchedulesMutation.isPending ||
                      createCompanyScheduleMutation.isPending ||
                      createShareLinkMutation.isPending ||
                      createFriendShareMutation.isPending
                    : updateMutation.isPending
              }
              onClose={closePanel}
              onPreviewChange={updateDraftPreviewForms}
              companyName={companyAdminMeQuery.data?.company?.name}
              companyDepartmentLabel={activeCompanyDepartmentLabel}
              ownCompanyDepartmentId={ownCompanyDepartmentId}
              defaultOwner={
                hasCompanyMembership && filters.owner === "company"
                  ? "company"
                  : "personal"
              }
              onCompanySubmit={
                hasCompanyMembership
                  ? async (payload) => {
                      const createdSchedule =
                        await createCompanyScheduleMutation.mutateAsync(
                          payload,
                        );
                      const start = new Date(
                        createdSchedule?.start_datetime ??
                          payload.start_datetime,
                      );
                      if (!Number.isNaN(start.getTime())) {
                        selectDate(start);
                      }
                      closePanel();
                    }
                  : undefined
              }
              floatingStyle={floatingPanelStyle}
              panelLayout={schedulePanelLayout}
              deletePending={deleteMutation.isPending}
              completionPending={scheduleCompletionMutation.isPending}
              onCompletionChange={
                panelMode === "edit" && editingSchedule
                  ? async (completed) => {
                      const updatedSchedule =
                        await scheduleCompletionMutation.mutateAsync({
                          scheduleId: editingSchedule.schedule_id,
                          completed,
                        });
                      setEditingSchedule(updatedSchedule);
                    }
                  : undefined
              }
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
                    const updatedSchedule = await updateMutation.mutateAsync({
                      scheduleId: editingSchedule.schedule_id,
                      payload: toPayload(baseForm),
                    });
                    setEditingSchedule(updatedSchedule);
                  }
                  if (additionalForms.length > 0) {
                    await createSchedulesMutation.mutateAsync(
                      additionalForms.map((form) => toPayload(form)),
                    );
                  }
                  closePanel();
                  return;
                }

                if (panelMode === "create" || panelMode === "repeat") {
                  const payloads = forms.map((form) => toPayload(form));
                  const createdSchedules =
                    await createSchedulesMutation.mutateAsync(payloads);
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
                  const updatedSchedule = await updateMutation.mutateAsync({
                    scheduleId: editingSchedule.schedule_id,
                    payload: toPayload(forms[0]),
                  });
                  setEditingSchedule(updatedSchedule);
                  closePanel();
                }
              }}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
