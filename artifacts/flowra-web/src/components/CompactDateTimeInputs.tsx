import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserSettings, type WeekStartDay } from "@/lib/userSettings";

const weekdayLabels = [
  "\uC77C",
  "\uC6D4",
  "\uD654",
  "\uC218",
  "\uBAA9",
  "\uAE08",
  "\uD1A0",
];
const defaultWeekStart: WeekStartDay = "sunday";
const visibleTimeOptionCount = 7;

function pad(value: number) {
  return String(value).padStart(2, "0");
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

export function toDateKey(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateKeyFromLocalInput(value: string) {
  return value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

export function timeFromLocalInput(value: string) {
  return value.match(/T(\d{2}:\d{2})/)?.[1] ?? "";
}

export function localInputWithDateKey(
  value: string,
  dateKey: string,
  fallbackTime = "09:00",
) {
  if (!dateKey) return "";
  const time = timeFromLocalInput(value) || fallbackTime;
  return `${dateKey}T${time}`;
}

export function localInputWithTime(
  value: string,
  time: string,
  fallbackDateKeyOrLocal = "",
) {
  if (!time) return "";
  const fallbackDateKey =
    dateKeyFromLocalInput(fallbackDateKeyOrLocal) || fallbackDateKeyOrLocal;
  const dateKey =
    dateKeyFromLocalInput(value) || fallbackDateKey || toDateKey(new Date());
  return `${dateKey}T${time}`;
}

function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}\uB144 ${date.getMonth() + 1}\uC6D4`;
}

function formatDatePart(date: Date): string {
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  const dateText = `${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
  const text = `${dateText}(${weekdayLabels[date.getDay()]})`;

  return includeYear ? `${String(date.getFullYear()).slice(-2)}.${text}` : text;
}

function formatDateInputDisplay(dateKey: string): string {
  const date = dateKey ? new Date(`${dateKey}T00:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "\uB0A0\uC9DC \uC120\uD0DD";
  }
  return formatDatePart(date);
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

function buildMonthCells(
  date: Date,
  weekStart: WeekStartDay = defaultWeekStart,
): Array<Date | null> {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstWeekday = daysSinceWeekStart(new Date(year, month, 1), weekStart);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(new Date(year, month, day));
  }

  return cells;
}

function renderFloatingPortal(content: ReactNode) {
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

export function CompactDateInput({
  value,
  onChange,
  required = false,
  ariaLabel,
  inputRef,
  onCommit,
  onOpen,
  minDate,
  calendarBoundaryRef,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
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
  const fallbackDateKey = value || toDateKey(new Date());
  const clampDateKey = (dateKey: string) =>
    normalizedMinDate && dateKey < normalizedMinDate
      ? normalizedMinDate
      : dateKey;
  const effectiveValue = clampDateKey(fallbackDateKey);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(formatDateInputDisplay(effectiveValue));
  const [previewDateKey, setPreviewDateKey] = useState(effectiveValue);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    getCalendarViewMonth(effectiveValue),
  );
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
    setVisibleMonth(getCalendarViewMonth(effectiveValue));
  }, [effectiveValue]);

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
        [...candidates].sort((first, second) => {
          return visibleArea(second) - visibleArea(first);
        })[0];

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

  const closeCalendar = () => {
    setOpen(false);
    setCalendarReady(false);
  };

  const commitDate = useCallback(
    (nextValue: string) => {
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
    },
    [effectiveValue, onChange, onCommit],
  );

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
  }, [commitDate, draft, open]);

  const openCalendar = () => {
    onOpen?.();
    if (!open) setCalendarReady(false);
    setOpen(true);
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
      className={cn(
        "relative flex h-9 min-w-0 items-center gap-2 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium text-slate-900 transition hover:border-slate-200 hover:bg-white focus-within:border-violet-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100",
        className,
      )}
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
        aria-expanded={open}
        className="h-full min-w-0 flex-1 bg-transparent p-0 text-sm font-medium text-slate-900 outline-none"
      />
      {open
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
                    className={cn(
                      "h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-neutral-800 hover:text-white",
                      canResetVisibleMonth ? "inline-flex" : "hidden",
                    )}
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
                      className={cn(
                        "aspect-square rounded-md text-sm font-medium transition",
                        dateKey === selectedKey
                          ? "bg-violet-500 text-white"
                          : disabled
                            ? "cursor-not-allowed text-slate-600"
                            : "text-slate-200 hover:bg-neutral-800",
                      )}
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
    .sort((first, second) => {
      return (timeToMinutes(first) ?? 0) - (timeToMinutes(second) ?? 0);
    })
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

function formatTimeInputDisplay(value: string) {
  if (!value) return "--:--";
  const [hourText, minuteText = "00"] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;

  return `${pad(hour)}:${pad(minute)}`;
}

export function CompactTimeInput({
  value,
  onChange,
  required = false,
  disabled = false,
  ariaLabel,
  variant = "boxed",
  onCommit,
  inputRef,
  onValidDraftChange,
  className,
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
  className?: string;
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

  const commitTime = useCallback(
    (nextValue: string, options: { advance?: boolean } = {}) => {
      const normalized = normalizeTimeInput(nextValue);
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
    },
    [onChange, onCommit, value],
  );
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
  }, [commitTime, draft, open]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-9 min-w-0 items-center gap-2 rounded-md text-sm font-medium text-slate-900 transition focus-within:ring-2 focus-within:ring-violet-100",
        boxed
          ? "w-full border border-transparent bg-transparent px-2 hover:border-slate-200 hover:bg-white focus-within:border-violet-300 focus-within:bg-white"
          : "w-auto px-0",
        disabled && "bg-slate-100 text-slate-400",
        className,
      )}
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
              className={cn(
                "flex h-8 w-full items-center rounded-md px-2 text-left text-sm font-medium tabular-nums transition",
                index === activeOptionIndex ||
                  option === draftTimeOption ||
                  option === value
                  ? "bg-neutral-800 text-violet-200"
                  : "text-slate-100 hover:bg-neutral-800",
              )}
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
