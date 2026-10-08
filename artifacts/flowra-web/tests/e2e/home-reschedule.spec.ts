import { expect, test, type Locator, type Page } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

async function setup(
  page: Page,
  empty = false,
  configure?: (
    state: Awaited<ReturnType<typeof installMockApi>>["state"],
  ) => void,
) {
  await page.clock.setFixedTime(new Date(QA_NOW));
  const api = await installMockApi(page, { empty });
  await seedAuth(page);
  if (!empty) {
    api.state.tasks[0].due_datetime = "2026-09-07T18:00:00+09:00";
    api.state.tasks[0].schedule_id = undefined;
    api.state.tasks[1].due_datetime = "2026-09-08T18:00:00+09:00";
  }
  configure?.(api.state);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘 할 일", exact: true }),
  ).toBeVisible();
  return api;
}

async function setTime(
  page: Page,
  time = "16:00",
  scope: Locator = page.getByRole("dialog"),
  controlLabel = "시작 시간",
) {
  await expandTask(scope);
  const input = scope.getByRole("textbox", {
    name: controlLabel,
    exact: true,
  });
  await input.fill(time);
  await input.press("Tab");
}

async function choosePlanDate(
  page: Page,
  day: number,
  scope: Locator = page.getByRole("dialog"),
) {
  await expandTask(scope);
  await scope.getByRole("button", { name: "계획 날짜", exact: true }).click();
  const calendar = page.locator(".schedule-date-popover");
  await expect(calendar).toBeVisible();
  await calendar
    .getByRole("button", { name: String(day), exact: true })
    .click();
  await expect(calendar).toHaveCount(0);
}

async function setDuration(
  page: Page,
  scope: Locator,
  label: string,
  controlLabel = "예상 소요 시간",
) {
  await expandTask(scope);
  await scope.getByRole("button", { name: controlLabel, exact: true }).click();
  await page
    .getByRole("listbox", { name: controlLabel, exact: true })
    .getByRole("option", { name: label, exact: true })
    .click();
}

async function expandTask(scope: Locator) {
  const toggle = scope.getByRole("button", { name: / 일정 설정$/ });
  if (
    (await toggle.count()) === 1 &&
    (await toggle.getAttribute("aria-expanded")) === "false"
  ) {
    await toggle.click();
  }
}

