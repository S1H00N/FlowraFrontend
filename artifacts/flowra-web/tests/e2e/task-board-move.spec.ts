import { expect, test, type Page, type Route } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth, type MockOptions } from "./fixtures";

async function setup(page: Page, options: MockOptions = {}) {
  const api = await installMockApi(page, options);
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  const independent = page.locator(".tasks-independent-section");
  await independent.getByRole("button", { name: /독립 할 일/ }).click();
  await expect(page.locator("#task-101")).toHaveAttribute("draggable", "true");
  return { api, independent };
}
const schedule = (page: Page, id: number) =>
  page.locator(`article[data-selection-key="schedule:${id}"]`);

test("독립 목록 순서를 브라우저에 저장하고 순서 API를 호출하지 않는다", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "터치 환경은 이동 메뉴로 검사");
  const { api, independent } = await setup(page);
  const titles = independent.locator(
    ".tasks-subtask-open .tasks-subtask-title",
  );
  await page
    .locator("#task-104 .tasks-subtask-open")
    .dragTo(page.locator("#task-101"), { targetPosition: { x: 70, y: 2 } });
  await expect(titles).toHaveText([
    "QA 기한 없는 할 일",
    "QA 오늘 할 일",
    "QA 진행 중인 할 일",
    "QA 완료한 할 일",
  ]);
  expect(api.requests.filter((r) => r.path.startsWith("/tasks/") && r.method !== "GET")).toEqual([]);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flowra-task-order:9001") ?? "[]")[0])).toBe(104);
  await page.reload();
  await independent.getByRole("button", { name: /독립 할 일/ }).click();
  await expect(titles.first()).toHaveText("QA 기한 없는 할 일");
  await page
    .locator("#task-104 .tasks-subtask-open")
    .dragTo(independent.locator(".tasks-independent-header"));
  await expect(titles).toHaveText([
    "QA 오늘 할 일",
    "QA 진행 중인 할 일",
    "QA 기한 없는 할 일",
    "QA 완료한 할 일",
  ]);
  expect(api.requests.filter((r) => r.path.startsWith("/tasks/") && r.method !== "GET")).toEqual([]);
  expect(api.requests.some((r) => r.path === "/tasks/order")).toBe(false);
  expect(api.state.tasks.find((task) => task.task_id === 104)?.sort_order ?? null).toBeNull();
  expect(api.unhandled).toEqual([]);
});

test("빈 접힌 일정으로 연결하고 다른 일정과 독립 목록으로 다시 이동한다", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "터치 환경은 이동 메뉴로 검사");
  const { api, independent } = await setup(page);
  const originalDue = api.state.tasks.find(
    (t) => t.task_id === 101,
  )?.due_datetime;
  await page
    .locator("#task-101 .tasks-subtask-open")
    .dragTo(schedule(page, 201));
  await expect(schedule(page, 201).locator("#task-101")).toBeVisible();
  await expect(independent.locator("#task-101")).toHaveCount(0);
  await page
    .locator("#task-101 .tasks-subtask-open")
    .dragTo(schedule(page, 202));
  await expect(schedule(page, 202).locator("#task-101")).toBeVisible();
  await page
    .locator("#task-101 .tasks-subtask-open")
    .dragTo(independent.locator(".tasks-independent-header"));
  await expect(independent.locator("#task-101")).toBeVisible();
  await expect
    .poll(() => api.state.tasks.find((t) => t.task_id === 101)?.schedule_id)
    .toBeNull();
  expect(api.state.tasks.find((t) => t.task_id === 101)?.due_datetime).toBe(
    originalDue,
  );
  expect(
    api.requests
      .filter((r) => r.path === "/tasks/101" && r.method === "PATCH")
      .map((r) => r.body.schedule_id),
  ).toEqual(["201", "202", null]);
  expect(api.unhandled).toEqual([]);
});

test("저장 실패하면 낙관적으로 이동한 할 일을 원래 목록에 복구한다", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "터치 환경은 이동 메뉴로 검사");
  const { api, independent } = await setup(page, {
    failures: { "PATCH /tasks/101": 500 },
  });
  await page
    .locator("#task-101 .tasks-subtask-open")
    .dragTo(schedule(page, 201));
  await expect(
    page.getByText("QA 테스트용 서버 오류입니다.").first(),
  ).toBeVisible();
  await expect(independent.locator("#task-101")).toBeVisible();
  expect(
    api.state.tasks.find((t) => t.task_id === 101)?.schedule_id ?? null,
  ).toBeNull();
});

