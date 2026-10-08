import { randomUUID } from 'node:crypto';
import { expect, type BrowserContext, type Page, type Request, type Response, type TestInfo } from '@playwright/test';

type Environment = { webBaseURL: string; apiBaseURL: string; email: string; password: string };
type Kind = 'schedules' | 'tasks' | 'memos';
type Item = Record<string, unknown>;
const singular = { schedules: 'schedule', tasks: 'task', memos: 'memo' } as const;
const kinds: Kind[] = ['tasks', 'memos', 'schedules']; // Remove linked tasks before their parent.

function record(value: unknown): value is Item {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function itemFromEnvelope(body: unknown, kind: Kind): Item | null {
  if (!record(body) || body.success !== true || !record(body.data)) return null;
  const item = body.data[singular[kind]] ?? body.data;
  return record(item) ? item : null;
}

function itemId(item: Item, kind: Kind): string | null {
  const id = item[`${singular[kind]}_id`];
  return (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) ||
    (typeof id === 'string' && /^[1-9]\d*$/.test(id)) ? String(id) : null;
}

function seoulDateTime(value: unknown) {
  if (typeof value !== 'string' || Number.isNaN(new Date(value).getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

export async function runLifecycle(page: Page, context: BrowserContext, qa: Environment, testInfo: TestInfo) {
  const web = new URL(`${qa.webBaseURL}/`);
  const api = new URL(`${qa.apiBaseURL}/`);
  // Keep the memo's first line under the UI's 42-character title cutoff.
  const runLabel = `QA ${randomUUID().replaceAll('-', '')}`;
  const scheduleTitle = `${runLabel} schedule`;
  const taskTitle = `${runLabel} task`;
  const editedScheduleTitle = `${scheduleTitle} edited`;
  const editedTaskTitle = `${taskTitle} edited`;
  const memoTitle = `${runLabel} memo`;
  const memoText = `${memoTitle}\nLifecycle check.`;
  const editedMemoText = `${memoTitle}\nSaved edit.`;
  const owned = new Map<Kind, Set<string>>(kinds.map((kind) => [kind, new Set()]));
  const attempted = new Set<Kind>();
  const blocked = new WeakSet<Request>();
  const errors: string[] = [];
  let stage = 'install isolated network restrictions';
  let completedChecks = 0;
  let blockedBackground = 0;
  let orphanCount = 0;
  let cleanupUncertain = false;
  let failureStage: string | null = null;

  function apiPath(raw: string) {
    const url = new URL(raw);
    return url.origin === api.origin && url.pathname.startsWith(api.pathname)
      ? `/${url.pathname.slice(api.pathname.length)}` : null;
  }
  function endpointLabel(path: string | null) {
    const kind = path?.match(/^\/(schedules|tasks|memos)(?:\/\d+)?$/)?.[1];
    return kind ?? (path?.startsWith('/auth/') ? 'auth' : 'other-api');
  }
  function labeled(item: Item, kind: Kind) {
    const text = kind === 'memos' ? item.raw_text : item.title;
    return typeof text === 'string' && text.startsWith(`${runLabel} `);
  }
  function safePayload(body: Item, kind: Kind) {
    if ((kind === 'memos' && body.auto_parse === true) ||
      (kind === 'schedules' && body.visibility !== undefined && body.visibility !== 'private')) return false;
    return kind !== 'tasks' || body.schedule_id == null || owned.get('schedules')!.has(String(body.schedule_id));
  }

  // Fetch inside the browser: access tokens and other users' list entries never
  // leave it. Both these calls and UI requests pass through the same route guard.
  async function browserRead(kind: Kind, id?: string) {
    return page.evaluate(async ({ base, kind, id, label, single }) => {
      try {
        const response = await fetch(`${base}/${kind}${id ? `/${id}` : ''}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
          redirect: 'error', signal: AbortSignal.timeout(10_000),
        });
        if (id && response.status === 404) return { status: 404, items: [] };
        if (!response.ok) return { status: response.status, items: null };
        const body = await response.json();
        if (body?.success !== true || !body.data) return { status: response.status, items: null };
        const items = id ? [body.data[single] ?? body.data] : body.data.items ?? body.data[kind];
        if (!Array.isArray(items)) return { status: response.status, items: null };
        return { status: response.status, items: items.filter((item) =>
          typeof (kind === 'memos' ? item?.raw_text : item?.title) === 'string' &&
          (kind === 'memos' ? item.raw_text : item.title).startsWith(`${label} `)) as Item[] };
      } catch {
        return { status: 0, items: null };
      }
    }, { base: qa.apiBaseURL, kind, id, label: runLabel, single: singular[kind] });
  }
  async function verify(kind: Kind, id: string, check: (item: Item) => boolean) {
    await expect.poll(async () => {
      const read = await browserRead(kind, id);
      return read.items?.some((item) => itemId(item, kind) === id && check(item)) ?? false;
    }, { message: `${singular[kind]} must persist after a fresh API read` }).toBe(true);
    completedChecks++;
  }
  async function mutation(path: string, method: string, action: () => Promise<unknown>): Promise<Response> {
    const [response] = await Promise.all([
      page.waitForResponse((res) => apiPath(res.url()) === path && res.request().method() === method),
      action(),
    ]);
    if (!response.ok()) errors.push(`${endpointLabel(path)} HTTP ${response.status()}`);
    expect(response.ok(), `${endpointLabel(path)} mutation HTTP response must succeed`).toBe(true);
    if (response.status() !== 204) {
      const body: unknown = await response.json();
      expect(record(body) && body.success === true, 'Mutation success envelope required').toBe(true);
    }
    return response;
  }
  async function login() {
    await page.goto(new URL('login', web).href, { waitUntil: 'domcontentloaded' });
    await page.locator('#email').fill(qa.email);
    await page.locator('#password').fill(qa.password);
    await mutation('/auth/login', 'POST', () => page.locator('form button[type="submit"]').click());
    await expect(page.locator('.flowra-app-shell')).toBeVisible();
    expect(await page.evaluate(() => Boolean(localStorage.getItem('access_token')))).toBe(true);
  }
  async function openTasks(title: string) {
    await page.goto(new URL('tasks', web).href, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('일정 또는 할 일 검색...').locator('visible=true').fill(runLabel);
    const opener = page.getByRole('heading', { name: title, exact: true }).getByRole('button');
    await expect(opener).toBeVisible();
    if ((await opener.getAttribute('aria-expanded')) !== 'true') await opener.click();
    return opener.locator('xpath=ancestor::li[1]');
  }
  async function openCalendarDay() {
    await page.goto(new URL('schedules', web).href, { waitUntil: 'domcontentloaded' });
    const view = page.getByRole('button', { name: '보기 선택', exact: true }).locator('visible=true');
    await view.click();
    await page.getByRole('menuitem', { name: '일 D', exact: true }).click();
    await page.getByRole('button', { name: '오늘', exact: true }).locator('visible=true').click();
  }
  async function openMemoList() {
    const opener = page.getByRole('button', { name: '메모 목록 열기', exact: true });
    if (await opener.isVisible()) await opener.click();
    await expect(page.getByRole('textbox', { name: '메모 검색', exact: true })).toBeVisible();
  }

  try {
    await context.routeWebSocket('**/*', (socket) => { blockedBackground++; socket.close(); });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = apiPath(request.url());
      const method = request.method();
      const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(method);
      if (path === null) {
        const font = method === 'GET' && url.protocol === 'https:' && (
          (url.hostname === 'fonts.googleapis.com' && request.resourceType() === 'stylesheet') ||
          (url.hostname === 'fonts.gstatic.com' && request.resourceType() === 'font'));
        if ((url.origin === web.origin && readOnly) || font) return route.continue();
      } else {
        const resource = path.match(/^\/(schedules|tasks|memos)(?:\/([1-9]\d*))?$/);
        const kind = resource?.[1] as Kind | undefined;
        const id = resource?.[2];
        const coreRead = readOnly && (Boolean(resource) || ['/users/me', '/home/today', '/categories', '/holidays', '/notifications'].includes(path));
        const auth = ['POST', 'OPTIONS'].includes(method) && ['/auth/login', '/auth/refresh'].includes(path);
        let allowedWrite = false;
        if (kind && !readOnly) {
          let body: unknown = {};
          try { body = request.postDataJSON() ?? {}; } catch { /* Block invalid payloads. */ }
          if (record(body) && safePayload(body, kind)) {
            if (method === 'POST' && !id && !attempted.has(kind) && labeled(body, kind) &&
              (kind !== 'memos' || (body.auto_parse === false && body.source_type === 'manual'))) {
              attempted.add(kind);
              allowedWrite = true;
            } else if (id && ['PATCH', 'DELETE'].includes(method) && owned.get(kind)!.has(id) &&
              (!('title' in body) && !('raw_text' in body) || labeled(body, kind))) {
              // Verify the saved label again before every update/removal, including cleanup.
              try {
                const current = await route.fetch({ method: 'GET', postData: '',
                  headers: { ...request.headers(), 'content-length': '0' }, maxRedirects: 0, timeout: 10_000 });
                const item = itemFromEnvelope(await current.json(), kind);
                allowedWrite = current.ok() && item !== null && itemId(item, kind) === id && labeled(item, kind);
              } catch {
                errors.push(`Saved ownership check failed: ${singular[kind]}`);
              }
            }
          }
        }
        if (coreRead || auth || allowedWrite) {
          try {
            const response = await route.fetch({ maxRedirects: 0, timeout: 10_000 });
            if (response.status() >= 300 && response.status() < 400) throw new Error('redirect');
            if (kind && method === 'POST' && response.ok()) {
              let item: Item | null = null;
              try { item = itemFromEnvelope(await response.json(), kind); } catch { /* Cleanup can rediscover by label. */ }
              const createdId = item && labeled(item, kind) ? itemId(item, kind) : null;
              if (createdId) owned.get(kind)!.add(createdId);
              else errors.push(`Created ${singular[kind]} response could not establish ownership`);
            }
            await route.fulfill({ response });
          } catch {
            blocked.add(request);
            errors.push(`API fetch or redirect failure: ${endpointLabel(path)}`);
            await route.abort('blockedbyclient');
          }
          return;
        }
        if (!readOnly) errors.push(`Blocked unauthorized mutation: ${method} ${endpointLabel(path)}`);
      }
      blocked.add(request);
      blockedBackground++;
      await route.abort('blockedbyclient');
    });
    page.on('pageerror', () => errors.push('Uncaught browser JavaScript error'));
    page.on('crash', () => errors.push('Browser page crashed'));
    page.on('requestfailed', (request) => {
      const path = apiPath(request.url());
      const code = request.failure()?.errorText.match(/\bnet::ERR_[A-Z0-9_]+\b/)?.[0];
      // Reloading and query invalidation may cancel an obsolete read. Required
      // fresh reads still have independent persistence assertions below.
      if (request.method() === 'GET' && code === 'net::ERR_ABORTED') return;
      if (path !== null && !blocked.has(request)) errors.push(`API network failure: ${endpointLabel(path)}${code ? ` ${code}` : ''}`);
    });

    stage = 'UI login';
    await login();
    stage = 'create private schedule from calendar';
    await openCalendarDay();
    const dates = await page.evaluate(() => {
      const today = new Date();
      const next = new Date(today); next.setDate(next.getDate() + 1);
      const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { todayLabel: `${today.getMonth() + 1}월 ${today.getDate()}일 종일 일정 추가`, nextKey: key(next) };
    });
    await page.getByRole('button', { name: dates.todayLabel, exact: true }).click();
    await page.getByPlaceholder('일정 제목', { exact: true }).fill(scheduleTitle);
    await mutation('/schedules', 'POST', () => page.locator('[data-flowra-schedule-editor-footer]').getByRole('button', { name: '추가', exact: true }).click());
    await expect(page.getByPlaceholder('일정 제목', { exact: true })).toHaveCount(0);
    const scheduleId = [...owned.get('schedules')!][0];
    expect(Boolean(scheduleId), 'Created schedule ownership required').toBe(true);
    await verify('schedules', scheduleId, (item) => item.title === scheduleTitle && item.visibility === 'private');

    stage = 'create linked task through UI';
    let card = await openTasks(scheduleTitle);
    await card.getByRole('button', { name: '상세 설정으로 추가', exact: true }).click();
    const form = page.locator('form').filter({ has: page.getByPlaceholder('새 할 일 입력') });
    await page.getByPlaceholder('새 할 일 입력').fill(taskTitle);
    await mutation('/tasks', 'POST', () => form.getByRole('button', { name: '할 일 추가', exact: true }).click());
    const taskId = [...owned.get('tasks')!][0];
    expect(Boolean(taskId), 'Created task ownership required').toBe(true);
    await verify('tasks', taskId, (item) => item.title === taskTitle && String(item.schedule_id) === scheduleId);
    await page.getByRole('button', { name: '할 일 추가 패널 닫기', exact: true }).click();

    stage = 'edit linked task through UI';
    const row = page.locator(`#task-${taskId}`);
    await row.getByRole('button', { name: taskTitle, exact: true }).click();
    await row.getByRole('textbox', { name: '할 일', exact: true }).fill(editedTaskTitle);
    await mutation(`/tasks/${taskId}`, 'PATCH', () => row.getByRole('button', { name: '저장', exact: true }).click());
    await page.reload();
    card = await openTasks(scheduleTitle);
    await expect(row.getByRole('button', { name: editedTaskTitle, exact: true })).toBeVisible();
    await verify('tasks', taskId, (item) => item.title === editedTaskTitle && String(item.schedule_id) === scheduleId);

    stage = 'edit schedule title and move its linked task to the next date';
    const beforeTask = (await browserRead('tasks', taskId)).items?.[0];
    const beforeDeadline = seoulDateTime(beforeTask?.due_datetime);
    expect(beforeDeadline !== null, 'Linked task deadline required for date-move check').toBe(true);
    await openCalendarDay();
    await page.getByRole('button', { name: `Move ${scheduleTitle}`, exact: true }).click();
    await page.getByPlaceholder('일정 제목', { exact: true }).fill(editedScheduleTitle);
    const start = page.getByLabel('시작 날짜', { exact: true });
    await start.fill(dates.nextKey); await start.press('Tab');
    const end = page.getByLabel('종료 날짜', { exact: true });
    await end.fill(dates.nextKey); await end.press('Tab');
    await mutation(`/schedules/${scheduleId}`, 'PATCH', () => page.locator('[data-flowra-schedule-editor-footer]').getByRole('button', { name: '저장', exact: true }).click());
    await verify('schedules', scheduleId, (item) => item.title === editedScheduleTitle && seoulDateTime(item.start_datetime)?.date === dates.nextKey);
    await verify('tasks', taskId, (item) => String(item.schedule_id) === scheduleId &&
      seoulDateTime(item.due_datetime)?.date === dates.nextKey && seoulDateTime(item.due_datetime)?.time === beforeDeadline?.time);

    stage = 'complete linked task and verify after reload';
    card = await openTasks(editedScheduleTitle);
    await mutation(`/tasks/${taskId}`, 'PATCH', () => row.getByRole('checkbox', { name: `${editedTaskTitle} 완료`, exact: true }).check());
    await page.reload();
    card = await openTasks(editedScheduleTitle);
    await expect(row.getByRole('checkbox', { name: `${editedTaskTitle} 완료`, exact: true })).toBeChecked();
    await verify('tasks', taskId, (item) => item.status === 'done' && Boolean(item.completed_at));

    stage = 'complete schedule through UI';
    await card.getByRole('button', { name: `${editedScheduleTitle} 더보기`, exact: true }).click();
    await mutation(`/schedules/${scheduleId}`, 'PATCH', () => page.getByRole('menuitem', { name: '일정 완료로 표시', exact: true }).click());
    await verify('schedules', scheduleId, (item) => item.is_completed === true);

    stage = 'open memo list';
    await page.goto(new URL('memos', web).href, { waitUntil: 'domcontentloaded' });
    await openMemoList();
    stage = 'open memo creation form';
    await page.locator('aside').getByRole('button', { name: '새 메모', exact: true }).click();
    await page.getByPlaceholder('메모를 입력하세요...').fill(memoText);
    stage = 'disable AI analysis before memo creation';
    const autoParse = page.getByRole('checkbox', { name: '저장 후 AI 분석', exact: true });
    if (await autoParse.isChecked()) await page.locator('label').filter({ has: autoParse }).click();
    await expect(autoParse).not.toBeChecked();
    stage = 'save newly created memo';
    await mutation('/memos', 'POST', () => page.getByRole('button', { name: '저장', exact: true }).click());
    const memoId = [...owned.get('memos')!][0];
    expect(Boolean(memoId), 'Created memo ownership required').toBe(true);
    stage = 'verify newly created memo';
    await expect(page.getByRole('heading', { name: memoTitle, exact: true })).toBeVisible();
    await verify('memos', memoId, (item) => item.raw_text === memoText && item.parse_status !== 'processing' && item.parse_requested !== true);

    stage = 'edit memo and verify after reload';
    await page.getByRole('button', { name: '편집', exact: true }).click();
    await page.getByPlaceholder('메모를 입력하세요...').fill(editedMemoText);
    await mutation(`/memos/${memoId}`, 'PATCH', () => page.getByRole('button', { name: '저장', exact: true }).click());
    await page.reload();
    await openMemoList();
    await page.getByRole('textbox', { name: '메모 검색', exact: true }).fill(runLabel);
    await page.locator('aside').getByText(memoTitle, { exact: true }).click();
    await expect(page.getByText(editedMemoText, { exact: true })).toBeVisible();
    await verify('memos', memoId, (item) => item.raw_text === editedMemoText);

    stage = 'sign out locally and verify persistence after fresh UI login';
    // Fresh credentials check persistence without unregistering push devices.
    await page.evaluate(() => { for (const key of ['access_token', 'refresh_token', 'auth_user']) localStorage.removeItem(key); });
    await login();
    await verify('tasks', taskId, (item) => item.status === 'done' && item.title === editedTaskTitle);
    await verify('schedules', scheduleId, (item) => item.is_completed === true && item.title === editedScheduleTitle);
    await verify('memos', memoId, (item) => item.raw_text === editedMemoText);

    stage = 'delete created memo through UI';
    await page.goto(new URL('memos', web).href, { waitUntil: 'domcontentloaded' });
    await openMemoList();
    await page.getByRole('textbox', { name: '메모 검색', exact: true }).fill(runLabel);
    await page.locator('aside').getByText(memoTitle, { exact: true }).click();
    const reader = page.locator('section').filter({ has: page.getByRole('heading', { name: memoTitle, exact: true }) });
    page.once('dialog', (dialog) => dialog.accept());
    await mutation(`/memos/${memoId}`, 'DELETE', () => reader.getByRole('button', { name: '메모 삭제', exact: true }).click());
    await page.reload();
    expect((await browserRead('memos', memoId)).status, 'Deleted memo must be absent').toBe(404);
    completedChecks++;

    stage = 'delete created task and schedule through UI';
    card = await openTasks(editedScheduleTitle);
    page.once('dialog', (dialog) => dialog.accept());
    await mutation(`/tasks/${taskId}`, 'DELETE', () => row.getByRole('button', { name: `${editedTaskTitle} 삭제`, exact: true }).click());
    expect((await browserRead('tasks', taskId)).status, 'Deleted task must be absent').toBe(404);
    completedChecks++;
    await card.getByRole('button', { name: `${editedScheduleTitle} 더보기`, exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await mutation(`/schedules/${scheduleId}`, 'DELETE', () => page.getByRole('menuitem', { name: '일정 삭제', exact: true }).click());
    await page.reload();
    expect((await browserRead('schedules', scheduleId)).status, 'Deleted schedule must be absent').toBe(404);
    completedChecks++;
    stage = 'check browser and network issues';
    expect(errors, 'Lifecycle must have no browser errors or unauthorized mutations').toEqual([]);
  } catch (error) {
    const networkCode = error instanceof Error ? error.message.match(/\bnet::ERR_[A-Z0-9_]+\b/)?.[0] : undefined;
    if (networkCode) errors.push(`Browser network failure: ${networkCode}`);
    failureStage = stage;
  } finally {
    // Leave time for cleanup even when a workflow action timed out.
    testInfo.setTimeout(testInfo.timeout + 60_000);
    for (const kind of kinds) {
      if (!attempted.has(kind)) continue;
      try {
        const discovered = await browserRead(kind);
        if (discovered.items === null) cleanupUncertain = true;
        for (const item of discovered.items ?? []) {
          const id = itemId(item, kind);
          if (id) owned.get(kind)!.add(id);
        }
        for (const id of owned.get(kind)!) {
          const read = await browserRead(kind, id);
          if (read.status === 404) continue;
          if (!read.items?.some((item) => itemId(item, kind) === id && labeled(item, kind))) {
            orphanCount++; continue;
          }
          await page.evaluate(async ({ base, kind, id }) => {
            try {
              await fetch(`${base}/${kind}/${id}`, {
                method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('access_token') ?? ''}` },
                redirect: 'error', signal: AbortSignal.timeout(10_000),
              });
            } catch { /* Fresh GET below decides cleanup success. */ }
          }, { base: qa.apiBaseURL, kind, id });
          if ((await browserRead(kind, id)).status !== 404) orphanCount++;
        }
      } catch {
        cleanupUncertain = true;
      }
    }
    testInfo.annotations.push({ type: 'isolated-lifecycle-summary', description:
      `Run label: ${runLabel}; persistence/deletion checks: ${completedChecks}; owned resources: ${[...owned.values()].reduce((count, ids) => count + ids.size, 0)}; remaining resources: ${orphanCount}; cleanup uncertain: ${cleanupUncertain}; blocked background/external connections: ${blockedBackground}. No bodies, credentials, tokens, URLs, screenshots, traces, videos or storage state saved.` });
  }
  if (failureStage || orphanCount || cleanupUncertain) {
    // Never rethrow the original Playwright error: action logs can contain credentials.
    throw new Error(`Live isolated lifecycle failed at: ${failureStage ?? 'cleanup'}. Run label: ${runLabel}; remaining resources: ${orphanCount}; cleanup uncertain: ${cleanupUncertain}. Sanitized checks: ${[...new Set(errors)].join('; ') || 'UI or persistence assertion failed'}`);
  }
}
