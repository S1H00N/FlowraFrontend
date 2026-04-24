import { memo, useCallback, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  useCompleteTask,
  useDeleteTask,
  useUpdateTask,
} from "@/hooks/useTasks";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/types";
import { taskSchema, type TaskFormValues } from "@/lib/schemas";
import CategorySelect, { CategoryDot } from "@/components/CategorySelect";
import { useCategories } from "@/hooks/useCategories";
import { CalendarClock } from "lucide-react";
import { localInputToOffsetISOString } from "@/utils/dateUtils";

const priorityBadge: Record<TaskPriority, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

function formatDue(iso?: string | null) {
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

function toLocalDateTimeInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TaskItemBase({
  task,
  highlighted,
}: {
  task: Task;
  highlighted?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const completeMutation = useCompleteTask();
  const { data: categories = [] } = useCategories("task");
  const taskCategory = categories.find(
    (c) => c.category_id === task.category_id,
  );

  const isDone = task.status === "done";

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: task.title,
      priority: task.priority,
      status: task.status,
      category_id: task.category_id ?? "",
      due_datetime: toLocalDateTimeInput(task.due_datetime),
    },
  });

  const handleSave = useCallback(
    async (values: TaskFormValues) => {
      try {
        await updateMutation.mutateAsync({
          taskId: task.task_id,
          payload: {
            title: values.title,
            priority: values.priority,
            status: values.status,
            category_id:
              typeof values.category_id === "number"
                ? String(values.category_id)
                : null,
            due_datetime: values.due_datetime
              ? localInputToOffsetISOString(values.due_datetime)
              : null,
          },
        });
        setIsEditing(false);
      } catch {
        /* global toast */
      }
    },
    [updateMutation, task.task_id],
  );

  const handleCancel = useCallback(() => {
    reset({
      title: task.title,
      priority: task.priority,
      status: task.status,
      category_id: task.category_id ?? "",
      due_datetime: toLocalDateTimeInput(task.due_datetime),
    });
    setIsEditing(false);
  }, [reset, task]);

  const handleDelete = useCallback(async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteMutation.mutateAsync(task.task_id);
    } catch {
      /* global toast */
    }
  }, [deleteMutation, task.task_id]);

  const handleComplete = useCallback(async () => {
    try {
      await completeMutation.mutateAsync(task.task_id);
    } catch {
      /* global toast */
    }
  }, [completeMutation, task.task_id]);

  if (isEditing) {
    return (
      <li
        id={`task-${task.task_id}`}
        className={`rounded-lg border bg-white p-4 shadow-sm ${
          highlighted
            ? "border-emerald-300 ring-2 ring-emerald-100"
            : "border-slate-200"
        }`}
      >
        <form
          onSubmit={handleSubmit(handleSave)}
          noValidate
          className="space-y-2"
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <input
                type="text"
                {...register("title")}
                className={`w-full rounded-lg border px-3 py-3 text-sm shadow-sm outline-none transition focus:ring-2 ${
                  errors.title
                    ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                    : "border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-100"
                }`}
              />
              {errors.title && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.title.message}
                </p>
              )}
            </div>
            <select
              {...register("priority")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm outline-none"
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
            <select
              {...register("status")}
              className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm outline-none"
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <CategorySelect
                  type="task"
                  value={field.value as number | "" | undefined}
                  onChange={field.onChange}
                  className="sm:min-w-44"
                />
              )}
            />
            <label className="flex flex-1 items-center gap-2 text-xs font-medium text-slate-600">
              마감
              <input
                type="datetime-local"
                {...register("due_datetime")}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm shadow-sm outline-none"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              저장
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      id={`task-${task.task_id}`}
      className={`group rounded-lg border bg-white p-4 shadow-sm ${
        highlighted
          ? "border-emerald-300 ring-2 ring-emerald-100"
          : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleComplete}
          disabled={isDone || completeMutation.isPending}
          aria-label={isDone ? "완료됨" : "완료로 표시"}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
            isDone
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-slate-300 bg-white hover:border-emerald-500"
          }`}
        >
          {isDone ? "✓" : null}
        </button>

        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="min-w-0 flex-1 text-left"
        >
          <p
            className={`truncate text-sm font-medium ${
              isDone ? "text-slate-400 line-through" : "text-slate-900"
            }`}
          >
            {task.title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <CalendarClock className="h-3.5 w-3.5" />
              {formatDue(task.due_datetime)}
            </span>
            <span
              className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${priorityBadge[task.priority]}`}
            >
              {TASK_PRIORITY_LABELS[task.priority]}
            </span>
            {taskCategory && (
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
                <CategoryDot color={taskCategory.color} />
                {taskCategory.name}
              </span>
            )}
          </div>
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
