import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Check, CheckSquare2, Plus } from "lucide-react";
import { useCreateTask, useSetTaskCompletion, useTasks } from "@/hooks/useTasks";
import {
  getClassificationLabel,
  getClassificationOptions,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { getErrorMessage } from "@/lib/error";
import { cn } from "@/lib/utils";
import { localInputToOffsetISOString } from "@/utils/dateUtils";
import { ListCardMeta, PriorityMetaChip } from "@/components/ListCardMeta";
import {
  CompactDateInput,
  CompactTimeInput,
  dateKeyFromLocalInput,
  localInputWithDateKey,
  localInputWithTime,
  timeFromLocalInput,
  toDateKey,
} from "@/components/CompactDateTimeInputs";
import CustomSelect, {
  type CustomSelectOption,
} from "@/components/ui/CustomSelect";
import TaskCompletionToggleButton from "@/components/TaskCompletionToggleButton";
import type { Schedule, Task, TaskPriority } from "@/types";

type ScheduleLinkedTasksVariant = "section" | "panel";

interface ScheduleLinkedTasksProps {
  schedule: Schedule;
  tasks?: Task[];
  variant?: ScheduleLinkedTasksVariant;
  linkTasks?: boolean;
  className?: string;
}

const priorityDotClass: Record<TaskPriority, string> = {
  low: "bg-slate-300",
  medium: "bg-indigo-400",
  high: "bg-amber-400",
  urgent: "bg-rose-500",
};

const priorityDotColor: Record<TaskPriority, string> = {
  low: "#94a3b8",
  medium: "#6366f1",
  high: "#f59e0b",
  urgent: "#f43f5e",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toLocalDateTimeInput(iso?: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultTaskDueLocal(schedule: Schedule) {
  return toLocalDateTimeInput(schedule.end_datetime ?? schedule.start_datetime);
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

function sortLinkedTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (a.status !== "done" && b.status === "done") return -1;
    const aDue = a.due_datetime ? new Date(a.due_datetime).getTime() : Infinity;
    const bDue = b.due_datetime ? new Date(b.due_datetime).getTime() : Infinity;
    return aDue - bDue;
  });
}

function LinkedTaskListItem({
  task,
  highlighted,
  updatingCompletion,
  linkTask,
  onCompletionChange,
}: {
  task: Task;
  highlighted?: boolean;
  updatingCompletion?: boolean;
  linkTask: boolean;
  onCompletionChange: (completed: boolean) => void;
}) {
  const isDone = task.status === "done";
  const classificationSettings = useClassificationSettings();
  const titleClass = cn(
    "block truncate text-sm font-bold",
    isDone ? "text-slate-400 line-through" : "text-slate-800",
    linkTask && !isDone && "hover:text-emerald-700",
  );
  const title = linkTask ? (
    <Link
      to={`/tasks?${new URLSearchParams({ task_id: String(task.task_id) })}`}
      className={titleClass}
    >
      {task.title}
    </Link>
  ) : (
    <p className={titleClass}>{task.title}</p>
  );

  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 transition-colors duration-300",
        highlighted
          ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-100"
          : "border-slate-200 bg-white",
      )}
    >
      <TaskCompletionToggleButton
        completed={isDone}
        disabled={updatingCompletion}
        compact
        onCompletedChange={onCompletionChange}
      />
      <span
        className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", priorityDotClass[task.priority])}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {title}
        <ListCardMeta className="mt-1">
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" />
            {formatTaskDue(task.due_datetime)}
          </span>
          <PriorityMetaChip priority={task.priority}>
            {getClassificationLabel(
              classificationSettings,
              "taskPriorities",
              task.priority,
            )}
          </PriorityMetaChip>
        </ListCardMeta>
      </div>
    </li>
  );
}

