import { test, expect } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

test("채팅의 과거 내역·제목·보관·복원이 서버 상태와 일치한다", async ({ page }) => {
  const api = await installMockApi(page);
  await seedAuth(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let session = { session_id: 17, title: "QA 관리 대화", status: "active" };
  const recent = { message_id: 2, session_id: 17, role: "assistant", content: "최근 답변" };
  const old = { message_id: 1, session_id: 17, role: "user", content: "이전 질문" };
  const patches: unknown[] = [];
  await page.route("**/api/v1/ai-chat/sessions**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "GET" && url.pathname.endsWith("/sessions")) {
      await route.fulfill({ json: { success: true, data: { sessions: url.searchParams.get("status") === session.status ? [session] : [], pagination: { has_more: false, next_cursor: null } } } });
    } else if (req.method() === "GET" && url.pathname.endsWith("/17/messages")) {
      expect(url.searchParams.get("limit")).toBe("50");
      const older = url.searchParams.get("cursor") === "older";
      await route.fulfill({ json: { success: true, data: { messages: older ? [old, recent] : [recent], pagination: { has_more: !older, next_cursor: older ? null : "older" } } } });
    } else if (req.method() === "PATCH" && url.pathname.endsWith("/sessions/17")) {
      patches.push(req.postDataJSON());
      session = { ...session, ...req.postDataJSON() };
      await route.fulfill({ json: { success: true, data: { session } } });
    } else await route.fallback();
  });
  await page.goto("/tasks");
  await page.getByRole("button", { name: "AI 채팅 열기", exact: true }).click();
  const panel = page.getByRole("region", { name: "Flowra AI 채팅" });
  await expect(panel.getByText("최근 답변", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "이전 메시지 더 보기", exact: true }).click();
  await expect(panel.getByText("이전 질문", { exact: true })).toBeVisible();
  await expect(panel.getByText("최근 답변", { exact: true })).toHaveCount(1);
  page.once("dialog", (dialog) => dialog.accept("QA 변경한 대화"));
  await panel.getByRole("button", { name: "대화 제목 수정", exact: true }).click();
  await expect.poll(() => session.title).toBe("QA 변경한 대화");
  await panel.getByRole("button", { name: "대화 보관", exact: true }).click();
  await expect(panel.getByPlaceholder("AI에게 요청하기")).toBeDisabled();
  await expect(panel.getByRole("button", { name: "대화 복원", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "대화 복원", exact: true }).click();
  await expect(panel.getByPlaceholder("AI에게 요청하기")).toBeEnabled();
  expect(patches).toEqual([{ title: "QA 변경한 대화" }, { status: "archived" }, { status: "active" }]);
  expect(api.unhandled).toEqual([]);
  expect(errors).toEqual([]);
});

test("메시지 저장 후 응답 실패는 재조회로 복구하고 자동 재전송하지 않는다", async ({ page }) => {
  const api = await installMockApi(page);
  await seedAuth(page);
  api.state.sessions.push({ session_id: 17, title: "QA 복구 대화", status: "active" });
  let posts = 0;
  await page.route("**/api/v1/ai-chat/sessions/17/messages*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts += 1;
    api.state.messages.push({ message_id: 71, session_id: 17, role: "user", content: "저장된 요청", created_at: QA_NOW });
    await route.fulfill({ status: 500, json: { success: false, message: "응답 생성 실패", error: { code: "OPENAI_CHAT_EMPTY" } } });
  });
  await page.goto("/tasks");
  await page.getByRole("button", { name: "AI 채팅 열기", exact: true }).click();
  const panel = page.getByRole("region", { name: "Flowra AI 채팅" });
  await expect(panel.getByRole("button", { name: "대화 제목 수정", exact: true })).toBeVisible();
  await panel.getByPlaceholder("AI에게 요청하기").fill("저장된 요청");
  await panel.getByPlaceholder("AI에게 요청하기").press("Enter");
  await expect(panel.locator("[data-flowra-ai-chat-messages]").getByText("저장된 요청", { exact: true })).toHaveCount(1);
  await expect.poll(() => api.requests.filter((req) => req.method === "GET" && req.path === "/ai-chat/sessions/17/messages").length).toBeGreaterThan(1);
  expect(posts).toBe(1);
  expect(api.unhandled).toEqual([]);
});

