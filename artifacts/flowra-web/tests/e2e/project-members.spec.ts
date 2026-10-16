import { expect, test, type Locator, type Page } from "@playwright/test";
import type {
  CompanyMembership,
  CompanyProject,
  CompanyProjectAssignment,
  CompanyProjectMember,
  CompanyProjectMemberRole,
  CompanyProjectWorkItem,
} from "../../src/types";
import { installMockApi, QA_NOW, QA_USER, seedAuth } from "./fixtures";

type Request = { method: string; path: string; body: Record<string, unknown> };
type Failure = { status: number; code: string; message: string };
const pendingGates = new Set<() => void>();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  const release = () => { pendingGates.delete(release); resolve(); };
  pendingGates.add(release);
  return { promise, release };
}

async function installMembersApi(page: Page, options: {
  role?: CompanyProjectMemberRole;
  companyRole?: "owner" | "member";
  masked?: boolean;
  large?: boolean;
  lazy?: boolean;
  departmentName?: string;
} = {}) {
  const base = await installMockApi(page);
  await seedAuth(page);
  await page.clock.setFixedTime(new Date(QA_NOW));
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const membership = (companyId: number): CompanyMembership => ({
    company_member_id: companyId === 71 ? 171 : 271,
    company_id: companyId,
    department_id: companyId === 71 ? 371 : 471,
    user_public_uid: QA_USER.public_uid,
    name: QA_USER.name,
    email: QA_USER.email,
    role: options.companyRole ?? "member",
    status: "active",
    company: { company_id: companyId, name: `QA 회사 ${companyId}`, status: "active" },
    department: { department_id: companyId === 71 ? 371 : 471, name: "QA 개발부", status: "active" },
  });
  const directoryMember = (id: number, name: string, departmentId = 371) => ({
    company_member_id: id, name, email: `${id}@example.invalid`,
    user_public_uid: id === 171 ? QA_USER.public_uid : `QA-USER-${id}`,
    department_id: departmentId, status: "active",
  });
  const projects: CompanyProject[] = [71, 72].map((companyId, index) => ({
    company_project_id: 901 + index, company_id: companyId,
    origin_department_id: companyId === 71 ? 371 : 471,
    name: `QA 구성원 프로젝트 ${companyId}`, status: "active", phase_mode: "phase_less",
    visibility: "members", created_at: QA_NOW,
  }));
  const work = (id: number, title: string): CompanyProjectWorkItem => ({
    company_project_work_item_id: id, company_project_id: 901,
    company_project_phase_id: null, parent_work_item_id: null, depth_level: 1,
    title, status: "in_progress", priority: "medium", progress_percent: 37,
    progress_override_percent: null, sort_order: id,
  });
  const state = {
    projects,
    workItems: [work(501, "QA 담당자 업무"), work(502, "QA 다른 업무")],
    directory: [directoryMember(171, QA_USER.name), directoryMember(172, "QA 김개발"),
      directoryMember(173, "QA 이복귀"), directoryMember(174, "QA 박디자인", 372), directoryMember(175, "QA 홍검토"),
      ...(options.large ? Array.from({ length: 205 }, (_, index) => directoryMember(1000 + index, `QA 직원 ${index}`, 372)) : [])],
    members: new Map<number, CompanyProjectMember[]>([
      [901, [
        { company_project_member_id: 1901, company_member_id: 171, role: options.role ?? "owner", status: "active" },
        { company_project_member_id: 1902, company_member_id: 172, role: "member", status: "active" },
        { company_project_member_id: 1903, company_member_id: 173, role: "viewer", status: "inactive" },
        { company_project_member_id: 1905, company_member_id: 175, role: "member", status: "active" },
      ]],
      [902, [{ company_project_member_id: 2901, company_member_id: 271, role: "owner", status: "active" }]],
    ]),
    assignments: [{ company_project_work_assignment_id: 701, company_project_work_item_id: 501,
      assignee_company_member_id: options.masked ? 0 : 172, role: "assignee", status: "in_progress", progress_percent: 37,
    }] as CompanyProjectAssignment[],
    requests: [] as Request[],
    failures: new Map<string, Failure>(),
    gates: new Map<string, Promise<void>>(),
  };
  if (options.lazy) {
    state.workItems[0].rollup = { child_count: 1 };
    state.workItems.push({ ...work(511, "QA 지연 조회 업무"), parent_work_item_id: 501, depth_level: 2,
      description: "상세 스크롤 보존을 확인합니다.\n".repeat(100) });
    state.assignments[0].company_project_work_item_id = 511;
  }
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = request.method();
    if (method === "OPTIONS") return route.fallback();
    if (!path.startsWith("/company-projects") && path !== "/company-memberships" &&
      path !== "/company-schedules" && !/^\/companies\/\d+\/org-chart$/.test(path)) return route.fallback();
    const body: Record<string, unknown> = request.postDataJSON() ?? {};
    state.requests.push({ method, path, body });
    const key = `${method} ${path}`;
    if (state.gates.has(key)) await state.gates.get(key);
    const failure = state.failures.get(key);
    if (failure) return route.fulfill({ status: failure.status,
      json: { success: false, message: failure.message, error: { code: failure.code } } });
    const reply = (data: unknown, status = 200) => route.fulfill({ status, json: { success: true, message: "OK", data } });
    if (path === "/company-memberships" && method === "GET") return reply({ items: [membership(71), membership(72)] });
    if (path === "/company-schedules" && method === "GET") return reply({ items: [] });
    if (["/company-projects/my-work-items", "/company-projects/my-calendar-items"].includes(path) && method === "GET")
      return reply({ items: [] });
    const chart = path.match(/^\/companies\/(\d+)\/org-chart$/);
    if (chart && method === "GET") {
      const companyId = Number(chart[1]);
      return reply({ company: { company_id: companyId, name: `QA 회사 ${companyId}` },
        departments: companyId === 71 ? [
          { department_id: 371, company_id: 71, name: options.departmentName ?? "QA 개발부", status: "active", members: state.directory.filter((member) => member.department_id === 371), children: [] },
          { department_id: 372, company_id: 71, name: "QA 디자인부", status: "active", members: state.directory.filter((member) => member.department_id === 372), children: [] },
        ] : [{ department_id: 471, company_id: 72, name: "QA 다른 회사 부서", status: "active", members: [directoryMember(271, "QA 다른 회사 직원", 471)], children: [] }],
        unassigned_members: [] });
    }
    const project = path.match(/^\/company-projects\/(\d+)$/);
    if (project && method === "GET") {
      const id = Number(project[1]);
      const workItems = id === 901 ? state.workItems.filter((item) => !options.lazy || !item.parent_work_item_id) : [];
      return reply({ project: state.projects.find((item) => item.company_project_id === id), phases: [], work_items: workItems,
        departments: [], assignments: id === 901 ? state.assignments.filter((assignment) => workItems.some((item) => item.company_project_work_item_id === assignment.company_project_work_item_id)) : [], dependencies: [],
        summary: { phase_count: 0, work_item_count: id === 901 ? state.workItems.length : 0, assignment_count: id === 901 ? state.assignments.length : 0 },
        detail_policy: options.lazy ? undefined : { scale: "small", mode: "full", max_depth: 5, full_load_allowed: true, returned_work_item_count: workItems.length } });
    }
    const children = path.match(/^\/company-projects\/901\/work-items\/(\d+)\/children$/);
    if (children && method === "GET") {
      const id = Number(children[1]);
      const items = state.workItems.filter((item) => item.parent_work_item_id === id);
      return reply({ parent: state.workItems.find((item) => item.company_project_work_item_id === id), items,
        assignments: state.assignments.filter((assignment) => [id, ...items.map((item) => item.company_project_work_item_id)].includes(assignment.company_project_work_item_id!)),
        departments: [], dependencies: [] });
    }
    const members = path.match(/^\/company-projects\/(\d+)\/members(?:\/(\d+))?$/);
    if (members) {
      const items = state.members.get(Number(members[1]))!;
      if (method === "GET" && !members[2]) return reply({ members: items });
      if (method === "POST" && !members[2]) {
        const member: CompanyProjectMember = { company_project_member_id: 2000 + items.length,
          company_member_id: Number(body.company_member_id), role: String(body.role ?? "member"), status: "active" };
        items.push(member);
        return reply({ member }, 201);
      }
      const member = items.find((item) => item.company_project_member_id === Number(members[2]));
      if (member && method === "PATCH") { Object.assign(member, body); return reply({ member }); }
      if (member && method === "DELETE") { member.status = "inactive"; return reply({ member }); }
    }
    const assignment = path.match(/^\/company-projects\/(\d+)\/work-items\/(\d+)\/assignments(?:\/(\d+))?$/);
    if (assignment && method === "POST" && !assignment[3]) {
      const item: CompanyProjectAssignment = { company_project_work_assignment_id: 800 + state.assignments.length,
        company_project_work_item_id: Number(assignment[2]), assignee_company_member_id: Number(body.assignee_company_member_id),
        role: "assignee", status: "todo", progress_percent: 0, ...body };
      state.assignments.push(item);
      return reply({ assignment: item }, 201);
    }
    if (assignment && method === "PATCH" && assignment[3]) {
      const item = state.assignments.find((entry) => entry.company_project_work_assignment_id === Number(assignment[3]));
      if (item) { Object.assign(item, body); return reply({ assignment: item }); }
    }
    return route.fallback();
  });
  return { ...state, base, pageErrors };
}

