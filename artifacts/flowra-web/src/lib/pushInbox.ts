import './pushInboxStore.js';
import type { StoredPushNotification } from './pushInboxStore.js';
import type { NotificationRecipient } from '@/types';

export const pushInbox = globalThis.FlowraPushInbox;
export const PUSH_INBOX_CHANGED = 'flowra-notifications-changed';

export function notifyInboxChanged() {
  window.dispatchEvent(new Event(PUSH_INBOX_CHANGED));
  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(PUSH_INBOX_CHANGED);
    channel.postMessage(null);
    channel.close();
  }
}

export async function saveReceivedPush(payload: unknown, userId: number) {
  await pushInbox.save(payload, userId);
  notifyInboxChanged();
}

export function mergeInbox(
  remote: NotificationRecipient[],
  local: StoredPushNotification[],
  serverUnread: number,
  includeServerReceipts = false,
) {
  const matched = new Set<string>();
  let locallyReadServerItems = 0;
  const notifications: NotificationRecipient[] = remote.map((notification) => {
    const copies = local.filter((item) =>
      (item.recipientId && item.recipientId === String(notification.notification_recipient_id)) ||
      (item.notificationId && item.notificationId === String(notification.notification_id)) ||
      (item.messageId && item.messageId === notification.data?.message_id),
    );
    copies.forEach((item) => matched.add(item.id));
    const readAt = notification.read_at || copies.find((item) => item.read_at)?.read_at;
    if (!notification.read_at && readAt) locallyReadServerItems += 1;
    return { ...notification, read_at: readAt, local_push_ids: copies.map((item) => item.id) };
  });
  const pending = local.filter((item) => !matched.has(item.id) && (includeServerReceipts || !item.server_seen));
  for (const item of pending) {
    notifications.push({
      notification_recipient_id: 0,
      notification_id: 0,
      type: item.type,
      title: item.title,
      body: item.body,
      created_at: item.created_at,
      read_at: item.read_at,
      local_push_ids: [item.id],
      local_only: true,
    });
  }
  notifications.sort((a, b) => Date.parse(b.created_at || '') - Date.parse(a.created_at || ''));
  return {
    notifications,
    unreadCount: Math.max(0, serverUnread - locallyReadServerItems) + pending.filter((item) => !item.read_at).length,
  };
}
