import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { Check, Pencil, Plus, Tags, Trash2 } from "lucide-react";
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

const hexPattern = /^#[0-9A-Fa-f]{6}$/;

function ColorField({
  color,
  onChange,
}: {
  color: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {DEFAULT_CATEGORY_COLORS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => onChange(candidate)}
            aria-label={`색상 ${candidate}`}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 ring-2 transition ${
              color.toLowerCase() === candidate.toLowerCase()
                ? "ring-emerald-200"
                : "ring-transparent"
            }`}
            style={{ backgroundColor: candidate }}
          >
            {color.toLowerCase() === candidate.toLowerCase() && (
              <Check className="h-3.5 w-3.5 text-white drop-shadow" />
            )}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2">
        <input
          type="color"
          value={hexPattern.test(color) ? color : DEFAULT_CATEGORY_COLORS[0]}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
          aria-label="색상 선택"
        />
        <input
          type="text"
          value={color}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#10B981"
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          aria-label="HEX 색상값"
        />
      </div>
    </div>
  );
}

function CategoryForm() {
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
      color: DEFAULT_CATEGORY_COLORS[1],
      type: "task",
    },
  });
  const color = watch("color");

  const onSubmit = useCallback(
    async (values: FormValues) => {
      const name = values.name.trim();
      const colorValue = values.color.trim();
      if (!name || !hexPattern.test(colorValue)) return;

      try {
        await createMutation.mutateAsync({
          name,
          color: colorValue,
          type: values.type,
        });
        reset({
          name: "",
          color: DEFAULT_CATEGORY_COLORS[1],
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
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
        <Tags className="h-4 w-4 text-emerald-600" />새 카테고리
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
        <div>
          <input
            type="text"
            placeholder="카테고리 이름"
            {...register("name", {
              required: "이름을 입력하세요.",
              maxLength: { value: 30, message: "30자 이하여야 합니다." },
            })}
            className={`h-11 w-full rounded-lg border px-3 text-sm shadow-sm outline-none transition focus:ring-2 ${
              errors.name
                ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-100"
            }`}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        <select
          {...register("type")}
          className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          aria-label="카테고리 타입"
        >
          {CATEGORY_TYPES.map((type) => (
            <option key={type} value={type}>
              {CATEGORY_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={createMutation.isPending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {createMutation.isPending ? "추가 중..." : "추가"}
        </button>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-600">색상</p>
        <ColorField
          color={color}
          onChange={(nextColor) =>
            setValue("color", nextColor, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <input
          type="hidden"
          {...register("color", {
            required: "색상을 입력하세요.",
            pattern: { value: hexPattern, message: "HEX 색상값을 입력하세요." },
          })}
        />
        {errors.color && (
          <p className="mt-1 text-xs text-red-600">{errors.color.message}</p>
        )}
      </div>
    </form>
  );
}

function CategoryRow({ category }: { category: Category }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [error, setError] = useState<string | null>(null);
  const updateMutation = useUpdateCategory();
  const deleteMutation = useDeleteCategory();

  const resetEdit = () => {
    setName(category.name);
    setColor(category.color);
    setError(null);
    setIsEditing(false);
  };

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    const colorValue = color.trim();
    if (!trimmedName) {
      setError("이름을 입력하세요.");
      return;
    }
    if (!hexPattern.test(colorValue)) {
      setError("HEX 색상값을 입력하세요.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        categoryId: category.category_id,
        payload: { name: trimmedName, color: colorValue },
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
      <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_220px_auto] lg:items-start">
          <div>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </div>
          <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">
            {CATEGORY_TYPE_LABELS[category.type]}
          </div>
          <ColorField color={color} onChange={setColor} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetEdit}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              저장
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </li>
    );
  }

  return (
    <li className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <CategoryDot color={category.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-950">
          {category.name}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">{category.color}</p>
      </div>
      {category.is_default && (
        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-500">
          기본
        </span>
      )}
      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600">
        {CATEGORY_TYPE_LABELS[category.type]}
      </span>
      <div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          aria-label="수정"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          aria-label="삭제"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}

export default function Categories() {
  const {
    data = [],
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useCategories();

  const grouped = useMemo(() => {
    const groups: Record<CategoryType, Category[]> = {
      task: [],
      schedule: [],
      memo: [],
    };
    for (const category of data) groups[category.type]?.push(category);
    return groups;
  }, [data]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              홈으로
            </Link>
          </div>
        </section>

        <CategoryForm />

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                카테고리 목록
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                API 타입값 `task`, `schedule`, `memo` 기준으로 묶어 보여줍니다.
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>총 {data.length}건</p>
              {isFetching && <p className="mt-0.5">새로고침 중...</p>}
            </div>
          </div>

          <div className="p-5">
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
              <div className="grid gap-5 xl:grid-cols-3">
                {CATEGORY_TYPES.map((type) => (
                  <section key={type} className="min-w-0">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-800">
                        {CATEGORY_TYPE_LABELS[type]}
                      </h3>
                      <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        {grouped[type].length}건
                      </span>
                    </div>
                    {grouped[type].length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                        {CATEGORY_TYPE_LABELS[type]} 카테고리가 없습니다.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {grouped[type].map((category) => (
                          <CategoryRow
                            key={category.category_id}
                            category={category}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