test("키보드로 순서를 바꾸고 모바일 이동 메뉴로 소속을 바꾼다", async ({ page }) => {
  const { api, independent } = await setup(page);
  await page.locator("#task-102").press("ArrowUp");
  await expect(independent.locator(".tasks-subtask-title").first()).toHaveText(
    "QA 진행 중인 할 일",
  );
  await page
    .locator("#task-102")
    .getByRole("button", { name: /이동 메뉴/ })
    .click();
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await expect(page.getByRole("menuitem", { name: "위로 이동", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "아래로 이동", exact: true })).toHaveCount(0);
  await page
    .getByRole("menuitem", {
      name: "다른 일정으로 이동…",
      exact: true,
    })
    .click();
  const picker = page.getByRole("dialog", { name: "다른 일정으로 이동", exact: true });
  await picker.locator('button[data-schedule-id="201"]').click();
  await picker.getByRole("button", { name: "이 일정으로 이동", exact: true }).click();
  await expect(schedule(page, 201).locator("#task-102")).toBeVisible();
  expect(api.unhandled).toEqual([]);
});

test("독립 목록 이동은 후속 조회가 느려도 PATCH 완료 즉시 메뉴를 다시 연다", async ({ page }) => {
  const api = await installMockApi(page);
  api.state.tasks[0].schedule_id = 201;
  const originalDue = api.state.tasks[0].due_datetime;
  const originalStatus = api.state.tasks[0].status;
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  const independent = page.locator(".tasks-independent-section");
  await independent.getByRole("button", { name: /독립 할 일/ }).click();
  await schedule(page, 201).locator(".tasks-card-open").click();
  const menu = page.locator("#task-101").getByRole("button", { name: /이동 메뉴/ });
  await expect(menu).toBeEnabled();
  let releaseSave!: () => void;
  let releaseRefresh!: () => void;
  const saveGate = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let saveStarted = false;
  let refreshStarted = false;
  let refreshFinished = false;
  let patchCount = 0;
  const handler = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname === "/api/v1/tasks/101") {
      saveStarted = true;
      patchCount += 1;
      await saveGate;
    } else if (request.method() === "GET" && url.pathname === "/api/v1/tasks") {
      refreshStarted = true;
      await refreshGate;
      refreshFinished = true;
    }
    return route.fallback();
  };
  const taskRoutes = /\/api\/v1\/tasks(?:\/|\?|$)/;
  await page.route(taskRoutes, handler);
  try {
    await menu.click();
    await expect(page.getByRole("menuitem")).toHaveCount(2);
    await expect(page.getByRole("menuitem", { name: "위로 이동", exact: true })).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: "아래로 이동", exact: true })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "독립 할 일로 이동", exact: true }).click();
    await expect.poll(() => saveStarted).toBe(true);
    await expect(independent.locator("#task-101")).toBeVisible();
    await expect(menu).toBeDisabled();
    expect(refreshStarted).toBe(false);
    releaseSave();
    await expect.poll(() => refreshStarted).toBe(true);
    await expect(menu).toBeEnabled();
    await menu.click();
    await expect(page.getByRole("menuitem")).toHaveCount(1);
    expect(refreshFinished).toBe(false);
    expect(patchCount).toBe(1);
    const patches = api.requests.filter(
      (request) => request.path === "/tasks/101" && request.method === "PATCH",
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ schedule_id: null });
    expect(api.state.tasks[0].schedule_id).toBeNull();
    expect(api.state.tasks[0].due_datetime).toBe(originalDue);
    expect(api.state.tasks[0].status).toBe(originalStatus);
    expect(api.unhandled).toEqual([]);
  } finally {
    releaseSave();
    releaseRefresh();
    await page.unroute(taskRoutes, handler);
  }
});

