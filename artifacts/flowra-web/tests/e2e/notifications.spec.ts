import type {} from "../../src/lib/pushInboxStore.js";
import { test, expect } from '@playwright/test';
import { installMockApi, seedAuth, QA_NOW } from './fixtures';
import type { NotificationRecipient } from '../../src/types';

for (const trigger of ['background push', 'window focus', 'reopen inbox'] as const) {
  test(`inbox refreshes after ${trigger} and preserves server read state`, async ({ page }) => {
    const mockApi = await installMockApi(page);
    await seedAuth(page);
    const notifications: NotificationRecipient[] = [];
    await page.route('**/api/v1/notifications**', async (route) => {
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,PATCH,OPTIONS',
        'access-control-allow-headers': '*',
      };
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers });
      }
      const path = new URL(route.request().url()).pathname;
      let data: unknown;
      if (path.endsWith('/unread-count')) {
        data = { unread_count: notifications.filter((item) => !item.read_at).length };
      } else if (path.endsWith('/read-all')) {
        notifications.forEach((item) => { item.read_at = QA_NOW; });
        data = { updated_count: notifications.length };
      } else if (path.endsWith('/read')) {
        const id = Number(path.split('/').at(-2));
        const notification = notifications.find((item) => item.notification_recipient_id === id)!;
        notification.read_at = QA_NOW;
        data = { notification };
      } else {
        data = { notifications };
      }
      await route.fulfill({
        headers,
        json: { success: true, data },
      });
    });

    await page.goto('/tasks');
    const bell = page.getByRole('button', { name: '알림', exact: true });
    await bell.click();
    await expect(page.getByText('새 알림이 없습니다.', { exact: true })).toBeVisible();
    if (trigger === 'reopen inbox') await page.keyboard.press('Escape');
    notifications.push({
      notification_recipient_id: 42, notification_id: 7, type: 'test',
      title: 'Flowra 테스트 알림', body: '푸시 알림 수신 테스트입니다.',
      created_at: QA_NOW, read_at: null,
    });

    if (trigger === 'background push') {
      await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
        data: { type: 'flowra-notifications-changed' },
      })));
    } else if (trigger === 'window focus') {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    } else {
      await bell.click();
    }
    await expect(page.getByText('Flowra 테스트 알림', { exact: true })).toBeVisible();
    await expect(bell).toContainText('1');
    await page.getByRole('button', { name: /Flowra 테스트 알림/ }).click();
    await expect(page.getByRole('button', { name: '모두 읽음', exact: true })).toBeDisabled();
    await page.reload();
    await bell.click();
    await expect(page.getByText('Flowra 테스트 알림', { exact: true })).toBeVisible();
    await expect(bell).not.toContainText('1');
    expect(mockApi.unhandled).toEqual([]);
  });
}

// Exercise the same IndexedDB store used by foreground reception and the worker.
async function receivePush(page: import('@playwright/test').Page, messageId: string, data: Record<string, string> = {}) {
  await page.evaluate(async ({ messageId, data }) => {
    await globalThis.FlowraPushInbox.save({
      messageId,
      notification: { title: '수신함 보관 테스트', body: '푸시로 받은 내용을 다시 확인합니다.' },
      data,
    }, 9001);
    window.dispatchEvent(new Event('flowra-notifications-changed'));
  }, { messageId, data });
}

async function enableReceiptStorage(page: import('@playwright/test').Page) {
  await seedAuth(page);
  await page.addInitScript(() => localStorage.setItem('flowra_browser_push_enabled', 'true'));
  await page.goto('/tasks');
  await expect(page.getByRole('button', { name: '알림', exact: true })).toBeVisible();
  // Owner binding is asynchronous; wait for it without altering the app's binding.
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open('flowra-push-inbox', 1);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('state').objectStore('state').get('owner');
        read.onsuccess = () => { resolve(read.result); db.close(); };
      };
    });
  })).toBe('9001');
}

