import { expect, test } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

async function setup(
  page: import("@playwright/test").Page,
  count = 5,
  done = 0,
) {
  const api = await installMockApi(page);
  api.state.tasks = Array.from({ length: count }, (_, i) => ({
    task_id: 800 + i,
    title: `행 테스트 ${i + 1}`,
    schedule_id: 201,
    status: i < done ? ("done" as const) : ("todo" as const),
    priority: (["low", "medium", "high", "urgent"] as const)[i % 4],
    due_datetime: i === 0 ? null : "2026-09-09T11:50:00+09:00",
    created_at: QA_NOW,
  }));
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await page.goto("/tasks");
  const card = page.locator(".tasks-schedule-row").filter({
    has: page.getByRole("heading", {
      name: "QA 디자인 검토 회의",
      exact: true,
    }),
  });
  await expect(card).toBeVisible();
  const toggle = card.locator(".tasks-card-open");
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  return { api, card };
}

for (const [count, done] of [
  [0, 0],
  [1, 0],
  [5, 0],
  [12, 0],
  [5, 2],
  [5, 5],
]) {
  test(`연결 할 일 ${count}개 / 완료 ${done}개 표시와 접기`, async ({
    page,
  }) => {
    const { api, card } = await setup(page, count, done);
    await expect(card.locator(".tasks-subtask:visible")).toHaveCount(
      Math.min(3, count - done) + done,
    );
    if (count - done > 3) {
      await card
        .getByRole("button", { name: `+ ${count - done - 3}개 더 보기` })
        .click();
      await expect(card.locator(".tasks-subtask:visible")).toHaveCount(
        count - done,
      );
    }
    if (!count) {
      await expect(card.locator(".tasks-progress-track")).toHaveCount(0);
      await expect(
        card.getByText("아직 연결된 할 일이 없습니다."),
      ).toBeVisible();
    } else {
      await expect(card.locator(".tasks-progress-track")).toBeVisible();
      await expect(card.locator(".tasks-progress")).toContainText(
        `할 일 ${done}/${count}`,
      );
    }
    if (done) {
      const completedToggle = card.getByRole("button", {
        name: `완료된 할 일 ${done}개`,
      });
      await expect(completedToggle).toHaveAttribute("aria-expanded", "true");
      await expect(card.locator(".tasks-subtask:visible")).toHaveCount(count);
      await completedToggle.click();
      await expect(card.locator(".tasks-subtask:visible")).toHaveCount(count - done);
      await completedToggle.click();
      await expect(card.locator(".tasks-subtask:visible")).toHaveCount(count);
    }
    await card.locator(".tasks-card-open").click();
    await expect(card.locator(".tasks-card-details")).toBeHidden();
    await expect(card.locator(".tasks-time-range")).toContainText(
      "10:00 ~ 11:00",
    );
    expect(api.unhandled).toEqual([]);
  });
}

test("연결된 할 일을 드래그해 순서를 바꾸고 새로고침 후에도 유지한다", async ({ page }) => {
  const { api, card } = await setup(page, 3);
  const titles = () => card.locator(".tasks-subtask-open .tasks-subtask-title");
  await expect(titles()).toHaveText(["행 테스트 2", "행 테스트 3", "행 테스트 1"]);

  await card.locator("#task-800 .tasks-subtask-open").dragTo(
    card.locator("#task-801"),
    { targetPosition: { x: 40, y: 40 } },
  );
  await expect(titles()).toHaveText(["행 테스트 2", "행 테스트 1", "행 테스트 3"]);

  await page.reload();
  const reloadedCard = page.locator(".tasks-schedule-row").filter({
    has: page.getByRole("heading", { name: "QA 디자인 검토 회의", exact: true }),
  });
  if ((await reloadedCard.locator(".tasks-card-open").getAttribute("aria-expanded")) !== "true")
    await reloadedCard.locator(".tasks-card-open").click();
  await expect(reloadedCard.locator(".tasks-subtask-open .tasks-subtask-title")).toHaveText([
    "행 테스트 2", "행 테스트 1", "행 테스트 3",
  ]);
  await reloadedCard.getByRole("button", { name: "상세 설정으로 추가" }).click();
  const panelTitles = page.locator(".tasks-add-panel ul.space-y-2 > li p.block");
  await expect(panelTitles).toHaveText(["행 테스트 2", "행 테스트 1", "행 테스트 3"]);
  await page.locator(".tasks-add-panel li[aria-label='행 테스트 3 순서 변경']").press("ArrowUp");
  await expect(panelTitles).toHaveText(["행 테스트 2", "행 테스트 3", "행 테스트 1"]);
  await page.getByRole("button", { name: "할 일 추가 패널 닫기" }).click();
  await expect(reloadedCard.locator(".tasks-subtask-open .tasks-subtask-title")).toHaveText([
    "행 테스트 2", "행 테스트 3", "행 테스트 1",
  ]);
  expect(api.unhandled).toEqual([]);
});

