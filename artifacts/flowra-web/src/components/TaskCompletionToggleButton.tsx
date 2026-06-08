import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskCompletionToggleButtonProps {
  completed: boolean;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  onCompletedChange: (completed: boolean) => void;
}

export default function TaskCompletionToggleButton({
  completed,
  disabled,
  compact = false,
  className,
  onCompletedChange,
}: TaskCompletionToggleButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={completed}
      aria-label={completed ? "완료됨, 미완료로 변경" : "미완료, 완료로 변경"}
      title={completed ? "완료" : "미완료"}
      disabled={disabled}
      onClick={() => onCompletedChange(!completed)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
        compact ? "mt-0.5 h-5 w-5" : "h-6 w-6",
        completed
          ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-100"
          : "border-slate-400 bg-white text-transparent hover:border-emerald-500 focus:ring-emerald-100",
        className,
      )}
    >
      {completed && (
        <Check
          className={compact ? "h-3.5 w-3.5" : "h-4 w-4"}
          strokeWidth={3}
        />
      )}
    </button>
  );
}
