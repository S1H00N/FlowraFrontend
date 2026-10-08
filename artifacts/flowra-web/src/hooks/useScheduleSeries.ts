import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteScheduleSeries, getScheduleSeries, updateScheduleSeries } from "@/api/schedules";
import { SCHEDULES_QUERY_KEY, scheduleDetailKey } from "@/hooks/useSchedules";
import { TASKS_QUERY_KEY } from "@/hooks/useTasks";
import { REMINDERS_QUERY_KEY } from "@/hooks/useReminders";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import { TODAY_BRIEFING_QUERY_KEY } from "@/hooks/useTodayBriefing";
import { syncLinkedTaskDates } from "@/lib/syncLinkedTaskDates";
import { toast } from "@/lib/toast";
import type { DeleteScheduleSeriesRequest, ScheduleSeriesImpact, UpdateScheduleSeriesRequest } from "@/types";

export function useScheduleSeries(scheduleId: number | null, enabled = true) {
  return useQuery({
    queryKey: [...SCHEDULES_QUERY_KEY, "series", scheduleId],
    enabled: enabled && scheduleId !== null,
    queryFn: async () => {
      const res = await getScheduleSeries(scheduleId!);
      if (!res.success) throw new Error(res.message || "반복 일정을 불러오지 못했습니다.");
      return res.data;
    },
  });
}

function useRefreshSeriesResources() {
  const qc = useQueryClient();
  return (impact?: ScheduleSeriesImpact) => {
    for (const scheduleId of impact?.removed_schedule_ids ?? []) {
      qc.removeQueries({ queryKey: scheduleDetailKey(scheduleId), exact: true });
    }
    return Promise.all([
      SCHEDULES_QUERY_KEY, TASKS_QUERY_KEY, REMINDERS_QUERY_KEY, TODAY_HOME_QUERY_KEY, TODAY_BRIEFING_QUERY_KEY,
    ].map((queryKey) => qc.invalidateQueries({ queryKey })));
  };
}

export function useUpdateScheduleSeries() {
  const refresh = useRefreshSeriesResources();
  return useMutation({
    mutationFn: async ({ scheduleId, payload }: { scheduleId: number; payload: UpdateScheduleSeriesRequest }) => {
      const res = await updateScheduleSeries(scheduleId, payload);
      if (!res.success) throw new Error(res.message || "반복 일정 수정에 실패했습니다.");
      return res.data;
    },
    onSuccess: async (impact, { payload }) => {
      if (payload.changes?.start_datetime === undefined && payload.changes?.end_datetime === undefined) return;
      const results = await Promise.allSettled(impact.schedules.map(syncLinkedTaskDates));
      if (results.some((result) => result.status === "rejected") &&
          !results.some((result) => result.status === "rejected" && axios.isCancel(result.reason))) {
        toast.error("반복 일정 날짜는 변경됐지만 연결된 할 일 날짜를 모두 갱신하지 못했습니다.");
      }
    },
    onSettled: (impact) => refresh(impact),
    meta: { suppressErrorToast: true },
  });
}

export function useDeleteScheduleSeries() {
  const refresh = useRefreshSeriesResources();
  return useMutation({
    mutationFn: async ({ scheduleId, payload }: { scheduleId: number; payload: DeleteScheduleSeriesRequest }) => {
      const res = await deleteScheduleSeries(scheduleId, payload);
      if (!res.success) throw new Error(res.message || "반복 일정 삭제에 실패했습니다.");
      return res.data;
    },
    onSettled: (impact) => refresh(impact),
    meta: { suppressErrorToast: true },
  });
}
