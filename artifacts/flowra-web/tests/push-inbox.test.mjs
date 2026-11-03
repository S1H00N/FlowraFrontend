import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8');

async function setupWorker({ failClients = false, noClients = false, failStorage = false } = {}) {
  const messages = [[], []];
  const notifications = [];
  const saved = [];
  let receive;
  let ready;
  const initialized = new Promise((resolve) => { ready = resolve; });
  vm.runInNewContext(source, {
    URL, console, importScripts() {},
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    firebase: {
      initializeApp() {},
      messaging: () => ({ onBackgroundMessage(callback) { receive = callback; ready(); } }),
    },
    self: {
      FlowraPushInbox: { save: async (payload) => {
        if (failStorage) throw new Error('Storage blocked');
        saved.push(payload);
      } },
      location: { origin: 'https://flowra.example' },
      registration: {
        scope: 'https://flowra.example/',
        showNotification: async (...args) => { notifications.push(args); },
      },
      addEventListener() {},
      clients: {
        matchAll: async () => {
          if (failClients) throw new Error('Tab closed');
          if (noClients) return [];
          assert.equal(saved.length, failStorage ? 0 : 1);
          return messages.map((items) => ({ postMessage: (message) => items.push(message) }));
        },
      },
    },
  });
  await initialized;
  return { receive, messages, notifications, saved };
}

test('notification payload refreshes all tabs without duplicating the FCM OS notification', async () => {
  const worker = await setupWorker();
  await worker.receive({ notification: { title: 'Flowra 테스트 알림', body: '푸시 알림 수신 테스트입니다.' } });
  for (const messages of worker.messages) {
    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'flowra-notifications-changed');
    assert.deepEqual(Object.keys(messages[0]), ['type']);
  }
  assert.equal(worker.notifications.length, 0);
});

test('data payload refreshes inboxes and still shows an OS notification', async () => {
  const worker = await setupWorker();
  await worker.receive({ data: { title: '할 일 알림', body: '마감 시간입니다.' } });
  assert.equal(worker.messages[0].length, 1);
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.notifications[0][0], '할 일 알림');
  assert.equal(worker.notifications[0][1].body, '마감 시간입니다.');
});

test('a failed tab broadcast does not suppress the OS notification', async () => {
  const worker = await setupWorker({ failClients: true });
  await worker.receive({ data: { title: '알림' } });
  assert.equal(worker.notifications.length, 1);
});

test('background push is saved even with no application tabs open', async () => {
  const worker = await setupWorker({ noClients: true });
  const payload = { messageId: 'background-only', notification: { title: '닫힌 상태 수신' } };
  await worker.receive(payload);
  assert.deepEqual(worker.saved, [payload]);
});