test("인라인 연속 추가, 공백 검증, IME Enter, Escape와 일정 연결", async ({
  page,
}) => {
  const { api, card } = await setup(page, 0);
  await card.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const input = card.getByRole("textbox", { name: "새 할 일" });
  await expect(input).toBeFocused();
  await input.fill("   ");
  await input.press("Enter");
  await expect(card.getByRole("alert")).toContainText("할 일을 입력하세요.");
  await input.fill("연속 추가 1");
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  expect(api.state.tasks).toHaveLength(0);
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await input.fill("연속 추가 2");
  await input.press("Enter");
  await expect(card.locator(".tasks-subtask")).toHaveCount(2);
  expect(
    api.state.tasks.every(
      (task) => task.schedule_id === 201 && !task.due_datetime,
    ),
  ).toBe(true);
  await input.press("Escape");
  await expect(
    card.getByRole("button", { name: "할 일 추가", exact: true }),
  ).toBeFocused();
});

test("할 일 추가와 수정은 한 번에 하나만 열린다", async ({ page }) => {
  const { api, card } = await setup(page, 2);
  const first = card.locator("#task-800");
  const second = card.locator("#task-801");
  const firstEditor = card.locator("#task-800[data-task-editor]");
  const secondEditor = card.locator("#task-801[data-task-editor]");
  const addButton = card.getByRole("button", { name: "할 일 추가", exact: true });
  const secondTitle = second.getByRole("button", { name: "행 테스트 2", exact: true });

  await first.getByRole("button", { name: "행 테스트 1", exact: true }).click();
  await expect(firstEditor).toBeVisible();
  await addButton.click();
  await expect(firstEditor).toHaveCount(0);
  const addInput = card.getByRole("textbox", { name: "새 할 일" });
  await expect(addInput).toBeVisible();
  await addInput.fill("저장하지 않은 입력");
  await secondTitle.click();
  await expect(addInput).toHaveCount(0);
  await expect(secondEditor).toBeVisible();
  await addButton.click();
  await expect(secondEditor).toHaveCount(0);
  await expect(addInput).toHaveValue("");

  await card.locator(".tasks-card-open").click();
  await expect(addInput).toHaveCount(0);
  await expect(card.locator(".tasks-card-details")).toBeHidden();
  expect(api.unhandled).toEqual([]);
});

test("할 일 수정 중 다른 버튼을 누르면 편집기가 닫힌다", async ({ page }) => {
  const { card } = await setup(page, 1);
  const row = card.locator("#task-800");
  const editor = card.locator("#task-800[data-task-editor]");

  await row.getByRole("button", { name: "행 테스트 1", exact: true }).click();
  await editor.getByRole("textbox", { name: "할 일", exact: true }).fill("임시 변경");
  await editor.getByRole("button", { name: "우선순위 선택" }).click();
  await page.getByRole("option", { name: "높음", exact: true }).click();
  await expect(editor).toBeVisible();

  await card.locator(".tasks-card-actions .tasks-more").click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator("#task-800 .tasks-subtask-title")).toHaveText("행 테스트 1");
  await expect(page.getByRole("menu")).toBeVisible();
});

