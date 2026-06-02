import { Flag, Shapes, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { CategoryDot } from "@/components/CategorySelect";
import { cn } from "@/lib/utils";
import type { Category, TaskPriority } from "@/types";

const baseChipClass =
  "inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5";

export const priorityMetaClass: Record<TaskPriority, string> = {
  urgent: "border-red-200 bg-red-50 text-red-700",
  high: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
};

export function ListCardMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-1 flex min-w-0 flex-wrap items-center gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

function MetaChip({
  label,
  icon,
  children,
  value,
  className,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  value?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(baseChipClass, className)}
      title={value ? `${label}: ${value}` : label}
    >
      <span className="shrink-0 text-current/70" aria-hidden>
        {icon}
      </span>
      <span className="shrink-0 text-current/60">{label}</span>
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

export function TypeMetaChip({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <MetaChip
      label={label ?? "유형"}
      icon={<Shapes className="h-3 w-3" />}
      value={typeof children === "string" ? children : undefined}
      className="border-slate-200 bg-slate-50 text-slate-600"
    >
      {children}
    </MetaChip>
  );
}

export function PriorityMetaChip({
  priority,
  children,
}: {
  priority: TaskPriority;
  children: ReactNode;
}) {
  return (
    <MetaChip
      label="중요도"
      icon={<Flag className="h-3 w-3" />}
      value={typeof children === "string" ? children : undefined}
      className={priorityMetaClass[priority] ?? priorityMetaClass.medium}
    >
      {children}
    </MetaChip>
  );
}

export function CategoryMetaChip({
  category,
}: {
  category: Pick<Category, "name" | "color">;
}) {
  return (
    <MetaChip
      label="카테고리"
      icon={<Tag className="h-3 w-3" />}
      value={category.name}
      className="border-slate-200 bg-white text-slate-600"
    >
      <span className="inline-flex min-w-0 items-center gap-1">
        <CategoryDot color={category.color} />
        <span className="min-w-0 truncate">{category.name}</span>
      </span>
    </MetaChip>
  );
}
