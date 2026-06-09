import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotificationUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/api/notifications";
import type { NotificationsListData, NotificationsQuery } from "@/types";

export const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const;

export function notificationsListKey(query: NotificationsQuery = {}) {
  return [...NOTIFICATIONS_QUERY_KEY, "list", query] as const;
}

export function notificationUnreadCountKey() {
  return [...NOTIFICATIONS_QUERY_KEY, "unread-count"] as const;
}

export function useNotifications(
  query: NotificationsQuery = {},
  enabled = true,
) {
  return useQuery<NotificationsListData>({
    queryKey: notificationsListKey(query),
    queryFn: async () => {
      const res = await listNotifications(query);
      if (!res.success) {
        throw new Error(res.message || "알림 목록을 불러오지 못했습니다.");
      }
      return res.data;
    },
    enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useNotificationUnreadCount(enabled = true) {
  return useQuery<number>({
    queryKey: notificationUnreadCountKey(),
    queryFn: async () => {
      const res = await getNotificationUnreadCount();
      if (!res.success) {
        throw new Error(res.message || "미읽음 알림 수를 불러오지 못했습니다.");
      }
      return res.data.unread_count ?? 0;
    },
    enabled,
    refetchInterval: 1000 * 60,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationRecipientId: number) => {
      const res = await markNotificationRead(notificationRecipientId);
      if (!res.success) {
        throw new Error(res.message || "알림 읽음 처리에 실패했습니다.");
      }
      return res.data.notification;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
    meta: {
      suppressSuccessToast: true,
      errorMessage: "알림 읽음 처리에 실패했습니다.",
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await markAllNotificationsRead();
      if (!res.success) {
        throw new Error(res.message || "알림 읽음 처리에 실패했습니다.");
      }
      return res.data.updated_count;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
    meta: {
      suppressSuccessToast: true,
      errorMessage: "알림 읽음 처리에 실패했습니다.",
    },
  });
}
