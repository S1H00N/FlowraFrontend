import { expect, test, type Page, type Route } from "@playwright/test";
import {
  installMockApi,
  QA_NOW,
  seedAuth,
  type MockOptions,
  type MockState,
} from "./fixtures";

async function setup(
  page: Page,
  customize?: (state: MockState) => void,
  options?: MockOptions,
) {
  const api = await installMockApi(page, options);
  customize?.(api.state);
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  await page
    .locator(".tasks-independent-section")
    .getByRole("button", { name: /독립 할 일/ })
    .click();
  return api;
}

async function openPicker(page: Page, taskId = 101) {
  await page
    .locator(`#task-${taskId}`)
    .getByRole("button", { name: /이동 메뉴/ })
    .click();
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await expect(page.getByRole("menuitem", { name: "위로 이동", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "아래로 이동", exact: true })).toHaveCount(0);
  await page
    .getByRole("menuitem", { name: "다른 일정으로 이동…", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "다른 일정으로 이동",
    exact: true,
  });
  await expect(picker).toBeVisible();
  return picker;
}

test("동일 제목과 시각의 일정을 설명과 번호로 구분하고 확인한 대상만 저장한다", async ({
  page,
}, testInfo) => {
  const api = await setup(page, (state) => {
    const original = state.schedules[0];
    state.schedules = [
      {
        ...original,
        title: "주간 회의",
        description: "디자인 검토",
        location: "회의실 A",
      },
      {
        ...original,
        schedule_id: 202,
        title: "주간 회의",
        description: "개발 검토",
        location: "회의실 B",
      },
      {
        ...original,
        schedule_id: 204,
        title: "회사 전용 일정",
        is_company_schedule: true,
      },
      {
        ...original,
        schedule_id: 205,
        title: "공유받은 일정",
        is_shared: true,
      },
    ];
  });
  const due = api.state.tasks[0].due_datetime;
  const picker = await openPicker(page);
  if (testInfo.project.name === "desktop") {
    await expect(picker.getByLabel("이동할 일정 검색")).toBeFocused();
  }
  await expect(picker.getByText("현재 위치", { exact: true })).toBeVisible();
  await expect(picker.locator("button[data-schedule-id]")).toHaveCount(2);
  const first = picker.locator('button[data-schedule-id="201"]');
  const second = picker.locator('button[data-schedule-id="202"]');
  await expect(first).toContainText("2026.09.09 · 10:00–11:00");
  await expect(first).toContainText("디자인 검토");
  await expect(first).toContainText("일정 #201");
  await expect(second).toContainText("개발 검토");
  await expect(second).toContainText("일정 #202");
  await expect(
    picker.getByRole("button", { name: "이 일정으로 이동", exact: true }),
  ).toBeDisabled();
  await second.click();
  await expect(second).toHaveAttribute("aria-pressed", "true");
  expect(
    api.requests.filter(
      (request) => request.path === "/tasks/101" && request.method === "PATCH",
    ),
  ).toHaveLength(0);
  await testInfo.attach(`move-picker-${testInfo.project.name}`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await picker
    .getByRole("button", { name: "이 일정으로 이동", exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  await expect(
    page.locator('[data-selection-key="schedule:202"] #task-101'),
  ).toBeVisible();
  expect(api.state.tasks[0].schedule_id).toBe(202);
  expect(api.state.tasks[0].due_datetime).toBe(due);
  expect(
    api.requests.filter(
      (request) => request.path === "/tasks/101" && request.method === "PATCH",
    ),
  ).toHaveLength(1);
  await expect(page.locator(".task-move-feedback")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "할 일 보기", exact: true }),
  ).toHaveCount(0);
  expect(api.unhandled).toEqual([]);
});

test("제목과 설명으로 검색하고 검색 변경과 빈 결과에서는 선택을 초기화한다", async ({
  page,
}) => {
  await setup(page);
  const picker = await openPicker(page);
  await picker.locator('button[data-schedule-id="201"]').click();
  const submit = picker.getByRole("button", {
    name: "이 일정으로 이동",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await picker.getByLabel("이동할 일정 검색").fill("홈과 달력");
  await expect(picker.locator("button[data-schedule-id]")).toHaveCount(1);
  await expect(submit).toBeDisabled();
  await picker.getByLabel("이동할 일정 검색").fill("찾을 수 없는 일정");
  await expect(
    picker.getByText("검색 결과에 맞는 일정이 없습니다.", { exact: true }),
  ).toBeVisible();
  await expect(picker.locator("button[data-schedule-id]")).toHaveCount(0);
  await picker.getByLabel("이동할 일정 검색").fill("");
  await expect(picker.locator("button[data-schedule-id]")).toHaveCount(3);
  await expect(submit).toBeDisabled();
});

test("현재 위치는 날짜와 함께 보여주고 현재 일정은 후보에서 제외한다", async ({
  page,
}) => {
  const api = await setup(page, (state) => {
    state.tasks[0].schedule_id = 201;
  });
  await page
    .locator('[data-selection-key="schedule:201"] .tasks-card-open')
    .click();
  await page
    .locator("#task-101")
    .getByRole("button", { name: /이동 메뉴/ })
    .click();
  await expect(page.getByRole("menuitem")).toHaveCount(2);
  await expect(page.getByRole("menuitem", { name: "위로 이동", exact: true })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "아래로 이동", exact: true })).toHaveCount(0);
  await page
    .getByRole("menuitem", { name: "다른 일정으로 이동…", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "다른 일정으로 이동",
    exact: true,
  });
  await expect(picker.locator(".task-move-picker-current")).toContainText(
    "QA 디자인 검토 회의",
  );
  await expect(picker.locator(".task-move-picker-current")).toContainText(
    "2026.09.09",
  );
  await expect(picker.locator('button[data-schedule-id="201"]')).toHaveCount(0);
  await picker.getByRole("button", { name: "취소", exact: true }).click();
  expect(api.state.tasks[0].schedule_id).toBe(201);
});

test("다른 달 조회 동안 이전 후보를 숨기고 이동 후 현재 보드를 유지한다", async ({
  page,
}) => {
  const api = await setup(page, (state) => {
    state.schedules.push({
      ...state.schedules[0],
      schedule_id: 250,
      title: "11월 주간 회의",
      start_datetime: "2026-11-02T10:00:00+09:00",
      end_datetime: "2026-11-02T11:00:00+09:00",
    });
  });
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/schedules?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("start_from")?.startsWith("2026-11")) await gate;
    return route.fallback();
  });
  const picker = await openPicker(page);
  await picker.locator('button[data-schedule-id="201"]').click();
  await picker.getByLabel("이동할 일정 기간").fill("2026-11");
  await expect(
    picker.getByText("일정을 불러오는 중…", { exact: true }),
  ).toBeVisible();
  await expect(picker.locator("button[data-schedule-id]")).toHaveCount(0);
  await expect(
    picker.getByRole("button", { name: "이 일정으로 이동", exact: true }),
  ).toBeDisabled();
  release!();
  await picker.locator('button[data-schedule-id="250"]').click();
  await expect(picker.locator('button[data-schedule-id="201"]')).toHaveCount(0);
  await picker
    .getByRole("button", { name: "이 일정으로 이동", exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator(".task-move-feedback")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "할 일 보기", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("searchbox", { name: "일정 또는 할 일 검색", exact: true }),
  ).toBeFocused();
  await expect(
    page.locator('[data-selection-key="schedule:201"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-selection-key="schedule:250"]'),
  ).toHaveCount(0);

  const mobile = (page.viewportSize()?.width ?? 1280) < 600;
  if (mobile) {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "사이드바 열기", exact: true })
      .click();
  }
  const calendar = page.locator("[data-flowra-schedule-sidebar]");
  await calendar.getByRole("button", { name: "다음 달", exact: true }).click();
  await calendar.getByRole("button", { name: "다음 달", exact: true }).click();
  if (mobile) {
    await page
      .locator(".flowra-app-shell > aside")
      .getByRole("button", { name: "사이드바 닫기", exact: true })
      .click();
  }
  await expect(
    page.locator('[data-selection-key="schedule:250"] #task-101'),
  ).toBeVisible();
  expect(api.state.tasks[0].schedule_id).toBe(250);
  expect(api.state.tasks[0].due_datetime).toBe("2026-09-09T18:00:00+09:00");
  expect(api.unhandled).toEqual([]);
});