function memberDialog(page: Page) {
  return page.getByRole("dialog", { name: "프로젝트 구성원 관리", exact: true });
}
function workPanel(page: Page) {
  return page.getByRole("complementary", { name: "업무 상세", exact: true })
    .or(page.getByRole("dialog", { name: "업무 상세", exact: true }));
}
function row(page: Page, title: string) {
  return page.getByRole("treegrid", { name: "계층형 업무", exact: true })
    .getByRole("button", { name: new RegExp(`^(?:\\d+(?:\\.\\d+)*\\.? )?${title}$`) });
}
async function select(scope: Locator, label: string, name: string) {
  await scope.getByRole("button", { name: label, exact: true }).click();
  await scope.page().getByRole("listbox", { name: label, exact: true }).getByRole("option", { name, exact: true }).click();
}
async function openMembers(page: Page, company = false) {
  await page.getByRole("tab", { name: "업무 목록", exact: true }).click();
  await row(page, "QA 담당자 업무").click();
  const panel = workPanel(page);
  await panel.getByRole("button", { name: "담당자 추가", exact: true }).click();
  await panel.getByRole("button", { name: "프로젝트 구성원 관리에서 직원 추가", exact: true }).click();
  const dialog = memberDialog(page);
  await expect(dialog).toBeVisible();
  if (company) await dialog.getByRole("tab", { name: "회사 구성원", exact: true }).click();
  return dialog;
}
async function openMembersTab(page: Page, company = false) {
  const tab = page.getByRole("tab", { name: "구성원", exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel", { name: "구성원", exact: true });
  await expect(panel).toBeVisible();
  if (company) await panel.getByRole("tab", { name: "회사 구성원", exact: true }).click();
  return panel;
}

test.describe("프로젝트 구성원·담당자 · 기존 API 통합", () => {
  let api: Awaited<ReturnType<typeof installMembersApi>>;
  test.afterEach(async ({}, testInfo) => {
    for (const release of pendingGates) release();
    if (!api) return;
    await testInfo.attach("project-member-requests", { body: JSON.stringify(api.requests, null, 2), contentType: "application/json" });
    expect.soft(api.base.unhandled, "Only documented and explicitly mocked routes are used").toEqual([]);
    expect.soft(api.pageErrors).toEqual([]);
    expect.soft(api.requests.filter((request) => request.path.startsWith("/company-admin"))).toEqual([]);
    expect.soft(api.requests.filter((request) => request.method === "DELETE" && /assignments/.test(request.path))).toEqual([]);
  });

  test("구성원 탭에서 부서와 이름으로 직원을 찾아 즉시 추가하고 역할·참여 상태를 기존 API로 관리한다", async ({ page }) => {
    api = await installMembersApi(page);
    await page.goto("/projects/901?company_id=71");
    const panel = await openMembersTab(page, true);
    await expect(memberDialog(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "구성원 관리", exact: true })).toHaveCount(0);
    await select(panel, "부서 필터", "QA 디자인부");
    await panel.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true }).fill("박디자인");
    await expect(panel.getByRole("list", { name: "회사 구성원 목록", exact: true })).toContainText("QA 박디자인");
    await expect(panel.getByRole("list", { name: "회사 구성원 목록", exact: true })).not.toContainText("QA 김개발");
    await panel.getByRole("button", { name: "프로젝트에 추가", exact: true }).click();
    await select(panel, "추가할 프로젝트 역할", "관리자");
    await panel.getByRole("button", { name: "추가", exact: true }).click();
    await expect.poll(() => api.members.get(901)?.find((member) => member.company_member_id === 174)?.role).toBe("manager");
    await expect(panel.getByRole("button", { name: "프로젝트에 추가", exact: true })).toHaveCount(0);
    await panel.getByRole("tab", { name: "프로젝트 구성원", exact: true }).click();
    await select(panel, "QA 박디자인 프로젝트 역할", "조회자");
    await panel.getByRole("button", { name: "QA 박디자인 역할 변경 저장", exact: true }).click();
    await expect.poll(() => api.members.get(901)?.find((member) => member.company_member_id === 174)?.role).toBe("viewer");
    await panel.getByRole("button", { name: "QA 박디자인 프로젝트 참여 종료", exact: true }).click();
    await panel.getByRole("button", { name: "참여 종료 확인", exact: true }).click();
    await expect(panel.getByRole("button", { name: "QA 박디자인 다시 참여", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "QA 박디자인 다시 참여", exact: true }).click();
    await expect.poll(() => api.members.get(901)?.find((member) => member.company_member_id === 174)?.status).toBe("active");
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([
      { method: "POST", path: "/company-projects/901/members", body: { company_member_id: "174", role: "manager" } },
      { method: "PATCH", path: "/company-projects/901/members/2004", body: { role: "viewer" } },
      { method: "DELETE", path: "/company-projects/901/members/2004", body: {} },
      { method: "PATCH", path: "/company-projects/901/members/2004", body: { status: "active" } },
    ]);
    expect(api.assignments[0]).toMatchObject({ assignee_company_member_id: 172, status: "in_progress", progress_percent: 37 });
  });

  test("구성원 탭의 회사 owner·프로젝트 manager는 조회만 가능하고 담당자 편집에서도 구성원 변경 진입점을 제공하지 않는다", async ({ page }) => {
    api = await installMembersApi(page, { role: "manager", companyRole: "owner" });
    await page.goto("/projects/901");
    const panel = await openMembersTab(page);
    await expect(panel).toContainText("QA 김개발");
    await expect(panel.getByRole("button", { name: /프로젝트 참여 종료|역할 변경 저장|다시 참여/ })).toHaveCount(0);
    await panel.getByRole("tab", { name: "회사 구성원", exact: true }).click();
    await expect(panel).toContainText("QA 박디자인");
    await expect(panel.getByRole("button", { name: "프로젝트에 추가", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "회사 구성원에서 추가", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "업무 목록", exact: true }).click();
    await row(page, "QA 담당자 업무").click();
    await workPanel(page).getByRole("button", { name: "담당자 추가", exact: true }).click();
    await expect(workPanel(page).getByRole("button", { name: "프로젝트 구성원 관리에서 직원 추가", exact: true })).toHaveCount(0);
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("일반 구성원은 구성원 탭에서도 회사 직원 이름을 조회하거나 관리하지 못한다", async ({ page }) => {
    api = await installMembersApi(page, { role: "member", companyRole: "owner", masked: true });
    api.failures.set("GET /company-projects/901/members", { status: 403, code: "PROJECT_MANAGEMENT_FORBIDDEN", message: "프로젝트 관리 권한이 없습니다." });
    await page.goto("/projects/901");
    const panel = await openMembersTab(page);
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel).not.toContainText("QA 김개발");
    await expect(panel).not.toContainText("QA 박디자인");
    await expect(panel.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /프로젝트에 추가|프로젝트 참여 종료|역할 변경 저장/ })).toHaveCount(0);
    expect(api.requests.filter((request) => /org-chart/.test(request.path))).toEqual([]);
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("구성원 탭은 회사 조회 실패와 빈 검색·빈 목록을 구분하고 재시도 후 실제 직원만 표시한다", async ({ page }) => {
    api = await installMembersApi(page);
    api.failures.set("GET /companies/71/org-chart", { status: 403, code: "FORBIDDEN", message: "QA 구성원 탭 회사 조회 거절" });
    await page.goto("/projects/901");
    const panel = await openMembersTab(page, true);
    await expect(panel).toContainText("QA 구성원 탭 회사 조회 거절");
    await expect(panel).not.toContainText("표시할 구성원이 없습니다");
    await expect(panel).not.toContainText("QA 박디자인");
    api.failures.delete("GET /companies/71/org-chart");
    await panel.getByRole("button", { name: /다시 시도|재시도/ }).click();
    await expect(panel).toContainText("QA 박디자인");
    await panel.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true }).fill("QA 존재하지 않는 직원");
    await expect(panel.getByText("검색 결과가 없습니다", { exact: true })).toBeVisible();
    await panel.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true }).fill("");
    await expect(panel).toContainText("QA 김개발");
    api.directory.splice(0);
    await page.reload();
    const empty = await openMembersTab(page, true);
    await expect(empty.getByText("표시할 구성원이 없습니다", { exact: true })).toBeVisible();
    await expect(empty.getByRole("list", { name: "회사 구성원 목록", exact: true })).toHaveCount(0);
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("200명 이상 구성원 탭은 20명씩 탐색하고 모바일·다크 화면에서도 검색과 키보드 탭 전환을 지원한다", async ({ page }, testInfo) => {
    api = await installMembersApi(page, { large: true });
    api.members.get(901)!.push(...api.directory.filter((member) => member.company_member_id >= 1000).map((member) => ({
      company_project_member_id: 4000 + member.company_member_id,
      company_member_id: member.company_member_id,
      role: "member",
      status: "active",
    })));
    await page.goto("/projects/901");
    const panel = await openMembersTab(page);
    const list = panel.getByRole("list", { name: "프로젝트 구성원 목록", exact: true });
    await expect(list.getByRole("listitem")).toHaveCount(20);
    await expect(panel).toContainText("209명 중 1–20명");
    for (let index = 0; index < 10; index += 1)
      await panel.getByRole("button", { name: "구성원 다음 페이지", exact: true }).click();
    await expect(list.getByRole("listitem")).toHaveCount(9);
    await expect(panel).toContainText("QA 직원 204");
    await expect(panel.getByRole("button", { name: "구성원 다음 페이지", exact: true })).toBeDisabled();
    await panel.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true }).fill("직원 204");
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(panel).toContainText("1명 중 1–1명");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await expect(panel.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("members-tab-dark.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    const projectTab = panel.getByRole("tab", { name: "프로젝트 구성원", exact: true });
    await projectTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(panel.getByRole("tab", { name: "회사 구성원", exact: true })).toBeFocused();
    await expect(panel.getByRole("list", { name: "회사 구성원 목록", exact: true })).toContainText("QA 직원 204");
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("구성원 탭에서 시작한 추가가 늦게 끝나도 다른 프로젝트의 구성원과 포커스를 바꾸지 않는다", async ({ page }) => {
    api = await installMembersApi(page);
    const gate = deferred();
    api.gates.set("POST /company-projects/901/members", gate.promise);
    await page.goto("/projects/901?company_id=71");
    const panel = await openMembersTab(page, true);
    await panel.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true }).fill("박디자인");
    await panel.getByRole("button", { name: "프로젝트에 추가", exact: true }).click();
    await panel.getByRole("button", { name: "추가", exact: true }).click();
    await expect.poll(() => api.requests.filter((request) => request.method === "POST").length).toBe(1);
    await page.goto("/projects/902?company_id=72");
    const other = await openMembersTab(page, true);
    const search = other.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true });
    await search.fill("QA 다른 회사 직원");
    gate.release();
    await expect.poll(() => api.members.get(901)?.some((member) => member.company_member_id === 174)).toBe(true);
    await expect(other).toContainText("QA 다른 회사 직원");
    await expect(other).not.toContainText("QA 박디자인");
    await expect(search).toHaveValue("QA 다른 회사 직원");
    await expect(search).toBeFocused();
    expect(api.members.get(902)).toHaveLength(1);
    expect(api.requests.filter((request) => request.method === "POST")).toEqual([
      { method: "POST", path: "/company-projects/901/members", body: { company_member_id: "174", role: "member" } },
    ]);
  });

  test("상세 탭을 키보드로 전환해도 기존 업무 검색을 유지하고 간트 요청은 보내지 않는다", async ({ page }) => {
    api = await installMembersApi(page);
    await page.goto("/projects/901");
    const search = page.getByRole("textbox", { name: "업무 검색", exact: true });
    await search.fill("다른 업무");
    await expect(row(page, "QA 다른 업무")).toBeVisible();
    const workTab = page.getByRole("tab", { name: "업무 목록", exact: true });
    await workTab.focus();
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "구성원", exact: true })).toBeFocused();
    await expect(page.getByRole("tabpanel", { name: "구성원", exact: true })).toBeVisible();
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab", { name: "개요", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(workTab).toBeFocused();
    await expect(search).toHaveValue("다른 업무");
    await expect(row(page, "QA 다른 업무")).toBeVisible();
    await expect(page.getByRole("tab", { name: /간트/ })).toHaveCount(0);
    expect(api.requests.filter((request) => /gantt/.test(request.path))).toEqual([]);
  });

  test("구성원 탭의 역할·추가 UI는 320부터 1440px까지 밝은·어두운 화면에서 접근 가능하다", async ({ page }, testInfo) => {
    const longName = "QA 김개발 아주 긴 구성원 이름 표시와 말줄임 확인";
    const longDepartment = "QA 개발부 아주 긴 조직 부서 이름 및 서비스 운영 지원팀";
    api = await installMembersApi(page, { departmentName: longDepartment });
    api.directory.find((member) => member.company_member_id === 172)!.name = longName;
    await page.goto("/projects/901");
    const panel = await openMembersTab(page);
    let lightBackground = "";
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const dark of [false, true]) {
        await page.evaluate((enabled) => document.documentElement.classList.toggle("dark", enabled), dark);
        const role = panel.getByRole("button", { name: `${longName} 프로젝트 역할`, exact: true });
        await expect(role).toBeVisible();
        await expect(role).toContainText("구성원");
        expect(await role.getByText("구성원", { exact: true }).evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        await expect(panel.getByRole("button", { name: `${longName} 프로젝트 참여 종료`, exact: true })).toBeVisible();
        await expect(panel.getByRole("tab", { name: "회사 구성원", exact: true })).toBeVisible();
        await expect(panel.getByRole("button", { name: "회사 구성원에서 추가", exact: true })).toHaveCount(0);
        await expect(panel.getByText("구성원 관리 안내", { exact: true })).toHaveCount(0);
        await expect(panel.getByRole("list", { name: "프로젝트 구성원 목록", exact: true })).toContainText(longDepartment);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
        const background = await panel.locator(".project-members-view").evaluate((element) => getComputedStyle(element).backgroundColor);
        if (!dark) lightBackground = background;
        else expect(background).not.toBe(lightBackground);
        await page.screenshot({ path: testInfo.outputPath(`members-tab-${width}-${dark ? "dark" : "light"}.png`), fullPage: true });
      }
    }
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("역할 후보는 행별로 취소·저장하고 실패 시 실제 역할을 보존하며 중복 PATCH를 막는다", async ({ page }) => {
    api = await installMembersApi(page);
    await page.goto("/projects/901");
    const panel = await openMembersTab(page);
    const developer = panel.getByRole("list", { name: "프로젝트 구성원 목록", exact: true }).getByRole("listitem").filter({ hasText: "QA 김개발" });
    await expect(developer.getByRole("button", { name: "QA 김개발 역할 변경 저장", exact: true })).toHaveCount(0);
    await select(panel, "QA 김개발 프로젝트 역할", "관리자");
    await select(panel, "QA 김개발 프로젝트 역할", "구성원");
    await expect(developer.getByRole("button", { name: "QA 김개발 역할 변경 저장", exact: true })).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
    await select(panel, "QA 김개발 프로젝트 역할", "관리자");
    await select(panel, "QA 홍검토 프로젝트 역할", "조회자");
    await panel.getByRole("button", { name: "QA 홍검토 역할 변경 저장", exact: true }).click();
    await expect.poll(() => api.members.get(901)?.find((member) => member.company_member_id === 175)?.role).toBe("viewer");
    expect(api.members.get(901)?.find((member) => member.company_member_id === 172)?.role).toBe("member");
    await expect(developer.getByRole("button", { name: "QA 김개발 프로젝트 역할", exact: true })).toContainText("관리자");
    await developer.getByRole("button", { name: "QA 김개발 역할 변경 취소", exact: true }).click();
    await expect(developer.getByRole("button", { name: "QA 김개발 프로젝트 역할", exact: true })).toContainText("구성원");
    await expect(developer.getByRole("button", { name: "QA 김개발 역할 변경 저장", exact: true })).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "PATCH")).toEqual([
      { method: "PATCH", path: "/company-projects/901/members/1905", body: { role: "viewer" } },
    ]);
    await select(panel, "QA 김개발 프로젝트 역할", "관리자");
    const path = "/company-projects/901/members/1902";
    api.failures.set(`PATCH ${path}`, { status: 503, code: "INTERNAL_SERVER_ERROR", message: "QA 역할 저장 실패" });
    await developer.getByRole("button", { name: "QA 김개발 역할 변경 저장", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("QA 역할 저장 실패");
    await expect(developer.getByRole("button", { name: "QA 김개발 프로젝트 역할", exact: true })).toContainText("관리자");
    await expect(developer).toContainText("현재 역할: 구성원");
    expect(api.members.get(901)?.find((member) => member.company_member_id === 172)?.role).toBe("member");
    api.failures.delete(`PATCH ${path}`);
    const gate = deferred();
    api.gates.set(`PATCH ${path}`, gate.promise);
    const save = developer.getByRole("button", { name: "QA 김개발 역할 변경 저장", exact: true });
    await save.click();
    await expect(save).toBeDisabled();
    await save.evaluate((element) => { if (element instanceof HTMLButtonElement) element.click(); });
    await expect.poll(() => api.requests.filter((request) => request.method === "PATCH" && request.path === path).length).toBe(2);
    gate.release();
    await expect.poll(() => api.members.get(901)?.find((member) => member.company_member_id === 172)?.role).toBe("manager");
    await expect(save).toHaveCount(0);
    await expect(developer.getByRole("button", { name: "QA 김개발 프로젝트 역할", exact: true })).toContainText("관리자");
  });

  test("마지막 owner 역할 변경을 서버가 거절하면 현재 소유자와 편집 후보를 구분하고 취소로 복원한다", async ({ page }) => {
    api = await installMembersApi(page);
    api.failures.set("PATCH /company-projects/901/members/1901", { status: 409, code: "PROJECT_LAST_OWNER_REQUIRED", message: "QA 마지막 소유자 역할 변경 거절" });
    await page.goto("/projects/901");
    const panel = await openMembersTab(page);
    await select(panel, `${QA_USER.name} 프로젝트 역할`, "관리자");
    await panel.getByRole("button", { name: `${QA_USER.name} 역할 변경 저장`, exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("프로젝트에는 활성 소유자가 최소 한 명 있어야 합니다.");
    await expect(panel).toContainText("현재 역할: 소유자");
    expect(api.members.get(901)?.find((member) => member.company_member_id === 171)).toMatchObject({ role: "owner", status: "active" });
    await panel.getByRole("button", { name: `${QA_USER.name} 역할 변경 취소`, exact: true }).click();
    await expect(panel.getByRole("button", { name: `${QA_USER.name} 프로젝트 역할`, exact: true })).toContainText("소유자");
    await expect(panel.getByRole("button", { name: `${QA_USER.name} 역할 변경 저장`, exact: true })).toHaveCount(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([
      { method: "PATCH", path: "/company-projects/901/members/1901", body: { role: "manager" } },
    ]);
  });

  test("회사 목록은 참여 중 중복 추가를 숨기고 참여 종료 직원은 기존 멤버십으로 다시 참여한다", async ({ page }) => {
    api = await installMembersApi(page);
    await page.goto("/projects/901");
    const panel = await openMembersTab(page);
    await panel.getByRole("tab", { name: "회사 구성원", exact: true }).click();
    await expect(panel.getByRole("tab", { name: "회사 구성원", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(memberDialog(page)).toHaveCount(0);
    const list = panel.getByRole("list", { name: "회사 구성원 목록", exact: true });
    const active = list.getByRole("listitem").filter({ hasText: "QA 김개발" });
    const available = list.getByRole("listitem").filter({ hasText: "QA 박디자인" });
    const ended = list.getByRole("listitem").filter({ hasText: "QA 이복귀" });
    await expect(active).toContainText("참여 중");
    await expect(active.getByRole("button", { name: "프로젝트에 추가", exact: true })).toHaveCount(0);
    await expect(available.getByRole("button", { name: "프로젝트에 추가", exact: true })).toBeVisible();
    await expect(available).not.toContainText("추가 가능");
    await expect(ended).toContainText("참여 종료");
    await expect(ended.getByRole("button", { name: "프로젝트에 추가", exact: true })).toHaveCount(0);
    await ended.getByRole("button", { name: "QA 이복귀 다시 참여", exact: true }).click();
    await expect(ended).toContainText("참여 중");
    expect(api.members.get(901)).toHaveLength(4);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([
      { method: "PATCH", path: "/company-projects/901/members/1903", body: { status: "active" } },
    ]);
    expect(api.assignments[0]).toMatchObject({ assignee_company_member_id: 172, status: "in_progress" });
  });

  test("낮은 화면의 기존 구성원 모달은 역할 키보드 선택·Escape·Footer 접근과 업무 패널 포커스를 유지한다", async ({ page }) => {
    api = await installMembersApi(page, { large: true });
    await page.setViewportSize({ width: 768, height: 480 });
    await page.goto("/projects/901");
    await page.addStyleTag({ content: ".project-members-body { overflow-y: scroll !important; scrollbar-gutter: stable; } .project-members-body::-webkit-scrollbar { width: 16px; }" });
    const dialog = await openMembers(page);
    const role = dialog.getByRole("button", { name: "QA 김개발 프로젝트 역할", exact: true });
    await role.focus();
    await page.keyboard.press("Enter");
    const options = dialog.getByRole("listbox", { name: "QA 김개발 프로젝트 역할", exact: true });
    await expect(options).toBeVisible();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(role).toContainText("관리자");
    await dialog.getByRole("button", { name: "QA 김개발 역할 변경 취소", exact: true }).click();
    await expect(role).toContainText("구성원");
    await role.click();
    await page.keyboard.press("Escape");
    await expect(options).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(role).toBeFocused();
    const close = dialog.getByRole("button", { name: "닫기", exact: true });
    await close.scrollIntoViewIfNeeded();
    await expect(close).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await close.click();
    await expect(workPanel(page).getByRole("button", { name: "프로젝트 구성원 관리에서 직원 추가", exact: true })).toBeFocused();
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("회사별 전체 조직도에서 이름·부서를 검색하고 한 명을 즉시 추가하며 중복 추가를 막는다", async ({ page }) => {
    api = await installMembersApi(page, { large: true });
    await page.goto("/projects/901?company_id=71");
    const dialog = await openMembers(page, true);
    await dialog.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true }).fill("직원 204");
    await expect(dialog).toContainText("QA 직원 204");
    await dialog.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true }).fill("QA 디자인부");
    await expect(dialog).toContainText("QA 박디자인");
    await dialog.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true }).fill("박디자인");
    await dialog.getByRole("button", { name: "프로젝트에 추가", exact: true }).click();
    await select(dialog, "추가할 프로젝트 역할", "관리자");
    api.failures.set("POST /company-projects/901/members", { status: 503, code: "INTERNAL_SERVER_ERROR", message: "QA 구성원 추가 실패" });
    await dialog.getByRole("button", { name: "추가", exact: true }).click();
    await expect(dialog).toContainText("QA 구성원 추가 실패");
    expect(api.members.get(901)?.some((member) => member.company_member_id === 174)).toBe(false);
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    api.failures.delete("POST /company-projects/901/members");
    await dialog.getByRole("button", { name: "추가", exact: true }).click();
    await expect.poll(() => api.members.get(901)?.find((member) => member.company_member_id === 174)?.role).toBe("manager");
    await expect(dialog.getByRole("button", { name: "프로젝트에 추가", exact: true })).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "POST")).toEqual([
      { method: "POST", path: "/company-projects/901/members", body: { company_member_id: "174", role: "manager" } },
      { method: "POST", path: "/company-projects/901/members", body: { company_member_id: "174", role: "manager" } },
    ]);
    expect(api.requests.filter((request) => /org-chart/.test(request.path)).every((request) => request.path === "/companies/71/org-chart")).toBe(true);
    await page.keyboard.press("Escape");
    await page.goto("/projects/902?company_id=72");
    const other = await openMembersTab(page, true);
    await expect(other).toContainText("QA 다른 회사 직원");
    await expect(other).not.toContainText("QA 박디자인");
  });

  test("비활성 프로젝트 구성원은 기존 멤버 ID로 다시 참여하고 역할을 변경한다", async ({ page }) => {
    api = await installMembersApi(page);
    await page.goto("/projects/901");
    const dialog = await openMembers(page);
    await dialog.getByRole("textbox", { name: "이름 또는 부서 검색", exact: true }).fill("이복귀");
    await dialog.getByRole("button", { name: "QA 이복귀 다시 참여", exact: true }).click();
    await expect.poll(() => api.members.get(901)?.find((member) => member.company_member_id === 173)?.status).toBe("active");
    await select(dialog, "QA 이복귀 프로젝트 역할", "관리자");
    await dialog.getByRole("button", { name: "QA 이복귀 역할 변경 저장", exact: true }).click();
    await expect.poll(() => api.members.get(901)?.find((member) => member.company_member_id === 173)?.role).toBe("manager");
    await dialog.getByRole("button", { name: "QA 이복귀 프로젝트 참여 종료", exact: true }).click();
    await dialog.getByRole("button", { name: "참여 종료 확인", exact: true }).click();
    await expect.poll(() => api.members.get(901)?.find((member) => member.company_member_id === 173)?.status).toBe("inactive");
    expect(api.assignments[0].status).toBe("in_progress");
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([
      { method: "PATCH", path: "/company-projects/901/members/1903", body: { status: "active" } },
      { method: "PATCH", path: "/company-projects/901/members/1903", body: { role: "manager" } },
      { method: "DELETE", path: "/company-projects/901/members/1903", body: {} },
    ]);
  });

  test("마지막 owner 참여 종료 충돌과 회사 조회 실패는 기존 참여·배정을 유지하고 재시도할 수 있다", async ({ page }) => {
    api = await installMembersApi(page);
    api.failures.set("DELETE /company-projects/901/members/1901", { status: 409, code: "PROJECT_LAST_OWNER_REQUIRED", message: "QA 구성원 제외 충돌" });
    await page.goto("/projects/901");
    const dialog = await openMembers(page);
    await dialog.getByRole("button", { name: `${QA_USER.name} 프로젝트 참여 종료`, exact: true }).click();
    await dialog.getByRole("button", { name: "참여 종료 확인", exact: true }).click();
    await expect(dialog).toContainText("프로젝트에는 활성 소유자가 최소 한 명 있어야 합니다.");
    expect(api.members.get(901)?.find((member) => member.company_member_id === 171)?.status).toBe("active");
    expect(api.assignments[0].status).toBe("in_progress");
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    api.failures.set("GET /companies/71/org-chart", { status: 403, code: "FORBIDDEN", message: "QA 회사 구성원 조회 거절" });
    await page.reload();
    const failedDialog = await openMembers(page, true);
    await expect(failedDialog).toContainText("QA 회사 구성원 조회 거절");
    api.failures.delete("GET /companies/71/org-chart");
    await failedDialog.getByRole("button", { name: /다시 시도|재시도/ }).click();
    await expect(failedDialog).toContainText("QA 박디자인");
  });

  test("회사 소유자여도 프로젝트 manager는 구성원 변경 없이 담당자만 관리한다", async ({ page }) => {
    api = await installMembersApi(page, { role: "manager", companyRole: "owner" });
    await page.goto("/projects/901");
    const panel = await openMembersTab(page);
    await expect(panel.getByRole("button", { name: /프로젝트 참여 종료|역할 변경 저장|프로젝트에 추가/ })).toHaveCount(0);
    await page.getByRole("tab", { name: "업무 목록", exact: true }).click();
    await row(page, "QA 담당자 업무").click();
    await expect(workPanel(page).getByRole("button", { name: "담당자 추가", exact: true })).toBeVisible();
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("프로젝트 구성원만 선택하여 복수 배정하고 교체·해제 결과를 트리와 상세에 반영한다", async ({ page }) => {
    api = await installMembersApi(page);
    await page.goto("/projects/901");
    await row(page, "QA 담당자 업무").click();
    const panel = workPanel(page);
    await panel.getByRole("button", { name: "담당자 추가", exact: true }).click();
    const search = panel.getByRole("textbox", { name: "프로젝트 구성원 검색", exact: true });
    await search.fill("테스터");
    await panel.getByRole("button", { name: new RegExp(QA_USER.name) }).click();
    await panel.getByRole("button", { name: "배정", exact: true }).click();
    await expect.poll(() => api.assignments.filter((assignment) => assignment.status !== "cancelled").length).toBe(2);
    await expect(panel.getByLabel("업무 담당자", { exact: true })).toContainText(QA_USER.name);
    const treeRow = page.locator('tr[data-work-id="501"]');
    await expect(treeRow).toContainText(QA_USER.name);
    await panel.getByRole("button", { name: "담당자 변경", exact: true }).first().click();
    await search.fill("홍검토");
    await panel.getByRole("button", { name: /QA 홍검토/ }).click();
    await panel.getByRole("button", { name: "변경 저장", exact: true }).click();
    await expect.poll(() => api.assignments[0].assignee_company_member_id).toBe(175);
    await panel.getByRole("button", { name: "배정 해제", exact: true }).first().click();
    await panel.getByRole("button", { name: "해제 확인", exact: true }).click();
    await expect.poll(() => api.assignments[0].status).toBe("cancelled");
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([
      { method: "POST", path: "/company-projects/901/work-items/501/assignments", body: { assignee_company_member_id: 171, department_id: null } },
      { method: "PATCH", path: "/company-projects/901/work-items/501/assignments/701", body: { assignee_company_member_id: 175, department_id: null } },
      { method: "PATCH", path: "/company-projects/901/work-items/501/assignments/701", body: { status: "cancelled" } },
    ]);
    await expect(panel).toContainText("QA 담당자 업무");
    expect(api.workItems[0].progress_percent).toBe(37);
  });

  test("담당자 서버403 실패는 기존 담당자를 보존하고 읽기 권한을 다시 확인한다", async ({ page }) => {
    api = await installMembersApi(page);
    api.failures.set("PATCH /company-projects/901/work-items/501/assignments/701", { status: 403, code: "PROJECT_MANAGEMENT_FORBIDDEN", message: "QA 담당자 변경 권한 없음" });
    await page.goto("/projects/901");
    await row(page, "QA 담당자 업무").click();
    const panel = workPanel(page);
    await panel.getByRole("button", { name: "배정 해제", exact: true }).click();
    await panel.getByRole("button", { name: "해제 확인", exact: true }).click();
    await expect(panel).toContainText("QA 담당자 변경 권한 없음");
    expect(api.assignments[0]).toMatchObject({ assignee_company_member_id: 172, status: "in_progress", progress_percent: 37 });
    await expect(panel).toContainText("QA 김개발");
    expect(api.requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
    await expect.poll(() => api.requests.filter((request) => request.path === "/company-projects/901/members").length).toBeGreaterThan(1);
  });

  test("지연 조회 업무의 배정과 구성원 관리 후 선택·검색·스크롤·초점을 유지한다", async ({ page }, testInfo) => {
    api = await installMembersApi(page, { lazy: true });
    await page.goto("/projects/901");
    await row(page, "QA 담당자 업무").click();
    await workPanel(page).getByRole("button", { name: /^QA 지연 조회 업무/ }).click();
    await workPanel(page).getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await page.getByRole("textbox", { name: "업무 검색", exact: true }).fill("지연 조회");
    await row(page, "QA 지연 조회 업무").click();
    const panel = workPanel(page);
    await panel.getByRole("button", { name: "담당자 추가", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath("assignment-light.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.screenshot({ path: testInfo.outputPath("assignment-dark.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    const opener = panel.getByRole("button", { name: "프로젝트 구성원 관리에서 직원 추가", exact: true });
    await opener.click();
    await expect(memberDialog(page)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("members-light.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await page.screenshot({ path: testInfo.outputPath("members-dark.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await memberDialog(page).getByRole("button", { name: "닫기", exact: true }).click();
    await expect(panel).toContainText("QA 지연 조회 업무");
    await expect(panel.getByRole("textbox", { name: "프로젝트 구성원 검색", exact: true })).toBeVisible();
    await expect(opener).toBeFocused();
    await panel.getByRole("textbox", { name: "프로젝트 구성원 검색", exact: true }).fill("테스터");
    await panel.getByRole("button", { name: new RegExp(QA_USER.name) }).click();
    await panel.locator(".work-panel-content").evaluate((element) => { element.scrollTop = 50; });
    await panel.getByRole("button", { name: "배정", exact: true }).evaluate((element) => element.focus({ preventScroll: true }));
    await page.keyboard.press("Enter");
    await expect.poll(() => api.assignments.length).toBe(2);
    await expect(panel.getByRole("button", { name: "담당자 추가", exact: true })).toBeFocused();
    await expect.poll(() => panel.locator(".work-panel-content").evaluate((element) => Math.abs(element.scrollTop - 50))).toBeLessThanOrEqual(1);
    await expect(panel).toContainText("QA 지연 조회 업무");
    await panel.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "업무 검색", exact: true })).toHaveValue("지연 조회");
    expect(api.requests.filter((request) => request.method === "POST")).toEqual([
      { method: "POST", path: "/company-projects/901/work-items/511/assignments", body: { assignee_company_member_id: 171, department_id: null } },
    ]);
  });

  test("늦게 끝난 배정은 선택한 다른 업무와 상세 패널 모드를 바꾸지 않는다", async ({ page }, testInfo) => {
    api = await installMembersApi(page);
    const gate = deferred();
    const path = "/company-projects/901/work-items/501/assignments";
    api.gates.set(`POST ${path}`, gate.promise);
    await page.goto("/projects/901");
    await row(page, "QA 담당자 업무").click();
    const panel = workPanel(page);
    await panel.getByRole("button", { name: "담당자 추가", exact: true }).click();
    await panel.getByRole("textbox", { name: "프로젝트 구성원 검색", exact: true }).fill("테스터");
    await panel.getByRole("button", { name: new RegExp(QA_USER.name) }).click();
    await panel.getByRole("button", { name: "배정", exact: true }).click();
    await expect.poll(() => api.requests.filter((request) => request.method === "POST" && request.path === path).length).toBe(1);
    if (testInfo.project.name === "mobile") await panel.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await row(page, "QA 다른 업무").click();
    const mode = await workPanel(page).getAttribute("role");
    const focused = await page.evaluateHandle(() => document.activeElement);
    gate.release();
    await expect.poll(() => api.assignments.length).toBe(2);
    await expect(workPanel(page)).toHaveAttribute("role", mode!);
    await expect(workPanel(page)).toContainText("QA 다른 업무");
    await expect(workPanel(page)).not.toContainText(QA_USER.name);
    await expect.poll(() => focused.evaluate((element) => element === document.activeElement)).toBe(true);
    expect(api.assignments.at(-1)?.company_project_work_item_id).toBe(501);
  });

  test("일반 프로젝트 구성원에게 마스킹된 담당자 ID0을 이름으로 복원하거나 변경하지 않는다", async ({ page }) => {
    api = await installMembersApi(page, { role: "member", companyRole: "owner", masked: true });
    api.failures.set("GET /company-projects/901/members", { status: 403, code: "PROJECT_MANAGEMENT_FORBIDDEN", message: "프로젝트 관리 권한이 없습니다." });
    await page.goto("/projects/901");
    await row(page, "QA 담당자 업무").click();
    const panel = workPanel(page);
    await expect(panel.getByText("담당자 정보 비공개", { exact: true })).toBeVisible();
    await expect(panel.getByText("구성원 0", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /담당자 추가|담당자 변경|배정 해제/ })).toHaveCount(0);
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
    expect(api.requests.filter((request) => /org-chart|\/members\/0/.test(request.path))).toEqual([]);
  });

  test("담당자 요청 중 프로젝트 권한이 회수되면 최신 권한으로 변경 UI를 닫는다", async ({ page }) => {
    api = await installMembersApi(page);
    const gate = deferred();
    const path = "/company-projects/901/work-items/501/assignments/701";
    api.gates.set(`PATCH ${path}`, gate.promise);
    await page.goto("/projects/901");
    await row(page, "QA 담당자 업무").click();
    const panel = workPanel(page);
    await panel.getByRole("button", { name: "담당자 변경", exact: true }).click();
    await panel.getByRole("textbox", { name: "프로젝트 구성원 검색", exact: true }).fill("홍검토");
    await panel.getByRole("button", { name: /QA 홍검토/ }).click();
    await panel.getByRole("button", { name: "변경 저장", exact: true }).click();
    await expect.poll(() => api.requests.filter((request) => request.method === "PATCH").length).toBe(1);
    api.failures.set("GET /company-projects/901/members", { status: 403, code: "PROJECT_MANAGEMENT_FORBIDDEN", message: "QA 관리 권한 회수" });
    gate.release();
    await expect.poll(() => api.requests.filter((request) => request.path === "/company-projects/901/members").length).toBeGreaterThan(1);
    await expect(panel.getByRole("button", { name: /담당자 추가|담당자 변경|배정 해제/ })).toHaveCount(0);
    await expect(panel.getByRole("textbox", { name: "프로젝트 구성원 검색", exact: true })).toHaveCount(0);
    await expect(panel).toContainText("QA 담당자 업무");
    await expect(panel).not.toContainText("QA 홍검토");
    expect(api.requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
  });
});
