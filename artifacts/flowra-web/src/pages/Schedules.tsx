import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  SCHEDULES_QUERY_KEY,
  useDeleteSchedule,
  useSchedules,
  useUpdateSchedule,
} from "@/hooks/useSchedules";
import { createSchedule } from "@/api/schedules";
import { useCategories } from "@/hooks/useCategories";
import {
  SCHEDULE_TYPES,
  SCHEDULE_TYPE_LABELS,
  SCHEDULE_VISIBILITY_LABELS,
  type Schedule,
  type ScheduleType,
  type ScheduleVisibility,
} from "@/types";
import { getErrorMessage } from "@/lib/error";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import CategorySelect, { CategoryDot } from "@/components/CategorySelect";
import ReminderControl from "@/components/ReminderControl";
import AppShell from "@/components/AppShell";
import { toast } from "@/lib/toast";
import {
  applyDateWithTime,
  buildWeeklyRepeatDates,
  parseDateInput,
} from "@/utils/dateUtils";

function toLocalInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

function toDateKey(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatSelectedDate(date?: Date): string {
  if (!date) return "날짜를 선택해 주세요";
  return date.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function formatMonthTitle(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
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

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

const weeklyOptions = [
  { label: "월", value: 1 },
  { label: "화", value: 2 },
  { label: "수", value: 3 },
  { label: "목", value: 4 },
  { label: "금", value: 5 },
  { label: "토", value: 6 },
  { label: "일", value: 0 },
] as const;

interface DayMeta {
  count: number;
  hasDeadline: boolean;
}

interface ScheduleFormState {
  title: string;
  description: string;
  schedule_type: ScheduleType;
  start_local: string;
  end_local: string;
  all_day: boolean;
  location: string;
  visibility: ScheduleVisibility;
  category_id: number | "";
  repeat_mode: "none" | "weekly";
  repeat_weekdays: number[];
  repeat_end_date: string;
}

const emptyForm: ScheduleFormState = {
  title: "",
  description: "",
  schedule_type: "personal",
  start_local: "",
  end_local: "",
  all_day: false,
  location: "",
  visibility: "private",
  category_id: "",
  repeat_mode: "none",
  repeat_weekdays: [],
  repeat_end_date: "",
};

function ScheduleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  isPending,
  allowBatch,
}: {
  initial?: ScheduleFormState;
  submitLabel: string;
  onSubmit: (s: ScheduleFormState, previewDates: Date[]) => Promise<void> | void;
  onCancel?: () => void;
  isPending?: boolean;
  allowBatch?: boolean;
}) {
  const [form, setForm] = useState<ScheduleFormState>(initial ?? emptyForm);
  const [error, setError] = useState<string | null>(null);

  const previewDates = useMemo(() => {
    if (!form.start_local) return [];

    const start = new Date(form.start_local);
    if (Number.isNaN(start.getTime())) return [];

    if (form.repeat_mode === "none") return [start];

    const endDate = parseDateInput(form.repeat_end_date);
    if (!endDate) return [];

    const weekdays =
      form.repeat_weekdays.length > 0
        ? form.repeat_weekdays
        : [start.getDay()];

    return buildWeeklyRepeatDates({
      startDate: start,
      endDate,
      weekdays,
    }).map((date) => applyDateWithTime(date, start));
  }, [
    form.start_local,
    form.repeat_mode,
    form.repeat_end_date,
    form.repeat_weekdays,
  ]);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.start_local) {
      setError("제목과 시작 일시는 필수입니다.");
      return;
    }

    if (form.repeat_mode === "weekly") {
      if (form.repeat_weekdays.length === 0) {
        setError("반복 요일을 1개 이상 선택해 주세요.");
        return;
      }
      if (!form.repeat_end_date) {
        setError("반복 종료일을 선택해 주세요.");
        return;
      }
      if (previewDates.length === 0) {
        setError("반복 조건에 해당하는 날짜가 없습니다.");
        return;
      }
    }

    try {
      await onSubmit(form, previewDates);
      if (!initial) setForm(emptyForm);
    } catch (err) {
      setError(getErrorMessage(err, "저장에 실패했습니다."));
    }
  };

  const toggleWeekday = (weekday: number) => {
    setForm((prev: ScheduleFormState) => {
      const exists = prev.repeat_weekdays.includes(weekday);
      return {
        ...prev,
        repeat_weekdays: exists
          ? prev.repeat_weekdays.filter((d: number) => d !== weekday)
          : [...prev.repeat_weekdays, weekday].sort((a, b) => a - b),
      };
    });
  };

  return (
    <form
      onSubmit={handle}
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          required
          placeholder="일정 제목"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={form.schedule_type}
          onChange={(e) =>
            setForm({ ...form, schedule_type: e.target.value as ScheduleType })
          }
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          {SCHEDULE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SCHEDULE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={form.visibility}
          onChange={(e) =>
            setForm({
              ...form,
              visibility: e.target.value as ScheduleVisibility,
            })
          }
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          {Object.entries(SCHEDULE_VISIBILITY_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 flex-col text-xs text-slate-600">
          시작
          <input
            type="datetime-local"
            value={form.start_local}
            onChange={(e) => setForm({ ...form, start_local: e.target.value })}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-1 flex-col text-xs text-slate-600">
          종료
          <input
            type="datetime-local"
            value={form.end_local}
            onChange={(e) => setForm({ ...form, end_local: e.target.value })}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={form.all_day}
            onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
          />
          종일
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          placeholder="장소"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <CategorySelect
          type="schedule"
          value={form.category_id}
          onChange={(v) => setForm({ ...form, category_id: v })}
          className="sm:min-w-44"
        />
      </div>

      {allowBatch && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">반복 옵션</p>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() =>
                setForm((prev: ScheduleFormState) => ({
                  ...prev,
                  repeat_mode: "none",
                  repeat_weekdays: [],
                  repeat_end_date: "",
                }))
              }
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                form.repeat_mode === "none"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              반복 없음
            </button>
            <button
              type="button"
              onClick={() =>
                setForm((prev: ScheduleFormState) => {
                  const start = prev.start_local ? new Date(prev.start_local) : new Date();
                  const fallbackEnd = new Date(start);
                  fallbackEnd.setDate(fallbackEnd.getDate() + 28);
                  return {
                    ...prev,
                    repeat_mode: "weekly",
                    repeat_weekdays:
                      prev.repeat_weekdays.length > 0
                        ? prev.repeat_weekdays
                        : [start.getDay()],
                    repeat_end_date:
                      prev.repeat_end_date || toDateKey(fallbackEnd),
                  };
                })
              }
              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                form.repeat_mode === "weekly"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              매주 반복
            </button>
          </div>

          {form.repeat_mode === "weekly" && (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-xs font-medium text-slate-600">반복 요일</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {weeklyOptions.map((option) => {
                    const checked = form.repeat_weekdays.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                          checked
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white text-slate-700"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleWeekday(option.value)}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <label className="flex flex-col text-xs text-slate-600">
                반복 종료일
                <input
                  type="date"
                  value={form.repeat_end_date}
                  min={toDateKey(new Date(form.start_local || new Date()))}
                  onChange={(e) =>
                    setForm((prev: ScheduleFormState) => ({
                      ...prev,
                      repeat_end_date: e.target.value,
                    }))
                  }
                  className="mt-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          )}

          <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-700">
              일괄 추가 미리보기 ({previewDates.length}건)
            </p>
            {previewDates.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">
                반복 조건을 설정하면 생성될 날짜 목록이 여기에 표시됩니다.
              </p>
            ) : (
              <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-slate-600">
                {previewDates.map((d) => (
                  <li key={d.toISOString()} className="flex items-center justify-between">
                    <span>
                      {d.toLocaleDateString("ko-KR", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                      })}
                    </span>
                    <span className="text-slate-400">{weekdayLabels[d.getDay()]}요일</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <textarea
        placeholder="설명 (선택)"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        rows={2}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {isPending ? "저장 중..." : submitLabel}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function ScheduleRow({ schedule }: { schedule: Schedule }) {
  const [isEditing, setIsEditing] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteSchedule();
  const { data: categories = [] } = useCategories("schedule");
  const cat = categories.find((c) => c.category_id === schedule.category_id);

  if (isEditing) {
    return (
      <li className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <ScheduleForm
          submitLabel="저장"
          isPending={updateMutation.isPending}
          initial={{
            title: schedule.title,
            description: schedule.description ?? "",
            schedule_type: schedule.schedule_type,
            start_local: toLocalInputValue(schedule.start_datetime),
            end_local: toLocalInputValue(schedule.end_datetime),
            all_day: schedule.all_day,
            location: schedule.location ?? "",
            visibility: schedule.visibility,
            category_id: schedule.category_id ?? "",
            repeat_mode: "none",
            repeat_weekdays: [],
            repeat_end_date: "",
          }}
          onCancel={() => setIsEditing(false)}
          onSubmit={async (form) => {
            await updateMutation.mutateAsync({
              scheduleId: schedule.schedule_id,
              payload: {
                title: form.title.trim(),
                description: form.description || undefined,
                schedule_type: form.schedule_type,
                start_datetime: fromLocalInputValue(form.start_local),
                end_datetime: form.end_local
                  ? fromLocalInputValue(form.end_local)
                  : undefined,
                all_day: form.all_day,
                location: form.location || undefined,
                visibility: form.visibility,
                category_id:
                  form.category_id === "" ? undefined : Number(form.category_id),
              },
            });
            setIsEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-900">
              {schedule.title}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
              {SCHEDULE_TYPE_LABELS[schedule.schedule_type]}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
              {SCHEDULE_VISIBILITY_LABELS[schedule.visibility]}
            </span>
            {cat && (
              <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                <CategoryDot color={cat.color} />
                {cat.name}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {schedule.all_day
              ? "종일"
              : `${new Date(schedule.start_datetime).toLocaleString("ko-KR")}${
                  schedule.end_datetime
                    ? ` ~ ${new Date(schedule.end_datetime).toLocaleString("ko-KR")}`
                    : ""
                }`}
            {schedule.location ? ` · ${schedule.location}` : ""}
          </div>
          {schedule.description && (
            <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">
              {schedule.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setShowReminders((v) => !v)}
            className={`rounded-md border px-2 py-1 text-xs font-medium hover:bg-slate-100 ${
              showReminders
                ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            알림
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            수정
          </button>
          <button
            type="button"
            disabled={deleteMutation.isPending}
            onClick={async () => {
              if (!confirm("정말 삭제하시겠습니까?")) return;
              await deleteMutation.mutateAsync(schedule.schedule_id);
            }}
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            삭제
          </button>
        </div>
      </div>
      {showReminders && (
        <ReminderControl
          targetType="schedule"
          targetId={schedule.schedule_id}
        />
      )}
    </li>
  );
}

export default function Schedules() {
  const [calendarView, setCalendarView] = useState<"month" | "week">("month");
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    () => new Date(),
  );

  const queryClient = useQueryClient();

  const monthRange = useMemo(() => {
    const start = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      -6,
    );
    const end = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth() + 1,
      7,
    );
    return {
      startDate: toDateKey(start),
      endDate: toDateKey(end),
    };
  }, [visibleMonth]);

  const { data, isLoading, isError, error, isFetching, refetch } = useSchedules(
    {
      view: "month",
      start_date: monthRange.startDate,
      end_date: monthRange.endDate,
      size: 300,
    },
  );

  const items = useMemo(
    () =>
      [...(data?.items ?? [])].sort(
        (a, b) =>
          new Date(a.start_datetime).getTime() -
          new Date(b.start_datetime).getTime(),
      ),
    [data?.items],
  );

  const schedulesByDate = useMemo(() => {
    const grouped = new Map<string, Schedule[]>();
    for (const item of items) {
      const key = toDateKey(item.start_datetime);
      const bucket = grouped.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        grouped.set(key, [item]);
      }
    }
    return grouped;
  }, [items]);

  const dateMeta = useMemo(() => {
    const meta = new Map<string, DayMeta>();
    for (const [key, schedules] of schedulesByDate.entries()) {
      meta.set(key, {
        count: schedules.length,
        hasDeadline: schedules.some((s) => s.schedule_type === "deadline"),
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

  const selectedKey = selectedDate ? toDateKey(selectedDate) : "";
  const selectedSchedules = selectedKey
    ? (schedulesByDate.get(selectedKey) ?? [])
    : [];

  const weekDates = useMemo(
    () => buildWeekDates(selectedDate ?? new Date()),
    [selectedDate],
  );

  const moveMonth = (offset: number) => {
    setVisibleMonth((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + offset, 1);
      setSelectedDate(new Date(next.getFullYear(), next.getMonth(), 1));
      return next;
    });
  };

  const renderMarker = (meta?: DayMeta, selected?: boolean) => {
    if (!meta || meta.count === 0) return null;
    const dotClass = selected
      ? "bg-white/95"
      : meta.hasDeadline
        ? "bg-rose-400"
        : "bg-emerald-500";

    return (
      <span className="pointer-events-none absolute bottom-1.5 left-1/2 flex -translate-x-1/2 items-center gap-1">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {meta.count > 1 && (
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        )}
      </span>
    );
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Calendar board
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                캘린더
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                일정을 추가하고 관리하세요.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
            >
              홈으로
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">일정 빠른 추가</h2>
              <p className="text-xs text-slate-500">
                필요할 때만 입력 폼을 열어서 화면을 깔끔하게 유지합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreateFormOpen((v) => !v)}
              className="rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:-translate-y-0.5"
            >
              {isCreateFormOpen ? "입력 폼 닫기" : "일정 추가 열기"}
            </button>
          </div>

          {isCreateFormOpen && (
            <div className="mt-4">
              <ScheduleForm
                submitLabel="일정 추가"
                isPending={isCreating}
                allowBatch
                onSubmit={async (form, previewDates) => {
                  if (previewDates.length === 0) {
                    throw new Error("생성할 일정 날짜가 없습니다.");
                  }

                  const basePayload = {
                    title: form.title.trim(),
                    description: form.description || undefined,
                    schedule_type: form.schedule_type,
                    all_day: form.all_day,
                    location: form.location || undefined,
                    visibility: form.visibility,
                    category_id:
                      form.category_id === ""
                        ? undefined
                        : Number(form.category_id),
                  };

                  setIsCreating(true);

                  try {
                    const baseStart = new Date(form.start_local);
                    const baseEnd = form.end_local ? new Date(form.end_local) : undefined;

                    const endDiffMs = baseEnd
                      ? Math.max(0, baseEnd.getTime() - baseStart.getTime())
                      : undefined;

                    const payloads = previewDates.map((date) => {
                      const start = new Date(date);
                      const end =
                        typeof endDiffMs === "number"
                          ? new Date(start.getTime() + endDiffMs)
                          : undefined;

                      return {
                        ...basePayload,
                        start_datetime: start.toISOString(),
                        end_datetime: end?.toISOString(),
                      };
                    });

                    const results = await Promise.all(
                      payloads.map((payload) => createSchedule(payload)),
                    );

                    const failed = results.find((result) => !result.success);
                    if (failed) {
                      throw new Error(
                        failed.message || "일정 일괄 추가 중 오류가 발생했습니다.",
                      );
                    }

                    await queryClient.invalidateQueries({
                      queryKey: SCHEDULES_QUERY_KEY,
                    });
                    toast.success(`${payloads.length}개의 일정을 추가했습니다.`);
                    setIsCreateFormOpen(false);
                  } catch (err) {
                    const message = getErrorMessage(
                      err,
                      "일정 일괄 추가에 실패했습니다.",
                    );
                    toast.error(message);
                    throw new Error(message);
                  } finally {
                    setIsCreating(false);
                  }
                }}
              />
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-[540px_minmax(0,1fr)]">
          <div className="rounded-[28px] border border-slate-200 bg-slate-100/80 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] sm:p-5">
            <div className="rounded-2xl bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-2 py-2">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/70"
                  aria-label="이전 달"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <p className="text-xl font-semibold text-slate-900">
                  {formatMonthTitle(visibleMonth)}
                </p>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/70"
                  aria-label="다음 달"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 rounded-xl bg-slate-200/80 p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setCalendarView("month")}
                  className={`rounded-lg px-3 py-2 font-medium transition ${
                    calendarView === "month"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  월간 보기
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarView("week")}
                  className={`rounded-lg px-3 py-2 font-medium transition ${
                    calendarView === "week"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  주간 보기
                </button>
              </div>

              <div className="mt-4 rounded-2xl bg-white p-2">
                {isLoading ? (
                  <div className="h-[300px] animate-pulse rounded-xl bg-slate-100" />
                ) : isError ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-8 text-sm text-red-700">
                    캘린더를 불러오지 못했습니다.
                  </p>
                ) : calendarView === "month" ? (
                  <>
                    <div className="grid grid-cols-7 gap-2 px-1 text-center text-xs font-medium">
                      {weekdayLabels.map((label, idx) => (
                        <span
                          key={label}
                          className={
                            idx === 0
                              ? "text-rose-500"
                              : idx === 6
                                ? "text-blue-500"
                                : "text-slate-500"
                          }
                        >
                          {label}
                        </span>
                      ))}
                    </div>

                    <div className="mt-2 grid grid-cols-7 gap-2">
                      {monthCells.map((day, index) => {
                        if (!day) {
                          return <div key={`blank-${index}`} className="h-12" />;
                        }

                        const key = toDateKey(day);
                        const meta = dateMeta.get(key);
                        const isSelected = key === selectedKey;
                        const dayOfWeek = day.getDay();
                        const baseTextClass =
                          dayOfWeek === 0
                            ? "text-rose-500"
                            : dayOfWeek === 6
                              ? "text-blue-500"
                              : "text-slate-900";

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setSelectedDate(day)}
                            className={`relative h-12 rounded-xl text-sm font-medium transition ${
                              isSelected
                                ? "bg-emerald-500 text-white shadow-sm"
                                : meta
                                  ? "bg-slate-100 hover:bg-slate-200"
                                  : "hover:bg-slate-100"
                            } ${isSelected ? "text-white" : baseTextClass}`}
                          >
                            {day.getDate()}
                            {renderMarker(meta, isSelected)}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    {weekDates.map((day) => {
                      const key = toDateKey(day);
                      const meta = dateMeta.get(key);
                      const isSelected = key === selectedKey;
                      const dayOfWeek = day.getDay();
                      const baseTextClass =
                        dayOfWeek === 0
                          ? "text-rose-500"
                          : dayOfWeek === 6
                            ? "text-blue-500"
                            : "text-slate-900";

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setSelectedDate(day);
                            setVisibleMonth(
                              new Date(day.getFullYear(), day.getMonth(), 1),
                            );
                          }}
                          className={`relative flex w-full items-center justify-between rounded-xl border px-3 py-3 text-sm transition ${
                            isSelected
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-slate-200 bg-white hover:bg-slate-50"
                          }`}
                        >
                          <span className={`font-medium ${isSelected ? "text-white" : baseTextClass}`}>
                            {weekdayLabels[dayOfWeek]}
                          </span>
                          <span className="text-base font-semibold">{day.getDate()}</span>
                          {renderMarker(meta, isSelected)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>점으로 일정 여부를 표시합니다.</span>
                {isFetching && <span>업데이트 중...</span>}
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/90 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur sm:p-5">
            <h2 className="text-base font-semibold text-slate-900">
              {formatSelectedDate(selectedDate)}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              선택한 날짜의 일정 {selectedSchedules.length}건
            </p>

            <div className="mt-4">
              {isLoading ? (
                <div className="space-y-2">
                  <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />
                  <div className="h-14 animate-pulse rounded-2xl bg-slate-100" />
                </div>
              ) : isError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
                  선택 일정 정보를 불러오지 못했습니다.
                </p>
              ) : selectedSchedules.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  선택한 날짜에 일정이 없습니다.
                </p>
              ) : (
                <ul className="space-y-2">
                  {selectedSchedules.map((schedule) => (
                    <li
                      key={schedule.schedule_id}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {schedule.title}
                        </p>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                          {SCHEDULE_TYPE_LABELS[schedule.schedule_type]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {schedule.all_day
                          ? "종일"
                          : new Date(schedule.start_datetime).toLocaleTimeString(
                              "ko-KR",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                        {schedule.location ? ` · ${schedule.location}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        <div className="mt-6">
          {isLoading ? (
            <FullSpinner message="일정을 불러오는 중..." />
          ) : isError ? (
            <ErrorState
              title="일정을 불러오지 못했습니다"
              message={(error as Error).message}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="이번 달 일정이 없습니다"
              description="위 폼에서 새 일정을 등록해 보세요."
            />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  이번 달 전체 일정
                </h2>
                <span className="text-xs text-slate-500">총 {items.length}건</span>
              </div>
              <ul className="space-y-2">
              {items.map((s) => (
                <ScheduleRow key={s.schedule_id} schedule={s} />
              ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