test("제목 편집·마감·우선순위·키보드 완료·삭제는 기존 API를 사용한다", async ({
  page,
}) => {
  const { api, card } = await setup(page, 1);
  const row = card.locator("#task-800");
  await row.getByRole("button", { name: "행 테스트 1", exact: true }).click();
  await expect(
    row.getByRole("textbox", { name: "할 일", exact: true }),
  ).toBeFocused();
  await expect(row.getByText("연결된 할 일 수정")).toHaveCount(0);
  await expect(row.getByText("연결 일정 ·")).toHaveCount(0);
  await row
    .getByRole("textbox", { name: "할 일", exact: true })
    .fill("수정된 할 일");
  await row.getByRole("button", { name: "우선순위 선택" }).click();
  await page.getByRole("option", { name: "높음", exact: true }).click();
  await expect(row.getByText("마감 시간", { exact: true })).toBeVisible();
  await expect(row.getByRole("textbox", { name: "마감 날짜 선택" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "마감 시간 설정" })).toBeVisible();
  await expect(row.getByRole("button", { name: "상태 선택" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "상세 설정" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: "카테고리 선택" })).toHaveCount(0);
  await expect(row.getByRole("button", { name: /알림/ })).toHaveCount(0);
  await row.getByRole("button", { name: "마감 시간 설정" }).click();
  const dueTime = row.getByRole("textbox", { name: "마감 시간 선택" });
  await dueTime.fill("12:30");
  const timeDropdown = row.getByRole("listbox");
  await expect(timeDropdown.getByRole("button", { name: "12:30" })).toBeVisible();
  const inputBounds = await dueTime.boundingBox();
  const dropdownBounds = await timeDropdown.boundingBox();
  expect(
    dropdownBounds!.y >= inputBounds!.y + inputBounds!.height ||
      dropdownBounds!.y + dropdownBounds!.height <= inputBounds!.y,
  ).toBe(true);
  await dueTime.press("Enter");
  await row.getByRole("button", { name: "저장", exact: true }).click();
  expect(api.state.tasks[0].due_datetime).toContain("2026-09-09T12:30");
  await expect(
    row.getByRole("button", { name: "수정된 할 일", exact: true }),
  ).toBeFocused();
  await expect(row).toContainText("12:30");
  await expect(row.locator(".tasks-priority-badge")).toHaveText("높음");
  await expect(row.getByRole("button", { name: "수정된 할 일 더보기" })).toHaveCount(0);
  const checkbox = row.getByRole("checkbox", {
    name: "수정된 할 일 완료",
    exact: true,
  });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  await expect(checkbox).toBeFocused();
  expect(
    api.state.schedules.find((schedule) => schedule.schedule_id === 201)
      ?.is_completed,
  ).toBeFalsy();
  await checkbox.press("Space");
  await expect(checkbox).not.toBeChecked();
  await row.getByRole("button", { name: "수정된 할 일", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    row.getByRole("button", { name: "수정된 할 일", exact: true }),
  ).toBeFocused();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "수정된 할 일 삭제" }).click();
  await expect(row).toHaveCount(0);
  expect(
    api.requests
      .filter((r) => r.method === "PATCH")
      .every((r) => r.path === "/tasks/800"),
  ).toBe(true);
  expect(api.unhandled).toEqual([]);
});

