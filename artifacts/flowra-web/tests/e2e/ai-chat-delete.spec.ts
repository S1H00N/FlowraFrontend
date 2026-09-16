import { test, expect } from '@playwright/test';
import { installMockApi, QA_API_ORIGIN, seedAuth } from './fixtures';

for (const status of [200, 404, 500]) {
  test(`AI 대화 삭제 응답에 맞게 목록과 선택 상태를 처리한다: ${status}`, async ({ page }) => {
    const api = await installMockApi(page);
    await seedAuth(page);
    api.state.sessions.push({ session_id: 17, title: '삭제 테스트' });
    api.state.messages.push({ message_id: 78, session_id: 17, role: 'assistant', content: '기존 답변' });
    let deleteRequests = 0;
    await page.route(`${QA_API_ORIGIN}/api/v1/ai-chat/sessions/17`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback();
      deleteRequests += 1;
      expect(route.request().method()).toBe('DELETE');
      expect(route.request().postData()).toBeNull();
      expect(route.request().headers().authorization).toBe('Bearer qa-access-token');
      if (status !== 500) {
        api.state.sessions = [];
        api.state.messages = [];
      }
      return route.fulfill({
        status,
        headers: { 'access-control-allow-origin': '*' },
        json: status === 200
          ? { success: true, message: 'AI chat session deleted', data: {} }
          : { success: false, message: '삭제 실패', error: { code: status === 404 ? 'AI_CHAT_SESSION_NOT_FOUND' : 'INTERNAL_ERROR' } },
      });
    });
    await page.goto('/tasks');
    await page.getByRole('button', { name: 'AI 채팅 열기', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Flowra AI 채팅' });
    await expect(panel.getByText('기존 답변', { exact: true })).toBeVisible();
    const remove = panel.getByRole('button', { name: '삭제 테스트 대화 삭제' });
    page.once('dialog', (dialog) => dialog.dismiss());
    await remove.click();
    expect(deleteRequests).toBe(0);
    page.once('dialog', (dialog) => dialog.accept());
    await remove.click();
    if (status === 500) {
      await expect(page.getByText('삭제 실패', { exact: true })).toBeVisible();
      await expect(remove).toBeEnabled();
      await expect(panel.getByText('기존 답변', { exact: true })).toBeVisible();
    } else {
      await expect(remove).toHaveCount(0);
      await expect(panel.getByText('기존 답변', { exact: true })).toHaveCount(0);
      await expect(panel.getByText('새 대화', { exact: true })).toBeVisible();
      await expect(panel.getByPlaceholder('AI에게 요청하기')).toBeEnabled();
    }
    expect(deleteRequests).toBe(1);
    expect(api.unhandled).toEqual([]);
  });
}

for (const lateStatus of [200, 404]) {
  test(`삭제한 대화의 늦은 응답이 새 대화에 영향을 주지 않는다: ${lateStatus}`, async ({ page }) => {
    const api = await installMockApi(page);
    await seedAuth(page);
    api.state.sessions.push({ session_id: 17, title: '응답 대기 대화' });
    let releaseReply!: () => void;
    const replyGate = new Promise<void>((resolve) => { releaseReply = resolve; });
    let requestStarted!: () => void;
    const started = new Promise<void>((resolve) => { requestStarted = resolve; });
    await page.route(`${QA_API_ORIGIN}/api/v1/ai-chat/sessions/17/messages`, async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      requestStarted();
      await replyGate;
      return route.fulfill({
        status: lateStatus,
        headers: { 'access-control-allow-origin': '*' },
        json: lateStatus === 200
          ? { success: true, data: {
            user_message: { ai_chat_message_id: 80, ai_chat_session_id: 17, role: 'user', content: '이전 요청' },
            assistant_message: { ai_chat_message_id: 81, ai_chat_session_id: 17, role: 'assistant', content: '삭제 후 늦은 답변' },
          } }
          : { success: false, message: '삭제된 채팅방입니다.', error: { code: 'AI_CHAT_SESSION_NOT_FOUND' } },
      });
    });
    await page.goto('/tasks');
    await page.getByRole('button', { name: 'AI 채팅 열기', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Flowra AI 채팅' });
    const remove = panel.getByRole('button', { name: '응답 대기 대화 대화 삭제' });
    await expect(remove).toBeVisible();
    const input = panel.getByPlaceholder('AI에게 요청하기');
    await input.fill('이전 요청');
    await panel.getByRole('button', { name: '메시지 보내기' }).click();
    await started;
    await expect(remove).toBeEnabled();
    page.once('dialog', (dialog) => dialog.accept());
    await remove.click();
    await expect(remove).toHaveCount(0);
    await expect(input).toBeEnabled();
    await input.fill('새 대화 요청');
    await panel.getByRole('button', { name: '메시지 보내기' }).click();
    await expect(panel.getByText('QA 모의 답변입니다. 오늘 일정과 할 일을 확인해 보세요.', { exact: true })).toBeVisible();
    await input.fill('새 대화 작성 중');
    const responseReceived = page.waitForResponse((response) => response.url().endsWith('/ai-chat/sessions/17/messages') && response.request().method() === 'POST');
    releaseReply();
    await (await responseReceived).finished();
    // Let the mutation callbacks run before checking for stale UI updates.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(input).toHaveValue('새 대화 작성 중');
    await expect(panel.getByText('삭제 후 늦은 답변', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('이전 요청', { exact: true })).toHaveCount(0);
    await expect(page.getByText('삭제된 채팅방입니다.', { exact: true })).toHaveCount(0);
    await expect(panel.getByText('답변 생성 중...', { exact: true })).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
  });
}