test("저장 실패 시 원래 소속과 선택을 유지하고 같은 대상에 재시도할 수 있다", async ({
  page,
}) => {
  const failures: Record<string, number> = { "PATCH /tasks/101": 500 };
  const api = await setup(page, undefined, { failures });
  const picker = await openPicker(page);
  const option = picker.locator('button[data-schedule-id="201"]');
  await option.click();
  await picker
    .getByRole("button", { name: "이 일정으로 이동", exact: true })
    .click();
  await expect(picker.getByRole("alert")).toContainText(
    "QA 테스트용 서버 오류입니다.",
  );
  await expect(option).toHaveAttribute("aria-pressed", "true");
  expect(api.state.tasks[0].schedule_id ?? null).toBeNull();
  delete failures["PATCH /tasks/101"];
  await picker
    .getByRole("button", { name: "이 일정으로 이동", exact: true })
    .click();
  await expect(picker).toHaveCount(0);
  await expect(
    page.locator('[data-selection-key="schedule:201"] #task-101'),
  ).toBeVisible();
  expect(api.state.tasks[0].schedule_id).toBe(201);
});

test("조회 실패를 다시 불러오고 키보드로 선택 및 취소 후 원래 버튼에 포커스를 돌린다", async ({
  page,
}) => {
  const failures: Record<string, number> = {};
  const api = await setup(page, undefined, { failures });
  failures["GET /schedules"] = 500;
  const picker = await openPicker(page);
  await expect(picker.getByRole("alert")).toContainText(
    "QA 테스트용 서버 오류입니다.",
  );
  await expect(
    picker.getByRole("button", { name: "이 일정으로 이동", exact: true }),
  ).toBeDisabled();
  delete failures["GET /schedules"];
  await picker
    .getByRole("button", { name: "다시 불러오기", exact: true })
    .click();
  await expect(picker.locator("button[data-schedule-id]")).toHaveCount(3);
  await picker.getByLabel("이동할 일정 검색").focus();
  await page.keyboard.press("ArrowDown");
  await expect(picker.locator('button[data-schedule-id="201"]')).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(picker.locator('button[data-schedule-id="202"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    picker.locator('button[data-schedule-id="202"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
  await expect(
    page.locator("#task-101").getByRole("button", { name: /이동 메뉴/ }),
  ).toBeFocused();
  expect(api.state.tasks[0].schedule_id ?? null).toBeNull();
});

test("이동 저장 중에는 잠그고 후속 조회가 느려도 PATCH 완료 즉시 닫는다", async ({ page }) => {
  const api = await setup(page, (state) => {
    state.tasks[1].schedule_id = 201;
    state.tasks[1].sort_order = 0;
    state.tasks[2].schedule_id = 201;
    state.tasks[2].sort_order = 1;
  });
  const originalDue = api.state.tasks[0].due_datetime;
  const originalStatus = api.state.tasks[0].status;
  const picker = await openPicker(page);
  await picker.locator('button[data-schedule-id="201"]').click();
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
  let destinationReadsBeforePatch = 0;
  let patchCount = 0;
  const handler = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH" && url.pathname === "/api/v1/tasks/101") {
      saveStarted = true;
      patchCount += 1;
      await saveGate;
      // A completed task arrives after the client cache was populated.
      api.state.tasks.push({
        task_id: 105,
        title: "동시에 추가된 완료 할 일",
        status: "done",
        priority: "medium",
        schedule_id: 201,
        sort_order: 2,
        created_at: QA_NOW,
      });
    } else if (request.method() === "GET" && url.pathname === "/api/v1/tasks") {
      if (url.searchParams.get("schedule_id") === "201" && !saveStarted) {
        destinationReadsBeforePatch += 1;
      }
      refreshStarted = true;
      await refreshGate;
      refreshFinished = true;
    }
    return route.fallback();
  };
  const taskRoutes = /\/api\/v1\/tasks(?:\/|\?|$)/;
  await page.route(taskRoutes, handler);
  try {
    await picker
      .getByRole("button", { name: "이 일정으로 이동", exact: true })
      .click();
    await expect.poll(() => saveStarted).toBe(true);
    expect(destinationReadsBeforePatch).toBe(0);
    expect(refreshStarted).toBe(false);
    await expect(
      picker.getByRole("button", { name: "이동 중…", exact: true }),
    ).toBeDisabled();
    await expect(picker.getByLabel("이동할 일정 검색")).toBeDisabled();
    await expect(picker.getByLabel("이동할 일정 기간")).toBeDisabled();
    await expect(
      picker.getByRole("button", { name: "취소", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(picker).toBeVisible();
    releaseSave();
    await expect.poll(() => refreshStarted).toBe(true);
    await expect(picker).toHaveCount(0);
    expect(refreshFinished).toBe(false);
    expect(destinationReadsBeforePatch).toBe(0);
    expect(patchCount).toBe(1);
    const patches = api.requests.filter(
      (request) => request.path === "/tasks/101" && request.method === "PATCH",
    );
    expect(patches).toHaveLength(1);
    expect(patches[0].body).toEqual({ schedule_id: "201" });
    expect(api.state.tasks[0].schedule_id).toBe(201);
    expect(api.state.tasks[0].sort_order).toBe(3);
    expect(
      api.state.tasks
        .filter((task) => task.schedule_id === 201)
        .sort((first, second) => (first.sort_order ?? Infinity) - (second.sort_order ?? Infinity))
        .map((task) => task.task_id),
    ).toEqual([102, 103, 105, 101]);
    expect(api.state.tasks[0].due_datetime).toBe(originalDue);
    expect(api.state.tasks[0].status).toBe(originalStatus);
    expect(api.unhandled).toEqual([]);
  } finally {
    releaseSave();
    releaseRefresh();
    await page.unroute(taskRoutes, handler);
  }
});

test("긴 제목과 종일·여러 날·반복 회차를 좁은 화면에서도 구분한다", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 740 });
  await setup(page, (state) => {
    state.schedules[0].title = "공백없는긴일정이름".repeat(12);
    state.schedules[1] = {
      ...state.schedules[1],
      title: "정기 점검",
      all_day: true,
      start_datetime: "2026-09-10T00:00:00+09:00",
      end_datetime: "2026-09-12T23:59:00+09:00",
      recurrence_group_id: "weekly",
    };
    state.schedules[2] = {
      ...state.schedules[2],
      title: "정기 점검",
      start_datetime: "2026-09-17T00:00:00+09:00",
      end_datetime: "2026-09-17T23:59:00+09:00",
      recurrence_group_id: "weekly",
    };
  });
  const picker = await openPicker(page);
  await expect(picker.locator("button[data-schedule-id]")).toHaveCount(3);
  await expect(picker.locator('button[data-schedule-id="202"]')).toContainText(
    "2026.09.10–2026.09.12 · 종일",
  );
  await expect(picker.locator('button[data-schedule-id="203"]')).toContainText(
    "2026.09.17 · 종일",
  );
  const size = await picker.boundingBox();
  const viewport = page.viewportSize()!;
  expect(size!.x).toBeGreaterThanOrEqual(0);
  expect(size!.x + size!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(size!.y + size!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewport.width);
  if (testInfo.project.name === "mobile")
    expect(size!.y + size!.height).toBeCloseTo(viewport.height, 0);
  await expect(
    picker.getByRole("button", { name: "이 일정으로 이동", exact: true }),
  ).toBeVisible();
  await testInfo.attach(`move-picker-long-${testInfo.project.name}`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});

test("화면 높이가 줄어도 긴 현재 일정과 검색 및 이동 버튼을 함께 표시한다", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 440 });
  await setup(page, (state) => {
    state.schedules[0].title = "현재 연결된 긴 일정 이름 ".repeat(16);
    state.tasks[0].schedule_id = 201;
  });
  await page
    .locator('[data-selection-key="schedule:201"] .tasks-card-open')
    .click();
  await page
    .locator("#task-101")
    .getByRole("button", { name: /이동 메뉴/ })
    .click();
  await page
    .getByRole("menuitem", { name: "다른 일정으로 이동…", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "다른 일정으로 이동",
    exact: true,
  });
  await expect(picker).toHaveAttribute("data-compact", "true");
  await picker.getByLabel("이동할 일정 검색").focus();
  await picker.locator('button[data-schedule-id="202"]').click();
  const submit = picker.getByRole("button", {
    name: "이 일정으로 이동",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  const bounds = await submit.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(440);
  expect(
    await picker.evaluate((node) => node.scrollHeight <= node.clientHeight),
  ).toBe(true);
  await testInfo.attach(`move-picker-compact-${testInfo.project.name}`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
});