function TaskDueDateTimeControl({
  value,
  fallbackValue,
  onChange,
}: {
  value: string;
  fallbackValue: string;
  onChange: (value: string) => void;
}) {
  const fallbackDateKey =
    dateKeyFromLocalInput(fallbackValue) || toDateKey(new Date());
  const dateKey = dateKeyFromLocalInput(value) || fallbackDateKey;
  const timeValue =
    timeFromLocalInput(value) || timeFromLocalInput(fallbackValue) || "09:00";

  return (
    <div className="block">
      <span className="text-xs font-bold text-slate-500">마감시간</span>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_5rem] gap-1.5">
        <CompactDateInput
          value={dateKey}
          ariaLabel="\uB9C8\uAC10 \uB0A0\uC9DC \uC120\uD0DD"
          onChange={(nextDateKey) =>
            onChange(
              localInputWithDateKey(
                value || fallbackValue,
                nextDateKey,
                timeValue,
              ),
            )
          }
          className="h-10 w-full border-slate-200 bg-white px-3 shadow-sm hover:border-slate-300"
        />
        <CompactTimeInput
          value={timeValue}
          ariaLabel="\uB9C8\uAC10 \uC2DC\uAC04"
          onChange={(nextTime) =>
            onChange(
              localInputWithTime(value || fallbackValue, nextTime, dateKey),
            )
          }
          className="h-10 border-slate-200 bg-white px-2 shadow-sm hover:border-slate-300"
        />
      </div>
    </div>
  );
}

