import { CalendarDays, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import {
  CompactDateInput,
  CompactTimeInput,
  toDateKey,
} from "@/components/CompactDateTimeInputs";
import CustomSelect from "@/components/ui/CustomSelect";
import { Button } from "@/components/ui/button";
import { taskDueLabel } from "@/lib/homeTasks";
import { cn } from "@/lib/utils";
import type { Schedule, Task } from "@/types";

export interface RescheduleDraft {
  date: string;
  time: string;
  duration: number;
}

function durationLabel(value: number) {
  return value < 60
    ? `${value}분`
    : `${Math.floor(value / 60)}시간${value % 60 ? ` ${value % 60}분` : ""}`;
}

const durations = [15, 30, 45, 60, 90, 120, 180, 240].map((value) => ({
  value,
  label: durationLabel(value),
}));

export function createRescheduleDraft(
  today: string,
  existing?: Schedule,
): RescheduleDraft {
  return {
    date: existing ? toDateKey(existing.start_datetime) : today,
    time: existing
      ? new Date(existing.start_datetime).toTimeString().slice(0, 5)
      : new Date().toTimeString().slice(0, 5),
    duration: existing?.end_datetime
      ? (Date.parse(existing.end_datetime) -
          Date.parse(existing.start_datetime)) /
        60_000
      : 60,
  };
}

export function getRescheduleStart(draft: RescheduleDraft) {
  return new Date(`${draft.date}T${draft.time}`);
}

export function isRescheduleStartPast(start: Date) {
  // Time inputs have minute precision, so the current minute remains usable.
  return start.getTime() < Math.floor(Date.now() / 60_000) * 60_000;
}

export function rescheduleDraftSummary(draft: RescheduleDraft, today: string) {
  const date = new Date(`${draft.date}T00:00:00`);
  const dateLabel =
    draft.date === today
      ? "오늘"
      : Number.isFinite(date.getTime())
        ? `${date.getMonth() + 1}월 ${date.getDate()}일`
        : "날짜 선택";
  return `${dateLabel} · ${draft.time || "시간 선택"} · ${durationLabel(draft.duration)}`;
}

export function isRescheduleDraftValid(draft: RescheduleDraft, today: string) {
  return (
    !!draft.date &&
    !!draft.time &&
    Number.isFinite(getRescheduleStart(draft).getTime()) &&
    draft.date >= today &&
    Number.isFinite(draft.duration) &&
    draft.duration > 0
  );
}

export function hasOpenRescheduleControl(element: HTMLElement | null) {
  return Boolean(
    element
      ?.closest('[role="dialog"]')
      ?.querySelector('[data-reschedule-fields] [aria-expanded="true"]'),
  );
}

export function RescheduleTaskSummary({
  task,
  today,
  timezone,
}: {
  task: Task;
  today: string;
  timezone: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="break-words text-sm font-semibold leading-5 text-slate-800">
        {task.title}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {taskDueLabel(task, today, timezone)}
      </p>
    </div>
  );
}

export function RescheduleRecoveryNotice({ existing }: { existing: Schedule }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800"
    >
      일정은 생성됐지만 할 일 연결을 확인해야 해요. 다시 시도하면 같은 일정에
      연결해요.
      <Link
        className="mt-1 block underline underline-offset-2"
        to={`/schedules?date=${toDateKey(existing.start_datetime)}&schedule_id=${existing.schedule_id}`}
      >
        생성된 일정 확인
      </Link>
    </div>
  );
}

const activeDateClass =
  "border-violet-400 bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-400 hover:border-violet-400 hover:bg-violet-100";
const inputClass =
  "h-10 rounded-lg border border-slate-200 bg-white px-3.5 shadow-sm shadow-slate-200/40 hover:border-slate-300 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100";

export function RescheduleFields({
  value,
  onChange,
  today,
  disabled = false,
  variant = "task",
}: {
  value: RescheduleDraft;
  onChange: (value: RescheduleDraft) => void;
  today: string;
  disabled?: boolean;
  variant?: "task" | "quick";
}) {
  const timeFieldLabel = variant === "quick" ? "기본 시작 시간" : "시작 시간";
  const durationFieldLabel =
    variant === "quick" ? "기본 소요 시간" : "예상 소요 시간";
  const customActive = value.date !== today;
  const selectedDate = new Date(`${value.date}T00:00:00`);
  const customLabel =
    customActive && Number.isFinite(selectedDate.getTime())
      ? `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`
      : "날짜 선택";
  const start = getRescheduleStart(value);
  const end =
    variant === "task" && isRescheduleDraftValid(value, today)
      ? new Date(start.getTime() + value.duration * 60_000)
      : null;
  const endTime = end?.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div data-reschedule-fields className="min-w-0 space-y-3">
      <fieldset
        disabled={disabled}
        className="grid min-w-0 gap-4 disabled:opacity-60"
      >
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium text-slate-600">
            {variant === "quick" ? "날짜" : "계획 날짜"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              aria-pressed={!customActive && value.date === today}
              disabled={disabled}
              className={cn(
                "h-10 min-w-0 px-2 shadow-none",
                !customActive && value.date === today && activeDateClass,
              )}
              onClick={() => {
                onChange({ ...value, date: today });
              }}
            >
              오늘
            </Button>
            <CompactDateInput
              ariaLabel="계획 날짜"
              value={value.date}
              onChange={(date) => {
                onChange({ ...value, date });
              }}
              minDate={today}
              required
              disabled={disabled}
              triggerLabel={customLabel}
              triggerPressed={customActive}
              triggerIcon={
                <CalendarDays aria-hidden className="h-4 w-4 shrink-0" />
              }
              className={cn(
                "h-10 rounded-lg border-slate-200 bg-white px-2.5 text-slate-700",
                customActive && activeDateClass,
              )}
            />
          </div>
        </div>
        <div
          className={cn(
            "grid min-w-0 gap-3",
            variant === "quick" ? "grid-cols-2" : "sm:grid-cols-2",
          )}
        >
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium text-slate-600">
              {timeFieldLabel}
            </p>
            <div className="relative">
              <CompactTimeInput
                ariaLabel={timeFieldLabel}
                value={value.time}
                onChange={(time) => onChange({ ...value, time })}
                emptyPlaceholder="시간 선택"
                required
                disabled={disabled}
                className={cn(inputClass, "pr-9")}
              />
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute right-3.5 top-3 h-4 w-4 text-slate-400"
              />
            </div>
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-xs font-medium text-slate-600">
              {durationFieldLabel}
            </p>
            <CustomSelect<number>
              ariaLabel={durationFieldLabel}
              value={value.duration}
              options={durations}
              triggerLabel={durationLabel(value.duration)}
              onChange={(duration) => onChange({ ...value, duration })}
              disabled={disabled}
              className="h-10"
            />
          </div>
        </div>
      </fieldset>
      {end ? (
        <p
          aria-live="polite"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        >
          <span className="text-xs text-slate-500">예상 시간</span>
          <span className="font-medium tabular-nums text-slate-700">
            {value.time} →{" "}
            {toDateKey(end) !== value.date
              ? `${end.getMonth() + 1}월 ${end.getDate()}일 `
              : ""}
            {endTime}
          </span>
        </p>
      ) : null}
    </div>
  );
}
