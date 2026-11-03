import { expect, test, type Page } from "@playwright/test";
import type { CompanyMembership, CompanyScheduleApproval } from "../../src/types";
import { installMockApi, QA_NOW, QA_USER, seedAuth } from "./fixtures";

for (const bulk of [false, true]) {
  test(`lost schedule creation response requires a selected recovery schedule (${bulk ? "bulk" : "single"})`, async ({ page }) => {
    await page.clock.setFixedTime(new Date(QA_NOW));
    const api = await installMockApi(page);
    api.state.tasks[0].due_datetime = "2026-09-07T18:00:00+09:00";
    api.state.tasks[0].schedule_id = null;
    const deadline = api.state.tasks[0].due_datetime;
    await seedAuth(page);
    let creates = 0;
    await page.route("**/api/v1/schedules*", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      creates += 1;
      const body = route.request().postDataJSON();
      api.state.schedules.push({
        schedule_id: 901, user_id: 9001, title: body.title, schedule_type: "personal",
        priority: "medium", is_completed: false, start_datetime: body.start_datetime,
        end_datetime: body.end_datetime, all_day: false, visibility: "private", created_at: QA_NOW,
      });
      await route.fulfill({
        status: 500, contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ success: false, message: "일정 생성 응답 유실 테스트" }),
      });
    });
    await page.goto("/");
    const overdue = page.getByRole("region", { name: "밀린 작업", exact: true });
    if (bulk) {
      await overdue.getByRole("button", { name: "한 번에 재계획", exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: "다음", exact: true }).click();
    } else {
      await overdue.getByRole("button", { name: "재계획", exact: true }).first().click();
    }
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
    await expect(dialog.getByText("일정 생성 결과를 확인해 주세요.", { exact: false })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "이 일정에 연결", exact: true })).toBeVisible();
    expect(creates).toBe(1);
    expect(api.state.tasks[0].schedule_id).toBeNull();
    await dialog.getByRole("button", { name: "목록 다시 확인", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "이 일정에 연결", exact: true })).toBeEnabled();
    expect(creates).toBe(1);
    await dialog.getByRole("button", { name: "이 일정에 연결", exact: true }).click();
    if (bulk) {
      await expect(dialog.getByText("재계획 완료", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
    }
    await expect(dialog).toHaveCount(0);
    expect(creates).toBe(1);
    expect(api.state.tasks[0].schedule_id).toBe(901);
    expect(api.state.tasks[0].due_datetime).toBe(deadline);
    expect(api.state.schedules.filter((schedule) => schedule.title === api.state.tasks[0].title)).toHaveLength(1);
    expect(api.unhandled).toEqual([]);
  });
}

test("a validated schedule creation error allows an ordinary corrected retry", async ({ page }) => {
  await page.clock.setFixedTime(new Date(QA_NOW));
  const api = await installMockApi(page);
  api.state.tasks[0].due_datetime = "2026-09-07T18:00:00+09:00";
  await seedAuth(page);
  let creates = 0;
  await page.route("**/api/v1/schedules*", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    if (++creates !== 1) return route.fallback();
    await route.fulfill({
      status: 400, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ success: false, message: "시각을 확인해 주세요.", error: { code: "INVALID_SCHEDULE_RANGE" } }),
    });
  });
  await page.goto("/");
  await page.getByRole("region", { name: "밀린 작업", exact: true }).getByRole("button", { name: "재계획", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "이 일정에 연결", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "재계획하기", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "재계획하기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(creates).toBe(2);
});

