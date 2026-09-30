import {
  expect,
  test as base,
  type Locator,
  type Page,
} from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

type MockApi = Awaited<ReturnType<typeof installMockApi>>;

const scheduleTitle = "QA 디자인 검토 회의";
const linkedTitle = "QA 검토 자료 준비";
const completedLinkedTitle = "QA 검토 초대 발송";

const test = base.extend<{ mockApi: MockApi }>({
  mockApi: [
    async ({ page }, use, testInfo) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      const mockApi = await installMockApi(page);
      mockApi.state.tasks.push(
        {
          task_id: 501,
          user_id: 9001,
          title: linkedTitle,
          priority: "high",
          status: "todo",
          schedule_id: 201,
          due_datetime: "2026-09-09T10:00:00+09:00",
          created_at: QA_NOW,
        },
        {
          task_id: 502,
          user_id: 9001,
          title: completedLinkedTitle,
          priority: "medium",
          status: "done",
          schedule_id: 201,
          due_datetime: "2026-09-09T10:00:00+09:00",
          completed_at: QA_NOW,
          created_at: QA_NOW,
        },
      );
      mockApi.state.schedules.find(
        (schedule) => schedule.schedule_id === 203,
      )!.is_completed = true;
      await page.clock.setFixedTime(new Date(QA_NOW));
      await seedAuth(page);
      await use(mockApi);
      expect.soft(runtimeErrors, "할 일 화면의 브라우저 실행 오류").toEqual([]);
      expect
        .soft(mockApi.unhandled, "모든 API 요청은 명시적인 가상 응답으로 처리")
        .toEqual([]);
      if (testInfo.status !== testInfo.expectedStatus) {
        await testInfo.attach("tasks-api-requests", {
          body: JSON.stringify(mockApi.requests, null, 2),
          contentType: "application/json",
        });
      }
    },
    { auto: true },
  ],
});

function board(page: Page) {
  return page.locator("[data-flowra-task-board]");
}

function scheduleRow(page: Page, title = scheduleTitle) {
  return board(page)
    .locator(".tasks-schedule-row")
    .filter({
      has: page.getByRole("heading", { name: title, exact: true }),
    });
}

async function expandSchedule(row: Locator) {
  await expect(row).toBeVisible();
  const toggle = row.locator('.tasks-card-open[aria-expanded="false"]');
  if (await toggle.count()) await toggle.click();
  await expect(
    row.getByRole("button", { name: "할 일 추가", exact: true }),
  ).toBeVisible();
}

test("일정 더보기 메뉴가 카드 오른쪽 바깥에 열린다", async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto("/tasks");
  const row = scheduleRow(page);
  const card = row.locator(".tasks-card").first();
  const cardBox = await card.boundingBox();
  await row.getByRole("button", { name: `${scheduleTitle} 더보기` }).click();
  const menu = page.locator(".tasks-card-menu");
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.x).toBeGreaterThanOrEqual(cardBox!.x + cardBox!.width - 12);
  expect(await menu.evaluate((element) => element.closest(".tasks-card"))).toBeNull();
});

function mutations(api: MockApi) {
  return api.requests.filter((request) =>
    ["POST", "PATCH", "PUT", "DELETE"].includes(request.method),
  );
}

test("일정을 완료해도 연결된 할 일의 완료 상태와 진행률은 유지된다", async ({
  page,
  mockApi,
}, testInfo) => {
  await page.goto("/tasks");
  const row = scheduleRow(page);
  await expect(row.locator(".tasks-card-open")).toHaveAttribute("aria-expanded", "false");
  await expect(row.getByText(linkedTitle, { exact: true })).toHaveCount(0);
  await expect(row.locator(".tasks-progress")).toHaveAttribute(
    "aria-label",
    "연결된 할 일 2개 중 1개 완료",
  );
  const screenshotPath = testInfo.outputPath(
    `tasks-${testInfo.project.name}.png`,
  );
  await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await testInfo.attach("tasks-default", {
    path: screenshotPath,
    contentType: "image/png",
  });
  await row
    .getByRole("button", { name: `${scheduleTitle} 더보기`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "일정 완료로 표시", exact: true })
    .click();
  await expect
    .poll(
      () =>
        mockApi.state.schedules.find((schedule) => schedule.schedule_id === 201)
          ?.is_completed,
    )
    .toBe(true);
  await expect(row.locator(".tasks-card").first()).toHaveClass(
    /tasks-card-completed/,
  );
  await expect(row.locator(".tasks-progress")).toHaveAttribute(
    "aria-label",
    "연결된 할 일 2개 중 1개 완료",
  );
  expect(
    mockApi.state.tasks
      .filter((task) => task.schedule_id === 201)
      .map((task) => task.status),
  ).toEqual(["todo", "done"]);
  expect(
    mutations(mockApi).map(({ method, path }) => `${method} ${path}`),
  ).toEqual(["PATCH /schedules/201"]);

  await page.reload();
  await expect(row.locator(".tasks-card").first()).toHaveClass(
    /tasks-card-completed/,
  );
  await expect(row.locator(".tasks-card-open")).toHaveAttribute("aria-expanded", "false");
  await expandSchedule(row);
  const linkedRow = row
    .locator("li")
    .filter({ has: page.getByText(linkedTitle, { exact: true }) });
  await expect(
    linkedRow.getByRole("checkbox", {
      name: `${linkedTitle} 완료`,
      exact: true,
    }),
  ).not.toBeChecked();
});

