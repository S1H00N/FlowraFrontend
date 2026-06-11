import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Link2,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  useApplyMemo,
  useCreateMemo,
  useDeleteMemo,
  useMemoParseResult,
  useMemos,
  useParseMemo,
  useUpdateMemo,
} from "@/hooks/useMemos";
import { useDeleteSchedule } from "@/hooks/useSchedules";
import { useDeleteTask } from "@/hooks/useTasks";
import {
  MEMO_TYPES,
  MEMO_TYPE_LABELS,
  PARSE_STATUS_LABELS,
  type AiParseResult,
  type AiSuggestedAction,
  type ApplyMemoResponse,
  type Memo,
  type MemoType,
  type ParseStatus,
} from "@/types";
import { getErrorMessage } from "@/lib/error";
import {
  formatAiSuggestedActionDateTime,
  getAiSuggestedActionDateLabel as getActionDateLabel,
  getAiSuggestedActionPriorityTone as getActionPriority,
  getAiSuggestedActionReviewMeta as getActionReviewMeta,
  getAiSuggestedActionSummaryMeta as getActionMeta,
  getAiSuggestedActionTitle as getActionTitle,
  getSuggestedActions,
} from "@/lib/aiSuggestedActions";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import AppShell from "@/components/AppShell";
import CategorySelect from "@/components/CategorySelect";
import { useCategories } from "@/hooks/useCategories";
import { memoSchema, type MemoFormValues } from "@/lib/schemas";
import { cn } from "@/lib/utils";

type DetectedType = "schedule" | "task" | "note" | "mixed";
type MemoWorkspaceMode = "read" | "create";
type AppliedActionResource = {
  kind: "schedule" | "task";
  id: number;
  link: string | null;
};

type AppliedActionStore = Record<string, AppliedActionResource>;

const memoPanelButtonClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200";

const appSidebarToggleButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent text-slate-500 shadow-none transition hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300";

const APPLIED_ACTIONS_STORAGE_KEY = "flowra:memo-applied-actions:v1";

const parseStatusBadge: Record<ParseStatus, string> = {
  pending: "bg-gray-100 text-gray-500",
  processing: "bg-sky-100 text-sky-700",
  completed: "bg-violet-100 text-violet-700",
  failed: "bg-red-50 text-red-600",
};

const detectedTypeLabels: Record<DetectedType, string> = {
  schedule: "일정",
  task: "할 일",
  note: "노트",
  mixed: "복합",
};

const priorityDot: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-gray-300",
};

function readAppliedActionStore(): AppliedActionStore {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(APPLIED_ACTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AppliedActionStore;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) =>
          value &&
          (value.kind === "schedule" || value.kind === "task") &&
          Number.isFinite(value.id),
      ),
    );
  } catch {
    return {};
  }
}

function writeAppliedActionStore(store: AppliedActionStore) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    APPLIED_ACTIONS_STORAGE_KEY,
    JSON.stringify(store),
  );
}

function resourceFromApplyResponse(
  applied: ApplyMemoResponse,
): AppliedActionResource | null {
  const resource = applied.resource ?? applied.resources?.[0] ?? null;
  if (!resource || typeof resource !== "object") return null;

  if ("schedule_id" in resource && typeof resource.schedule_id === "number") {
    return {
      kind: "schedule",
      id: resource.schedule_id,
      link: getAppliedLink(resource),
    };
  }

  if ("task_id" in resource && typeof resource.task_id === "number") {
    return {
      kind: "task",
      id: resource.task_id,
      link: getAppliedLink(resource),
    };
  }

  return null;
}

function formatCompactDateTime(iso?: string | null) {
  return formatAiSuggestedActionDateTime(iso) ?? "";
}

function normalizeText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function getMemoTitle(memo?: Memo | null, result?: AiParseResult | null) {
  if (!memo) return "메모";

  const aiTitle =
    result?.extracted_title?.trim() ??
    memo.last_ai_result?.extracted_title?.trim();
  if (aiTitle) return aiTitle;

  const firstLine = memo.raw_text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (firstLine) {
    return firstLine.length > 42 ? `${firstLine.slice(0, 42)}...` : firstLine;
  }

  return "제목 없는 메모";
}

function getMemoPreview(memo: Memo) {
  const preview = normalizeText(memo.raw_text);
  if (!preview) return "내용 없음";
  return preview.length > 82 ? `${preview.slice(0, 82)}...` : preview;
}

function getAppliedLink(resource: unknown) {
  if (!resource || typeof resource !== "object") return null;
  const value = resource as {
    schedule_id?: number;
    task_id?: number;
    start_datetime?: string;
  };

  if (value.schedule_id) {
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

  if (value.task_id) {
    return `/tasks?${new URLSearchParams({ task_id: String(value.task_id) })}`;
  }

  return null;
}

function ParseStatusPill({ status }: { status: ParseStatus }) {
  const isAi = status === "completed";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        parseStatusBadge[status],
      )}
    >
      {isAi ? (
        <Sparkles className="h-2.5 w-2.5" />
      ) : (
        <FileText className="h-2.5 w-2.5" />
      )}
      {isAi ? "AI 분석됨" : PARSE_STATUS_LABELS[status]}
    </span>
  );
}

