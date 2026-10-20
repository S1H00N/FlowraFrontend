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
  const title = section.getByRole("textbox", { name: "새 할 일", exact: true });
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
  const title = section.getByRole("textbox", { name: "새 할 일", exact: true });
  await title.fill("QA 오늘 필터에서 만든 독립 할 일");
  await title.press("Enter");

  await expect(filters.getByRole("button", { name: /^전체 \d+$/ })).toHaveAttribute("aria-pressed", "true");
  await expect(section.getByText("QA 오늘 필터에서 만든 독립 할 일", { exact: true })).toBeVisible();
  const created = api.state.tasks.find((task) => task.title === "QA 오늘 필터에서 만든 독립 할 일");
  expect(created?.schedule_id).toBeNull();
  expect(created?.due_datetime).toBeNull();
  expect(api.unhandled).toEqual([]);
});

test("빠른 추가의 달력과 시간 선택을 유지하고 선택 후 Enter로 한 번만 등록한다", async ({ page }) => {
  const api = await installMockApi(page);
  api.state.tasks = [];
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");

  const section = page.locator(".tasks-independent-section");
  await section.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const form = section.getByRole("form", { name: "빠른 할 일 추가", exact: true });
  const title = form.getByRole("textbox", { name: "새 할 일", exact: true });
  const dateSettings = form.getByRole("button", { name: "날짜·시간 설정", exact: true });
  const date = form.getByRole("textbox", { name: "새 할 일 마감일", exact: true });
  const time = form.getByRole("textbox", { name: "새 할 일 마감 시간", exact: true });
  const creates = () => api.requests.filter((request) => request.method === "POST" && request.path === "/tasks");
  await title.fill("QA 날짜와 시간을 선택한 할 일");
  await expect(dateSettings).toHaveAttribute("aria-expanded", "false");
  await expect(dateSettings).toHaveAttribute("aria-controls", /.+/);
  await expect(date).toBeHidden();
  await expect(time).toBeHidden();
  await dateSettings.click();
  await expect(dateSettings).toHaveAttribute("aria-expanded", "true");
  await expect(time).toBeDisabled();

  await date.fill("2026-09-11");
  await date.press("Enter");
  await expect(date).toHaveValue("09.11(금)");
  expect(creates()).toHaveLength(0);
  await date.click();
  const calendar = form.locator(".schedule-date-popover");
  await expect(calendar).toBeVisible();
  expect(await calendar.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= window.innerWidth;
  })).toBe(true);
  await calendar.getByRole("button", { name: "10", exact: true }).click();
  await expect(form).toBeVisible();
  await expect(calendar).toHaveCount(0);
  await expect(date).toHaveValue("09.10(목)");
  await expect(time).toBeEnabled();

  await time.click();
  const options = form.getByRole("listbox", { name: "새 할 일 마감 시간 선택", exact: true });
  await expect(options).toBeVisible();
  await options.getByRole("option", { name: "09:30", exact: true }).click();
  await expect(time).toHaveValue("09:30");
  await expect(options).toHaveCount(0);
  await dateSettings.click();
  await expect(dateSettings).toHaveAttribute("aria-expanded", "false");
  await expect(date).toBeHidden();
  await expect(time).toBeHidden();
  await dateSettings.click();
  await expect(dateSettings).toHaveAttribute("aria-expanded", "true");
  await expect(date).toHaveValue("09.10(목)");
  await expect(time).toHaveValue("09:30");
  await time.click();
  await time.press("Enter");
  expect(creates()).toHaveLength(0);
  expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);

  await time.press("Enter");
  await expect(section.getByText("QA 날짜와 시간을 선택한 할 일", { exact: true })).toBeVisible();
  await expect.poll(() => creates().length).toBe(1);
  expect(creates()[0].body.due_datetime).toBe("2026-09-10T09:30:00+09:00");
  expect(creates()[0].body).not.toHaveProperty("schedule_id");
  await expect(title).toHaveValue("");
  await expect(title).toBeFocused();
  await expect(dateSettings).toHaveAttribute("aria-expanded", "false");
  await expect(date).toBeHidden();
  await expect(time).toBeHidden();
  await expect(form.getByRole("button", { name: "새 할 일 마감일 제거", exact: true })).toHaveCount(0);
  expect(api.unhandled).toEqual([]);
});

test("빠른 추가의 선택기 Escape와 마감 제거 및 외부 클릭이 작성 상태를 올바르게 처리한다", async ({ page }) => {
  const api = await installMockApi(page);
  api.state.tasks = [];
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");

  const section = page.locator(".tasks-independent-section");
  const add = section.getByRole("button", { name: "할 일 추가", exact: true });
  await add.click();
  const form = section.getByRole("form", { name: "빠른 할 일 추가", exact: true });
  const title = form.getByRole("textbox", { name: "새 할 일", exact: true });
  const dateSettings = form.getByRole("button", { name: "날짜·시간 설정", exact: true });
  const date = form.getByRole("textbox", { name: "새 할 일 마감일", exact: true });
  const time = form.getByRole("textbox", { name: "새 할 일 마감 시간", exact: true });
  const calendar = form.locator(".schedule-date-popover");
  await title.fill("QA 마감을 제거한 할 일");
  await expect(dateSettings).toHaveAttribute("aria-expanded", "false");
  await expect(date).toBeHidden();
  await dateSettings.click();
  await date.click();
  await calendar.getByRole("button", { name: "12", exact: true }).click();
  await expect(date).toHaveValue("09.12(토)");

  await date.click();
  await expect(calendar).toBeVisible();
  await date.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(form).toBeVisible();
  await expect(title).toHaveValue("QA 마감을 제거한 할 일");
  await time.click();
  await expect(form.getByRole("listbox")).toBeVisible();
  await time.press("Escape");
  await expect(form.getByRole("listbox")).toHaveCount(0);
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "새 할 일 마감일 제거", exact: true }).click();
  await expect(time).toBeDisabled();
  await title.press("Enter");
  await expect.poll(() => api.state.tasks.find((task) => task.title === "QA 마감을 제거한 할 일")?.due_datetime).toBeNull();
  await expect(title).toHaveValue("");
  await expect(dateSettings).toHaveAttribute("aria-expanded", "false");
  await expect(date).toBeHidden();

  await title.fill("QA 외부 클릭으로 취소할 할 일");
  await dateSettings.click();
  await date.click();
  await expect(calendar).toBeVisible();
  await page.getByRole("group", { name: "할 일 필터" }).getByRole("button", { name: /^전체 \d+$/ }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator(".schedule-date-popover")).toHaveCount(0);
  await add.click();
  await expect(title).toHaveValue("");
  await expect(dateSettings).toHaveAttribute("aria-expanded", "false");
  await expect(date).toBeHidden();
  await expect(time).toBeHidden();
  await dateSettings.click();
  await form.getByRole("button", { name: "빠른 추가 취소", exact: true }).click();
  await add.click();
  await expect(dateSettings).toHaveAttribute("aria-expanded", "false");
  await expect(date).toBeHidden();
  expect(api.requests.filter((request) => request.method === "POST" && request.path === "/tasks")).toHaveLength(1);
  expect(api.unhandled).toEqual([]);
});