test("하위 할 일을 모두 완료하면 진행률만 갱신되고 일정은 미완료로 남는다", async ({
  page,
  mockApi,
}) => {
  await page.goto("/tasks");
  const row = scheduleRow(page);
  await expect(row).toBeVisible();
  await expandSchedule(row);
  const toolbar = board(page).locator(".tasks-toolbar");
  await expect(toolbar.getByRole("button", { name: "미완료 4", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "완료 2", exact: true })).toBeVisible();
  const linkedRow = row
    .locator("li")
    .filter({ has: page.getByText(linkedTitle, { exact: true }) });
  await linkedRow
    .getByRole("checkbox", { name: `${linkedTitle} 완료`, exact: true })
    .click();
  await expect
    .poll(
      () => mockApi.state.tasks.find((task) => task.task_id === 501)?.status,
    )
    .toBe("done");
  await expect(row.locator(".tasks-progress")).toHaveAttribute(
    "aria-label",
    "연결된 할 일 2개 중 2개 완료",
  );
  await expect(toolbar.getByRole("button", { name: "미완료 3", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "완료 3", exact: true })).toBeVisible();
  await expect(row.locator(".tasks-card").first()).not.toHaveClass(
    /tasks-card-completed/,
  );
  expect(
    mockApi.state.schedules.find((schedule) => schedule.schedule_id === 201)
      ?.is_completed,
  ).toBe(false);
  expect(
    mutations(mockApi).map(({ method, path }) => `${method} ${path}`),
  ).toEqual(["PATCH /tasks/501"]);
});

test("연결된 할 일 검색과 오늘·미완료·완료 필터가 함께 적용된다", async ({
  page,
  mockApi,
}) => {
  await page.goto("/tasks");
  const toolbar = board(page).locator(".tasks-toolbar");
  const search = page
    .getByPlaceholder("일정 또는 할 일 검색...")
    .locator("visible=true");
  await search.fill(linkedTitle);
  await expect(scheduleRow(page)).toBeVisible();
  await expect(scheduleRow(page, "QA 일정 겹침 확인")).toHaveCount(0);
  await expandSchedule(scheduleRow(page));
  await expect(
    scheduleRow(page).getByText(linkedTitle, { exact: true }),
  ).toBeVisible();
  await search.fill("존재하지 않는 QA 검색 결과");
  await expect(
    board(page).getByText("표시할 일정이나 할 일이 없습니다", { exact: true }),
  ).toBeVisible();
  await search.clear();

  await toolbar.getByRole("button", { name: /^오늘 \d+$/ }).click();
  await expect(scheduleRow(page)).toBeVisible();
  await expect(scheduleRow(page, "QA 하루 일정")).toHaveCount(0);
  await board(page).locator(".tasks-independent-section").getByRole("button", { name: /독립 할 일/ }).click();
  await expect(
    board(page).getByText("QA 오늘 할 일", { exact: true }),
  ).toBeVisible();
  await expect(
    board(page).getByText("QA 진행 중인 할 일", { exact: true }),
  ).toHaveCount(0);

  await toolbar.getByRole("button", { name: /^미완료 \d+$/ }).click();
  await expect(scheduleRow(page)).toBeVisible();
  await expect(scheduleRow(page, "QA 하루 일정")).toHaveCount(0);
  await toolbar.getByRole("button", { name: /^완료 \d+$/ }).click();
  await expect(scheduleRow(page, "QA 하루 일정")).toBeVisible();
  await expect(scheduleRow(page)).toHaveCount(0);
  await expect(board(page).getByRole("button", { name: /^완료된 할 일/ })).toHaveAttribute("aria-expanded", "true");
  await expect(
    board(page).getByText("QA 완료한 할 일", { exact: true }),
  ).toBeVisible();
  await expect(
    board(page).getByText("QA 오늘 할 일", { exact: true }),
  ).toHaveCount(0);
  expect(mutations(mockApi)).toEqual([]);
});

