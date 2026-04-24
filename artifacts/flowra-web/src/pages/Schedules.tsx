import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useCreateSchedule,
  useDeleteSchedule,
  useDeleteSchedules,
  useSchedules,
  useUpdateSchedule,
} from "@/hooks/useSchedules";
import {
  useCompleteTask,
  useCreateTask,
  useTasks,
} from "@/hooks/useTasks";
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
import { localInputToOffsetISOString, toOffsetISOString } from "@/utils/dateUtils";
import { toast } from "@/lib/toast";

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

interface DayMeta {
  count: number;
  hasDeadline: boolean;
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

type ScheduleCompletionFilter = "all" | "active" | "completed";

interface ScheduleFilters {
  scheduleTypes: ScheduleType[];
  priorities: TaskPriority[];
  categories: number[];
  completion: ScheduleCompletionFilter;
  q: string;
  location: string;
}

const defaultScheduleFilters: ScheduleFilters = {
  scheduleTypes: [],
  priorities: [],
  categories: [],
  completion: "all",
  q: "",
  location: "",
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
  return {
    title: "",
    description: "",
    schedule_type: "personal",
    priority: "medium",
    start_local: dateAtLocalTime(date, 9),
    end_local: dateAtLocalTime(date, 10),
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

function LinkedScheduleTasks({
  schedule,
}: {
  schedule: Schedule;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState<string | null>(null);
  const tasksQuery = useTasks({
    schedule_id: schedule.schedule_id,
    size: 100,
    sort_by: "due_datetime",
    sort_order: "asc",
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

function ScheduleFormPanel({
  mode,
  initial,
  schedule,
  isPending,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  initial: ScheduleFormState;
  schedule?: Schedule | null;
  isPending?: boolean;
  onClose: () => void;
  onSubmit: (form: ScheduleFormState) => Promise<void> | void;
}) {
  const [form, setForm] = useState(initial);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      await onSubmit(form);
    } catch (err) {
      setError(getErrorMessage(err, "저장에 실패했습니다."));
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-950/20 xl:hidden"
        onClick={onClose}
        aria-hidden
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl xl:sticky xl:top-20 xl:z-0 xl:max-h-[calc(100vh-6rem)] xl:shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium text-emerald-700">
              {mode === "create" ? "New schedule" : "Edit schedule"}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-950">
              {mode === "create" ? "일정 추가" : "일정 수정"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5">
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

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  시작 일시
                </span>
                <input
                  type="datetime-local"
                  required
                  value={form.start_local}
                  onChange={(event) =>
                    setForm({ ...form, start_local: event.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  종료 일시
                </span>
                <input
                  type="datetime-local"
                  value={form.end_local}
                  onChange={(event) =>
                    setForm({ ...form, end_local: event.target.value })
                  }
                  className="mt-1 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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

              <label className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={form.all_day}
                  onChange={(event) =>
                    setForm({ ...form, all_day: event.target.checked })
                  }
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                종일
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
                  onChange={(value) =>
                    setForm({ ...form, category_id: value })
                  }
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

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isPending}
            onClick={(event) => {
              const formEl = event.currentTarget
                .closest("aside")
                ?.querySelector("form");
              formEl?.requestSubmit();
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending ? "저장 중..." : mode === "create" ? "추가" : "저장"}
          </button>
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
        : "bg-emerald-500";

    return (
      <span className="pointer-events-none absolute bottom-1.5 left-1/2 flex -translate-x-1/2 gap-1">
        <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        {meta.count > 1 && (
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
        )}
      </span>
    );
  };

  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMoveMonth(-1)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-slate-950">
          {formatMonthTitle(visibleMonth)}
        </p>
        <button
          type="button"
          onClick={() => onMoveMonth(1)}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="다음 달"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-xs">
        {(["month", "week"] as const).map((view) => (
          <button
            key={view}
            type="button"
            onClick={() => onSetCalendarView(view)}
            className={`h-8 rounded-md font-medium transition ${
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
            <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500">
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
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectDate(day)}
                    className={`relative h-10 rounded-lg text-sm font-medium transition ${
                      selected
                        ? "bg-emerald-600 text-white"
                        : meta
                          ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
                          : "text-slate-700 hover:bg-slate-100"
                    }`}
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
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelectDate(day)}
                  className={`relative flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                    selected
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>{weekdayLabels[day.getDay()]}</span>
                  <span className="font-semibold">{day.getDate()}</span>
                  {renderMarker(meta, selected)}
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

  return (
    <li
      id={`schedule-${schedule.schedule_id}`}
      className={`rounded-lg border bg-white p-4 shadow-sm ${
        highlighted
          ? "border-emerald-300 ring-2 ring-emerald-100"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-start gap-4">
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
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">
              종일
            </span>
          ) : (
            <>
              <p className="text-sm text-slate-950">
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
            <h3 className="truncate text-sm font-semibold text-slate-950">
              {schedule.title}
            </h3>
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
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label="삭제"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
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
  const [visibleMonth, setVisibleMonth] = useState(
    () =>
      new Date(safeInitialDate.getFullYear(), safeInitialDate.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState<Date>(safeInitialDate);
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [panelMode, setPanelMode] = useState<"create" | "edit" | null>(null);
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

  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteSchedule();
  const bulkDeleteMutation = useDeleteSchedules();
  const categoriesQuery = useCategories("schedule");

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
      ...(filters.categories.length === 1
        ? { category_id: filters.categories[0] }
        : {}),
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

  const items = useMemo(
    () => {
      const keyword = filters.q.trim().toLowerCase();
      const locationKeyword = filters.location.trim().toLowerCase();
      return [...(data ?? [])]
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
            (!schedule.priority || !filters.priorities.includes(schedule.priority))
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
    },
    [
      data,
      filters.categories,
      filters.completion,
      filters.location,
      filters.priorities,
      filters.q,
      filters.scheduleTypes,
    ],
  );
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

  const selectedKey = toDateKey(selectedDate);
  const selectedSchedules = schedulesByDate.get(selectedKey) ?? [];
  const weekDates = useMemo(() => buildWeekDates(selectedDate), [selectedDate]);
  const selectedScheduleCount = selectedScheduleIds.size;

  useEffect(() => {
    setSelectedScheduleIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(selectedSchedules.map((item) => item.schedule_id));
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
    toast.success(`일정을 삭제했습니다 (${result.count}개)`);
  };

  const openCreatePanel = () => {
    setEditingSchedule(null);
    setPanelMode("create");
  };

  const openEditPanel = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setPanelMode("edit");
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
      : `create-${selectedKey}`;

  const allDaySchedules = selectedSchedules.filter(
    (schedule) => schedule.all_day,
  );
  const timedSchedules = selectedSchedules.filter(
    (schedule) => !schedule.all_day,
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Calendar board
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                일정
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                날짜를 선택하고, 하루의 일정을 타임라인으로 확인하세요.
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                홈으로
              </Link>
              <button
                type="button"
                onClick={openCreatePanel}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                일정 추가
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                필터
                {activeFilterCount > 0 && (
                  <span className="ml-2 rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    {activeFilterCount}
                  </span>
                )}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                현재 캘린더 범위 안에서 모든 조건을 만족하는 일정만 보여줍니다.
              </p>
            </div>
            <button
              type="button"
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              초기화
            </button>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr_1fr]">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">검색</span>
              <input
                type="search"
                value={filters.q}
                onChange={(event) => updateFilters({ q: event.target.value })}
                placeholder="제목, 설명, 장소"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <div>
              <span className="text-xs font-medium text-slate-600">
                일정 유형
              </span>
              <div className="mt-1 flex min-h-10 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => updateFilters({ scheduleTypes: [] })}
                  className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                    filters.scheduleTypes.length === 0
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  전체
                </button>
                {scheduleTypeFilterOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      const selected = filters.scheduleTypes.includes(
                        option.value,
                      );
                      updateFilters({
                        scheduleTypes: selected
                          ? filters.scheduleTypes.filter(
                              (item) => item !== option.value,
                            )
                          : [...filters.scheduleTypes, option.value],
                      });
                    }}
                    className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                      filters.scheduleTypes.includes(option.value)
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs font-medium text-slate-600">
                우선순위
              </span>
              <div className="mt-1 flex min-h-10 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => updateFilters({ priorities: [] })}
                  className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                    filters.priorities.length === 0
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  전체
                </button>
                {priorityFilterOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      const selected = filters.priorities.includes(option.value);
                      updateFilters({
                        priorities: selected
                          ? filters.priorities.filter(
                              (item) => item !== option.value,
                            )
                          : [...filters.priorities, option.value],
                      });
                    }}
                    className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                      filters.priorities.includes(option.value)
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs font-medium text-slate-600">
                카테고리
              </span>
              <div className="mt-1 flex min-h-10 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => updateFilters({ categories: [] })}
                  className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                    filters.categories.length === 0
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  전체
                </button>
                {(categoriesQuery.data ?? []).map((category) => (
                  <button
                    key={category.category_id}
                    type="button"
                    onClick={() => {
                      const selected = filters.categories.includes(
                        category.category_id,
                      );
                      updateFilters({
                        categories: selected
                          ? filters.categories.filter(
                              (item) => item !== category.category_id,
                            )
                          : [...filters.categories, category.category_id],
                      });
                    }}
                    className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                      filters.categories.includes(category.category_id)
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr]">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">장소</span>
              <input
                type="search"
                value={filters.location}
                onChange={(event) =>
                  updateFilters({ location: event.target.value })
                }
                placeholder="장소 키워드"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
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
                    completion: event.target.value as ScheduleCompletionFilter,
                  })
                }
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="all">전체</option>
                <option value="active">미완료</option>
                <option value="completed">완료</option>
              </select>
            </label>
          </div>

          {scheduleFilterChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {scheduleFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => updateFilters(chip.reset)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  aria-label={`${chip.label} 필터 제거`}
                >
                  <span>{chip.label}</span>
                  <span aria-hidden className="text-emerald-500">
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div
          className={`grid gap-5 ${
            panelMode
              ? "xl:grid-cols-[320px_minmax(0,1fr)_380px]"
              : "xl:grid-cols-[320px_minmax(0,1fr)]"
          }`}
        >
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

          <section className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {formatSelectedDate(selectedDate)}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  선택한 날짜의 일정 {selectedSchedules.length}건
                  {isFetching && " · 업데이트 중"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedSchedules.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={selectAllCurrentDaySchedules}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                    >
                      전체 선택
                    </button>
                    <button
                      type="button"
                      onClick={clearSelectedSchedules}
                      disabled={selectedScheduleCount === 0}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
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
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
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
                  onClick={openCreatePanel}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                >
                  <CalendarDays className="h-4 w-4" />이 날짜에 추가
                </button>
              </div>
            </div>

            <div className="p-5">
              {isLoading ? (
                <FullSpinner message="일정을 불러오는 중..." />
              ) : isError ? (
                <ErrorState
                  title="일정을 불러오지 못했습니다"
                  message={(error as Error).message}
                  onRetry={() => refetch()}
                  retrying={isFetching}
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
                panelMode === "create"
                  ? createMutation.isPending
                  : updateMutation.isPending
              }
              onClose={closePanel}
              onSubmit={async (form) => {
                const payload = toPayload(form);
                if (panelMode === "create") {
                  const created = await createMutation.mutateAsync(payload);
                  const start = new Date(
                    created.start_datetime ?? payload.start_datetime,
                  );
                  if (!Number.isNaN(start.getTime())) {
                    selectDate(start);
                  }
                } else if (editingSchedule) {
                  await updateMutation.mutateAsync({
                    scheduleId: editingSchedule.schedule_id,
                    payload,
                  });
                }
                closePanel();
              }}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
