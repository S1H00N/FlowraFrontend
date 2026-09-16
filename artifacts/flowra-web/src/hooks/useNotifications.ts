import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getNotificationUnreadCount, listNotifications,
  markAllNotificationsRead, markNotificationRead,
} from "@/api/notifications";
import { useAuth } from "@/contexts/AuthContext";
import { authStorage } from "@/lib/auth-storage";
import { mergeInbox, notifyInboxChanged, pushInbox } from "@/lib/pushInbox";
import type { NotificationRecipient, NotificationsQuery } from "@/types";

export const NOTIFICATIONS_QUERY_KEY = ["notifications"] as const;
const inboxKey = (userId?: number) => [...NOTIFICATIONS_QUERY_KEY, userId, "inbox"] as const;

function ensureCurrentUser(userId: number) {
  if (!authStorage.getAccessToken() || authStorage.getUser<{ user_id: number }>()?.user_id !== userId) {
    throw new Error("로그인 정보가 변경되었습니다.");
  }
}

function useInboxSnapshot(enabled: boolean) {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.user_id;
  return useQuery({
    queryKey: inboxKey(userId),
    enabled: enabled && isAuthenticated && userId !== undefined,
    staleTime: 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const [localResult, remoteResult, countResult] = await Promise.allSettled([
        pushInbox.list(userId!),
        listNotifications({ page: 1, page_size: 100 }).then((res) => {
          if (!res.success) throw new Error(res.message || "알림 목록을 불러오지 못했습니다.");
          return res.data.notifications;
        }),
        getNotificationUnreadCount().then((res) => {
          if (!res.success) throw new Error(res.message || "미읽음 알림 수를 불러오지 못했습니다.");
          return res.data.unread_count ?? 0;
        }),
      ]);
      ensureCurrentUser(userId!);
      const local = localResult.status === "fulfilled" ? localResult.value : [];
      if (remoteResult.status === "rejected" && local.length === 0) throw remoteResult.reason;
      const remote = remoteResult.status === "fulfilled" ? [...remoteResult.value] : [];
      let serverUnavailable = remoteResult.status === "rejected" || countResult.status === "rejected";
      // Locate older server copies before adding a local receipt to the unread count.
      // Firebase console messages have no server IDs and need no extra API pages.
      let page = 1;
      let lastPageSize = remote.length;
      const hasUnmatchedIds = () => local.some((item) =>
        !item.server_seen && (item.recipientId || item.notificationId) && !remote.some((notification) =>
          (item.recipientId && item.recipientId === String(notification.notification_recipient_id)) ||
          (item.notificationId && item.notificationId === String(notification.notification_id)),
        ),
      );
      while (lastPageSize === 100 && hasUnmatchedIds()) {
        try {
          ensureCurrentUser(userId!);
          const res = await listNotifications({ page: ++page, page_size: 100 });
          if (!res.success) throw new Error(res.message);
          const newItems = res.data.notifications.filter((item) =>
            !remote.some((existing) => existing.notification_recipient_id === item.notification_recipient_id),
          );
          remote.push(...newItems);
          lastPageSize = newItems.length;
        } catch {
          serverUnavailable = true;
          break;
        }
      }
      ensureCurrentUser(userId!);
      const serverUnread = countResult.status === "fulfilled"
        ? countResult.value : remote.filter((item) => !item.read_at).length;
      const merged = mergeInbox(remote, local,
        remoteResult.status === "rejected" ? 0 : serverUnread,
        remoteResult.status === "rejected",
      );
      // A receipt can be read before its server record arrives. Carry that read
      // forward, retrying the idempotent server update on the next refresh if needed.
      const readSync = merged.notifications.filter((item) => !item.local_only && item.read_at &&
        remote.some((original) => original.notification_recipient_id === item.notification_recipient_id && !original.read_at));
      await Promise.allSettled(readSync.map((item) => markNotificationRead(item.notification_recipient_id)));
      const readLocalIds = merged.notifications.filter((item) => !item.local_only && item.read_at)
        .flatMap((item) => item.local_push_ids ?? []);
      if (readLocalIds.length) await pushInbox.markRead(userId!, readLocalIds).catch(() => {});
      const matchedIds = merged.notifications.filter((item) => !item.local_only)
        .flatMap((item) => item.local_push_ids ?? []);
      if (matchedIds.length) await pushInbox.reconcile(userId!, matchedIds).catch(() => {});
      return { ...merged, serverUnavailable, serverUnread };
    },
  });
}

export function useNotifications(query: NotificationsQuery = {}, enabled = true) {
  const result = useInboxSnapshot(enabled);
  const filtered = result.data?.notifications.filter((item) =>
    (!query.unread_only || !item.read_at) && (!query.type || item.type === query.type),
  );
  const size = query.page_size ?? 100;
  const offset = ((query.page ?? 1) - 1) * size;
  return {
    ...result,
    data: result.data && {
      notifications: filtered!.slice(offset, offset + size),
      server_unavailable: result.data.serverUnavailable,
    },
  };
}

export function useNotificationUnreadCount(enabled = true) {
  const result = useInboxSnapshot(enabled);
  return { ...result, data: result.data?.unreadCount };
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (notification: NotificationRecipient) => {
      if (!user) throw new Error("로그인이 필요합니다.");
      ensureCurrentUser(user.user_id);
      if (!notification.local_only) {
        const res = await markNotificationRead(notification.notification_recipient_id);
        if (!res.success) throw new Error(res.message || "알림 읽음 처리에 실패했습니다.");
      }
      if (notification.local_push_ids?.length) {
        await pushInbox.markRead(user.user_id, notification.local_push_ids);
      }
    },
    onSettled: () => {
      notifyInboxChanged();
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
    meta: { suppressSuccessToast: true, errorMessage: "알림 읽음 처리에 실패했습니다." },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("로그인이 필요합니다.");
      ensureCurrentUser(user.user_id);
      const local = await pushInbox.list(user.user_id).catch(() => []);
      if (local.length) await pushInbox.markRead(user.user_id, local.map((item) => item.id));
      ensureCurrentUser(user.user_id);
      const snapshot = queryClient.getQueryData<{ serverUnread: number }>(inboxKey(user.user_id));
      if (snapshot?.serverUnread !== 0) {
        const res = await markAllNotificationsRead();
        if (!res.success) throw new Error(res.message || "알림 읽음 처리에 실패했습니다.");
      }
    },
    onSettled: () => {
      notifyInboxChanged();
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
    meta: { suppressSuccessToast: true, errorMessage: "알림 읽음 처리에 실패했습니다." },
  });
}
