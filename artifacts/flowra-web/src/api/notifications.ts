import apiClient from "./client";
import { compactParams } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  MarkAllNotificationsReadData,
  MarkNotificationReadData,
  NotificationRecipient,
  NotificationsListData,
  NotificationUnreadCountData,
  NotificationsQuery,
} from "@/types";

type NotificationsListResponseData =
  | NotificationRecipient[]
  | (Partial<ApiListData<NotificationRecipient>> & {
      notifications?: NotificationRecipient[];
      meta?: NotificationsListData["meta"];
    });

type NotificationResponseData =
  | NotificationRecipient
  | { notification: NotificationRecipient };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractNotifications(data: unknown): NotificationRecipient[] {
  if (Array.isArray(data)) return data as NotificationRecipient[];
  if (!isRecord(data)) return [];

  for (const key of ["notifications", "items", "data", "results", "rows"]) {
    const value = data[key];
    if (Array.isArray(value)) return value as NotificationRecipient[];
    if (isRecord(value)) {
      const nested = extractNotifications(value);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function extractMeta(
  data: NotificationsListResponseData,
): NotificationsListData["meta"] {
  if (Array.isArray(data)) return undefined;
  return data.meta ?? data.pagination;
}

function unwrapNotification(
  data: NotificationResponseData,
): NotificationRecipient {
  return "notification" in data ? data.notification : data;
}

export async function listNotifications(query: NotificationsQuery = {}) {
  const res = await apiClient.get<ApiResponse<NotificationsListResponseData>>(
    "/notifications",
    {
      params: compactParams({
        page: query.page,
        page_size: query.page_size,
        unread_only: query.unread_only,
        type: query.type,
      }),
    },
  );

  return {
    ...res.data,
    data: {
      notifications: extractNotifications(res.data.data),
      meta: extractMeta(res.data.data),
    },
  };
}

export async function getNotificationUnreadCount() {
  const res = await apiClient.get<ApiResponse<NotificationUnreadCountData>>(
    "/notifications/unread-count",
  );
  return res.data;
}

export async function markNotificationRead(notificationRecipientId: number) {
  const res = await apiClient.patch<ApiResponse<NotificationResponseData>>(
    `/notifications/${notificationRecipientId}/read`,
  );

  return {
    ...res.data,
    data: {
      notification: unwrapNotification(res.data.data),
    } satisfies MarkNotificationReadData,
  };
}

export async function markAllNotificationsRead() {
  const res = await apiClient.patch<ApiResponse<MarkAllNotificationsReadData>>(
    "/notifications/read-all",
  );
  return res.data;
}
