interface SpinnerProps {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  label?: string;
}

const sizeMap = {
  xs: "h-3 w-3 border-2",
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-[3px]",
};

export default function Spinner({
  size = "md",
  className = "",
  label,
}: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label ?? "로딩 중"}
      className={`inline-block animate-spin rounded-full border-slate-200 border-t-slate-700 ${sizeMap[size]} ${className}`}
    />
  );
}

export function FullSpinner({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
      <Spinner size="lg" />
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
