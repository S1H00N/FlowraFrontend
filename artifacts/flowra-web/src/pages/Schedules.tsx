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
  type Ref,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Repeat2,
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
import { useCompanySchedules } from "@/hooks/useCompanySchedules";
import { useCompleteTask, useCreateTask, useTasks } from "@/hooks/useTasks";
import { useCategories } from "@/hooks/useCategories";
import {
  TASK_PRIORITIES,
  SCHEDULE_TYPES,
  SCHEDULE_VISIBILITY_LABELS,
  type CompanySchedule,
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
import { CategoryDot } from "@/components/CategorySelect";
import AppShell from "@/components/AppShell";
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

const scheduleViewOptions: Array<{
  value: ScheduleCalendarView;
  label: string;
  shortcut: string;
}> = [
  { value: "day", label: "일", shortcut: "D" },
  { value: "week", label: "주", shortcut: "W" },
  { value: "month", label: "월", shortcut: "M" },
];

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
    color: "#10b981",
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

interface ScheduleCreateDraft {
  start: Date;
  end: Date;
  allDay?: boolean;
}

type ScheduleCompletionFilter = "all" | "active" | "completed";
type SchedulePanelLayout = "floating" | "docked";
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
  { value: "never", label: "종료 안 함" },
  { value: "until", label: "특정 날짜까지" },
  { value: "count", label: "반복 횟수 지정" },
];

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

type SchedulePanelAnchorElement =
  | HTMLElement
  | { clientX: number; clientY: number }
  | null;

type SchedulePanelFloatingStyle = CSSProperties & {
  "--schedule-panel-left"?: string;
  "--schedule-panel-top"?: string;
  "--schedule-panel-max-height"?: string;
};