test("독립 할 일 생성 시 날짜를 지정하고 수정·제거 후에도 유지한다", async ({
  page,
}, testInfo) => {
  const { api, independent } = await setup(page);
  await independent
    .getByRole("button", { name: "할 일 추가", exact: true })
    .click();
  await independent
    .getByRole("textbox", { name: "새 할 일", exact: true })
    .fill("날짜 있는 독립 할 일");
  await independent
    .getByLabel("새 할 일 마감일", { exact: true })
    .fill("2026-09-12");
  await independent
    .getByLabel("새 할 일 마감 시간", { exact: true })
    .fill("14:30");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await testInfo.attach("independent-task-date", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await independent.getByRole("button", { name: "추가", exact: true }).click();
  await expect
    .poll(
      () =>
        api.state.tasks.find((t) => t.title === "날짜 있는 독립 할 일")
          ?.due_datetime,
    )
    .toBe("2026-09-12T14:30:00+09:00");
  const id = api.state.tasks.find(
    (t) => t.title === "날짜 있는 독립 할 일",
  )!.task_id;
  // Close the still-open quick composer, then edit the saved date.
  await independent.getByRole("button", { name: "빠른 추가 취소" }).click();
  await independent
    .getByRole("button", { name: "날짜 있는 독립 할 일", exact: true })
    .click();
  await expect(
    page.locator(`#task-${id}`).getByLabel("마감 날짜 선택"),
  ).toBeVisible();
  await page
    .locator(`#task-${id}`)
    .getByLabel("마감 날짜 선택")
    .fill("2026-09-13");
  await page.locator(`#task-${id}`).getByLabel("마감 날짜 선택").press("Tab");
  await page
    .locator(`#task-${id}`)
    .getByLabel("마감 시간 선택")
    .press("Escape");
  await page
    .locator(`#task-${id}`)
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect
    .poll(() => api.state.tasks.find((t) => t.task_id === id)?.due_datetime)
    .toBe("2026-09-13T14:30:00+09:00");
  await independent
    .getByRole("button", { name: "날짜 있는 독립 할 일", exact: true })
    .click();
  await page
    .locator(`#task-${id}`)
    .getByRole("button", { name: "마감일 제거", exact: true })
    .click();
  await page
    .locator(`#task-${id}`)
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect
    .poll(() => api.state.tasks.find((t) => t.task_id === id)?.due_datetime)
    .toBeNull();
  await page.reload();
  await independent.getByRole("button", { name: /독립 할 일/ }).click();
  await expect(
    independent.getByRole("button", {
      name: "날짜 있는 독립 할 일",
      exact: true,
    }),
  ).toBeVisible();
  expect(api.unhandled).toEqual([]);
});

test("전체 일정 순서 변경 충돌 후 복구하고 다시 이동할 수 있다", async ({ page }) => {
  const failures: Record<string, number> = { "PATCH /schedules/201/tasks/reorder": 409 };
  const api = await installMockApi(page, { failures });
  api.state.tasks.forEach((task, index) => { task.schedule_id = 201; task.sort_order = index; });
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  await schedule(page, 201).locator(".tasks-card-open").click();
  await page.locator("#task-104").press("ArrowUp");
  await expect(
    page.getByText("QA 테스트용 서버 오류입니다.").first(),
  ).toBeVisible();
  expect(api.state.tasks.find((t) => t.task_id === 104)?.sort_order).toBe(3);
  expect(api.requests.filter((r) => r.path === "/schedules/201/tasks/reorder")).toHaveLength(1);
  delete failures["PATCH /schedules/201/tasks/reorder"];
  await expect(page.locator("#task-104")).toHaveAttribute("draggable", "true");
  await page.locator("#task-104").press("ArrowUp");
  await expect(schedule(page, 201).locator(".tasks-subtask-title")).toHaveText([
    "QA 오늘 할 일",
    "QA 기한 없는 할 일",
    "QA 진행 중인 할 일",
    "QA 완료한 할 일",
  ]);
  expect(api.unhandled).toEqual([]);
});

test("날짜 필터를 유지하며 이동하고 전체 필터로 독립 할 일을 찾을 수 있다", async ({
  page,
}) => {
  const api = await installMockApi(page);
  api.state.tasks[1].schedule_id = 201; // tomorrow's due date under today's schedule
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  await page
    .getByRole("group", { name: "할 일 필터" })
    .getByRole("button", { name: /^오늘 \d+$/ })
    .click();
  await schedule(page, 201).locator(".tasks-card-open").click();
  await page
    .locator("#task-102")
    .getByRole("button", { name: /이동 메뉴/ })
    .click();
  await page
    .getByRole("menuitem", { name: "독립 할 일로 이동", exact: true })
    .click();
  await expect(page.locator("#task-102")).toHaveCount(0);
  await expect(page.locator(".task-move-feedback")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "할 일 보기", exact: true }),
  ).toHaveCount(0);
  const filters = page.getByRole("group", { name: "할 일 필터" });
  await expect(
    filters.getByRole("button", { name: /^오늘 \d+$/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: /^전체 \d+$/ }).click();
  await expect(
    page.locator(".tasks-independent-section #task-102"),
  ).toBeVisible();
  expect(api.state.tasks.find((t) => t.task_id === 102)?.due_datetime).toBe(
    "2026-09-10T18:00:00+09:00",
  );
});

test("제거된 자체 순서 API가 없어도 이동과 날짜 입력을 제공한다", async ({
  page,
}) => {
  const api = await installMockApi(page, {
    failures: { "GET /tasks/order": 404 },
  });
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  const independent = page.locator(".tasks-independent-section");
  await independent.getByRole("button", { name: /독립 할 일/ }).click();
  await expect(page.locator("#task-101")).toHaveAttribute("draggable", "true");
  expect(api.requests.some((r) => r.path === "/tasks/order")).toBe(false);
  await independent
    .getByRole("button", { name: "할 일 추가", exact: true })
    .click();
  await expect(
    independent.getByLabel("새 할 일 마감일", { exact: true }),
  ).toBeVisible();
  expect(api.unhandled).toEqual([]);
});

