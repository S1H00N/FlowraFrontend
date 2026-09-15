import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDays, addMonths, startOfMonth } from "date-fns";
import { ChevronDown, RotateCcw } from "lucide-react";
import { useHolidaysInRange } from "@/hooks/useHolidays";
import { useUserSettings, type WeekStartDay } from "@/lib/userSettings";
import type { Holiday } from "@/types";

type DayMeta = { count: number; hasDeadline: boolean };
const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (value: number) => String(value).padStart(2, "0");

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

export function MiniCalendar({
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
  dateMeta?: Map<string, DayMeta>;
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
      Array.from({ length: 7 }, (_, offset) =>
        toDateKey(addDays(start, offset)),
      ),
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
            const meta = dateMeta?.get(key);
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
                aria-label={
                  dateMeta
                    ? `${formatFullDate(date)} 일정 ${count}개`
                    : formatFullDate(date)
                }
              >
                {date.getDate()}
                {count > 0 && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-1 flex items-center justify-center"
                  >
                    <span
                      className={`h-1 w-1 rounded-full ${
                        highlight
                          ? "bg-current"
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

export default function SidebarMiniCalendar() {
  const navigate = useNavigate();
  const { weekStart, showHolidays } = useUserSettings();
  const [visibleMonth, setVisibleMonth] = useState(() =>
    startOfMonth(new Date()),
  );
  const holidayRange = useMemo(() => {
    const cells = buildMonthCells(visibleMonth, weekStart);
    return {
      start_date: cells[0].key,
      end_date: cells[cells.length - 1].key,
      public_only: true,
    };
  }, [visibleMonth, weekStart]);
  const holidaysQuery = useHolidaysInRange(holidayRange, {
    enabled: showHolidays,
  });
  const holidaysByDate = useMemo(() => {
    const grouped = new Map<string, Holiday[]>();
    if (!showHolidays) return grouped;
    for (const holiday of holidaysQuery.data ?? []) {
      if (holiday.is_public_holiday === false) continue;
      grouped.set(holiday.date, [
        ...(grouped.get(holiday.date) ?? []),
        holiday,
      ]);
    }
    return grouped;
  }, [holidaysQuery.data, showHolidays]);

  return (
    <div data-flowra-schedule-sidebar>
      <MiniCalendar
        visibleMonth={visibleMonth}
        selectedDateKey={toDateKey(new Date())}
        dateMode={false}
        holidaysByDate={holidaysByDate}
        weekStart={weekStart}
        onMoveMonth={(amount) =>
          setVisibleMonth((month) => addMonths(month, amount))
        }
        onResetMonth={() => setVisibleMonth(startOfMonth(new Date()))}
        onSelectDate={(date) => navigate(`/schedules?date=${toDateKey(date)}`)}
      />
    </div>
  );
}
