import { expect, test } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

for (const bulk of [false, true]) {
  test(`lost schedule creation response requires a selected recovery schedule (${bulk ? "bulk" : "single"})`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(QA_NOW));
    const api = await installMockApi(page);
    api.state.tasks[0].due_datetime = "2026-09-07T18:00:00+09:00";
    api.state.tasks[0].schedule_id = null;
    const deadline = api.state.tasks[0].due_datetime;
    await seedAuth(page);
    let creates = 0;
    await page.route("**/api/v1/schedules*", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      creates += 1;
      const body = route.request().postDataJSON();
      api.state.schedules.push({
        schedule_id: 901, user_id: 9001, title: body.title, schedule_type: "personal",
        priority: "medium", is_completed: false, start_datetime: body.start_datetime,
        end_datetime: body.end_datetime, all_day: false, visibility: "private", created_at: QA_NOW,
      });
      await route.fulfill({
        status: 500, contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ success: false, message: "일정 생성 응답 유실 테스트" }),
      });
    });
    await page.goto("/");
    const overdue = page.getByRole("region", { name: "밀린 작업", exact: true });
    if (bulk) {
      await overdue.getByRole("button", { name: "한 번에 재계획", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
    } else {
      await overdue.getByRole("button", { name: "재계획", exact: true }).first().click();
    }
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
    await expect(dialog.getByText("일정 생성 결과를 확인해 주세요.", { exact: false })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "이 일정에 연결", exact: true })).toBeVisible();
    expect(creates).toBe(1);
    expect(api.state.tasks[0].schedule_id).toBeNull();
    await dialog.getByRole("button", { name: "목록 다시 확인", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "이 일정에 연결", exact: true })).toBeEnabled();
    expect(creates).toBe(1);
    await dialog.getByRole("button", { name: "이 일정에 연결", exact: true }).click();
    if (bulk) {
      await expect(dialog.getByText("재계획 완료", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
    }
    await expect(dialog).toHaveCount(0);
    expect(creates).toBe(1);
    expect(api.state.tasks[0].schedule_id).toBe(901);
    expect(api.state.tasks[0].due_datetime).toBe(deadline);
    expect(api.state.schedules.filter((schedule) => schedule.title === api.state.tasks[0].title)).toHaveLength(1);
    expect(api.unhandled).toEqual([]);
  });
}

test("a validated schedule creation error allows an ordinary corrected retry", async ({ page }) => {
  await page.clock.setFixedTime(new Date(QA_NOW));
  const api = await installMockApi(page);
  api.state.tasks[0].due_datetime = "2026-09-07T18:00:00+09:00";
  await seedAuth(page);
  let creates = 0;
  await page.route("**/api/v1/schedules*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (++creates !== 1) return route.fallback();
    await route.fulfill({
      status: 400, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ success: false, message: "시각을 확인해 주세요.", error: { code: "INVALID_SCHEDULE_RANGE" } }),
    });
  });
  await page.goto("/");
  await page.getByRole("region", { name: "밀린 작업", exact: true }).getByRole("button", { name: "재계획", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "이 일정에 연결", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "재계획하기", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(creates).toBe(2);
});
