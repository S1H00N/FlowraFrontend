import type { CompanyProjectWorkItem } from "@/types";

export const WORK_STATUS_OPTIONS = [
  { value: "todo", label: "대기" },
  { value: "in_progress", label: "진행 중" },
  { value: "done", label: "완료" },
  { value: "postponed", label: "보류" },
  { value: "cancelled", label: "취소" },
] as const;

export const WORK_PRIORITY_OPTIONS = [
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
  { value: "urgent", label: "긴급" },
] as const;

export function workStatusLabel(status: string) {
  return WORK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function workPriorityLabel(priority?: string | null) {
  if (!priority) return "미정";
  return WORK_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

export function WorkStatusBadge({ status }: { status: string }) {
  const tone = status === "in_progress"
    ? "bg-accent text-accent-foreground"
    : status === "postponed"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      : status === "cancelled"
        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex max-w-full shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
      {workStatusLabel(status)}
    </span>
  );
}

export function WorkPriorityBadge({ priority }: { priority?: string | null }) {
  const tone = priority === "urgent"
    ? "text-rose-700 dark:text-rose-300"
    : priority === "high"
      ? "text-amber-700 dark:text-amber-300"
      : "text-muted-foreground";
  return <span className={`whitespace-nowrap text-xs font-medium ${tone}`}>{workPriorityLabel(priority)}</span>;
}

export function formatWorkProgress(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "미정";
  // Display the server value; neither override nor child rollup is recalculated here.
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function WorkProgress({ item, compact = false, label }: {
  item: CompanyProjectWorkItem;
  compact?: boolean;
  label?: string;
}) {
  const value = item.progress_percent;
  const validValue = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
  const manualOverride = typeof item.progress_override_percent === "number" && Number.isFinite(item.progress_override_percent);
  return (
    <div className={compact ? "min-w-20" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-2">
        {label && <span aria-hidden className="mr-auto text-xs text-muted-foreground">{label}</span>}
        <span className={`${compact ? "text-xs" : "text-sm"} tabular-nums`}>{formatWorkProgress(value)}</span>
        {manualOverride && (
          <span
            className="whitespace-nowrap text-[11px] text-muted-foreground"
            title={`수동 진행률 설정: ${formatWorkProgress(item.progress_override_percent)}`}
          >
            수동 설정
          </span>
        )}
      </div>
      {!compact && validValue && (
        <div
          role="progressbar"
          aria-label="업무 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={formatWorkProgress(value)}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
        </div>
      )}
    </div>
  );
}