async function collapseTask(scope: Locator) {
  const toggle = scope.getByRole("button", { name: / 일정 설정$/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
}

test("home reschedules with an unchanged deadline, then completes the original task", async ({
  page,
}) => {
  const api = await setup(page);
  const due = api.state.tasks[0].due_datetime;
  const overdue = page.getByRole("region", { name: "밀린 작업", exact: true });
  await expect(overdue.getByText("2일 지연", { exact: false })).toBeVisible();
  await overdue
    .getByRole("button", { name: "재계획", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "작업 재계획", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "재계획하기", exact: true }),
  ).toBeEnabled();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("10:00");
  await expect(
    page.getByRole("dialog").getByText("예상 시간", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).not.toContainText(
    "시작 시간을 선택해 주세요",
  );
  await setTime(page);
  await expect(
    page.getByRole("dialog").getByText("예상 시간", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText(/16:00\s*→\s*17:00/),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "재계획하기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.state.tasks[0].due_datetime).toBe(due);
  expect(api.state.tasks).toHaveLength(4);
  expect(api.state.schedules).toHaveLength(4);
  expect(
    api.state.schedules.find((item) => item.schedule_id === 201)
      ?.start_datetime,
  ).toBe("2026-09-09T10:00:00+09:00");
  const created = api.state.schedules.find(
    (item) => item.schedule_id === api.state.tasks[0].schedule_id,
  )!;
  expect(created.start_datetime).toBe("2026-09-09T16:00:00+09:00");
  expect(created.end_datetime).toBe("2026-09-09T17:00:00+09:00");
  expect(
    api.requests.find(
      (request) => request.path === "/tasks/101" && request.method === "PATCH",
    )?.body,
  ).toEqual({ schedule_id: String(created.schedule_id) });
  await page.reload();
  await expect(
    page.getByRole("region", { name: "밀린 작업", exact: true }),
  ).toBeVisible();
  const today = page.getByRole("region", { name: "오늘 할 일", exact: true });
  await expect(
    today.getByRole("link", { name: "QA 오늘 할 일", exact: true }),
  ).toBeVisible();
  await expect(
    overdue.getByRole("link", { name: "QA 오늘 할 일", exact: true }),
  ).toHaveCount(0);
  await today
    .getByRole("button", { name: "미완료, 완료로 변경", exact: true })
    .first()
    .click();
  await expect(
    overdue.getByRole("link", { name: "QA 오늘 할 일", exact: true }),
  ).toHaveCount(0);
  await expect(
    today.getByRole("link", { name: "QA 오늘 할 일", exact: true }),
  ).toHaveCount(0);
  expect(api.state.tasks[0].status).toBe("done");
  expect(api.unhandled).toEqual([]);
});

test("reschedule defaults refresh at each modal open and allow the browser's current minute", async ({
  page,
}) => {
  const api = await setup(page);
  const replan = page.getByTestId("overdue-task-101").getByRole("button", {
    name: "재계획",
    exact: true,
  });
  const dialog = page.getByRole("dialog");
  await page.clock.setFixedTime(new Date("2026-09-09T01:07:49.000Z"));
  await replan.click();
  await expect(
    dialog.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("10:07");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.clock.setFixedTime(new Date("2026-09-09T01:26:15.000Z"));
  await replan.click();
  await expect(
    dialog.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("10:26");
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const single = api.state.schedules.find(
    (schedule) => schedule.schedule_id === api.state.tasks[0].schedule_id,
  )!;
  expect(single.start_datetime).toBe("2026-09-09T10:26:00+09:00");

  await page.clock.setFixedTime(new Date("2026-09-09T01:41:49.000Z"));
  await page
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  const quick = dialog.getByRole("region", { name: "빠른 설정", exact: true });
  const remaining = dialog.getByRole("group", {
    name: "QA 진행 중인 할 일",
    exact: true,
  });
  const toggle = remaining.getByRole("button", {
    name: "QA 진행 중인 할 일 일정 설정",
    exact: true,
  });
  await expect(
    quick.getByRole("textbox", { name: "기본 시작 시간", exact: true }),
  ).toHaveValue("10:41");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(remaining).toContainText("오늘");
  await expect(remaining).toContainText("10:41");
  await expandTask(remaining);
  await expect(
    remaining.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("10:41");
  await collapseTask(remaining);
  await quick.getByRole("button", { name: "전체 적용", exact: true }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const bulk = api.state.schedules.find(
    (schedule) => schedule.schedule_id === api.state.tasks[1].schedule_id,
  )!;
  expect(bulk.start_datetime).toBe("2026-09-09T10:41:00+09:00");
  expect(api.unhandled).toEqual([]);
});

test("bulk accepts current minute defaults for every task when a save crosses into the next minute", async ({
  page,
}) => {
  const api = await setup(page);
  await page.clock.setFixedTime(new Date("2026-09-09T01:07:50.000Z"));
  let creates = 0;
  await page.route("**/api/v1/schedules", async (route) => {
    if (route.request().method() === "POST" && ++creates === 1) {
      await page.clock.setFixedTime(new Date("2026-09-09T01:08:10.000Z"));
    }
    await route.fallback();
  });
  await page
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    dialog
      .getByRole("region", { name: "빠른 설정", exact: true })
      .getByRole("textbox", { name: "기본 시작 시간", exact: true }),
  ).toHaveValue("10:07");
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(creates).toBe(2);
  for (const task of api.state.tasks.slice(0, 2)) {
    const schedule = api.state.schedules.find(
      (item) => item.schedule_id === task.schedule_id,
    )!;
    expect(schedule.start_datetime).toBe("2026-09-09T10:07:00+09:00");
    expect(schedule.end_datetime).toBe("2026-09-09T11:07:00+09:00");
  }
  expect(api.unhandled).toEqual([]);
});

test("today and custom date controls stay inside the direct modal and Escape restores focus", async ({
  page,
}) => {
  const api = await setup(page);
  const replan = page
    .getByRole("region", { name: "밀린 작업", exact: true })
    .getByRole("button", { name: "재계획", exact: true })
    .first();
  await expect(
    page.getByRole("button", { name: "오늘 계획", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "내일", exact: true }),
  ).toHaveCount(0);
  await replan.click();
  const dialog = page.getByRole("dialog");
  const date = dialog.getByRole("button", { name: "계획 날짜", exact: true });
  await expect(date).toHaveText("날짜 선택");
  await expect(
    dialog.getByRole("button", { name: "오늘", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByRole("button", { name: "내일", exact: true }),
  ).toHaveCount(0);
  await choosePlanDate(page, 10);
  await expect(date).toHaveText("9월 10일");
  await expect(date).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "오늘", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "오늘", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await date.press("ArrowDown");
  const calendar = page.locator(".schedule-date-popover");
  await expect(calendar).toBeVisible();
  await expect(
    calendar.getByRole("button", { name: "9", exact: true }),
  ).toBeFocused();
  await expect(
    calendar.getByRole("button", { name: "8", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(date).toBeFocused();
  await choosePlanDate(page, 12);
  await expect(date).toHaveText("9월 12일");
  await expect(date).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByRole("button", { name: "오늘", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  const time = dialog.getByRole("textbox", { name: "시작 시간", exact: true });
  await time.click();
  await expect(time).toHaveAttribute("aria-expanded", "true");
  await time.press("Escape");
  await expect(time).toHaveAttribute("aria-expanded", "false");
  await expect(time).toBeFocused();
  await expect(dialog).toBeVisible();
  const duration = dialog.getByRole("button", {
    name: "예상 소요 시간",
    exact: true,
  });
  await duration.click();
  const durationMenu = page.getByRole("listbox", {
    name: "예상 소요 시간",
    exact: true,
  });
  await expect(durationMenu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(durationMenu).toHaveCount(0);
  await expect(duration).toBeFocused();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(replan).toBeFocused();
  expect(api.requests.filter((r) => r.method === "POST")).toHaveLength(0);
  await replan.click();
  await choosePlanDate(page, 10);
  await setTime(page, "23:30");
  await expect(
    page.getByRole("dialog").getByText(/23:30\s*→\s*9월 11일 00:30/),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "재계획하기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    api.state.schedules.find(
      (item) => item.schedule_id === api.state.tasks[0].schedule_id,
    )?.start_datetime,
  ).toBe("2026-09-10T23:30:00+09:00");
  expect(api.state.tasks[0].due_datetime).toBe("2026-09-07T18:00:00+09:00");
});

test("bulk selection supports row and checkbox clicks and cancellation makes no writes", async ({
  page,
}) => {
  const api = await setup(page);
  const originalTasks = api.state.tasks.map((task) => ({ ...task }));
  const originalSchedules = api.state.schedules.map((schedule) => ({
    ...schedule,
  }));
  await page
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "밀린 작업 재계획", exact: true }),
  ).toBeVisible();
  const steps = dialog.getByRole("list", { name: "재계획 단계", exact: true });
  await expect(
    steps.getByRole("listitem").filter({ hasText: "작업 선택" }),
  ).toHaveAttribute("aria-current", "step");
  await expect(
    steps.getByRole("listitem").filter({ hasText: "일정 설정" }),
  ).toBeVisible();
  await expect(dialog.getByText("2개 선택", { exact: true })).toBeVisible();
  const first = dialog.getByRole("checkbox", {
    name: "QA 오늘 할 일 선택",
    exact: true,
  });
  const second = dialog.getByRole("checkbox", {
    name: "QA 진행 중인 할 일 선택",
    exact: true,
  });
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await dialog.getByText("QA 오늘 할 일", { exact: true }).click();
  await expect(first).not.toBeChecked();
  await second.click();
  await expect(dialog.getByText("0개 선택", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "다음", exact: true }),
  ).toBeDisabled();
  await second.click();
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    dialog.getByRole("group", { name: "QA 오늘 할 일", exact: true }),
  ).toHaveCount(0);
  const selected = dialog.getByRole("group", {
    name: "QA 진행 중인 할 일",
    exact: true,
  });
  await expect(selected).toBeVisible();
  await choosePlanDate(page, 10, selected);
  await setTime(page, "16:15", selected);
  await setDuration(page, selected, "1시간 30분");
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(0);
  const date = selected.getByRole("button", {
    name: "계획 날짜",
    exact: true,
  });
  await date.press("ArrowDown");
  const calendar = page.locator(".schedule-date-popover");
  await expect(calendar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(date).toBeFocused();
  await expect(
    selected.getByRole("button", { name: "계획 날짜", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    selected.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("16:15");
  await expect(
    selected.getByRole("button", { name: "예상 소요 시간", exact: true }),
  ).toHaveText("1시간 30분");
  await collapseTask(selected);
  await expandTask(selected);
  await expect(
    selected.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("16:15");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(api.state.tasks).toEqual(originalTasks);
  expect(api.state.schedules).toEqual(originalSchedules);
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(0);
  expect(api.unhandled).toEqual([]);
});

test("bulk drafts retain independent dates, times and durations until the final submission", async ({
  page,
}) => {
  const api = await setup(page);
  const originalTasks = api.state.tasks.map((task) => ({ ...task }));
  await page
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  const first = dialog.getByRole("group", {
    name: "QA 오늘 할 일",
    exact: true,
  });
  const second = dialog.getByRole("group", {
    name: "QA 진행 중인 할 일",
    exact: true,
  });
  const submit = dialog.getByRole("button", {
    name: "재계획하기",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  for (const task of [first, second]) {
    await expect(
      task.getByRole("button", { name: / 일정 설정$/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(
      task.getByRole("textbox", { name: "시작 시간", exact: true }),
    ).toHaveCount(0);
    await expect(task).toContainText("10:00");
    await expect(task).toContainText("1시간");
  }
  await expect(
    first.getByRole("button", { name: "QA 오늘 할 일 일정 설정", exact: true }),
  ).toBeVisible();
  await choosePlanDate(page, 10, first);
  await setTime(page, "16:15", first);
  await setDuration(page, first, "1시간 30분");
  await expect(submit).toBeEnabled();
  await choosePlanDate(page, 12, second);
  await setTime(page, "19:00", second);
  await setDuration(page, second, "30분");
  await expect(first.getByText(/16:15\s*→\s*17:45/)).toBeVisible();
  await expect(second.getByText(/19:00\s*→\s*19:30/)).toBeVisible();
  await collapseTask(first);
  await expect(first).toContainText("9월 10일");
  await expect(first).toContainText("16:15");
  await expect(first).toContainText("1시간 30분");
  await expandTask(first);
  await expect(
    first.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("16:15");
  await collapseTask(first);
  await collapseTask(second);
  await expect(submit).toBeEnabled();
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(0);
  await dialog.getByRole("button", { name: "이전", exact: true }).click();
  await expect(
    dialog.getByRole("checkbox", { name: "QA 오늘 할 일 선택", exact: true }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", {
      name: "QA 진행 중인 할 일 선택",
      exact: true,
    }),
  ).toBeChecked();
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  await expandTask(first);
  await expandTask(second);
  await expect(
    first.getByRole("button", { name: "계획 날짜", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    first.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("16:15");
  await expect(
    first.getByRole("button", { name: "예상 소요 시간", exact: true }),
  ).toHaveText("1시간 30분");
  await expect(
    second.getByRole("button", { name: "계획 날짜", exact: true }),
  ).toHaveText("9월 12일");
  await expect(
    second.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("19:00");
  await expect(
    second.getByRole("button", { name: "예상 소요 시간", exact: true }),
  ).toHaveText("30분");
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(0);
  await submit.click();
  await expect(dialog).toHaveCount(0);
  const firstTask = api.state.tasks.find((task) => task.task_id === 101)!;
  const secondTask = api.state.tasks.find((task) => task.task_id === 102)!;
  const firstPlan = api.state.schedules.find(
    (schedule) => schedule.schedule_id === firstTask.schedule_id,
  )!;
  const secondPlan = api.state.schedules.find(
    (schedule) => schedule.schedule_id === secondTask.schedule_id,
  )!;
  expect(firstPlan.start_datetime).toBe("2026-09-10T16:15:00+09:00");
  expect(firstPlan.end_datetime).toBe("2026-09-10T17:45:00+09:00");
  expect(secondPlan.start_datetime).toBe("2026-09-12T19:00:00+09:00");
  expect(secondPlan.end_datetime).toBe("2026-09-12T19:30:00+09:00");
  expect(firstPlan.schedule_id).not.toBe(secondPlan.schedule_id);
  expect(api.state.tasks).toHaveLength(originalTasks.length);
  for (const original of originalTasks) {
    const saved = api.state.tasks.find(
      (task) => task.task_id === original.task_id,
    )!;
    expect(saved.due_datetime).toBe(original.due_datetime);
    expect(saved.status).toBe(original.status);
    expect(saved.title).toBe(original.title);
  }
  expect(api.state.schedules).toHaveLength(5);
  expect(
    api.requests
      .filter((request) => request.method === "POST")
      .map((request) => request.path),
  ).toEqual(["/schedules", "/schedules"]);
  expect(
    api.requests
      .filter((request) => request.method === "PATCH")
      .map((request) => ({ path: request.path, body: request.body })),
  ).toEqual([
    {
      path: "/tasks/101",
      body: { schedule_id: String(firstPlan.schedule_id) },
    },
    {
      path: "/tasks/102",
      body: { schedule_id: String(secondPlan.schedule_id) },
    },
  ]);
  expect(api.unhandled).toEqual([]);
});

test("bulk quick settings apply shared fields locally while retaining individual edits and navigation drafts", async ({
  page,
}) => {
  const api = await setup(page);
  const originalTasks = api.state.tasks.map((task) => ({ ...task }));
  const originalSchedules = api.state.schedules.map((schedule) => ({
    ...schedule,
  }));
  await page
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("region", { name: "빠른 설정", exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  const quick = dialog.getByRole("region", {
    name: "빠른 설정",
    exact: true,
  });
  const apply = quick.getByRole("button", { name: "전체 적용", exact: true });
  const first = dialog.getByRole("group", {
    name: "QA 오늘 할 일",
    exact: true,
  });
  const second = dialog.getByRole("group", {
    name: "QA 진행 중인 할 일",
    exact: true,
  });
  const submit = dialog.getByRole("button", {
    name: "재계획하기",
    exact: true,
  });
  await expect(apply).toBeEnabled();
  await expect(
    quick.getByRole("textbox", { name: "기본 시작 시간", exact: true }),
  ).toHaveValue("10:00");
  await expect(
    dialog.getByRole("button", { name: "내일", exact: true }),
  ).toHaveCount(0);
  await choosePlanDate(page, 10, first);
  await setTime(page, "16:00", first);
  await choosePlanDate(page, 12, quick);
  await setTime(page, "18:00", quick, "기본 시작 시간");
  await setDuration(page, quick, "1시간 30분", "기본 소요 시간");
  await expect(apply).toBeEnabled();
  await expect(quick.getByText("예상 시간", { exact: true })).toHaveCount(0);
  await expect(
    first.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("16:00");
  await expect(
    second.getByRole("button", { name: / 일정 설정$/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(second).toContainText("10:00");
  await expect(submit).toBeEnabled();
  await collapseTask(first);
  await apply.click();
  for (const task of [first, second]) {
    await expect(
      task.getByRole("button", { name: / 일정 설정$/ }),
    ).toHaveAttribute("aria-expanded", "false");
    await expect(task).toContainText("9월 12일");
    await expect(task).toContainText("18:00");
    await expect(task).toContainText("1시간 30분");
    await expandTask(task);
    await expect(
      task.getByRole("button", { name: "계획 날짜", exact: true }),
    ).toHaveText("9월 12일");
    await expect(
      task.getByRole("textbox", { name: "시작 시간", exact: true }),
    ).toHaveValue("18:00");
    await expect(
      task.getByRole("button", { name: "예상 소요 시간", exact: true }),
    ).toHaveText("1시간 30분");
    await expect(task.getByText(/18:00\s*→\s*19:30/)).toBeVisible();
  }
  await expect(submit).toBeEnabled();
  expect(api.state.tasks).toEqual(originalTasks);
  expect(api.state.schedules).toEqual(originalSchedules);
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(0);
  await choosePlanDate(page, 10, second);
  await setTime(page, "23:45", second);
  await setDuration(page, second, "30분");
  await expect(second.getByText(/23:45\s*→\s*9월 11일 00:15/)).toBeVisible();
  await dialog.getByRole("button", { name: "이전", exact: true }).click();
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  await expandTask(first);
  await expandTask(second);
  await expect(
    quick.getByRole("button", { name: "계획 날짜", exact: true }),
  ).toHaveText("9월 12일");
  await expect(
    quick.getByRole("textbox", { name: "기본 시작 시간", exact: true }),
  ).toHaveValue("18:00");
  await expect(
    quick.getByRole("button", { name: "기본 소요 시간", exact: true }),
  ).toHaveText("1시간 30분");
  await expect(
    first.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("18:00");
  await expect(
    second.getByRole("button", { name: "계획 날짜", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    second.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("23:45");
  await expect(
    second.getByRole("button", { name: "예상 소요 시간", exact: true }),
  ).toHaveText("30분");
  await submit.click();
  await expect(dialog).toHaveCount(0);
  const firstPlan = api.state.schedules.find(
    (schedule) => schedule.schedule_id === api.state.tasks[0].schedule_id,
  )!;
  const secondPlan = api.state.schedules.find(
    (schedule) => schedule.schedule_id === api.state.tasks[1].schedule_id,
  )!;
  expect(firstPlan.start_datetime).toBe("2026-09-12T18:00:00+09:00");
  expect(firstPlan.end_datetime).toBe("2026-09-12T19:30:00+09:00");
  expect(secondPlan.start_datetime).toBe("2026-09-10T23:45:00+09:00");
  expect(secondPlan.end_datetime).toBe("2026-09-11T00:15:00+09:00");
  expect(api.state.tasks).toHaveLength(originalTasks.length);
  for (const original of originalTasks) {
    expect(
      api.state.tasks.find((task) => task.task_id === original.task_id)!
        .due_datetime,
    ).toBe(original.due_datetime);
  }
  expect(api.unhandled).toEqual([]);
});

test("bulk quick settings update only selected tasks and leave unselected drafts untouched", async ({
  page,
}) => {
  const api = await setup(page);
  const unselectedTask = { ...api.state.tasks[1] };
  await page
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const secondCheckbox = dialog.getByRole("checkbox", {
    name: "QA 진행 중인 할 일 선택",
    exact: true,
  });
  await secondCheckbox.click();
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  const quick = dialog.getByRole("region", {
    name: "빠른 설정",
    exact: true,
  });
  const first = dialog.getByRole("group", {
    name: "QA 오늘 할 일",
    exact: true,
  });
  const second = dialog.getByRole("group", {
    name: "QA 진행 중인 할 일",
    exact: true,
  });
  await expect(second).toHaveCount(0);
  await choosePlanDate(page, 10, quick);
  await setTime(page, "18:15", quick, "기본 시작 시간");
  await setDuration(page, quick, "45분", "기본 소요 시간");
  await quick.getByRole("button", { name: "전체 적용", exact: true }).click();
  await dialog.getByRole("button", { name: "이전", exact: true }).click();
  await secondCheckbox.click();
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  await expandTask(first);
  await expandTask(second);
  await expect(
    first.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("18:15");
  await expect(
    second.getByRole("button", { name: "오늘", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    second.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("10:00");
  await expect(
    second.getByRole("button", { name: "예상 소요 시간", exact: true }),
  ).toHaveText("1시간");
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(0);
  await dialog.getByRole("button", { name: "이전", exact: true }).click();
  await secondCheckbox.click();
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(api.state.tasks[1]).toEqual(unselectedTask);
  const created = api.state.schedules.find(
    (schedule) => schedule.schedule_id === api.state.tasks[0].schedule_id,
  )!;
  expect(created.start_datetime).toBe("2026-09-10T18:15:00+09:00");
  expect(created.end_datetime).toBe("2026-09-10T19:00:00+09:00");
  expect(
    api.requests.filter(
      (request) => request.method === "POST" && request.path === "/schedules",
    ),
  ).toHaveLength(1);
  expect(
    api.requests
      .filter((request) => request.method === "PATCH")
      .map((request) => request.path),
  ).toEqual(["/tasks/101"]);
  expect(api.unhandled).toEqual([]);
});

test("bulk retries a failed link using its created schedule without repeating a successful task", async ({
  page,
}) => {
  const api = await setup(page, false, (state) => {
    state.tasks.push({
      ...state.tasks[0],
      task_id: 105,
      title: "QA 남은 밀린 작업",
      due_datetime: "2026-09-08T19:00:00+09:00",
    });
  });
  const deadlines = api.state.tasks.map((task) => ({
    id: task.task_id,
    due: task.due_datetime,
  }));
  let secondTaskPatchAttempts = 0;
  await page.route("**/api/v1/tasks/102", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    secondTaskPatchAttempts += 1;
    if (secondTaskPatchAttempts !== 1) return route.fallback();
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        message: "두 번째 작업 연결 실패 테스트",
      }),
    });
  });
  await page
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  const first = dialog.getByRole("group", {
    name: "QA 오늘 할 일",
    exact: true,
  });
  const second = dialog.getByRole("group", {
    name: "QA 진행 중인 할 일",
    exact: true,
  });
  const third = dialog.getByRole("group", {
    name: "QA 남은 밀린 작업",
    exact: true,
  });
  await setTime(page, "16:00", first);
  await choosePlanDate(page, 10, second);
  await setTime(page, "18:15", second);
  await setDuration(page, second, "30분");
  await setTime(page, "17:00", third);
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("QA 진행 중인 할 일");
  await expect(first.getByRole("status")).toContainText("재계획 완료");
  await expect(
    first.getByRole("button", { name: / 일정 설정$/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    second.getByRole("button", { name: / 일정 설정$/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(second.getByRole("alert")).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "이전", exact: true }),
  ).toBeDisabled();
  await expect(
    second.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toBeDisabled();
  const firstScheduleId = api.state.tasks.find(
    (task) => task.task_id === 101,
  )!.schedule_id;
  const recovered = api.state.schedules.find(
    (schedule) => schedule.title === "QA 진행 중인 할 일",
  )!;
  expect(firstScheduleId).toBeDefined();
  expect(
    api.state.tasks.find((task) => task.task_id === 102)!.schedule_id,
  ).toBeUndefined();
  expect(recovered.start_datetime).toBe("2026-09-10T18:15:00+09:00");
  expect(recovered.end_datetime).toBe("2026-09-10T18:45:00+09:00");
  const completedPlan = {
    ...api.state.schedules.find(
      (schedule) => schedule.schedule_id === firstScheduleId,
    )!,
  };
  const recoveryPlan = { ...recovered };
  const writesBeforeApply = api.requests.filter(
    (request) => request.method === "POST" || request.method === "PATCH",
  ).length;
  const quick = dialog.getByRole("region", {
    name: "빠른 설정",
    exact: true,
  });
  await choosePlanDate(page, 10, quick);
  await setTime(page, "20:00", quick, "기본 시작 시간");
  await setDuration(page, quick, "45분", "기본 소요 시간");
  await quick.getByRole("button", { name: "전체 적용", exact: true }).click();
  await expect(first.getByRole("status")).toContainText("재계획 완료");
  await expect(
    second.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("18:15");
  await expect(
    second.getByRole("button", { name: "예상 소요 시간", exact: true }),
  ).toHaveText("30분");
  await expect(
    third.getByRole("button", { name: "계획 날짜", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    third.getByRole("textbox", { name: "시작 시간", exact: true }),
  ).toHaveValue("20:00");
  await expect(
    third.getByRole("button", { name: "예상 소요 시간", exact: true }),
  ).toHaveText("45분");
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(writesBeforeApply);
  expect(recovered).toEqual(recoveryPlan);
  expect(
    api.requests.filter(
      (request) => request.method === "POST" && request.path === "/schedules",
    ),
  ).toHaveLength(2);
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(secondTaskPatchAttempts).toBe(2);
  expect(
    api.state.tasks.find((task) => task.task_id === 101)!.schedule_id,
  ).toBe(firstScheduleId);
  expect(
    api.state.tasks.find((task) => task.task_id === 102)!.schedule_id,
  ).toBe(recovered.schedule_id);
  expect(api.state.tasks).toHaveLength(5);
  expect(api.state.schedules).toHaveLength(6);
  expect(
    api.state.schedules.find(
      (schedule) => schedule.schedule_id === firstScheduleId,
    ),
  ).toEqual(completedPlan);
  expect(recovered).toEqual(recoveryPlan);
  const thirdPlan = api.state.schedules.find(
    (schedule) =>
      schedule.schedule_id ===
      api.state.tasks.find((task) => task.task_id === 105)!.schedule_id,
  )!;
  expect(thirdPlan.start_datetime).toBe("2026-09-10T20:00:00+09:00");
  expect(thirdPlan.end_datetime).toBe("2026-09-10T20:45:00+09:00");
  expect(
    api.requests.filter(
      (request) => request.method === "POST" && request.path === "/schedules",
    ),
  ).toHaveLength(3);
  expect(
    api.requests.filter(
      (request) => request.method === "PATCH" && request.path === "/tasks/101",
    ),
  ).toHaveLength(1);
  expect(
    api.requests
      .filter(
        (request) =>
          request.method === "PATCH" && request.path === "/tasks/102",
      )
      .map((request) => request.body),
  ).toEqual([{ schedule_id: String(recovered.schedule_id) }]);
  for (const deadline of deadlines) {
    expect(
      api.state.tasks.find((task) => task.task_id === deadline.id)!
        .due_datetime,
    ).toBe(deadline.due);
  }
  expect(api.unhandled).toEqual([]);
});

test("bulk rejects the previous minute and expands a collapsed invalid task before any writes", async ({
  page,
}) => {
  const api = await setup(page);
  await page
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  await setTime(
    page,
    "16:00",
    dialog.getByRole("group", { name: "QA 오늘 할 일", exact: true }),
  );
  await setTime(
    page,
    "09:59",
    dialog.getByRole("group", { name: "QA 진행 중인 할 일", exact: true }),
  );
  const second = dialog.getByRole("group", {
    name: "QA 진행 중인 할 일",
    exact: true,
  });
  await collapseTask(second);
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(
    second.getByRole("button", { name: / 일정 설정$/ }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(second.getByRole("alert")).toBeFocused();
  await expect(dialog.getByRole("alert")).toContainText("QA 진행 중인 할 일");
  await expect(dialog.getByRole("alert")).toContainText(
    "시작 시간을 선택해 주세요",
  );
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(0);
  expect(api.state.schedules).toHaveLength(3);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("bulk settings scroll internally while header and footer stay visible on mobile and desktop", async ({
  page,
}, testInfo) => {
  const api = await setup(page, false, (state) => {
    state.tasks = Array.from({ length: 12 }, (_, index) => ({
      ...state.tasks[0],
      task_id: 101 + index,
      title: `QA 밀린 작업 ${index + 1}`,
      schedule_id: undefined,
    }));
  });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page
      .getByRole("button", { name: "한 번에 재계획", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("checkbox")).toHaveCount(12);
    await expect(dialog.getByText("12개 선택", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "다음", exact: true }).click();
    await expect(
      dialog.getByRole("group", { name: /^QA 밀린 작업 / }),
    ).toHaveCount(12);
    for (const toggle of await dialog
      .getByRole("button", { name: /^QA 밀린 작업 \d+ 일정 설정$/ })
      .all()) {
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    }
    const body = dialog.getByTestId("bulk-reschedule-body");
    const header = dialog.getByTestId("bulk-reschedule-header");
    const footer = dialog.getByTestId("bulk-reschedule-footer");
    const before = {
      header: await header.boundingBox(),
      footer: await footer.boundingBox(),
    };
    const quick = dialog.getByRole("region", {
      name: "빠른 설정",
      exact: true,
    });
    const quickStart = quick.getByRole("textbox", {
      name: "기본 시작 시간",
      exact: true,
    });
    const quickDuration = quick.getByRole("button", {
      name: "기본 소요 시간",
      exact: true,
    });
    await expect(quick).toBeVisible();
    const quickStartBounds = await quickStart.boundingBox();
    const quickDurationBounds = await quickDuration.boundingBox();
    expect(quickStartBounds).not.toBeNull();
    expect(quickDurationBounds).not.toBeNull();
    expect(
      Math.abs(quickStartBounds!.y - quickDurationBounds!.y),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`home-bulk-quick-settings-${width}.png`),
    });
    await page.screenshot({
      path: testInfo.outputPath(`home-bulk-collapsed-${width}.png`),
    });
    for (const control of [
      {
        name: "date",
        trigger: quick.getByRole("button", {
          name: "계획 날짜",
          exact: true,
        }),
        panel: page.locator(".schedule-date-popover"),
      },
      {
        name: "time",
        trigger: quickStart,
        panel: page.getByRole("listbox"),
      },
      {
        name: "duration",
        trigger: quickDuration,
        panel: page.getByRole("listbox", {
          name: "기본 소요 시간",
          exact: true,
        }),
      },
    ]) {
      await control.trigger.click();
      await expect(control.panel).toBeVisible();
      const bounds = await control.panel.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
      await expect(header).toBeInViewport();
      await expect(footer).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath(
          `home-bulk-quick-${control.name}-${width}.png`,
        ),
      });
      await page.keyboard.press("Escape");
      await expect(control.panel).toHaveCount(0);
      await expect(dialog).toBeVisible();
    }
    await expandTask(
      dialog.getByRole("group", { name: "QA 밀린 작업 1", exact: true }),
    );
    const start = dialog
      .getByRole("textbox", { name: "시작 시간", exact: true })
      .first();
    const duration = dialog
      .getByRole("button", { name: "예상 소요 시간", exact: true })
      .first();
    const columns = await start.evaluate(
      (node) =>
        getComputedStyle(
          node.closest('[class~="sm:grid-cols-2"]')!,
        ).gridTemplateColumns.split(" ").length,
    );
    expect(columns).toBe(width < 640 ? 1 : 2);
    const startHeight = await start.evaluate(
      (node) => node.parentElement!.getBoundingClientRect().height,
    );
    const durationBounds = await duration.boundingBox();
    expect(durationBounds).not.toBeNull();
    expect(Math.abs(startHeight - durationBounds!.height)).toBeLessThanOrEqual(
      1,
    );
    const scroll = await body.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      return {
        top: node.scrollTop,
        height: node.clientHeight,
        contentHeight: node.scrollHeight,
      };
    });
    expect(scroll.contentHeight).toBeGreaterThan(scroll.height);
    expect(scroll.top).toBeGreaterThan(0);
    await expect(
      dialog.getByRole("group", { name: "QA 밀린 작업 12", exact: true }),
    ).toBeInViewport();
    await expect(header).toBeInViewport();
    await expect(footer).toBeInViewport();
    expect(await header.boundingBox()).toEqual(before.header);
    expect(await footer.boundingBox()).toEqual(before.footer);
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`home-bulk-settings-${width}.png`),
    });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(0);
  expect(api.unhandled).toEqual([]);
});

test("failed linking retries the already created schedule without duplicating it", async ({
  page,
}) => {
  const api = await setup(page);
  let failed = false;
  await page.route("**/api/v1/tasks/101", async (route) => {
    if (route.request().method() === "PATCH" && !failed) {
      failed = true;
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ success: false, message: "연결 실패 테스트" }),
      });
    } else await route.fallback();
  });
  await page
    .getByRole("region", { name: "밀린 작업", exact: true })
    .getByRole("button", { name: "재계획", exact: true })
    .first()
    .click();
  await setTime(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "재계획하기", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "취소", exact: true })
    .click();
  await page
    .getByRole("region", { name: "밀린 작업", exact: true })
    .getByRole("button", { name: "연결 다시 시도", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "연결 다시 시도", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    api.requests.filter((r) => r.method === "POST" && r.path === "/schedules"),
  ).toHaveLength(1);
  expect(api.state.tasks[0].due_datetime).toBe("2026-09-07T18:00:00+09:00");
});

test("empty home hides overdue controls and can add a task using the existing form", async ({
  page,
}) => {
  const api = await setup(page, true);
  await expect(
    page.getByRole("region", { name: "밀린 작업", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "밀린 작업 재계획", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(
    page.getByRole("form", { name: "빠른 할 일 추가", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "오늘 할 일", exact: true })
      .getByText("오늘 예정된 할 일이 없어요.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "오늘 할 일", exact: true })
    .getByRole("button", { name: "할 일 추가", exact: true })
    .click();
  await expect(page.getByLabel("새 할 일 마감일", { exact: true })).toHaveValue(
    "2026-09-09",
  );
  await page
    .getByRole("textbox", { name: "새 할 일", exact: true })
    .fill("홈에서 추가한 할 일");
  await page
    .getByRole("form", { name: "빠른 할 일 추가", exact: true })
    .getByRole("button", { name: "추가", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "홈에서 추가한 할 일", exact: true }),
  ).toBeVisible();
  expect(api.state.tasks).toHaveLength(1);
  expect(api.state.tasks[0].due_datetime).toBe("2026-09-09T23:59:00+09:00");
});

test("empty panels stay compact and quick add collapses on Escape or the cancel icon", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const api = await setup(page, true);
  const tasks = page.getByRole("region", { name: "오늘 할 일", exact: true });
  const schedules = page.getByRole("region", {
    name: "오늘 일정",
    exact: true,
  });
  const form = tasks.getByRole("form", {
    name: "빠른 할 일 추가",
    exact: true,
  });
  const add = tasks.getByRole("button", { name: "할 일 추가", exact: true });
  await expect(form).toHaveCount(0);
  await expect(
    tasks.getByText("오늘 예정된 할 일이 없어요.", { exact: true }),
  ).toBeVisible();
  await expect(
    schedules.getByText("오늘 예정된 일정이 없어요.", { exact: true }),
  ).toBeVisible();
  await expect(
    schedules.getByRole("link", { name: "일정 추가", exact: true }),
  ).toHaveAttribute("href", /create=1/);
  await expect(
    schedules.getByRole("link", { name: "캘린더에서 보기", exact: true }),
  ).toBeVisible();
  const taskBounds = await tasks.boundingBox();
  const scheduleBounds = await schedules.boundingBox();
  expect(taskBounds).not.toBeNull();
  expect(scheduleBounds).not.toBeNull();
  expect(taskBounds!.height).toBeLessThan(320);
  expect(
    Math.abs(taskBounds!.height - scheduleBounds!.height),
  ).toBeLessThanOrEqual(1);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const taskPanel = await tasks.boundingBox();
    const schedulePanel = await schedules.boundingBox();
    await testInfo.attach(`home-empty-${width}-metrics`, {
      body: JSON.stringify(
        { width, tasks: taskPanel, schedules: schedulePanel },
        null,
        2,
      ),
      contentType: "application/json",
    });
    const screenshot = testInfo.outputPath(`home-empty-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach(`home-empty-${width}`, {
      path: screenshot,
      contentType: "image/png",
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  await add.click();
  await expect(form).toBeVisible();
  const title = form.getByRole("textbox", { name: "새 할 일", exact: true });
  await expect(title).toBeFocused();
  await title.fill("취소할 할 일");
  await title.press("Escape");
  await expect(form).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await expect(title).toHaveValue("");
  await form
    .getByRole("button", { name: "빠른 추가 취소", exact: true })
    .click();
  await expect(form).toHaveCount(0);
  await expect(add).toBeFocused();
  await add.click();
  await expect(form).toBeVisible();
  await form.getByLabel("새 할 일 마감일", { exact: true }).fill("2026-09-12");
  await form
    .getByRole("button", { name: "빠른 추가 취소", exact: true })
    .click();
  await add.click();
  await expect(form.getByLabel("새 할 일 마감일", { exact: true })).toHaveValue(
    "2026-09-09",
  );
  await title.press("Escape");
  expect(api.state.tasks).toHaveLength(0);
  expect(
    api.requests.filter((request) => request.method === "POST"),
  ).toHaveLength(0);
});

test("a lost link response is reconciled without a second create or patch", async ({
  page,
}) => {
  const api = await setup(page);
  let patches = 0;
  await page.route("**/api/v1/tasks/101", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    patches += 1;
    api.state.tasks[0].schedule_id = Number(
      route.request().postDataJSON().schedule_id,
    );
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ success: false, message: "응답 유실 테스트" }),
    });
  });
  await page
    .getByRole("region", { name: "밀린 작업", exact: true })
    .getByRole("button", { name: "재계획", exact: true })
    .first()
    .click();
  await setTime(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "재계획하기", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "연결 다시 시도", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "오늘 할 일", exact: true })
      .getByRole("link", { name: "QA 오늘 할 일", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "밀린 작업", exact: true })
      .getByRole("link", { name: "QA 오늘 할 일", exact: true }),
  ).toHaveCount(0);
  expect(patches).toBe(1);
  expect(
    api.requests.filter((r) => r.method === "POST" && r.path === "/schedules"),
  ).toHaveLength(1);
  expect(api.state.tasks[0].due_datetime).toBe("2026-09-07T18:00:00+09:00");
});

test("a failed task query does not claim there are zero overdue tasks", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(QA_NOW));
  await installMockApi(page, { failures: { "GET /tasks": 500 } });
  await seedAuth(page);
  await page.goto("/");
  await expect(
    page.getByText("할 일을 불러오지 못했습니다", { exact: true }),
  ).toBeVisible();
  const summary = page.getByRole("region", { name: "오늘 요약", exact: true });
  await expect(
    summary.getByText("밀린 작업이 없어요", { exact: true }),
  ).toHaveCount(0);
  await expect(summary.getByText("—", { exact: true })).toBeVisible();
});

test("undated, future and unplanned overdue tasks do not populate today's tasks", async ({
  page,
}) => {
  await setup(page);
  const today = page.getByRole("region", { name: "오늘 할 일", exact: true });
  await expect(
    today.getByText("오늘 예정된 할 일이 없어요.", { exact: true }),
  ).toBeVisible();
  await expect(today.getByRole("link", { name: /^QA / })).toHaveCount(0);
  const overdue = page.getByRole("region", { name: "밀린 작업", exact: true });
  await expect(overdue.getByRole("link", { name: /^QA / })).toHaveCount(2);
  await expect(
    overdue.getByRole("button", { name: "재계획", exact: true }),
  ).toHaveCount(2);
});

test("today's due and scheduled tasks appear once while overdue totals retain their deadlines", async ({
  page,
}) => {
  await setup(page, false, (state) => {
    state.tasks[1].due_datetime = "2026-09-10T18:00:00+09:00";
    state.tasks[3].schedule_id = 201;
    state.tasks.push(
      {
        ...state.tasks[0],
        task_id: 105,
        title: "QA 오늘 마감",
        due_datetime: "2026-09-09T18:00:00+09:00",
        schedule_id: undefined,
      },
      {
        ...state.tasks[0],
        task_id: 106,
        title: "QA 오늘 재계획",
        schedule_id: 201,
      },
      {
        ...state.tasks[0],
        task_id: 107,
        title: "QA 내일 재계획",
        schedule_id: 203,
      },
    );
  });
  const today = page.getByRole("region", { name: "오늘 할 일", exact: true });
  const overdue = page.getByRole("region", { name: "밀린 작업", exact: true });
  for (const title of [
    "QA 오늘 마감",
    "QA 기한 없는 할 일",
    "QA 오늘 재계획",
  ]) {
    await expect(
      today.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      overdue.getByRole("link", { name: title, exact: true }),
    ).toHaveCount(0);
  }
  for (const title of ["QA 오늘 할 일", "QA 내일 재계획"]) {
    await expect(
      overdue.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      today.getByRole("link", { name: title, exact: true }),
    ).toHaveCount(0);
  }
  await expect(
    today.getByRole("link", { name: "QA 진행 중인 할 일", exact: true }),
  ).toHaveCount(0);
  await expect(
    today.getByRole("link", { name: "QA 완료한 할 일", exact: true }),
  ).toHaveCount(0);
  const overdueStat = page
    .getByRole("region", { name: "오늘 요약", exact: true })
    .locator(":scope > div")
    .filter({ has: page.getByText("지연된 작업", { exact: true }) });
  await expect(overdueStat.locator("p").nth(1)).toHaveText(/3\s*개/);
});

test("future linked overdue tasks show the fetched plan after reload and cannot create duplicates", async ({
  page,
}) => {
  const api = await setup(page, false, (state) => {
    state.tasks[0].schedule_id = 203;
  });
  const overdue = page.getByRole("region", { name: "밀린 작업", exact: true });
  await expect(
    overdue.getByText("9월 10일 하루 종일 예정", { exact: false }),
  ).toBeVisible();
  await expect(
    overdue.getByRole("link", { name: "일정 보기", exact: true }),
  ).toHaveAttribute("href", /schedule_id=203/);
  await expect(
    overdue.getByRole("button", { name: "재계획", exact: true }),
  ).toHaveCount(1);
  await expect(
    overdue.getByRole("link", { name: "연결된 일정 보기", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    overdue.getByText("9월 10일 하루 종일 예정", { exact: false }),
  ).toBeVisible();
  await expect(
    overdue.getByRole("button", { name: "재계획", exact: true }),
  ).toHaveCount(1);
  expect(
    api.requests.filter((request) => request.method === "POST"),
  ).toHaveLength(0);
});

test("bulk planning excludes valid plans and disables its header action when all are planned", async ({
  page,
}) => {
  const api = await setup(page, false, (state) => {
    state.tasks[0].schedule_id = 203;
  });
  const overdue = page.getByRole("region", { name: "밀린 작업", exact: true });
  await overdue
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toHaveCount(1);
  await expect(dialog.getByText("QA 오늘 할 일", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    dialog.getByText("QA 진행 중인 할 일", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("1개 선택", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  api.state.tasks[1].schedule_id = 203;
  await page.reload();
  await expect(
    overdue.getByRole("button", { name: "한 번에 재계획", exact: true }),
  ).toBeDisabled();
  await expect(
    overdue.getByRole("button", { name: "재계획", exact: true }),
  ).toHaveCount(0);
  expect(
    api.requests.filter((request) => request.method === "POST"),
  ).toHaveLength(0);
});

test("home distinguishes unplanned, future, past, active and completed tasks without duplicate rows", async ({
  page,
}, testInfo) => {
  const api = await setup(page, false, (state) => {
    const task = state.tasks[0];
    state.tasks = [
      {
        ...task,
        task_id: 101,
        title: "QA 일정 없는 지연 작업",
        schedule_id: undefined,
      },
      {
        ...task,
        task_id: 102,
        title: "QA 내일 계획된 지연 작업",
        schedule_id: 203,
      },
      {
        ...task,
        task_id: 103,
        title: "QA 오늘 미래 계획된 지연 작업",
        schedule_id: 201,
      },
      {
        ...task,
        task_id: 104,
        title: "QA 지난 날짜 계획된 지연 작업",
        schedule_id: 204,
      },
      {
        ...task,
        task_id: 105,
        title: "QA 오늘 종료된 지연 작업",
        schedule_id: 205,
      },
      {
        ...task,
        task_id: 106,
        title: "QA 현재 진행 중인 지연 작업",
        schedule_id: 206,
      },
      {
        ...task,
        task_id: 107,
        title: "QA 완료된 지연 작업",
        schedule_id: 204,
        status: "done",
      },
    ];
    state.schedules[0].start_datetime = "2026-09-09T18:00:00+09:00";
    state.schedules[0].end_datetime = "2026-09-09T19:00:00+09:00";
    state.schedules[2].start_datetime = "2026-09-10T14:00:00+09:00";
    state.schedules[2].end_datetime = "2026-09-10T15:00:00+09:00";
    state.schedules[2].all_day = false;
    state.schedules.push(
      {
        ...state.schedules[0],
        schedule_id: 204,
        title: "QA 지난 일정",
        start_datetime: "2026-09-08T09:00:00+09:00",
        end_datetime: "2026-09-08T10:00:00+09:00",
      },
      {
        ...state.schedules[0],
        schedule_id: 205,
        title: "QA 오늘 종료된 일정",
        start_datetime: "2026-09-09T08:00:00+09:00",
        end_datetime: "2026-09-09T09:00:00+09:00",
      },
      {
        ...state.schedules[0],
        schedule_id: 206,
        title: "QA 진행 중인 일정",
        start_datetime: "2026-09-09T09:30:00+09:00",
        end_datetime: "2026-09-09T10:30:00+09:00",
      },
    );
  });
  const overdue = page.getByRole("region", { name: "밀린 작업", exact: true });
  const today = page.getByRole("region", { name: "오늘 할 일", exact: true });
  for (const id of [101, 104, 105]) {
    await expect(
      page
        .getByTestId(`overdue-task-${id}`)
        .getByRole("button", { name: "재계획", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId(`overdue-task-${id}`)
        .getByRole("link", { name: "일정 보기", exact: true }),
    ).toHaveCount(0);
  }
  const tomorrow = page.getByTestId("overdue-task-102");
  await expect(
    tomorrow.getByText("9월 10일 14:00 예정", { exact: false }),
  ).toBeVisible();
  await expect(
    tomorrow.getByRole("link", { name: "일정 보기", exact: true }),
  ).toHaveAttribute("href", /schedule_id=203/);
  await expect(
    tomorrow.getByRole("button", { name: "재계획", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("overdue-task-104")).toContainText(
    /지난 일정.*9월 8일 09:00/,
  );
  await expect(page.getByTestId("overdue-task-105")).toContainText(
    /지난 일정.*9월 9일 08:00/,
  );
  for (const title of [
    "QA 오늘 미래 계획된 지연 작업",
    "QA 현재 진행 중인 지연 작업",
  ]) {
    await expect(
      today.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      overdue.getByRole("link", { name: title, exact: true }),
    ).toHaveCount(0);
  }
  await expect(
    today.getByText("오늘 18:00 예정", { exact: false }),
  ).toBeVisible();
  await expect(
    today.getByRole("link", { name: "일정 보기", exact: true }),
  ).toHaveCount(2);
  for (const title of [
    "QA 일정 없는 지연 작업",
    "QA 내일 계획된 지연 작업",
    "QA 지난 날짜 계획된 지연 작업",
    "QA 오늘 종료된 지연 작업",
  ]) {
    await expect(
      overdue.getByRole("link", { name: title, exact: true }),
    ).toBeVisible();
    await expect(
      today.getByRole("link", { name: title, exact: true }),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("link", { name: "QA 완료된 지연 작업", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("home-task-plans-a-g.png"),
    fullPage: true,
  });
  await overdue
    .getByRole("button", { name: "한 번에 재계획", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("checkbox")).toHaveCount(3);
  await expect(dialog.getByText("3개 선택", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("home-task-plans-a-g-bulk.png"),
    fullPage: true,
  });
  for (const title of [
    "QA 일정 없는 지연 작업",
    "QA 지난 날짜 계획된 지연 작업",
    "QA 오늘 종료된 지연 작업",
  ]) {
    await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  }
  for (const title of [
    "QA 내일 계획된 지연 작업",
    "QA 오늘 미래 계획된 지연 작업",
    "QA 현재 진행 중인 지연 작업",
    "QA 완료된 지연 작업",
  ]) {
    await expect(dialog.getByText(title, { exact: true })).toHaveCount(0);
  }
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  expect(
    api.requests.filter((request) => request.method === "POST"),
  ).toHaveLength(0);
  expect(api.unhandled).toEqual([]);
});

test("an incomplete task with a past linked schedule can replan while retaining its deadline and history", async ({
  page,
}) => {
  const api = await setup(page, false, (state) => {
    state.tasks[0].schedule_id = 203;
    state.schedules[2].start_datetime = "2026-09-08T09:00:00+09:00";
    state.schedules[2].end_datetime = "2026-09-08T10:00:00+09:00";
    state.schedules[2].all_day = false;
  });
  const originalTask = { ...api.state.tasks[0] };
  const originalSchedule = { ...api.state.schedules[2] };
  const row = page.getByTestId("overdue-task-101");
  await expect(row).toContainText(/지난 일정.*9월 8일 09:00/);
  await row.getByRole("button", { name: "재계획", exact: true }).click();
  await setTime(page, "18:00");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "재계획하기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const created = api.state.schedules.find(
    (schedule) => schedule.schedule_id === api.state.tasks[0].schedule_id,
  )!;
  expect(created.schedule_id).not.toBe(originalTask.schedule_id);
  expect(created.start_datetime).toBe("2026-09-09T18:00:00+09:00");
  expect(created.end_datetime).toBe("2026-09-09T19:00:00+09:00");
  expect(api.state.tasks[0].due_datetime).toBe(originalTask.due_datetime);
  expect(api.state.tasks[0].task_id).toBe(originalTask.task_id);
  expect(api.state.tasks[0].status).toBe(originalTask.status);
  expect(api.state.tasks).toHaveLength(4);
  expect(api.state.schedules).toHaveLength(4);
  expect(
    api.state.schedules.find(
      (schedule) => schedule.schedule_id === originalSchedule.schedule_id,
    ),
  ).toEqual(originalSchedule);
  expect(
    api.requests.filter(
      (request) => request.method === "POST" && request.path === "/schedules",
    ),
  ).toHaveLength(1);
  expect(
    api.requests
      .filter(
        (request) =>
          request.method === "PATCH" && request.path === "/tasks/101",
      )
      .map((request) => request.body),
  ).toEqual([{ schedule_id: String(created.schedule_id) }]);
  const today = page.getByRole("region", { name: "오늘 할 일", exact: true });
  await expect(
    today.getByRole("link", { name: originalTask.title, exact: true }),
  ).toBeVisible();
  await expect(
    today.getByText("오늘 18:00 예정", { exact: false }),
  ).toBeVisible();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(
    today.getByRole("link", { name: originalTask.title, exact: true }),
  ).toBeVisible();
  await expect(row).toHaveCount(0);
  expect(api.unhandled).toEqual([]);
});

test("a task linked while its modal is open rejects the stale plan without creating or patching", async ({
  page,
}) => {
  const api = await setup(page);
  const due = api.state.tasks[0].due_datetime;
  const row = page.getByTestId("overdue-task-101");
  await row.getByRole("button", { name: "재계획", exact: true }).click();
  await setTime(page);
  api.state.tasks[0].schedule_id = 203;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "재계획하기", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "연결된 일정이 변경됐어요.",
  );
  expect(
    api.requests.filter((request) => request.method === "POST"),
  ).toHaveLength(0);
  expect(
    api.requests.filter((request) => request.method === "PATCH"),
  ).toHaveLength(0);
  expect(api.state.tasks[0].due_datetime).toBe(due);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "취소", exact: true })
    .click();
  await expect(
    row.getByRole("link", { name: "일정 보기", exact: true }),
  ).toHaveAttribute("href", /schedule_id=203/);
  await expect(
    row.getByRole("button", { name: "재계획", exact: true }),
  ).toHaveCount(0);
});

test("a past schedule moved into the future while replanning blocks stale submission before writes", async ({
  page,
}) => {
  const api = await setup(page, false, (state) => {
    state.tasks[0].schedule_id = 203;
    state.schedules[2].start_datetime = "2026-09-08T09:00:00+09:00";
    state.schedules[2].end_datetime = "2026-09-08T10:00:00+09:00";
    state.schedules[2].all_day = false;
  });
  const deadline = api.state.tasks[0].due_datetime;
  await page
    .getByTestId("overdue-task-101")
    .getByRole("button", { name: "재계획", exact: true })
    .click();
  await setTime(page);
  api.state.schedules[2].start_datetime = "2026-09-10T14:00:00+09:00";
  api.state.schedules[2].end_datetime = "2026-09-10T15:00:00+09:00";
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "이미 예정된 일정이 있어요.",
  );
  expect(
    api.requests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    ),
  ).toHaveLength(0);
  expect(api.state.tasks[0].schedule_id).toBe(203);
  expect(api.state.tasks[0].due_datetime).toBe(deadline);
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  await page.reload();
  const row = page.getByTestId("overdue-task-101");
  await expect(
    row.getByRole("link", { name: "일정 보기", exact: true }),
  ).toHaveAttribute("href", /schedule_id=203/);
  await expect(
    row.getByRole("button", { name: "재계획", exact: true }),
  ).toHaveCount(0);
});

test("a failed linked schedule lookup keeps the existing link and does not offer duplicate planning", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(QA_NOW));
  const api = await installMockApi(page, {
    failures: { "GET /schedules/203": 500 },
  });
  api.state.tasks[0].due_datetime = "2026-09-07T18:00:00+09:00";
  api.state.tasks[0].schedule_id = 203;
  await seedAuth(page);
  await page.goto("/");
  const row = page.getByTestId("overdue-task-101");
  await expect(
    row.getByText("일정의 시간을 확인하지 못했어요.", { exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("link", { name: "일정 보기", exact: true }),
  ).toHaveAttribute("href", /schedule_id=203/);
  await expect(
    row.getByRole("button", { name: "재계획", exact: true }),
  ).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "연결 다시 시도", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "밀린 작업", exact: true })
      .getByRole("button", { name: "한 번에 재계획", exact: true }),
  ).toBeDisabled();
  expect(
    api.requests.filter((request) => request.method === "POST"),
  ).toHaveLength(0);
  expect(api.state.tasks[0].schedule_id).toBe(203);
  expect(api.state.tasks[0].due_datetime).toBe("2026-09-07T18:00:00+09:00");
});

test("a started schedule without an end time stays uncertain and is excluded from bulk planning", async ({
  page,
}) => {
  const api = await setup(page, false, (state) => {
    state.tasks[0].schedule_id = 201;
    state.tasks[1].due_datetime = "2026-09-10T18:00:00+09:00";
    state.schedules[0].start_datetime = "2026-09-09T09:00:00+09:00";
    state.schedules[0].end_datetime = null;
  });
  const row = page.getByTestId("overdue-task-101");
  await expect(
    row.getByText("일정의 시간 정보가 필요해요.", { exact: true }),
  ).toBeVisible();
  await expect(
    row.getByRole("link", { name: "일정 보기", exact: true }),
  ).toHaveAttribute("href", /schedule_id=201/);
  await expect(
    row.getByRole("button", { name: "재계획", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "오늘 할 일", exact: true })
      .getByRole("link", { name: "QA 오늘 할 일", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "밀린 작업", exact: true })
      .getByRole("button", { name: "한 번에 재계획", exact: true }),
  ).toBeDisabled();
  expect(
    api.requests.filter((request) => request.method === "POST"),
  ).toHaveLength(0);
  expect(api.state.tasks[0].schedule_id).toBe(201);
});

test("briefing keeps current totals and its recommendation without action buttons", async ({
  page,
}) => {
  const api = await setup(page);
  const briefing = page.getByRole("region", {
    name: "AI 데일리 브리핑",
    exact: true,
  });
  const lines = briefing.locator(":scope > p");
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText("미완료 작업이 3개");
  await expect(lines.nth(1)).toContainText("2개");
  await expect(lines.nth(1)).not.toContainText("미완료 작업이 3개");
  await expect(lines.nth(1)).toContainText("밀린 작업을 다시 계획해 보세요.");
  await expect(briefing).not.toContainText("미배정 작업");
  const serverText = briefing.getByText(
    "오늘의 일정과 할 일을 확인하고 차근차근 시작해 보세요.",
    { exact: true },
  );
  await expect(serverText).toHaveCount(0);
  await expect(briefing.getByRole("button")).toHaveCount(0);
  await expect(briefing.getByRole("link")).toHaveCount(0);
  api.state.tasks[3].due_datetime = "2026-09-08T18:00:00+09:00";
  await page.reload();
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText("미완료 작업이 3개");
  await expect(lines.nth(1)).toContainText(
    "미완료 작업이 모두 지연되어 있어요.",
  );
  await expect(lines.nth(1)).not.toContainText("3개");
  await expect(briefing.getByRole("button")).toHaveCount(0);
  await expect(serverText).toHaveCount(0);
});

test("home limits both panels to four items, reports the remainder and keeps their desktop heights equal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await setup(page, false, (state) => {
    const task = state.tasks[0];
    const schedule = state.schedules[0];
    state.tasks = Array.from({ length: 6 }, (_, index) => ({
      ...task,
      task_id: 101 + index,
      title: `QA 오늘 작업 ${index + 1}`,
      due_datetime: "2026-09-09T18:00:00+09:00",
      schedule_id: undefined,
    }));
    state.schedules = Array.from({ length: 6 }, (_, index) => ({
      ...schedule,
      schedule_id: 201 + index,
      title: `QA 오늘 일정 ${index + 1}`,
      start_datetime: `2026-09-09T${String(10 + index).padStart(2, "0")}:00:00+09:00`,
      end_datetime: `2026-09-09T${String(11 + index).padStart(2, "0")}:00:00+09:00`,
    }));
  });
  const tasks = page.getByRole("region", { name: "오늘 할 일", exact: true });
  const schedules = page.getByRole("region", {
    name: "오늘 일정",
    exact: true,
  });
  await expect(tasks.getByRole("link", { name: /^QA 오늘 작업 / })).toHaveCount(
    4,
  );
  await expect(
    schedules.getByRole("link", { name: /^QA 오늘 일정 / }),
  ).toHaveCount(4);
  await expect(tasks.getByText("2개 더 있어요", { exact: true })).toBeVisible();
  await expect(
    schedules.getByText("2개 더 있어요", { exact: true }),
  ).toBeVisible();
  await expect(
    tasks.getByRole("link", { name: "전체 할 일 보기", exact: true }),
  ).toBeVisible();
  await expect(
    schedules.getByRole("link", { name: "캘린더에서 보기", exact: true }),
  ).toBeVisible();
  const taskBounds = await tasks.boundingBox();
  const scheduleBounds = await schedules.boundingBox();
  expect(taskBounds).not.toBeNull();
  expect(scheduleBounds).not.toBeNull();
  expect(
    Math.abs(taskBounds!.height - scheduleBounds!.height),
  ).toBeLessThanOrEqual(1);
});

test("home panels and reschedule controls fit mobile, tablet and desktop", async ({
  page,
}, testInfo) => {
  await setup(page);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const panels = page.getByTestId("home-today-panels");
    const columns = await panels.evaluate(
      (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length,
    );
    expect(columns).toBe(width >= 1024 ? 2 : 1);
    if (width >= 1024) {
      const scheduleBounds = await page
        .getByRole("region", { name: "오늘 일정", exact: true })
        .boundingBox();
      const taskBounds = await page
        .getByRole("region", { name: "오늘 할 일", exact: true })
        .boundingBox();
      expect(scheduleBounds).not.toBeNull();
      expect(taskBounds).not.toBeNull();
      expect(
        Math.abs(scheduleBounds!.height - taskBounds!.height),
      ).toBeLessThanOrEqual(1);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const chatBounds = await page
      .getByRole("button", { name: "AI 채팅 열기", exact: true })
      .boundingBox();
    expect(chatBounds).not.toBeNull();
    const overdueActions = page
      .getByRole("region", { name: "밀린 작업", exact: true })
      .getByRole("button", { name: /^(재계획|한 번에 재계획)$/ });
    for (const action of await overdueActions.all()) {
      const actionBounds = await action.boundingBox();
      expect(actionBounds).not.toBeNull();
      expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(
        chatBounds!.x - 8,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath(`home-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("region", { name: "밀린 작업", exact: true })
    .getByRole("button", { name: "재계획", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "계획 날짜", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "작업 재계획", exact: true });
  await expect(dialog).toBeVisible();
  for (const locator of [dialog, page.locator(".schedule-date-popover")]) {
    const bounds = await locator.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("home-plan-mobile.png"),
    fullPage: true,
  });
});
