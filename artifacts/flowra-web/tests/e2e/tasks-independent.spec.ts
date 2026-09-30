import { expect, test } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

test("독립 할 일이 없어도 필터 아래에서 바로 추가할 수 있다", async ({ page }, testInfo) => {
  const api = await installMockApi(page);
  api.state.tasks = [];
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);

  await page.goto("/tasks");
  const board = page.locator("[data-flowra-task-board]");
  const section = board.locator(".tasks-independent-section");
  await expect(section).toBeVisible();
  const toggle = section.getByRole("button", { name: /독립 할 일/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(section.getByText("아직 독립 할 일이 없습니다.", { exact: true })).toBeVisible();

  const appearsBetweenFiltersAndSchedules = await board.evaluate((root) => {
    const toolbar = root.querySelector(".tasks-toolbar");
    const independent = root.querySelector(".tasks-independent-section");
    const schedule = root.querySelector(".tasks-section");
    return Boolean(
      toolbar &&
        independent &&
        schedule &&
        toolbar.compareDocumentPosition(independent) & Node.DOCUMENT_POSITION_FOLLOWING &&
        independent.compareDocumentPosition(schedule) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  expect(appearsBetweenFiltersAndSchedules).toBe(true);
  const screenshotPath = testInfo.outputPath("independent-section.png");
  await page.screenshot({ path: screenshotPath, animations: "disabled", fullPage: true });
  await testInfo.attach("independent-section", {
    path: screenshotPath,
    contentType: "image/png",
  });

  await section.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const title = section.getByRole("textbox", { name: "새 할 일" });
  await expect(title).toBeFocused();
  await title.fill("QA 독립 할 일 추가");
  await title.press("Enter");

  await expect(section.getByText("QA 독립 할 일 추가", { exact: true })).toBeVisible();
  await expect.poll(() => api.requests.filter((request) => request.method === "POST" && request.path === "/tasks").length).toBe(1);
  const createRequest = api.requests.find((request) => request.method === "POST" && request.path === "/tasks");
  expect(createRequest?.body.title).toBe("QA 독립 할 일 추가");
  expect(createRequest?.body).not.toHaveProperty("schedule_id");
  expect(api.state.tasks.find((task) => task.title === "QA 독립 할 일 추가")?.schedule_id).toBeNull();

  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(section.getByText("QA 독립 할 일 추가", { exact: true })).toHaveCount(0);
  await toggle.click();
  await expect(board.locator(".tasks-independent-section").getByText("QA 독립 할 일 추가", { exact: true })).toBeVisible();
  expect(api.unhandled).toEqual([]);
});

test("오늘 필터에서 기한 없는 독립 할 일을 만들면 전체 목록에 표시된다", async ({ page }) => {
  const api = await installMockApi(page);
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);

  await page.goto("/tasks");
  const board = page.locator("[data-flowra-task-board]");
  const filters = board.getByRole("group", { name: "할 일 필터" });
  await filters.getByRole("button", { name: /^오늘 \d+$/ }).click();
  await expect(filters.getByRole("button", { name: /^오늘 \d+$/ })).toHaveAttribute("aria-pressed", "true");

  const section = board.locator(".tasks-independent-section");
  await section.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const title = section.getByRole("textbox", { name: "새 할 일" });
  await title.fill("QA 오늘 필터에서 만든 독립 할 일");
  await title.press("Enter");

  await expect(filters.getByRole("button", { name: /^전체 \d+$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(section.getByText("QA 오늘 필터에서 만든 독립 할 일", { exact: true })).toBeVisible();
  const created = api.state.tasks.find((task) => task.title === "QA 오늘 필터에서 만든 독립 할 일");
  expect(created?.schedule_id).toBeNull();
  expect(created?.due_datetime).toBeNull();
  expect(api.unhandled).toEqual([]);
});
