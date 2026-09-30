import { expect, test } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

test("오늘·내일·이후 일정 묶음을 각각 접고 펼칠 수 있다", async ({ page }) => {
  const api = await installMockApi(page);
  api.state.schedules.push({
    ...api.state.schedules[2],
    schedule_id: 204,
    title: "QA 이후 일정",
    start_datetime: "2026-09-20T10:00:00+09:00",
    end_datetime: "2026-09-20T11:00:00+09:00",
  });
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");

  const board = page.locator("[data-flowra-task-board]");
  const today = board.locator('.tasks-section[aria-label="오늘"]');
  const tomorrow = board.locator('.tasks-section[aria-label="내일"]');
  const later = board.locator('.tasks-section[aria-label="이후"]');
  await expect(today.locator(".tasks-schedule-row")).toHaveCount(2);
  await expect(tomorrow.locator(".tasks-schedule-row")).toHaveCount(1);
  await expect(later.locator(".tasks-schedule-row")).toHaveCount(1);

  const todayToggle = today.locator(".tasks-section-toggle");
  await expect(todayToggle).toHaveAccessibleName("오늘 2");
  await todayToggle.click();
  await expect(todayToggle).toHaveAttribute("aria-expanded", "false");
  await expect(today.locator(".tasks-schedule-row")).toHaveCount(0);
  await expect(tomorrow.locator(".tasks-schedule-row")).toHaveCount(1);
  await expect(later.locator(".tasks-schedule-row")).toHaveCount(1);
  await expect(board.locator(".tasks-independent-section")).toBeVisible();

  await later.locator(".tasks-section-toggle").click();
  await expect(later.locator(".tasks-schedule-row")).toHaveCount(0);
  await expect(tomorrow.locator(".tasks-schedule-row")).toHaveCount(1);

  await todayToggle.click();
  await expect(todayToggle).toHaveAttribute("aria-expanded", "true");
  await expect(today.locator(".tasks-schedule-row")).toHaveCount(2);
});
