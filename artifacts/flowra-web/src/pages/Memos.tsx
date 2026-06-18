import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  ArrowUpRight,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  FileText,
  Link2,
  MapPin,
  PanelRight,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Table2,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import {
  MEMOS_QUERY_KEY,
  memoParseResultKey,
  useApplyMemo,
  useCreateMemo,
  useDeleteMemo,
  useMemoParseResult,
  useMemos,
  useParseMemo,
  useUpdateMemo,
} from "@/hooks/useMemos";
import {
  SCHEDULES_QUERY_KEY,
  useDeleteSchedule,
  useSchedules,
} from "@/hooks/useSchedules";
import { TASKS_QUERY_KEY, useDeleteTask, useTasks } from "@/hooks/useTasks";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import { applyMemo as applyMemoRequest } from "@/api/memos";
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
  type Schedule,
  type Task,
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

const MEMO_AI_PANEL_WIDTH = "380px";

const parseStatusBadge: Record<ParseStatus, string> = {
  pending: "bg-slate-100 text-slate-500",
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
  low: "bg-slate-300",
};

type AppliedResourceRef = {
  type: "schedule" | "task";
  id: number;
  actionIndex?: number;
  link: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toPositiveNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toNonNegativeNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function getAppliedResourceRef(
  value: unknown,
  actionIndex?: number,
): AppliedResourceRef | null {
  if (!isRecord(value)) return null;

  const taskId = toPositiveNumber(value.task_id);
  if (taskId) {
    return {
      type: "task",
      id: taskId,
      actionIndex,
      link: getAppliedLink(value),
    };
  }

  const scheduleId = toPositiveNumber(value.schedule_id);
  if (scheduleId) {
    return {
      type: "schedule",
      id: scheduleId,
      actionIndex,
      link: getAppliedLink(value),
    };
  }

  const resourceType =
    typeof value.resource_type === "string"
      ? value.resource_type.toLowerCase()
      : typeof value.type === "string"
        ? value.type.toLowerCase()
        : "";
  const resourceId = toPositiveNumber(value.resource_id ?? value.id);

  if (resourceId && resourceType.includes("schedule")) {
    return {
      type: "schedule",
      id: resourceId,
      actionIndex,
      link: `/schedules?${new URLSearchParams({
        schedule_id: String(resourceId),
      })}`,
    };
  }

  if (resourceId && resourceType.includes("task")) {
    return {
      type: "task",
      id: resourceId,
      actionIndex,
      link: `/tasks?${new URLSearchParams({ task_id: String(resourceId) })}`,
    };
  }

  return null;
}

function uniqueAppliedResourceRefs(refs: AppliedResourceRef[]) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pushAppliedResourceRefs(
  refs: AppliedResourceRef[],
  value: unknown,
  fallbackActionIndex?: number,
) {
  if (!value) return;

  if (Array.isArray(value)) {
    value.forEach((item) =>
      pushAppliedResourceRefs(refs, item, fallbackActionIndex),
    );
    return;
  }

  if (!isRecord(value)) return;

  const actionIndex =
    toNonNegativeNumber(value.action_index) ?? fallbackActionIndex;
  const directRef = getAppliedResourceRef(value, actionIndex);
  if (directRef) refs.push(directRef);

  pushAppliedResourceRefs(refs, value.resource, actionIndex);
  pushAppliedResourceRefs(refs, value.schedule, actionIndex);
  pushAppliedResourceRefs(refs, value.task, actionIndex);
  pushAppliedResourceRefs(refs, value.resources, actionIndex);
}

function collectAppliedResourceRefs(
  response: ApplyMemoResponse,
  fallbackActionIndex?: number,
) {
  const refs: AppliedResourceRef[] = [];
  pushAppliedResourceRefs(refs, response.applied_actions, fallbackActionIndex);
  pushAppliedResourceRefs(refs, response.resource, fallbackActionIndex);
  pushAppliedResourceRefs(refs, response.resources, fallbackActionIndex);
  return uniqueAppliedResourceRefs(refs);
}

function normalizeComparableText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function dateTimeStamp(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function sameDateTime(left?: string | null, right?: string | null) {
  if (!left || !right) return true;
  const leftTime = dateTimeStamp(left);
  const rightTime = dateTimeStamp(right);
  if (leftTime !== null && rightTime !== null) {
    return Math.abs(leftTime - rightTime) < 60_000;
  }
  return normalizeComparableText(left) === normalizeComparableText(right);
}

function hasAiSource(
  resource: Pick<Schedule | Task, "source_memo_id" | "source_ai_result_id">,
  memoId: number,
  aiResultId: number,
) {
  return (
    Number(resource.source_memo_id) === memoId &&
    Number(resource.source_ai_result_id) === aiResultId
  );
}

function actionMatchesSchedule(action: AiSuggestedAction, schedule: Schedule) {
  if (action.type !== "create_schedule") return false;
  if (
    normalizeComparableText(getActionTitle(action)) !==
    normalizeComparableText(schedule.title)
  ) {
    return false;
  }

  if (action.recurrence) return true;
  return sameDateTime(action.start_datetime, schedule.start_datetime);
}

function actionMatchesTask(action: AiSuggestedAction, task: Task) {
  if (action.type !== "create_task") return false;
  if (
    normalizeComparableText(getActionTitle(action)) !==
    normalizeComparableText(task.title)
  ) {
    return false;
  }

  return sameDateTime(action.due_datetime, task.due_datetime);
}

function addResourceRef(
  map: Map<number, AppliedResourceRef[]>,
  actionIndex: number,
  ref: AppliedResourceRef,
) {
  map.set(
    actionIndex,
    uniqueAppliedResourceRefs([...(map.get(actionIndex) ?? []), ref]),
  );
}

function localAppliedResourceMapFromRecord(
  resources: Record<number, AppliedResourceRef[]>,
) {
  const map = new Map<number, AppliedResourceRef[]>();
  Object.entries(resources).forEach(([key, refs]) => {
    const actionIndex = Number(key);
    if (Number.isFinite(actionIndex)) map.set(actionIndex, refs);
  });
  return map;
}

function getApplyResponseLink(applied: ApplyMemoResponse) {
  const resource = applied.resource ?? applied.resources?.[0] ?? null;
  if (!resource || typeof resource !== "object") return null;

  if ("task_id" in resource && typeof resource.task_id === "number") {
    return getAppliedLink(resource);
  }

  if ("schedule_id" in resource && typeof resource.schedule_id === "number") {
    return getAppliedLink(resource);
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

  if (value.task_id) {
    return `/tasks?${new URLSearchParams({ task_id: String(value.task_id) })}`;
  }

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
        "relative z-10 flex shrink-0 flex-col overflow-visible border-r border-slate-100 bg-white transition-[width,border-color] duration-200",
        leftOpen ? "w-[208px]" : "w-0 border-transparent",
      )}
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleLeft();
        }}
        className={cn(
          "absolute top-1/2 z-30 flex -translate-y-1/2 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-200",
          leftOpen
            ? "-right-1.5 h-6 w-3 rounded-full bg-slate-200 text-slate-400 hover:bg-slate-300 hover:text-slate-600"
            : "left-0 h-11 w-5 rounded-r-lg bg-violet-600 text-white shadow-lg shadow-violet-500/25 hover:bg-violet-700",
        )}
        aria-label={leftOpen ? "메모 목록 접기" : "메모 목록 열기"}
        title={leftOpen ? "메모 목록 접기" : "메모 목록 열기"}
      >
        {leftOpen ? (
          <ChevronLeft className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {leftOpen && (
        <>
          <div className="flex h-12 items-center gap-2 border-b border-slate-100 px-3">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">
              메모
            </span>
            <button
              type="button"
              onClick={onCreate}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
              aria-label="새 메모"
              title="새 메모"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="px-3 py-2.5">
            <label className="flex h-[30px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5">
              <Search className="h-3 w-3 shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="검색..."
                aria-label="메모 검색"
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

          <div className="scrollbar-none relative flex-1 overflow-y-auto px-2 pb-2">
            {isLoading ? (
              <div className="px-2 py-8">
                <FullSpinner message="메모를 불러오는 중..." />
              </div>
            ) : isError ? (
              <div className="px-1 py-4">
                <ErrorState
                  title="메모를 불러오지 못했습니다"
                  message={(error as Error).message}
                  onRetry={onRetry}
                  retrying={isFetching}
                />
              </div>
            ) : items.length === 0 ? (
              <div className="px-2 py-8 text-center">
                <p className="text-sm font-semibold text-slate-500">
                  표시할 메모가 없습니다
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  새 메모를 만들거나 검색어를 바꿔보세요.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {items.map((memo) => {
                  const selected = memo.memo_id === selectedMemoId;
                  const confirmingThis = confirmDeleteId === memo.memo_id;

                  return (
                    <div key={memo.memo_id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onSelect(memo.memo_id)}
                        title={getMemoTitle(memo)}
                        className={cn(
                          "block w-full rounded-md px-2.5 py-2 pr-7 text-left transition-colors",
                          selected
                            ? "bg-violet-50 text-violet-700"
                            : "text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        <span
                          className={cn(
                            "block min-w-0 truncate text-xs font-semibold",
                            selected ? "text-violet-700" : "text-slate-700",
                          )}
                        >
                          {getMemoTitle(memo)}
                        </span>
                        <span className="mt-1 block truncate text-[11px] font-medium text-slate-400">
                          {formatCompactDateTime(
                            memo.updated_at ?? memo.created_at,
                          )}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRequestDelete(memo.memo_id);
                        }}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded text-slate-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                        aria-label="메모 삭제"
                        title="메모 삭제"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>

                      {confirmingThis && (
                        <div
                          className="absolute left-0 right-0 z-50 mx-1 rounded-lg border border-red-200 bg-white px-3 py-2.5 shadow-lg"
                          style={{ top: "calc(100% + 2px)" }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <p className="mb-2 flex items-center gap-1 text-[11px] font-medium text-slate-700">
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
                              className="flex-1 rounded-md bg-slate-100 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-200"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
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
    watch,
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

  const rawText = watch("raw_text") ?? "";
  const autoParse = watch("auto_parse") ?? false;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#f7f8fa]"
    >
      <div className="mx-auto flex h-[68px] w-full max-w-[920px] shrink-0 items-center justify-between px-4 pt-1 sm:px-0">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
          <span className="text-[13px] font-semibold text-violet-600">
            새 메모
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-lg px-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white shadow-sm shadow-slate-900/10 transition-colors hover:bg-slate-800 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            {createMutation.isPending ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      <div className="scrollbar-none flex-1 overflow-y-auto px-4 pb-8 sm:px-6">
        <div
          className={cn(
            "mx-auto flex min-h-[410px] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_14px_36px_rgba(15,23,42,0.04)] sm:min-h-[442px]",
            errors.raw_text ? "border-red-200" : "border-slate-200",
          )}
        >
          <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5 sm:px-5">
            <label className="relative inline-flex">
              <select
                {...register("memo_type")}
                aria-label="메모 유형"
                className="h-7 min-w-[78px] appearance-none rounded-lg border border-violet-200 bg-violet-50/70 pl-3 pr-7 text-[11px] font-semibold text-violet-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              >
                {MEMO_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {MEMO_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-violet-500"
                aria-hidden
              />
            </label>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <CategorySelect
                  type="memo"
                  value={field.value as number | "" | undefined}
                  onChange={field.onChange}
                  className="h-7 min-w-[108px] max-w-[150px] rounded-lg border-slate-200 px-2.5 py-1 text-[11px] shadow-none"
                />
              )}
            />
            <label className="ml-auto inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-100">
              <input
                type="checkbox"
                {...register("auto_parse")}
                className="sr-only"
              />
              <span
                className={cn(
                  "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                  autoParse
                    ? "border-blue-500 bg-blue-500"
                    : "border-blue-200 bg-white",
                )}
                aria-hidden
              >
                {autoParse && <Check className="h-2.5 w-2.5 text-white" />}
              </span>
              저장 후 AI 분석
            </label>
          </div>

          <textarea
            rows={16}
            placeholder="메모를 입력하세요..."
            {...register("raw_text")}
            aria-invalid={!!errors.raw_text}
            className="scrollbar-none min-h-[310px] flex-1 resize-none border-0 bg-white px-5 py-5 text-[15px] leading-[1.85] text-slate-700 outline-none placeholder:text-slate-300 focus:ring-0"
          />

          <div className="flex h-9 shrink-0 items-center gap-1 border-t border-slate-100 px-4 text-slate-300 sm:px-5">
            <button
              type="button"
              disabled
              aria-label="표 삽입"
              title="표 삽입"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 disabled:cursor-not-allowed disabled:opacity-80"
            >
              <Table2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled
              aria-label="파일 첨부"
              title="파일 첨부"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-300 disabled:cursor-not-allowed disabled:opacity-80"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <span className="ml-auto text-[11px] font-medium text-slate-300">
              {rawText.length}자
            </span>
          </div>
        </div>
        {errors.raw_text && (
          <p className="mx-auto mt-2 w-full max-w-[920px] text-xs text-red-600">
            {errors.raw_text.message}
          </p>
        )}
        <p className="mx-auto mt-2 w-full max-w-[920px] text-[11px] font-medium text-slate-400">
          ✦ 저장 후 AI가 메모를 분석하고 태그를 추천합니다
        </p>
      </div>
    </form>
  );
}

function MemoReaderPanel({
  memo,
  parseStatus,
  latestResult,
  onDeleted,
  onParseStart,
}: {
  memo: Memo;
  parseStatus?: ParseStatus;
  latestResult?: AiParseResult | null;
  onDeleted: (memoId: number) => void;
  onParseStart: () => void;
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
    onParseStart();
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
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-100 px-6">
        <div className="flex min-w-0 items-center gap-2">
          <ParseStatusPill status={status} />
          <span className="truncate text-xs text-slate-400">
            {formatCompactDateTime(memo.updated_at ?? memo.created_at)}
          </span>
          {category && (
            <>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span className="truncate text-xs text-slate-400">
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
              className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
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
                className="h-7 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
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
                className="h-7 rounded-lg px-2.5 text-xs text-slate-500 transition-colors hover:bg-slate-100"
              >
                취소
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs text-slate-500 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
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
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-10 py-8"
      >
        <h1
          className={`mb-6 text-2xl font-bold leading-snug text-slate-900 ${
            isEditing ? "" : "border-b border-slate-200 pb-4"
          }`}
        >
          {getMemoTitle(memo, latestResult)}
        </h1>

        {isEditing ? (
          <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
              <label className="relative inline-flex">
                <select
                  value={memoType}
                  onChange={(event) =>
                    setMemoType(event.target.value as MemoType)
                  }
                  className="h-7 min-w-[78px] appearance-none rounded-lg border border-violet-200 bg-violet-50/70 pl-3 pr-7 text-[11px] font-semibold text-violet-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                >
                  {MEMO_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {MEMO_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-violet-500"
                  aria-hidden
                />
              </label>
              <CategorySelect
                type="memo"
                value={categoryId}
                onChange={setCategoryId}
                className="h-7 min-w-[108px] max-w-[150px] rounded-lg border-slate-200 px-2.5 py-1 text-[11px] shadow-none"
              />
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="scrollbar-none min-h-[320px] flex-1 resize-none border-0 bg-white px-5 py-5 text-[15px] leading-[1.85] text-slate-700 outline-none placeholder:text-slate-300 focus:ring-0"
              placeholder="메모를 입력하세요..."
            />
          </div>
        ) : (
          <div
            className="max-w-none cursor-text whitespace-pre-wrap text-[15px] leading-[1.85] text-slate-700"
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
          <p className="text-sm font-semibold text-slate-900">
            아직 메모가 없습니다
          </p>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            새 메모를 남기면 AI가 일정과 할 일을 추출합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="flex h-8 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white transition-colors hover:bg-slate-700"
        >
          <Plus className="h-3.5 w-3.5" />새 메모
        </button>
      </div>
    </section>
  );
}

function PendingPanel() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">
      AI 분석 대기열에 들어갔습니다.
    </div>
  );
}

function ProcessingPanel() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16">
      <RefreshCw className="h-5 w-5 animate-spin text-violet-500" />
      <span className="text-xs font-medium text-violet-600">AI 분석 중...</span>
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
  const schedulesQuery = useSchedules();
  const tasksQuery = useTasks();
  const queryClient = useQueryClient();
  const [applyState, setApplyState] = useState<Pick<
    ApplyMemoResponse,
    | "result_status"
    | "executable_action_indexes"
    | "applied_action_indexes"
    | "remaining_action_indexes"
    | "skipped_action_indexes"
    | "action_states"
  > | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [localAppliedResources, setLocalAppliedResources] = useState<
    Record<number, AppliedResourceRef[]>
  >({});
  const [removingActionIndex, setRemovingActionIndex] = useState<number | null>(
    null,
  );
  const [appliedLink, setAppliedLink] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [bulkApplyingIndexes, setBulkApplyingIndexes] = useState<Set<number>>(
    new Set(),
  );
  const [bulkRemovingIndexes, setBulkRemovingIndexes] = useState<Set<number>>(
    new Set(),
  );

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
          !taskAction.linked_existing_schedule_id &&
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
  const effectiveActionStates =
    applyState?.action_states ?? result.action_states;
  const actionStateByIndex = useMemo(
    () =>
      new Map(
        (effectiveActionStates ?? []).map((state) => [
          state.action_index,
          state,
        ]),
      ),
    [effectiveActionStates],
  );
  const appliedActionIndexes =
    applyState?.applied_action_indexes ?? result.applied_action_indexes;
  const remainingActionIndexes =
    applyState?.remaining_action_indexes ?? result.remaining_action_indexes;
  const hasRemainingActionIndexes = Array.isArray(remainingActionIndexes);
  const applied = useMemo(
    () =>
      new Set(
        appliedActionIndexes ??
          (effectiveActionStates ?? [])
            .filter((state) => state.applied)
            .map((state) => state.action_index),
      ),
    [appliedActionIndexes, effectiveActionStates],
  );
  const remaining = useMemo(
    () => new Set(remainingActionIndexes ?? []),
    [remainingActionIndexes],
  );
  const appliedCount = visibleEntries.filter(({ index }) =>
    applied.has(index),
  ).length;
  const actionableCount = visibleEntries.filter(
    ({ action }) =>
      action.type === "create_schedule" || action.type === "create_task",
  ).length;
  const resultAppliedResourceMap = useMemo(() => {
    const refs: AppliedResourceRef[] = [];
    const map = new Map<number, AppliedResourceRef[]>();

    pushAppliedResourceRefs(refs, result.applied_actions);
    refs.forEach((ref) => {
      if (ref.actionIndex === undefined) return;
      addResourceRef(map, ref.actionIndex, ref);
    });

    return map;
  }, [result.applied_actions]);
  const sourceMatchedResourceMap = useMemo(() => {
    const map = new Map<number, AppliedResourceRef[]>();
    const schedules = schedulesQuery.data ?? [];
    const tasks = tasksQuery.data ?? [];

    rawActions.forEach((action, index) => {
      if (action.type === "create_schedule") {
        schedules
          .filter((schedule) =>
            hasAiSource(schedule, memoId, result.ai_result_id),
          )
          .filter((schedule) => actionMatchesSchedule(action, schedule))
          .forEach((schedule) =>
            addResourceRef(map, index, {
              type: "schedule",
              id: schedule.schedule_id,
              actionIndex: index,
              link: getAppliedLink(schedule),
            }),
          );
      }

      if (action.type === "create_task") {
        tasks
          .filter((task) => hasAiSource(task, memoId, result.ai_result_id))
          .filter((task) => actionMatchesTask(action, task))
          .forEach((task) =>
            addResourceRef(map, index, {
              type: "task",
              id: task.task_id,
              actionIndex: index,
              link: getAppliedLink(task),
            }),
          );
      }
    });

    return map;
  }, [
    memoId,
    rawActions,
    result.ai_result_id,
    schedulesQuery.data,
    tasksQuery.data,
  ]);
  const appliedResourceMap = useMemo(() => {
    const map = new Map<number, AppliedResourceRef[]>();
    const localMap = localAppliedResourceMapFromRecord(localAppliedResources);

    resultAppliedResourceMap.forEach((refs, index) => {
      refs.forEach((ref) => addResourceRef(map, index, ref));
    });
    sourceMatchedResourceMap.forEach((refs, index) => {
      refs.forEach((ref) => addResourceRef(map, index, ref));
    });
    localMap.forEach((refs, index) => {
      refs.forEach((ref) => addResourceRef(map, index, ref));
    });

    return map;
  }, [
    localAppliedResources,
    resultAppliedResourceMap,
    sourceMatchedResourceMap,
  ]);

  useEffect(() => {
    setExpanded(new Set(scheduleEntries.map(({ index }) => String(index))));
    setRemoved(new Set());
    setApplyState(null);
    setLocalAppliedResources({});
    setRemovingActionIndex(null);
    setAppliedLink(null);
    setApplyError(null);
    setBulkApplyingIndexes(new Set());
    setBulkRemovingIndexes(new Set());
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

  const syncApplyState = (
    response: ApplyMemoResponse,
    fallbackActionIndex?: number,
  ) => {
    setApplyState((current) => {
      const baseActionStates =
        current?.action_states ?? result.action_states ?? [];
      const responseAppliedIndexes =
        response.applied_action_indexes ??
        response.action_states
          ?.filter((state) => state.applied)
          .map((state) => state.action_index) ??
        (fallbackActionIndex === undefined ? [] : [fallbackActionIndex]);
      const appliedIndexes = new Set([
        ...(current?.applied_action_indexes ??
          result.applied_action_indexes ??
          []),
        ...responseAppliedIndexes,
      ]);
      const stateMap = new Map(
        baseActionStates.map((state) => [state.action_index, state]),
      );

      response.action_states?.forEach((state) => {
        const previous = stateMap.get(state.action_index);
        stateMap.set(state.action_index, {
          ...previous,
          ...state,
          applied: previous?.applied === true || state.applied === true,
        });
      });
      appliedIndexes.forEach((index) => {
        const previous = stateMap.get(index);
        stateMap.set(index, {
          action_index: index,
          action_type: rawActions[index]?.type,
          applicable: previous?.applicable ?? true,
          ...previous,
          applied: true,
        });
      });

      const executableIndexes =
        response.executable_action_indexes ??
        current?.executable_action_indexes ??
        result.executable_action_indexes ??
        rawActions
          .map((action, index) =>
            action.type === "create_schedule" || action.type === "create_task"
              ? index
              : null,
          )
          .filter((index): index is number => index !== null);
      const remainingIndexes = executableIndexes.filter(
        (index) =>
          !appliedIndexes.has(index) &&
          stateMap.get(index)?.applicable !== false,
      );
      const resultStatus =
        appliedIndexes.size === 0
          ? "suggested"
          : remainingIndexes.length > 0
            ? "partially_applied"
            : "approved";

      return {
        result_status: response.result_status ?? resultStatus,
        executable_action_indexes: executableIndexes,
        applied_action_indexes: [...appliedIndexes],
        remaining_action_indexes: remainingIndexes,
        skipped_action_indexes: [
          ...new Set([
            ...(current?.skipped_action_indexes ?? []),
            ...(response.skipped_action_indexes ?? []),
          ]),
        ],
        action_states: [...stateMap.values()],
      };
    });

    const resourceRefs = collectAppliedResourceRefs(
      response,
      fallbackActionIndex,
    );
    if (resourceRefs.length > 0) {
      setLocalAppliedResources((current) => {
        const next = { ...current };
        resourceRefs.forEach((ref) => {
          const actionIndex = ref.actionIndex ?? fallbackActionIndex;
          if (actionIndex === undefined) return;
          next[actionIndex] = uniqueAppliedResourceRefs([
            ...(next[actionIndex] ?? []),
            { ...ref, actionIndex },
          ]);
        });
        return next;
      });
    }

    const link = getApplyResponseLink(response);
    if (link) setAppliedLink(link);

    return resourceRefs;
  };

  const isSupportedAction = (index: number) => {
    const action = rawActions[index];
    return action?.type === "create_schedule" || action?.type === "create_task";
  };

  const isActionApplied = (index: number) =>
    applied.has(index) || actionStateByIndex.get(index)?.applied === true;

  const canApplyAction = (index: number) => {
    if (!isSupportedAction(index) || isActionApplied(index)) return false;
    const state = actionStateByIndex.get(index);
    if (state?.applicable === false) return false;
    if (hasRemainingActionIndexes) return remaining.has(index);
    return true;
  };

  const getRelatedScheduleIndexForTaskAction = (taskActionIndex: number) => {
    const action = rawActions[taskActionIndex];
    if (action?.type !== "create_task") return null;
    if (action.linked_existing_schedule_id) return null;

    const relatedActionIndex = toNonNegativeNumber(action.related_action_index);
    if (
      relatedActionIndex !== null &&
      rawActions[relatedActionIndex]?.type === "create_schedule"
    ) {
      return relatedActionIndex;
    }

    const relatedScheduleTitle = normalizeComparableText(
      action.related_schedule_title,
    );
    if (!relatedScheduleTitle) return null;

    const matchingIndex = rawActions.findIndex(
      (candidate) =>
        candidate.type === "create_schedule" &&
        normalizeComparableText(getActionTitle(candidate)) ===
          relatedScheduleTitle,
    );

    return matchingIndex >= 0 ? matchingIndex : null;
  };

  const getAppliedScheduleIdForAction = (
    scheduleActionIndex: number,
    extraResourceMap?: Map<number, AppliedResourceRef[]>,
  ) => {
    const refs = [
      ...(extraResourceMap?.get(scheduleActionIndex) ?? []),
      ...(appliedResourceMap.get(scheduleActionIndex) ?? []),
    ];

    return refs.find((ref) => ref.type === "schedule")?.id ?? null;
  };

  const getScheduleIdForTaskAction = (
    taskActionIndex: number,
    extraResourceMap?: Map<number, AppliedResourceRef[]>,
  ) => {
    const relatedScheduleIndex =
      getRelatedScheduleIndexForTaskAction(taskActionIndex);
    if (relatedScheduleIndex === null) return null;

    return getAppliedScheduleIdForAction(
      relatedScheduleIndex,
      extraResourceMap,
    );
  };

  const getApplyPayloadForAction = (
    index: number,
    extraResourceMap?: Map<number, AppliedResourceRef[]>,
  ) => {
    const scheduleId = getScheduleIdForTaskAction(index, extraResourceMap);

    return {
      apply_type: "action" as const,
      action_index: index,
      ...(scheduleId ? { schedule_id: scheduleId } : {}),
    };
  };

  const addTransientResourceRefs = (
    map: Map<number, AppliedResourceRef[]>,
    refs: AppliedResourceRef[],
    fallbackActionIndex: number,
  ) => {
    refs.forEach((ref) => {
      const actionIndex = ref.actionIndex ?? fallbackActionIndex;
      addResourceRef(map, actionIndex, { ...ref, actionIndex });
    });
  };

  const handleApplyAction = async (index: number) => {
    if (!canApplyAction(index)) return;
    setApplyError(null);
    try {
      const response = await applyMutation.mutateAsync({
        memoId,
        payload: getApplyPayloadForAction(index),
      });
      syncApplyState(response, index);
    } catch (err) {
      setApplyError(getErrorMessage(err, "AI 제안 적용에 실패했습니다."));
    }
  };

  const handleApplyBundle = async (indexes: number[]) => {
    const applicableIndexes = [...new Set(indexes.filter(canApplyAction))];
    if (applicableIndexes.length === 0) return;

    setApplyError(null);
    setBulkApplyingIndexes(new Set(applicableIndexes));
    const transientResourceMap = new Map<number, AppliedResourceRef[]>();
    try {
      const remainingApplicableIndexes = rawActions
        .map((_action, index) => index)
        .filter(canApplyAction);
      const selectedIndexSet = new Set(applicableIndexes);
      const appliesEveryRemainingAction =
        applicableIndexes.length === remainingApplicableIndexes.length &&
        remainingApplicableIndexes.every((index) =>
          selectedIndexSet.has(index),
        );

      if (appliesEveryRemainingAction) {
        const res = await applyMemoRequest(memoId, { apply_type: "all" });
        if (!res.success) {
          throw new Error(res.message || "AI 결과 적용에 실패했습니다.");
        }
        syncApplyState(res.data);
      } else {
        const scheduleIndexes = applicableIndexes.filter(
          (index) => rawActions[index]?.type === "create_schedule",
        );
        const taskIndexes = applicableIndexes.filter(
          (index) => rawActions[index]?.type === "create_task",
        );

        for (const index of scheduleIndexes) {
          const res = await applyMemoRequest(
            memoId,
            getApplyPayloadForAction(index, transientResourceMap),
          );
          if (!res.success) {
            throw new Error(res.message || "일정 추가에 실패했습니다.");
          }
          const response = res.data;
          const resourceRefs = syncApplyState(response, index);
          addTransientResourceRefs(transientResourceMap, resourceRefs, index);
        }

        await Promise.all(
          taskIndexes.map(async (index) => {
            const res = await applyMemoRequest(
              memoId,
              getApplyPayloadForAction(index, transientResourceMap),
            );
            if (!res.success) {
              throw new Error(res.message || "할 일 추가에 실패했습니다.");
            }
            const response = res.data;
            const resourceRefs = syncApplyState(response, index);
            addTransientResourceRefs(transientResourceMap, resourceRefs, index);
          }),
        );
      }

      void queryClient.invalidateQueries({ queryKey: MEMOS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
    } catch (err) {
      setApplyError(getErrorMessage(err, "AI 결과 적용에 실패했습니다."));
    } finally {
      setBulkApplyingIndexes(new Set());
    }
  };

  const markActionsUnapplied = (indexes: number[]) => {
    const removedIndexes = new Set(indexes);
    setApplyState((current) => {
      const base = {
        result_status: result.result_status,
        executable_action_indexes: result.executable_action_indexes,
        applied_action_indexes: result.applied_action_indexes,
        remaining_action_indexes: result.remaining_action_indexes,
        skipped_action_indexes: undefined,
        action_states: result.action_states,
        ...current,
      };
      const supportedIndexes = rawActions
        .map((action, actionIndex) =>
          action.type === "create_schedule" || action.type === "create_task"
            ? actionIndex
            : null,
        )
        .filter((actionIndex): actionIndex is number => actionIndex !== null);
      const previousApplied = base.applied_action_indexes ?? [...applied];
      const nextApplied = previousApplied.filter(
        (actionIndex) => !removedIndexes.has(actionIndex),
      );
      const nextRemaining = base.remaining_action_indexes
        ? [
            ...new Set([...base.remaining_action_indexes, ...removedIndexes]),
          ].filter((actionIndex) => supportedIndexes.includes(actionIndex))
        : base.remaining_action_indexes;
      const previousStates =
        base.action_states ??
        rawActions.map((action, actionIndex) => ({
          action_index: actionIndex,
          action_type: action.type,
          applicable:
            action.type === "create_schedule" || action.type === "create_task",
          applied: previousApplied.includes(actionIndex),
        }));
      const nextStates = previousStates.map((state) =>
        removedIndexes.has(state.action_index)
          ? { ...state, applicable: state.applicable ?? true, applied: false }
          : state,
      );
      const resultStatus =
        nextApplied.length === 0
          ? "suggested"
          : nextApplied.length < supportedIndexes.length
            ? "partially_applied"
            : base.result_status;

      return {
        ...base,
        result_status: resultStatus,
        applied_action_indexes: nextApplied,
        remaining_action_indexes: nextRemaining,
        action_states: nextStates,
      };
    });
  };

  const getAppliedResourceRefsForAction = (index: number) => {
    const action = rawActions[index];
    const expectedType =
      action?.type === "create_schedule"
        ? "schedule"
        : action?.type === "create_task"
          ? "task"
          : null;

    if (!expectedType) return [];
    return uniqueAppliedResourceRefs(
      (appliedResourceMap.get(index) ?? []).filter(
        (ref) => ref.type === expectedType,
      ),
    );
  };

  const handleRemoveAppliedActions = async (indexes: number[]) => {
    const targetIndexes = [...new Set(indexes)].filter(isActionApplied);
    if (targetIndexes.length === 0) return;

    const resourcesByIndex = new Map(
      targetIndexes.map((index) => [
        index,
        getAppliedResourceRefsForAction(index),
      ]),
    );
    const missingResourceIndexes = targetIndexes.filter(
      (index) => (resourcesByIndex.get(index) ?? []).length === 0,
    );

    if (missingResourceIndexes.length > 0) {
      setApplyError(
        "생성된 항목을 찾지 못했습니다. 일정/할 일 화면에서 삭제해 주세요.",
      );
      return;
    }

    const uniqueRefs = uniqueAppliedResourceRefs(
      targetIndexes.flatMap((index) => resourcesByIndex.get(index) ?? []),
    );
    const confirmed = window.confirm(
      targetIndexes.length > 1 || uniqueRefs.length > 1
        ? `추가된 항목 ${uniqueRefs.length}개를 전체 삭제할까요?`
        : uniqueRefs[0].type === "schedule"
          ? "추가된 일정을 삭제할까요?"
          : "추가된 할 일을 삭제할까요?",
    );
    if (!confirmed) return;

    setApplyError(null);
    if (targetIndexes.length > 1) {
      setBulkRemovingIndexes(new Set(targetIndexes));
    } else {
      setRemovingActionIndex(targetIndexes[0]);
    }
    try {
      const orderedIndexes = [...targetIndexes].sort((left, right) => {
        const leftIsTask = rawActions[left]?.type === "create_task";
        const rightIsTask = rawActions[right]?.type === "create_task";
        return Number(rightIsTask) - Number(leftIsTask);
      });
      const deletedResourceKeys = new Set<string>();

      for (const index of orderedIndexes) {
        for (const ref of resourcesByIndex.get(index) ?? []) {
          const resourceKey = `${ref.type}:${ref.id}`;
          if (deletedResourceKeys.has(resourceKey)) continue;

          if (ref.type === "schedule") {
            await deleteScheduleMutation.mutateAsync(ref.id);
          } else {
            await deleteTaskMutation.mutateAsync(ref.id);
          }
          deletedResourceKeys.add(resourceKey);
        }
      }

      setLocalAppliedResources((current) => {
        const next = { ...current };
        targetIndexes.forEach((index) => delete next[index]);
        return next;
      });
      markActionsUnapplied(targetIndexes);
      setAppliedLink(null);
      void queryClient.invalidateQueries({ queryKey: MEMOS_QUERY_KEY });
      void queryClient.invalidateQueries({
        queryKey: memoParseResultKey(memoId),
      });
      void queryClient.invalidateQueries({ queryKey: TASKS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
    } catch (err) {
      setApplyError(getErrorMessage(err, "추가된 항목 삭제에 실패했습니다."));
    } finally {
      setRemovingActionIndex(null);
      setBulkRemovingIndexes(new Set());
    }
  };

  const renderMeta = (action: AiSuggestedAction) => {
    const meta = getActionMeta(action);
    const reviewMeta = getActionReviewMeta(action);

    return (
      <>
        {meta.length > 0 && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
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
    const isAdded = isActionApplied(index);
    const canApply = canApplyAction(index);
    const resourceRefs = appliedResourceMap.get(index) ?? [];
    const addedLink = resourceRefs.find((ref) => ref.link)?.link ?? null;
    const removing =
      removingActionIndex === index || bulkRemovingIndexes.has(index);
    const anyActionPending =
      applyMutation.isPending ||
      bulkApplyingIndexes.size > 0 ||
      removingActionIndex !== null ||
      bulkRemovingIndexes.size > 0 ||
      deleteScheduleMutation.isPending ||
      deleteTaskMutation.isPending;

    if (isAdded) {
      const addedButtonClass = cn(
        "flex shrink-0 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 transition-colors hover:bg-indigo-200 disabled:opacity-50",
        addedLabel ? "h-6 gap-1 px-2 text-[11px] font-medium" : "h-6 w-6",
      );
      const moveClass = cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors",
        addedLink
          ? "text-indigo-400 hover:bg-indigo-50 hover:text-indigo-600"
          : "cursor-not-allowed text-slate-200",
      );

      return (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void handleRemoveAppliedActions([index])}
            disabled={anyActionPending}
            aria-label="추가됨, 다시 누르면 삭제 확인"
            title={
              resourceRefs.length > 0
                ? "추가됨 - 다시 누르면 삭제 확인"
                : "추가됨"
            }
            className={addedButtonClass}
          >
            {removing ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
            {addedLabel && (removing ? "삭제 중" : "추가됨")}
          </button>
          {addedLink ? (
            <Link
              to={addedLink}
              className={moveClass}
              aria-label="생성된 항목으로 이동"
              title="생성된 항목으로 이동"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          ) : (
            <span
              className={moveClass}
              aria-label="생성된 항목 경로 없음"
              title="생성된 항목 경로 없음"
            >
              <ArrowUpRight className="h-3 w-3" />
            </span>
          )}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => void handleApplyAction(index)}
        disabled={anyActionPending || !canApply}
        aria-label="추가"
        title="추가"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md transition-colors",
          addedLabel ? "h-6 gap-1 px-2 text-[11px] font-medium" : "h-6 w-6",
          "border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600",
          !canApply && "cursor-not-allowed opacity-40",
        )}
      >
        <Plus className="h-3 w-3" />
        {addedLabel && "일정 추가"}
      </button>
    );
  };

  const independentTaskIndexes = independentTasks.map(({ index }) => index);
  const independentTasksAllApplied =
    independentTaskIndexes.length > 0 &&
    independentTaskIndexes.every(isActionApplied);
  const independentTasksCanApply = independentTaskIndexes.some(canApplyAction);
  const independentTasksApplying = independentTaskIndexes.some((index) =>
    bulkApplyingIndexes.has(index),
  );
  const independentTasksRemoving = independentTaskIndexes.some((index) =>
    bulkRemovingIndexes.has(index),
  );
  const anyBulkActionPending =
    applyMutation.isPending ||
    bulkApplyingIndexes.size > 0 ||
    removingActionIndex !== null ||
    bulkRemovingIndexes.size > 0 ||
    deleteScheduleMutation.isPending ||
    deleteTaskMutation.isPending;

  return (
    <div className="space-y-2">
      {visibleEntries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
          <Sparkles className="h-6 w-6 text-slate-300" />
          <p className="text-center text-xs">추출된 일정과 할 일이 없습니다.</p>
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
              {appliedCount > 0 &&
                ` · 추가됨 ${appliedCount}/${actionableCount}`}
            </span>
          </div>

          {scheduleEntries.map(({ action, index }, schedulePosition) => {
            const linkedTasks =
              linkedTasksBySchedule[schedulePosition]?.tasks ?? [];
            const isExpanded = expanded.has(String(index));
            const scheduleAdded = isActionApplied(index);
            const addedTodoCount = linkedTasks.filter(({ index: taskIndex }) =>
              isActionApplied(taskIndex),
            ).length;
            const allDone =
              scheduleAdded && addedTodoCount === linkedTasks.length;
            const bundleIndexes = [
              index,
              ...linkedTasks.map(({ index: taskIndex }) => taskIndex),
            ];
            const bundleCanApply = bundleIndexes.some(canApplyAction);
            const bundleApplying = bundleIndexes.some((bundleIndex) =>
              bulkApplyingIndexes.has(bundleIndex),
            );
            const bundleRemoving = bundleIndexes.some((bundleIndex) =>
              bulkRemovingIndexes.has(bundleIndex),
            );

            return (
              <div
                key={`${action.type}-${index}`}
                className="group/card overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <div
                  className={cn(
                    "border-b border-slate-100 px-3 py-2.5",
                    scheduleAdded ? "bg-indigo-50/60" : "bg-white",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <Calendar
                      className={cn(
                        "mt-0.5 h-3.5 w-3.5 shrink-0",
                        scheduleAdded ? "text-indigo-500" : "text-slate-400",
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
                        <p className="truncate text-xs font-semibold leading-tight text-slate-900">
                          {getActionTitle(action)}
                        </p>
                      </div>
                      {renderMeta(action)}
                    </div>
                    {!scheduleAdded && (
                      <button
                        type="button"
                        onClick={() =>
                          setRemoved((prev) => new Set(prev).add(index))
                        }
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent bg-white text-slate-400 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-500"
                        aria-label="일정 후보 삭제"
                        title="일정 후보 삭제"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-1.5">
                    {linkedTasks.length > 0 && (bundleCanApply || allDone) && (
                      <button
                        type="button"
                        onClick={() =>
                          void (allDone
                            ? handleRemoveAppliedActions(bundleIndexes)
                            : handleApplyBundle(bundleIndexes))
                        }
                        disabled={anyBulkActionPending}
                        className={cn(
                          "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-50",
                          allDone
                            ? "text-red-500 hover:bg-red-50 hover:text-red-600"
                            : "text-slate-400 hover:bg-indigo-50 hover:text-indigo-600",
                        )}
                      >
                        {bundleApplying || bundleRemoving ? (
                          <>
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            {bundleRemoving ? "삭제 중" : "추가 중"}
                          </>
                        ) : allDone ? (
                          <>
                            <Trash2 className="h-3 w-3" />
                            전체 삭제
                          </>
                        ) : (
                          "전체 추가"
                        )}
                      </button>
                    )}
                    {renderPlusButton(index, true)}
                    {linkedTasks.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(index)}
                        className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        aria-label={
                          isExpanded ? "연결 할 일 접기" : "연결 할 일 펼치기"
                        }
                        title={
                          isExpanded ? "연결 할 일 접기" : "연결 할 일 펼치기"
                        }
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
                    <div className="divide-y divide-slate-50">
                      <div className="flex items-center gap-1 px-3 py-1.5">
                        <Link2 className="h-3 w-3 text-slate-300" />
                        <span className="text-[10px] text-slate-400">
                          연결된 할 일 {linkedTasks.length}개
                        </span>
                      </div>
                      {linkedTasks.map(
                        ({ action: taskAction, index: taskIndex }, idx) => {
                          const isAdded = isActionApplied(taskIndex);
                          return (
                            <div
                              key={`${taskAction.type}-${taskIndex}`}
                              className={cn(
                                "group/todo flex items-center gap-2 px-3 py-2 transition-colors hover:bg-slate-50",
                                isAdded && "bg-indigo-50/30",
                              )}
                            >
                              <div className="ml-2 flex w-2 shrink-0 flex-col items-center self-stretch">
                                <div className="w-px flex-1 bg-slate-200" />
                                {idx === linkedTasks.length - 1 && (
                                  <div className="w-px flex-1 bg-transparent" />
                                )}
                              </div>
                              <div className="-ml-0.5 h-px w-1.5 shrink-0 bg-slate-200" />
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
                                      : "text-slate-700",
                                  )}
                                >
                                  {getActionTitle(taskAction)}
                                </p>
                                <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-slate-400">
                                  <Clock className="h-2.5 w-2.5" />
                                  {getActionDateLabel(taskAction) ||
                                    "시간 미정"}
                                  {isAdded && (
                                    <span className="ml-1 rounded bg-indigo-50 px-1 text-indigo-600">
                                      추가됨
                                    </span>
                                  )}
                                </p>
                              </div>
                              {renderPlusButton(taskIndex)}
                              {!isAdded && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRemoved((prev) =>
                                      new Set(prev).add(taskIndex),
                                    )
                                  }
                                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent bg-white text-slate-400 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-500"
                                  aria-label="할 일 후보 삭제"
                                  title="할 일 후보 삭제"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(index)}
                      className="flex w-full items-center gap-1.5 px-3 py-2 transition-colors hover:bg-slate-50"
                    >
                      <Link2 className="h-3 w-3 text-slate-300" />
                      <span className="text-[11px] text-slate-400">
                        연결된 할 일 {linkedTasks.length}개
                        {addedTodoCount > 0 && (
                          <span className="ml-1 text-indigo-500">
                            ({addedTodoCount}개 추가됨)
                          </span>
                        )}
                      </span>
                      <ChevronDown className="ml-auto h-3 w-3 text-slate-300" />
                    </button>
                  ))}
              </div>
            );
          })}

          {independentTasks.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center gap-1.5 border-b border-slate-100 bg-white px-3 py-2">
                <CheckSquare className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-700">
                  독립 할 일
                </span>
                <span className="rounded-full bg-slate-100 px-1.5 py-0 text-[10px] text-slate-500">
                  {independentTasks.length}
                </span>
                {(independentTasksCanApply || independentTasksAllApplied) && (
                  <button
                    type="button"
                    onClick={() =>
                      void (independentTasksAllApplied
                        ? handleRemoveAppliedActions(independentTaskIndexes)
                        : handleApplyBundle(independentTaskIndexes))
                    }
                    disabled={anyBulkActionPending}
                    className={cn(
                      "ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50",
                      independentTasksAllApplied
                        ? "text-red-500 hover:bg-red-50 hover:text-red-600"
                        : "text-indigo-600 hover:bg-indigo-50",
                    )}
                  >
                    {independentTasksApplying || independentTasksRemoving ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        {independentTasksRemoving ? "삭제 중" : "추가 중"}
                      </>
                    ) : independentTasksAllApplied ? (
                      <>
                        <Trash2 className="h-3 w-3" />
                        전체 삭제
                      </>
                    ) : (
                      <>
                        <CheckSquare className="h-3 w-3" />
                        전체 추가
                      </>
                    )}
                  </button>
                )}
              </div>
              {independentTasks.map(({ action, index }) => {
                const isAdded = isActionApplied(index);
                return (
                  <div
                    key={`${action.type}-${index}`}
                    className={cn(
                      "group/stodo flex items-center gap-2 border-b border-slate-50 px-3 py-2.5 transition-colors last:border-0 hover:bg-slate-50",
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
                            : "text-slate-700",
                        )}
                      >
                        {getActionTitle(action)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-0.5 text-[10px] text-slate-400">
                        <Clock className="h-2.5 w-2.5" />
                        {getActionDateLabel(action) || "시간 미정"}
                        {isAdded && (
                          <span className="ml-1 rounded bg-indigo-50 px-1 text-indigo-600">
                            추가됨
                          </span>
                        )}
                      </p>
                    </div>
                    {renderPlusButton(index)}
                    {!isAdded && (
                      <button
                        type="button"
                        onClick={() =>
                          setRemoved((prev) => new Set(prev).add(index))
                        }
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-transparent bg-white text-slate-400 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-500"
                        aria-label="할 일 후보 삭제"
                        title="할 일 후보 삭제"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
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
  onToggleOpen,
}: {
  memo: Memo | null;
  open: boolean;
  onToggleOpen: () => void;
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
  const taskCount = actions.filter(
    (action) => action.type === "create_task",
  ).length;

  const retry = async () => {
    if (!memo) return;
    await parseMutation.mutateAsync({
      memoId: memo.memo_id,
      force: status === "completed" || status === "failed",
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggleOpen}
        className="fixed right-4 top-1.5 z-50 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent text-slate-500 shadow-none transition hover:bg-slate-100 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 min-[600px]:top-3.5"
        aria-label="AI 추출 결과 열기"
        title="AI 추출 결과 열기"
      >
        <PanelRight className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside
      data-flowra-memo-ai-result="true"
      className="fixed inset-y-0 right-0 z-40 flex w-[min(380px,100vw)] shrink-0 flex-col border-l border-slate-200/80 bg-slate-50/95 shadow-2xl shadow-slate-900/10 backdrop-blur transition-transform duration-200"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200/80 px-3 min-[600px]:h-16">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-500" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
          AI 추출 결과
        </span>
        <span className="whitespace-nowrap text-[10px] text-slate-500">
          일정 {scheduleCount} · 할 일 {taskCount}
        </span>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label="AI 추출 결과 접기"
          title="AI 추출 결과 접기"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent text-slate-500 shadow-none transition hover:bg-slate-100 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>

      <div className="scrollbar-none flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {!memo ? (
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-center text-xs text-slate-400">
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
          <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
            <Sparkles className="h-6 w-6 text-slate-300" />
            <p className="text-center text-xs">
              추출된 일정과 할 일이 없습니다.
              <br />
              본문의 재분석을 실행해보세요.
            </p>
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
    parseResultQuery.data?.latest_result ??
    selectedMemo?.last_ai_result ??
    null;

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
  const aiPanelOpen = mode !== "create" && rightOpen;
  const headerRightOffset = aiPanelOpen
    ? MEMO_AI_PANEL_WIDTH
    : mode !== "create"
      ? "44px"
      : "0px";

  return (
    <AppShell
      fullBleed
      titleMeta={titleMeta}
      aiChatButtonOffset={aiPanelOpen ? MEMO_AI_PANEL_WIDTH : "0px"}
      headerRightOffset={headerRightOffset}
    >
      <div
        className={cn(
          "relative flex h-full overflow-hidden bg-white font-sans text-slate-950 transition-[padding] duration-200",
          aiPanelOpen && "min-[600px]:pr-[380px]",
        )}
        onClick={() => setConfirmDeleteId(null)}
      >
        {mode !== "create" && (
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
        )}

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
            onParseStart={() => setRightOpen(true)}
          />
        ) : (
          <EmptyMemoPanel onCreate={() => setMode("create")} />
        )}

        {mode !== "create" && (
          <MemoAiPanel
            memo={selectedMemo}
            open={rightOpen}
            onToggleOpen={() => setRightOpen((open) => !open)}
          />
        )}
      </div>
    </AppShell>
  );
}
