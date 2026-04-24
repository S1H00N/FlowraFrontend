import { useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreateTask } from "@/hooks/useTasks";
import {
  getClassificationOptions,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { taskSchema, type TaskFormValues } from "@/lib/schemas";
import CategorySelect from "@/components/CategorySelect";
import { Plus } from "lucide-react";
import { localInputToOffsetISOString } from "@/utils/dateUtils";

const defaults: TaskFormValues = {
  title: "",
  priority: "medium",
  status: "todo",
  category_id: "",
  due_datetime: "",
};

export default function TaskForm({
  defaultScheduleId,
}: {
  defaultScheduleId?: number;
}) {
  const createMutation = useCreateTask();
  const classificationSettings = useClassificationSettings();
  const priorityOptions = getClassificationOptions(
    classificationSettings,
    "taskPriorities",
    { enabledOnly: true, include: "medium", defaultOnly: true },
  );
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
              ? String(values.category_id)
              : undefined,
          schedule_id: defaultScheduleId ? String(defaultScheduleId) : undefined,
          due_datetime: values.due_datetime
            ? localInputToOffsetISOString(values.due_datetime)
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
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_150px_180px_180px_auto]">
        <div className="flex-1">
          <input
            type="text"
            placeholder="해야 할 일을 빠르게 입력하세요"
            {...register("title")}
            aria-invalid={!!errors.title}
            className={`h-11 w-full rounded-lg border px-3 text-sm shadow-sm outline-none transition focus:ring-2 ${
              errors.title
                ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                : "border-slate-200 bg-white focus:border-emerald-500 focus:ring-emerald-100"
            }`}
          />
          {errors.title && (
            <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>
          )}
        </div>
        <select
          {...register("priority")}
          aria-label="우선순위"
          className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        >
          {priorityOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <Controller
          control={control}
          name="category_id"
          render={({ field }) => (
            <CategorySelect
              type="task"
              value={field.value as number | "" | undefined}
              onChange={field.onChange}
              className="h-11 min-w-0"
            />
          )}
        />
        <label className="min-w-0">
          <span className="sr-only">마감</span>
          <input
            type="datetime-local"
            {...register("due_datetime")}
            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </label>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {createMutation.isPending ? "추가 중..." : "추가"}
        </button>
      </div>
      <input type="hidden" {...register("status")} value="todo" />
    </form>
  );
}