test("반복 일정의 범위 수정과 연결 데이터 확인 후 삭제를 처리한다", async ({ page }) => {
  const api = await installMockApi(page);
  await seedAuth(page);
  await page.clock.setFixedTime(new Date(QA_NOW));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const schedule = { ...api.state.schedules[0], recurrence_group_id: "qa-series", recurrence_sequence: 1 };
  api.state.schedules = [schedule];
  const updates: Record<string, unknown>[] = [];
  const deletes: Record<string, unknown>[] = [];
  const impact = { removed_schedule_ids: [], unlinked_tasks: 0, removed_shares: 0, removed_reminders: 0, removed_share_links: 0 };
  await page.route(`**/api/v1/schedules/${schedule.schedule_id}/series`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      await route.fulfill({ json: { success: true, data: { recurrence_group_id: "qa-series", recurrence_rule: {}, schedules: api.state.schedules } } });
    } else if (req.method() === "PATCH") {
      const body = req.postDataJSON();
      updates.push(body);
      Object.assign(schedule, body.changes);
      await route.fulfill({ json: { success: true, data: { ...impact, recurrence_group_id: "qa-series", schedules: [schedule], skipped_exception_ids: [] } } });
    } else if (req.method() === "DELETE") {
      const body = req.postDataJSON();
      deletes.push(body);
      if (!body.confirm_remove_linked) {
        await route.fulfill({ status: 409, json: { success: false, error: { code: "SERIES_LINKED_DATA_CONFIRMATION_REQUIRED", details: { counts: { tasks: 2, reminders: 1 } } } } });
      } else {
        api.state.schedules = [];
        await route.fulfill({ json: { success: true, data: { ...impact, removed_schedule_ids: [schedule.schedule_id], unlinked_tasks: 2, removed_reminders: 1 } } });
      }
    } else await route.fallback();
  });
  await page.goto("/schedules");
  await page.getByRole("button", { name: "보기 선택", exact: true }).click();
  await page.getByRole("menuitem", { name: "월 M", exact: true }).click();
  await page.getByRole("button", { name: `${schedule.title} select`, exact: true }).click();
  await page.getByPlaceholder("일정 제목", { exact: true }).fill("QA 반복 내용 변경");
  const controls = page.getByRole("region", { name: "반복 일정 관리" });
  await controls.getByLabel("반복 일정 적용 범위").selectOption("following");
  await controls.getByRole("button", { name: "범위에 내용 적용", exact: true }).click();
  await expect.poll(() => updates.length).toBe(1);
  expect(updates[0].scope).toBe("following");
  expect(updates[0].include_exceptions).toBe(false);
  expect(updates[0].changes).toMatchObject({ title: "QA 반복 내용 변경" });
  expect(updates[0].changes).not.toHaveProperty("start_datetime");
  await controls.getByLabel("반복 일정 적용 범위").selectOption("all");
  const confirmations: string[] = [];
  page.on("dialog", async (dialog) => { confirmations.push(dialog.message()); await dialog.accept(); });
  await controls.getByRole("button", { name: "범위 삭제", exact: true }).click();
  await expect(controls).toHaveCount(0);
  expect(deletes).toEqual([{ scope: "all", confirm_remove_linked: false }, { scope: "all", confirm_remove_linked: true }]);
  expect(confirmations[1]).toContain("연결 할 일: 2개");
  expect(api.state.schedules).toHaveLength(0);
  expect(api.unhandled).toEqual([]);
  expect(errors).toEqual([]);
});
