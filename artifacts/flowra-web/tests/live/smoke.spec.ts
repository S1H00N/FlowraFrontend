import { expect, test, type Request } from '@playwright/test';
import { liveEnvironment as qa } from '../../playwright.live.config';

const web = new URL(`${qa.webBaseURL}/`);
const api = new URL(`${qa.apiBaseURL}/`);
const pages = [
  { label: 'home', path: '', endpoint: '/home/today' },
  { label: 'tasks', path: 'tasks', endpoint: '/tasks' },
  { label: 'schedules', path: 'schedules', endpoint: '/schedules' },
  { label: 'memos', path: 'memos', endpoint: '/memos' },
  { label: 'notices', path: 'notices', endpoint: '/notices' },
  { label: 'settings', path: 'settings', endpoint: '/users/me' },
] as const;
const requiredReads = new Set<string>(pages.map((page) => page.endpoint));

function apiPath(rawURL: string) {
  const url = new URL(rawURL);
  if (url.origin !== api.origin || !url.pathname.startsWith(api.pathname)) return null;
  return `/${url.pathname.slice(api.pathname.length)}`;
}

// Only constant labels leave the browser checks; never log URLs, IDs, bodies,
// headers, page text, credentials, tokens, or the original Playwright error.
function endpointLabel(path: string | null) {
  return path && (requiredReads.has(path) || path === '/auth/login' || path === '/auth/refresh')
    ? path
    : 'other-api';
}

test('real account: UI login and six read-only pages', async ({ page, context }, testInfo) => {
  let stage = 'install network restrictions';
  const errors: string[] = [];
  const blockedRequests = new WeakSet<Request>();
  const successfulReads = new Map<string, number>();
  const pendingReads = new Set<Promise<void>>();
  let blockedExternalRequests = 0;
  let blockedSocketConnections = 0;
  let completedPages = 0;

  try {
    await context.routeWebSocket('**/*', (socket) => {
      blockedSocketConnections++;
      socket.close();
    });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = apiPath(request.url());
      const method = request.method();
      const knownOrigin = url.origin === web.origin || path !== null;
      const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(method);
      const authPost = method === 'POST' && (path === '/auth/login' || path === '/auth/refresh');
      const staticFont = method === 'GET' && url.protocol === 'https:' && (
        (url.hostname === 'fonts.googleapis.com' && request.resourceType() === 'stylesheet') ||
        (url.hostname === 'fonts.gstatic.com' && request.resourceType() === 'font')
      );
      if (authPost) {
        const response = await route.fetch({ maxRedirects: 0 });
        if (response.status() >= 300 && response.status() < 400) {
          errors.push('Blocked authentication redirect');
          blockedRequests.add(request);
          await route.abort('blockedbyclient');
        } else {
          await route.fulfill({ response });
        }
        return;
      }
      if ((knownOrigin && readOnly) || staticFont) {
        await route.continue();
        return;
      }
      blockedRequests.add(request);
      if (knownOrigin) errors.push(`Blocked state-changing request: ${method} ${endpointLabel(path)}`);
      else blockedExternalRequests++;
      await route.abort('blockedbyclient');
    });

    page.on('pageerror', () => errors.push('Uncaught browser JavaScript error'));
    page.on('crash', () => errors.push('Browser page crashed'));
    page.on('requestfailed', (request) => {
      const path = apiPath(request.url());
      if (path !== null && !blockedRequests.has(request)) {
        errors.push(`API network failure: ${endpointLabel(path)}`);
      }
    });
    page.on('response', (response) => {
      const path = apiPath(response.url());
      if (path === null || response.request().method() === 'OPTIONS') return;
      if (response.status() >= 400) {
        if (path !== '/auth/login' && path !== '/auth/refresh') {
          errors.push(`API HTTP ${response.status()}: ${endpointLabel(path)}`);
        }
        return;
      }
      if (response.request().method() !== 'GET' || !requiredReads.has(path) || !response.ok()) return;
      const reading = (async () => {
        try {
          const body: unknown = await response.json();
          if (typeof body === 'object' && body !== null && 'success' in body && body.success === true) {
            successfulReads.set(path, (successfulReads.get(path) ?? 0) + 1);
          } else {
            errors.push(`API success envelope missing: ${endpointLabel(path)}`);
          }
        } catch {
          errors.push(`API JSON response unreadable: ${endpointLabel(path)}`);
        }
      })();
      pendingReads.add(reading);
      void reading.finally(() => pendingReads.delete(reading));
    });

    stage = 'open login form';
    await page.goto(new URL('login', web).href, { waitUntil: 'domcontentloaded' });
    await page.locator('#email').waitFor({ state: 'visible' });
    stage = 'enter account credentials';
    await page.locator('#email').fill(qa.email);
    await page.locator('#password').fill(qa.password);
    stage = 'submit UI login';
    const [loginResponse] = await Promise.all([
      page.waitForResponse((response) => apiPath(response.url()) === '/auth/login' && response.request().method() === 'POST'),
      page.locator('form button[type="submit"]').click(),
    ]);
    expect(loginResponse.ok(), 'Login HTTP response must succeed').toBe(true);
    stage = 'verify authenticated home';
    await expect.poll(() => new URL(page.url()).pathname === web.pathname).toBe(true);
    await expect(page.locator('.flowra-app-shell')).toBeVisible();
    // Read booleans only; the token and stored user object never leave the page.
    expect(await page.evaluate(() => Boolean(localStorage.getItem('access_token')))).toBe(true);

    for (const target of pages) {
      stage = `load ${target.label} page`;
      const previousReads = target.path ? successfulReads.get(target.endpoint) ?? 0 : 0;
      // Fresh page loads also check protected deep links and require a new live
      // read response instead of treating a visible shell or cached data as success.
      if (target.path) await page.goto(new URL(target.path, web).href, { waitUntil: 'domcontentloaded' });
      await expect.poll(() => new URL(page.url()).pathname === new URL(target.path, web).pathname).toBe(true);
      await expect(page.locator('.flowra-app-shell main')).toBeVisible();
      stage = `verify ${target.label} API read`;
      await expect.poll(() => successfulReads.get(target.endpoint) ?? 0).toBeGreaterThan(previousReads);
      completedPages++;
    }

    stage = 'check browser and API errors';
    await Promise.all([...pendingReads]);
    expect(errors, 'Read-only smoke must have no browser errors, failed API reads, or attempted writes').toEqual([]);
  } catch {
    // Suppress Playwright action logs (fill values) and any data in server errors.
    throw new Error(`Live read-only smoke failed at: ${stage}. Sanitized checks: ${[...new Set(errors)].join('; ') || 'UI or required API assertion failed'}`);
  } finally {
    testInfo.annotations.push({
      type: 'read-only-summary',
      description: `Pages verified: ${completedPages}/6; blocked external requests: ${blockedExternalRequests}; blocked WebSocket connections: ${blockedSocketConnections}; browser/API issues: ${errors.length}. No screenshots, traces, videos, storage state, or response bodies saved.`,
    });
  }
});
