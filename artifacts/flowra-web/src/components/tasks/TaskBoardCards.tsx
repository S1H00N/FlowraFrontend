import { useId, useMemo, useState, type CSSProperties } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSetScheduleCompletion } from "@/hooks/useSchedules";
import { useSetTaskCompletion } from "@/hooks/useTasks";
import {
  getClassificationLabel,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { getErrorMessage } from "@/lib/error";
import {
  SCHEDULE_VISIBILITY_LABELS,
  type Category,
  type Schedule,
  type ScheduleType,
  type Task,
  type TaskPriority,
} from "@/types";
import "./TaskBoardCards.css";

const scheduleTypeColor: Record<ScheduleType, string> = {
  personal: "#14b8a6",
  meeting: "#6366f1",
  fieldwork: "#8b5cf6",
  deadline: "#f59e0b",
  other: "#64748b",
};

const taskPriorityDot: Record<TaskPriority, string> = {
  low: "bg-slate-300",
  medium: "bg-violet-400",
  high: "bg-amber-400",
  urgent: "bg-rose-500",
};

function validDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string | null) {
  return (
    validDate(value)?.toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "short",
    }) ?? "마감 없음"
  );
}

function formatTime(value?: string | null) {
  return (
    validDate(value)?.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }) ?? "미정"
  );
}

function formatTaskDue(value?: string | null) {
  return (
    validDate(value)?.toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) ?? "마감 없음"
  );
}

