import { expect, test, type Page } from "@playwright/test";
import type { CompanyMembership, CompanySchedule, ProjectCalendarItem } from "../../src/types";
import { installMockApi, QA_NOW, QA_USER, seedAuth } from "./fixtures";

async function installAllDayCalendarApi(page: Page) {
  const api = await installMockApi(page);
  const personal = api.state.schedules.find((schedule) => schedule.schedule_id === 203)!;
  api.state.schedules.push(
    { ...personal, schedule_id: 204, title: "QA 여러 날 개인 일정", all_day: false, start_datetime: "2026-09-09T15:00:00+09:00", end_datetime: "2026-09-11T11:00:00+09:00" },
    { ...personal, schedule_id: 205, title: "QA 오늘 종일 일정", start_datetime: "2026-09-09T00:00:00+09:00", end_datetime: "2026-09-09T23:59:00+09:00" },
    { ...personal, schedule_id: 206, title: "QA 다음 주 종일 일정", start_datetime: "2026-09-15T00:00:00+09:00", end_datetime: "2026-09-15T23:59:00+09:00" },
  );
  const company = { company_id: 71, name: "QA 회사", status: "active" };
  const department = { department_id: 271, name: "QA 개발부", status: "active" };
  const membership: CompanyMembership = {
    company_member_id: 171, company_id: 71, user_public_uid: QA_USER.public_uid,
    department_id: 271, email: QA_USER.email, name: QA_USER.name,
    role: "manager", status: "active", company, department,
  };
  const companySchedules: CompanySchedule[] = [
    { company_schedule_id: 501, company, title: "QA 회사 종일 일정", schedule_type: "meeting", all_day: true, start_datetime: "2026-09-09T00:00:00+09:00", end_datetime: "2026-09-10T23:59:00+09:00" },
    { company_schedule_id: 502, company, title: "QA 회사 시간 일정", schedule_type: "meeting", all_day: false, start_datetime: "2026-09-09T13:00:00+09:00", end_datetime: "2026-09-09T14:00:00+09:00" },
  ];
  const project: ProjectCalendarItem = {
    item_type: "project_work_item", id: 601, assignment_id: 701, company_project_id: 901,
    project_name: "QA 프로젝트", title: "QA 종일 업무", status: "todo", all_day: true,
    start_datetime: "2026-09-09T00:00:00+09:00", end_datetime: "2026-09-09T23:59:00+09:00",
  };
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, "");
    if (route.request().method() !== "GET") return route.fallback();
    const data = path === "/company-memberships" ? { items: [membership] }
      : path === "/company-schedules" ? { items: companySchedules, project_work_items: [project] }
      : path === "/companies/71/departments" ? { items: [department] }
      : path === "/companies/71/org-chart" ? { company, departments: [{ ...department, members: [], children: [] }], unassigned_members: [] }
      : path === "/company-schedule-approvals" ? { items: [] }
      : null;
    if (data === null) return route.fallback();
    await route.fulfill({ json: { success: true, message: "OK", data } });
  });
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  return { ...api, companySchedules };
}

