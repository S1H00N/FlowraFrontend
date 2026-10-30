import { useMemo } from "react";
import CustomSelect, {
  type CustomSelectOption,
} from "@/components/ui/CustomSelect";
import { useCategories } from "@/hooks/useCategories";
import { cn } from "@/lib/utils";
import type { CategoryType } from "@/types";

interface CategorySelectProps {
  type: CategoryType;
  value: number | "" | undefined;
  onChange: (value: number | "") => void;
  className?: string;
  includeNone?: boolean;
  disabled?: boolean;
  variant?: "native" | "custom";
}

export function CategoryDot({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
      style={{ backgroundColor: color }}
    />
  );
}

export default function CategorySelect({
  type,
  value,
  onChange,
  className = "",
  includeNone = true,
  disabled,
  variant = "native",
}: CategorySelectProps) {
  const { data: categories = [], isLoading } = useCategories(type);

  const options = useMemo(
    () =>
      categories.map((c) => ({
        id: c.category_id,
        name: c.name,
        color: c.color,
      })),
    [categories],
  );

  const selected = useMemo(
    () => options.find((o) => o.id === value),
    [options, value],
  );

  if (variant === "custom") {
    const customOptions: CustomSelectOption<number | "">[] = [
      ...(includeNone ? [{ value: "" as const, label: "카테고리 없음" }] : []),
      ...options.map((option) => ({
        value: option.id,
        label: option.name,
        colorDot: option.color,
      })),
    ];

    return (
      <CustomSelect<number | "">
        value={value ?? ""}
        options={customOptions}
        onChange={onChange}
        ariaLabel="카테고리"
        disabled={disabled || isLoading}
        className={cn(
          "h-8 w-auto min-w-[136px] max-w-full gap-2 px-2.5 text-xs shadow-none hover:bg-slate-50 hover:shadow-none [&>span>span]:gap-2",
          className,
        )}
        contentClassName="shadow-lg shadow-slate-900/10 [&_[role=option]]:min-h-10 [&_[role=option]]:text-xs"
      />
    );
  }

  return (
    <div
      className={`relative flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm focus-within:border-violet-500 focus-within:ring-2 focus-within:ring-violet-100 ${className}`}
    >
      {selected ? (
        <CategoryDot color={selected.color} />
      ) : (
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full border border-dashed border-slate-300"
        />
      )}
      <select
        value={value ?? ""}
        disabled={disabled || isLoading}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? "" : Number(v));
        }}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-4 text-slate-700 outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {includeNone && <option value="">카테고리 없음</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );
}