export default function ScheduleLinkedTasks({
  schedule,
  tasks: providedTasks,
  variant = "section",
  linkTasks = variant === "section",
  className,
}: ScheduleLinkedTasksProps) {
  const classificationSettings = useClassificationSettings();
  const createTask = useCreateTask();
  const completionMutation = useSetTaskCompletion();
  const tasksQuery = useTasks({ schedule_id: schedule.schedule_id });
  const tasks = providedTasks ?? tasksQuery.data ?? [];
  const sortedTasks = useMemo(() => sortLinkedTasks(tasks), [tasks]);
  const scheduleDueLocal = useMemo(
    () => defaultTaskDueLocal(schedule),
    [schedule.end_datetime, schedule.start_datetime],
  );
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(
    schedule.priority ?? "medium",
  );
  const [dueLocal, setDueLocal] = useState(scheduleDueLocal);
  const [syncDueToSchedule, setSyncDueToSchedule] = useState(true);
  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const doneCount = sortedTasks.filter((task) => task.status === "done").length;
  const canAddTask = !!schedule.schedule_id && !schedule.is_company_schedule;
  const priorityOptions = getClassificationOptions(
    classificationSettings,
    "taskPriorities",
    { enabledOnly: true, include: priority, defaultOnly: true },
  );
  const prioritySelectOptions = useMemo<CustomSelectOption<TaskPriority>[]>(
    () =>
      priorityOptions.map((option) => ({
        label: option.label,
        value: option.value,
        colorDot: priorityDotColor[option.value],
      })),
    [priorityOptions],
  );

  useEffect(() => {
    setTitle("");
    setPriority(schedule.priority ?? "medium");
    setDueLocal(scheduleDueLocal);
    setSyncDueToSchedule(true);
    setHighlightedTaskId(null);
    setError(null);
    if (variant === "panel") {
      window.requestAnimationFrame(() => titleInputRef.current?.focus());
    }
  }, [schedule.priority, schedule.schedule_id, scheduleDueLocal, variant]);

  useEffect(() => {
    if (syncDueToSchedule) {
      setDueLocal(scheduleDueLocal);
    }
  }, [scheduleDueLocal, syncDueToSchedule]);

  useEffect(() => {
    if (!highlightedTaskId) return;

    const timeoutId = window.setTimeout(() => {
      setHighlightedTaskId(null);
    }, 2200);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedTaskId]);

  const toggleScheduleDueSync = () => {
    setSyncDueToSchedule((current) => {
      const next = !current;
      if (next) {
        setDueLocal(scheduleDueLocal);
      }
      return next;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    const nextDueLocal = syncDueToSchedule ? scheduleDueLocal : dueLocal;
    setError(null);

    if (!trimmedTitle) {
      setError("할 일 제목을 입력해 주세요.");
      titleInputRef.current?.focus();
      return;
    }

    try {
      const createdTask = await createTask.mutateAsync({
        title: trimmedTitle,
        status: "todo",
        priority,
        schedule_id: schedule.schedule_id,
        due_datetime: nextDueLocal
          ? localInputToOffsetISOString(nextDueLocal)
          : null,
      });
      setTitle("");
      setPriority(schedule.priority ?? "medium");
      setDueLocal(scheduleDueLocal);
      setSyncDueToSchedule(true);
      setHighlightedTaskId(createdTask.task_id);
      window.requestAnimationFrame(() => titleInputRef.current?.focus());
    } catch (err) {
      setError(getErrorMessage(err, "할 일 추가에 실패했습니다."));
    }
  };

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

  const content = (
    <>
      {variant === "section" && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <CheckSquare2 className="h-4 w-4 text-emerald-600" />
              연결된 할 일
            </div>
            <p className="mt-1 text-xs text-slate-500">
              이 일정에 연결된 실행 항목을 확인하고 완료할 수 있습니다.
            </p>
          </div>
          <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
            {sortedTasks.length}개
          </span>
        </div>
      )}

      {canAddTask ? (
        <form onSubmit={handleSubmit} noValidate className="mt-3 space-y-3">
          <div className="flex items-end gap-2">
            <label className="block min-w-0 flex-1">
              <span className="text-xs font-bold text-slate-500">
                할 일 제목
              </span>
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="새 할 일 입력"
                enterKeyHint="done"
                className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </label>
            <button
              type="submit"
              disabled={createTask.isPending}
              aria-label={createTask.isPending ? "할 일 추가 중" : "할 일 추가"}
              title={createTask.isPending ? "추가 중..." : "할 일 추가"}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white transition hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-60"
            >
              <Plus
                className={cn(
                  "h-5 w-5",
                  createTask.isPending && "animate-pulse",
                )}
              />
            </button>
          </div>

          <div className="grid gap-2">
            <div className="block">
              <span className="text-xs font-bold text-slate-500">우선순위</span>
              <CustomSelect<TaskPriority>
                value={priority}
                options={prioritySelectOptions}
                onChange={(value) => setPriority(value)}
                ariaLabel="우선순위 선택"
                side={variant === "panel" ? "left" : "bottom"}
                floatingBoundary={variant === "panel" ? "panel" : "trigger"}
                className="mt-1 h-10 shadow-none"
              />
            </div>

            <TaskDueDateTimeControl
              value={dueLocal}
              fallbackValue={scheduleDueLocal}
              onChange={(nextValue) => {
                setDueLocal(nextValue);
                setSyncDueToSchedule(nextValue === scheduleDueLocal);
              }}
            />
          </div>

          <button
            type="button"
            aria-pressed={syncDueToSchedule}
            onClick={toggleScheduleDueSync}
            className={cn(
              "inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold transition",
              syncDueToSchedule
                ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900",
            )}
          >
            <Check
              className={cn("h-3.5 w-3.5", !syncDueToSchedule && "opacity-0")}
            />
            <span className="whitespace-nowrap">일정 시간에 맞춤</span>
          </button>
        </form>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs font-bold text-slate-500">
          이 일정에는 개인 할 일을 직접 연결할 수 없습니다.
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-black text-slate-950">
            {variant === "section" ? "목록" : "연결된 할 일"}
          </h3>
          <span className="shrink-0 text-xs font-bold text-slate-400">
            완료 {doneCount} / 전체 {sortedTasks.length}
          </span>
        </div>

        {providedTasks === undefined && tasksQuery.isLoading ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-xs text-slate-500">
            연결된 할 일을 불러오는 중입니다.
          </div>
        ) : providedTasks === undefined && tasksQuery.isError ? (
          <div className="rounded-lg border border-red-200 bg-white px-3 py-3 text-xs text-red-700">
            {(tasksQuery.error as Error).message}
          </div>
        ) : sortedTasks.length > 0 ? (
          <ul className="space-y-2">
            {sortedTasks.map((task) => (
              <LinkedTaskListItem
                key={task.task_id}
                task={task}
                highlighted={highlightedTaskId === task.task_id}
                updatingCompletion={completionMutation.isPending}
                linkTask={linkTasks}
                onCompletionChange={(completed) =>
                  handleCompletionChange(task, completed)
                }
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-xs font-bold text-slate-500">
            아직 연결된 할 일이 없습니다.
          </p>
        )}
      </div>
    </>
  );

  if (variant === "panel") {
    return <div className={cn("px-5 py-4", className)}>{content}</div>;
  }

  return (
    <section
      className={cn("rounded-lg border border-slate-200 bg-slate-50 p-3", className)}
    >
      {content}
    </section>
  );
}