test("all-day disclosure summarizes personal and company schedules and restores calendar actions", async ({ page }, testInfo) => {
  const api = await installAllDayCalendarApi(page);
  await page.goto("/schedules");
  const row = page.locator("[data-flowra-all-day-row]");
  const collapse = row.getByRole("button", { name: "종일 일정 접기", exact: true });
  const personalBar = row.getByRole("button", { name: "Move QA 하루 일정", exact: true });
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(personalBar).toBeVisible();
  const expandedHeight = (await row.boundingBox())!.height;

  await collapse.focus();
  await collapse.press("Enter");
  await expect(row).toHaveAttribute("data-collapsed", "true");
  await expect(row.getByRole("button", { name: "종일 일정 펼치기", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(personalBar).toBeHidden();
  await expect(row.getByRole("button", { name: /종일 일정 추가/ })).toHaveCount(0);
  expect((await row.boundingBox())!.height).toBeLessThan(expandedHeight);
  for (const [day, personalCount, companyCount] of [[9, 2, 2], [10, 2, 1], [11, 1, 0]]) {
    const summary = row.getByRole("button", { name: `9월 ${day}일 종일 일정 펼치기`, exact: true });
    await expect(summary.getByText(`개인 +${personalCount}개`, { exact: true })).toBeVisible();
    await expect(summary.getByText(`회사 +${companyCount}개`, { exact: true })).toHaveCount(companyCount ? 1 : 0);
  }
  await expect(row.getByRole("button", { name: "9월 12일 종일 일정 펼치기", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("QA 디자인 검토 회의 schedule block", { exact: true })).toBeVisible();
  await expect(page.locator('input[name="flowra_schedule_title"]')).toHaveCount(0);
  await testInfo.attach("all-day-collapsed", { body: await page.screenshot(), contentType: "image/png" });

  const summary = row.getByRole("button", { name: "9월 10일 종일 일정 펼치기", exact: true });
  await summary.focus();
  await summary.press("Space");
  await expect(row).toHaveAttribute("data-collapsed", "false");
  await expect(collapse).toBeFocused();
  await expect(personalBar).toBeVisible();
  await expect(page.locator('input[name="flowra_schedule_title"]')).toHaveCount(0);
  await personalBar.focus();
  await personalBar.press("Enter");
  await expect(page.locator('input[name="flowra_schedule_title"]')).toHaveValue("QA 하루 일정");
  await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "닫기", exact: true }).click();
  await row.getByRole("button", { name: "9월 12일 종일 일정 추가", exact: true }).click();
  await expect(page.locator('input[name="flowra_schedule_title"]')).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "종일", exact: true })).toBeChecked();
  await expect(page.getByLabel("시작 날짜", { exact: true })).toHaveValue("09.12(토)");
  await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "닫기", exact: true }).click();
  expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  expect(api.unhandled).toEqual([]);
});

