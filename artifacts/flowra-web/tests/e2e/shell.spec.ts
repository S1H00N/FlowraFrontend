import { test as base, expect, type Page } from '@playwright/test';
import { installMockApi, QA_NOW, seedAuth } from './fixtures';

type MockApi = Awaited<ReturnType<typeof installMockApi>>;

const test = base.extend<{ mockApi: MockApi }>({
  mockApi: [async ({ page }, use, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    const mockApi = await installMockApi(page);
    await seedAuth(page);
    await page.clock.setFixedTime(new Date(QA_NOW));
    await use(mockApi);
    expect.soft(runtimeErrors, '브라우저 실행 오류').toEqual([]);
    expect.soft(mockApi.unhandled, '모의 API에서 처리하지 않은 요청').toEqual([]);
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('shell-api-requests', {
        body: JSON.stringify(mockApi.requests, null, 2),
        contentType: 'application/json',
      });
    }
  }, { auto: true }],
});

function appShell(page: Page) {
  return page.locator('.flowra-app-shell').first();
}

function sidebar(page: Page) {
  return appShell(page).locator(':scope > aside');
}

function mobile(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 600;
}

async function openSidebarIfNeeded(page: Page) {
  if (mobile(page)) {
    await appShell(page).locator(':scope > div > header')
      .getByRole('button', { name: '사이드바 열기', exact: true }).click();
  }
  await expect(sidebar(page)).toBeInViewport();
}

async function openSettings(page: Page) {
  await openSidebarIfNeeded(page);
  await sidebar(page).getByRole('button', { name: '프로필 메뉴', exact: true }).click();
  await page.getByRole('menuitem', { name: '설정', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '설정', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '일반', exact: true })).toBeVisible();
  return dialog;
}

test('주요 메뉴를 클릭해 이동하고 브라우저 뒤로가기로 돌아온다', async ({ page }) => {
  await page.goto('/');
  const navigation = mobile(page)
    ? appShell(page).locator(':scope > nav')
    : sidebar(page).getByRole('navigation');

  for (const [label, path] of [
    ['할일', '/tasks'],
    ['캘린더', '/schedules'],
    ['메모', '/memos'],
    ['공지사항', '/notices'],
    ['홈', '/'],
  ]) {
    await navigation.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === path);
    await expect(appShell(page).getByRole('main')).toBeVisible();
    await expect(navigation.getByRole('link', { name: label, exact: true }))
      .toHaveAttribute('aria-current', 'page');
  }

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/notices');
  await expect(appShell(page).getByRole('main')
    .getByRole('heading', { name: '공지사항', exact: true })).toBeVisible();
});

test('사이드바 열기와 닫기가 작동하고 데스크톱 접힘 상태가 유지된다', async ({ page }) => {
  await page.goto('/tasks');
  if (mobile(page)) {
    await expect(sidebar(page)).not.toBeInViewport();
    await openSidebarIfNeeded(page);
    await sidebar(page).getByRole('button', { name: '사이드바 닫기', exact: true }).click();
    await expect(sidebar(page)).not.toBeInViewport();
    await openSidebarIfNeeded(page);
    await sidebar(page).getByRole('link', { name: '캘린더', exact: true }).click();
    await expect(page).toHaveURL((url) => url.pathname === '/schedules');
    await expect(sidebar(page)).not.toBeInViewport();
    return;
  }

  await sidebar(page).getByRole('button', { name: '사이드바 접기', exact: true }).click();
  await expect(sidebar(page).getByRole('button', { name: '사이드바 펼치기', exact: true })).toBeVisible();
  await expect.poll(async () => (await sidebar(page).boundingBox())?.width).toBeLessThan(100);
  await page.reload();
  await expect(sidebar(page).getByRole('button', { name: '사이드바 펼치기', exact: true })).toBeVisible();
  await expect.poll(async () => (await sidebar(page).boundingBox())?.width).toBeLessThan(100);
  await sidebar(page).getByRole('button', { name: '사이드바 펼치기', exact: true }).click();
  await expect.poll(async () => (await sidebar(page).boundingBox())?.width).toBeGreaterThan(200);
});

