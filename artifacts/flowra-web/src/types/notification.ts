import type { Pagination } from "./api";

export interface NotificationRecipient {
  notification_recipient_id: number;
  notification_id: number;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown> | null;
  read_at?: string | null;
  push_sent_at?: string | null;
  push_status?: string | null;
  created_at?: string;
}

export interface NotificationsQuery {
  page?: number;
  page_size?: number;
  unread_only?: boolean;
  type?: string;
}

export interface NotificationsListData {
  notifications: NotificationRecipient[];
  meta?: Pagination | Record<string, unknown>;
}

export interface NotificationUnreadCountData {
  unread_count: number;
}

export interface MarkNotificationReadData {
  notification: NotificationRecipient;
}

export interface MarkAllNotificationsReadData {
  updated_count: number;
}