test("다른 날짜 일정으로 이동 후 제목만 수정해도 원래 마감일을 보존한다", async ({
  page,
}) => {
  const { api } = await setup(page);
  const due = api.state.tasks.find((t) => t.task_id === 101)!.due_datetime;
  await page
    .locator("#task-101")
    .getByRole("button", { name: /이동 메뉴/ })
    .click();
  await page
    .getByRole("menuitem", { name: "다른 일정으로 이동…", exact: true })
    .click();
  const picker = page.getByRole("dialog", { name: "다른 일정으로 이동", exact: true });
  await picker.locator('button[data-schedule-id="203"]').click();
  await picker.getByRole("button", { name: "이 일정으로 이동", exact: true }).click();
  await expect(schedule(page, 203).locator("#task-101")).toBeVisible();
  await page.locator("#task-101 .tasks-subtask-open").click();
  await page.locator("#task-101 input[name=title]").fill("원래 날짜 유지");
  await page
    .locator("#task-101")
    .getByRole("button", { name: "저장", exact: true })
    .click();
  await expect
    .poll(() => api.state.tasks.find((t) => t.task_id === 101)?.title)
    .toBe("원래 날짜 유지");
  expect(api.state.tasks.find((t) => t.task_id === 101)?.due_datetime).toBe(
    due,
  );
});

test("화면에 없는 완료 및 숨겨진 할 일까지 전체 목록으로 순서를 저장한다", async ({ page }) => {
  const api = await installMockApi(page);
  api.state.tasks.forEach((task, index) => { task.schedule_id = 201; task.sort_order = index; });
  // Simulate a filtered/partial visible cache. The reorder must fetch the complete schedule.
  await page.route("**/api/v1/tasks*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/tasks" && !url.searchParams.has("schedule_id") && route.request().method() === "GET") {
      return route.fulfill({ json: { success: true, data: { tasks: api.state.tasks.filter((task) => task.task_id === 101 || task.task_id === 102) } }, headers: { "access-control-allow-origin": "*" } });
    }
    return route.fallback();
  });
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  await schedule(page, 201).locator(".tasks-card-open").click();
  await page.locator("#task-102").press("ArrowUp");
  await expect.poll(() => api.requests.find((request) => request.path === "/schedules/201/tasks/reorder")?.status).toBe(200);
  const reorder = api.requests.find((request) => request.path === "/schedules/201/tasks/reorder")!;
  expect(reorder.body).toEqual({ task_ids: ["102", "101", "103", "104"] });
  const fullRead = api.requests.find((request) => new URL(request.url).searchParams.get("schedule_id") === "201")!;
  expect([...new URL(fullRead.url).searchParams.keys()]).toEqual(["schedule_id"]);
  expect(api.state.tasks.find((task) => task.task_id === 103)?.status).toBe("done");
  expect(api.unhandled).toEqual([]);
});

test("TASK_ORDER_MISMATCH는 목록을 다시 조회하고 사용자 재시도에만 새 전체 순서를 보낸다", async ({ page }) => {
  const api = await installMockApi(page);
  api.state.tasks.forEach((task, index) => { task.schedule_id = 201; task.sort_order = index; });
  let concurrentChange = true;
  await page.route("**/schedules/201/tasks/reorder", async (route) => {
    if (route.request().method() === "PATCH" && concurrentChange) {
      concurrentChange = false;
      api.state.tasks.push({ task_id: 105, title: "동시에 추가된 완료 할 일", status: "done", priority: "medium", schedule_id: 201, sort_order: 4, created_at: QA_NOW });
    }
    return route.fallback();
  });
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  await schedule(page, 201).locator(".tasks-card-open").click();
  await page.locator("#task-102").press("ArrowUp");
  await expect.poll(() => api.requests.find((request) => request.path === "/schedules/201/tasks/reorder")?.status).toBe(409);
  await expect(page.locator("#task-105")).toBeVisible();
  expect(api.requests.filter((request) => request.path === "/schedules/201/tasks/reorder")).toHaveLength(1);
  const conflictIndex = api.requests.findIndex((request) => request.path === "/schedules/201/tasks/reorder");
  expect(api.requests.slice(conflictIndex + 1).some((request) => request.method === "GET" && request.path === "/tasks")).toBe(true);
  await expect(page.locator("#task-102")).toHaveAttribute("draggable", "true");
  await page.locator("#task-102").press("ArrowUp");
  await expect.poll(() => api.requests.filter((request) => request.path === "/schedules/201/tasks/reorder" && request.status === 200).length).toBe(1);
  const retry = api.requests.filter((request) => request.path === "/schedules/201/tasks/reorder").at(-1)!;
  expect(retry.body).toEqual({ task_ids: ["102", "101", "103", "104", "105"] });
  expect(api.unhandled).toEqual([]);
});
