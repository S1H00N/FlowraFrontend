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
