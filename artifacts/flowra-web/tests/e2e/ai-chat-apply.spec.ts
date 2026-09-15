import { test, expect } from '@playwright/test';
import { installMockApi, QA_API_ORIGIN, seedAuth } from './fixtures';

for (const failure of [
  {
    code: 'INSUFFICIENT_AI_DATA',
    message: '일정 시작 시간이 필요합니다.',
    expected: '일정 시작 시간이 필요합니다.',
  },
  {
    code: 'RECURRENCE_OCCURRENCE_REQUIRED',
    message: 'Recurring schedule must create at least one occurrence',
    expected: '현재 반복 조건으로 생성할 수 있는 일정이 없습니다. 반복 시작일·종료일과 제외 날짜·요일을 확인해 AI에게 다시 요청해 주세요.',
  },
]) {
test(`AI 일정 적용 실패를 카드에 표시하고 재시도할 수 있다: ${failure.code}`, async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const api = await installMockApi(page);
  await seedAuth(page);
  api.state.sessions.push({ session_id: 17, title: '일정 추가' });
  api.state.messages.push({
    message_id: 78,
    session_id: 17,
    role: 'assistant',
    content: '일정을 추가할까요?',
    action_status: 'suggested',
    suggested_actions: [{
      type: 'create_schedule',
      title: '테스트 회의',
      start_datetime: '2026-09-15T10:00:00+09:00',
      recurrence: failure.code === 'RECURRENCE_OCCURRENCE_REQUIRED'
        ? { repeat_interval_days: 7, repeat_until: '2026-09-14T10:00:00+09:00' }
        : null,
    }],
  });
  let attempts = 0;
  await page.route(`${QA_API_ORIGIN}/api/v1/ai-chat/messages/78/apply`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback();
    attempts += 1;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe('Bearer qa-access-token');
    expect(route.request().postDataJSON()).toEqual({ apply_type: 'action', action_index: 0 });
    const headers = { 'access-control-allow-origin': '*' };
    if (attempts === 1) {
      return route.fulfill({
        status: 400,
        headers,
        json: { success: false, message: failure.message, error: { code: failure.code } },
      });
    }
    api.state.messages[0].applied_action_indexes = [0];
    return route.fulfill({
      status: 200,
      headers,
      json: { success: true, data: { apply_type: 'action', applied_action_indexes: [0], resource: null } },
    });
  });

  await page.goto('/tasks');
  await page.getByRole('button', { name: 'AI 채팅 열기', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Flowra AI 채팅' });
  const apply = panel.getByRole('button', { name: '적용', exact: true });
  await apply.click();
  await expect(panel.getByRole('alert')).toHaveText(`${failure.expected} (${failure.code})`);
  if (failure.code === 'RECURRENCE_OCCURRENCE_REQUIRED') {
    await expect(panel.getByText(/반복 종료/)).toContainText('2026');
    // Simulate a corrected server suggestion before the successful retry.
    api.state.messages[0].suggested_actions![0].recurrence!.repeat_until = '2026-09-30T10:00:00+09:00';
  }
  await expect(apply).toBeEnabled();
  expect(attempts).toBe(1);
  await apply.click();
  await expect(panel.getByRole('button', { name: '완료', exact: true })).toBeDisabled();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  expect(attempts).toBe(2);
  expect(runtimeErrors).toEqual([]);
  expect(api.unhandled).toEqual([]);
});
}
