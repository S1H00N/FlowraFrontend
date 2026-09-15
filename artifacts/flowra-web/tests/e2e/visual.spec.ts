import { test, expect } from '@playwright/test';
import { installMockApi, QA_NOW, seedAuth } from './fixtures';

// Keep this list limited to scenes whose candidate images receive visual review.
// Generate candidates through Playwright; never copy audit images into baselines.
const scenes = [
  { name: 'login-1280', route: '/login', width: 1280, public: true },
  { name: 'login-390', route: '/login', width: 390, public: true },
  { name: 'memos-1280', route: '/memos', width: 1280, public: false },
  { name: 'notices-1280', route: '/notices', width: 1280, public: false },
] as const;

for (const scene of scenes) {
  test(`visual ${scene.name}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: scene.width, height: scene.width < 600 ? 844 : 900 });
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date(QA_NOW));
    const api = await installMockApi(page);
    if (!scene.public) await seedAuth(page);
    const runtimeErrors: string[] = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));

    try {
      await page.goto(scene.route);
      await expect(page).toHaveURL(url => url.pathname === scene.route);

      if (scene.route === '/login') {
        await expect(page.getByRole('heading', { name: '로그인', exact: true })).toBeVisible();
        await expect(page.getByLabel('이메일', { exact: true })).toBeVisible();
        await expect(page.getByLabel('비밀번호', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
      } else if (scene.route === '/memos') {
        await expect(page.getByRole('heading', { name: 'QA 회의 메모', exact: true })).toBeVisible();
        await expect(page.locator('main').getByText('버튼과 화면 배치를 확인합니다.', { exact: false })).toBeVisible();
        await expect(page.getByRole('button', { name: '편집', exact: true })).toBeEnabled();
      } else {
        const main = page.locator('main');
        await expect(main.getByRole('heading', { name: '공지사항', exact: true })).toBeVisible();
        await expect(main.getByRole('button', { name: /QA 서비스 이용 안내/ })).toBeVisible();
        await expect(main.getByText('QA 업데이트 소식', { exact: true })).toBeVisible();
      }

      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      expect(runtimeErrors, '브라우저 실행 오류').toEqual([]);
      expect(api.unhandled, '알 수 없는 API 요청이 있으면 기준 화면을 생성하지 않습니다.').toEqual([]);
      await expect(page).toHaveScreenshot(`${scene.name}.png`, {
        animations: 'disabled',
        caret: 'hide',
        fullPage: true,
        scale: 'css',
      });
    } finally {
      await testInfo.attach('visual-diagnostics', {
        body: JSON.stringify({
          scene: scene.name,
          route: scene.route,
          viewport: page.viewportSize(),
          fixedTime: QA_NOW,
          unknownAPI: api.unhandled,
          runtimeErrors,
          blockedExternal: api.blockedExternal,
        }, null, 2),
        contentType: 'application/json',
      });
    }
  });
}