test('a storage failure still displays data-message notifications and refreshes clients', async () => {
  const worker = await setupWorker({ failStorage: true });
  await worker.receive({ data: { title: '알림' } });
  assert.equal(worker.notifications.length, 1);
  assert.equal(worker.messages[0].length, 1);
});
// Test identity reconciliation without a browser; IndexedDB is covered by E2E.
const { createRequire } = await import('node:module');
const ts = createRequire(import.meta.url)('typescript');
const mergeModule = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(
  readFileSync(new URL('../src/lib/pushInbox.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)(() => ({}), mergeModule, mergeModule.exports);
const { mergeInbox } = mergeModule.exports;
const receipt = (overrides = {}) => ({
  userId: '9001', id: 'message:one', messageId: 'one', recipientId: null,
  notificationId: null, title: '알림', body: '본문', type: 'push',
  created_at: '2026-09-16T00:00:00Z', read_at: null, ...overrides,
});

test('server identity replaces a receipt and contributes only one unread item', () => {
  const server = { notification_recipient_id: 42, notification_id: 7, title: '알림', read_at: null };
  const result = mergeInbox([server], [receipt({ recipientId: '42' })], 1);
  assert.equal(result.notifications.length, 1);
  assert.equal(result.unreadCount, 1);
  assert.deepEqual(result.notifications[0].local_push_ids, ['message:one']);
});

test('equal text alone does not discard distinct notifications', () => {
  const server = { notification_recipient_id: 42, notification_id: 7, title: '알림', body: '본문' };
  const result = mergeInbox([server], [receipt()], 1);
  assert.equal(result.notifications.length, 2);
  assert.equal(result.unreadCount, 2);
});

test('previously reconciled receipts do not reappear outside the server page', () => {
  const result = mergeInbox([], [receipt({ server_seen: true })], 0);
  assert.equal(result.notifications.length, 0);
  assert.equal(result.unreadCount, 0);
});

test('local read state survives a delayed server record and adjusts the unread count', () => {
  const server = { notification_recipient_id: 42, notification_id: 7, title: '알림', read_at: null };
  const result = mergeInbox([server], [receipt({ recipientId: '42', read_at: '2026-09-16T01:00:00Z' })], 1);
  assert.equal(result.notifications[0].read_at, '2026-09-16T01:00:00Z');
  assert.equal(result.unreadCount, 0);
});

test('server outages can still show previously reconciled browser receipts', () => {
  const result = mergeInbox([], [receipt({ server_seen: true })], 0, true);
  assert.equal(result.notifications.length, 1);
  assert.equal(result.unreadCount, 1);
});

test('deleted receipts stay hidden, including when the server copy arrives later', () => {
  const deleted = receipt({ recipientId: '42', deleted_at: '2026-09-16T02:00:00Z' });
  assert.equal(mergeInbox([], [deleted], 0).notifications.length, 0);
  const server = { notification_recipient_id: 42, notification_id: 7, title: '알림', read_at: null };
  const result = mergeInbox([server], [deleted], 1);
  assert.equal(result.notifications.length, 0);
  assert.equal(result.unreadCount, 0);
});

test('deleting one item retains other notifications and their unread counts', () => {
  const deleted = receipt({ recipientId: '42', deleted_at: '2026-09-16T02:00:00Z', read_at: '2026-09-16T01:00:00Z' });
  const server = [
    { notification_recipient_id: 42, notification_id: 7, title: '알림', read_at: null },
    { notification_recipient_id: 43, notification_id: 8, title: '새 알림', read_at: null },
  ];
  const result = mergeInbox(server, [deleted, receipt({ id: 'message:new', messageId: 'new' })], 2);
  assert.equal(result.notifications.length, 2);
  assert.equal(result.unreadCount, 2);
});

function inboxHooksHarness({ holdInitialList = false, readFailure = false, holdRead = false } = {}) {
  const { QueryClient, QueryObserver } = createRequire(import.meta.url)('@tanstack/react-query');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let userId = 9001;
  let stored = [receipt()];
  let calls = 0;
  let releaseInitial;
  const held = new Promise((resolve) => { releaseInitial = resolve; });
  let releaseRead, readStarted;
  const readHeld = new Promise((resolve) => { releaseRead = resolve; });
  const reading = new Promise((resolve) => { readStarted = resolve; });
  const dependencies = {
    '@tanstack/react-query': {
      useQuery: (options) => options,
      useMutation: (options) => options,
      useQueryClient: () => queryClient,
    },
    '@/api/notifications': {
      listNotifications: async () => {
        if (++calls === 1 && holdInitialList) await held;
        throw new Error('503');
      },
      getNotificationUnreadCount: async () => { throw new Error('503'); },
      markNotificationRead: async () => ({ success: true }),
      markAllNotificationsRead: async () => {
        if (readFailure) throw new Error('503');
        return { success: true };
      },
    },
    '@/contexts/AuthContext': { useAuth: () => ({ user: { user_id: 9001 }, isAuthenticated: true }) },
    '@/lib/auth-storage': { authStorage: { getAccessToken: () => 'qa-token', getUser: () => ({ user_id: userId }) } },
    '@/lib/pushInbox': {
      mergeInbox,
      notifyInboxChanged() {},
      pushInbox: {
        list: async () => structuredClone(stored),
        markRead: async (_owner, ids) => {
          readStarted();
          if (holdRead) await readHeld;
          stored = stored.map((item) => ids.includes(item.id) ? { ...item, read_at: '2026-09-16T01:00:00Z' } : item);
        },
        reconcile: async () => {},
        remove: async (_owner, ids) => {
          stored = stored.map((item) => ids.includes(item.id) ? { ...item, deleted_at: '2026-09-16T01:00:00Z' } : item);
        },
      },
    },
    '@/lib/toast': { toast: { info() {} } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(
    readFileSync(new URL('../src/hooks/useNotifications.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  const hooks = module.exports;
  const bell = new QueryObserver(queryClient, hooks.useNotificationUnreadCount());
  const inbox = new QueryObserver(queryClient, hooks.useNotifications({ all_pages: true }));
  const unsubscribeBell = bell.subscribe(() => {});
  const unsubscribeInbox = inbox.subscribe(() => {});
  return {
    hooks, bell, inbox, queryClient,
    releaseInitial, releaseRead, reading,
    switchUser: () => { userId = 9002; },
    async ready() {
      await queryClient.fetchQuery(hooks.useNotifications({ all_pages: true }));
    },
    async mutate(options, variables) {
      const context = await options.onMutate?.(variables);
      let data, error;
      try {
        data = await options.mutationFn(variables);
        await options.onSuccess?.(data, variables, context);
      } catch (failure) {
        error = failure;
      }
      await options.onSettled?.(data, error, variables, context);
      if (error) throw error;
    },
    close() {
      releaseInitial();
      releaseRead();
      unsubscribeBell(); unsubscribeInbox();
      bell.destroy(); inbox.destroy(); queryClient.clear();
    },
  };
}

test('reading a browser receipt cancels a late initial bell snapshot and synchronizes both inbox keys', async () => {
  const harness = inboxHooksHarness({ holdInitialList: true });
  try {
    await harness.ready();
    const item = harness.inbox.getCurrentResult().data.notifications[0];
    assert.equal(harness.inbox.getCurrentResult().data.unreadCount, 1);
    await harness.mutate(harness.hooks.useMarkNotificationRead(), item);
    harness.releaseInitial();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.bell.getCurrentResult().data.unreadCount, 0);
    assert.equal(harness.inbox.getCurrentResult().data.unreadCount, 0);
    assert.ok(harness.bell.getCurrentResult().data.notifications[0].read_at);
  } finally { harness.close(); }
});

test('read-all retains completed local reads when the server update fails during an initial bell read', async () => {
  const harness = inboxHooksHarness({ holdInitialList: true, readFailure: true });
  try {
    await harness.ready();
    await assert.rejects(harness.mutate(harness.hooks.useMarkAllNotificationsRead()), /503/);
    harness.releaseInitial();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.bell.getCurrentResult().data.unreadCount, 0);
    assert.equal(harness.inbox.getCurrentResult().data.unreadCount, 0);
  } finally { harness.close(); }
});

test('deleting a browser receipt cannot be undone by an initial bell snapshot', async () => {
  const harness = inboxHooksHarness({ holdInitialList: true });
  try {
    await harness.ready();
    const item = harness.inbox.getCurrentResult().data.notifications[0];
    await harness.mutate(harness.hooks.useDeleteNotifications(), item);
    harness.releaseInitial();
    await new Promise((resolve) => setImmediate(resolve));
    for (const observer of [harness.bell, harness.inbox]) {
      assert.equal(observer.getCurrentResult().data.unreadCount, 0);
      assert.deepEqual(observer.getCurrentResult().data.notifications, []);
    }
  } finally { harness.close(); }
});

test('a late read from a previous account does not patch or refresh the new account inbox', async () => {
  const harness = inboxHooksHarness({ holdRead: true });
  try {
    await harness.ready();
    const nextKey = ['notifications', 9002, 'inbox'];
    const nextSnapshot = { notifications: [], unreadCount: 7, serverUnread: 7, serverUnavailable: false };
    harness.queryClient.setQueryData(nextKey, nextSnapshot);
    const pending = harness.mutate(harness.hooks.useMarkNotificationRead(),
      harness.inbox.getCurrentResult().data.notifications[0]);
    await harness.reading;
    harness.switchUser();
    harness.releaseRead();
    await assert.rejects(pending, /로그인 정보가 변경되었습니다/);
    assert.deepEqual(harness.queryClient.getQueryData(nextKey), nextSnapshot);
    assert.equal(harness.queryClient.getQueryState(nextKey).isInvalidated, false);
  } finally { harness.close(); }
});
