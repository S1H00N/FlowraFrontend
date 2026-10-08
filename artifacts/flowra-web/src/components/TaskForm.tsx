import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateTask } from "@/hooks/useTasks";
import {
  getClassificationOptions,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { taskSchema, type TaskFormValues } from "@/lib/schemas";
import { Plus, X } from "lucide-react";
import { getErrorMessage } from "@/lib/error";
import { localInputToOffsetISOString } from "@/utils/dateUtils";
import { useTaskComposer } from "@/components/tasks/TaskComposerContext";
import type { Task } from "@/types";

const defaults: TaskFormValues = {
  title: "",
  priority: "medium",
  status: "todo",
  due_datetime: "",
};

export default function TaskForm({
  defaultScheduleId,
  defaultDueDate,
  compact = false,
  onOpenDetails,
  onOpen,
  onCreated,
}: {
  defaultScheduleId?: number;
  defaultDueDate?: string;
  compact?: boolean;
  onOpenDetails?: () => void;
  onOpen?: () => void;
  onCreated?: (task: Task) => void;
}) {
  const formDefaults = useMemo(
    () => ({
      ...defaults,
      due_datetime: defaultDueDate ? `${defaultDueDate}T23:59` : "",
    }),
    [defaultDueDate],
  );
  const [localAdding, setLocalAdding] = useState(false);
  const composer = useTaskComposer();
  const quickAddScheduleId = defaultScheduleId ?? null;
  const adding = composer
    ? composer.active?.kind === "task-quick-add" &&
      composer.active.scheduleId === quickAddScheduleId
    : localAdding;
  const [error, setError] = useState<string | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const quickAddForm = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const createMutation = useCreateTask();
  const classificationSettings = useClassificationSettings();
  const priorityOptions = getClassificationOptions(
    classificationSettings,
    "taskPriorities",
    { enabledOnly: true, include: "medium", defaultOnly: true },
  );
  const {
    register,
    control,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: formDefaults,
  });

  const onSubmit = useCallback(
    async (values: TaskFormValues) => {
      if (submitting.current) return;
      submitting.current = true;
      setError(null);
      try {
        const createdTask = await createMutation.mutateAsync({
          title: values.title,
          priority: values.priority,
          status: values.status,
          schedule_id: defaultScheduleId != null
            ? String(defaultScheduleId)
            : undefined,
          due_datetime: values.due_datetime
            ? localInputToOffsetISOString(values.due_datetime)
            : undefined,
        });
        onCreated?.(createdTask);
        reset(formDefaults);
        if (compact) setFocus("title");
      } catch (err) {
        setError(getErrorMessage(err, "할 일 추가에 실패했습니다."));
      } finally {
        submitting.current = false;
      }
    },
    [
      createMutation,
      reset,
      formDefaults,
      defaultScheduleId,
      compact,
      setFocus,
      onCreated,
    ],
  );

  const closeQuickAdd = useCallback(
    (restoreFocus: boolean) => {
      if (submitting.current) return;
      reset(formDefaults);
      setError(null);
      if (composer) {
        composer.setActive((current) =>
          current?.kind === "task-quick-add" &&
          current.scheduleId === quickAddScheduleId
            ? null
            : current,
        );
      } else {
        setLocalAdding(false);
      }
      if (restoreFocus) requestAnimationFrame(() => addButton.current?.focus());
    },
    [composer, quickAddScheduleId, reset, formDefaults],
  );

  useEffect(() => {
    if (!compact || !adding) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!quickAddForm.current?.contains(event.target as Node)) {
        closeQuickAdd(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [compact, adding, closeQuickAdd]);

  if (compact) {
    return adding ? (
      <form
        ref={quickAddForm}
        className="tasks-quick-add"
        aria-label="빠른 할 일 추가"
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            if (event.key === "Enter") event.preventDefault();
            return;
          }
          if (event.key === "Escape") {
            event.stopPropagation();
            closeQuickAdd(true);
          }
        }}
      >
        <div className="tasks-quick-add-controls">
          <input
            autoFocus
            aria-label="새 할 일"
            placeholder="할 일을 입력하세요..."
            maxLength={100}
            readOnly={createMutation.isPending}
            aria-invalid={!!errors.title}
            {...register("title")}
          />
          <button
            type="submit"
            className="tasks-add-subtask"
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "저장 중…" : "추가"}
          </button>
          <button
            type="button"
            className="tasks-more"
            aria-label="빠른 추가 취소"
            onClick={() => closeQuickAdd(true)}
            disabled={createMutation.isPending}
          >
            <X />
          </button>
        </div>
        <p className="tasks-quick-add-hint">
          Enter로 추가 · Esc로 닫기
        </p>
        {defaultScheduleId == null && <Controller control={control} name="due_datetime" render={({ field }) => {
          const [date = "", time = ""] = (field.value || "").split("T");
          return <div className="tasks-quick-add-date">
            <label>마감일 (선택)<input type="date" aria-label="새 할 일 마감일" value={date} disabled={createMutation.isPending}
              onChange={(event) => field.onChange(event.target.value ? `${event.target.value}T${time || "09:00"}` : "")} /></label>
            <label>시간<input type="time" aria-label="새 할 일 마감 시간" value={time} disabled={!date || createMutation.isPending}
              onChange={(event) => field.onChange(`${date}T${event.target.value || "09:00"}`)} /></label>
            {date && <button type="button" className="tasks-more" aria-label="새 할 일 마감일 제거" onClick={() => field.onChange("")}><X /></button>}
          </div>;
        }} />}
        {(errors.title || error) && (
          <p role="alert" className="tasks-inline-error">
            {errors.title?.message || error}
          </p>
        )}
      </form>
    ) : (
      <div className="tasks-add-options">
        <button
          ref={addButton}
          type="button"
          className="tasks-add-subtask"
          onClick={() => {
            reset(formDefaults);
            setError(null);
            onOpen?.();
            if (composer) {
              composer.setActive({
                kind: "task-quick-add",
                scheduleId: quickAddScheduleId,
              });
            } else {
              setLocalAdding(true);
            }
          }}
        >
          <Plus aria-hidden="true" />할 일 추가
        </button>
        {onOpenDetails && (
          <button
            type="button"
            className="tasks-add-subtask tasks-add-details"
            onClick={onOpenDetails}
          >
            상세 설정으로 추가
          </button>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="p-3"
    >
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_150px_180px_auto]">
        <div className="flex-1">
          <input
            type="text"
            placeholder="해야 할 일을 빠르게 입력하세요"
            {...register("title")}
            aria-invalid={!!errors.title}
            className={`h-11 w-full rounded-lg border bg-transparent px-3 text-sm outline-none transition hover:bg-white/60 focus:bg-white focus:ring-2 ${
              errors.title
                ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                : "border-transparent hover:border-slate-200 focus:border-violet-500 focus:ring-violet-100"
            }`}
          />
          {errors.title && (
            <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>
          )}
        </div>
        <select
          {...register("priority")}
          aria-label="우선순위"
          className="h-11 rounded-lg border border-transparent bg-transparent px-3 text-sm outline-none hover:border-slate-200 hover:bg-white/60 focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-100"
        >
          {priorityOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <label className="min-w-0">
          <span className="sr-only">마감</span>
          <input
            type="datetime-local"
            {...register("due_datetime")}
            className="h-11 w-full rounded-lg border border-transparent bg-transparent px-3 text-sm outline-none hover:border-slate-200 hover:bg-white/60 focus:border-violet-500 focus:bg-white focus:ring-2 focus:ring-violet-100"
          />
        </label>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {createMutation.isPending ? "추가 중..." : "추가"}
        </button>
      </div>
      <input type="hidden" {...register("status")} value="todo" />
    </form>
  );
}