test("우선순위를 저장하면 응답 전에도 표시하고 새로고침 후에도 유지한다", async ({ page }) => {
  const { api, card } = await setup(page, 1);
  const row = card.locator("#task-800");
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/v1/tasks/800", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await responseGate;
    await route.fallback();
  });

  try {
    await row.getByRole("button", { name: "행 테스트 1", exact: true }).click();
    await row.getByRole("button", { name: "우선순위 선택" }).click();
    await page.getByRole("option", { name: "높음", exact: true }).click();
    await row.getByRole("button", { name: "저장", exact: true }).click();

    await expect(row.locator(".tasks-priority-badge")).toHaveText("높음");
    expect(api.state.tasks[0].priority).toBe("low");
  } finally {
    releaseResponse();
  }

  await expect.poll(() => api.state.tasks[0].priority).toBe("high");
  await page.reload();
  await card.locator(".tasks-card-open").click();
  await expect(card.locator("#task-800 .tasks-priority-badge")).toHaveText("높음");
  expect(api.unhandled).toEqual([]);
});

test("우선순위 저장 실패 시 기존 값을 복구하고 편집 초안을 유지한다", async ({ page }) => {
  const { api, card } = await setup(page, 1);
  const row = card.locator("#task-800");
  await page.route("**/api/v1/tasks/800", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await route.fulfill({
      status: 500,
      json: { success: false, message: "저장 실패", data: {} },
    });
  });

  await row.getByRole("button", { name: "행 테스트 1", exact: true }).click();
  await row.getByRole("button", { name: "우선순위 선택" }).click();
  await page.getByRole("option", { name: "높음", exact: true }).click();
  await row.getByRole("button", { name: "저장", exact: true }).click();
  await expect(row.getByRole("alert")).toContainText("저장 실패");
  await expect(row.getByRole("button", { name: "우선순위 선택" })).toContainText("높음");
  expect(api.state.tasks[0].priority).toBe("low");

  await page.unroute("**/api/v1/tasks/800");
  await row.getByRole("button", { name: "저장", exact: true }).click();
  await expect(row.locator(".tasks-priority-badge")).toHaveText("높음");
  await expect.poll(() => api.state.tasks[0].priority).toBe("high");
});

test("연결된 할 일의 시간 제거와 날짜 선택 숨김", async ({ page }) => {
  const { api, card } = await setup(page, 1);
  const row = card.locator("#task-800");
  api.state.tasks[0].due_datetime = "2026-09-09T12:30:00+09:00";
  await page.reload();
  await card.locator(".tasks-card-open").click();
  await row.getByRole("button", { name: "행 테스트 1", exact: true }).click();
  await row.getByRole("button", { name: "마감 시간 수정" }).click();
  await expect(row.getByRole("textbox", { name: "마감 시간 선택" })).toBeVisible();
  await row.getByRole("textbox", { name: "마감 시간 선택" }).press("Escape");
  await expect(row.getByRole("button", { name: "마감 시간 수정" })).toBeFocused();
  await row.getByRole("button", { name: "마감 시간 수정" }).click();
  await row.getByRole("textbox", { name: "할 일", exact: true }).click();
  await expect(row.getByRole("button", { name: "마감 시간 수정" })).toBeVisible();
  await row.getByRole("button", { name: "마감 시간 제거" }).click();
  await expect(row.getByRole("button", { name: "마감 시간 설정" })).toBeVisible();
  await expect(row.getByRole("textbox", { name: "마감 시간 선택" })).toHaveCount(0);
  await row.getByRole("button", { name: "저장", exact: true }).click();
  expect(api.state.tasks[0].due_datetime).toBeNull();

  api.state.schedules[0].end_datetime = "2026-09-10T11:00:00+09:00";
  await page.reload();
  await card.locator(".tasks-card-open").click();
  await row.getByRole("button", { name: "행 테스트 1", exact: true }).click();
  await expect(row.getByRole("textbox", { name: "마감 날짜 선택" })).toHaveCount(0);
  await expect(row.getByText("마감 시간", { exact: true })).toBeVisible();

  await page.goto("/schedules");
  await page.getByRole("button", { name: /QA 디자인 검토 회의/ }).first().click();
  await page.getByRole("button", { name: "행 테스트 1 연결 해제" }).click();
  await expect.poll(() => api.state.tasks[0].schedule_id).toBeNull();
  await page.goto("/tasks");
  await page.locator(".tasks-independent-section").getByRole("button", { name: /독립 할 일/ }).click();
  const independentRow = page.locator("#task-800");
  await independentRow.getByRole("button", { name: "행 테스트 1", exact: true }).click();
  await expect(independentRow.getByRole("textbox", { name: "마감 날짜 선택" })).toBeVisible();
});

