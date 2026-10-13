export interface NotificationRecipient {
  /** Browser receipt IDs associated with this item; never sent to the server. */
  local_push_ids?: string[];
  local_only?: boolean;
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

export interface NotificationReadRecipient {
  notification_recipient_id: number;
  notification_id: number;
  read_at?: string | null;
  push_sent_at?: string | null;
  push_status?: string | null;
  created_at?: string;
  notification: Pick<NotificationRecipient, "notification_id" | "type" | "title" | "body" | "data" | "created_at">;
}

export interface NotificationsPagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface NotificationsQuery {
  /** Client inbox option; not an API parameter. */
  all_pages?: boolean;
  page?: number;
  page_size?: number;
  unread_only?: boolean;
  type?: string;
}

export interface NotificationsListData {
  notifications: NotificationRecipient[];
  meta?: NotificationsPagination;
}

export interface NotificationUnreadCountData {
  unread_count: number;
}

export interface MarkNotificationReadData {
  notification: NotificationReadRecipient | NotificationRecipient;
}

export interface MarkAllNotificationsReadData {
  updated_count: number;
}
