import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { installMockApi, seedAuth, QA_NOW, type MockOptions } from './fixtures';

const routes = ['/', '/tasks', '/schedules', '/memos', '/notices', '/settings'];
const widths = [360, 390, 599, 600, 768, 1024, 1280, 1920];

async function audit(page: Page, testInfo: TestInfo, route: string, width: number,
  options: MockOptions & { public?: boolean; dark?: boolean } = {}) {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.clock.setFixedTime(new Date(QA_NOW));
  const api = await installMockApi(page, options);
  if (!options.public) await seedAuth(page);
  if (options.dark) await page.addInitScript(() => {
    localStorage.setItem('flowra:user-settings', JSON.stringify({ theme: 'dark' }));
  });
  const errors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(route);
  await expect(page.locator(options.public ? '#root' : 'main')).not.toBeEmpty();
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);

  const metrics = await page.evaluate(() => {
    const rect = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const describe = (e: Element) => ({ tag: e.tagName, label: (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100), ...rect(e) });
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const main = document.querySelector('main');
    const bottomNav = [...document.querySelectorAll('nav')].find(e => visible(e) && getComputedStyle(e).position === 'fixed');
    const outside = [...document.querySelectorAll('main *')].filter(e => {
      if (!visible(e)) return false;
      const r = e.getBoundingClientRect();
      if (r.right <= innerWidth + 1 && r.left >= -1) return false;
      // Scroll containers may intentionally contain wider/offscreen children.
      for (let p = e.parentElement; p && p !== main; p = p.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return false;
      }
      return true;
    }).slice(0, 15).map(describe);
    const mainControls = [...document.querySelectorAll('main button, main a, main input, main textarea')];
    const coveredControls = mainControls.filter(e => {
      if (!visible(e) || (e as HTMLButtonElement).disabled) return false;
      const r = e.getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      if (x < 0 || x >= innerWidth || y < 0 || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      // Only flag fixed bottom navigation covering controls; other popovers need review.
      return hit && bottomNav?.contains(hit) && !e.contains(hit);
    }).map(e => ({ ...describe(e), controlIndex: mainControls.indexOf(e) }));
    const controls = [...document.querySelectorAll('main button, main a, main input, main textarea')].filter(visible);
    const unnamedButtons = controls.filter(e => e.tagName === 'BUTTON' && !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.getAttribute('title') || e.textContent?.trim())).map(describe);
    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      main: main ? { ...rect(main), overflow: getComputedStyle(main).overflow, paddingBottom: parseFloat(getComputedStyle(main).paddingBottom) } : null,
      bottomNav: bottomNav ? { ...rect(bottomNav), links: [...bottomNav.querySelectorAll('a')].map(describe) } : null,
      outside, coveredControls, unnamedButtons,
      theme: document.documentElement.dataset.resolvedTheme,
      language: document.documentElement.lang,
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
    };
  });
  for (const [name, fullPage] of [['viewport', false], ['full-page', true]] as const) {
    const path = testInfo.outputPath(`${name}.png`);
    await page.screenshot({ path, fullPage, animations: 'disabled' });
    await testInfo.attach(name, { path, contentType: 'image/png' });
  }
  const diagnosticsPath = testInfo.outputPath('layout-diagnostics.json');
  await writeFile(diagnosticsPath, JSON.stringify({ route, options, ...metrics, errors, consoleErrors, unhandled: api.unhandled, blockedExternal: api.blockedExternal }, null, 2));
  await testInfo.attach('layout-diagnostics', { path: diagnosticsPath, contentType: 'application/json' });
  expect.soft(errors, 'uncaught browser errors').toEqual([]);
  expect.soft(api.unhandled, 'fixture coverage: any unknown API invalidates this page audit').toEqual([]);
  expect.soft(metrics.documentWidth, 'page must not overflow horizontally').toBeLessThanOrEqual(width + 1);
  expect.soft(metrics.outside, 'content outside viewport without a scroll container').toEqual([]);
  // A fixed menu may sit over content outside a scroll container's visible area.
  // Verify that the user can reveal and hit the control instead of failing on
  // its initial rectangle. Trial clicks check hit targets without submitting data.
  for (const covered of metrics.coveredControls) {
    const control = page.locator('main button, main a, main input, main textarea').nth(covered.controlIndex);
    await control.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
    await control.click({ trial: true });
  }
  expect.soft(metrics.unnamedButtons, 'buttons must have accessible names').toEqual([]);
  if (metrics.main && metrics.bottomNav) {
    if (metrics.main.overflow === 'hidden') {
      expect.soft(metrics.main.bottom, 'full-height content must end above bottom navigation').toBeLessThanOrEqual(metrics.bottomNav.y + 1);
    } else {
      expect.soft(metrics.main.paddingBottom, 'scrollable content needs space for bottom navigation').toBeGreaterThanOrEqual(metrics.bottomNav.height - 1);
    }
  }
  return api;
}

