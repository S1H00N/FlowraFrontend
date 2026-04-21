import { useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateTask } from "@/hooks/useTasks";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "@/types";
import { taskSchema, type TaskFormValues } from "@/lib/schemas";
import CategorySelect from "@/components/CategorySelect";

const defaults: TaskFormValues = {
  title: "",
  priority: "medium",
  status: "todo",
  category_id: "",
  due_datetime: "",
};

export default function TaskForm() {
  const createMutation = useCreateTask();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: defaults,
  });

  const onSubmit = useCallback(
    async (values: TaskFormValues) => {
      try {
        await createMutation.mutateAsync({
          title: values.title,
          priority: values.priority,
          status: values.status,
          category_id:
            typeof values.category_id === "number"
              ? values.category_id
              : undefined,
          due_datetime: values.due_datetime
            ? new Date(values.due_datetime).toISOString()
            : undefined,
        });
        reset(defaults);
      } catch {
        /* global toast */
      }
    },
    [createMutation, reset],
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <input
            type="text"
            placeholder="할 일을 입력하세요"
            {...register("title")}
            aria-invalid={!!errors.title}
            className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors.title
                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                : "border-slate-300 focus:border-slate-900 focus:ring-slate-900"
            }`}
          />
          {errors.title && (
            <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>
          )}
        </div>
        <select
          {...register("priority")}
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          {...register("status")}
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
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
        <label className="flex flex-1 items-center gap-2 text-xs text-slate-600">
          마감
          <input
            type="datetime-local"
            {...register("due_datetime")}
            className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-60"
        >
          {createMutation.isPending ? "추가 중..." : "추가"}
        </button>
      </div>
    </form>
  );
}