test('push-only receipts survive reload, deduplicate deliveries, and support read-all', async ({ page }) => {
  const mockApi = await installMockApi(page);
  await enableReceiptStorage(page);
  const bell = page.getByRole('button', { name: '알림', exact: true });
  await bell.click();
  await expect(page.getByText('새 알림이 없습니다.', { exact: true })).toBeVisible();
  await receivePush(page, 'push-only-1');
  await receivePush(page, 'push-only-1');
  await expect(page.getByText('수신함 보관 테스트', { exact: true })).toHaveCount(1);
  await expect(bell).toContainText('1');
  await page.getByRole('button', { name: /수신함 보관 테스트/ }).click();
  await receivePush(page, 'push-only-1');
  await expect(bell).not.toContainText('1');
  await page.reload();
  await bell.click();
  await expect(page.getByText('수신함 보관 테스트', { exact: true })).toBeVisible();
  await expect(bell).not.toContainText('1');
  await receivePush(page, 'push-only-2');
  await expect(bell).toContainText('1');
  await page.getByRole('button', { name: '모두 읽음', exact: true }).click();
  await expect(bell).not.toContainText('1');
  await page.reload();
  await bell.click();
  await expect(page.getByText('수신함 보관 테스트', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: '모두 읽음', exact: true })).toBeDisabled();
  expect(mockApi.requests.filter((request) => request.method === 'PATCH' && request.path.startsWith('/notifications'))).toEqual([]);
  expect(mockApi.unhandled).toEqual([]);
});

test('a received push remains readable when the notification API is unavailable', async ({ page }) => {
  await installMockApi(page, { failures: { '/notifications': 503, '/notifications/unread-count': 503 } });
  await enableReceiptStorage(page);
  await receivePush(page, 'offline-inbox');
  await page.getByRole('button', { name: '알림', exact: true }).click();
  await expect(page.getByText('수신함 보관 테스트', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '일부 알림을 불러오지 못했습니다.' })).toBeVisible();
  await page.getByRole('button', { name: /수신함 보관 테스트/ }).click();
  await expect(page.getByRole('button', { name: '모두 읽음', exact: true })).toBeDisabled();
});

test('stored receipts are isolated between accounts and ignored after logout', async ({ page }) => {
  await installMockApi(page);
  await enableReceiptStorage(page);
  await receivePush(page, 'account-one');
  await page.evaluate(async () => {
    const user = JSON.parse(localStorage.getItem('auth_user')!);
    localStorage.setItem('auth_user', JSON.stringify({ ...user, user_id: 9002 }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'auth_user' }));
  });
  const bell = page.getByRole('button', { name: '알림', exact: true });
  await bell.click();
  await expect(page.getByText('새 알림이 없습니다.', { exact: true })).toBeVisible();
  await expect(bell).not.toContainText('1');
  await page.evaluate(async () => {
    await globalThis.FlowraPushInbox.setOwner(null);
    await globalThis.FlowraPushInbox.save({ messageId: 'signed-out', notification: { title: '숨겨진 알림' } });
    await globalThis.FlowraPushInbox.setOwner(9002);
    await globalThis.FlowraPushInbox.save({ messageId: 'wrong-user', notification: { title: '숨겨진 알림' }, data: { user_id: '9001' } });
  });
  expect(await page.evaluate(() => globalThis.FlowraPushInbox.list(9002))).toEqual([]);
  expect(await page.evaluate(async () => (await globalThis.FlowraPushInbox.list(9001)).length)).toBe(1);
});

test('a delayed server copy replaces a read receipt without resetting it to unread', async ({ page }) => {
  await installMockApi(page);
  const notifications: NotificationRecipient[] = [];
  let readRequests = 0;
  await page.route('**/api/v1/notifications**', async (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,PATCH,OPTIONS', 'access-control-allow-headers': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path.endsWith('/unread-count')) {
      data = { unread_count: notifications.filter((item) => !item.read_at).length };
    } else if (path.endsWith('/read')) {
      readRequests += 1;
      notifications[0].read_at = QA_NOW;
      data = { notification: notifications[0] };
    } else {
      data = { notifications };
    }
    await route.fulfill({ headers, json: { success: true, data } });
  });
  await enableReceiptStorage(page);
  await receivePush(page, 'delayed-server', { notification_recipient_id: '42', notification_id: '7' });
  const bell = page.getByRole('button', { name: '알림', exact: true });
  await bell.click();
  await page.getByRole('button', { name: /수신함 보관 테스트/ }).click();
  await expect(bell).not.toContainText('1');
  notifications.push({ notification_recipient_id: 42, notification_id: 7, type: 'push',
    title: '수신함 보관 테스트', body: '푸시로 받은 내용을 다시 확인합니다.', created_at: QA_NOW, read_at: null });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => readRequests).toBe(1);
  await expect(page.getByText('수신함 보관 테스트', { exact: true })).toHaveCount(1);
  await expect(bell).not.toContainText('1');
  await page.reload();
  await bell.click();
  await expect(page.getByText('수신함 보관 테스트', { exact: true })).toHaveCount(1);
  await expect(bell).not.toContainText('1');
  expect(readRequests).toBe(1);
});
