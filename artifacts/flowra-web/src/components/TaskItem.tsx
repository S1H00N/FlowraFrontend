import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useDeleteTask,
  useSetTaskCompletion,
  useUpdateTask,
} from "@/hooks/useTasks";
import { type Schedule, type Task, type TaskPriority } from "@/types";
import {
  getClassificationLabel,
  getClassificationOptions,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { taskSchema, type TaskFormValues } from "@/lib/schemas";
import CustomSelect from "@/components/ui/CustomSelect";
import {
  ListCardMeta,
  PriorityMetaChip,
  priorityMetaClass,
  TypeMetaChip,
} from "@/components/ListCardMeta";
import { CalendarClock, Clock3, MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTaskMoveContext } from "@/components/tasks/TaskMoveContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/error";
import { localInputToOffsetISOString } from "@/utils/dateUtils";
import TaskCompletionToggleButton from "@/components/TaskCompletionToggleButton";
import "@/components/tasks/TaskReorder.css";
import type { TaskReorderProps } from "@/hooks/useLinkedTaskDrag";
import { useTaskComposer } from "@/components/tasks/TaskComposerContext";
import {
  CompactDateInput,
  CompactTimeInput,
  dateKeyFromLocalInput,
  localInputWithDateKey,
  localInputWithTime,
  timeFromLocalInput,
  toDateKey,
} from "@/components/CompactDateTimeInputs";

const priorityDotColor: Record<TaskPriority, string> = {
  low: "#94a3b8",
  medium: "#8b5cf6",
  high: "#f59e0b",
  urgent: "#f43f5e",
};

function formatDue(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDateTimeInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TaskItemBase({
  task,
  highlighted,
  schedule,
  compact = false,
  selected = false,
  selectionMode = false,
  hidden = false,
  onToggleSelection,
  onCompleting,
  reorder,
}: {
  task: Task;
  highlighted?: boolean;
  schedule?: Schedule;
  compact?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  hidden?: boolean;
  onToggleSelection?: () => void;
  onCompleting?: () => void;
  reorder?: TaskReorderProps;
}) {
  const [localIsEditing, setLocalIsEditing] = useState(false);
  const moves = useTaskMoveContext();
  const composer = useTaskComposer();
  const isEditing = composer
    ? composer.active?.kind === "task-edit" &&
      composer.active.taskId === task.task_id
    : localIsEditing;
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLLIElement>(null);
  const titleButton = useRef<HTMLButtonElement>(null);
  const dueDateInput = useRef<HTMLInputElement>(null);
  const dueTimeInput = useRef<HTMLInputElement>(null);
  const timeButton = useRef<HTMLButtonElement>(null);
  const timePickerContainer = useRef<HTMLDivElement>(null);
  const completionButton = useRef<HTMLButtonElement>(null);

  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const completionMutation = useSetTaskCompletion();
  const classificationSettings = useClassificationSettings();
  const priorityOptions = getClassificationOptions(
    classificationSettings,
    "taskPriorities",
    { enabledOnly: true, include: task.priority, defaultOnly: true },
  );

  const isDone = task.status === "done";
  const scheduleDateKey = schedule ? toDateKey(schedule.start_datetime) : "";
  const scheduleEndDateKey = schedule?.end_datetime
    ? toDateKey(schedule.end_datetime)
    : scheduleDateKey;
  const linkedSingleDay =
    task.schedule_id != null &&
    !!scheduleDateKey &&
    scheduleDateKey === scheduleEndDateKey &&
    (!task.due_datetime || toDateKey(task.due_datetime) === scheduleDateKey);
  const linkedTask = task.schedule_id != null;
  const timeOnly = linkedTask && (!task.due_datetime || (!!scheduleDateKey && toDateKey(task.due_datetime) >= scheduleDateKey && toDateKey(task.due_datetime) <= scheduleEndDateKey));
  const initialDueValue = toLocalDateTimeInput(task.due_datetime);
  const editorDueValue = initialDueValue;

  const {
    register,
    handleSubmit,
    control,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task.title,
      priority: task.priority,
      status: task.status,
      due_datetime: editorDueValue,
    },
  });

  useEffect(() => {
    if (!isEditing) return;
    setFocus("title");
  }, [isEditing, setFocus]);

  useEffect(() => {
    if (!isEditing || !showTimePicker) return;
    requestAnimationFrame(() => dueTimeInput.current?.focus());
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!timePickerContainer.current?.contains(event.target as Node)) {
        setShowTimePicker(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isEditing, showTimePicker]);

  const closeEditor = useCallback((restoreFocus = true) => {
    if (composer) {
      composer.setActive((current) =>
        current?.kind === "task-edit" && current.taskId === task.task_id
          ? null
          : current,
      );
    } else {
      setLocalIsEditing(false);
    }
    setShowTimePicker(false);
    if (restoreFocus) requestAnimationFrame(() => titleButton.current?.focus());
  }, [composer, task.task_id]);

  useEffect(() => {
    if (!isEditing) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || editorRef.current?.contains(target)) return;
      if (target instanceof Element) {
        if (target.closest(".task-editor-priority-menu")) return;
        if (
          target.closest(".schedule-date-popover") &&
          dueDateInput.current?.getAttribute("aria-expanded") === "true"
        ) return;
      }
      // Let the clicked control act first, then close this editor if it is still open.
      queueMicrotask(() => closeEditor(false));
    };
    document.addEventListener("click", closeOnOutsideClick, true);
    return () => document.removeEventListener("click", closeOnOutsideClick, true);
  }, [closeEditor, isEditing]);

  const openEditor = () => {
    reset({
      title: task.title,
      priority: task.priority,
      status: task.status,
      due_datetime: editorDueValue,
    });
    setError(null);
    setShowTimePicker(false);
    if (composer) {
      composer.setActive({ kind: "task-edit", taskId: task.task_id });
    } else {
      setLocalIsEditing(true);
    }
  };

  const handleSave = useCallback(
    async (values: TaskFormValues) => {
      setError(null);
      try {
        const save = updateMutation.mutateAsync({
          taskId: task.task_id,
          payload: {
            title: values.title,
            priority: values.priority,
            due_datetime: values.due_datetime
              ? localInputToOffsetISOString(values.due_datetime)
              : null,
          },
        });
        closeEditor();
        await save;
      } catch (err) {
        setError(getErrorMessage(err, "할 일 수정에 실패했습니다."));
        if (composer) {
          composer.setActive({ kind: "task-edit", taskId: task.task_id });
        } else {
          setLocalIsEditing(true);
        }
      }
    },
    [updateMutation, task.task_id, closeEditor, linkedSingleDay, scheduleDateKey, composer],
  );

  const handleCancel = useCallback(() => {
    reset({
      title: task.title,
      priority: task.priority,
      status: task.status,
      due_datetime: editorDueValue,
    });
    setError(null);
    closeEditor();
  }, [reset, task, editorDueValue, closeEditor]);

  const handleDelete = useCallback(async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteMutation.mutateAsync(task.task_id);
    } catch (err) {
      setError(getErrorMessage(err, "할 일 삭제에 실패했습니다."));
    }
  }, [deleteMutation, task.task_id]);

  const handleCompletionChange = useCallback(
    async (completed: boolean) => {
      if (completed === isDone) return;
      const restoreFocus = document.activeElement === completionButton.current;
      if (completed) onCompleting?.();
      setError(null);

      try {
        await completionMutation.mutateAsync({
          taskId: task.task_id,
          completed,
        });
      } catch (err) {
        setError(getErrorMessage(err, "완료 상태 변경에 실패했습니다."));
      } finally {
        if (restoreFocus)
          requestAnimationFrame(() => {
            if (document.activeElement === document.body)
              completionButton.current?.focus();
          });
      }
    },
    [completionMutation, isDone, task.task_id, onCompleting],
  );

  if (isEditing) {
    return (
      <li
        id={`task-${task.task_id}`}
        ref={editorRef}
        hidden={hidden}
        data-task-editor
        className="rounded-lg border border-slate-200 bg-white p-3"
      >
        <form
          onSubmit={handleSubmit(handleSave)}
          aria-label={`${task.title} 수정`}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) {
              if (event.key === "Enter") event.preventDefault();
              return;
            }
            if (
              event.key === "Escape" &&
              event.target instanceof HTMLInputElement &&
              (event.target.name === "flowra_date_input" ||
                event.target.name === "flowra_time_input")
            ) {
              if (linkedTask && event.target.name === "flowra_time_input") {
                event.stopPropagation();
                setShowTimePicker(false);
                requestAnimationFrame(() => timeButton.current?.focus());
              }
              return;
            }
            if (event.key === "Escape" && !updateMutation.isPending) {
              event.stopPropagation();
              handleCancel();
            }
          }}
          noValidate
          className="space-y-2.5"
        >
          <fieldset
            disabled={updateMutation.isPending}
            className="min-w-0 space-y-2.5"
          >
            <div>
              <label htmlFor={`task-title-${task.task_id}`} className="mb-1 block text-xs font-semibold text-slate-700">
                할 일
              </label>
              <Input
                id={`task-title-${task.task_id}`}
                type="text"
                aria-invalid={!!errors.title}
                {...register("title")}
                className={`h-9 rounded-md bg-transparent px-3 text-sm font-medium shadow-none hover:bg-white/60 focus:bg-white ${
                  errors.title
                    ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                    : "border-transparent hover:border-slate-200 focus:border-violet-300 focus:ring-violet-100"
                }`}
              />
              {errors.title && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  {errors.title.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 border-t border-slate-200 pt-3 dark:border-zinc-700 sm:grid-cols-2">
              <div className="min-w-0">
                <span className="mb-1 block text-xs font-semibold text-slate-600">우선순위</span>
                <Controller
                  control={control}
                  name="priority"
                  render={({ field }) => (
                    <CustomSelect<TaskPriority>
                      value={field.value}
                      options={priorityOptions.map((option) => ({
                        label: option.label,
                        value: option.value,
                        colorDot: priorityDotColor[option.value],
                      }))}
                      onChange={field.onChange}
                      ariaLabel="우선순위 선택"
                      contentClassName="task-editor-priority-menu"
                      className="h-9 rounded-md border-transparent bg-transparent px-3 shadow-none hover:border-slate-200 hover:bg-white/60 hover:shadow-none focus-visible:border-violet-300 focus-visible:bg-white data-[state=open]:border-violet-300 data-[state=open]:bg-white"
                    />
                  )}
                />
              </div>
              <div className="min-w-0">
                <span className="mb-1 block text-xs font-semibold text-slate-600">
                  {timeOnly ? "마감 시간" : "마감일"}
                </span>
                <Controller
                  control={control}
                  name="due_datetime"
                  render={({ field }) => {
                    const dueValue = field.value ?? "";
                    const dateKey = dateKeyFromLocalInput(dueValue);
                    const timeValue = timeFromLocalInput(dueValue);
                    const changeTime = (nextTime: string) =>
                      field.onChange(
                        localInputWithTime(
                          linkedSingleDay ? "" : dueValue,
                          nextTime,
                          linkedSingleDay
                            ? scheduleDateKey
                            : dateKey || scheduleDateKey || toDateKey(new Date()),
                        ),
                      );

                    if (timeOnly) {
                      return (
                        <div ref={timePickerContainer} className="min-w-0">
                          {showTimePicker ? (
                            <CompactTimeInput
                              value={timeValue}
                              onChange={changeTime}
                              onCommit={() => setShowTimePicker(false)}
                              ariaLabel="마감 시간 선택"
                              emptyPlaceholder="시간 없음"
                              inputRef={dueTimeInput}
                              className="h-9 w-full border-transparent bg-transparent px-3 hover:border-slate-200 hover:bg-white/60 focus-within:border-violet-300 focus-within:bg-white"
                            />
                          ) : timeValue ? (
                            <div className="flex h-9 max-w-full items-center rounded-md border border-transparent bg-transparent transition hover:border-slate-200 hover:bg-white/60 focus-within:border-violet-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-violet-100">
                              <button
                                ref={timeButton}
                                type="button"
                                aria-label="마감 시간 수정"
                                onClick={() => setShowTimePicker(true)}
                                className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-l-md px-3 text-left text-sm font-medium tabular-nums text-slate-900 focus-visible:outline-none"
                              >
                                <Clock3 aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                                <span>{timeValue}</span>
                              </button>
                              <button
                                type="button"
                                aria-label="마감 시간 제거"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  field.onChange("");
                                }}
                                className="flex h-full w-8 shrink-0 items-center justify-center rounded-r-md text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
                              >
                                <X aria-hidden="true" className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              ref={timeButton}
                              type="button"
                              aria-label="마감 시간 설정"
                              onClick={() => setShowTimePicker(true)}
                              className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-md border border-transparent bg-transparent px-3 text-sm font-medium text-slate-600 transition hover:border-slate-200 hover:bg-white/60 focus-visible:border-violet-300 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
                            >
                              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                              시간 설정
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] gap-2">
                        <CompactDateInput
                          value={dateKey}
                          onChange={(nextDateKey) =>
                            field.onChange(localInputWithDateKey(dueValue, nextDateKey, timeValue || "09:00"))
                          }
                          ariaLabel="마감 날짜 선택"
                          emptyPlaceholder="날짜 선택"
                          inputRef={dueDateInput}
                          className="h-9 w-full border-transparent bg-transparent px-3 hover:border-slate-200 hover:bg-white/60 focus-within:border-violet-300 focus-within:bg-white"
                        />
                        <CompactTimeInput
                          value={timeValue}
                          onChange={changeTime}
                          ariaLabel="마감 시간 선택"
                          inputRef={dueTimeInput}
                          className="h-9 w-full border-transparent bg-transparent px-2 hover:border-slate-200 hover:bg-white/60 focus-within:border-violet-300 focus-within:bg-white"
                        />
                        {dueValue && <button type="button" aria-label="마감일 제거" onClick={() => field.onChange("")} className="tasks-more"><X /></button>}
                      </div>
                    );
                  }}
                />
              </div>
            </div>
            {task.description && <p className="break-words text-xs text-slate-600">{task.description}</p>}
          </fieldset>
          {error && (
            <p role="alert" className="tasks-inline-error">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-zinc-700">
            <button
              type="button"
              onClick={handleCancel}
              disabled={updateMutation.isPending}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-100 disabled:opacity-60"
            >
              저장
            </button>
          </div>
        </form>
      </li>
    );
  }

  if (compact) {
    const due = task.due_datetime ? new Date(task.due_datetime) : null;
    const scheduleDate = schedule ? new Date(schedule.start_datetime) : null;
    const sameDay =
      due && scheduleDate && due.toDateString() === scheduleDate.toDateString();
    const dueLabel = sameDay
      ? due.toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
        })
      : formatDue(task.due_datetime);
    const busy =
      updateMutation.isPending ||
      deleteMutation.isPending ||
      completionMutation.isPending;
    return (
      <li
        id={`task-${task.task_id}`}
        hidden={hidden}
        data-selection-key={
          onToggleSelection ? `task:${task.task_id}` : undefined
        }
        data-selection-mode={selectionMode}
        data-reorder-drop={reorder?.dropPosition ?? undefined}
        draggable={!!reorder && !hidden}
        tabIndex={reorder && !hidden ? 0 : undefined}
        aria-label={reorder ? `${task.title} 순서 변경` : undefined}
        onDragStart={reorder?.onDragStart}
        onDragEnd={reorder?.onDragEnd}
        onDragOver={reorder?.onDragOver}
        onDrop={reorder?.onDrop}
        onKeyDown={reorder?.onKeyDown}
        className={`tasks-subtask${highlighted ? " task-moved-highlight" : ""}${isDone ? " tasks-subtask-completed" : ""}${selected ? " tasks-subtask-selected" : ""}${reorder ? " task-reorderable" : ""}${reorder?.dragging ? " task-reorder-dragging" : ""}`}
      >
        <label
          className="tasks-row-check"
          data-task-drag-exclude
          title={isDone ? "완료 취소" : "완료로 표시"}
        >
          <Checkbox
            ref={completionButton}
            checked={isDone}
            disabled={updateMutation.isPending || deleteMutation.isPending}
            aria-disabled={busy}
            aria-busy={completionMutation.isPending}
            onCheckedChange={(checked) => {
              if (!busy) void handleCompletionChange(checked === true);
            }}
            aria-label={`${task.title} 완료`}
          />
        </label>
        <button
          ref={titleButton}
          type="button"
          draggable={!!reorder}
          className="tasks-subtask-open"
          onClick={() => openEditor()}
          title={task.title}
        >
          <span className="tasks-subtask-title">{task.title}</span>
        </button>
        <div className="tasks-subtask-meta">
          {task.due_datetime && (
            <span title={formatDue(task.due_datetime) ?? undefined}>
              {dueLabel}
            </span>
          )}
          <span
            className={`tasks-priority-badge ${priorityMetaClass[task.priority]}`}
          >
            {getClassificationLabel(
              classificationSettings,
              "taskPriorities",
              task.priority,
            )}
          </span>
        </div>
        <div className="tasks-row-actions">
          {moves && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-task-drag-exclude
                  className="tasks-more"
                  aria-label={`${task.title} 이동 메뉴`}
                  disabled={moves.disabled || busy}
                >
                  <MoreHorizontal />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="task-move-menu">
                <DropdownMenuItem onSelect={() => moves.openPicker(task)}>
                  다른 일정으로 이동…
                </DropdownMenuItem>
                {task.schedule_id != null && (
                  <DropdownMenuItem onSelect={() => moves.move({ task, scheduleId: null })}>
                    독립 할 일로 이동
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <button
            type="button"
            data-task-drag-exclude
            className="tasks-more tasks-delete-button"
            aria-label={`${task.title} 삭제`}
            title="삭제"
            disabled={busy}
            onClick={() => void handleDelete()}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </div>
        {error && (
          <p className="tasks-inline-error" role="alert">
            {error}
          </p>
        )}
      </li>
    );
  }

  return (
    <li
      id={`task-${task.task_id}`}
      className={`group rounded-lg border bg-white p-4 shadow-sm ${
        highlighted
          ? "border-violet-300 ring-2 ring-violet-100"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <TaskCompletionToggleButton
          completed={isDone}
          disabled={completionMutation.isPending}
          compact
          onCompletedChange={handleCompletionChange}
        />

        <button
          type="button"
          ref={titleButton}
          onClick={() => openEditor()}
          className="min-w-0 flex-1 text-left"
        >
          <p
            className={`truncate text-sm font-medium ${
              isDone ? "text-slate-400 line-through" : "text-slate-900"
            }`}
          >
            {task.title}
          </p>
          <ListCardMeta>
            {task.due_datetime && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <CalendarClock className="h-3.5 w-3.5" />
                {formatDue(task.due_datetime)}
              </span>
            )}
            <TypeMetaChip label="상태">
              {getClassificationLabel(
                classificationSettings,
                "taskStatuses",
                task.status,
              )}
            </TypeMetaChip>
            <PriorityMetaChip priority={task.priority}>
              {getClassificationLabel(
                classificationSettings,
                "taskPriorities",
                task.priority,
              )}
            </PriorityMetaChip>
            {schedule && (
              <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                <CalendarClock className="h-3 w-3" />
                <span className="truncate">{schedule.title}</span>
                <span className="text-sky-500">
                  {getClassificationLabel(
                    classificationSettings,
                    "scheduleTypes",
                    schedule.schedule_type,
                  )}
                </span>
              </span>
            )}
          </ListCardMeta>
        </button>

        <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            aria-label="삭제"
            className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            삭제
          </button>
        </div>
      </div>
    </li>
  );
}

export default memo(TaskItemBase);
