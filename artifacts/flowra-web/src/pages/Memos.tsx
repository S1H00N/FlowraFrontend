import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  BrainCircuit,
  CalendarClock,
  CheckSquare2,
  FileText,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import {
  useCreateMemo,
  useDeleteMemo,
  useApplyMemo,
  useMemoParseResult,
  useMemos,
  useParseMemo,
  useUpdateMemo,
} from "@/hooks/useMemos";
import {
  MEMO_TYPES,
  MEMO_TYPE_LABELS,
  PARSE_STATUS_LABELS,
  type Memo,
  type MemoParseResult,
  type MemoType,
  type ParseStatus,
} from "@/types";
import { getErrorMessage } from "@/lib/error";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import AppShell from "@/components/AppShell";
import { memoSchema, type MemoFormValues } from "@/lib/schemas";

type DetectedType = "schedule" | "task" | "note" | "mixed";

const parseStatusBadge: Record<ParseStatus, string> = {
  pending: "border-slate-200 bg-slate-50 text-slate-600",
  processing: "border-sky-200 bg-sky-50 text-sky-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
};

const detectedTypeLabels: Record<DetectedType, string> = {
  schedule: "일정",
  task: "할 일",
  note: "노트",
  mixed: "복합",
};

function formatDateTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ParseStatusBadge({ status }: { status: ParseStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${parseStatusBadge[status]}`}
    >
      {(status === "pending" || status === "processing") && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {PARSE_STATUS_LABELS[status]}
    </span>
  );
}

function MemoComposer() {
  const createMutation = useCreateMemo();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<MemoFormValues>({
    resolver: zodResolver(memoSchema),
    defaultValues: {
      raw_text: "",
      memo_type: "quick",
      category_id: "",
      auto_parse: true,
    },
  });

  const onSubmit = useCallback(
    async (values: MemoFormValues) => {
      try {
        await createMutation.mutateAsync({
          raw_text: values.raw_text,
          memo_type: values.memo_type,
          source_type: "manual",
          auto_parse: values.auto_parse,
          category_id:
            typeof values.category_id === "number"
              ? String(values.category_id)
              : undefined,
        });
        reset({
          raw_text: "",
          memo_type: values.memo_type,
          category_id: "",
          auto_parse: values.auto_parse,
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
        <BrainCircuit className="h-4 w-4 text-emerald-600" />
        AI 입력함
      </div>
      <textarea
        rows={7}
        placeholder="회의 내용, 약속, 해야 할 일, 생각나는 내용을 그대로 적어보세요. AI가 일정과 할 일을 추출합니다."
        {...register("raw_text")}
        aria-invalid={!!errors.raw_text}
        className={`mt-3 w-full resize-y rounded-lg border px-4 py-3 text-sm leading-6 shadow-sm outline-none transition focus:ring-2 ${
          errors.raw_text
            ? "border-red-400 focus:border-red-500 focus:ring-red-100"
            : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-100"
        }`}
      />
      {errors.raw_text && (
        <p className="mt-1 text-xs text-red-600">{errors.raw_text.message}</p>
      )}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          {...register("memo_type")}
          aria-label="메모 유형"
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
        >
          {MEMO_TYPES.map((type) => (
            <option key={type} value={type}>
              {MEMO_TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            {...register("auto_parse")}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          저장 후 AI 분석
        </label>

        <div className="flex-1" />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {createMutation.isPending ? "저장 중..." : "입력"}
        </button>
      </div>
    </form>
  );
}

function PendingPanel() {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
      AI 분석 대기열에 들어갔습니다.
    </div>
  );
}

function ProcessingPanel() {
  return (
    <div className="mt-3 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      <span className="font-medium">AI 분석 중</span>
      <span className="text-sky-600/80">잠시 후 결과가 붙습니다.</span>
    </div>
  );
}

function FailedPanel({
  message,
  onRetry,
  retrying,
}: {
  message?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">AI 분석 실패</div>
          <p className="mt-0.5 text-red-600/90">
            {message || "분석 중 문제가 발생했습니다."}
          </p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="shrink-0 rounded-md border border-red-300 bg-white px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {retrying ? "요청 중..." : "재시도"}
          </button>
        )}
      </div>
    </div>
  );
}

function getAppliedLink(applyType: "schedule" | "task", resource: unknown) {
  if (!resource || typeof resource !== "object") return null;
  const value = resource as {
    schedule_id?: number;
    task_id?: number;
    start_datetime?: string;
  };

  if (applyType === "schedule" && value.schedule_id) {
    const params = new URLSearchParams({
      schedule_id: String(value.schedule_id),
    });
    if (value.start_datetime) {
      const d = new Date(value.start_datetime);
      if (!Number.isNaN(d.getTime())) {
        params.set(
          "date",
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        );
      }
    }
    return `/schedules?${params.toString()}`;
  }

  if (applyType === "task" && value.task_id) {
    return `/tasks?${new URLSearchParams({ task_id: String(value.task_id) })}`;
  }

  return null;
}

function ResultPanel({
  memoId,
  data,
}: {
  memoId: number;
  data: MemoParseResult;
}) {
  const result = data.latest_result;
  const applyMutation = useApplyMemo();
  const [appliedLink, setAppliedLink] = useState<string | null>(null);

  if (!result) {
    return (
      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
        분석 결과가 없습니다.
      </div>
    );
  }

  const detected = result.detected_type as DetectedType;
  const confidence =
    typeof result.confidence_score === "number"
      ? `${Math.round(result.confidence_score * 100)}%`
      : null;

  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 font-medium text-emerald-700">
          <BrainCircuit className="h-3.5 w-3.5" />
          {detectedTypeLabels[detected] ?? result.detected_type}
        </span>
        {confidence && <span>신뢰도 {confidence}</span>}
        {result.status && <span>상태 {result.status}</span>}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {result.suggested_schedule && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <CalendarClock className="h-3.5 w-3.5 text-sky-600" />
              추출된 일정
            </div>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {result.suggested_schedule.title}
            </p>
            {result.suggested_schedule.start_datetime && (
              <p className="mt-1 text-xs text-slate-500">
                {formatDateTime(result.suggested_schedule.start_datetime)}
              </p>
            )}
            {result.suggested_schedule.location && (
              <p className="mt-1 text-xs text-slate-500">
                {result.suggested_schedule.location}
              </p>
            )}
            <button
              type="button"
              disabled={
                applyMutation.isPending || result.status === "approved"
              }
              onClick={async () => {
                const applied = await applyMutation.mutateAsync({
                  memoId,
                  payload: {
                    ai_result_id: String(result.ai_result_id),
                    apply_type: "schedule",
                  },
                });
                setAppliedLink(getAppliedLink(applied.apply_type, applied.resource));
              }}
              className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-60"
            >
              {result.status === "approved"
                ? "이미 적용됨"
                : applyMutation.isPending
                  ? "적용 중..."
                  : "일정으로 만들기"}
            </button>
          </div>
        )}

        {result.suggested_task && (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <CheckSquare2 className="h-3.5 w-3.5 text-emerald-600" />
              추출된 할 일
            </div>
            <p className="mt-2 text-sm font-medium text-slate-950">
              {result.suggested_task.title}
            </p>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
              {result.suggested_task.priority && (
                <span>우선순위 {result.suggested_task.priority}</span>
              )}
              {result.suggested_task.due_datetime && (
                <span>
                  {formatDateTime(result.suggested_task.due_datetime)}
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={
                applyMutation.isPending || result.status === "approved"
              }
              onClick={async () => {
                const applied = await applyMutation.mutateAsync({
                  memoId,
                  payload: {
                    ai_result_id: String(result.ai_result_id),
                    apply_type: "task",
                  },
                });
                setAppliedLink(getAppliedLink(applied.apply_type, applied.resource));
              }}
              className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              {result.status === "approved"
                ? "이미 적용됨"
                : applyMutation.isPending
                  ? "적용 중..."
                  : "할 일로 만들기"}
            </button>
          </div>
        )}

        {!result.suggested_schedule && !result.suggested_task && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <FileText className="h-3.5 w-3.5 text-slate-500" />
              노트로 분류됨
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              일정이나 할 일로 바로 전환할 항목은 감지되지 않았습니다.
            </p>
          </div>
        )}
      </div>
      {appliedLink && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-700">
          적용했습니다.{" "}
          <Link to={appliedLink} className="font-semibold underline">
            생성된 항목 보기
          </Link>
        </div>
      )}
    </div>
  );
}

function CompletedResult({ memoId }: { memoId: number }) {
  const { data, isLoading, isError, error } = useMemoParseResult(memoId);

  if (isLoading) return <PendingPanel />;
  if (isError) {
    return (
      <FailedPanel message={`결과 로드 실패: ${(error as Error).message}`} />
    );
  }
  if (!data) return null;
  if (data.memo.parse_status === "processing") return <ProcessingPanel />;
  if (data.memo.parse_status === "pending") return <PendingPanel />;
  if (data.memo.parse_status === "failed") return <FailedPanel />;
  return <ResultPanel memoId={memoId} data={data} />;
}

function ParseStatusView({
  memo,
  onRetry,
  retrying,
}: {
  memo: Memo;
  onRetry: () => void;
  retrying: boolean;
}) {
  switch (memo.parse_status) {
    case "pending":
      return <PendingPanel />;
    case "processing":
      return <ProcessingPanel />;
    case "failed":
      return (
        <FailedPanel
          message={memo.parse_error_message}
          onRetry={onRetry}
          retrying={retrying}
        />
      );
    case "completed":
      return <CompletedResult memoId={memo.memo_id} />;
    default:
      return null;
  }
}

function MemoFeedItem({ memo }: { memo: Memo }) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(memo.raw_text);
  const [memoType, setMemoType] = useState<MemoType>(memo.memo_type);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateMemo();
  const deleteMutation = useDeleteMemo();
  const parseMutation = useParseMemo();

  const handleSave = async () => {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        memoId: memo.memo_id,
        payload: { raw_text: text.trim(), memo_type: memoType },
      });
      setIsEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "수정에 실패했습니다."));
    }
  };

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(memo.memo_id);
    } catch (err) {
      setError(getErrorMessage(err, "삭제에 실패했습니다."));
    }
  };

  const handleParse = async () => {
    setError(null);
    try {
      await parseMutation.mutateAsync(memo.memo_id);
    } catch (err) {
      setError(getErrorMessage(err, "AI 파싱 요청에 실패했습니다."));
    }
  };

  return (
    <li className="group px-5 py-5">
      <div className="flex items-start gap-4">
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
              {MEMO_TYPE_LABELS[memo.memo_type]}
            </span>
            <ParseStatusBadge status={memo.parse_status} />
            <span className="text-xs text-slate-400">
              {formatDateTime(memo.created_at)}
            </span>
          </div>

          {isEditing ? (
            <div className="mt-3 space-y-2">
              <textarea
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <select
                value={memoType}
                onChange={(e) => setMemoType(e.target.value as MemoType)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              >
                {MEMO_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {MEMO_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-800">
              {memo.raw_text}
            </p>
          )}

          {!isEditing && (
            <ParseStatusView
              memo={memo}
              onRetry={handleParse}
              retrying={parseMutation.isPending}
            />
          )}

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setText(memo.raw_text);
                  setMemoType(memo.memo_type);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleParse}
                disabled={
                  parseMutation.isPending ||
                  memo.parse_status === "processing" ||
                  memo.parse_status === "pending"
                }
                aria-label="재분석"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
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
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export default function Memos() {
  const { data, isLoading, isError, error, isFetching, refetch } = useMemos();
  const items = data ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                AI inbox
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                메모
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                흩어진 생각을 입력하면 AI가 일정과 할 일 후보를 정리합니다.
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

        <MemoComposer />

        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                메모 피드
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                AI 파싱 상태와 추출 결과를 흐름대로 확인합니다.
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>총 {items.length}건</p>
              {isFetching && <p className="mt-0.5">새로고침 중...</p>}
            </div>
          </div>

          {isLoading ? (
            <div className="p-5">
              <FullSpinner message="메모를 불러오는 중..." />
            </div>
          ) : isError ? (
            <div className="p-5">
              <ErrorState
                title="메모를 불러오지 못했습니다"
                message={(error as Error).message}
                onRetry={() => refetch()}
                retrying={isFetching}
              />
            </div>
          ) : items.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="아직 메모가 없습니다"
                description="위 입력함에서 메모를 남기면 AI가 자동으로 분석해 드려요."
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {items.map((memo) => (
                <MemoFeedItem key={memo.memo_id} memo={memo} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
