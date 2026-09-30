import { expect, test } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

for (const dark of [false, true]) {
  test(`mini calendar follows schedule creation and date navigation (${dark ? "dark" : "light"})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    const api = await installMockApi(page);
    await page.clock.setFixedTime(new Date(QA_NOW));
    await seedAuth(page);
    if (dark) {
      await page.addInitScript(() => localStorage.setItem(
        "flowra:user-settings", JSON.stringify({ theme: "dark" }),
      ));
    }
    await page.goto("/schedules");
    const mini = page.locator("[data-flowra-schedule-sidebar]");
    const calendar = page.locator("[data-flowra-schedule-page]");
    const selected = mini.getByRole("button", { pressed: true });
    const today = mini.locator('[aria-current="date"]');
    await expect(selected).toHaveText("9");

    await page.getByRole("button", { name: "9월 10일 종일 일정 추가", exact: true }).click();
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toBeVisible();
    await expect(selected).toHaveText("10");
    await expect(selected).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect.poll(() => selected.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe("none");
    await expect(today).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(today).toHaveAttribute("aria-pressed", "false");
    await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "닫기", exact: true }).click();

    await page.getByRole("button", { name: "보기 선택", exact: true }).click();
    await page.getByRole("menuitem", { name: "월 M", exact: true }).click();
    const day = calendar.getByRole("button", { name: "15", exact: true }).first();
    await day.locator("..").getByRole("button", { name: "추가", exact: true }).click();
    await expect(selected).toHaveText("15");
    await expect(page.getByLabel("시작 날짜", { exact: true })).toHaveValue("09.15(화)");
    await expect(page.getByRole("button", { name: "보기 선택", exact: true })).toHaveText("월");
    await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "닫기", exact: true }).click();

    await calendar.getByRole("button", { name: "16", exact: true }).first().click();
    await expect(selected).toHaveText("16");
    await expect(page.getByRole("button", { name: "보기 선택", exact: true })).toHaveText("일");

    await mini.getByRole("button", { name: "Next month", exact: true }).click();
    await mini.getByRole("button").filter({ hasText: /^12$/ }).click();
    await expect(selected).toHaveText("12");
    await expect(mini.getByText("2026년 10월", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "10월 12일 종일 일정 추가", exact: true })).toBeVisible();
    expect(api.unhandled).toEqual([]);
  });
}
