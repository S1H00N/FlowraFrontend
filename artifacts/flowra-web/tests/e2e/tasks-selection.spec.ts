import { test, expect } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

async function setup(page: import("@playwright/test").Page) {
  const api = await installMockApi(page);
  api.state.tasks = Array.from({ length: 6 }, (_, i) => ({
    task_id: 800 + i,
    title: `선택 테스트 ${i + 1}`,
    schedule_id: 201,
    status: i === 5 ? ("done" as const) : ("todo" as const),
    priority: "medium" as const,
    created_at: QA_NOW,
  }));
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  const card = page.locator('[data-selection-key="schedule:201"]');
  const bar = page.getByRole("group", { name: "선택한 항목 작업" });
  await expect(card).toBeVisible();
  await card.locator(".tasks-card-open").click();
  return { api, card, bar };
}

test("범위·추가 선택과 키보드 종료", async ({ page }) => {
  const { api, card, bar } = await setup(page);
  await expect(
    page.getByRole("button", { name: "선택", exact: true }),
  ).toHaveCount(0);
  await expect(bar).toHaveCount(0);
  await expect(card.locator(".tasks-subtask:visible")).toHaveCount(4);
  const first = page.locator('[data-selection-key="task:800"] .tasks-subtask-open');
  await expect(card.locator(".tasks-selection-checkbox")).toHaveCount(0);
  await expect(card.locator(".tasks-subtask .tasks-selection-checkbox")).toHaveCount(0);
  await first.click({ modifiers: ["Control"] });
  await expect(bar).toContainText("1개 선택됨");
  await page.locator('[data-selection-key="task:802"] .tasks-subtask-open').click({ modifiers: ["Shift"] });
  await expect(bar).toContainText("3개 선택됨");
  await card.locator(".tasks-card-open").click({ modifiers: ["Control"] });
  await expect(bar).toContainText("4개 선택됨");
  await expect(card).toHaveClass(/tasks-card-selected/);
  expect(
    api.requests.filter((r) => ["PATCH", "DELETE"].includes(r.method)),
  ).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
  await expect(first).toBeFocused();
  await expect(page.locator('[data-selection-key="task:800"]')).not.toHaveClass(/tasks-subtask-selected/);
});

test("전체 선택은 접힌 할 일을 제외하고 일정 선택은 자식에게 전파되지 않는다", async ({
  page,
}) => {
  const { card, bar } = await setup(page);
  await card.locator(".tasks-card-open").click({ modifiers: ["Control"] });
  await expect(bar).toContainText("1개 선택됨");
  await expect(card.locator(".tasks-subtask-selected")).toHaveCount(0);
  const visibleCount = await page
    .locator("[data-selection-key]:visible")
    .count();
  await bar.getByRole("button", { name: "전체 선택", exact: true }).click();
  await expect(bar.getByRole("status")).toHaveText(`${visibleCount}개 선택됨`);
  await expect(
    page.locator('[data-selection-key="task:803"]'),
  ).not.toHaveClass(/tasks-subtask-selected/);
  await bar.getByRole("button", { name: "선택 해제", exact: true }).click();
  await expect(bar).toHaveCount(0);
});

test("혼합 선택의 완료 처리·해제는 선택한 항목만 변경한다", async ({
  page,
}) => {
  const { api, card, bar } = await setup(page);
  const selectTask = () =>
    page.locator('[data-selection-key="task:800"] .tasks-subtask-open').click({ modifiers: ["Control"] });
  const selectSchedule = () =>
    card.locator(".tasks-card-open").click({ modifiers: ["Control"] });
  await selectTask();
  await selectSchedule();
  await bar.getByRole("button", { name: "완료 처리", exact: true }).click();
  await expect(bar).toHaveCount(0);
  expect(api.state.tasks[0].status).toBe("done");
  expect(api.state.tasks[1].status).toBe("todo");
  expect(
    api.state.schedules.find((s) => s.schedule_id === 201)?.is_completed,
  ).toBe(true);
  await expect(card.getByRole("button", { name: "완료된 할 일 2개" })).toHaveAttribute("aria-expanded", "true");
  await selectTask();
  await selectSchedule();
  await bar.getByRole("button", { name: "완료 해제", exact: true }).click();
  await expect(bar).toHaveCount(0);
  expect(api.state.tasks[0].status).toBe("todo");
  expect(
    api.state.schedules.find((s) => s.schedule_id === 201)?.is_completed,
  ).toBe(false);
});

test("선택 삭제는 취소 가능하며 확인 후 선택 항목만 삭제한다", async ({
  page,
}) => {
  const { api, bar } = await setup(page);
  await page.locator('[data-selection-key="task:800"] .tasks-subtask-open').click({ modifiers: ["Control"] });
  page.once("dialog", (dialog) => dialog.dismiss());
  await bar.getByRole("button", { name: "삭제", exact: true }).click();
  expect(api.state.tasks).toHaveLength(6);
  page.once("dialog", (dialog) => dialog.accept());
  await bar.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(bar).toHaveCount(0);
  expect(api.state.tasks).toHaveLength(5);
  expect(api.state.tasks.some((t) => t.task_id === 800)).toBe(false);
});

test("부분 실패 항목을 선택한 채로 유지해 재시도한다", async ({ page }) => {
  const { api, bar } = await setup(page);
  await page.route("**/tasks/801", async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "테스트 실패" }),
      });
    else await route.fallback();
  });
  await page.locator('[data-selection-key="task:800"] .tasks-subtask-open').click({ modifiers: ["Control"] });
  await page.locator('[data-selection-key="task:801"] .tasks-subtask-open').click({ modifiers: ["Control"] });
  await bar.getByRole("button", { name: "완료 처리", exact: true }).click();
  await expect(bar.getByRole("status")).toHaveText("1개 선택됨");
  expect(api.state.tasks[0].status).toBe("done");
  await expect(
    page.locator('[data-selection-key="task:801"]'),
  ).toHaveClass(/tasks-subtask-selected/);
  await page.unroute("**/tasks/801");
  await bar.getByRole("button", { name: "완료 처리", exact: true }).click();
  await expect(bar).toHaveCount(0);
  expect(api.state.tasks[1].status).toBe("done");
});
