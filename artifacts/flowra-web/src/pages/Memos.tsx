import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateMemo,
  useDeleteMemo,
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
  type MemoType,
  type ParseStatus,
} from "@/types";
import { getErrorMessage } from "@/lib/error";

const parseStatusBadge: Record<ParseStatus, string> = {
  pending: "bg-slate-100 text-slate-600 border-slate-200",
  processing: "bg-blue-100 text-blue-700 border-blue-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
};

function ParseStatusBadge({ status }: { status: ParseStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${parseStatusBadge[status]}`}
    >
      {(status === "pending" || status === "processing") && (
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      )}
      {PARSE_STATUS_LABELS[status]}
    </span>
  );
}

function MemoForm() {
  const [text, setText] = useState("");
  const [memoType, setMemoType] = useState<MemoType>("quick");
  const [autoParse, setAutoParse] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const createMutation = useCreateMemo();

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!text.trim()) return;
    try {
      await createMutation.mutateAsync({
        raw_text: text.trim(),
        memo_type: memoType,
        source_type: "manual",
        auto_parse: autoParse,
      });
      setText("");
    } catch (err) {
      setError(getErrorMessage(err, "메모 저장에 실패했습니다."));
    }
  };

  return (
    <form
      onSubmit={handle}
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <textarea
        required
        rows={3}
        placeholder="메모를 입력하세요. AI가 일정/할일을 자동으로 추출합니다."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={memoType}
          onChange={(e) => setMemoType(e.target.value as MemoType)}
          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
        >
          {MEMO_TYPES.map((t) => (
            <option key={t} value={t}>
              {MEMO_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={autoParse}
            onChange={(e) => setAutoParse(e.target.checked)}
          />
          AI 자동 분석
        </label>
        <div className="flex-1" />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {createMutation.isPending ? "저장 중..." : "메모 추가"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function ParseResultPanel({ memoId }: { memoId: number }) {
  const { data, isLoading, isError, error } = useMemoParseResult(memoId);

  if (isLoading) {
    return (
      <div className="mt-2 h-16 animate-pulse rounded bg-slate-100" />
    );
  }
  if (isError) {
    return (
      <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">
        결과 로드 실패: {(error as Error).message}
      </div>
    );
  }
  if (!data) return null;

  if (data.parse_status !== "completed") {
    return (
      <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
        분석 상태: <ParseStatusBadge status={data.parse_status} />
      </div>
    );
  }

  const r = data.result;
  if (!r) {
    return (
      <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-500">
        분석 결과가 없습니다.
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-slate-600">
        <span className="font-medium">AI 분석 결과</span>
        <span className="text-slate-400">·</span>
        <span>유형: {r.detected_type}</span>
        {typeof r.confidence_score === "number" && (
          <>
            <span className="text-slate-400">·</span>
            <span>신뢰도 {(r.confidence_score * 100).toFixed(0)}%</span>
          </>
        )}
      </div>
      {r.suggested_schedule && (
        <div className="rounded bg-white p-2">
          <div className="font-medium text-slate-700">제안 일정</div>
          <div className="mt-0.5 text-slate-700">
            {r.suggested_schedule.title}
          </div>
          {r.suggested_schedule.start_datetime && (
            <div className="text-slate-500">
              {new Date(
                r.suggested_schedule.start_datetime,
              ).toLocaleString("ko-KR")}
            </div>
          )}
        </div>
      )}
      {r.suggested_task && (
        <div className="rounded bg-white p-2">
          <div className="font-medium text-slate-700">제안 할 일</div>
          <div className="mt-0.5 text-slate-700">{r.suggested_task.title}</div>
          {r.suggested_task.priority && (
            <div className="text-slate-500">
              우선순위: {r.suggested_task.priority}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MemoCard({ memo }: { memo: Memo }) {
  const [isEditing, setIsEditing] = useState(false);
  const [text, setText] = useState(memo.raw_text);
  const [memoType, setMemoType] = useState<MemoType>(memo.memo_type);
  const [showResult, setShowResult] = useState(false);
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
      setShowResult(true);
    } catch (err) {
      setError(getErrorMessage(err, "AI 파싱 요청에 실패했습니다."));
    }
  };

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
              {MEMO_TYPE_LABELS[memo.memo_type]}
            </span>
            <ParseStatusBadge status={memo.parse_status} />
            <span className="text-[11px] text-slate-400">
              {new Date(memo.created_at).toLocaleString("ko-KR")}
            </span>
          </div>
          {isEditing ? (
            <div className="mt-2 space-y-2">
              <textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                value={memoType}
                onChange={(e) => setMemoType(e.target.value as MemoType)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
              >
                {MEMO_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MEMO_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
              {memo.raw_text}
            </p>
          )}
          {memo.parse_status === "failed" && memo.parse_error_message && (
            <p className="mt-1 text-xs text-red-600">
              {memo.parse_error_message}
            </p>
          )}
          {showResult && memo.parse_status === "completed" && (
            <ParseResultPanel memoId={memo.memo_id} />
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
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
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                취소
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowResult((v) => !v)}
                disabled={memo.parse_status !== "completed"}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                {showResult ? "결과 숨김" : "결과 보기"}
              </button>
              <button
                type="button"
                onClick={handleParse}
                disabled={
                  parseMutation.isPending ||
                  memo.parse_status === "processing" ||
                  memo.parse_status === "pending"
                }
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                재분석
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                수정
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                삭제
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}

export default function Memos() {
  const { data, isLoading, isError, error, isFetching } = useMemos();

  const items = data?.items ?? [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">메모</h1>
            <p className="mt-1 text-sm text-slate-500">
              빠르게 메모하고 AI가 분석한 결과를 확인하세요.
            </p>
          </div>
          <Link
            to="/"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            홈으로
          </Link>
        </header>

        <div className="mt-6">
          <MemoForm />
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>총 {data?.pagination?.total_items ?? 0}건</span>
          {isFetching && <span>새로고침 중...</span>}
        </div>

        <div className="mt-2">
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-20 animate-pulse rounded bg-slate-100" />
              <div className="h-20 animate-pulse rounded bg-slate-100" />
            </div>
          ) : isError ? (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              불러오기 실패: {(error as Error).message}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-10 text-center text-sm text-slate-500">
              메모가 없습니다.
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((m) => (
                <MemoCard key={m.memo_id} memo={m} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
