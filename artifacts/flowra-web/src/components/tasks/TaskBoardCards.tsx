import { useEffect, useId, useState, type CSSProperties } from "react";
import { useTaskMoveContext } from "./TaskMoveContext";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Link2,
  LoaderCircle,
  MoreHorizontal,
  Trash2,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSetScheduleCompletion } from "@/hooks/useSchedules";
import TaskList from "./TaskList";
import TaskForm from "@/components/TaskForm";
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
} from "@/types";
import "./TaskBoardCards.css";

const scheduleTypeColor: Record<ScheduleType, string> = {
  personal: "#14b8a6",
  meeting: "#6366f1",
  fieldwork: "#8b5cf6",
  deadline: "#f59e0b",
  other: "#64748b",
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

export function formatScheduleTimeLabel(schedule: Schedule) {
  return schedule.all_day ? "종일" : formatTime(schedule.start_datetime);
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

export function ScheduleCard({
  schedule,
  showTimeLabel,
  category,
  tasks,
  expanded,
  deleting,
  selectedSchedule,
  selectedTaskIds,
  selectionMode,
  onToggle,
  onDelete,
  onToggleTaskSelection,
  onOpenAddTaskPanel,
}: {
  schedule: Schedule;
  showTimeLabel: boolean;
  category?: Category | null;
  tasks: Task[];
  expanded: boolean;
  deleting: boolean;
  selectedSchedule: boolean;
  selectedTaskIds: Set<number>;
  selectionMode: boolean;
  onToggle: () => void;
  onDelete: () => Promise<void>;
  onToggleTaskSelection: (taskId: number) => void;
  onOpenAddTaskPanel: () => void;
}) {
  const id = useId();
  const moves = useTaskMoveContext();
  const titleId = `${id}-title`;
  const detailsId = `${id}-details`;
  const classificationSettings = useClassificationSettings();
  const scheduleCompletionMutation = useSetScheduleCompletion();
  const [error, setError] = useState<string | null>(null);
  const completed = !!schedule.is_completed;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const duration = formatDuration(schedule);
  const time = formatScheduleTimeLabel(schedule);
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
        : null;
  const visibilityLabel = schedule.is_company_schedule
    ? "회사 일정"
    : (SCHEDULE_VISIBILITY_LABELS[schedule.visibility] ?? "비공개");
  const canAddTask = !!schedule.schedule_id && !schedule.is_company_schedule;
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
    <li
      className={`tasks-row tasks-schedule-row${showTimeLabel ? "" : " tasks-schedule-row-no-time"}`}
    >
      {showTimeLabel && (
        <div className="tasks-time" aria-hidden="true">
          {time}
        </div>
      )}
      <article
        {...moves?.container(schedule.schedule_id, !schedule.is_company_schedule && !schedule.is_shared)}
        data-selection-key={`schedule:${schedule.schedule_id}`}
        className={`tasks-card${completed ? " tasks-card-completed" : ""}${selectedSchedule ? " tasks-card-selected" : ""}`}
        aria-labelledby={titleId}
      >
        {moves?.dragged && !schedule.is_company_schedule && !schedule.is_shared && <span className="task-drop-hint">여기에 놓아 이 일정으로 이동</span>}
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
                <span className="tasks-category" style={chipStyle} title={chipLabel}>
                  {chipLabel}
                </span>
              </span>
              <span className="tasks-meta">
                <span className="tasks-meta-item">
                  <CalendarDays aria-hidden="true" />
                  {formatDate(schedule.start_datetime)}
                </span>
                <span className="tasks-meta-item tasks-time-range">
                  <Clock3 aria-hidden="true" />
                  {time}
                  {!schedule.all_day && schedule.end_datetime
                    ? ` ~ ${formatTime(schedule.end_datetime)}`
                    : ""}
                </span>
                {duration && (
                  <span className="tasks-meta-item">
                    <Clock3 aria-hidden="true" />
                    {duration}
                  </span>
                )}
                {VisibilityIcon && (
                  <span
                    className="tasks-visibility"
                    role="img"
                    aria-label={visibilityLabel}
                    title={visibilityLabel}
                  >
                    <VisibilityIcon aria-hidden="true" />
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
                      할 일 {doneCount}/{tasks.length} ·{" "}
                      {Math.round((doneCount / tasks.length) * 100)}%
                    </span>
                    <ChevronDown
                      className={`tasks-chevron${expanded ? " tasks-chevron-open" : ""}`}
                      aria-hidden="true"
                    />
                  </span>
                )}
              </span>
            </button>
          </h3>
          <div className="tasks-card-actions">
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
              <DropdownMenuContent
                side="right"
                align="start"
                sideOffset={8}
                className="tasks-card-menu"
              >
                {!schedule.is_company_schedule && (
                  <DropdownMenuItem
                    disabled={scheduleCompletionMutation.isPending}
                    onSelect={() =>
                      void handleScheduleCompletionChange(!completed)
                    }
                  >
                    <Check aria-hidden="true" />
                    {completed ? "일정 완료 취소" : "일정 완료로 표시"}
                  </DropdownMenuItem>
                )}
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
              {tasks.length > 0 ? (
                <TaskList
                  tasks={tasks}
                  schedule={schedule}
                  selectionMode={selectionMode}
                  selectedTaskIds={selectedTaskIds}
                  onToggleTaskSelection={onToggleTaskSelection}
                />
              ) : (
                <p className="tasks-empty-details">
                  아직 연결된 할 일이 없습니다.
                </p>
              )}
              {canAddTask ? (
                <TaskForm
                  compact
                  defaultScheduleId={schedule.schedule_id}
                  onOpenDetails={onOpenAddTaskPanel}
                />
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
  emptyMessage = "아직 독립 할 일이 없습니다.",
  onCreated,
}: {
  tasks: Task[];
  selectedTaskIds: Set<number>;
  selectionMode: boolean;
  onToggleTaskSelection: (taskId: number) => void;
  emptyMessage?: string;
  onCreated?: (task: Task) => void;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const moves = useTaskMoveContext();
  useEffect(() => {
    if (moves?.lastMoved?.scheduleId === null) setExpanded(true);
  }, [moves?.lastMoved]);
  return (
    <section
      {...moves?.container(null)}
      className="tasks-independent-section"
      aria-labelledby={`${id}-heading`}
    >
      <div className="tasks-independent-header">
        <h2 className="tasks-section-heading">
          <button
            type="button"
            id={`${id}-heading`}
            className="tasks-section-toggle"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-controls={`${id}-list`}
            disabled={
              expanded && tasks.some((task) => selectedTaskIds.has(task.task_id))
            }
          >
            <span>독립 할 일</span>
            <span className="tasks-section-count">{tasks.length}</span>
            <ChevronDown
              className={`tasks-chevron${expanded ? " tasks-chevron-open" : ""}`}
              aria-hidden="true"
            />
          </button>
        </h2>
        <div className="tasks-independent-create">
          <TaskForm
            compact
            onOpen={() => setExpanded(true)}
            onCreated={onCreated}
          />
        </div>
      </div>
      <div id={`${id}-list`} className="tasks-section-body" hidden={!expanded}>
        {expanded && (
          <div className="tasks-card tasks-independent-list">
            {tasks.length > 0 ? (
              <TaskList
                tasks={tasks}
                selectedTaskIds={selectedTaskIds}
                selectionMode={selectionMode}
                onToggleTaskSelection={onToggleTaskSelection}
              />
            ) : (
              <p className="tasks-independent-empty">{emptyMessage}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
