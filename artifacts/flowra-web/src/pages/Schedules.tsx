import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateSchedule,
  useDeleteSchedule,
  useSchedules,
  useUpdateSchedule,
} from "@/hooks/useSchedules";
import { useCategories } from "@/hooks/useCategories";
import {
  SCHEDULE_TYPES,
  SCHEDULE_TYPE_LABELS,
  SCHEDULE_VISIBILITY_LABELS,
  type Schedule,
  type ScheduleType,
  type ScheduleVisibility,
} from "@/types";
import { getErrorMessage } from "@/lib/error";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import CategorySelect, { CategoryDot } from "@/components/CategorySelect";
import ReminderControl from "@/components/ReminderControl";
import AppShell from "@/components/AppShell";

function toLocalInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

interface ScheduleFormState {
  title: string;
  description: string;
  schedule_type: ScheduleType;
  start_local: string;
  end_local: string;
  all_day: boolean;
  location: string;
  visibility: ScheduleVisibility;
  category_id: number | "";
}

const emptyForm: ScheduleFormState = {
  title: "",
  description: "",
  schedule_type: "personal",
  start_local: "",
  end_local: "",
  all_day: false,
  location: "",
  visibility: "private",
  category_id: "",
};

function ScheduleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: ScheduleFormState;
  submitLabel: string;
  onSubmit: (s: ScheduleFormState) => Promise<void> | void;
  onCancel?: () => void;
  isPending?: boolean;
}) {
  const [form, setForm] = useState<ScheduleFormState>(initial ?? emptyForm);
  const [error, setError] = useState<string | null>(null);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.title.trim() || !form.start_local) {
      setError("제목과 시작 일시는 필수입니다.");
      return;
    }
    try {
      await onSubmit(form);
      if (!initial) setForm(emptyForm);
    } catch (err) {
      setError(getErrorMessage(err, "저장에 실패했습니다."));
    }
  };

  return (
    <form
      onSubmit={handle}
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          required
          placeholder="일정 제목"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={form.schedule_type}
          onChange={(e) =>
            setForm({ ...form, schedule_type: e.target.value as ScheduleType })
          }
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          {SCHEDULE_TYPES.map((t) => (
            <option key={t} value={t}>
              {SCHEDULE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={form.visibility}
          onChange={(e) =>
            setForm({
              ...form,
              visibility: e.target.value as ScheduleVisibility,
            })
          }
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          {Object.entries(SCHEDULE_VISIBILITY_LABELS).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex flex-1 flex-col text-xs text-slate-600">
          시작
          <input
            type="datetime-local"
            value={form.start_local}
            onChange={(e) => setForm({ ...form, start_local: e.target.value })}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-1 flex-col text-xs text-slate-600">
          종료
          <input
            type="datetime-local"
            value={form.end_local}
            onChange={(e) => setForm({ ...form, end_local: e.target.value })}
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={form.all_day}
            onChange={(e) => setForm({ ...form, all_day: e.target.checked })}
          />
          종일
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          placeholder="장소"
          value={form.location}
          onChange={(e) => setForm({ ...form, location: e.target.value })}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <CategorySelect
          type="schedule"
          value={form.category_id}
          onChange={(v) => setForm({ ...form, category_id: v })}
          className="sm:min-w-44"
        />
      </div>
      <textarea
        placeholder="설명 (선택)"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        rows={2}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            취소
          </button>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {isPending ? "저장 중..." : submitLabel}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

function ScheduleRow({ schedule }: { schedule: Schedule }) {
  const [isEditing, setIsEditing] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteSchedule();
  const { data: categories = [] } = useCategories("schedule");
  const cat = categories.find((c) => c.category_id === schedule.category_id);

  if (isEditing) {
    return (
      <li className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <ScheduleForm
          submitLabel="저장"
          isPending={updateMutation.isPending}
          initial={{
            title: schedule.title,
            description: schedule.description ?? "",
            schedule_type: schedule.schedule_type,
            start_local: toLocalInputValue(schedule.start_datetime),
            end_local: toLocalInputValue(schedule.end_datetime),
            all_day: schedule.all_day,
            location: schedule.location ?? "",
            visibility: schedule.visibility,
            category_id: schedule.category_id ?? "",
          }}
          onCancel={() => setIsEditing(false)}
          onSubmit={async (form) => {
            await updateMutation.mutateAsync({
              scheduleId: schedule.schedule_id,
              payload: {
                title: form.title.trim(),
                description: form.description || undefined,
                schedule_type: form.schedule_type,
                start_datetime: fromLocalInputValue(form.start_local),
                end_datetime: form.end_local
                  ? fromLocalInputValue(form.end_local)
                  : undefined,
                all_day: form.all_day,
                location: form.location || undefined,
                visibility: form.visibility,
                category_id:
                  form.category_id === "" ? undefined : Number(form.category_id),
              },
            });
            setIsEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-900">
              {schedule.title}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
              {SCHEDULE_TYPE_LABELS[schedule.schedule_type]}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
              {SCHEDULE_VISIBILITY_LABELS[schedule.visibility]}
            </span>
            {cat && (
              <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600">
                <CategoryDot color={cat.color} />
                {cat.name}
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {schedule.all_day
              ? "종일"
              : `${new Date(schedule.start_datetime).toLocaleString("ko-KR")}${
                  schedule.end_datetime
                    ? ` ~ ${new Date(schedule.end_datetime).toLocaleString("ko-KR")}`
                    : ""
                }`}
            {schedule.location ? ` · ${schedule.location}` : ""}
          </div>
          {schedule.description && (
            <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">
              {schedule.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setShowReminders((v) => !v)}
            className={`rounded-md border px-2 py-1 text-xs font-medium hover:bg-slate-100 ${
              showReminders
                ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                : "border-slate-300 bg-white text-slate-700"
            }`}
          >
            알림
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
            disabled={deleteMutation.isPending}
            onClick={async () => {
              if (!confirm("정말 삭제하시겠습니까?")) return;
              await deleteMutation.mutateAsync(schedule.schedule_id);
            }}
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            삭제
          </button>
        </div>
      </div>
      {showReminders && (
        <ReminderControl
          targetType="schedule"
          targetId={schedule.schedule_id}
        />
      )}
    </li>
  );
}

export default function Schedules() {
  const createMutation = useCreateSchedule();
  const { data, isLoading, isError, error, isFetching, refetch } = useSchedules(
    { view: "list" },
  );

  const items = data?.items ?? [];

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Calendar board
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                캘린더
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                일정을 추가하고 관리하세요.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-900/15 transition hover:-translate-y-0.5"
            >
              홈으로
            </Link>
          </div>
        </section>

        <div className="mt-6">
          <ScheduleForm
            submitLabel="일정 추가"
            isPending={createMutation.isPending}
            onSubmit={async (form) => {
              await createMutation.mutateAsync({
                title: form.title.trim(),
                description: form.description || undefined,
                schedule_type: form.schedule_type,
                start_datetime: fromLocalInputValue(form.start_local),
                end_datetime: form.end_local
                  ? fromLocalInputValue(form.end_local)
                  : undefined,
                all_day: form.all_day,
                location: form.location || undefined,
                visibility: form.visibility,
                category_id:
                  form.category_id === ""
                    ? undefined
                    : Number(form.category_id),
              });
            }}
          />
        </div>

        <div className="mt-6">
          {isLoading ? (
            <FullSpinner message="일정을 불러오는 중..." />
          ) : isError ? (
            <ErrorState
              title="일정을 불러오지 못했습니다"
              message={(error as Error).message}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="아직 일정이 없습니다"
              description="위 폼에서 새 일정을 등록해 보세요."
            />
          ) : (
            <ul className="space-y-2">
              {items.map((s) => (
                <ScheduleRow key={s.schedule_id} schedule={s} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