test("일정 날짜를 옮기면 연결된 할 일의 마감 시간은 유지된다", async ({ page }) => {
  const { api } = await setup(page, 1);
  api.state.tasks[0].due_datetime = "2026-09-09T12:30:00+09:00";
  await page.goto("/schedules");
  const schedule = page.getByRole("button", { name: /QA 디자인 검토 회의/ }).first();
  await schedule.click();
  await expect(page.getByRole("heading", { name: "일정 수정" })).toBeVisible();
  const startDate = page.getByLabel("시작 날짜", { exact: true });
  await startDate.click();
  await page.locator(".schedule-date-popover").getByRole("button", { name: "10", exact: true }).click();
  // Committing the start date advances focus and opens the end-date calendar.
  const endDate = page.getByLabel("종료 날짜", { exact: true });
  await expect(endDate).toBeFocused();
  await expect(endDate).toHaveAttribute("aria-expanded", "true");
  await page.locator(".schedule-date-popover").getByRole("button", { name: "10", exact: true }).click();
  await expect(endDate).toHaveAttribute("aria-expanded", "false");
  await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "저장" }).click();
  await expect.poll(() => api.state.tasks[0].due_datetime).toContain("2026-09-10T12:30");
  expect(api.unhandled).toEqual([]);
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`${width}px에서 긴 제목·여러 우선순위·마감 없음·편집 폼의 너비`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    await page.setViewportSize({ width, height: 900 });
    const { api, card } = await setup(page, 12, 2);
    api.state.tasks[2].title = "아주 긴 할 일 제목 ".repeat(9);
    await page.reload();
    await card.locator(".tasks-card-open").click();
    await expect(card.locator(".tasks-card-details")).toBeVisible();
    await card.getByRole("button", { name: "+ 7개 더 보기" }).click();
    await expect(card.locator(".tasks-subtask:visible")).toHaveCount(12);
    const metrics = await card.evaluate((el) => {
      const rows = [
        ...el.querySelectorAll<HTMLElement>(".tasks-subtask"),
      ].filter((row) => !row.hidden);
      return rows.map((row) => ({
        height: row.clientHeight,
        width: row.clientWidth,
        scroll: row.scrollWidth,
      }));
    });
    expect(metrics.every((row) => row.scroll <= row.width + 1)).toBe(true);
    if (width === 1440)
      expect(metrics.slice(1).every((row) => row.height <= 46)).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await testInfo.attach(`task-rows-${width}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await card
      .locator(".tasks-subtask-open")
      .filter({ visible: true })
      .first()
      .click();
    const editor = card.locator("[data-task-editor]");
    expect(
      await editor.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test("저장 실패 시 인라인 초안을 유지하고 재시도한다", async ({ page }) => {
  const { card } = await setup(page, 0);
  await page.route("**/api/v1/tasks", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 500,
      json: { success: false, message: "저장 실패", data: {} },
    });
  });
  await card.getByRole("button", { name: "할 일 추가", exact: true }).click();
  const input = card.getByRole("textbox", { name: "새 할 일" });
  await input.fill("실패해도 유지");
  await input.press("Enter");
  await expect(card.getByRole("alert")).toBeVisible();
  await expect(input).toHaveValue("실패해도 유지");
  await page.unroute("**/api/v1/tasks");
  await input.press("Enter");
  await expect(
    card.getByRole("button", { name: "실패해도 유지", exact: true }),
  ).toBeVisible();
});