test("상단에는 요약과 정렬 버튼 없이 필터별 할 일 개수를 표시한다", async ({ page }) => {
  await page.goto("/tasks");
  const toolbar = board(page).locator(".tasks-toolbar");
  await expect(page.getByRole("heading", { name: "할 일", exact: true })).toHaveCount(1);
  await expect(board(page).getByRole("heading", { name: "할 일", exact: true })).toHaveCount(0);
  await expect(toolbar.getByRole("button", { name: "전체 6", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "오늘 4", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "미완료 4", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "완료 2", exact: true })).toBeVisible();
  await expect(board(page).locator(".tasks-overall-progress")).toHaveCount(0);
  await expect(board(page).getByRole("button", { name: "정렬 방식" })).toHaveCount(0);
  await expect(page.locator(".flowra-app-shell > div > header")).not.toContainText(/완료 \d+ \/ 전체 \d+/);
});

test("선택 모드의 삭제 대상 선택과 완료 체크가 서로 독립적이다", async ({
  page,
  mockApi,
}) => {
  await page.goto("/tasks");
  const row = scheduleRow(page);
  await expandSchedule(row);
  await expect(
    board(page).getByRole("button", { name: "선택", exact: true }),
  ).toHaveCount(0);
  await expect(
    board(page).getByRole("group", { name: "선택한 항목 작업" }),
  ).toHaveCount(0);
  const scheduleSelection = row.locator(".tasks-card").first();
  const taskSelection = row.locator('[data-selection-key="task:501"]');
  await expect(row.locator(".tasks-selection-checkbox")).toHaveCount(0);
  await row.locator(".tasks-card-open").click({ modifiers: ["Control"] });
  await taskSelection.locator(".tasks-subtask-open").click({ modifiers: ["Control"] });
  await expect(scheduleSelection).toHaveClass(/tasks-card-selected/);
  await expect(taskSelection).toHaveClass(/tasks-subtask-selected/);
  await expect(row.locator(".tasks-card").first()).not.toHaveClass(
    /tasks-card-completed/,
  );
  expect(mutations(mockApi)).toEqual([]);

  await row
    .getByRole("button", { name: `${scheduleTitle} 더보기`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "일정 완료로 표시", exact: true })
    .click();
  await expect
    .poll(
      () =>
        mockApi.state.schedules.find((schedule) => schedule.schedule_id === 201)
          ?.is_completed,
    )
    .toBe(true);
  await expect(scheduleSelection).toHaveClass(/tasks-card-selected/);
  await expect(taskSelection).toHaveClass(/tasks-subtask-selected/);
  expect(mockApi.state.tasks.find((task) => task.task_id === 501)?.status).toBe(
    "todo",
  );
  await page.keyboard.press("Escape");
  await expect(
    board(page).getByRole("group", { name: "선택한 항목 작업" }),
  ).toHaveCount(0);
  await expect(scheduleSelection).not.toHaveClass(/tasks-card-selected/);
  await expect(taskSelection).not.toHaveClass(/tasks-subtask-selected/);
});

