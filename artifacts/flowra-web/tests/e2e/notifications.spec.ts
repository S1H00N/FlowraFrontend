import type {} from "../../src/lib/pushInboxStore.js";
import { test, expect } from '@playwright/test';
import { installMockApi, seedAuth, QA_NOW } from './fixtures';
import type { NotificationRecipient } from '../../src/types';

async function clickInboxAction(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: '알림 더보기' }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

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
    await page.getByRole('button', { name: '알림 읽기: Flowra 테스트 알림', exact: true }).click();
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
  await page.getByRole('button', { name: '알림 읽기: 수신함 보관 테스트', exact: true }).click();
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
  await page.getByRole('button', { name: '알림 읽기: 수신함 보관 테스트', exact: true }).click();
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
  await page.getByRole('button', { name: '알림 읽기: 수신함 보관 테스트', exact: true }).click();
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

test('deleting a receipt persists across reload and redelivery, and clear-all can be cancelled', async ({ page }) => {
  const mockApi = await installMockApi(page);
  await enableReceiptStorage(page);
  await receivePush(page, 'delete-one');
  await page.getByRole('button', { name: '알림', exact: true }).click();
  await page.getByRole('button', { name: '알림 삭제: 수신함 보관 테스트', exact: true }).click();
  await expect(page.getByText('새 알림이 없습니다.', { exact: true })).toBeVisible();
  await receivePush(page, 'delete-one');
  await page.reload();
  await page.getByRole('button', { name: '알림', exact: true }).click();
  await expect(page.getByText('새 알림이 없습니다.', { exact: true })).toBeVisible();
  await receivePush(page, 'delete-two');
  page.once('dialog', (dialog) => dialog.dismiss());
  await clickInboxAction(page, '전체 삭제');
  await expect(page.getByText('수신함 보관 테스트', { exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await clickInboxAction(page, '전체 삭제');
  await expect(page.getByText('새 알림이 없습니다.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '알림 더보기' }).click();
  await expect(page.getByRole('menuitem', { name: '전체 삭제', exact: true })).toBeDisabled();
  const records = await page.evaluate(() => globalThis.FlowraPushInbox.list(9001));
  expect(records.every((item) => item.deleted_at && !item.title && !item.body)).toBe(true);
  expect(mockApi.unhandled).toEqual([]);
});

test('deleting server notifications covers all pages and preserves a new receipt arriving during clear-all', async ({ page }) => {
  await installMockApi(page);
  const notifications: NotificationRecipient[] = Array.from({ length: 105 }, (_, index) => ({
    notification_recipient_id: index + 1, notification_id: index + 1000,
    type: 'test', title: `서버 알림 ${index + 1}`, read_at: null, created_at: QA_NOW,
  }));
  const writes: string[] = [];
  let holdPageTwo = false;
  let pageTwoPending = false;
  let releasePageTwo!: () => void;
  const pageTwoGate = new Promise<void>((resolve) => { releasePageTwo = resolve; });
  await page.route('**/api/v1/notifications**', async (route) => {
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*' };
    if (route.request().method() !== 'GET') writes.push(route.request().method());
    if (url.pathname.endsWith('/unread-count')) {
      return route.fulfill({ headers, json: { success: true, data: { unread_count: 105 } } });
    }
    const pageNumber = Number(url.searchParams.get('page') || 1);
    if (holdPageTwo && pageNumber === 2) { pageTwoPending = true; await pageTwoGate; }
    return route.fulfill({ headers, json: { success: true,
      data: { notifications: notifications.slice((pageNumber - 1) * 100, pageNumber * 100) },
    } });
  });
  await enableReceiptStorage(page);
  const bell = page.getByRole('button', { name: '알림', exact: true });
  await bell.click();
  await page.getByRole('button', { name: '알림 삭제: 서버 알림 1', exact: true }).click();
  await expect(page.getByText('서버 알림 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('읽지 않은 알림 104개', { exact: true })).toBeVisible();
  await page.reload();
  await bell.click();
  await expect(page.getByText('서버 알림 1', { exact: true })).toHaveCount(0);
  await expect(page.getByText('읽지 않은 알림 104개', { exact: true })).toBeVisible();
  holdPageTwo = true;
  page.once('dialog', (dialog) => dialog.accept());
  await clickInboxAction(page, '전체 삭제');
  await expect.poll(() => pageTwoPending).toBe(true);
  await receivePush(page, 'arrived-during-delete');
  releasePageTwo();
  await expect(page.getByRole('button', { name: /^알림 읽기: 서버 알림/ })).toHaveCount(0);
  await expect(page.getByText('수신함 보관 테스트', { exact: true })).toBeVisible();
  await expect(bell).toHaveText('1');
  await page.reload();
  await bell.click();
  await expect(page.getByRole('button', { name: /^알림 읽기:/ })).toHaveCount(1);
  await expect(bell).toHaveText('1');
  expect(writes).toEqual([]);
});

test('a failed deletion keeps the receipt visible and leaves other accounts untouched', async ({ page }) => {
  await installMockApi(page);
  await enableReceiptStorage(page);
  await receivePush(page, 'kept-on-failure');
  await page.evaluate(async () => {
    await globalThis.FlowraPushInbox.setOwner(9002);
    await globalThis.FlowraPushInbox.save({ messageId: 'other-account', notification: { title: '다른 계정 알림' } });
    await globalThis.FlowraPushInbox.setOwner(9001);
    const remove = globalThis.FlowraPushInbox.remove;
    globalThis.FlowraPushInbox.remove = async () => {
      globalThis.FlowraPushInbox.remove = remove;
      throw new Error('테스트 저장 오류');
    };
  });
  await page.getByRole('button', { name: '알림', exact: true }).click();
  const remove = page.getByRole('button', { name: '알림 삭제: 수신함 보관 테스트', exact: true });
  await remove.click();
  await expect(page.getByText('테스트 저장 오류', { exact: true })).toBeVisible();
  await expect(page.getByText('수신함 보관 테스트', { exact: true })).toBeVisible();
  await remove.click();
  await expect(page.getByText('새 알림이 없습니다.', { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await globalThis.FlowraPushInbox.list(9002)).filter((item) => !item.deleted_at).length)).toBe(1);
});

for (const offline of [false, true]) {
  test(`read-only deletion preserves unread receipts and survives reload${offline ? ' when offline' : ''}`, async ({ page }) => {
    const mockApi = await installMockApi(page, offline
      ? { failures: { '/notifications': 503, '/notifications/unread-count': 503 } } : {});
    await enableReceiptStorage(page);
    await receivePush(page, 'read-to-delete');
    const bell = page.getByRole('button', { name: '알림', exact: true });
    await bell.click();
    await page.getByRole('button', { name: '알림 읽기: 수신함 보관 테스트', exact: true }).click();
    await expect(bell).not.toHaveText('1');
    await receivePush(page, 'unread-kept-1');
    await receivePush(page, 'unread-kept-2');
    await expect(bell).toHaveText('2');
    await page.getByRole('button', { name: '알림 더보기' }).click();
    const clearRead = page.getByRole('menuitem', { name: '읽은 알림 삭제', exact: true });
    await expect(clearRead).toBeInViewport();
    await clearRead.click();
    await expect(page.getByRole('button', { name: '알림 읽기: 수신함 보관 테스트', exact: true })).toHaveCount(2);
    await expect(bell).toHaveText('2');
    await receivePush(page, 'read-to-delete');
    await page.reload();
    await bell.click();
    await expect(page.getByRole('button', { name: '알림 읽기: 수신함 보관 테스트', exact: true })).toHaveCount(2);
    await expect(bell).toHaveText('2');
    await clickInboxAction(page, '읽은 알림 삭제');
    await expect(page.getByText('삭제할 읽은 알림이 없습니다.', { exact: true })).toBeVisible();
    await expect(bell).toHaveText('2');
    const records = await page.evaluate(() => globalThis.FlowraPushInbox.list(9001));
    expect(records.find((item) => item.messageId === 'read-to-delete')?.deleted_at).toBeTruthy();
    expect(records.filter((item) => !item.deleted_at).every((item) => !item.read_at)).toBe(true);
    expect(mockApi.unhandled).toEqual([]);
  });
}

test('read-only deletion finds older read server items beyond 100 unread notifications', async ({ page }) => {
  await installMockApi(page);
  const notifications: NotificationRecipient[] = Array.from({ length: 105 }, (_, index) => ({
    notification_recipient_id: index + 1, notification_id: index + 1000,
    type: 'test', title: `서버 알림 ${index + 1}`, read_at: index < 100 ? null : QA_NOW, created_at: QA_NOW,
  }));
  const pages: number[] = [];
  await page.route('**/api/v1/notifications**', async (route) => {
    expect(route.request().method()).toBe('GET');
    const url = new URL(route.request().url());
    const headers = { 'access-control-allow-origin': '*' };
    if (url.pathname.endsWith('/unread-count')) {
      return route.fulfill({ headers, json: { success: true, data: { unread_count: 100 } } });
    }
    const pageNumber = Number(url.searchParams.get('page') || 1);
    pages.push(pageNumber);
    return route.fulfill({ headers, json: { success: true,
      data: { notifications: notifications.slice((pageNumber - 1) * 100, pageNumber * 100) },
    } });
  });
  await enableReceiptStorage(page);
  await page.getByRole('button', { name: '알림', exact: true }).click();
  await expect(page.getByText('읽지 않은 알림 100개', { exact: true })).toBeVisible();
  await clickInboxAction(page, '읽은 알림 삭제');
  await expect.poll(() => page.evaluate(async () =>
    (await globalThis.FlowraPushInbox.list(9001)).filter((item) => item.deleted_at).length,
  )).toBe(5);
  await expect(page.getByRole('button', { name: /^알림 읽기: 서버 알림/ })).toHaveCount(100);
  await expect(page.getByText('읽지 않은 알림 100개', { exact: true })).toBeVisible();
  expect(pages).toContain(2);
  await page.reload();
  await page.getByRole('button', { name: '알림', exact: true }).click();
  await expect(page.getByRole('button', { name: /^알림 읽기: 서버 알림/ })).toHaveCount(100);
  await expect(page.getByText('읽지 않은 알림 100개', { exact: true })).toBeVisible();
});

test('category tabs, context, selection actions, and the full inbox work together', async ({ page }) => {
  await installMockApi(page);
  await enableReceiptStorage(page);
  await page.evaluate(async () => {
    const messages = [
      { id: 'project', title: '새로운 업무가 배정되었습니다.', data: { target_type: 'project_work_item', project_name: 'A 프로젝트', work_item_title: 'API 연동' } },
      { id: 'schedule', title: '회의가 30분 후 시작됩니다.', data: { target_type: 'schedule', schedule_title: '주간 개발 회의' } },
      { id: 'notice', title: '새로운 공지사항이 등록되었습니다.', data: { type: 'announcement' } },
      { id: 'task', title: '할 일 마감 알림', data: { target_type: 'task' } },
      { id: 'general', title: '일반 테스트 알림', data: {} },
    ];
    for (const message of messages) {
      await globalThis.FlowraPushInbox.save({ messageId: message.id, notification: { title: message.title }, data: message.data }, 9001);
    }
    await globalThis.FlowraPushInbox.markRead(9001, ['message:notice']);
    window.dispatchEvent(new Event('flowra-notifications-changed'));
  });
  const bell = page.getByRole('button', { name: '알림', exact: true });
  await bell.click();
  await expect(page.getByText('읽지 않은 알림 4개', { exact: true })).toBeVisible();
  await expect(page.getByText('A 프로젝트 · API 연동', { exact: true })).toBeVisible();
  await expect(page.getByText('주간 개발 회의', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '전체 알림 보기' })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('notification-popover.png') });
  for (const [category, title] of [
    ['프로젝트', '새로운 업무가 배정되었습니다.'], ['일정', '회의가 30분 후 시작됩니다.'],
    ['할 일', '할 일 마감 알림'], ['공지', '새로운 공지사항이 등록되었습니다.'],
  ]) {
    await page.getByRole('tab', { name: category, exact: true }).click();
    await expect(page.getByRole('button', { name: /^알림 읽기:/ })).toHaveCount(1);
    await expect(page.getByRole('button', { name: `알림 읽기: ${title}`, exact: true })).toBeVisible();
  }
  await page.getByRole('tab', { name: '전체', exact: true }).click();
  await expect(page.getByRole('button', { name: /^알림 읽기:/ })).toHaveCount(5);
  await page.getByRole('button', { name: '선택 관리', exact: true }).click();
  await page.getByRole('checkbox', { name: '알림 선택: 새로운 업무가 배정되었습니다.', exact: true }).check();
  await page.getByRole('checkbox', { name: '알림 선택: 회의가 30분 후 시작됩니다.', exact: true }).check();
  await page.getByRole('button', { name: '선택 읽음', exact: true }).click();
  await expect(page.getByText('읽지 않은 알림 2개', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '선택 삭제', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: /^알림 선택:/ })).toHaveCount(3);
  await expect(bell).toHaveText('2');
  await page.getByRole('checkbox', { name: '표시된 알림 전체 선택' }).check();
  await page.getByRole('tab', { name: '할 일', exact: true }).click();
  await expect(page.getByRole('button', { name: '선택 삭제', exact: true })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: '알림 선택: 할 일 마감 알림', exact: true })).not.toBeChecked();
  await page.getByRole('link', { name: '전체 알림 보기' }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: '알림', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^알림 읽기:/ })).toHaveCount(3);
  await page.reload();
  await expect(page.getByRole('button', { name: /^알림 읽기:/ })).toHaveCount(3);
  await expect(page.getByText('읽지 않은 알림 2개', { exact: true })).toBeVisible();
  const records = await page.evaluate(() => globalThis.FlowraPushInbox.list(9001));
  expect(records.filter((item) => item.deleted_at).every((item) => !item.data)).toBe(true);
});