test("collapsed all-day summaries follow owner filters in week and day views (dark)", async ({ page }) => {
  const api = await installAllDayCalendarApi(page);
  await page.addInitScript(() => localStorage.setItem(
    "flowra:user-settings", JSON.stringify({ theme: "dark", defaultCalendarView: "week" }),
  ));
  await page.goto("/schedules");
  const row = page.locator("[data-flowra-all-day-row]");
  await row.getByRole("button", { name: "종일 일정 접기", exact: true }).click();
  const today = row.getByRole("button", { name: "9월 9일 종일 일정 펼치기", exact: true });
  await expect(today.getByText("회사 +2개", { exact: true })).toBeVisible();

  for (const [owner, shown, hidden] of [["개인", "개인 +2개", "회사 +2개"], ["회사", "회사 +2개", "개인 +2개"]]) {
    await page.getByRole("button", { name: "일정 보기 선택", exact: true }).click();
    await page.getByRole("menuitem", { name: new RegExp(`^${owner} 일정`) }).click();
    await expect(row).toHaveAttribute("data-collapsed", "true");
    await expect(today.getByText(shown, { exact: true })).toBeVisible();
    await expect(today.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  await expect(row.getByRole("button", { name: "9월 11일 종일 일정 펼치기", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "보기 선택", exact: true }).click();
  await page.getByRole("menuitem", { name: "일 D", exact: true }).click();
  await expect(row).toHaveAttribute("data-collapsed", "true");
  await expect(row.getByRole("button", { name: /\d+월 \d+일 종일 일정 펼치기/ })).toHaveCount(1);
  await expect(today.getByText("회사 +2개", { exact: true })).toBeVisible();
  await today.click();
  await expect(row.getByRole("button", { name: "Move QA 회사 종일 일정", exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: /종일 일정 추가/ })).toHaveCount(1);
  expect(api.unhandled).toEqual([]);
});

for (const dark of [false, true]) {
  test(`mini calendar follows schedule creation and date navigation (${dark ? "dark" : "light"})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    const api = await installMockApi(page);
    await page.clock.setFixedTime(new Date(QA_NOW));
    await seedAuth(page);
    if (dark) {
      await page.addInitScript(() => localStorage.setItem(
        "flowra:user-settings", JSON.stringify({ theme: "dark", defaultCalendarView: "week" }),
      ));
    }
    await page.goto("/schedules");
    const mini = page.locator("[data-flowra-schedule-sidebar]");
    const calendar = page.locator("[data-flowra-schedule-page]");
    const selected = mini.getByRole("button", { pressed: true });
    const today = mini.locator('[aria-current="date"]');
    await expect(selected).toHaveText("9");

    await page.getByRole("button", { name: "9월 10일 종일 일정 추가", exact: true }).click();
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toBeVisible();
    await expect(selected).toHaveText("10");
    await expect(selected).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect.poll(() => selected.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe("none");
    await expect(today).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(today).toHaveAttribute("aria-pressed", "false");
    await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "닫기", exact: true }).click();

    await page.getByRole("button", { name: "보기 선택", exact: true }).click();
    await page.getByRole("menuitem", { name: "월 M", exact: true }).click();
    const day = calendar.getByRole("button", { name: "15", exact: true }).first();
    await day.locator("..").getByRole("button", { name: "추가", exact: true }).click();
    await expect(selected).toHaveText("15");
    await expect(page.getByLabel("시작 날짜", { exact: true })).toHaveValue("09.15(화)");
    await expect(page.getByRole("button", { name: "보기 선택", exact: true })).toHaveText("월");
    await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "닫기", exact: true }).click();

    await calendar.getByRole("button", { name: "16", exact: true }).first().click();
    await expect(selected).toHaveText("16");
    await expect(page.getByRole("button", { name: "보기 선택", exact: true })).toHaveText("일");

    await mini.getByRole("button", { name: "Next month", exact: true }).click();
    await mini.getByRole("button").filter({ hasText: /^12$/ }).click();
    await expect(selected).toHaveText("12");
    await expect(mini.getByText("2026년 10월", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "10월 12일 종일 일정 추가", exact: true })).toBeVisible();
    expect(api.unhandled).toEqual([]);
  });
}

test.describe("schedule creation classification", () => {
  let api: Awaited<ReturnType<typeof installMockApi>>;

  const editor = (page: Page) => page.locator("[data-flowra-schedule-editor]");
  const submit = (page: Page, name: "추가" | "저장") => page
    .locator("[data-flowra-schedule-editor-footer]")
    .getByRole("button", { name, exact: true });
  const scheduleRequest = (page: Page, method: "POST" | "PATCH") => page.waitForRequest((request) =>
    request.method() === method && /^\/api\/v1\/schedules(?:\/\d+)?$/.test(new URL(request.url()).pathname),
  );

  async function choose(page: Page, field: string, option: string) {
    await editor(page).getByRole("button", { name: field, exact: true }).click();
    await page.getByRole("listbox", { name: field, exact: true })
      .getByRole("option", { name: option, exact: true }).click();
    await expect(editor(page).getByRole("button", { name: field, exact: true })).toHaveText(option);
  }

  test.beforeEach(async ({ page }) => {
    api = await installMockApi(page);
    await page.clock.setFixedTime(new Date(QA_NOW));
    await seedAuth(page);
    await page.goto("/schedules");
    await page.getByRole("button", { name: "9월 9일 종일 일정 추가", exact: true }).click();
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toBeVisible();
  });

  test("unselected classifications stay empty after previewing options and are omitted on creation", async ({ page }) => {
    await page.getByPlaceholder("일정 제목", { exact: true }).fill("QA 자동 분류 요청");
    for (const [field, option] of [["유형", "업무"], ["중요도", "높음"], ["카테고리", "회의"]]) {
      const trigger = editor(page).getByRole("button", { name: field, exact: true });
      await expect(trigger).toHaveText(field);
      await trigger.click();
      const menu = page.getByRole("listbox", { name: field, exact: true });
      await menu.getByRole("option", { name: option, exact: true }).hover();
      await menu.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toHaveText(field);
    }
    const request = scheduleRequest(page, "POST");
    await submit(page, "추가").click();
    const body = (await request).postDataJSON();
    expect(body.title).toBe("QA 자동 분류 요청");
    for (const field of ["schedule_type", "priority", "category_id"]) {
      expect(body).not.toHaveProperty(field);
    }
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
  });

  test("explicit personal and medium choices are sent together with the selected category", async ({ page }) => {
    await page.getByPlaceholder("일정 제목", { exact: true }).fill("QA 직접 선택한 분류");
    await choose(page, "유형", "개인");
    await choose(page, "중요도", "보통");
    await choose(page, "카테고리", "회의");
    const request = scheduleRequest(page, "POST");
    await submit(page, "추가").click();
    expect((await request).postDataJSON()).toMatchObject({
      title: "QA 직접 선택한 분류", schedule_type: "personal", priority: "medium", category_id: "21",
    });
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveCount(0);
    expect(api.unhandled).toEqual([]);
  });

  test("partial choices omit other fields and returned classifications survive a title-only edit", async ({ page }) => {
    const title = "QA 일부 선택한 일정";
    const created = {
      ...api.state.schedules[0], schedule_id: 204, title,
      all_day: true, start_datetime: "2026-09-09T00:00:00+09:00", end_datetime: "2026-09-09T23:59:00+09:00",
      schedule_type: "meeting" as const, priority: "high" as const, category_id: 21,
    };
    // Supply a classified server response without simulating AI inference in the fixture.
    await page.route("**/api/v1/schedules", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      api.state.schedules.push(created);
      await route.fulfill({
        status: 201, headers: { "access-control-allow-origin": "*" },
        json: { success: true, message: "OK", data: { schedule: created } },
      });
    });
    await page.getByPlaceholder("일정 제목", { exact: true }).fill(title);
    await choose(page, "카테고리", "회의");
    const createRequest = scheduleRequest(page, "POST");
    await submit(page, "추가").click();
    const body = (await createRequest).postDataJSON();
    expect(body.category_id).toBe("21");
    expect(body).not.toHaveProperty("schedule_type");
    expect(body).not.toHaveProperty("priority");
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: `Move ${title}`, exact: true }).click();
    await expect(editor(page).getByRole("button", { name: "유형", exact: true })).toHaveText("업무");
    await expect(editor(page).getByRole("button", { name: "중요도", exact: true })).toHaveText("높음");
    await expect(editor(page).getByRole("button", { name: "카테고리", exact: true })).toHaveText("회의");
    await page.getByPlaceholder("일정 제목", { exact: true }).fill(`${title} 제목 수정`);
    const updateRequest = scheduleRequest(page, "PATCH");
    await submit(page, "저장").click();
    expect((await updateRequest).postDataJSON()).toMatchObject({
      title: `${title} 제목 수정`, schedule_type: "meeting", priority: "high", category_id: "21",
    });
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveCount(0);
    expect(api.state.schedules.find((schedule) => schedule.schedule_id === 204)).toMatchObject({
      title: `${title} 제목 수정`, schedule_type: "meeting", priority: "high", category_id: 21,
    });
    expect(api.unhandled).toEqual([]);
  });
});

test.describe("calendar QA fixes", () => {
  const editor = (page: Page) => page.locator("[data-flowra-schedule-editor]");
  const footer = (page: Page) => page.locator("[data-flowra-schedule-editor-footer]");

  for (const owner of ["personal", "company"] as const) {
    test(`calendar QA fixes: ${owner} double click creates one schedule while the first request is pending`, async ({ page }) => {
      const api = await installAllDayCalendarApi(page);
      const title = `QA 중복 방지 ${owner}`;
      const endpoint = owner === "personal" ? "/schedules" : "/company-schedules";
      const bodies: Record<string, unknown>[] = [];
      let release!: () => void;
      const pending = new Promise<void>((resolve) => { release = resolve; });
      await page.route(`**/api/v1${endpoint}`, async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        const body = route.request().postDataJSON() as Record<string, unknown>;
        bodies.push(body);
        await pending;
        const data = owner === "personal"
          ? { schedule: { ...api.state.schedules[0], schedule_id: 1800 + bodies.length, title,
              all_day: true, start_datetime: "2026-09-09T00:00:00+09:00", end_datetime: "2026-09-09T23:59:00+09:00" } }
          : { company_schedule: { ...api.companySchedules[0], company_schedule_id: 1800 + bodies.length, title,
              all_day: true, start_datetime: "2026-09-09T00:00:00+09:00", end_datetime: "2026-09-09T23:59:00+09:00" } };
        if (data.schedule) api.state.schedules.push(data.schedule);
        else api.companySchedules.push(data.company_schedule);
        await route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, json: { success: true, message: "OK", data } });
      });
      await page.goto("/schedules");
      await page.getByRole("button", { name: "9월 9일 종일 일정 추가", exact: true }).click();
      if (owner === "company") {
        await page.locator("[data-flowra-schedule-editor-header]").getByRole("button", { name: "일정 종류", exact: true }).click();
        await page.getByRole("listbox", { name: "일정 종류", exact: true })
          .getByRole("option", { name: "회사 일정", exact: true }).click();
      }
      await page.getByPlaceholder("일정 제목", { exact: true }).fill(title);
      try {
        await footer(page).getByRole("button", { name: "추가", exact: true }).dblclick();
        await expect(footer(page).getByRole("button", { name: "저장 중...", exact: true })).toBeDisabled();
        await expect.poll(() => bodies.length).toBe(1);
        // Keep the response held beyond both browser click events and their request delivery.
        await page.waitForTimeout(150);
        expect(bodies).toHaveLength(1);
        expect(bodies[0]).toMatchObject({ title });
      } finally {
        release();
      }
      await expect(editor(page)).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("button", { name: `Move ${title}`, exact: true })).toHaveCount(1);
      expect((owner === "personal" ? api.state.schedules : api.companySchedules)
        .filter((schedule) => schedule.title === title)).toHaveLength(1);
      expect(bodies).toHaveLength(1);
      expect(api.unhandled).toEqual([]);
    });
  }

  test("calendar QA fixes: validation and failed saves release the submit lock for a successful retry", async ({ page }) => {
    const api = await installAllDayCalendarApi(page);
    let attempts = 0;
    await page.route("**/api/v1/company-schedules", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      attempts += 1;
      if (attempts === 1) {
        return route.fulfill({ status: 500, headers: { "access-control-allow-origin": "*" }, json: { success: false, message: "QA 저장 재시도 오류", data: null } });
      }
      const companySchedule: CompanySchedule = {
        ...api.companySchedules[0], company_schedule_id: 1801, title: "QA 재시도 후 저장",
        start_datetime: "2026-09-09T00:00:00+09:00", end_datetime: "2026-09-09T23:59:00+09:00",
      };
      api.companySchedules.push(companySchedule);
      await route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, json: {
        success: true, message: "OK", data: { company_schedule: companySchedule },
      } });
    });
    await page.goto("/schedules");
    await page.getByRole("button", { name: "9월 9일 종일 일정 추가", exact: true }).click();
    await page.locator("[data-flowra-schedule-editor-header]").getByRole("button", { name: "일정 종류", exact: true }).click();
    await page.getByRole("listbox", { name: "일정 종류", exact: true })
      .getByRole("option", { name: "회사 일정", exact: true }).click();
    await page.getByPlaceholder("일정 제목", { exact: true }).fill("QA 재시도 후 저장");
    const end = page.getByLabel("종료 날짜", { exact: true });
    await end.fill("2026-09-08");
    await end.press("Tab");
    await footer(page).getByRole("button", { name: "추가", exact: true }).click();
    await expect(editor(page).getByText("종료 시간은 시작 시간보다 늦어야 합니다.", { exact: true })).toBeVisible();
    expect(attempts).toBe(0);
    await end.fill("2026-09-09");
    await end.press("Tab");
    await footer(page).getByRole("button", { name: "추가", exact: true }).click();
    await expect(editor(page).getByText("QA 저장 재시도 오류", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveValue("QA 재시도 후 저장");
    await expect(footer(page).getByRole("button", { name: "추가", exact: true })).toBeEnabled();
    expect(attempts).toBe(1);
    await footer(page).getByRole("button", { name: "추가", exact: true }).click();
    await expect(editor(page)).toHaveCount(0);
    expect(attempts).toBe(2);
    expect(api.companySchedules.filter((schedule) => schedule.title === "QA 재시도 후 저장")).toHaveLength(1);
    expect(api.unhandled).toEqual([]);
  });

  test("calendar QA fixes: the stored default view and changes in settings survive calendar entry and reload", async ({ page }) => {
    const api = await installMockApi(page);
    await page.clock.setFixedTime(new Date(QA_NOW));
    await seedAuth(page);
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("qa-calendar-month-seeded")) {
        localStorage.setItem("flowra:user-settings", JSON.stringify({ defaultCalendarView: "month" }));
        sessionStorage.setItem("qa-calendar-month-seeded", "1");
      }
    });
    const view = page.getByRole("button", { name: "보기 선택", exact: true });
    await page.goto("/schedules");
    await expect(view).toHaveText("월");
    await page.reload();
    await expect(view).toHaveText("월");
    await page.goto("/settings");
    await page.getByRole("main").getByRole("button", { name: "주간", exact: true }).click();
    await page.goto("/schedules");
    await expect(view).toHaveText("주");
    await page.reload();
    await expect(view).toHaveText("주");
    expect(api.unhandled).toEqual([]);
  });

  for (const viewName of ["month", "week"] as const) {
    test(`calendar QA fixes: ${viewName} calendar reflects today weekend and count display switches`, async ({ page }, testInfo) => {
      const api = await installMockApi(page);
      await page.clock.setFixedTime(new Date(QA_NOW));
      await seedAuth(page);
      const calendar = page.locator("[data-flowra-schedule-page]");
      const today = calendar.locator('[data-flowra-calendar-date="2026-09-09"]');
      const weekend = calendar.locator('[data-flowra-calendar-date="2026-09-12"]');
      const count = calendar.locator('[data-flowra-schedule-count="2026-09-09"]');
      const todayNumber = viewName === "month" ? today.getByRole("button", { name: "9", exact: true }) : today.locator(":scope > span").nth(1);
      const labels = ["주말 강조", "오늘 강조", "일정 개수 뱃지"];
      const showCalendar = async () => {
        // Select a different day so a selection highlight cannot hide today's setting.
        await page.goto("/schedules?date=2026-09-10");
        await page.getByRole("button", { name: "보기 선택", exact: true }).click();
        await page.getByRole("menuitem", { name: viewName === "month" ? "월 M" : "주 W", exact: true }).click();
        await page.mouse.move(0, 0);
      };
      const setDisplay = async (enabled: boolean) => {
        await page.goto("/settings");
        const settings = page.getByRole("main");
        await settings.getByRole("button", { name: "화면 표시", exact: true }).click();
        for (const label of labels) {
          const toggle = settings.getByRole("switch", { name: label, exact: true });
          await toggle.setChecked(enabled);
          await expect(toggle).toBeChecked({ checked: enabled });
        }
      };
      await showCalendar();
      await expect(today).toHaveAttribute("data-flowra-calendar-today", "true");
      await expect(count).toHaveText("2");
      await expect(count).toBeVisible();
      const todayColor = await todayNumber.evaluate((el) => getComputedStyle(el).backgroundColor);
      const weekendColor = await weekend.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(todayColor).not.toBe("rgba(0, 0, 0, 0)");
      await setDisplay(false);
      await showCalendar();
      await expect(today).not.toHaveAttribute("data-flowra-calendar-today");
      await expect(count).toHaveCount(0);
      await expect(todayNumber).not.toHaveCSS("background-color", todayColor);
      await expect(weekend).not.toHaveCSS("background-color", weekendColor);
      await testInfo.attach(`${viewName}-display-disabled`, { body: await page.screenshot(), contentType: "image/png" });
      await setDisplay(true);
      await showCalendar();
      await expect(today).toHaveAttribute("data-flowra-calendar-today", "true");
      await expect(todayNumber).toHaveCSS("background-color", todayColor);
      await expect(weekend).toHaveCSS("background-color", weekendColor);
      await expect(count).toHaveText("2");
      await expect(count).toBeVisible();
      expect(api.unhandled).toEqual([]);
    });
  }
});
