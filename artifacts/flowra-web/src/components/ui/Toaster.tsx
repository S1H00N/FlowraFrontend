import { useSyncExternalStore } from "react";
import { toast, toastStore, type ToastType } from "@/lib/toast";

const styleByType: Record<ToastType, string> = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  info: "border-slate-200 bg-white text-slate-800",
};

const iconByType: Record<ToastType, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

const iconBgByType: Record<ToastType, string> = {
  success: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  info: "bg-slate-100 text-slate-700",
};

export default function Toaster() {
  const items = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getSnapshot,
  );

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.type === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-3 py-2 shadow-lg transition-all animate-in fade-in slide-in-from-top-2 duration-200 ${styleByType[t.type]}`}
        >
          <span
            aria-hidden
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${iconBgByType[t.type]}`}
          >
            {iconByType[t.type]}
          </span>
          <p className="flex-1 whitespace-pre-wrap break-words text-sm leading-snug">
            {t.message}
          </p>
          <button
            type="button"
            onClick={() => toast.dismiss(t.id)}
            aria-label="닫기"
            className="-mr-1 text-slate-400 transition hover:text-slate-700"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
