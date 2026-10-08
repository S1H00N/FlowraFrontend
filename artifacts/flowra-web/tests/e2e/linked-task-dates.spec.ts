import { expect, test, type Page } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

async function setup(page: Page) {
  const api = await installMockApi(page);
  api.state.schedules = [api.state.schedules[0]];
  api.state.tasks = [
    { task_id: 801, title: "QA 날짜 변경 할 일", schedule_id: 201, status: "todo", priority: "medium", due_datetime: "2026-09-09T12:30:00+09:00", created_at: QA_NOW },
    { task_id: 802, title: "QA 완료한 연결 할 일", schedule_id: 201, status: "done", priority: "medium", due_datetime: "2026-09-09T18:45:00+09:00", completed_at: QA_NOW, created_at: QA_NOW },
    { task_id: 803, title: "QA 마감 없는 연결 할 일", schedule_id: 201, status: "todo", priority: "medium", due_datetime: null, created_at: QA_NOW },
    { task_id: 804, title: "QA 독립 날짜 유지", schedule_id: null, status: "todo", priority: "medium", due_datetime: "2026-09-09T09:15:00+09:00", created_at: QA_NOW },
  ];
  await seedAuth(page);
  await page.clock.setFixedTime(new Date(QA_NOW));
  await page.goto("/schedules");
  await page.getByRole("button", { name: "보기 선택", exact: true }).click();
  await page.getByRole("menuitem", { name: "월 M", exact: true }).click();
  await page.getByRole("button", { name: "QA 디자인 검토 회의 select", exact: true }).click();
  await expect(page.getByRole("heading", { name: "일정 수정", exact: true })).toBeVisible();
  return api;
}

async function moveToSeptember10(page: Page) {
  await page.getByLabel("시작 날짜", { exact: true }).click();
  await page.locator(".schedule-date-popover").getByRole("button", { name: "10", exact: true }).click();
  await expect(page.getByLabel("종료 날짜", { exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.locator(".schedule-date-popover").getByRole("button", { name: "10", exact: true }).click();
  await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "저장", exact: true }).click();
}

function taskPatchIds(api: Awaited<ReturnType<typeof installMockApi>>) {
  return api.requests.filter((request) => request.method === "PATCH" && /^\/tasks\/\d+$/.test(request.path))
    .map((request) => Number(request.path.split("/").at(-1))).sort();
}

test("날짜 이동은 완료 상태와 시간을 보존하고 마감 없는 할 일·독립 할 일은 유지한다", async ({ page }) => {
  const api = await setup(page);
  await moveToSeptember10(page);
  await expect(page.getByRole("heading", { name: "일정 수정", exact: true })).toHaveCount(0);
  expect(api.state.tasks.map((task) => task.due_datetime)).toEqual([
    "2026-09-10T12:30:00+09:00", "2026-09-10T18:45:00+09:00", null, "2026-09-09T09:15:00+09:00",
  ]);
  expect(api.state.tasks[1].status).toBe("done");
  expect(api.state.tasks[1].completed_at).toBe(QA_NOW);
  expect(taskPatchIds(api)).toEqual([801, 802]);
  const taskRead = api.requests.find((request) => request.method === "GET" && new URL(request.url).searchParams.get("schedule_id") === "201");
  expect(taskRead).toBeDefined();
  expect([...new URL(taskRead!.url).searchParams.keys()]).toEqual(["schedule_id"]);
  await page.reload();
  await page.getByRole("button", { name: "보기 선택", exact: true }).click();
  await page.getByRole("menuitem", { name: "월 M", exact: true }).click();
  await page.getByRole("button", { name: "QA 디자인 검토 회의 select", exact: true }).click();
  await expect(page.getByLabel("시작 날짜", { exact: true })).toHaveValue("09.10(목)");
  expect(api.unhandled).toEqual([]);
});

test("연결 할 일 일부 저장 실패는 일정 저장을 유지하고 실제 마감일을 다시 조회한다", async ({ page }) => {
  const api = await setup(page);
  let failedWrites = 0;
  await page.route("**/api/v1/tasks/802", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    failedWrites += 1;
    await route.fulfill({ status: 500, json: { success: false, message: "QA 마감 저장 실패", error: { code: "QA_INJECTED_ERROR" } } });
  });
  await moveToSeptember10(page);
  await expect(page.getByText("일정 날짜는 변경됐지만 연결된 할 일 날짜를 모두 갱신하지 못했습니다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "일정 수정", exact: true })).toHaveCount(0);
  expect(api.state.schedules[0].start_datetime).toContain("2026-09-10T10:00");
  expect(api.state.tasks[0].due_datetime).toBe("2026-09-10T12:30:00+09:00");
  expect(api.state.tasks[1].due_datetime).toBe("2026-09-09T18:45:00+09:00");
  expect(failedWrites).toBe(1);
  // The task cache has been invalidated even though only some PATCHes succeeded.
  await page.goto("/tasks");
  await expect.poll(() => api.requests.filter((request) => request.method === "GET" && request.path === "/tasks").length).toBeGreaterThan(1);
  expect(taskPatchIds(api)).toEqual([801]);
  expect(api.unhandled).toEqual([]);
});

test("일정 저장 후 응답이 유실되면 자동 재저장 없이 달력에 서버 날짜를 복구한다", async ({ page }) => {
  const api = await setup(page);
  let writes = 0;
  await page.route("**/api/v1/schedules/201", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    writes += 1;
    Object.assign(api.state.schedules[0], route.request().postDataJSON());
    await route.abort("failed");
  });
  await moveToSeptember10(page);
  await expect.poll(() => api.requests.filter((request) => request.method === "GET" && request.path === "/schedules").length).toBeGreaterThan(1);
  await expect(page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "저장", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "일정 추가 패널 닫기", exact: true }).click();
  await page.getByRole("button", { name: "QA 디자인 검토 회의 select", exact: true }).click();
  await expect(page.getByLabel("시작 날짜", { exact: true })).toHaveValue("09.10(목)");
  expect(writes).toBe(1);
  expect(taskPatchIds(api)).toEqual([]);
  expect(api.unhandled).toEqual([]);
});
