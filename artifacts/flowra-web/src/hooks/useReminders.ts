import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createReminder,
  deleteReminder,
  listReminders,
} from "@/api/reminders";
import type {
  CreateReminderRequest,
  Reminder,
  ReminderListQuery,
} from "@/types";

export const REMINDERS_QUERY_KEY = ["reminders"] as const;

export function remindersKey(query: ReminderListQuery = {}) {
  return [...REMINDERS_QUERY_KEY, query] as const;
}

export function useReminders(query: ReminderListQuery = {}) {
  return useQuery<Reminder[]>({
    queryKey: remindersKey(query),
    staleTime: 1000 * 30,
    queryFn: async () => {
      const res = await listReminders(query);
      if (!res.success)
        throw new Error(res.message || "알림을 불러오지 못했습니다.");
      const data = res.data ?? {};
      return data.reminders ?? data.items ?? [];
    },
  });
}

function useInvalidateReminders() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: REMINDERS_QUERY_KEY });
}

export function useCreateReminder() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: async (payload: CreateReminderRequest) => {
      const res = await createReminder(payload);
      if (!res.success)
        throw new Error(res.message || "알림 생성에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "알림을 등록했습니다.",
      errorMessage: "알림 등록에 실패했습니다.",
    },
  });
}

export function useDeleteReminder() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: async (reminderId: number) => {
      const res = await deleteReminder(reminderId);
      if (!res.success)
        throw new Error(res.message || "알림 삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "알림을 삭제했습니다.",
      errorMessage: "알림 삭제에 실패했습니다.",
    },
  });
}
