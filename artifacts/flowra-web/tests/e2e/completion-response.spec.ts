import { expect, test } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

test("할 일과 일정은 저장 응답 전에도 완료 상태가 보인다", async ({ page }) => {
  const api = await installMockApi(page);
  api.state.tasks = [{
    task_id: 800,
    title: "응답 대기 테스트",
    schedule_id: 201,
    status: "todo",
    priority: "medium",
    created_at: QA_NOW,
  }];
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");

  let releaseTask!: () => void;
  let taskStarted!: () => void;
  const taskGate = new Promise<void>((resolve) => { releaseTask = resolve; });
  const taskRequest = new Promise<void>((resolve) => { taskStarted = resolve; });
  await page.route("**/tasks/800", async (route) => {
    if (route.request().method() === "PATCH") {
      taskStarted();
      await taskGate;
    }
    await route.fallback();
  });

  const taskToggle = page.getByRole("checkbox", { name: "응답 대기 테스트 완료" });
  try {
    await taskToggle.click();
    await taskRequest;
    await expect(taskToggle).toBeChecked();
    expect(api.state.tasks[0].status).toBe("todo");
  } finally {
    releaseTask();
  }
  await expect.poll(() => api.state.tasks[0].status).toBe("done");

  let releaseSchedule!: () => void;
  let scheduleStarted!: () => void;
  const scheduleGate = new Promise<void>((resolve) => { releaseSchedule = resolve; });
  const scheduleRequest = new Promise<void>((resolve) => { scheduleStarted = resolve; });
  await page.route("**/schedules/201", async (route) => {
    if (route.request().method() === "PATCH") {
      scheduleStarted();
      await scheduleGate;
    }
    await route.fallback();
  });

  const card = page.locator('[data-selection-key="schedule:201"]');
  try {
    await card.getByRole("button", { name: "QA 디자인 검토 회의 더보기" }).click();
    await page.getByRole("menuitem", { name: "일정 완료로 표시" }).click();
    await scheduleRequest;
    await expect(card).toHaveClass(/tasks-card-completed/);
    expect(api.state.schedules.find((schedule) => schedule.schedule_id === 201)?.is_completed).toBe(false);
  } finally {
    releaseSchedule();
  }
  await expect.poll(() => api.state.schedules.find((schedule) => schedule.schedule_id === 201)?.is_completed).toBe(true);
});

test("선택한 여러 항목의 완료 요청은 함께 시작된다", async ({ page }) => {
  const api = await installMockApi(page);
  api.state.tasks = [800, 801].map((taskId) => ({
    task_id: taskId,
    title: `동시 처리 ${taskId}`,
    schedule_id: 201,
    status: "todo" as const,
    priority: "medium" as const,
    created_at: QA_NOW,
  }));
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");

  let release!: () => void;
  let bothStarted!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requestsStarted = new Promise<void>((resolve) => { bothStarted = resolve; });
  const pendingIds = new Set<number>();
  await page.route(/\/tasks\/(800|801)$/, async (route) => {
    if (route.request().method() === "PATCH") {
      pendingIds.add(Number(route.request().url().split("/").pop()));
      if (pendingIds.size === 2) bothStarted();
      await gate;
    }
    await route.fallback();
  });

  const bar = page.getByRole("group", { name: "선택한 항목 작업" });
  try {
    await page.getByRole("checkbox", { name: "동시 처리 800 선택" }).check();
    await page.getByRole("checkbox", { name: "동시 처리 801 선택" }).check();
    await bar.getByRole("button", { name: "완료 처리", exact: true }).click();
    await requestsStarted;
    expect(pendingIds.size).toBe(2);
    expect(api.state.tasks.every((task) => task.status === "todo")).toBe(true);
  } finally {
    release();
  }
  await expect(bar).toHaveCount(0);
  expect(api.state.tasks.every((task) => task.status === "done")).toBe(true);
});