test("company approval errors stay distinct from empty lists and recover independently", async ({ page }) => {
  const api = await installMockApi(page);
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  const company = { company_id: 71, name: "QA 회사", status: "active" };
  const department = { department_id: 271, name: "QA 개발부", status: "active" };
  const membership: CompanyMembership = {
    company_member_id: 171, company_id: 71, user_public_uid: QA_USER.public_uid,
    department_id: 271, email: QA_USER.email, name: QA_USER.name,
    role: "manager", status: "active", company, department,
  };
  const approval: CompanyScheduleApproval = {
    approval_id: 601, approval_type: "create_collaboration", status: "pending",
    title: "QA 재조회한 승인 요청", created_at: QA_NOW,
  };
  const failedRoles = new Set(["approver", "requested"]);
  const reads = { approver: 0, requested: 0 };
  const mutations: string[] = [];
  let approved = false;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const headers = { "access-control-allow-origin": "*" };
    if (path === "/company-schedule-approvals/601/approve" && request.method() === "POST") {
      mutations.push(path);
      expect(request.postDataJSON()).toEqual({});
      approved = true;
      return route.fulfill({ headers, json: { success: true, data: { approval: { ...approval, status: "approved" } } } });
    }
    if (request.method() !== "GET") return route.fallback();
    if (path === "/company-schedule-approvals") {
      const role = url.searchParams.get("role");
      if (role !== "approver" && role !== "requested") return route.fallback();
      reads[role]++;
      if (failedRoles.has(role)) {
        return route.fulfill({ status: 403, headers, json: {
          success: false, message: "QA 승인함 조회 권한이 없습니다.", error: { code: "FORBIDDEN" },
        } });
      }
      return route.fulfill({ headers, json: { success: true, data: {
        items: role === "approver" && !approved ? [approval] : [],
      } } });
    }
    const data = path === "/company-memberships" ? { items: [membership] }
      : path === "/company-schedules" ? { items: [], project_work_items: [] }
      : path === "/companies/71/departments" ? { items: [department] }
      : path === "/companies/71/org-chart" ? {
        company, departments: [{ ...department, members: [], children: [] }], unassigned_members: [],
      } : null;
    if (data === null) return route.fallback();
    return route.fulfill({ headers, json: { success: true, data } });
  });
  await page.goto("/schedules");
  await page.getByRole("button", { name: "회사 일정 승인함", exact: true }).click();
  const popover = page.getByRole("dialog").filter({ hasText: "협업 승인" });
  await expect(popover.getByRole("alert")).toHaveCount(2);
  await expect(popover.getByText("승인 대기 요청이 없습니다.", { exact: true })).toHaveCount(0);
  expect(reads.approver).toBeGreaterThan(0);
  expect(reads.requested).toBeGreaterThan(0);

  failedRoles.delete("approver");
  await popover.getByRole("alert").first().getByRole("button", { name: "재시도", exact: true }).click();
  await expect(popover.getByText("QA 재조회한 승인 요청", { exact: true })).toBeVisible();
  await expect(popover.getByRole("alert")).toHaveCount(1);
  await popover.getByRole("button", { name: "승인", exact: true }).click();
  await expect(popover.getByText("QA 재조회한 승인 요청", { exact: true })).toHaveCount(0);
  expect(mutations).toEqual(["/company-schedule-approvals/601/approve"]);

  await expect(popover.getByRole("alert")).toContainText("QA 승인함 조회 권한이 없습니다.");
  await expect(popover.getByRole("alert").getByRole("button", { name: "재시도", exact: true })).toBeEnabled();
  failedRoles.delete("requested");
  await popover.getByRole("alert").getByRole("button", { name: "재시도", exact: true }).click();
  await expect(popover.getByRole("alert")).toHaveCount(0);
  await expect(popover.getByText("승인 대기 요청이 없습니다.", { exact: true })).toHaveCount(2);
  expect(api.unhandled).toEqual([]);
});

async function openCalendarCreate(page: Page) {
  await page.goto("/schedules");
  if ((page.viewportSize()?.width ?? 1280) < 600) {
    await page.getByRole("button", { name: "보기 선택", exact: true }).click();
    await page.getByRole("menuitem", { name: "월 M", exact: true }).click();
    const day = page.locator("[data-flowra-schedule-page]").getByRole("button", { name: "9", exact: true }).first();
    await day.locator("..").getByRole("button", { name: "추가", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "일정 추가 사이드바 열기", exact: true }).click();
  }
  await expect(page.getByPlaceholder("일정 제목", { exact: true })).toBeVisible();
}

