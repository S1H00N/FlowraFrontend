import { useCallback, useMemo, useState } from "react";
import {
  useCreateReminder,
  useDeleteReminder,
  useReminders,
} from "@/hooks/useReminders";
import {
  REMINDER_TYPES,
  REMINDER_TYPE_LABELS,
  type ReminderTargetType,
  type ReminderType,
} from "@/types";
import Spinner from "@/components/ui/Spinner";

interface ReminderControlProps {
  targetType: ReminderTargetType;
  targetId: number;
}

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReminderControl({
  targetType,
  targetId,
}: ReminderControlProps) {
  const [open, setOpen] = useState(false);
  const [remindAt, setRemindAt] = useState("");
  const [reminderType, setReminderType] = useState<ReminderType>("in_app");
  const [validationError, setValidationError] = useState<string | null>(null);

  const remindersQuery = useReminders({
    target_type: targetType,
    target_id: targetId,
  });
  const createMutation = useCreateReminder();
  const deleteMutation = useDeleteReminder();

  const items = useMemo(
    () => remindersQuery.data ?? [],
    [remindersQuery.data],
  );

  const handleAdd = useCallback(async () => {
    setValidationError(null);
    if (!remindAt) {
      setValidationError("알림 시각을 선택하세요.");
      return;
    }
    const isoRemindAt = new Date(remindAt).toISOString();
    if (new Date(isoRemindAt).getTime() < Date.now() - 60_000) {
      setValidationError("미래 시각을 선택하세요.");
      return;
    }
    try {
      await createMutation.mutateAsync({
        target_type: targetType,
        target_id: targetId,
        remind_at: isoRemindAt,
        reminder_type: reminderType,
      });
      setRemindAt("");
      setReminderType("in_app");
    } catch {
      /* global toast */
    }
  }, [remindAt, reminderType, targetType, targetId, createMutation]);

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteMutation.mutateAsync(id);
      } catch {
        /* global toast */
      }
    },
    [deleteMutation],
  );

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-xs font-medium text-slate-700"
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden>🔔</span>
          알림 {items.length > 0 ? `(${items.length})` : ""}
        </span>
        <span className="text-slate-400">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {remindersQuery.isLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Spinner size="xs" /> 알림 불러오는 중...
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-500">등록된 알림이 없습니다.</p>
          ) : (
            <ul className="space-y-1">
              {items.map((r) => (
                <li
                  key={r.reminder_id}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-700">
                      {toLocalInputValue(r.remind_at)}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {REMINDER_TYPE_LABELS[r.reminder_type] ?? r.reminder_type}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={deleteMutation.isPending}
                    onClick={() => handleDelete(r.reminder_id)}
                    className="rounded border border-red-200 bg-white px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-1.5 rounded border border-dashed border-slate-300 bg-white p-2 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col text-[11px] text-slate-600">
              알림 시각
              <input
                type="datetime-local"
                value={remindAt}
                onChange={(e) => setRemindAt(e.target.value)}
                className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col text-[11px] text-slate-600">
              방법
              <select
                value={reminderType}
                onChange={(e) =>
                  setReminderType(e.target.value as ReminderType)
                }
                className="mt-0.5 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
              >
                {REMINDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {REMINDER_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleAdd}
              disabled={createMutation.isPending}
              className="self-end rounded border border-slate-300 bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {createMutation.isPending ? "추가 중..." : "알림 추가"}
            </button>
          </div>
          {validationError && (
            <p className="text-[11px] text-red-600">{validationError}</p>
          )}
        </div>
      )}
    </div>
  );
}