test("할 일 패널의 날짜·시간·우선순위를 선택하고 저장한다", async ({
  page,
  mockApi,
}) => {
  await page.goto("/tasks");
  const row = scheduleRow(page);
  await expandSchedule(row);
  const opener = row.getByRole("button", {
    name: "상세 설정으로 추가",
    exact: true,
  });
  await opener.click();
  const panel = page.getByRole("dialog", { name: "할 일 추가", exact: true });
  await expect(panel).toBeVisible();
  await panel.getByPlaceholder("새 할 일 입력").fill("QA 패널 선택값 저장");
  const priority = panel.getByRole("button", {
    name: "우선순위 선택",
    exact: true,
  });
  await priority.click();
  await panel.getByRole("option", { name: "높음", exact: true }).click();
  await expect(priority).toContainText("높음");
  await priority.click();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect(priority).toHaveAttribute("aria-expanded", "false");
  const date = panel.getByLabel("마감 날짜 선택", { exact: true });
  await date.click();
  await panel
    .locator(".schedule-date-popover")
    .getByRole("button", { name: "10", exact: true })
    .click();
  await expect(date).toHaveValue("09.10(목)");
  const time = panel.getByLabel("마감 시간", { exact: true });
  await time.click();
  await panel
    .getByRole("listbox")
    .getByRole("button", { name: "11:15", exact: true })
    .click();
  await expect(time).toHaveValue("11:15");
  await panel
    .locator("form")
    .getByRole("button", { name: "할 일 추가", exact: true })
    .click();
  await expect
    .poll(
      () =>
        mockApi.state.tasks.find((task) => task.title === "QA 패널 선택값 저장")
          ?.priority,
    )
    .toBe("high");
  const saved = mockApi.state.tasks.find(
    (task) => task.title === "QA 패널 선택값 저장",
  )!;
  expect(saved.schedule_id).toBe(201);
  expect(new Date(saved.due_datetime!).toISOString()).toBe(
    "2026-09-10T02:15:00.000Z",
  );
  await panel
    .getByRole("button", { name: "할 일 추가 패널 닫기", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(
    row.getByText("QA 패널 선택값 저장", { exact: true }),
  ).toBeVisible();
});

test("새 일정 패널이 화면 크기 변경에도 입력을 유지하고 좁은 화면의 포커스를 관리한다", async ({
  page,
  mockApi,
}, testInfo) => {
  await page.goto("/tasks");
  const createToggle = page.locator("[data-tasks-create]").locator("visible=true");
  const closedToggleBounds =
    testInfo.project.name === "desktop" ? await createToggle.boundingBox() : null;
  await createToggle.click();
  const panel = page.getByRole("dialog", { name: "새 일정", exact: true });
  if (testInfo.project.name === "desktop") {
    await expect(panel).toHaveAttribute("data-docked", "true");
    await expect(createToggle).toHaveAttribute("aria-label", "새 일정 패널 닫기");
    await expect(
      panel.getByRole("button", { name: "일정 추가 패널 닫기" }),
    ).toHaveCount(0);
    const openToggleBounds = await createToggle.boundingBox();
    expect(openToggleBounds).not.toBeNull();
    expect(Math.abs(openToggleBounds!.x - closedToggleBounds!.x)).toBeLessThan(1);
    expect(Math.abs(openToggleBounds!.y - closedToggleBounds!.y)).toBeLessThan(1);
    await createToggle.click();
    await expect(panel).toHaveCount(0);
    await createToggle.click();
  }
  const title = panel.getByPlaceholder("일정 제목", { exact: true });
  await title.fill("QA 반응형 패널 일정");
  if (testInfo.project.name === "desktop") {
    await expect(panel).toHaveAttribute("data-docked", "true");
    const headerBottom = await page
      .locator(".flowra-app-shell > div > header")
      .evaluate((el) => el.getBoundingClientRect().bottom);
    expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom);
    await page.setViewportSize({ width: 768, height: 900 });
  }
  await expect(panel).toHaveAttribute("aria-modal", "true");
  await expect(title).toHaveValue("QA 반응형 패널 일정");
  await expect(page.locator(".flowra-app-shell")).toHaveJSProperty(
    "inert",
    true,
  );
  const controls = panel
    .locator(
      'button:enabled, input:enabled, textarea:enabled, select:enabled, [tabindex="0"]',
    )
    .locator("visible=true");
  await controls.last().focus();
  await page.keyboard.press("Tab");
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(controls.last()).toBeFocused();
  const date = panel.getByLabel("시작 날짜", { exact: true });
  await date.click();
  await panel
    .locator(".schedule-date-popover")
    .getByRole("button", { name: "10", exact: true })
    .click();
  await expect(date).toHaveValue("09.10(목)");
  await title.focus();
  if (testInfo.project.name === "desktop") {
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(panel).toHaveAttribute("data-docked", "true");
    await expect(page.locator(".flowra-app-shell")).toHaveJSProperty(
      "inert",
      false,
    );
    await expect(title).toHaveValue("QA 반응형 패널 일정");
  }
  await testInfo.attach("tasks-schedule-panel", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.locator(".flowra-app-shell")).toHaveJSProperty(
    "inert",
    false,
  );
  await expect(
    page.locator("[data-tasks-create]").locator("visible=true"),
  ).toBeFocused();
  expect(mutations(mockApi)).toEqual([]);
  await page.locator("[data-tasks-create]").locator("visible=true").click();
  await expect(title).toHaveValue("");
  await title.fill("QA 관리 화면에서 새 일정");
  await panel
    .locator("[data-flowra-schedule-editor-footer]")
    .getByRole("button", { name: "추가", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await expect(scheduleRow(page, "QA 관리 화면에서 새 일정")).toBeVisible();
  await page.reload();
  await expect(scheduleRow(page, "QA 관리 화면에서 새 일정")).toBeVisible();
});

for (const { width, dark } of [
  { width: 320, dark: false },
  { width: 390, dark: true },
  { width: 768, dark: false },
  { width: 1280, dark: false },
]) {
  test(`긴 제목·선택 모드에서도 카드와 기존 셸을 유지한다 (${width}px ${dark ? "dark" : "light"})`, async ({
    page,
    mockApi,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop",
      "반응형 검사는 각 명시된 뷰포트에서 한 번 실행",
    );
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    const longTitle =
      "QA 긴 제목 — " +
      "여러 줄 제목과 완료 버튼을 함께 확인합니다. ".repeat(8);
    mockApi.state.schedules.find(
      (schedule) => schedule.schedule_id === 202,
    )!.title = longTitle;
    mockApi.state.tasks.find((task) => task.task_id === 102)!.title = longTitle;
    if (dark)
      await page.addInitScript(() => {
        localStorage.setItem(
          "flowra:user-settings",
          JSON.stringify({ theme: "dark" }),
        );
      });
    await page.goto("/tasks");
    const shell = page.locator(".flowra-app-shell").first();
    const header = shell.locator(":scope > div > header");
    const sidebar = shell.locator(":scope > aside");
    await expect(header).toBeVisible();
    await expect(header).not.toContainText(/완료 \d+ \/ 전체 \d+/);
    await expect(
      sidebar
        .getByRole("navigation")
        .getByRole("link", { name: "할 일", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(sidebar.locator("[data-flowra-schedule-sidebar]")).toHaveCount(
      1,
    );
    if (width >= 600) await expect(sidebar).toBeInViewport();
    else
      await expect(
        header.getByRole("button", { name: "사이드바 열기", exact: true }),
      ).toBeVisible();
    if (dark)
      await expect(page.locator("html")).toHaveAttribute(
        "data-resolved-theme",
        "dark",
      );
    await expect(scheduleRow(page, longTitle)).toBeVisible();
    await scheduleRow(page, longTitle)
      .locator(".tasks-card-open")
      .click({ modifiers: ["Control"] });
    await expandSchedule(scheduleRow(page, longTitle));
    await expandSchedule(scheduleRow(page));
    await page.evaluate(() => document.fonts.ready);

    const metrics = await board(page).evaluate((root) => {
      const boardRect = root.getBoundingClientRect();
      const overflow = [
        ...root.querySelectorAll<HTMLElement>(".tasks-card, .tasks-toolbar"),
      ]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            (rect.left < boardRect.left - 1 ||
              rect.right > boardRect.right + 1 ||
              element.scrollWidth > element.clientWidth + 1)
          );
        })
        .map((element) => ({
          className: element.className,
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }));
      const timelineNodes = root.querySelectorAll(".tasks-timeline-node").length;
      const linkedTasks = [
        ...root.querySelectorAll<HTMLElement>(
          ".tasks-linked-list > .tasks-subtask:not([hidden])",
        ),
      ];
      const missingBullets = linkedTasks
        .filter((task) => {
          const bullet = getComputedStyle(task, "::before");
          return bullet.content === "none" || bullet.borderRadius !== "50%";
        })
        .map((task) => task.textContent?.slice(0, 100));
      return {
        documentWidth: document.documentElement.scrollWidth,
        boardWidth: boardRect.width,
        overflow,
        timelineNodes,
        linkedTaskCount: linkedTasks.length,
        missingBullets,
      };
    });
    const screenshotPath = testInfo.outputPath(
      `tasks-${width}-${dark ? "dark" : "light"}.png`,
    );
    await page.screenshot({ path: screenshotPath, animations: "disabled" });
    await testInfo.attach(`tasks-${width}-${dark ? "dark" : "light"}`, {
      path: screenshotPath,
      contentType: "image/png",
    });
    await testInfo.attach("tasks-layout", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(width + 1);
    expect(
      metrics.overflow,
      "긴 제목과 카드 도구는 본문과 카드 너비 안에 배치",
    ).toEqual([]);
    expect(
      metrics.timelineNodes,
      "일정 시간 옆 점 표시를 제거",
    ).toBe(0);
    expect(metrics.linkedTaskCount).toBeGreaterThan(0);
    expect(metrics.missingBullets, "연결된 할 일마다 점 표시").toEqual([]);
    if (width === 768)
      expect(
        metrics.boardWidth,
        "사이드바가 보이는 좁은 본문도 실제 검사",
      ).toBeLessThan(600);
  });
}