function formatDuration(schedule: Schedule) {
  if (schedule.all_day) return null;
  const start = validDate(schedule.start_datetime);
  const end = validDate(schedule.end_datetime);
  if (!start || !end || end <= start) return null;
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (minutes < 1) return null;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}시간` : "", remainder ? `${remainder}분` : ""]
    .filter(Boolean)
    .join(" ");
}

function CompletionButton({
  completed,
  disabled,
  pending,
  titleId,
  onCompletedChange,
}: {
  completed: boolean;
  disabled?: boolean;
  pending?: boolean;
  titleId: string;
  onCompletedChange: (completed: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="tasks-completion"
      aria-label={completed ? "완료됨, 미완료로 변경" : "미완료, 완료로 변경"}
      aria-describedby={titleId}
      aria-pressed={completed}
      aria-busy={pending || undefined}
      title={completed ? "완료 취소" : "완료로 표시"}
      disabled={disabled}
      onClick={() => onCompletedChange(!completed)}
    >
      <span className="tasks-check-circle" aria-hidden="true">
        {pending ? (
          <LoaderCircle className="tasks-spinner" />
        ) : completed ? (
          <Check />
        ) : null}
      </span>
    </button>
  );
}

function TaskSelection({
  title,
  selected,
  onToggle,
}: {
  title: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="tasks-selection" title="삭제 대상으로 선택">
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        aria-label={`${title} 삭제 대상으로 선택`}
        className="tasks-selection-checkbox"
      />
    </label>
  );
}

function PriorityLabel({ priority }: { priority: TaskPriority }) {
  const settings = useClassificationSettings();
  return (
    <span className="tasks-priority">
      <span
        className={`tasks-priority-dot ${taskPriorityDot[priority]}`}
        aria-hidden="true"
      />
      {getClassificationLabel(settings, "taskPriorities", priority)}
    </span>
  );
}

export function ScheduleCard({
  schedule,
  category,
  tasks,
  expanded,
  deleting,
  selectedSchedule,
  selectedTaskIds,
  selectionMode,
  onToggle,
  onDelete,
  onToggleScheduleSelection,
  onToggleTaskSelection,
  onOpenAddTaskPanel,
}: {
  schedule: Schedule;
  category?: Category | null;
  tasks: Task[];
  expanded: boolean;
  deleting: boolean;
  selectedSchedule: boolean;
  selectedTaskIds: Set<number>;
  selectionMode: boolean;
  onToggle: () => void;
  onDelete: () => Promise<void>;
  onToggleScheduleSelection: () => void;
  onToggleTaskSelection: (taskId: number) => void;
  onOpenAddTaskPanel: () => void;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const detailsId = `${id}-details`;
  const classificationSettings = useClassificationSettings();
  const completionMutation = useSetTaskCompletion();
  const scheduleCompletionMutation = useSetScheduleCompletion();
  const [error, setError] = useState<string | null>(null);
  const completed = !!schedule.is_completed;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const duration = formatDuration(schedule);
  const time = schedule.all_day ? "종일" : formatTime(schedule.start_datetime);
  const accentColor =
    category?.color || scheduleTypeColor[schedule.schedule_type] || "#64748b";
  const chipLabel =
    category?.name ??
    getClassificationLabel(
      classificationSettings,
      "scheduleTypes",
      schedule.schedule_type,
    );
  const chipStyle = { "--tasks-category-color": accentColor } as CSSProperties;
  const VisibilityIcon = schedule.is_company_schedule
    ? Building2
    : schedule.visibility === "friends"
      ? Users
      : schedule.visibility === "link"
        ? Link2
        : LockKeyhole;
  const visibilityLabel = schedule.is_company_schedule
    ? "회사 일정"
    : (SCHEDULE_VISIBILITY_LABELS[schedule.visibility] ?? "비공개");
  const canAddTask = !!schedule.schedule_id && !schedule.is_company_schedule;
  const sortedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        if (a.status === "done" && b.status !== "done") return 1;
        if (a.status !== "done" && b.status === "done") return -1;
        return (
          (validDate(a.due_datetime)?.getTime() ?? 0) -
          (validDate(b.due_datetime)?.getTime() ?? 0)
        );
      }),
    [tasks],
  );

  const handleCompletionChange = async (task: Task, nextCompleted: boolean) => {
    if (nextCompleted === (task.status === "done")) return;
    setError(null);
    try {
      await completionMutation.mutateAsync({
        taskId: task.task_id,
        completed: nextCompleted,
      });
    } catch (err) {
      setError(getErrorMessage(err, "완료 상태 변경에 실패했습니다."));
    }
  };

  const handleScheduleCompletionChange = async (nextCompleted: boolean) => {
    if (schedule.is_company_schedule || nextCompleted === completed) return;
    setError(null);
    try {
      await scheduleCompletionMutation.mutateAsync({
        scheduleId: schedule.schedule_id,
        completed: nextCompleted,
      });
    } catch (err) {
      setError(getErrorMessage(err, "일정 상태 변경에 실패했습니다."));
    }
  };

  const handleDeleteSchedule = async () => {
    const message = schedule.is_company_schedule
      ? `"${schedule.title}" 회사 일정의 삭제 처리를 요청할까요?`
      : `"${schedule.title}" 일정을 삭제하시겠습니까?`;
    if (!confirm(message)) return;
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError(getErrorMessage(err, "일정 삭제에 실패했습니다."));
    }
  };

  return (
    <li className="tasks-row tasks-schedule-row">
      <div className="tasks-time" aria-hidden="true">
        {time}
      </div>
      <div className="tasks-rail">
        {schedule.is_company_schedule ? (
          <span
            className="tasks-company-status"
            role="img"
            aria-label={`회사 일정: ${completed ? "완료" : "미완료"}`}
            title="회사 일정"
          >
            {completed ? <Check /> : <Building2 />}
          </span>
        ) : (
          <CompletionButton
            completed={completed}
            disabled={scheduleCompletionMutation.isPending}
            pending={scheduleCompletionMutation.isPending}
            titleId={titleId}
            onCompletedChange={(nextCompleted) =>
              void handleScheduleCompletionChange(nextCompleted)
            }
          />
        )}
      </div>
      <article
        className={`tasks-card${completed ? " tasks-card-completed" : ""}${selectedSchedule ? " tasks-card-selected" : ""}`}
        aria-labelledby={titleId}
      >
        <div className="tasks-card-top">
          <h3
            className="tasks-card-heading"
            aria-label={schedule.title || "제목 없음"}
          >
            <button
              type="button"
              className="tasks-card-open"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={detailsId}
            >
              <span className="tasks-title-line">
                <span id={titleId} className="tasks-card-title">
                  {schedule.title || "제목 없음"}
                </span>
                {completed && <span className="tasks-done-label">완료</span>}
                <ChevronDown
                  className={`tasks-chevron${expanded ? " tasks-chevron-open" : ""}`}
                  aria-hidden="true"
                />
              </span>
              <span className="tasks-meta">
                <span className="tasks-meta-item">
                  <CalendarDays aria-hidden="true" />
                  {formatDate(schedule.start_datetime)}
                </span>
                <span className="tasks-meta-item tasks-mobile-time">
                  <Clock3 aria-hidden="true" />
                  {time}
                </span>
                <span className="tasks-sr-only tasks-desktop-time">{time}</span>
                {duration && (
                  <span className="tasks-meta-item">
                    <Clock3 aria-hidden="true" />
                    {duration}
                  </span>
                )}
                {tasks.length > 0 && (
                  <span
                    className="tasks-progress"
                    aria-label={`연결된 할 일 ${tasks.length}개 중 ${doneCount}개 완료`}
                  >
                    <span className="tasks-progress-track" aria-hidden="true">
                      <span
                        style={{
                          width: `${(doneCount / tasks.length) * 100}%`,
                        }}
                      />
                    </span>
                    <span aria-hidden="true">
                      할 일 {doneCount}/{tasks.length}
                    </span>
                  </span>
                )}
                <span
                  className="tasks-category tasks-category-mobile"
                  style={chipStyle}
                >
                  {chipLabel}
                </span>
              </span>
            </button>
          </h3>
          <div className="tasks-card-actions">
            <span
              className="tasks-category tasks-category-desktop"
              style={chipStyle}
              title={chipLabel}
            >
              {chipLabel}
            </span>
            <span
              className="tasks-visibility"
              role="img"
              aria-label={visibilityLabel}
              title={visibilityLabel}
            >
              <VisibilityIcon aria-hidden="true" />
            </span>
            {selectionMode && (
              <TaskSelection
                title={schedule.title}
                selected={selectedSchedule}
                onToggle={onToggleScheduleSelection}
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="tasks-more"
                  disabled={deleting}
                  aria-label={`${schedule.title} 더보기`}
                >
                  {deleting ? (
                    <LoaderCircle className="tasks-spinner" />
                  ) : (
                    <MoreHorizontal />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="tasks-card-menu">
                <DropdownMenuItem
                  className="tasks-delete-action"
                  disabled={deleting}
                  onSelect={() => void handleDeleteSchedule()}
                >
                  <Trash2 aria-hidden="true" />
                  {schedule.is_company_schedule
                    ? "회사 일정 삭제 요청"
                    : "일정 삭제"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div id={detailsId} className="tasks-card-details" hidden={!expanded}>
          {expanded && (
            <>
              <p className="tasks-detail-title">
                {schedule.title || "제목 없음"}
              </p>
              <p className="tasks-detail-visibility">
                <VisibilityIcon aria-hidden="true" />
                {visibilityLabel}
              </p>
              <p className="tasks-detail-heading">
                연결된 할 일
                {tasks.length > 0 && ` · ${doneCount}/${tasks.length} 완료`}
              </p>
              {sortedTasks.length > 0 ? (
                <ul className="tasks-subtasks">
                  {sortedTasks.map((task) => {
                    const taskTitleId = `${id}-task-${task.task_id}`;
                    const done = task.status === "done";
                    const pending =
                      completionMutation.isPending &&
                      completionMutation.variables?.taskId === task.task_id;
                    return (
                      <li
                        key={task.task_id}
                        className={`tasks-subtask${done ? " tasks-subtask-completed" : ""}${selectedTaskIds.has(task.task_id) ? " tasks-subtask-selected" : ""}`}
                      >
                        <CompletionButton
                          completed={done}
                          disabled={completionMutation.isPending}
                          pending={pending}
                          titleId={taskTitleId}
                          onCompletedChange={(nextCompleted) =>
                            void handleCompletionChange(task, nextCompleted)
                          }
                        />
                        <div className="tasks-subtask-content">
                          <p id={taskTitleId} className="tasks-subtask-title">
                            {task.title}
                          </p>
                          <div className="tasks-subtask-meta">
                            <span>{formatTaskDue(task.due_datetime)}</span>
                            <PriorityLabel priority={task.priority} />
                          </div>
                        </div>
                        {selectionMode && (
                          <TaskSelection
                            title={task.title}
                            selected={selectedTaskIds.has(task.task_id)}
                            onToggle={() => onToggleTaskSelection(task.task_id)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="tasks-empty-details">
                  아직 연결된 할 일이 없습니다.
                </p>
              )}
              {canAddTask ? (
                <button
                  type="button"
                  className="tasks-add-subtask"
                  onClick={onOpenAddTaskPanel}
                >
                  <Plus aria-hidden="true" />할 일 추가
                </button>
              ) : (
                <p className="tasks-empty-details">
                  이 일정에는 개인 할 일을 직접 연결할 수 없습니다.
                </p>
              )}
            </>
          )}
        </div>
        {error && (
          <p className="tasks-card-error" role="alert">
            {error}
          </p>
        )}
      </article>
    </li>
  );
}

export function IndependentTasksSection({
  tasks,
  selectedTaskIds,
  selectionMode,
  onToggleTaskSelection,
}: {
  tasks: Task[];
  selectedTaskIds: Set<number>;
  selectionMode: boolean;
  onToggleTaskSelection: (taskId: number) => void;
}) {
  const id = useId();
  const completionMutation = useSetTaskCompletion();
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleCompletionChange = async (task: Task, completed: boolean) => {
    if (completed === (task.status === "done")) return;
    setError(null);
    try {
      await completionMutation.mutateAsync({ taskId: task.task_id, completed });
    } catch (err) {
      setError(getErrorMessage(err, "완료 상태 변경에 실패했습니다."));
    }
  };

  return (
    <section
      className="tasks-independent-section"
      aria-labelledby={`${id}-heading`}
    >
      <h2 className="tasks-independent-heading-wrapper">
        <button
          type="button"
          id={`${id}-heading`}
          className="tasks-independent-heading"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={`${id}-list`}
        >
          <span>독립 할 일</span>
          <span className="tasks-group-count">{tasks.length}</span>
          <ChevronDown
            className={`tasks-chevron${expanded ? " tasks-chevron-open" : ""}`}
            aria-hidden="true"
          />
        </button>
      </h2>
      <div id={`${id}-list`} hidden={!expanded}>
        {expanded && (
          <ul className="tasks-timeline">
            {tasks.map((task) => {
              const titleId = `${id}-task-${task.task_id}`;
              const done = task.status === "done";
              const pending =
                completionMutation.isPending &&
                completionMutation.variables?.taskId === task.task_id;
              return (
                <li
                  key={task.task_id}
                  className="tasks-row tasks-independent-row"
                >
                  <div className="tasks-time" aria-hidden="true">
                    {formatTime(task.due_datetime)}
                  </div>
                  <div className="tasks-rail">
                    <CompletionButton
                      completed={done}
                      disabled={completionMutation.isPending}
                      pending={pending}
                      titleId={titleId}
                      onCompletedChange={(completed) =>
                        void handleCompletionChange(task, completed)
                      }
                    />
                  </div>
                  <article
                    className={`tasks-card${done ? " tasks-card-completed" : ""}${selectedTaskIds.has(task.task_id) ? " tasks-card-selected" : ""}`}
                    aria-labelledby={titleId}
                  >
                    <div className="tasks-card-top">
                      <div className="tasks-independent-content">
                        <div className="tasks-title-line">
                          <h3 id={titleId} className="tasks-card-title">
                            {task.title}
                          </h3>
                          {done && (
                            <span className="tasks-done-label">완료</span>
                          )}
                        </div>
                        <div className="tasks-meta">
                          <span className="tasks-meta-item">
                            <CalendarDays aria-hidden="true" />
                            {formatDate(task.due_datetime)}
                          </span>
                          {validDate(task.due_datetime) && (
                            <>
                              <span className="tasks-meta-item tasks-mobile-time">
                                <Clock3 aria-hidden="true" />
                                {formatTime(task.due_datetime)}
                              </span>
                              <span className="tasks-sr-only tasks-desktop-time">
                                {formatTime(task.due_datetime)}
                              </span>
                            </>
                          )}
                          <PriorityLabel priority={task.priority} />
                        </div>
                        {task.description && (
                          <p className="tasks-task-description">
                            {task.description}
                          </p>
                        )}
                      </div>
                      {selectionMode && (
                        <TaskSelection
                          title={task.title}
                          selected={selectedTaskIds.has(task.task_id)}
                          onToggle={() => onToggleTaskSelection(task.task_id)}
                        />
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error && (
        <p className="tasks-card-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
