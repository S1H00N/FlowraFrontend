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
import { localInputToOffsetISOString } from "@/utils/dateUtils";
import { ChevronDown, Plus } from "lucide-react";
import {
  CompactDateInput,
  CompactTimeInput,
  dateKeyFromLocalInput,
  localInputWithDateKey,
  localInputWithTime,
  timeFromLocalInput,
} from "@/components/CompactDateTimeInputs";

interface ReminderControlProps {
  targetType: ReminderTargetType;
  targetId: number;
}

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function suggestedReminderLocal() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ReminderControl({
  targetType,
  targetId,
}: ReminderControlProps) {
  const [open, setOpen] = useState(false);
  const [remindAt, setRemindAt] = useState("");
  const [reminderType, setReminderType] = useState<ReminderType>("in_app");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [suggestedTime] = useState(suggestedReminderLocal);

  const remindersQuery = useReminders({
    target_type: targetType,
    target_id: String(targetId),
  });
  const createMutation = useCreateReminder();
  const deleteMutation = useDeleteReminder();

  const items = useMemo(() => remindersQuery.data ?? [], [remindersQuery.data]);

  const handleAdd = useCallback(async () => {
    setValidationError(null);
    if (!remindAt) {
      setValidationError("알림 시각을 선택하세요.");
      return;
    }
    const isoRemindAt = localInputToOffsetISOString(remindAt);
    if (new Date(isoRemindAt).getTime() < Date.now() - 60_000) {
      setValidationError("미래 시각을 선택하세요.");
      return;
    }
    try {
      await createMutation.mutateAsync({
        target_type: targetType,
        target_id: String(targetId),
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
    <div
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-100"
      >
        {items.length === 0 && <Plus aria-hidden="true" className="h-4 w-4" />}
        {items.length > 0 ? `알림 ${items.length}개` : "알림 설정"}
        <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
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
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
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
                    className="rounded-md border border-red-200 bg-white px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 bg-white p-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <span className="mb-1 block text-[11px] font-medium text-slate-600">알림 시각</span>
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-1.5">
                <CompactDateInput
                  value={dateKeyFromLocalInput(remindAt)}
                  onChange={(dateKey) => {
                    setRemindAt(localInputWithDateKey(remindAt, dateKey, timeFromLocalInput(remindAt) || timeFromLocalInput(suggestedTime)));
                    setValidationError(null);
                  }}
                  ariaLabel="알림 날짜 선택"
                  emptyPlaceholder="날짜 선택"
                  className="h-9 w-full border-slate-200 bg-white px-2 shadow-sm hover:border-slate-300"
                />
                <CompactTimeInput
                  value={timeFromLocalInput(remindAt)}
                  onChange={(time) => {
                    setRemindAt(localInputWithTime(remindAt, time, dateKeyFromLocalInput(remindAt) || dateKeyFromLocalInput(suggestedTime)));
                    setValidationError(null);
                  }}
                  ariaLabel="알림 시간 선택"
                  className="h-9 w-full border border-slate-200 bg-white px-2 shadow-sm hover:border-slate-300"
                />
              </div>
            </div>
            <label className="flex flex-col text-[11px] text-slate-600">
              방법
              <select
                value={reminderType}
                onChange={(e) =>
                  setReminderType(e.target.value as ReminderType)
                }
                className="mt-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
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
              className="self-end rounded-lg border border-violet-600 bg-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-60"
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
