import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskCompletionToggleButtonProps {
  completed: boolean;
  disabled?: boolean;
  compact?: boolean;
  showLabel?: boolean;
  className?: string;
  onCompletedChange: (completed: boolean) => void;
}

export default function TaskCompletionToggleButton({
  completed,
  disabled,
  compact = false,
  showLabel = false,
  className,
  onCompletedChange,
}: TaskCompletionToggleButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={completed}
      aria-label={completed ? "완료됨, 미완료로 변경" : "미완료, 완료로 변경"}
      title={completed ? "완료 취소" : "완료로 표시"}
      disabled={disabled}
      onClick={() => onCompletedChange(!completed)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        showLabel
          ? "min-h-8 min-w-[76px] gap-1.5 rounded-lg px-2.5 text-xs font-medium"
          : cn("rounded-full", compact ? "mt-0.5 h-5 w-5" : "h-6 w-6"),
        showLabel
          ? completed
            ? "border-violet-200 bg-violet-50 text-violet-600 enabled:hover:border-violet-300 enabled:hover:bg-violet-100"
            : "border-slate-200 bg-white text-slate-500 enabled:hover:border-violet-300 enabled:hover:bg-violet-50 enabled:hover:text-violet-600"
          : completed
          ? "border-violet-500 bg-violet-500 text-white hover:bg-violet-600 focus:ring-violet-100"
          : "border-slate-400 bg-white text-transparent hover:border-violet-500 focus:ring-violet-100",
        className,
      )}
    >
      {(completed || showLabel) && (
        <Check
          aria-hidden="true"
          className={compact || showLabel ? "h-3.5 w-3.5" : "h-4 w-4"}
          strokeWidth={showLabel ? 2 : 3}
        />
      )}
      {showLabel && <span>{completed ? "완료됨" : "완료"}</span>}
    </button>
  );
}
