export interface StoredPushNotification {
  server_seen?: boolean;
  userId: string;
  id: string;
  recipientId: string | null;
  notificationId: string | null;
  messageId: string;
  title: string;
  body: string;
  type: string;
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
  };
}
