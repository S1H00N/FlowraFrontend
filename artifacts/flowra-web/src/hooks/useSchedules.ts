import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createRecurringSchedule,
  createSchedule,
  deleteSchedule,
  deleteSchedulesBulk,
  listSchedules,
  updateSchedule,
} from "@/api/schedules";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CreateRecurringScheduleRequest,
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
      successMessage: "일정이 추가되었습니다.",
      errorMessage: "일정 추가에 실패했습니다.",
    },
  });
}

export function useCreateSchedules() {
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async (payloads: CreateScheduleRequest[]) => {
      const schedules: Schedule[] = [];

      for (const payload of payloads) {
        const res = await createSchedule(payload);
        if (!res.success) {
          throw new Error(res.message || "생성에 실패했습니다.");
        }
        schedules.push(res.data.schedule);
      }

      return schedules;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "일정이 추가되었습니다.",
      errorMessage: "일정 추가에 실패했습니다.",
    },
  });
}

export function useCreateRecurringSchedule() {
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async (payload: CreateRecurringScheduleRequest) => {
      const res = await createRecurringSchedule(payload);
      if (!res.success) throw new Error(res.message || "생성에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "반복 일정이 추가되었습니다.",
      errorMessage: "반복 일정 추가에 실패했습니다.",
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
      successMessage: "일정이 수정되었습니다.",
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
      successMessage: "일정이 삭제되었습니다.",
      errorMessage: "일정 삭제에 실패했습니다.",
    },
  });
}

export function useDeleteSchedules() {
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async (scheduleIds: number[]) => {
      const res = await deleteSchedulesBulk(scheduleIds);
      if (!res.success) throw new Error(res.message || "삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      errorMessage: "일정 삭제에 실패했습니다.",
    },
  });
}