function MemoListPanel({
  items,
  selectedMemoId,
  search,
  leftOpen,
  isLoading,
  isError,
  error,
  isFetching,
  confirmDeleteId,
  onToggleLeft,
  onSearchChange,
  onSelect,
  onCreate,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  onRetry,
}: {
  items: Memo[];
  selectedMemoId: number | null;
  search: string;
  leftOpen: boolean;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  confirmDeleteId: number | null;
  onToggleLeft: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (memoId: number) => void;
  onCreate: () => void;
  onRequestDelete: (memoId: number) => void;
  onConfirmDelete: (memoId: number) => void;
  onCancelDelete: () => void;
  onRetry: () => void;
}) {
  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-gray-100 bg-gray-50/60 transition-all duration-200",
        leftOpen ? "w-[220px]" : "w-[48px]",
      )}
    >
      <div className="flex h-12 items-center gap-2 border-b border-gray-100 px-3">
        <button
          type="button"
          onClick={onToggleLeft}
          className={memoPanelButtonClass}
          aria-label={leftOpen ? "메모 목록 접기" : "메모 목록 열기"}
          title={leftOpen ? "메모 목록 접기" : "메모 목록 열기"}
        >
          {leftOpen ? (
            <PanelLeftClose className="h-4 w-4" />
          ) : (
            <PanelLeftOpen className="h-4 w-4" />
          )}
        </button>
        {leftOpen && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
              메모
            </span>
            <button
              type="button"
              onClick={onCreate}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
              aria-label="새 메모"
              title="새 메모"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {leftOpen && (
        <div className="border-b border-gray-100 px-3 py-2.5">
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
            <Search className="h-3 w-3 shrink-0 text-gray-400" />
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="검색..."
              aria-label="메모 검색"
              className="min-w-0 flex-1 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
            />
          </label>
        </div>
      )}

      <div className="relative flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className={cn(leftOpen ? "px-3 py-8" : "px-1 py-4")}>
            {leftOpen ? (
              <FullSpinner message="메모를 불러오는 중..." />
            ) : (
              <RefreshCw className="mx-auto h-4 w-4 animate-spin text-gray-400" />
            )}
          </div>
        ) : isError ? (
          <div className="px-3 py-4">
            {leftOpen ? (
              <ErrorState
                title="메모를 불러오지 못했습니다"
                message={(error as Error).message}
                onRetry={onRetry}
                retrying={isFetching}
              />
            ) : (
              <button
                type="button"
                onClick={onRetry}
                className={memoPanelButtonClass}
                aria-label="메모 다시 불러오기"
                title="메모 다시 불러오기"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : items.length === 0 ? (
          <div className={cn("py-8 text-center", leftOpen ? "px-4" : "px-1")}>
            {leftOpen ? (
              <>
                <p className="text-sm font-semibold text-gray-500">
                  표시할 메모가 없습니다
                </p>
                <p className="mt-1 text-xs leading-5 text-gray-400">
                  새 메모를 만들거나 검색어를 바꿔보세요.
                </p>
              </>
            ) : (
              <FileText className="mx-auto h-4 w-4 text-gray-300" />
            )}
          </div>
        ) : (
          items.map((memo) => {
            const selected = memo.memo_id === selectedMemoId;
            const confirmingThis = confirmDeleteId === memo.memo_id;

            return (
              <div key={memo.memo_id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(memo.memo_id)}
                  title={getMemoTitle(memo)}
                  className={cn(
                    "flex w-full items-center gap-2.5 transition-colors",
                    leftOpen ? "px-3 py-2 pr-8" : "justify-center px-3 py-2.5",
                    selected
                      ? "bg-violet-100 text-violet-800"
                      : "text-gray-600 hover:bg-gray-200/60 hover:text-gray-900",
                  )}
                >
                  {memo.parse_status === "completed" ? (
                    <Sparkles
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        selected ? "text-violet-600" : "text-violet-400",
                      )}
                    />
                  ) : (
                    <FileText
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        selected ? "text-gray-700" : "text-gray-400",
                      )}
                    />
                  )}
                  {leftOpen && (
                    <span
                      className={cn(
                        "min-w-0 truncate text-left text-xs",
                        selected ? "font-semibold" : "font-medium",
                      )}
                    >
                      {getMemoTitle(memo)}
                    </span>
                  )}
                </button>

                {leftOpen && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRequestDelete(memo.memo_id);
                    }}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    aria-label="메모 삭제"
                    title="메모 삭제"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}

                {confirmingThis && leftOpen && (
                  <div
                    className="absolute left-0 right-0 z-50 mx-1 rounded-lg border border-red-200 bg-white px-3 py-2.5 shadow-lg"
                    style={{ top: "calc(100% + 2px)" }}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <p className="mb-2 flex items-center gap-1 text-[11px] font-medium text-gray-700">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
                      메모를 삭제할까요?
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onConfirmDelete(memo.memo_id)}
                        className="flex-1 rounded-md bg-red-500 py-1 text-[11px] font-medium text-white transition-colors hover:bg-red-600"
                      >
                        삭제
                      </button>
                      <button
                        type="button"
                        onClick={onCancelDelete}
                        className="flex-1 rounded-md bg-gray-100 py-1 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-200"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function MemoCreatePanel({
  onCreated,
  onCancel,
}: {
  onCreated: (memo: Memo) => void;
  onCancel: () => void;
}) {
  const createMutation = useCreateMemo();
  const {
    register,
    handleSubmit,
    control,
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
      const created = await createMutation.mutateAsync({
        raw_text: values.raw_text,
        memo_type: values.memo_type,
        source_type: "manual",
        auto_parse: values.auto_parse,
        category_id:
          typeof values.category_id === "number"
            ? String(values.category_id)
            : undefined,
      });
      onCreated(created);
    },
    [createMutation, onCreated],
  );

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex min-w-0 flex-1 flex-col overflow-hidden"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-100 px-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">
            <FileText className="h-2.5 w-2.5" />
            새 메모
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-7 rounded-lg px-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex h-7 items-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            {createMutation.isPending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-8">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <select
            {...register("memo_type")}
            aria-label="메모 유형"
            className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          >
            {MEMO_TYPES.map((type) => (
              <option key={type} value={type}>
                {MEMO_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <Controller
            control={control}
            name="category_id"
            render={({ field }) => (
              <CategorySelect
                type="memo"
                value={field.value as number | "" | undefined}
                onChange={field.onChange}
                className="h-9 min-w-44 py-1.5 text-xs"
              />
            )}
          />
          <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
            <input
              type="checkbox"
              {...register("auto_parse")}
              className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            저장 후 AI 분석
          </label>
        </div>

        <textarea
          rows={16}
          placeholder="메모를 입력하세요..."
          {...register("raw_text")}
          aria-invalid={!!errors.raw_text}
          className={cn(
            "h-full min-h-[420px] w-full resize-none rounded-xl border bg-gray-50 p-4 text-[15px] leading-[1.85] text-gray-700 outline-none transition-all focus:border-transparent focus:ring-2",
            errors.raw_text
              ? "border-red-300 focus:ring-red-200"
              : "border-gray-200 focus:ring-violet-300",
          )}
        />
        {errors.raw_text && (
          <p className="mt-2 text-xs text-red-600">
            {errors.raw_text.message}
          </p>
        )}
      </div>
    </form>
  );
}

function MemoReaderPanel({
  memo,
  parseStatus,
  latestResult,
  onDeleted,
}: {
  memo: Memo;
  parseStatus?: ParseStatus;
  latestResult?: AiParseResult | null;
  onDeleted: (memoId: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(memo.raw_text);
  const [memoType, setMemoType] = useState<MemoType>(memo.memo_type);
  const [categoryId, setCategoryId] = useState<number | "">(
    memo.category_id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const updateMutation = useUpdateMemo();
  const deleteMutation = useDeleteMemo();
  const parseMutation = useParseMemo();
  const { data: categories = [] } = useCategories("memo");
  const category = categories.find((c) => c.category_id === memo.category_id);
  const status = parseStatus ?? memo.parse_status;

  useEffect(() => {
    setIsEditing(false);
    setText(memo.raw_text);
    setMemoType(memo.memo_type);
    setCategoryId(memo.category_id ?? "");
    setError(null);
  }, [memo.category_id, memo.memo_id, memo.memo_type, memo.raw_text]);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  const handleSave = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    try {
      await updateMutation.mutateAsync({
        memoId: memo.memo_id,
        payload: {
          raw_text: text.trim(),
          memo_type: memoType,
          category_id:
            typeof categoryId === "number" ? String(categoryId) : null,
        },
      });
      setIsEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "수정에 실패했습니다."));
    }
  };

  const handleDelete = async () => {
    if (!confirm("메모를 삭제할까요?")) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(memo.memo_id);
      onDeleted(memo.memo_id);
    } catch (err) {
      setError(getErrorMessage(err, "삭제에 실패했습니다."));
    }
  };

  const handleParse = async () => {
    setError(null);
    try {
      await parseMutation.mutateAsync({
        memoId: memo.memo_id,
        force: status === "completed" || status === "failed",
      });
    } catch (err) {
      setError(getErrorMessage(err, "AI 파싱 요청에 실패했습니다."));
    }
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-100 px-6">
        <div className="flex min-w-0 items-center gap-2">
          <ParseStatusPill status={status} />
          <span className="truncate text-xs text-gray-400">
            {formatCompactDateTime(memo.updated_at ?? memo.created_at)}
          </span>
          {category && (
            <>
              <span className="h-1 w-1 rounded-full bg-gray-300" />
              <span className="truncate text-xs text-gray-400">
                {category.name}
              </span>
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!isEditing ? (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
            >
              <Pencil className="h-3.5 w-3.5" />
              편집
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={updateMutation.isPending}
                className="h-7 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-60"
              >
                {updateMutation.isPending ? "저장 중..." : "저장"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setText(memo.raw_text);
                  setMemoType(memo.memo_type);
                  setCategoryId(memo.category_id ?? "");
                }}
                className="h-7 rounded-lg px-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100"
              >
                취소
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs text-gray-500 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
            aria-label="메모 삭제"
            title="메모 삭제"
          >
            <Trash2 className="h-3.5 w-3.5" />
            삭제
          </button>

          {status !== "processing" && status !== "pending" && (
            <button
              type="button"
              onClick={handleParse}
              disabled={parseMutation.isPending}
              className="flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs text-violet-500 transition-colors hover:bg-violet-50 hover:text-violet-700 disabled:opacity-60"
            >
              {parseMutation.isPending ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : status === "completed" ? (
                <RefreshCw className="h-3.5 w-3.5" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {status === "completed" ? "재분석" : "AI 분석하기"}
            </button>
          )}
        </div>
      </div>

      <form
        onSubmit={handleSave}
        className="min-h-0 flex-1 overflow-y-auto px-10 py-8"
      >
        <h1 className="mb-6 text-2xl font-bold leading-snug text-gray-900">
          {getMemoTitle(memo, latestResult)}
        </h1>

        {isEditing ? (
          <>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="h-full min-h-[320px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 p-4 text-[15px] leading-[1.85] text-gray-700 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-violet-300"
              placeholder="메모를 입력하세요..."
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={memoType}
                onChange={(event) => setMemoType(event.target.value as MemoType)}
                className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-gray-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                {MEMO_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {MEMO_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <CategorySelect
                type="memo"
                value={categoryId}
                onChange={setCategoryId}
                className="h-9 min-w-44 py-1.5 text-xs"
              />
            </div>
          </>
        ) : (
          <div
            className="max-w-none cursor-text whitespace-pre-wrap text-[15px] leading-[1.85] text-gray-700"
            onDoubleClick={() => setIsEditing(true)}
            title="더블클릭하여 편집"
          >
            {memo.raw_text}
          </div>
        )}

        {error && <p className="mt-4 text-xs text-red-600">{error}</p>}
      </form>
    </section>
  );
}

function EmptyMemoPanel({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex min-w-0 flex-1 items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
          <FileText className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">
            아직 메모가 없습니다
          </p>
          <p className="mt-1 text-xs leading-6 text-gray-500">
            새 메모를 남기면 AI가 일정과 할 일을 추출합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="flex h-8 items-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-medium text-white transition-colors hover:bg-gray-700"
        >
          <Plus className="h-3.5 w-3.5" />
          새 메모
        </button>
      </div>
    </section>
  );
}

function PendingPanel() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-4 text-center text-xs text-gray-400">
      AI 분석 대기열에 들어갔습니다.
    </div>
  );
}

function ProcessingPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16">
      <RefreshCw className="h-5 w-5 animate-spin text-violet-500" />
      <span className="text-xs font-medium text-violet-600">
        AI 분석 중...
      </span>
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
    <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-xs text-red-700">
      <div className="font-semibold">AI 분석 실패</div>
      <p className="mt-1 leading-5 text-red-600/90">
        {message || "분석 중 문제가 발생했습니다."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-3 flex h-7 items-center gap-1 rounded-lg bg-white px-2 text-[11px] font-medium text-red-600 ring-1 ring-red-100 hover:bg-red-50 disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3 w-3", retrying && "animate-spin")} />
          다시 분석
        </button>
      )}
    </div>
  );
}

function AiResultContent({
  memoId,
  result,
}: {
  memoId: number;
  result: AiParseResult;
}) {
  const applyMutation = useApplyMemo();
  const deleteScheduleMutation = useDeleteSchedule();
  const deleteTaskMutation = useDeleteTask();
  const [appliedActions, setAppliedActions] = useState<AppliedActionStore>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [appliedLink, setAppliedLink] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  const rawActions = useMemo(() => getSuggestedActions(result), [result]);
  const visibleEntries = useMemo(
    () =>
      rawActions
        .map((action, index) => ({ action, index }))
        .filter(({ index }) => !removed.has(index)),
    [rawActions, removed],
  );

  const scheduleEntries = visibleEntries.filter(
    ({ action }) => action.type === "create_schedule",
  );

  const linkedTaskIndexes = new Set<number>();
  const linkedTasksBySchedule = scheduleEntries.map(({ action, index }) => {
    const scheduleTitle = getActionTitle(action);
    const tasks = visibleEntries.filter(
      ({ action: taskAction, index: taskIndex }) => {
        const linked =
          taskAction.type === "create_task" &&
          (taskAction.related_action_index === index ||
            taskAction.related_schedule_title === scheduleTitle);
        if (linked) linkedTaskIndexes.add(taskIndex);
        return linked;
      },
    );
    return { scheduleIndex: index, tasks };
  });

  const independentTasks = visibleEntries.filter(
    ({ action, index }) =>
      action.type === "create_task" && !linkedTaskIndexes.has(index),
  );
  const pendingItems = visibleEntries.filter(
    ({ action }) => action.type === "pending_item",
  );
  const totalTasks =
    linkedTaskIndexes.size + independentTasks.length + pendingItems.length;
  const detected = result.detected_type as DetectedType;
  const actionKey = (index: number) => `${memoId}:${result.ai_result_id}:${index}`;
  const added = useMemo(
    () => new Set(Object.keys(appliedActions)),
    [appliedActions],
  );

  useEffect(() => {
    setExpanded(new Set(scheduleEntries.map(({ index }) => String(index))));
    setRemoved(new Set());
    setAppliedActions(readAppliedActionStore());
    setAppliedLink(null);
    setApplyError(null);
  }, [result.ai_result_id]);

  const toggleExpanded = (index: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      const key = String(index);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rememberAppliedAction = (
    index: number,
    applied: AppliedActionResource,
  ) => {
    const key = actionKey(index);
    setAppliedActions((prev) => {
      const next = { ...prev, [key]: applied };
      writeAppliedActionStore(next);
      return next;
    });
    setAppliedLink(applied.link);
  };

  const forgetAppliedAction = (index: number) => {
    const key = actionKey(index);
    setAppliedActions((prev) => {
      const next = { ...prev };
      delete next[key];
      writeAppliedActionStore(next);
      return next;
    });
  };

  const handleApplyAction = async (index: number) => {
    const action = rawActions[index];
    if (!action || (action.type !== "create_schedule" && action.type !== "create_task")) {
      return;
    }
    setApplyError(null);
    try {
      const applied = await applyMutation.mutateAsync({
        memoId,
        payload: {
          apply_type: "action",
          action_index: index,
        },
      });
      const appliedResource = resourceFromApplyResponse(applied);
      if (appliedResource) {
        rememberAppliedAction(index, appliedResource);
      } else {
        setAppliedLink(getAppliedLink(applied.resource));
      }
    } catch (err) {
      setApplyError(getErrorMessage(err, "AI 제안 적용에 실패했습니다."));
    }
  };

  const handleCancelAction = async (index: number) => {
    const applied = appliedActions[actionKey(index)];
    if (!applied) return;

    setApplyError(null);
    try {
      if (applied.kind === "schedule") {
        await deleteScheduleMutation.mutateAsync(applied.id);
      } else {
        await deleteTaskMutation.mutateAsync(applied.id);
      }
      forgetAppliedAction(index);
      setAppliedLink(null);
    } catch (err) {
      setApplyError(getErrorMessage(err, "추가된 항목 취소에 실패했습니다."));
    }
  };

  const handleApplyBundle = async (indexes: number[]) => {
    setApplyError(null);
    try {
      for (const index of indexes) {
        const action = rawActions[index];
        if (
          added.has(actionKey(index)) ||
          !action ||
          (action.type !== "create_schedule" && action.type !== "create_task")
        ) {
          continue;
        }
        const applied = await applyMutation.mutateAsync({
          memoId,
          payload: {
            apply_type: "action",
            action_index: index,
          },
        });
        const appliedResource = resourceFromApplyResponse(applied);
        if (appliedResource) {
          rememberAppliedAction(index, appliedResource);
        }
      }
    } catch (err) {
      setApplyError(getErrorMessage(err, "AI 결과 적용에 실패했습니다."));
    }
  };

  const renderMeta = (action: AiSuggestedAction) => {
    const meta = getActionMeta(action);
    const reviewMeta = getActionReviewMeta(action);

    return (
      <>
        {meta.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
            {meta.map((item) => (
              <span key={String(item)} className="flex items-center gap-0.5">
                {String(item).includes("마감") ? (
                  <Clock className="h-2.5 w-2.5" />
                ) : String(item).includes("층") ||
                  String(item).includes("온라인") ? (
                  <MapPin className="h-2.5 w-2.5" />
                ) : null}
                {item}
              </span>
            ))}
          </div>
        )}
        {reviewMeta.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {reviewMeta.map((item) => (
              <span
                key={String(item)}
                className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
              >
                {item}
              </span>
            ))}
          </div>
        )}
      </>
    );
  };

  const renderPlusButton = (index: number, addedLabel = false) => {
    const isAdded = added.has(actionKey(index));
    const busy =
      applyMutation.isPending ||
      deleteScheduleMutation.isPending ||
      deleteTaskMutation.isPending;

    return (
      <button
        type="button"
        onClick={() =>
          isAdded ? void handleCancelAction(index) : void handleApplyAction(index)
        }
        disabled={busy}
        aria-label={isAdded ? "추가 취소" : "추가"}
        title={isAdded ? "추가 취소" : "추가"}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md transition-colors",
          addedLabel
            ? "h-6 gap-1 px-2 text-[11px] font-medium"
            : "h-6 w-6",
          isAdded
            ? "bg-indigo-100 text-indigo-700 hover:bg-red-50 hover:text-red-500"
            : "text-gray-300 hover:bg-indigo-50 hover:text-indigo-500",
        )}
      >
        {isAdded ? (
          <>
            <Check className="h-3 w-3" />
            {addedLabel && "추가됨"}
          </>
        ) : (
          <>
            <Plus className="h-3 w-3" />
            {addedLabel && "일정 추가"}
          </>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-2">
      {visibleEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
          <Sparkles className="h-6 w-6 text-gray-300" />
          <p className="text-center text-xs">
            추출된 일정과 할 일이 없습니다.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-1 flex items-center gap-1.5 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-xs font-semibold text-violet-900">
              {detectedTypeLabels[detected] ?? result.detected_type}
            </span>
            <span className="ml-auto text-[10px] text-violet-500">
              일정 {scheduleEntries.length} · 할 일 {totalTasks}
            </span>
          </div>

          {scheduleEntries.map(({ action, index }, schedulePosition) => {
            const linkedTasks =
              linkedTasksBySchedule[schedulePosition]?.tasks ?? [];
            const isExpanded = expanded.has(String(index));
            const scheduleAdded = added.has(actionKey(index));
            const addedTodoCount = linkedTasks.filter(({ index: taskIndex }) =>
              added.has(actionKey(taskIndex)),
            ).length;
            const allDone =
              scheduleAdded && addedTodoCount === linkedTasks.length;
            const bundleIndexes = [
              index,
              ...linkedTasks.map(({ index: taskIndex }) => taskIndex),
            ];

            return (
              <div
                key={`${action.type}-${index}`}
                className="group/card overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <div
                  className={cn(
                    "border-b border-gray-100 px-3 py-2.5",
                    scheduleAdded ? "bg-indigo-50/60" : "bg-white",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Calendar
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        scheduleAdded ? "text-indigo-500" : "text-gray-400",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            priorityDot[getActionPriority(action)],
                          )}
                        />
                        <p className="truncate text-xs font-semibold leading-tight text-gray-900">
                          {getActionTitle(action)}
                        </p>
                      </div>
                      {renderMeta(action)}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRemoved((prev) => new Set(prev).add(index))
                      }
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-200 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover/card:opacity-100"
                      aria-label="일정 후보 삭제"
                      title="일정 후보 삭제"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5">
                    {!allDone && linkedTasks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleApplyBundle(bundleIndexes)}
                        disabled={applyMutation.isPending}
                        className="rounded px-1.5 py-0.5 text-[11px] text-gray-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50"
                      >
                        전체 추가
                      </button>
                    )}
                    {renderPlusButton(index, true)}
                    {linkedTasks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(index)}
                        className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        aria-label={isExpanded ? "연결 할 일 접기" : "연결 할 일 펼치기"}
                        title={isExpanded ? "연결 할 일 접기" : "연결 할 일 펼치기"}
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {linkedTasks.length > 0 &&
                  (isExpanded ? (
                    <div className="divide-y divide-gray-50">
                      <div className="flex items-center gap-1 px-3 py-1.5">
                        <Link2 className="h-3 w-3 text-gray-300" />
                        <span className="text-[10px] text-gray-400">
                          연결된 할 일 {linkedTasks.length}개
                        </span>
                      </div>
                      {linkedTasks.map(
                        ({ action: taskAction, index: taskIndex }, idx) => {
                          const isAdded = added.has(actionKey(taskIndex));
                          return (
                            <div
                              key={`${taskAction.type}-${taskIndex}`}
                              className={cn(
                                "group/todo flex items-center gap-2 px-3 py-2 transition-colors hover:bg-gray-50",
                                isAdded && "bg-indigo-50/30",
                              )}
                            >
                              <div className="ml-2 flex w-2 shrink-0 flex-col items-center self-stretch">
                                <div className="w-px flex-1 bg-gray-200" />
                                {idx === linkedTasks.length - 1 && (
                                  <div className="w-px flex-1 bg-transparent" />
                                )}
                              </div>
                              <div className="-ml-0.5 h-px w-1.5 shrink-0 bg-gray-200" />
                              <div
                                className={cn(
                                  "h-3.5 w-1 shrink-0 rounded-full",
                                  priorityDot[getActionPriority(taskAction)],
                                )}
                              />
                              <div className="min-w-0 flex-1">
                                <p
                                  className={cn(
                                    "truncate text-xs",
                                    isAdded
                                      ? "font-medium text-indigo-800"
                                      : "text-gray-700",
                                  )}
                                >
                                  {getActionTitle(taskAction)}
                                </p>
                                <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-gray-400">
                                  <Clock className="h-2.5 w-2.5" />
                                  {getActionDateLabel(taskAction) || "시간 미정"}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setRemoved((prev) =>
                                    new Set(prev).add(taskIndex),
                                  )
                                }
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-200 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover/todo:opacity-100"
                                aria-label="할 일 후보 삭제"
                                title="할 일 후보 삭제"
                              >
                                <X className="h-3 w-3" />
                              </button>
                              {renderPlusButton(taskIndex)}
                            </div>
                          );
                        },
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(index)}
                      className="flex w-full items-center gap-1.5 px-3 py-2 transition-colors hover:bg-gray-50"
                    >
                      <Link2 className="h-3 w-3 text-gray-300" />
                      <span className="text-[11px] text-gray-400">
                        연결된 할 일 {linkedTasks.length}개
                        {addedTodoCount > 0 && (
                          <span className="ml-1 text-indigo-500">
                            ({addedTodoCount}개 추가됨)
                          </span>
                        )}
                      </span>
                      <ChevronDown className="ml-auto h-3 w-3 text-gray-300" />
                    </button>
                  ))}
              </div>
            );
          })}

          {independentTasks.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-1.5 border-b border-gray-100 bg-white px-3 py-2">
                <CheckSquare className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-700">
                  독립 할 일
                </span>
                <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-0 text-[10px] text-gray-500">
                  {independentTasks.length}
                </span>
              </div>
              {independentTasks.map(({ action, index }) => {
                const isAdded = added.has(actionKey(index));
                return (
                  <div
                    key={`${action.type}-${index}`}
                    className={cn(
                      "group/stodo flex items-center gap-2 border-b border-gray-50 px-3 py-2.5 transition-colors last:border-0 hover:bg-gray-50",
                      isAdded && "bg-indigo-50/30",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        priorityDot[getActionPriority(action)],
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-xs",
                          isAdded
                            ? "font-medium text-indigo-800"
                            : "text-gray-700",
                        )}
                      >
                        {getActionTitle(action)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-gray-400">
                        <Clock className="h-2.5 w-2.5" />
                        {getActionDateLabel(action) || "시간 미정"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRemoved((prev) => new Set(prev).add(index))
                      }
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-200 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover/stodo:opacity-100"
                      aria-label="할 일 후보 삭제"
                      title="할 일 후보 삭제"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {renderPlusButton(index)}
                  </div>
                );
              })}
            </div>
          )}

          {pendingItems.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-amber-100 bg-amber-50/60">
              <div className="border-b border-amber-100 px-3 py-2 text-xs font-semibold text-amber-800">
                확인 필요 항목
              </div>
              {pendingItems.map(({ action, index }) => (
                <div
                  key={`${action.type}-${index}`}
                  className="border-b border-amber-100/70 px-3 py-2 last:border-0"
                >
                  <p className="text-xs font-medium text-amber-900">
                    {getActionTitle(action)}
                  </p>
                  {action.description && (
                    <p className="mt-1 text-[11px] leading-5 text-amber-800">
                      {action.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {appliedLink && (
        <div className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-xs text-indigo-700">
          적용했습니다.{" "}
          <Link to={appliedLink} className="font-semibold underline">
            생성된 항목 보기
          </Link>
        </div>
      )}
      {applyError && (
        <div className="rounded-xl border border-red-100 bg-white px-3 py-2 text-xs text-red-600">
          {applyError}
        </div>
      )}
    </div>
  );
}

function MemoAiPanel({
  memo,
  open,
}: {
  memo: Memo | null;
  open: boolean;
}) {
  const parseMutation = useParseMemo();
  const { data, isLoading, isError, error } = useMemoParseResult(
    memo?.memo_id ?? null,
    Boolean(memo?.memo_id && open),
  );

  const status = data?.memo.parse_status ?? memo?.parse_status;
  const result = data?.latest_result ?? memo?.last_ai_result ?? null;
  const actions = result ? getSuggestedActions(result) : [];
  const scheduleCount = actions.filter(
    (action) => action.type === "create_schedule",
  ).length;
  const taskCount = actions.filter((action) => action.type === "create_task")
    .length;

  const retry = async () => {
    if (!memo) return;
    await parseMutation.mutateAsync({
      memoId: memo.memo_id,
      force: status === "completed" || status === "failed",
    });
  };

  if (!open) return null;

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-l border-gray-100 bg-gray-50/40 transition-all duration-200">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-100 px-3">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700">
          AI 추출 결과
        </span>
        <span className="whitespace-nowrap text-[10px] text-gray-400">
          일정 {scheduleCount} · 할 일 {taskCount}
        </span>
        {memo && (
          <button
            type="button"
            onClick={() => void retry()}
            disabled={parseMutation.isPending || status === "pending" || status === "processing"}
            aria-label="AI 재분석"
            title="AI 재분석"
            className={cn(
              "flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs text-violet-500 transition-colors hover:bg-violet-50 hover:text-violet-600 disabled:opacity-50",
              parseMutation.isPending && "text-violet-500",
            )}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", parseMutation.isPending && "animate-spin")}
            />
            재분석
          </button>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {!memo ? (
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-8 text-center text-xs text-gray-400">
            메모를 선택하세요.
          </div>
        ) : isLoading ? (
          <ProcessingPanel />
        ) : isError ? (
          <FailedPanel
            message={`결과 로드 실패: ${(error as Error).message}`}
            onRetry={retry}
            retrying={parseMutation.isPending}
          />
        ) : status === "processing" ? (
          <ProcessingPanel />
        ) : status === "pending" ? (
          <PendingPanel />
        ) : status === "failed" ? (
          <FailedPanel
            message={memo.parse_error_message}
            onRetry={retry}
            retrying={parseMutation.isPending}
          />
        ) : result ? (
          <AiResultContent memoId={memo.memo_id} result={result} />
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <Sparkles className="h-6 w-6 text-gray-300" />
            <p className="text-center text-xs">
              추출된 일정과 할 일이 없습니다.
              <br />
              재분석을 실행해보세요.
            </p>
            <button
              type="button"
              onClick={() => void retry()}
              className="mt-1 flex items-center gap-1 text-xs text-violet-600 hover:underline"
            >
              <RefreshCw className="h-3 w-3" />
              재분석하기
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

export default function Memos() {
  const { data, isLoading, isError, error, isFetching, refetch } = useMemos();
  const [search, setSearch] = useState("");
  const [selectedMemoId, setSelectedMemoId] = useState<number | null>(null);
  const [transientMemo, setTransientMemo] = useState<Memo | null>(null);
  const [mode, setMode] = useState<MemoWorkspaceMode>("read");
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const deleteMutation = useDeleteMemo();

  const items = useMemo(() => data ?? [], [data]);
  const filteredItems = useMemo(() => {
    const query = normalizeText(search).toLowerCase();
    if (!query) return items;
    return items.filter((memo) => {
      const haystack = [
        getMemoTitle(memo),
        getMemoPreview(memo),
        memo.raw_text,
        MEMO_TYPE_LABELS[memo.memo_type],
        PARSE_STATUS_LABELS[memo.parse_status],
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [items, search]);

  const selectedMemo = useMemo(
    () =>
      items.find((memo) => memo.memo_id === selectedMemoId) ??
      (transientMemo?.memo_id === selectedMemoId ? transientMemo : null),
    [items, selectedMemoId, transientMemo],
  );

  const parseResultQuery = useMemoParseResult(
    selectedMemo?.memo_id ?? null,
    Boolean(selectedMemo?.memo_id && rightOpen),
  );
  const selectedStatus =
    parseResultQuery.data?.memo.parse_status ?? selectedMemo?.parse_status;
  const selectedResult =
    parseResultQuery.data?.latest_result ?? selectedMemo?.last_ai_result ?? null;

  useEffect(() => {
    if (
      transientMemo &&
      items.some((memo) => memo.memo_id === transientMemo.memo_id)
    ) {
      setTransientMemo(null);
    }
  }, [items, transientMemo]);

  useEffect(() => {
    if (mode === "create") return;
    if (items.length === 0) {
      if (!transientMemo) setSelectedMemoId(null);
      return;
    }
    if (
      selectedMemoId &&
      (items.some((memo) => memo.memo_id === selectedMemoId) ||
        transientMemo?.memo_id === selectedMemoId)
    ) {
      return;
    }
    setSelectedMemoId(items[0].memo_id);
  }, [items, mode, selectedMemoId, transientMemo]);

  const handleSelect = (memoId: number) => {
    setSelectedMemoId(memoId);
    setMode("read");
    setConfirmDeleteId(null);
  };

  const handleDeleted = (memoId: number) => {
    const nextMemo = items.find((memo) => memo.memo_id !== memoId);
    if (transientMemo?.memo_id === memoId) setTransientMemo(null);
    setSelectedMemoId(nextMemo?.memo_id ?? null);
    setMode("read");
    setConfirmDeleteId(null);
  };

  const handleConfirmDelete = async (memoId: number) => {
    try {
      await deleteMutation.mutateAsync(memoId);
      handleDeleted(memoId);
    } catch {
      setConfirmDeleteId(null);
    }
  };

  const titleMeta =
    mode === "create"
      ? "새 메모 작성"
      : selectedMemo
        ? `${getMemoTitle(selectedMemo, selectedResult)} · ${formatCompactDateTime(
            selectedMemo.updated_at ?? selectedMemo.created_at,
          )}`
        : `${items.length}개 메모`;

  return (
    <AppShell
      fullBleed
      titleMeta={titleMeta}
      aiChatButtonOffset={rightOpen ? "380px" : "0px"}
      headerActions={
        <button
          type="button"
          onClick={() => setRightOpen((open) => !open)}
          className={appSidebarToggleButtonClass}
          aria-label={rightOpen ? "AI 추출 결과 접기" : "AI 추출 결과 열기"}
          title={rightOpen ? "AI 추출 결과 접기" : "AI 추출 결과 열기"}
        >
          <PanelRight className="h-4 w-4" />
        </button>
      }
    >
      <div
        className="relative flex h-full overflow-hidden bg-white font-sans text-gray-950"
        onClick={() => setConfirmDeleteId(null)}
      >
        <MemoListPanel
          items={filteredItems}
          selectedMemoId={selectedMemoId}
          search={search}
          leftOpen={leftOpen}
          isLoading={isLoading}
          isError={isError}
          error={error}
          isFetching={isFetching}
          confirmDeleteId={confirmDeleteId}
          onToggleLeft={() => setLeftOpen((open) => !open)}
          onSearchChange={setSearch}
          onSelect={handleSelect}
          onCreate={() => {
            setMode("create");
            setConfirmDeleteId(null);
          }}
          onRequestDelete={(memoId) => setConfirmDeleteId(memoId)}
          onConfirmDelete={(memoId) => void handleConfirmDelete(memoId)}
          onCancelDelete={() => setConfirmDeleteId(null)}
          onRetry={() => {
            void refetch();
          }}
        />

        {mode === "create" ? (
          <MemoCreatePanel
            onCreated={(memo) => {
              setTransientMemo(memo);
              setSelectedMemoId(memo.memo_id);
              setMode("read");
            }}
            onCancel={() => setMode("read")}
          />
        ) : selectedMemo ? (
          <MemoReaderPanel
            memo={selectedMemo}
            parseStatus={selectedStatus}
            latestResult={selectedResult}
            onDeleted={handleDeleted}
          />
        ) : (
          <EmptyMemoPanel onCreate={() => setMode("create")} />
        )}

        <MemoAiPanel
          memo={selectedMemo}
          open={rightOpen}
        />
      </div>
    </AppShell>
  );
}