for (const kind of ["friends", "presets"] as const) {
  test(`share ${kind} errors show a retry instead of an empty collection`, async ({ page }) => {
    const api = await installMockApi(page);
    await page.clock.setFixedTime(new Date(QA_NOW));
    await seedAuth(page);
    let failed = true;
    let reads = 0;
    const path = kind === "friends" ? "/friends" : "/friend-presets";
    await page.route(`**/api/v1${path}`, async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      reads++;
      const headers = { "access-control-allow-origin": "*" };
      if (failed) return route.fulfill({ status: 403, headers, json: {
        success: false, message: "QA 공유 조회 권한이 없습니다.", error: { code: "FORBIDDEN" },
      } });
      const friend = { public_uid: "FLOWRA-QA-FRIEND", name: "QA 공유 친구" };
      const data = kind === "friends"
        ? { friends: [{ friendship_id: 41, status: "accepted", direction: "outgoing", friend, requested_at: QA_NOW }] }
        : { presets: [{ friend_preset_id: 51, name: "QA 공유팀", version: 1, members: [friend], created_at: QA_NOW, updated_at: QA_NOW }] };
      return route.fulfill({ headers, json: { success: true, data } });
    });
    await openCalendarCreate(page);
    await page.getByRole("radio", { name: "공개", exact: true }).click();
    const popover = page.locator("#schedule-share-target-popover");
    if (kind === "presets") await popover.getByRole("button", { name: "그룹 프리셋", exact: true }).click();
    await expect(popover.getByRole("alert")).toContainText("QA 공유 조회 권한이 없습니다.");
    await expect(popover.getByText(kind === "friends" ? "표시할 친구가 없습니다." : "표시할 그룹 프리셋이 없습니다.", { exact: true })).toHaveCount(0);
    if (kind === "friends") await expect(popover.getByRole("button", { name: /전체 친구/ })).toBeDisabled();
    // Link sharing remains available while an unrelated directory is unavailable.
    await expect(popover.getByRole("button", { name: "공유하기", exact: true })).toBeEnabled();
    failed = false;
    await popover.getByRole("alert").getByRole("button", { name: "재시도", exact: true }).click();
    await expect(popover.getByRole("alert")).toHaveCount(0);
    if (kind === "friends") {
      await expect(popover.getByText("QA 공유 친구", { exact: true })).toBeVisible();
      await popover.getByRole("button", { name: /전체 친구/ }).click();
    } else {
      await popover.getByRole("button", { name: /QA 공유팀/ }).click();
    }
    await popover.getByRole("button", { name: "공유하기", exact: true }).click();
    await expect(popover).toHaveCount(0);
    expect(reads).toBeGreaterThan(1);
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(0);
    expect(api.unhandled).toEqual([]);
  });
}

test("unavailable email attendee invitations are explicitly disabled", async ({ page }) => {
  const api = await installMockApi(page);
  await page.clock.setFixedTime(new Date(QA_NOW));
  await seedAuth(page);
  await openCalendarCreate(page);
  await page.getByRole("button", { name: "참석자 선택", exact: true }).click();
  await page.getByPlaceholder("이름 또는 이메일", { exact: true }).fill("invitee@example.invalid");
  await expect(page.getByRole("button", { name: "새 이메일 초대 (준비 중)", exact: true })).toBeDisabled();
  await expect(page.getByText("이메일 참석자 초대는 준비 중입니다. 친구와의 공유는 공개 범위에서 설정해 주세요.", { exact: true })).toBeVisible();
  expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(0);
  expect(api.unhandled).toEqual([]);
});
