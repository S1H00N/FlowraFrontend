import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/useCategories";
import {
  CATEGORY_TYPES,
  CATEGORY_TYPE_LABELS,
  DEFAULT_CATEGORY_COLORS,
  type Category,
  type CategoryType,
} from "@/types";
import { CategoryDot } from "@/components/CategorySelect";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import AppShell from "@/components/AppShell";

interface FormValues {
  name: string;
  color: string;
  type: CategoryType;
}

function CreateForm() {
  const createMutation = useCreateCategory();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      name: "",
      color: DEFAULT_CATEGORY_COLORS[0],
      type: "task",
    },
  });
  const color = watch("color");

  const onSubmit = useCallback(
    async (values: FormValues) => {
      const name = values.name.trim();
      if (!name) return;
      try {
        await createMutation.mutateAsync({
          name,
          color: values.color,
          type: values.type,
        });
        reset({
          name: "",
          color: DEFAULT_CATEGORY_COLORS[0],
          type: values.type,
        });
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
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <input
            type="text"
            placeholder="카테고리 이름"
            {...register("name", {
              required: "이름을 입력하세요.",
              maxLength: { value: 30, message: "30자 이하여야 합니다." },
            })}
            className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
              errors.name
                ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                : "border-slate-300 focus:border-slate-900 focus:ring-slate-900"
            }`}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>
        <select
          {...register("type")}
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          {CATEGORY_TYPES.map((t) => (
            <option key={t} value={t}>
              {CATEGORY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {createMutation.isPending ? "추가 중..." : "추가"}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">색상</span>
        {DEFAULT_CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setValue("color", c, { shouldDirty: true })}
            aria-label={c}
            className={`h-6 w-6 rounded-full ring-2 ${
              color === c ? "ring-slate-900" : "ring-transparent"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
        <input
          type="color"
          {...register("color")}
          className="ml-1 h-7 w-10 cursor-pointer rounded border border-slate-300 bg-white"
        />
      </div>
    </form>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    try {
      await updateMutation.mutateAsync({
        categoryId: category.category_id,
        payload: { name: name.trim(), color },
      });
      setIsEditing(false);
    } catch {
      /* global toast */
    }
  }, [name, color, category.category_id, updateMutation]);

  const handleDelete = useCallback(async () => {
    if (category.is_default) {
      if (!confirm("기본 카테고리입니다. 정말 삭제하시겠습니까?")) return;
    } else if (!confirm("정말 삭제하시겠습니까?")) {
      return;
    }
    try {
      await deleteMutation.mutateAsync(category.category_id);
    } catch {
      /* global toast */
    }
  }, [category, deleteMutation]);

  if (isEditing) {
    return (
      <li className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-white"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          <span className="text-xs text-slate-500">
            {CATEGORY_TYPE_LABELS[category.type]}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                setName(category.name);
                setColor(category.color);
                setIsEditing(false);
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              저장
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <CategoryDot color={category.color} />
      <span className="flex-1 truncate text-sm font-medium text-slate-900">
        {category.name}
      </span>
      {category.is_default && (
        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500">
          기본
        </span>
      )}
      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
        {CATEGORY_TYPE_LABELS[category.type]}
      </span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          수정
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          삭제
        </button>
      </div>
    </li>
  );
}

export default function Categories() {
  const { data = [], isLoading, isError, error, isFetching, refetch } =
    useCategories();

  const grouped = useMemo(() => {
    const groups: Record<CategoryType, Category[]> = {
      task: [],
      schedule: [],
      memo: [],
    };
    for (const c of data) groups[c.type]?.push(c);
    return groups;
  }, [data]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Category studio
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                카테고리
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                할 일·일정·메모를 분류할 카테고리를 관리하세요.
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

        <div className="mt-6">
          <CreateForm />
        </div>

        <div className="mt-6 space-y-6">
          {isLoading ? (
            <FullSpinner message="카테고리를 불러오는 중..." />
          ) : isError ? (
            <ErrorState
              title="카테고리를 불러오지 못했습니다"
              message={(error as Error).message}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          ) : data.length === 0 ? (
            <EmptyState
              title="카테고리가 없습니다"
              description="위 폼에서 새 카테고리를 추가해 보세요."
            />
          ) : (
            CATEGORY_TYPES.map((t) => (
              <section key={t}>
                <h2 className="mb-2 text-sm font-semibold text-slate-700">
                  {CATEGORY_TYPE_LABELS[t]}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    ({grouped[t].length})
                  </span>
                </h2>
                {grouped[t].length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {CATEGORY_TYPE_LABELS[t]} 카테고리가 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {grouped[t].map((c) => (
                      <CategoryRow key={c.category_id} category={c} />
                    ))}
                  </ul>
                )}
              </section>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