test('full inbox reaches older notifications and filters across API pages', async ({ page }) => {
  await installMockApi(page);
  await seedAuth(page);
  const now = Date.now();
  const notifications: NotificationRecipient[] = Array.from({ length: 105 }, (_, index) => ({
    notification_recipient_id: index + 1, notification_id: index + 1000,
    type: index < 100 ? 'schedule_reminder' : 'announcement',
    title: `전체 목록 알림 ${index + 1}`, read_at: null,
    created_at: new Date(now - (index + 5) * 60_000).toISOString(),
  }));
  await page.route('**/api/v1/notifications**', async (route) => {
    const url = new URL(route.request().url());
    const pageNumber = Number(url.searchParams.get('page') || 1);
    const data = url.pathname.endsWith('/unread-count') ? { unread_count: 105 }
      : { notifications: notifications.slice((pageNumber - 1) * 100, pageNumber * 100) };
    return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { success: true, data } });
  });
  await page.goto('/notifications');
  await expect(page.getByText('읽지 않은 알림 105개', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^알림 읽기:/ })).toHaveCount(50);
  await expect(page.getByText('5분 전', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '알림 더 보기 (55개)', exact: true }).click();
  await expect(page.getByRole('button', { name: /^알림 읽기:/ })).toHaveCount(100);
  await page.getByRole('button', { name: '알림 더 보기 (5개)', exact: true }).click();
  await expect(page.getByRole('button', { name: /^알림 읽기:/ })).toHaveCount(105);
  await page.getByRole('tab', { name: '공지', exact: true }).click();
  await expect(page.getByRole('button', { name: /^알림 읽기:/ })).toHaveCount(5);
  await expect(page.getByRole('button', { name: '알림 읽기: 전체 목록 알림 105', exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('notification-full.png') });
});