for (const width of [360, 390, 599]) {
  test(`mobile calendar regression width=${width}`, async ({ page }, info) => {
    await audit(page, info, '/schedules', width);
    const navigation = page.locator('.flowra-app-shell > nav');
    const navBox = await navigation.boundingBox();
    const aiBox = await page.getByRole('button', { name: 'AI 채팅 열기', exact: true }).boundingBox();
    expect(aiBox!.y + aiBox!.height).toBeLessThan(navBox!.y);
    const links = await navigation.getByRole('link').all();
    for (const link of links) {
      const box = await link.boundingBox();
      expect(box!.y).toBeCloseTo((await links[0].boundingBox())!.y, 0);
    }

    const grid = page.locator('[data-flowra-week-scroll]');
    for (const title of ['QA 디자인 검토 회의', 'QA 일정 겹침 확인']) {
      const card = grid.getByLabel(`${title} schedule block`, { exact: true });
      await expect(card).toBeInViewport();
      expect((await card.boundingBox())!.width).toBeGreaterThanOrEqual(80);
    }
    await expect(grid.getByRole('button', { name: /\d+월 \d+일 종일 일정 추가/ })).toHaveCount(7);
    await grid.getByRole('button', { name: '9월 12일 종일 일정 추가', exact: true }).click();
    await expect(page.locator('input[name="flowra_schedule_title"]')).toBeVisible();
    await page.locator('[data-flowra-schedule-editor-footer]').getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.locator('input[name="flowra_schedule_title"]')).toHaveCount(0);
    await navigation.getByRole('link', { name: '메모', exact: true }).click();
    await navigation.getByRole('link', { name: '캘린더', exact: true }).click();
    await expect(page).toHaveURL(/\/schedules$/);
  });
}

for (const width of widths) {
  for (const route of routes) {
    test(`layout ${route} width=${width}`, async ({ page }, info) => { await audit(page, info, route, width); });
  }
}

for (const width of [360, 768, 1280]) {
  for (const route of ['/login', '/signup', '/forgot-password', '/reset-password', '/404']) {
    test(`public ${route} width=${width}`, async ({ page }, info) => { await audit(page, info, route, width, { public: true }); });
  }
}

for (const width of [390, 1280]) {
  for (const route of routes) {
    test(`dark ${route} width=${width}`, async ({ page }, info) => { await audit(page, info, route, width, { dark: true }); });
  }
}

for (const route of routes) {
  test(`empty ${route}`, async ({ page }, info) => { await audit(page, info, route, 1280, { empty: true }); });
}

for (const route of ['/tasks', '/schedules', '/memos']) {
  for (const width of [390, 1280]) {
    test(`long content ${route} width=${width}`, async ({ page }, info) => { await audit(page, info, route, width, { longContent: true }); });
  }
}

for (const route of ['/tasks', '/schedules', '/memos']) {
  test(`server error and recovery ${route}`, async ({ page }, info) => {
    const failures: Record<string, number> = { [route]: 500 };
    const api = await audit(page, info, route, 1280, { failures });
    const errorHeading = page.getByText(/불러오지 못했습니다/).first();
    await expect(errorHeading).toBeVisible();
    delete failures[route];
    const retry = page.getByRole('button', { name: /다시 시도|재시도/ }).first();
    await retry.click();
    await expect(page.getByText(/불러오지 못했습니다/)).toHaveCount(0);
    await expect.poll(() => api.requests.filter(r => r.path === route && r.status === 200).length).toBeGreaterThan(0);
  });
}
