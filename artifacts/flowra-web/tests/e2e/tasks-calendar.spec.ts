import { expect, test } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

for (const dark of [false, true]) {
  test(`mini calendar selects dates across months and distinguishes today (${dark ? "dark" : "light"})`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    const api = await installMockApi(page);
    api.state.schedules.push({
      ...api.state.schedules[0],
      schedule_id: 204,
      title: "QA 다음 달 일정",
      start_datetime: "2026-10-12T10:00:00+09:00",
      end_datetime: "2026-10-12T11:00:00+09:00",
    });
    await page.clock.setFixedTime(new Date(QA_NOW));
    await seedAuth(page);
    if (dark)
      await page.addInitScript(() =>
        localStorage.setItem(
          "flowra:user-settings",
          JSON.stringify({ theme: "dark" }),
        ),
      );
    await page.goto("/tasks");
    const calendar = page.locator("[data-flowra-schedule-sidebar]");
    const board = page.locator("[data-flowra-task-board]");
    const today = calendar.locator('[aria-current="date"]');
    const tomorrow = calendar.getByRole("button", { name: /^9월 10일/ });
    await expect(today).toHaveAttribute("aria-pressed", "false");
    await tomorrow.click();
    await expect(tomorrow).toHaveAttribute("aria-pressed", "true");
    await expect(today).toHaveAttribute("aria-pressed", "false");
    expect(
      await today.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).not.toBe(
      await tomorrow.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    await expect(
      board.getByRole("heading", { name: "QA 디자인 검토 회의", exact: true }),
    ).toHaveCount(0);
    await board.locator(".tasks-independent-section").getByRole("button", { name: /독립 할 일/ }).click();
    await expect(
      board.getByText("QA 진행 중인 할 일", { exact: true }),
    ).toBeVisible();
    await today.click();
    await expect(calendar.getByRole("button", { pressed: true })).toHaveCount(
      2,
    );
    await expect(
      board.getByRole("heading", { name: "QA 디자인 검토 회의", exact: true }),
    ).toBeVisible();
    await expect(
      board.getByText("QA 오늘 할 일", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`calendar-${dark ? "dark" : "light"}.png`),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(board.locator(".tasks-date-filter")).toHaveCount(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 1280, height: 900 });
    await tomorrow.click();
    await expect(calendar.getByRole("button", { pressed: true })).toHaveCount(
      1,
    );
    await expect(
      board.getByRole("heading", { name: "QA 하루 일정", exact: true }),
    ).toHaveCount(0);
    await calendar
      .getByRole("button", { name: "다음 달", exact: true })
      .click();
    await calendar.getByRole("button", { name: /^10월 12일/ }).click();
    await expect(board.locator(".tasks-date-filter")).toHaveCount(2);
    await expect(
      board.getByRole("heading", { name: "QA 디자인 검토 회의", exact: true }),
    ).toBeVisible();
    await expect(
      board.getByRole("heading", { name: "QA 다음 달 일정", exact: true }),
    ).toBeVisible();
    const requests = api.requests.filter(
      (request) => request.path === "/schedules",
    );
    const range = new URL(requests.at(-1)!.url).searchParams;
    expect(new Date(range.get("start_from")!).getTime()).toBeLessThanOrEqual(
      new Date(QA_NOW).getTime(),
    );
    await board
      .getByRole("button", { name: "9월 9일 (수) 선택 해제", exact: true })
      .click();
    await expect(
      board.getByRole("heading", { name: "QA 디자인 검토 회의", exact: true }),
    ).toHaveCount(0);
    await calendar.getByRole("button", { name: /^10월 12일/ }).click();
    await expect(board.locator(".tasks-date-filter")).toHaveCount(0);
    await expect(calendar.getByRole("button", { pressed: true })).toHaveCount(
      0,
    );
    await calendar
      .getByRole("button", { name: "이번 달로 이동", exact: true })
      .click();
    await today.click();
    await tomorrow.click();
    await board
      .getByRole("button", { name: "날짜 선택 해제", exact: true })
      .click();
    await expect(calendar.getByRole("button", { pressed: true })).toHaveCount(
      0,
    );
    await expect(board.locator(".tasks-date-filter")).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
  });
}
