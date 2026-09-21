import { useEffect, useState } from "react";
import { useDeleteScheduleSeries, useScheduleSeries, useUpdateScheduleSeries } from "@/hooks/useScheduleSeries";
import { getErrorCode, getErrorMessage } from "@/lib/error";
import { toast } from "@/lib/toast";
import type { Schedule, ScheduleSeriesScope, UpdateScheduleRequest } from "@/types";

const scopeLabels: Record<ScheduleSeriesScope, string> = {
  single: "이 일정만",
  following: "이 일정과 이후 일정",
  all: "반복 일정 전체",
};

function linkedDataConfirmation(error: unknown) {
  if (getErrorCode(error) !== "SERIES_LINKED_DATA_CONFIRMATION_REQUIRED") return false;
  const details = (error as { response?: { data?: { error?: { details?: { counts?: Record<string, number> } } } } })
    .response?.data?.error?.details;
  const counts = details?.counts;
  const labels: Record<string, string> = {
    tasks: "연결 할 일", linked_tasks: "연결 할 일", unlinked_tasks: "연결 할 일",
    shares: "공유", removed_shares: "공유", reminders: "알림", removed_reminders: "알림",
    share_links: "공유 링크", removed_share_links: "공유 링크",
  };
  const countsText = Object.entries(counts ?? {})
    .filter(([, value]) => typeof value === "number" && value > 0)
    .map(([key, value]) => `${labels[key] ?? key}: ${value}개`)
    .join("\n");
  return window.confirm(`연결된 데이터가 있습니다.${countsText ? `\n${countsText}` : ""}\n할 일은 일정 연결만 해제되고, 공유·공유 링크·일정 알림은 삭제됩니다. 계속할까요?`);
}

export default function ScheduleSeriesControl({ schedule, changes, disabled, onComplete, onBusyChange }: {
  schedule: Schedule;
  changes: UpdateScheduleRequest;
  disabled?: boolean;
  onComplete: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [scope, setScope] = useState<ScheduleSeriesScope>("single");
  const [includeExceptions, setIncludeExceptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const series = useScheduleSeries(schedule.schedule_id);
  const updateMutation = useUpdateScheduleSeries();
  const deleteMutation = useDeleteScheduleSeries();
  const busy = disabled || series.isLoading || updateMutation.isPending || deleteMutation.isPending;
  useEffect(() => {
    onBusyChange(updateMutation.isPending || deleteMutation.isPending);
    return () => onBusyChange(false);
  }, [updateMutation.isPending, deleteMutation.isPending, onBusyChange]);

  const apply = async (remove: boolean) => {
    if (remove && !window.confirm(`${scopeLabels[scope]}을 삭제할까요?`)) return;
    if (!remove && !changes.title?.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    setError(null);
    const request = async (confirmed: boolean) => {
      if (remove) {
        await deleteMutation.mutateAsync({
          scheduleId: schedule.schedule_id,
          payload: { scope, confirm_remove_linked: confirmed },
        });
        toast.success("선택한 범위의 반복 일정을 삭제했습니다.");
      } else {
        const result = await updateMutation.mutateAsync({
          scheduleId: schedule.schedule_id,
          payload: {
            scope,
            changes: {
              title: changes.title,
              description: changes.description,
              schedule_type: changes.schedule_type,
              priority: changes.priority,
              location: changes.location,
              category_id: changes.category_id,
            },
            include_exceptions: includeExceptions,
            confirm_remove_linked: confirmed,
          },
        });
        const skipped = result.skipped_exception_ids.length;
        toast.success(skipped > 0
          ? `반복 일정을 수정했습니다. 개별 수정 일정 ${skipped}개는 유지했습니다.`
          : "반복 일정을 수정했습니다.");
      }
    };
    try {
      try {
        await request(false);
      } catch (err) {
        if (getErrorCode(err) !== "SERIES_LINKED_DATA_CONFIRMATION_REQUIRED") throw err;
        if (!linkedDataConfirmation(err)) return;
        await request(true);
      }
      if (remove) onComplete();
    } catch (err) {
      setError(getErrorMessage(err, "반복 일정 변경에 실패했습니다."));
    }
  };

  return (
    <section className="space-y-2 rounded-lg border border-violet-100 bg-white p-3" aria-label="반복 일정 관리">
      <p className="text-xs font-semibold text-violet-700">반복 일정 관리{series.data ? ` · ${series.data.schedules.length}개` : ""}</p>
      <label className="block text-xs text-slate-600">
        적용 범위
        <select aria-label="반복 일정 적용 범위" value={scope} onChange={(event) => setScope(event.target.value as ScheduleSeriesScope)} disabled={busy} className="mt-1 h-8 w-full rounded-md border border-slate-200 bg-white px-2">
          {Object.entries(scopeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <p className="text-[11px] leading-5 text-slate-500">범위에 내용 적용은 제목, 설명, 유형, 우선순위, 장소, 카테고리를 변경합니다. 날짜와 시간은 아래 저장으로 이 일정만 변경합니다.</p>
      {scope !== "single" && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={includeExceptions} onChange={(event) => setIncludeExceptions(event.target.checked)} disabled={busy} />개별 수정한 일정도 포함</label>}
      {(error || series.isError) && <p role="alert" className="text-xs text-red-600">{error ?? getErrorMessage(series.error, "반복 일정을 불러오지 못했습니다.")}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={busy || series.isError} onClick={() => void apply(false)} className="rounded-md bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 disabled:opacity-50">범위에 내용 적용</button>
        <button type="button" disabled={busy || series.isError} onClick={() => void apply(true)} className="rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50">범위 삭제</button>
      </div>
    </section>
  );
}
