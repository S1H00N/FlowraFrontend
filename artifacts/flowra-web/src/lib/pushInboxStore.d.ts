import type { NotificationRecipient } from '@/types';

export interface StoredPushNotification {
  deleted_at?: string;
  server_seen?: boolean;
  userId: string;
  id: string;
  recipientId: string | null;
  notificationId: string | null;
  messageId: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
}

declare global {
  var FlowraPushInbox: {
    setOwner(userId: string | number | null): Promise<void>;
    save(payload: unknown, expectedUserId?: string | number): Promise<StoredPushNotification | undefined>;
    list(userId: string | number | null): Promise<StoredPushNotification[]>;
    reconcile(userId: string | number, ids: string[]): Promise<void>;
    markRead(userId: string | number, ids: string[]): Promise<void>;
    remove(userId: string | number, localIds: string[], remoteItems?: NotificationRecipient[]): Promise<void>;
  };
}