function CompactDateInput({
  value,
  onChange,
  required = false,
  ariaLabel,
  inputRef,
  onCommit,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  ariaLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  onCommit?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(formatDateInputDisplay(value));
  const [previewDateKey, setPreviewDateKey] = useState(value);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? new Date()
      : new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [calendarStyle, setCalendarStyle] = useState<CSSProperties>({});
  const containerRef = useRef<HTMLLabelElement | null>(null);
  const highlightedDateKey = previewDateKey || value;
  const selectedDate = new Date(`${highlightedDateKey}T00:00:00`);
  const selectedKey = Number.isNaN(selectedDate.getTime())
    ? ""
    : toDateKey(selectedDate);
  const selectedMonth = Number.isNaN(selectedDate.getTime())
    ? null
    : new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const canResetVisibleMonth = !isCurrentMonth(visibleMonth);

  useEffect(() => {
    setDraft(formatDateInputDisplay(value));
    setPreviewDateKey(value);
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }, [value]);

  const updateCalendarPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;

    const calendarWidth = 280;
    const margin = 8;
    const inputRect = container.getBoundingClientRect();
    const panelRect = container.closest("aside")?.getBoundingClientRect();
    const availableLeft = panelRect
      ? panelRect.left - calendarWidth - margin
      : inputRect.left;
    const left = Math.max(margin, availableLeft);
    const maxTop = window.innerHeight - 328 - margin;
    const top = Math.max(margin, Math.min(inputRect.top, maxTop));

    setCalendarStyle({
      left,
      top,
      width: calendarWidth,
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    updateCalendarPosition();
    window.addEventListener("resize", updateCalendarPosition);
    window.addEventListener("scroll", updateCalendarPosition, true);

    return () => {
      window.removeEventListener("resize", updateCalendarPosition);
      window.removeEventListener("scroll", updateCalendarPosition, true);
    };
  }, [open, updateCalendarPosition]);

  const commitDate = (nextValue: string) => {
    const normalized = normalizeDateInput(nextValue, value);
    if (normalized) {
      onChange(normalized);
      setDraft(formatDateInputDisplay(normalized));
      setPreviewDateKey(normalized);
      setOpen(false);
      onCommit?.();
      return;
    }

    setDraft(formatDateInputDisplay(value));
    setPreviewDateKey(value);
  };

  const selectDate = (date: Date) => {
    const dateKey = toDateKey(date);
    onChange(dateKey);
    setDraft(formatDateInputDisplay(dateKey));
    setPreviewDateKey(dateKey);
    setVisibleMonth(getCalendarViewMonth(dateKey));
    setOpen(false);
    onCommit?.();
  };

  return (
    <label
      ref={containerRef}
      className={`relative flex h-9 min-w-0 items-center gap-2 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-slate-900 transition hover:border-slate-200 hover:bg-white focus-within:border-emerald-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-100 ${className}`}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        commitDate(draft);
        setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        type="text"
        required={required}
        value={draft}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraft(nextDraft);
          const normalized = normalizeDateInput(nextDraft, value);
          if (normalized) {
            setPreviewDateKey(normalized);
            setVisibleMonth(getCalendarViewMonth(normalized));
          }
          setOpen(true);
        }}
        onFocus={(event) => {
          setOpen(true);
          setPreviewDateKey(value);
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
              normalizeDateInput(draft, value) || value || toDateKey(new Date());
            const nextDateKey = moveDateByKeyboard(
              currentDraft,
              event.key === "ArrowDown" ? 1 : -1,
              event.shiftKey,
            );
            setDraft(formatDateInputDisplay(nextDateKey));
            setPreviewDateKey(nextDateKey);
            setVisibleMonth(getCalendarViewMonth(nextDateKey));
            setOpen(true);
          }
          if (event.key === "Escape") {
            setDraft(formatDateInputDisplay(value));
            setPreviewDateKey(value);
            setVisibleMonth(getCalendarViewMonth(value));
            setOpen(false);
          }
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
        className="h-full min-w-0 flex-1 bg-transparent p-0 text-sm font-medium text-slate-900 outline-none"
      />
      {open && (
        <div
          style={calendarStyle}
          className="fixed z-[70] rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-slate-100 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">
              {formatMonthTitle(visibleMonth)}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setVisibleMonth(getCalendarViewMonth(toDateKey(new Date())))}
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
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {buildMonthCells(visibleMonth).map((date, index) =>
              date ? (
                <button
                  key={toDateKey(date)}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectDate(date)}
                  className={`aspect-square rounded-md text-sm font-medium transition ${
                    toDateKey(date) === selectedKey
                      ? "bg-emerald-500 text-white"
                      : "text-slate-200 hover:bg-neutral-800"
                  }`}
                >
                  {date.getDate()}
                </button>
              ) : (
                <div key={`blank-${index}`} className="aspect-square" />
              ),
            )}
          </div>
        </div>
      )}
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

  return Array.from(
    new Set([
      normalized,
      ...timeDropdownOptions,
    ]),
  )
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
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectingOptionRef = useRef(false);
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
    const availableLeft = panelRect ? panelRect.left - dropdownWidth - margin : inputRect.left;
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

  return (
    <div
      ref={containerRef}
      className={`relative flex h-9 min-w-0 items-center gap-2 rounded-md text-sm font-medium text-slate-900 transition focus-within:ring-2 focus-within:ring-emerald-100 ${
        boxed
          ? "w-full border border-transparent bg-transparent px-2 hover:border-slate-200 hover:bg-white focus-within:border-emerald-300 focus-within:bg-white"
          : "w-auto px-0"
      } ${
        disabled ? "bg-slate-100 text-slate-400" : ""
      }`}
      onBlur={(event) => {
        if (selectingOptionRef.current) return;
        if (event.currentTarget.contains(event.relatedTarget)) return;
        commitTime(draft);
        setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
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
                  ? "bg-neutral-800 text-emerald-200"
                  : option === draftTimeOption || option === value
                  ? "bg-neutral-800 text-emerald-200"
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
  scheduleTypes: [],
  priorities: [],
  categories: [],
  completion: "all",
  q: "",
  location: "",
};

const COMPANY_SCHEDULE_ID_OFFSET = 1_000_000_000;
const companyScheduleAccent = "#2563eb";
const schedulePanelLayoutStorageKey = "flowra-schedule-panel-layout";

const defaultSchedulePanelFloatingStyle: SchedulePanelFloatingStyle = {
  "--schedule-panel-left": "calc(100vw - 402px)",
  "--schedule-panel-top": "96px",
  "--schedule-panel-max-height": "calc(100vh - 24px)",
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
  const floating =
    "xl:inset-auto xl:left-[var(--schedule-panel-left)] xl:top-[var(--schedule-panel-top)] xl:right-auto xl:bottom-auto xl:h-auto xl:max-h-[var(--schedule-panel-max-height)] xl:w-[390px] xl:max-w-[calc(100vw-24px)] xl:rounded-2xl xl:border xl:border-slate-200 xl:shadow-2xl xl:shadow-slate-900/10";
  const docked =
    "xl:static xl:z-auto xl:h-full xl:max-h-none xl:w-full xl:max-w-none xl:rounded-none xl:border-y-0 xl:border-l xl:border-r-0 xl:shadow-none";

  return `${base} ${layout === "floating" ? floating : docked}`;
}

function isSchedulePanelPointAnchor(
  anchor: SchedulePanelAnchorElement,
): anchor is { clientX: number; clientY: number } {
  return !!anchor && "clientX" in anchor && "clientY" in anchor;
}

function isCompanySchedule(schedule: Schedule) {
  return schedule.is_company_schedule === true;
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
      const margin = 12;
      const gap = 12;
      const panelWidth = 390;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const maxHeight = Math.max(
        360,
        Math.min(720, viewportHeight - margin * 2),
      );
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

      let top = anchorRect ? anchorRect.top : anchorPoint ? anchorPoint.clientY : 96;
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

function normalizeScheduleType(value: unknown): ScheduleType {
  return SCHEDULE_TYPES.includes(value as ScheduleType)
    ? (value as ScheduleType)
    : "other";
}

function companyScheduleToSchedule(schedule: CompanySchedule): Schedule {
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
    targets: schedule.targets,
    created_at: schedule.created_at ?? schedule.start_datetime,
    updated_at: schedule.updated_at,
  };
}

const repeatWeekdays = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
];

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

function getAllDayDateSpanLabel(startLocal: string, endLocal: string) {
  const startDateKey = dateFromLocalInput(startLocal);
  const endDateKey = dateFromLocalInput(endLocal) || startDateKey;
  if (!startDateKey) return "종일";

  const start = new Date(`${startDateKey}T00:00:00`);
  const end = new Date(`${endDateKey}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "종일";
  }

  const days =
    Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000)) + 1;
  return days > 1 ? `${days}일` : "종일";
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

  const fullMatch = /^(\d{4})[-/.\s]*(\d{1,2})[-/.\s]*(\d{1,2})/.exec(
    trimmed,
  );
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

function moveDateByKeyboard(dateKey: string, direction: -1 | 1, weekly = false) {
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

  if (days > 0) parts.push(`${days}\uC77C`);
  if (hours > 0) parts.push(`${hours}\uC2DC\uAC04`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}\uBD84`);

  return parts.join(" ");
}

function formatDurationLabel(startLocal: string, endLocal: string) {
  return getDurationText(startLocal, endLocal);
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
  const sameMonth =
    first.getFullYear() === last.getFullYear() &&
    first.getMonth() === last.getMonth();

  if (sameMonth) {
    return `${first.getFullYear()}년 ${first.getMonth() + 1}월 ${first.getDate()}일 - ${last.getDate()}일`;
  }

  return `${formatSelectedDate(first)} - ${formatSelectedDate(last)}`;
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

function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatYearlyRepeatDay(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function isLastWeekdayOfMonth(date: Date) {
  const nextSameWeekday = new Date(date);
  nextSameWeekday.setDate(date.getDate() + 7);
  return nextSameWeekday.getMonth() !== date.getMonth();
}

function buildRepeatTypeOptions(startLocal: string): RepeatTypeOption[] {
  const start = new Date(startLocal);
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const weekday = weekdayLabels[safeStart.getDay()];

  return [
    { value: "none", label: "반복 안 함" },
    { value: "daily", label: "매일" },
    { value: "weekdays", label: "평일마다", summary: "월~금" },
    { value: "weekends", label: "주말마다", summary: "토·일" },
    {
      value: "weekly",
      label: "매주",
      summary: `${weekday}요일`,
    },
    { value: "monthly", label: "매월", summary: `${safeStart.getDate()}일` },
    {
      value: "yearly",
      label: "매년",
      summary: formatYearlyRepeatDay(safeStart),
    },
    {
      value: "custom",
      label: "사용자 지정",
      summary: `2주마다 ${weekday}요일`,
    },
    {
      value: "selected-dates",
      label: "날짜 직접 선택",
    },
  ];
}

function formatDateChip(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  const weekday = weekdayLabels[date.getDay()];
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())}(${weekday})`;
}

function formatRepeatEndDateDisplay(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "날짜 선택";
  const weekday = weekdayLabels[date.getDay()];
  return `${date.getMonth() + 1}월 ${date.getDate()}(${weekday})`;
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

  return "종료 안 함";
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

  return {
    label: option.label,
    summary: option.summary,
  };
}

function formatRepeatOptionMenuDescription(
  option: RepeatTypeOption,
  customRepeat: CustomRepeat,
  customSelectedDates: string[],
) {
  switch (option.value) {
    case "none":
      return "반복 없이 한 번만";
    case "daily":
      return "매일 반복";
    case "weekdays":
      return "월~금 반복";
    case "weekends":
      return "토·일 반복";
    case "weekly":
      return option.summary ? `매주 ${option.summary}` : "매주 반복";
    case "monthly":
      return option.summary ? `매월 ${option.summary}` : "매월 반복";
    case "yearly":
      return option.summary ? `매년 ${option.summary}` : "매년 반복";
    case "custom":
      return formatCustomRepeatSummary(customRepeat);
    case "selected-dates":
      return customSelectedDates.length > 0
        ? formatSelectedDatesSummary(customSelectedDates)
        : "원하는 날짜를 직접 선택";
    default:
      return option.summary ?? "";
  }
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

function emptyFormForDate(date: Date): ScheduleFormState {
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
    if (end <= start) return "종료 시간은 시작 시간보다 늦어야 합니다.";
  }

  return null;
}

function formatTaskDue(iso?: string | null) {
  if (!iso) return "기한 없음";
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
          {isDone ? "완료" : null}
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
  const [addOpen, setAddOpen] = useState(false);
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
      setAddOpen(false);
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
          {tasks.length}개
        </span>
      </div>

      <button
        type="button"
        onClick={() => setAddOpen((open) => !open)}
        aria-expanded={addOpen}
        className="mt-3 flex h-10 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="h-4 w-4" />
          할 일 추가
        </span>
        <span className="text-xs text-slate-400">
          {addOpen ? "닫기" : "추가"}
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          addOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
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
        </div>
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      <div>
        {tasksQuery.isLoading ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-xs text-slate-500">
            연결된 할 일을 불러오는 중입니다.
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
            아직 연결된 할 일이 없습니다. 필요한 작업을 추가해 보세요.
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
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
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
  floatingStyle,
  panelLayout,
  onTogglePanelLayout,
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
  floatingStyle: SchedulePanelFloatingStyle;
  panelLayout: SchedulePanelLayout;
  onTogglePanelLayout: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [allDay, setAllDay] = useState(initial.all_day);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const onSubmitRef = useRef(onSubmit);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const endTimeInputRef = useRef<HTMLInputElement | null>(null);
  const startDateInputRef = useRef<HTMLInputElement | null>(null);
  const endDateInputRef = useRef<HTMLInputElement | null>(null);
  const repeatTypeDropdownRef = useRef<HTMLDivElement | null>(null);
  const repeatEndDropdownRef = useRef<HTMLDivElement | null>(null);
  const repeatTypePopupRef = useRef<HTMLDivElement | null>(null);
  const repeatEndPopupRef = useRef<HTMLDivElement | null>(null);
  const basicOptionsDropdownRef = useRef<HTMLDivElement | null>(null);
  const basicOptionsPopupRef = useRef<HTMLDivElement | null>(null);
  const customRepeatPopupRef = useRef<HTMLDivElement | null>(null);
  const selectedDatesPopupRef = useRef<HTMLDivElement | null>(null);
  const repeatTypeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const repeatEndTriggerRef = useRef<HTMLButtonElement | null>(null);
  const basicOptionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const repeatOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const repeatEndOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const repeatUntilInputRef = useRef<HTMLInputElement | null>(null);
  const repeatCountInputRef = useRef<HTMLInputElement | null>(null);
  const selectedDateButtonRefs = useRef<Record<string, HTMLButtonElement | null>>(
    {},
  );
  const lastAutoSaveSignatureRef = useRef(scheduleFormSignature(initial));
  const autoSaveSequenceRef = useRef(0);
  const syncingInitialSignatureRef = useRef<string | null>(null);
  const initialSignature = scheduleFormSignature(initial);
  const [selectedDates, setSelectedDates] = useState<string[]>([
    initial.start_local.slice(0, 10),
  ]);
  const [customSelectedDates, setCustomSelectedDates] = useState<string[]>([]);
  const [repeatStartDate, setRepeatStartDate] = useState(
    initial.start_local.slice(0, 10),
  );
  const [repeatTypeOpen, setRepeatTypeOpen] = useState(false);
  const [repeatEndOpen, setRepeatEndOpen] = useState(false);
  const [basicOptionsOpen, setBasicOptionsOpen] = useState(false);
  const [customRepeatOpen, setCustomRepeatOpen] = useState(false);
  const [selectedDatesOpen, setSelectedDatesOpen] = useState(false);
  const [repeatTypePopupStyle, setRepeatTypePopupStyle] =
    useState<CSSProperties>({});
  const [repeatEndPopupStyle, setRepeatEndPopupStyle] =
    useState<CSSProperties>({});
  const [basicOptionsPopupStyle, setBasicOptionsPopupStyle] =
    useState<CSSProperties>({});
  const [customRepeatPopupStyle, setCustomRepeatPopupStyle] =
    useState<CSSProperties>({});
  const [selectedDatesPopupStyle, setSelectedDatesPopupStyle] =
    useState<CSSProperties>({});
  const [selectedRepeatOption, setSelectedRepeatOption] = useState<RepeatType>(
    mode === "repeat" ? "weekly" : "none",
  );
  const [previewRepeatOption, setPreviewRepeatOption] =
    useState<RepeatType | null>(null);
  const [activeRepeatOptionIndex, setActiveRepeatOptionIndex] = useState(0);
  const [activeRepeatEndOptionIndex, setActiveRepeatEndOptionIndex] =
    useState(0);
  const [repeatEnabled, setRepeatEnabled] = useState(mode === "repeat");
  const [repeatEndType, setRepeatEndType] =
    useState<RepeatEndType>("never");
  const [repeatUntilDate, setRepeatUntilDate] = useState<string | null>(null);
  const [repeatCount, setRepeatCount] = useState<number | null>(null);
  const [customRepeat, setCustomRepeat] = useState<CustomRepeat>(() =>
    defaultCustomRepeat(initial.start_local.slice(0, 10)),
  );
  const [draftCustomRepeat, setDraftCustomRepeat] = useState<CustomRepeat>(() =>
    defaultCustomRepeat(initial.start_local.slice(0, 10)),
  );
  const [draftRepeatDates, setDraftRepeatDates] = useState<string[]>([]);
  const [selectedDatesCalendarMonth, setSelectedDatesCalendarMonth] = useState(
    () => getCalendarViewMonth(initial.start_local.slice(0, 10)),
  );
  const [activeSelectedDateKey, setActiveSelectedDateKey] = useState(
    initial.start_local.slice(0, 10),
  );
  const [selectedDatesError, setSelectedDatesError] = useState<string | null>(
    null,
  );
  const [previewStartLocal, setPreviewStartLocal] = useState<string | null>(null);
  const [previewEndLocal, setPreviewEndLocal] = useState<string | null>(null);
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
  const { data: scheduleCategories = [], isLoading: scheduleCategoriesLoading } =
    useCategories("schedule");
  const scheduleTypeSelectOptions = useMemo<
    CustomSelectOption<ScheduleType>[]
  >(
    () =>
      scheduleTypeOptions.map((option) => {
        const meta = scheduleTypeSelectMeta[option.value];
        return {
          label: meta?.label ?? option.label,
          value: option.value,
          colorDot: meta?.color,
          description: meta?.description,
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
          description: meta?.description,
        };
      }),
    [priorityOptions],
  );
  const categorySelectOptions = useMemo<
    CustomSelectOption<number | "">[]
  >(
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
  const isBasicRepeatMode = isRuleRepeatType(repeatType);
  const customSelectedDateKeys = useMemo(
    () => normalizeDateKeys(customSelectedDates),
    [customSelectedDates],
  );
  const targetDateKeys = isRepeatMode
    ? ruleRepeatDateKeys
    : repeatType === "selected-dates"
      ? customSelectedDateKeys
      : mode === "create"
        ? normalizeDateKeys(selectedDates)
        : [form.start_local.slice(0, 10)];
  const repeatControlLabel =
    formatRepeatOptionSummary(
      displayRepeatTypeOption,
      customRepeat,
      customSelectedDateKeys,
    );
  const repeatControlDisplay =
    getRepeatOptionDisplayParts(
      displayRepeatTypeOption,
      customRepeat,
      customSelectedDateKeys,
    );
  const selectedScheduleTypeLabel =
    scheduleTypeSelectOptions.find((option) => option.value === form.schedule_type)
      ?.label ?? scheduleTypeSelectMeta[form.schedule_type]?.label ?? "일정";
  const selectedPriorityLabel =
    prioritySelectOptions.find((option) => option.value === form.priority)
      ?.label ?? "보통";
  const basicOptionsValueLabel = `${selectedScheduleTypeLabel} · ${selectedPriorityLabel}`;
  const basicOptionsLabel = `기본 옵션 · ${selectedScheduleTypeLabel} · ${selectedPriorityLabel}`;
  const previewForms =
    mode === "create" || isRepeatMode || isSelectedDatesMode
      ? buildFormsForDateKeys(form, targetDateKeys)
      : [form];
  const displayStartLocal = previewStartLocal ?? form.start_local;
  const displayEndLocal = previewEndLocal ?? form.end_local;
  const formTimeRangeLabel = formatTimeRange(displayStartLocal, displayEndLocal);
  const formDateRangeLabel = formatDateRange(displayStartLocal, displayEndLocal);
  const formDurationLabel = allDay
    ? ""
    : getDurationText(displayStartLocal, displayEndLocal);
  const autoSaveSignature = useMemo(
    () => scheduleFormSignature(form),
    [form],
  );

  useEffect(() => {
    syncingInitialSignatureRef.current = initialSignature;
    setForm(initial);
    setAllDay(initial.all_day);
    setSelectedDates([initial.start_local.slice(0, 10)]);
    setCustomSelectedDates([]);
    setRepeatStartDate(initial.start_local.slice(0, 10));
    setRepeatTypeOpen(false);
    setRepeatEndOpen(false);
    setBasicOptionsOpen(false);
    setCustomRepeatOpen(false);
    setSelectedDatesOpen(false);
    setPreviewRepeatOption(null);
    setSelectedRepeatOption(mode === "repeat" ? "weekly" : "none");
    setRepeatEnabled(mode === "repeat");
    setRepeatEndType("never");
    setRepeatUntilDate(null);
    setRepeatCount(null);
    const nextCustomRepeat = defaultCustomRepeat(initial.start_local.slice(0, 10));
    setCustomRepeat(nextCustomRepeat);
    setDraftCustomRepeat(cloneCustomRepeat(nextCustomRepeat));
    setDraftRepeatDates([]);
    setSelectedDatesCalendarMonth(
      getCalendarViewMonth(initial.start_local.slice(0, 10)),
    );
    setActiveSelectedDateKey(initial.start_local.slice(0, 10));
    setSelectedDatesError(null);
    lastAutoSaveSignatureRef.current = initialSignature;
    setAutoSaveState("idle");
    setPreviewStartLocal(null);
    setPreviewEndLocal(null);
    setError(null);
  }, [initialSignature, mode]);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);

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
      const positionFor = (nextPlacement: "right" | "left" | "bottom" | "top") => {
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
      const preferredPosition =
        placementOrder.map(positionFor).find(fits) ?? positionFor(placement);

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
      !basicOptionsOpen &&
      !customRepeatOpen &&
      !selectedDatesOpen
    ) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (repeatTypeDropdownRef.current?.contains(target) ||
          repeatEndDropdownRef.current?.contains(target) ||
          repeatTypePopupRef.current?.contains(target) ||
          repeatEndPopupRef.current?.contains(target) ||
          basicOptionsDropdownRef.current?.contains(target) ||
          basicOptionsPopupRef.current?.contains(target) ||
          customRepeatPopupRef.current?.contains(target) ||
          selectedDatesPopupRef.current?.contains(target) ||
          (target instanceof Element &&
            target.closest(".schedule-basic-options-select-menu")))
      ) {
        return;
      }

      setRepeatTypeOpen(false);
      setRepeatEndOpen(false);
      setBasicOptionsOpen(false);
      setCustomRepeatOpen(false);
      setSelectedDatesOpen(false);
      setPreviewRepeatOption(null);
      setSelectedDatesError(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRepeatTypeOpen(false);
      setRepeatEndOpen(false);
      setBasicOptionsOpen(false);
      setCustomRepeatOpen(false);
      setSelectedDatesOpen(false);
      setPreviewRepeatOption(null);
      setSelectedDatesError(null);
      const triggerToFocus = basicOptionsOpen
        ? basicOptionsTriggerRef.current
        : repeatEndOpen
          ? repeatEndTriggerRef.current
          : repeatTypeTriggerRef.current;
      triggerToFocus?.focus();
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [
    basicOptionsOpen,
    customRepeatOpen,
    repeatEndOpen,
    repeatTypeOpen,
    selectedDatesOpen,
  ]);

  useEffect(() => {
    if (!repeatTypeOpen) return;

    const updatePosition = () =>
      updateFloatingPopupPosition(
        repeatTypeTriggerRef.current,
        setRepeatTypePopupStyle,
        260,
        420,
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
        260,
        260,
        "right",
      );

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [repeatEndOpen, updateFloatingPopupPosition]);

  useEffect(() => {
    if (!basicOptionsOpen) return;

    const updatePosition = () =>
      updateFloatingPopupPosition(
        basicOptionsTriggerRef.current,
        setBasicOptionsPopupStyle,
        340,
        620,
        "right",
      );

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [basicOptionsOpen, updateFloatingPopupPosition]);

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
    setRepeatTypeOpen(false);
    setRepeatEndOpen(false);
    setBasicOptionsOpen(false);
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
    setBasicOptionsOpen(false);
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
    setBasicOptionsOpen(false);
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
            setBasicOptionsOpen(false);
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
              setBasicOptionsOpen(false);
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
        <div className="max-h-[inherit] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-2xl shadow-slate-200/80">
          <div className="space-y-0.5">
            {repeatTypeOptions.map((option, index) => {
              const selected = selectedRepeatOption === option.value;
              const previewed = displayRepeatOption === option.value;
              const description = formatRepeatOptionMenuDescription(
                option,
                customRepeat,
                customSelectedDateKeys,
              );

              return (
                <div key={option.value}>
                  {option.dividerBefore ? (
                    <div className="my-1 border-t border-slate-100" />
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
                    className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition ${
                      selected
                        ? "bg-emerald-50 text-emerald-800"
                        : previewed
                          ? "bg-emerald-50/70 text-slate-950"
                          : "text-slate-700 hover:bg-emerald-50/70 hover:text-slate-950 focus:bg-emerald-50/70 focus:text-slate-950"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {option.label}
                      </span>
                      {description ? (
                        <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                          {description}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                        selected ? "text-emerald-600" : "text-transparent"
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

  const renderBasicOptionsControl = (
    className: string,
    options: { showIcon?: boolean; valueOnly?: boolean } = {},
  ) => {
    const showIcon = options.showIcon ?? true;
    const displayLabel = options.valueOnly
      ? basicOptionsValueLabel
      : basicOptionsLabel;

    return (
      <div
        ref={basicOptionsDropdownRef}
        className="relative flex w-full min-w-0"
      >
        <button
          ref={basicOptionsTriggerRef}
          type="button"
          onClick={() => {
            setRepeatTypeOpen(false);
            setRepeatEndOpen(false);
            setCustomRepeatOpen(false);
            setSelectedDatesOpen(false);
            setPreviewRepeatOption(null);
            setBasicOptionsOpen((open) => !open);
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " " ||
              event.key === "ArrowDown"
            ) {
              event.preventDefault();
              setRepeatTypeOpen(false);
              setRepeatEndOpen(false);
              setCustomRepeatOpen(false);
              setSelectedDatesOpen(false);
              setPreviewRepeatOption(null);
              setBasicOptionsOpen(true);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setBasicOptionsOpen(false);
            }
          }}
          className={className}
          aria-haspopup="dialog"
          aria-expanded={basicOptionsOpen}
          aria-controls="schedule-basic-options-panel"
          aria-label={basicOptionsLabel}
        >
          {showIcon ? <SlidersHorizontal className="h-4 w-4 shrink-0" /> : null}
          <span className="min-w-0 flex-1 truncate text-left">
            {displayLabel}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition ${
              basicOptionsOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
    );
  };

  const renderBasicOptionsPopover = () => {
    if (!basicOptionsOpen) return null;

    return renderFloatingPortal(
      <div
        id="schedule-basic-options-panel"
        ref={basicOptionsPopupRef}
        role="dialog"
        aria-label="기본 옵션"
        style={basicOptionsPopupStyle}
        className="fixed z-[120] max-h-[min(620px,calc(100vh-20px))] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl shadow-slate-200/80 outline-none"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <SlidersHorizontal className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-950">기본 옵션</h3>
          </div>
          <button
            type="button"
            onClick={() => setBasicOptionsOpen(false)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="기본 옵션 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">
              일정 유형
            </span>
            <CustomSelect
              ariaLabel="일정 유형"
              value={form.schedule_type}
              options={scheduleTypeSelectOptions}
              side="right"
              sideOffset={10}
              contentClassName="schedule-basic-options-select-menu"
              onChange={(value) =>
                setForm({
                  ...form,
                  schedule_type: value,
                })
              }
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">
              우선순위
            </span>
            <CustomSelect
              ariaLabel="우선순위"
              value={form.priority}
              options={prioritySelectOptions}
              side="right"
              sideOffset={10}
              contentClassName="schedule-basic-options-select-menu"
              onChange={(value) =>
                setForm({
                  ...form,
                  priority: value,
                })
              }
            />
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">장소</span>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={form.location}
                onChange={(event) =>
                  setForm({ ...form, location: event.target.value })
                }
                placeholder="회의실, 카페, 그 외 장소"
                className="h-11 w-full rounded-lg border border-slate-200 bg-white py-0 pl-9 pr-3.5 text-sm font-medium text-slate-900 shadow-sm shadow-slate-200/40 outline-none transition placeholder:text-slate-400 hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-500">
              카테고리
            </span>
            <CustomSelect
              ariaLabel="카테고리"
              value={form.category_id}
              options={categorySelectOptions}
              disabled={scheduleCategoriesLoading}
              placeholder="카테고리 없음"
              side="right"
              sideOffset={10}
              contentClassName="schedule-basic-options-select-menu"
              onChange={(value) => setForm({ ...form, category_id: value })}
            />
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Pencil className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-slate-600" />
              <span className="text-sm font-bold text-slate-800">
                상세 설정
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-500">
              {detailsOpen ? "접기" : "펼치기"}
              <ChevronDown
                className={`h-4 w-4 transition ${
                  detailsOpen ? "rotate-180 text-emerald-500" : ""
                }`}
              />
            </span>
          </button>

          {detailsOpen ? (
            <div className="space-y-3 border-t border-slate-200 bg-white p-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-500">
                  설명
                </span>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) =>
                    setForm({ ...form, description: event.target.value })
                  }
                  placeholder="상세 설명"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium leading-6 text-slate-900 shadow-sm shadow-slate-200/40 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-500">
                  공개 범위
                </span>
                <select
                  value={form.visibility}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      visibility: event.target.value as ScheduleVisibility,
                    })
                  }
                  className="h-11 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-900 shadow-sm shadow-slate-200/40 outline-none transition hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/50 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
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
          ) : null}
        </div>
      </div>
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
    setRepeatUntilDate((prev) =>
      prev && prev < nextDateKey ? nextDateKey : prev,
    );
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
        className={`relative inline-flex h-3.5 w-7 shrink-0 items-center rounded-full border transition peer-focus-visible:ring-2 peer-focus-visible:ring-blue-200 ${
          allDay
            ? "border-blue-500 bg-blue-500"
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
      syncCustomRepeatEnd("until", nextDate, null);
      window.requestAnimationFrame(() => {
        const input = repeatUntilInputRef.current;
        input?.focus();
        input?.showPicker?.();
      });
      return;
    }

    const nextCount = repeatCount ?? 10;
    setRepeatUntilDate(null);
    setRepeatCount(nextCount);
    syncCustomRepeatEnd("count", null, nextCount);
    window.requestAnimationFrame(() => repeatCountInputRef.current?.focus());
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
          setBasicOptionsOpen(false);
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
            setBasicOptionsOpen(false);
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

    return renderFloatingPortal(
        <div
          id="repeat-end-menu"
          ref={repeatEndPopupRef}
          role="dialog"
          aria-label="반복 종료"
          style={repeatEndPopupStyle}
          className="fixed z-[120] max-h-[inherit] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl shadow-slate-200/80 outline-none"
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
                  className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium outline-none transition ${
                    selected
                      ? "bg-emerald-50 text-emerald-700"
                      : active
                        ? "bg-emerald-50/70 text-slate-950"
                        : "text-slate-700 hover:bg-emerald-50/70 hover:text-slate-950 focus:bg-emerald-50/70 focus:text-slate-950"
                  }`}
                >
                  {label}
                  {selected ? <Check className="h-4 w-4" /> : null}
                </button>
              );
            })}
          </div>

          {repeatEndType === "until" ? (
            <div className="mt-1 border-t border-slate-100 px-2 pt-2">
              <div className="mb-1 text-xs font-semibold text-slate-500">
                종료 날짜
              </div>
              <input
                ref={repeatUntilInputRef}
                type="date"
                min={repeatStartDate}
                value={repeatUntilDate ?? repeatStartDate}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  const normalizedDate =
                    nextDate && nextDate >= repeatStartDate
                      ? nextDate
                      : repeatStartDate;
                  setRepeatUntilDate(normalizedDate);
                  syncCustomRepeatEnd("until", normalizedDate, null);
                }}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <div className="mt-1 text-xs font-medium text-slate-500">
                {formatRepeatEndSummary(
                  "until",
                  repeatUntilDate ?? repeatStartDate,
                  null,
                )}
              </div>
            </div>
          ) : null}

          {repeatEndType === "count" ? (
            <div className="mt-1 border-t border-slate-100 px-2 pt-2">
              <div className="mb-1 text-xs font-semibold text-slate-500">
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
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <div className="mt-1 text-xs font-medium text-slate-500">
                {formatRepeatEndSummary("count", null, repeatCount ?? 10)}
              </div>
            </div>
          ) : null}
        </div>
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
          ? draftCustomRepeat.endDate ?? repeatStartDate
          : null,
      count:
        draftCustomRepeat.endType === "count"
          ? Math.max(1, Number(draftCustomRepeat.count) || 4)
          : null,
    };

    setCustomRepeat(normalized);
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

  const cancelSelectedDates = () => {
    setSelectedDatesOpen(false);
    setDraftRepeatDates(customSelectedDateKeys);
    setSelectedDatesError(null);
    repeatTypeTriggerRef.current?.focus();
  };

  const completeSelectedDates = () => {
    const normalizedDates = normalizeDateKeys(draftRepeatDates);
    if (normalizedDates.length === 0) {
      setSelectedDatesError("날짜를 하나 이상 선택해 주세요.");
      return;
    }

    setCustomSelectedDates(normalizedDates);
    setSelectedRepeatOption("selected-dates");
    setRepeatEnabled(true);
    setSelectedDatesOpen(false);
    setSelectedDatesError(null);
    repeatTypeTriggerRef.current?.focus();
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
            className="h-9 w-14 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
              className="h-9 w-20 appearance-none rounded-md border border-slate-200 bg-white px-3 pr-8 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
                      ? "border-blue-500 bg-blue-500 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
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
              className="h-4 w-4 accent-blue-500"
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
              className="h-4 w-4 accent-blue-500"
              aria-label="날짜에 종료"
            />
            <div
              className={`relative h-9 w-32 rounded-md border px-3 text-sm leading-9 transition ${
                draftCustomRepeat.endType === "until"
                  ? "border-slate-200 bg-white text-slate-800"
                  : "border-slate-100 bg-slate-50 text-slate-300"
              }`}
            >
              {formatRepeatEndDateDisplay(
                draftCustomRepeat.endDate ?? repeatStartDate,
              )}
              <input
                type="date"
                min={repeatStartDate}
                value={draftCustomRepeat.endDate ?? repeatStartDate}
                onClick={() =>
                  updateDraftCustomRepeat({
                    endType: "until",
                    endDate: draftCustomRepeat.endDate ?? repeatStartDate,
                    count: null,
                  })
                }
                onChange={(event) =>
                  updateDraftCustomRepeat({
                    endType: "until",
                    endDate:
                      event.target.value && event.target.value >= repeatStartDate
                        ? event.target.value
                        : repeatStartDate,
                    count: null,
                  })
                }
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="반복 종료 날짜"
              />
            </div>
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
              className="h-4 w-4 accent-blue-500"
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
              className="h-9 w-16 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-300"
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
            className="h-9 rounded-md bg-blue-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-600"
          >
            완료
          </button>
        </div>
      </div>
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
            {weekdayLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {buildMonthCells(selectedDatesCalendarMonth).map((date, index) => {
              if (!date) {
                return <div key={`blank-${index}`} className="aspect-square" />;
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
                      ? "bg-emerald-500 text-white shadow-sm"
                      : today
                        ? "text-emerald-300 ring-1 ring-emerald-600/60 hover:bg-neutral-800"
                        : "text-slate-200 hover:bg-neutral-800 hover:text-white"
                  } ${
                    active && !selected
                      ? "ring-2 ring-emerald-500/40"
                      : ""
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDatesError ? (
          <p className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-2 text-xs font-semibold text-red-100">
            {selectedDatesError}
          </p>
        ) : null}
      </div>
    );
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

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

    if ((mode === "create" || isRepeatMode) && !isSelectedDatesMode && targetDateKeys.length > 100) {
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

    if ((!isRepeatMode && !isSelectedDatesMode) || targetDateKeys.length === 0) {
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
    "flex h-9 w-full min-w-0 cursor-pointer items-center justify-between gap-2 rounded-md border border-transparent px-2.5 text-sm font-semibold text-slate-900 outline-none transition hover:border-slate-200 hover:bg-white focus-visible:border-emerald-300 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-100";
  const settingsRowLabelClass =
    "px-2 text-xs font-semibold text-slate-500";

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-950/20 xl:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        style={floatingStyle}
        className={getSchedulePanelClassName(panelLayout)}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-slate-500">
              {mode === "edit"
                ? "일정 수정"
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
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={onTogglePanelLayout}
              aria-label={
                panelLayout === "docked" ? "패널 도킹 해제" : "패널 도킹"
              }
              title={panelLayout === "docked" ? "패널 도킹 해제" : "패널 도킹"}
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900 xl:inline-flex"
            >
              {panelLayout === "docked" ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4"
        >
          <div className="space-y-2">
            <label className="block border-b border-slate-200/70 pb-2">
              <input
                ref={titleInputRef}
                type="text"
                required
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="일정 제목"
                className="h-11 w-full rounded-md border border-transparent bg-transparent px-2 text-lg font-semibold text-slate-950 outline-none transition-[border-color,background-color,opacity,box-shadow] duration-150 placeholder:text-slate-400 hover:border-slate-200 hover:bg-white/60 focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-100"
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
                    <span className="hidden">
                      시간
                    </span>
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
                    <span className="whitespace-nowrap text-center text-slate-300">→</span>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <div className="w-[4.75rem] min-w-0">
                      <CompactTimeInput
                        disabled={allDay}
                        value={timeFromLocalInput(form.end_local)}
                        ariaLabel="종료 시간"
                        inputRef={endTimeInputRef}
                        onCommit={() => startDateInputRef.current?.focus()}
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
                      <span className="whitespace-nowrap text-center text-slate-300">→</span>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <CompactDateInput
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
                    <div className="px-1">
                      {renderAllDayControl(
                        `inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm font-semibold transition ${
                          allDay
                            ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                            : "text-slate-700 hover:bg-slate-50"
                        }`,
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
                        <div className={settingsRowLabelClass}>반복</div>
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
                    </div>

                    <div className="border-t border-slate-100 pt-2">
                      <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-2">
                        <div className={settingsRowLabelClass}>기본 옵션</div>
                        {renderBasicOptionsControl(
                          `${settingsRowButtonClass} ${
                            basicOptionsOpen
                              ? "border-emerald-200 bg-white text-slate-900 shadow-sm shadow-emerald-100/70"
                              : "text-slate-700 hover:bg-slate-50"
                          }`,
                          { showIcon: false, valueOnly: true },
                        )}
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
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              <LinkedScheduleTasks schedule={schedule} />
            )}
          </div>
        </form>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 bg-white p-4">
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
              닫기
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
      {renderRepeatTypePopover()}
      {renderRepeatEndPopover()}
      {renderBasicOptionsPopover()}
      {renderCustomRepeatPopover()}
      {renderSelectedDatesPopover()}
    </>
  );
}

function MiniCalendar({
  visibleMonth,
  selectedKey,
  dateMeta,
  weekDates,
  onMoveMonth,
  onResetMonth,
  onSelectDate,
}: {
  visibleMonth: Date;
  selectedKey: string;
  dateMeta: Map<string, DayMeta>;
  weekDates: Date[];
  onMoveMonth: (offset: number) => void;
  onResetMonth: () => void;
  onSelectDate: (date: Date) => void;
}) {
  const today = new Date();
  const isCurrentMonth =
    visibleMonth.getFullYear() === today.getFullYear() &&
    visibleMonth.getMonth() === today.getMonth();
  const compactCells = useMemo(
    () => buildFullMonthCells(visibleMonth),
    [visibleMonth],
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
        : "bg-teal-500";

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
        <div className="mt-2 grid grid-cols-7 gap-y-1 overflow-hidden rounded-xl text-center">
          {compactCells.map(({ date: day, currentMonth }, index) => {
              const key = toDateKey(day);
              const selected = key === selectedKey;
              const meta = dateMeta.get(key);
              const today = isToday(day);
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
                  } ${
                    selectedWeek && !selected ? "bg-slate-100" : ""
                  } ${
                    selected
                      ? "z-10 rounded-lg !bg-red-500 !text-white shadow-sm"
                      : currentMonth
                        ? today
                          ? "rounded-lg !bg-red-500 !text-white shadow-sm"
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
  const category = categories.find(
    (c) => c.category_id === schedule.category_id,
  );
  const readOnly = isCompanySchedule(schedule);
  const accentColor =
    (readOnly ? companyScheduleAccent : category?.color) ??
    (schedule.schedule_type === "deadline" ? "#f43f5e" : "#10b981");

  return (
    <li
      id={`schedule-${schedule.schedule_id}`}
      onClick={
        readOnly ? (event) => onEdit(event.currentTarget) : undefined
      }
      className={`group relative overflow-hidden rounded-lg border bg-white p-4 shadow-sm shadow-slate-200/60 transition hover:border-emerald-200 hover:shadow-md ${
        readOnly ? "cursor-pointer" : ""
      } ${
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
        {selectable && !readOnly && (
          <label className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={!!selected}
              onChange={onToggleSelect}
              aria-label={`${schedule.title} select schedule`}
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
            {readOnly && (
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                회사
              </span>
            )}
            {schedule.company?.name && (
              <span className="rounded-md border border-blue-100 bg-blue-50/70 px-2 py-0.5 text-[11px] text-blue-700">
                {schedule.company.name}
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

        {readOnly ? (
          <span className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
            조회 전용
          </span>
        ) : (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={(event) => onEdit(event.currentTarget)}
              aria-label="Edit"
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
        )}
      </div>
    </li>
  );
}

function ScheduleReadonlyPanel({
  schedule,
  onClose,
  floatingStyle,
  panelLayout,
  onTogglePanelLayout,
}: {
  schedule: Schedule;
  onClose: () => void;
  floatingStyle: SchedulePanelFloatingStyle;
  panelLayout: SchedulePanelLayout;
  onTogglePanelLayout: () => void;
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

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-950/20 xl:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside
        style={floatingStyle}
        className={getSchedulePanelClassName(panelLayout)}
      >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-blue-700">회사 일정</p>
          <h2 className="mt-1 truncate text-base font-semibold text-slate-950">
            {schedule.title}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onTogglePanelLayout}
            aria-label={
              panelLayout === "docked" ? "Undock panel" : "Dock panel"
            }
            title={panelLayout === "docked" ? "Undock panel" : "Dock panel"}
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 xl:inline-flex"
          >
            {panelLayout === "docked" ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Edit"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
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
          <div>
            <dt className="text-xs font-medium text-slate-500">날짜와 시간</dt>
            <dd className="mt-1 text-slate-900">
              {dateLabel}
              <span className="ml-2 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
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
      {isCompanySchedule(schedule) && (
        <span className="shrink-0 rounded bg-white/60 px-1 text-[10px] font-semibold">
          회사
        </span>
      )}
      <span className="truncate">{schedule.title}</span>
    </button>
  );
}

function MonthSchedulePreview({
  schedule,
  categoryColors,
  active,
  muted = false,
  readOnly = false,
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
  onOpen: (anchorElement?: SchedulePanelAnchorElement) => void;
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
      className={`relative flex min-h-6 w-full min-w-0 touch-none items-center gap-2 overflow-hidden rounded-lg px-2 py-1 text-left text-xs transition hover:brightness-95 ${
        readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
      } ${
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
      {!readOnly && (
        <>
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
        </>
      )}
      <span className="shrink-0 font-medium">
        {schedule.all_day ? "종일" : formatTime(schedule.start_datetime)}
      </span>
      {isCompanySchedule(schedule) && (
        <span className="shrink-0 rounded bg-white/60 px-1 text-[10px] font-semibold">
          회사
        </span>
      )}
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
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] =
    useState<WeekScheduleInteraction | null>(null);
  const rowCount = Math.max(1, Math.ceil(cells.length / 7));

  const beginMonthInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    kind: WeekScheduleInteractionKind,
    schedule: Schedule,
  ) => {
    if (isCompanySchedule(schedule)) {
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
                  onCreateDay(day, event.currentTarget);
                }}
                className="mt-2 inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 opacity-100 transition hover:bg-emerald-50 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <Plus className="h-3.5 w-3.5" />
                추가
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
                    readOnly={isCompanySchedule(schedule)}
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
                    +{hiddenCount}??
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
  categoryColors: Map<number, string>,
) {
  if (isCompanySchedule(schedule)) return companyScheduleAccent;

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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const allDayGridRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dropSettleTimeoutRef = useRef<number | null>(null);
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
    if (isCompanySchedule(schedule)) {
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
    if (isCompanySchedule(schedule)) {
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
      end = new Date(start.getTime() + timedDropDurationMs(interaction.schedule));
      targetAllDay = false;
    } else if (interaction.kind === "move") {
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
    date.setHours(
      Math.floor(snappedMinutes / 60),
      snappedMinutes % 60,
      0,
      0,
    );
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

    if (event.detail >= 2) {
      onCreateDay(
        start,
        { clientX: event.clientX, clientY: event.clientY },
        {
          start,
          end,
          allDay: false,
        },
      );
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    setCreateInteraction({
      surface: "time",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
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
        ? { ...current, start, end }
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
    const dragged =
      Math.abs(event.clientX - finishedInteraction.startClientX) >= 4 ||
      Math.abs(event.clientY - finishedInteraction.startClientY) >= 4;

    setCreateInteraction(null);
    if (!dragged) return;

    onCreateDay(
      finishedInteraction.start,
      { clientX: event.clientX, clientY: event.clientY },
      {
        start: finishedInteraction.start,
        end: finishedInteraction.end,
        allDay: false,
      },
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

    const pointerIndex = allDayIndexFromPointer(event, 0);
    const { start, end } = normalizeAllDayCreateRange(
      createInteraction.anchorStart,
      pointerIndex,
    );

    setCreateInteraction((current) =>
      current && current.pointerId === event.pointerId
        ? { ...current, start, end }
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
    setCreateInteraction(null);
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

  const openCreateFromGridPointer = (
    event: ReactMouseEvent<HTMLElement>,
    fallbackDay: Date,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const start = dateFromGridPointer(event, fallbackDay);
    onCreateDay(start, panelAnchorFromPointer(event), {
      start,
      end: addMinutes(start, 30),
      allDay: false,
    });
  };

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
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700"
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
            <Plus className="h-4 w-4" />
            이 시간에 일정 추가
          </button>
        </div>
      )}
      <div style={{ minWidth: dayCount === 1 ? 560 : 1080 }}>
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
                  className={`border-r border-slate-100 px-1.5 py-1.5 last:border-r-0 ${weekdayColumnClass(day, selectedKey === key)}`}
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
                    className="inline-flex rounded-lg px-2 py-0.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            {createInteraction?.surface === "all-day" &&
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
                    className="pointer-events-none absolute top-1.5 z-40 h-7 rounded-md bg-emerald-100/90 px-2 text-left text-[11px] font-semibold leading-7 text-emerald-800 shadow-sm ring-1 ring-emerald-300"
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
              const color = scheduleAccentColor(schedule, categoryColors);
              const activeDraft =
                interaction?.surface === "all-day" &&
                interaction.scheduleId === schedule.schedule_id
                  ? interaction
                  : null;
              const activeSpan = activeDraft?.targetAllDay === false
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
              const readOnly = isCompanySchedule(schedule);

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
                    </>
                  )}
                  {readOnly && (
                    <span className="pointer-events-none mr-1 rounded bg-white/60 px-1 text-[10px]">
                      회사
                    </span>
                  )}
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
                  onPointerDown={(event) => beginTimedCreate(event, day)}
                  onPointerMove={(event) => updateTimedCreate(event, day)}
                  onPointerUp={endTimedCreate}
                  onPointerCancel={(event) => {
                    if (createInteraction?.pointerId === event.pointerId) {
                      setCreateInteraction(null);
                    }
                  }}
                  onDoubleClick={(event) =>
                    openCreateFromGridPointer(event, day)
                  }
                  onContextMenu={(event) => showCreateContextMenu(event, day)}
                  className={`relative border-r border-slate-100 transition hover:bg-emerald-50/20 last:border-r-0 ${weekdayColumnClass(day, selected)}`}
                />
              );
            })}

            {createInteraction?.surface === "time" && (
              <div
                className="pointer-events-none absolute z-40 rounded-lg bg-emerald-100/85 px-2 py-1 text-xs font-semibold text-emerald-800 shadow-sm ring-1 ring-emerald-300"
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
              const color = scheduleAccentColor(schedule, categoryColors);
              const activeDraft =
                interaction?.scheduleId === schedule.schedule_id
                  ? interaction
                  : null;
              const selected = activeScheduleId === schedule.schedule_id;
              const hovered = hoveredScheduleId === schedule.schedule_id;
              const readOnly = isCompanySchedule(schedule);
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
                    readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                  } ${
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
                      회사
                    </span>
                  )}
                  <span className="block truncate pr-2">{schedule.title}</span>
                  <span className="block truncate pr-2 text-[10px] opacity-80">
                    {formatTime(start.toISOString())} - {formatTime(end.toISOString())}
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
                    scheduleAccentColor(interaction.schedule, categoryColors),
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

  const [scheduleView, setScheduleView] =
    useState<ScheduleCalendarView>("week");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    () =>
      new Date(safeInitialDate.getFullYear(), safeInitialDate.getMonth(), 1),
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
  const [panelAnchorElement, setPanelAnchorElement] =
    useState<SchedulePanelAnchorElement>(null);
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

  useEffect(() => {
    window.localStorage.setItem(
      schedulePanelLayoutStorageKey,
      schedulePanelLayout,
    );
  }, [schedulePanelLayout]);

  const toggleSchedulePanelLayout = useCallback(() => {
    setSchedulePanelLayout((layout) =>
      layout === "docked" ? "floating" : "docked",
    );
  }, []);

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

  const schedulesQuery = useSchedules({
    start_from: monthRange.startFrom,
    start_to: monthRange.startTo,
    view: "month",
  });
  const companySchedulesQuery = useCompanySchedules({
    start_from: monthRange.startFrom,
    start_to: monthRange.startTo,
  });
  const data = schedulesQuery.data;
  const companySchedules = useMemo(
    () =>
      (companySchedulesQuery.data ?? []).map((schedule) =>
        companyScheduleToSchedule(schedule),
      ),
    [companySchedulesQuery.data],
  );
  const isLoading = schedulesQuery.isLoading || companySchedulesQuery.isLoading;
  const isError = schedulesQuery.isError || companySchedulesQuery.isError;
  const error = schedulesQuery.error ?? companySchedulesQuery.error;
  const isFetching =
    schedulesQuery.isFetching || companySchedulesQuery.isFetching;
  const refetchSchedules = () => {
    void schedulesQuery.refetch();
    void companySchedulesQuery.refetch();
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

  const items = useMemo(() => {
    const keyword = filters.q.trim().toLowerCase();
    const locationKeyword = filters.location.trim().toLowerCase();
    return [...(data ?? []), ...companySchedules]
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
    companySchedules,
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
        label: `검색 ${filters.q.trim()}`,
        reset: { q: "" },
      });
    }
    if (filters.location.trim()) {
      chips.push({
        key: "location",
        label: `장소 ${filters.location.trim()}`,
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

  const mainMonthCells = useMemo(
    () => buildFullMonthCells(visibleMonth),
    [visibleMonth],
  );

  const selectedKey = toDateKey(selectedDate);
  const todayKey = toDateKey(new Date());
  const todayWeekDates = useMemo(() => buildWeekDates(new Date()), []);
  const selectedSchedules = useMemo(
    () => items.filter((schedule) => scheduleOverlapsDay(schedule, selectedDate)),
    [items, selectedDate],
  );
  const editableSelectedSchedules = useMemo(
    () => selectedSchedules.filter((schedule) => !isCompanySchedule(schedule)),
    [selectedSchedules],
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
      new Set(editableSelectedSchedules.map((schedule) => schedule.schedule_id)),
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

  const openCreatePanel = (
    date = selectedDate,
    anchorElement: SchedulePanelAnchorElement = null,
    draft?: ScheduleCreateDraft,
  ) => {
    selectDate(date);
    setPanelAnchorElement(anchorElement);
    setViewingSchedule(null);
    setEditingSchedule(null);
    setDraftCreateForm(draft ? formFromCreateDraft(draft) : null);
    setPanelMode("create");
  };

  const openEditPanel = (
    schedule: Schedule,
    anchorElement: SchedulePanelAnchorElement = null,
  ) => {
    setPanelAnchorElement(anchorElement);
    setDraftCreateForm(null);

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
    if (isCompanySchedule(schedule)) {
      toast.info("회사 일정은 조회 전용입니다.");
      return;
    }

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
    setViewingSchedule(null);
    setDraftCreateForm(null);
    setPanelAnchorElement(null);
  };

  const formInitial =
    panelMode === "edit" && editingSchedule
      ? formFromSchedule(editingSchedule)
      : draftCreateForm ?? emptyFormForDate(selectedDate);

  const panelKey =
    panelMode === "edit" && editingSchedule
      ? `edit-${editingSchedule.schedule_id}`
      : `${panelMode ?? "create"}-${
          draftCreateForm ? scheduleFormSignature(draftCreateForm) : selectedKey
        }`;

  const allDaySchedules = selectedSchedules.filter(
    isAllDayLikeSchedule,
  );
  const timedSchedules = selectedSchedules.filter(
    (schedule) => !isAllDayLikeSchedule(schedule),
  );
  const schedulePanelOpen = panelMode !== null || viewingSchedule !== null;
  const dockedPanelOpen =
    schedulePanelOpen && schedulePanelLayout === "docked";
  const floatingPanelOpen =
    schedulePanelOpen && schedulePanelLayout === "floating";
  const floatingPanelStyle = useSchedulePanelFloatingStyle(
    panelAnchorElement,
    floatingPanelOpen,
  );

  return (
    <AppShell
      fullBleed
      titleMeta={currentViewSummary}
      sidebarExtra={
        scheduleView !== "month" ? (
          <MiniCalendar
            visibleMonth={miniCalendarMonth}
            selectedKey={todayKey}
            dateMeta={dateMeta}
            weekDates={todayWeekDates}
            onMoveMonth={moveMiniCalendarMonth}
            onResetMonth={resetMiniCalendarMonth}
            onSelectDate={selectDate}
          />
        ) : null
      }
    >
      <div className="h-full min-h-0 overflow-hidden bg-white">
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
            dockedPanelOpen
              ? "xl:grid-cols-[minmax(0,1fr)_340px]"
              : "xl:grid-cols-1"
          }`}
        >
          <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-x border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-end gap-2 border-b border-slate-100 bg-white px-4 py-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-8 min-w-20 items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50"
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
                        onSelect={() => setScheduleView(option.value)}
                        className={`gap-3 rounded-md px-2.5 py-2 text-sm text-slate-200 focus:bg-neutral-800 focus:text-white ${
                          scheduleView === option.value ? "bg-neutral-800" : ""
                        }`}
                      >
                        <span className="flex h-4 w-4 items-center justify-center text-emerald-400">
                          {scheduleView === option.value && (
                            <Check className="h-4 w-4" />
                          )}
                        </span>
                        <span
                          className={`font-medium ${
                            scheduleView === option.value
                              ? "text-emerald-200"
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
                    aria-label="이전 범위"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveCurrentRange(1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label="다음 범위"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen((open) => !open)}
                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition ${
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
                {scheduleView === "day" && editableSelectedSchedules.length > 0 && (
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
                <button
                  type="button"
                  onClick={(event) =>
                    openCreatePanel(selectedDate, event.currentTarget)
                  }
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                >
                  <CalendarDays className="h-4 w-4" />+ 일정 추가
                </button>
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
                    필터 초기화
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
                          placeholder="Title, description, location"
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
                        Completion
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
                  selectedKey={selectedKey}
                  categoryColors={categoryColors}
                  activeScheduleId={
                    editingSchedule?.schedule_id ??
                    viewingSchedule?.schedule_id ??
                    null
                  }
                  onOpenDay={(date) => {
                    selectDate(date);
                    setScheduleView("day");
                  }}
                  onCreateDay={(date, anchorElement, draft) =>
                    openCreatePanel(date, anchorElement, draft)
                  }
                  onOpenSchedule={(schedule, anchorElement) => {
                    selectDate(new Date(schedule.start_datetime));
                    openEditPanel(schedule, anchorElement);
                  }}
                  onScheduleTimeChange={moveScheduleOnCalendar}
                />
              ) : scheduleView === "week" ? (
                <WeekScheduleGrid
                  weekDates={weekDates}
                  schedulesByDate={schedulesByDate}
                  selectedKey={selectedKey}
                  categoryColors={categoryColors}
                  activeScheduleId={
                    editingSchedule?.schedule_id ??
                    viewingSchedule?.schedule_id ??
                    null
                  }
                  onOpenDay={(date) => {
                    selectDate(date);
                    setScheduleView("day");
                  }}
                  onCreateDay={(date, anchorElement, draft) =>
                    openCreatePanel(date, anchorElement, draft)
                  }
                  onOpenSchedule={(schedule, anchorElement) => {
                    selectDate(new Date(schedule.start_datetime));
                    openEditPanel(schedule, anchorElement);
                  }}
                  onScheduleTimeChange={moveScheduleOnCalendar}
                />
              ) : scheduleView === "day" ? (
                <WeekScheduleGrid
                  weekDates={[selectedDate]}
                  schedulesByDate={schedulesByDate}
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
              floatingStyle={floatingPanelStyle}
              panelLayout={schedulePanelLayout}
              onTogglePanelLayout={toggleSchedulePanelLayout}
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
                  ? updateMutation.isPending || createSchedulesMutation.isPending
                  : panelMode === "create" || panelMode === "repeat"
                  ? createSchedulesMutation.isPending
                  : updateMutation.isPending
              }
              onClose={closePanel}
              floatingStyle={floatingPanelStyle}
              panelLayout={schedulePanelLayout}
              onTogglePanelLayout={toggleSchedulePanelLayout}
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
