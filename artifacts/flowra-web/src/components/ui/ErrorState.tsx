interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
}

export default function ErrorState({
  title = "문제가 발생했습니다",
  message,
  onRetry,
  retrying,
  compact,
}: ErrorStateProps) {
  if (compact) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <div className="min-w-0">
          <span className="font-medium">{title}</span>
          {message && (
            <span className="ml-1 text-red-600/90">· {message}</span>
          )}
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="shrink-0 rounded-md border border-red-300 bg-white px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {retrying ? "재시도 중..." : "재시도"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-red-200 bg-red-50 px-6 py-10 text-center">
      <div
        aria-hidden
        className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-5 w-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m0 3.75h.008v.008H12v-.008zM10.34 4.49a1.92 1.92 0 013.32 0l7.41 12.78A1.92 1.92 0 0119.4 20H4.6a1.92 1.92 0 01-1.66-2.73L10.34 4.49z"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-red-800">{title}</p>
        {message && (
          <p className="mt-1 text-xs text-red-600/90">{message}</p>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-1 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
        >
          {retrying ? "재시도 중..." : "다시 시도"}
        </button>
      )}
    </div>
  );
}
