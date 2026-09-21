// Shared by the app and the classic Firebase service worker. Vite emits this file
// unchanged as push-inbox-store.js so both contexts use the same transactions.
(() => {
  let database;
  function open() {
    if (!database) {
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open('flowra-push-inbox', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('messages', { keyPath: ['userId', 'id'] });
          request.result.createObjectStore('state');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch((error) => { database = null; throw error; });
    }
    return database;
  }
  async function transaction(stores, mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Inbox storage failed'));
      operation(tx, (value) => { result = value; });
    });
  }
  const text = (value) => typeof value === 'string' ? value : '';
  const identifier = (value) => {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
    return typeof value === 'string' && /^[1-9]\d*$/.test(value) ? value : null;
  };
  async function setOwner(userId) {
    return transaction(['state'], 'readwrite', (tx) => {
      tx.objectStore('state').put(userId == null ? null : String(userId), 'owner');
    });
  }
  async function save(payload, expectedUserId) {
    const data = payload?.data || {};
    const title = text(payload?.notification?.title) || text(data.title);
    const body = text(payload?.notification?.body) || text(data.body) || text(data.message);
    if (!title && !body) return;
    return transaction(['messages', 'state'], 'readwrite', (tx, done) => {
      const ownerRequest = tx.objectStore('state').get('owner');
      ownerRequest.onsuccess = () => {
        const userId = ownerRequest.result;
        if (!userId || (expectedUserId != null && userId !== String(expectedUserId))) return;
        if (data.user_id != null && String(data.user_id) !== userId) return;
        const recipientId = identifier(data.notification_recipient_id);
        const notificationId = identifier(data.notification_id);
        const messageId = text(payload.messageId) || text(payload.fcmMessageId);
        const id = recipientId ? `recipient:${recipientId}`
          : notificationId ? `notification:${notificationId}`
          : messageId ? `message:${messageId}` : `message:${crypto.randomUUID()}`;
        const store = tx.objectStore('messages');
        const existing = store.get([userId, id]);
        existing.onsuccess = () => {
          if (existing.result) { done(existing.result); return; }
          const record = {
            userId, id, recipientId, notificationId, messageId,
            title: title || 'Flowra', body, type: text(data.type) || 'push',
            data: Object.fromEntries([
              'target_type', 'resource_type', 'entity_type', 'category',
              'project_id', 'project_work_item_id', 'task_id', 'schedule_id', 'notice_id',
              'project_name', 'project_title', 'work_item_title', 'task_title',
              'target_title', 'schedule_title', 'notice_title',
              'start_datetime', 'schedule_start_datetime',
            ].filter((key) => typeof data[key] === 'string' || typeof data[key] === 'number')
              .map((key) => [key, data[key]])),
            created_at: new Date().toISOString(), read_at: null,
          };
          store.put(record);
          done(record);
        };
      };
    });
  }
  async function list(userId) {
    if (userId == null) return [];
    return transaction(['messages'], 'readonly', (tx, done) => {
      const request = tx.objectStore('messages').getAll(
        IDBKeyRange.bound([String(userId), ''], [String(userId), '\uffff']),
      );
      request.onsuccess = () => done(request.result);
    });
  }
  async function markRead(userId, ids) {
    return transaction(['messages'], 'readwrite', (tx) => {
      const store = tx.objectStore('messages');
      for (const id of ids) {
        const request = store.get([String(userId), id]);
        request.onsuccess = () => {
          if (request.result && !request.result.read_at) {
            store.put({ ...request.result, read_at: new Date().toISOString() });
          }
        };
      }
    });
  }
  async function reconcile(userId, ids) {
    return transaction(['messages'], 'readwrite', (tx) => {
      const store = tx.objectStore('messages');
      for (const id of ids) {
        const request = store.get([String(userId), id]);
        request.onsuccess = () => {
          if (request.result && !request.result.server_seen) {
            store.put({ ...request.result, server_seen: true });
          }
        };
      }
    });
  }
  async function remove(userId, localIds, remoteItems = []) {
    return transaction(['messages'], 'readwrite', (tx) => {
      const store = tx.objectStore('messages');
      const ids = new Set(localIds);
      const deletedAt = new Date().toISOString();
      // Retain identifiers only, so redelivery and server refetch cannot restore content.
      const tombstone = (record) => {
        const { data, ...identifiers } = record;
        return { ...identifiers, title: '', body: '', deleted_at: deletedAt };
      };
      const request = store.getAll(IDBKeyRange.bound([String(userId), ''], [String(userId), '\uffff']));
      request.onsuccess = () => {
        for (const record of request.result) {
          if (ids.has(record.id) || remoteItems.some((item) =>
            (record.recipientId && record.recipientId === String(item.notification_recipient_id)) ||
            (record.notificationId && record.notificationId === String(item.notification_id)) ||
            (record.messageId && record.messageId === item.data?.message_id))) {
            store.put(tombstone(record));
          }
        }
        for (const item of remoteItems) {
          const recipientId = String(item.notification_recipient_id);
          store.put(tombstone({
            userId: String(userId), id: `recipient:${recipientId}`, recipientId,
            notificationId: String(item.notification_id),
            messageId: text(item.data?.message_id), type: item.type,
            created_at: item.created_at || deletedAt, read_at: item.read_at || null,
            server_seen: true,
          }));
        }
      };
    });
  }
  globalThis.FlowraPushInbox = { setOwner, save, list, markRead, reconcile, remove };
})();