test('프로필에서 설정을 열어 다크 테마를 적용하고 새로고침 후 유지한다', async ({ page }, testInfo) => {
  await page.goto('/tasks');
  let dialog = await openSettings(page);
  await testInfo.attach('settings-dialog-light', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await dialog.getByRole('button', { name: '다크', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-resolved-theme', 'dark');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await testInfo.attach('settings-dialog-dark', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-resolved-theme', 'dark');
  dialog = await openSettings(page);
  await dialog.getByRole('button', { name: '라이트', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-resolved-theme', 'light');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('설정의 각 영역을 열고 화면 표시 옵션을 변경한다', async ({ page }) => {
  await page.goto('/settings');
  const settings = appShell(page).getByRole('main');
  for (const label of ['화면 표시', '알림', '분류 관리', '계정', '일반']) {
    await settings.getByRole('button', { name: label, exact: true }).click();
    await expect(settings.getByRole('heading', { name: label, exact: true })).toBeVisible();
  }
  await settings.getByRole('button', { name: '화면 표시', exact: true }).click();
  const holidays = settings.getByRole('switch', { name: '공휴일 표시', exact: true });
  await expect(holidays).toBeChecked();
  await holidays.click();
  await expect(holidays).not.toBeChecked();
  await page.reload();
  await settings.getByRole('button', { name: '화면 표시', exact: true }).click();
  await expect(holidays).not.toBeChecked();
});

test('AI 채팅과 대화 목록을 열고 닫으며 작성 중인 내용이 유지된다', async ({ page }, testInfo) => {
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'AI 채팅 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Flowra AI 채팅', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('저장된 대화가 없습니다.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: '메시지 보내기', exact: true })).toBeDisabled();
  await testInfo.attach('ai-chat-panel-open', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await panel.getByRole('button', { name: '대화 목록 닫기', exact: true }).click();
  await expect(panel.getByRole('button', { name: '대화 목록 열기', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(panel.getByText('저장된 대화가 없습니다.', { exact: true })).not.toBeVisible();
  await panel.getByRole('button', { name: '대화 목록 열기', exact: true }).click();
  await expect(panel.getByText('저장된 대화가 없습니다.', { exact: true })).toBeVisible();
  await panel.getByPlaceholder('AI에게 요청하기', { exact: true }).fill('QA 작성 중인 내용');
  await expect(panel.getByRole('button', { name: '메시지 보내기', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'AI 채팅 닫기', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: 'AI 채팅 열기', exact: true }).click();
  await expect(panel.getByPlaceholder('AI에게 요청하기', { exact: true })).toHaveValue('QA 작성 중인 내용');
});

test('캘린더 일·주·월 보기와 날짜 범위 이동이 작동한다', async ({ page }) => {
  await page.goto('/schedules');
  const view = page.getByRole('button', { name: '보기 선택', exact: true });
  const header = appShell(page).locator(':scope > div > header');
  for (const [label, shortcut, summary] of [
    ['일', 'D', '선택한 날짜'],
    ['월', 'M', '이번 달'],
    ['주', 'W', '이번 주'],
  ]) {
    await view.click();
    await page.getByRole('menuitem', { name: `${label} ${shortcut}`, exact: true }).click();
    await expect(view).toHaveText(label);
    await expect(header).toContainText(summary);
  }
  await expect(header).not.toContainText('불러오는 중');
  const dateRange = header.locator('p').first();
  const todayRange = await dateRange.innerText();
  await page.getByRole('button', { name: '다음 범위', exact: true }).click();
  await expect(dateRange).not.toHaveText(todayRange);
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await expect(dateRange).toHaveText(todayRange);
});
