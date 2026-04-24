import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
} from "@/api/schedules";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CreateScheduleRequest,
  Schedule,
  ScheduleListQuery,
  UpdateScheduleRequest,
} from "@/types";

export const SCHEDULES_QUERY_KEY = ["schedules"] as const;

export function schedulesListKey(query: ScheduleListQuery = {}) {
  return [...SCHEDULES_QUERY_KEY, "list", query] as const;
}

export function useSchedules(query: ScheduleListQuery = {}) {
  return useQuery<Schedule[]>({
    queryKey: schedulesListKey(query),
    queryFn: async () => {
      const res = await listSchedules(query);
      if (!res.success) {
        throw new Error(res.message || "일정을 불러오지 못했습니다.");
      }
      return res.data.schedules ?? [];
    },
  });
}

function useInvalidateSchedules() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
    qc.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
  };
}

export function useCreateSchedule() {
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async (payload: CreateScheduleRequest) => {
      const res = await createSchedule(payload);
      if (!res.success) throw new Error(res.message || "생성에 실패했습니다.");
      return res.data.schedule;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "일정을 추가했습니다.",
      errorMessage: "일정 추가에 실패했습니다.",
    },
  });
}

export function useUpdateSchedule() {
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      payload,
    }: {
      scheduleId: number;
      payload: UpdateScheduleRequest;
    }) => {
      const res = await updateSchedule(scheduleId, payload);
      if (!res.success) throw new Error(res.message || "수정에 실패했습니다.");
      return res.data.schedule;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "일정을 수정했습니다.",
      errorMessage: "일정 수정에 실패했습니다.",
    },
  });
}

export function useDeleteSchedule() {
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async (scheduleId: number) => {
      const res = await deleteSchedule(scheduleId);
      if (!res.success) throw new Error(res.message || "삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "일정을 삭제했습니다.",
      errorMessage: "일정 삭제에 실패했습니다.",
    },
  });
}
