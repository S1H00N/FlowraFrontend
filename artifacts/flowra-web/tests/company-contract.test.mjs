import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
let response = {};
let rejection;
let responseSuccess = true;
const calls = [];
const invalidations = [];
const client = Object.fromEntries(
  ["get", "post", "patch", "delete"].map((method) => [method, async (...args) => {
    calls.push({ method, args });
    if (rejection) throw rejection;
    return { data: { success: responseSuccess, message: "OK", data: response } };
  }]),
);
const queryClient = {
  invalidateQueries: ({ queryKey }) => { invalidations.push(queryKey); return Promise.resolve(); },
  getQueryCache: () => ({ findAll: () => [{ queryKey: ["company-schedules", "list", {}] }] }),
  setQueryData: (...args) => { calls.push({ method: "setQueryData", args }); },
};
const cache = new Map();
function loadSource(source) {
  const filename = [source, `${source}.ts`, path.join(source, "index.ts")].find(
    (file) => file.endsWith(".ts") && existsSync(file),
  );
  if (!filename) throw new Error(`Missing test module: ${source}`);
  if (filename === path.join(webRoot, "src/api/client.ts")) {
    return { __esModule: true, default: client };
  }
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const importModule = (specifier) => {
    if (specifier === "@tanstack/react-query") {
      return { useMutation: (options) => options, useQuery: (options) => options, useQueryClient: () => queryClient };
    }
    if (specifier.startsWith("@/")) return loadSource(path.join(webRoot, "src", specifier.slice(2)));
    if (specifier.startsWith(".")) return loadSource(path.resolve(path.dirname(filename), specifier));
    return require(specifier);
  };
  new Function("require", "module", "exports", compiled)(importModule, module, module.exports);
  return module.exports;
}
const load = (name) => loadSource(path.join(webRoot, "src", name));
const schedules = load("api/companySchedules");
const approvals = load("api/companyScheduleApprovals");
const invites = load("api/companyInvites");
const projects = load("api/companyProjects");
const companyDirectory = load("api/companyAdmin");
const projectMembers = load("lib/projectMembers");
const approvalHooks = load("hooks/useCompanyScheduleApprovals");
const inviteHooks = load("hooks/useCompanyInvites");
const adminHooks = load("hooks/useCompanyAdmin");
const membershipHooks = load("hooks/useCompanyMemberships");
const projectHooks = load("hooks/useCompanyProjects");
const body = () => JSON.parse(JSON.stringify(calls.at(-1).args[1]));

const sampleProject = {
  company_project_id: 51, company_id: 7, name: "Project", status: "draft",
};

test("project list uses documented company, search and status filters and retains pagination", async () => {
  response = { items: [sampleProject], pagination: { total_items: 10 } };
  const result = await projects.listCompanyProjects({ company_id: 7, status: "draft", q: "Project" });
  assert.equal(calls.at(-1).args[0], "/company-projects");
  assert.deepEqual(body().params, { company_id: "7", status: "draft", q: "Project" });
  assert.deepEqual(result.data.projects, [sampleProject]);
  assert.equal(result.data.pagination.total_items, 10);
  response = { items: [] };
  assert.deepEqual((await projects.listCompanyProjects()).data.projects, []);
});

test("malformed project lists and mismatched detail IDs remain errors rather than empty or unauthorized results", async () => {
  for (const malformed of [{ unexpected: [] }, { items: [null] }, { items: [{ company_project_id: 51 }] }]) {
    response = malformed;
    await assert.rejects(() => projects.listCompanyProjects(), /응답 형식|유효하지 않은/);
  }
  response = { project: { ...sampleProject, company_project_id: 52 } };
  await assert.rejects(() => projects.getCompanyProject(51), /상세 응답 형식/);
  response = { project: { company_project_id: 51 } };
  await assert.rejects(() => projects.getCompanyProject(51), /상세 응답 형식/);
  response = { project: sampleProject, summary: { opaque: 10 }, detail_policy: { partial: true } };
  const detail = await projects.getCompanyProject(51);
  assert.deepEqual(detail.data.project, sampleProject);
  assert.deepEqual(detail.data.summary, { opaque: 10 });
  assert.deepEqual(detail.data.detail_policy, { partial: true });
});

test("project creation preserves date-only fields and requires a server project ID", async () => {
  response = { project: sampleProject };
  const created = await projects.createCompanyProject({ company_id: 7, name: "Project", phase_mode: "phased", visibility: "members", status: "draft", planned_start_date: "2026-10-08", planned_end_date: "2026-10-09" });
  assert.deepEqual(body(), { company_id: "7", name: "Project", phase_mode: "phased", visibility: "members", status: "draft", planned_start_date: "2026-10-08", planned_end_date: "2026-10-09" });
  assert.equal(created.data.project.company_project_id, 51);
  response = { project: { name: "Project" } };
  await assert.rejects(() => projects.createCompanyProject({ company_id: 7, name: "Project" }), /프로젝트 ID/);
});

test("company switches never reuse previous project rows and search can opt out of stale rows", () => {
  const previousData = [sampleProject];
  const previousQuery = { queryKey: ["company-projects", "list", { company_id: 7 }] };
  assert.equal(projectHooks.useCompanyProjects({ company_id: 8 }).placeholderData(previousData, previousQuery), undefined);
  assert.equal(projectHooks.useCompanyProjects({ company_id: 7 }, { keepPreviousData: false }).placeholderData(previousData, previousQuery), undefined);
  assert.equal(projectHooks.useCompanyProjects({ company_id: 7 }).placeholderData(previousData, previousQuery), previousData);
});

test("project permissions reject damaged member rows and refresh lists even after creation transport failures", async () => {
  response = { members: [null] };
  await assert.rejects(() => projectHooks.useCompanyProjectMembers(51).queryFn(), /멤버 응답/);
  response = { members: [{ company_member_id: 3, role: "owner" }] };
  assert.equal((await projectHooks.useCompanyProjectMembers(51).queryFn())[0].role, "owner");
  invalidations.length = 0;
  projectHooks.useCreateCompanyProject().onSettled(undefined, new Error("response lost"));
  assert.ok(invalidations.some((key) => JSON.stringify(key) === '["company-projects"]'));
});

test("explicit company directory reads only that company and collects nested and unassigned members", async () => {
  const controller = new AbortController();
  const nestedMember = { company_member_id: 302, name: "Nested", user_public_uid: "linked-public-uid" };
  const unassignedMember = { company_member_id: 303, name: "Unassigned", department_id: null };
  response = { company: { company_id: 22 }, departments: [{ department_id: 8, name: "Design", members: [
    { company_member_id: 301, name: "Designer" },
  ], children: [{ department_id: 9, name: "Product", members: [nestedMember] }] }],
  unassigned_members: [unassignedMember, { company_member_id: 301, name: "Duplicate" }] };
  const start = calls.length;
  const result = await companyDirectory.listCompanyAdminMembers(22, { signal: controller.signal });
  assert.deepEqual(calls.slice(start), [{ method: "get", args: ["/companies/22/org-chart", { signal: controller.signal }] }]);
  assert.deepEqual(result.data.members.map((member) => member.company_member_id), [301, 302, 303]);
  assert.equal(result.data.members[0].department.name, "Design");
  assert.equal(result.data.members[1].department_id, 9);
  assert.equal(result.data.members[1].department.name, "Product");
  assert.equal(result.data.members[1].user_public_uid, "linked-public-uid");
  assert.equal(result.data.members[2].department_id, null);
  assert.equal(result.data.pagination, undefined);
});

test("explicit company directory access failures are not retried or replaced with a different membership", async () => {
  for (const status of [403, 500]) {
    const start = calls.length;
    const failure = { response: { status } };
    rejection = failure;
    try {
      await assert.rejects(() => companyDirectory.listCompanyAdminMembers(22), (error) => error === failure);
    } finally {
      rejection = undefined;
    }
    assert.equal(calls.length, start + 1);
    assert.equal(calls.at(-1).args[0], "/companies/22/org-chart");
  }
  const start = calls.length;
  responseSuccess = false;
  response = { departments: [], unassigned_members: [] };
  try {
    await assert.rejects(() => companyDirectory.listCompanyAdminMembers(22), /OK/);
  } finally {
    responseSuccess = true;
  }
  assert.equal(calls.length, start + 1);
  for (const invalid of [0, -1, 1.5, NaN]) {
    await assert.rejects(() => companyDirectory.listCompanyAdminMembers(invalid), /회사/);
  }
  assert.equal(calls.length, start + 1);
});

test("explicit company directory rejects incomplete, malformed and cross-company organization data", async () => {
  const valid = { departments: [], unassigned_members: [] };
  for (const malformed of [
    null,
    { unexpected: [] },
    { departments: [] },
    { ...valid, departments: {} },
    { ...valid, unassigned_members: [null] },
    { ...valid, unassigned_members: [{ company_member_id: 0 }] },
    { ...valid, unassigned_members: [{ company_member_id: 302, department_id: -1 }] },
    { ...valid, unassigned_members: [{ company_member_id: 302, name: 123 }] },
    { ...valid, unassigned_members: [{ company_member_id: 302, status: true }] },
    { ...valid, unassigned_members: [{ company_member_id: 302, department: [] }] },
    { ...valid, unassigned_members: [{ company_member_id: 302, department: { department_id: -1 } }] },
    { ...valid, unassigned_members: [{ company_member_id: 302, department: { name: 123 } }] },
    { ...valid, unassigned_members: [{ company_member_id: 302, department: { status: {} } }] },
    { ...valid, departments: [{ department_id: 0 }] },
    { ...valid, departments: [{ department_id: 8, name: 123 }] },
    { ...valid, departments: [{ department_id: 8, status: [] }] },
    { ...valid, departments: [{ department_id: 8, members: {} }] },
    { ...valid, departments: [{ department_id: 8, members: [{ company_member_id: -1 }] }] },
    { ...valid, departments: [{ department_id: 8, children: {} }] },
    { ...valid, departments: [{ department_id: 8, children: [{ department_id: 9, members: [null] }] }] },
    { ...valid, company: { company_id: 7 } },
  ]) {
    response = malformed;
    const start = calls.length;
    await assert.rejects(() => companyDirectory.listCompanyAdminMembers(22), /회사 구성원 응답/);
    assert.equal(calls.length, start + 1);
    assert.equal(calls.at(-1).args[0], "/companies/22/org-chart");
  }
  response = { company: { company_id: 22 }, ...valid };
  assert.deepEqual((await companyDirectory.listCompanyAdminMembers(22)).data.members, []);
  response = { departments: [{ department_id: 8, members: [{ company_member_id: 301 }], children: [] }],
    unassigned_members: [{ company_member_id: 302, name: null, status: null, department: { name: null, status: null } }] };
  assert.deepEqual((await companyDirectory.listCompanyAdminMembers(22)).data.members.map((member) => member.company_member_id), [301, 302]);
});

test("project directories and project-member queries keep company and project cache scopes separate", async () => {
  const first = projectHooks.useCompanyProjectDirectory(7);
  const second = projectHooks.useCompanyProjectDirectory(22);
  assert.deepEqual(first.queryKey, ["company-projects", "directory", 7]);
  assert.deepEqual(second.queryKey, ["company-projects", "directory", 22]);
  assert.notDeepEqual(first.queryKey, second.queryKey);
  assert.equal(first.retry, false);
  assert.equal(first.placeholderData, undefined);
  assert.equal(projectHooks.useCompanyProjectDirectory(7, { enabled: false }).enabled, false);
  assert.equal(projectHooks.useCompanyProjectDirectory(0).enabled, false);
  assert.deepEqual(projectHooks.useCompanyProjectMembers(51).queryKey, ["company-projects", "members", 51]);
  assert.notDeepEqual(projectHooks.useCompanyProjectMembers(51).queryKey, projectHooks.useCompanyProjectMembers(52).queryKey);
  response = { company: { company_id: 22 }, departments: [], unassigned_members: [{ company_member_id: 303, name: "Second company" }] };
  const controller = new AbortController();
  assert.equal((await second.queryFn({ signal: controller.signal }))[0].name, "Second company");
  assert.deepEqual(calls.at(-1).args, ["/companies/22/org-chart", { signal: controller.signal }]);
});

test("project identity labels preserve privacy masks and do not display internal identifiers", () => {
  const directory = [
    { company_member_id: 0, name: "Must stay hidden", department: { name: "Secret department" } },
    { company_member_id: 302, name: "Directory name", department: { name: "Product" } },
  ];
  const membership = { company_member_id: 301, company_id: 22, name: "Current member", department: { name: "Design" } };
  assert.equal(projectMembers.projectMemberName({ company_member_id: 0 }, directory, { ...membership, company_member_id: 0 }), "담당자 정보 비공개");
  assert.equal(projectMembers.projectMemberDepartment({ company_member_id: 0 }, directory, membership), "");
  assert.equal(projectMembers.projectMemberName({ company_member_id: 301 }, directory, membership), "Current member");
  assert.equal(projectMembers.projectMemberDepartment({ company_member_id: 301 }, directory, membership), "Design");
  assert.equal(projectMembers.projectMemberName({ company_member_id: 302 }, directory, membership), "Directory name");
  assert.equal(projectMembers.projectMemberDepartment({ company_member_id: 302 }, directory, membership), "Product");
  const unavailable = projectMembers.projectMemberName({ company_member_id: 987654 }, directory, membership);
  assert.equal(unavailable, "이름 정보 없음");
  assert.equal(unavailable.includes("987654"), false);
});

test("assignment summary excludes cancelled history, deduplicates people and keeps masked names private", () => {
  const membership = { company_member_id: 301, company_id: 22, name: "Current member" };
  const directory = [{ company_member_id: 302, name: "Directory name" }, { company_member_id: 0, name: "Hidden name" }];
  const assignment = (memberId, status = "todo") => ({ assignee_company_member_id: memberId, status });
  assert.equal(projectMembers.projectAssigneeSummary([
    assignment(302, "cancelled"), assignment(301), assignment(301), assignment(0), assignment(null),
  ], directory, membership), "Current member, 담당자 정보 비공개");
  assert.equal(projectMembers.projectAssigneeSummary([assignment(302, "cancelled")], directory, membership), "미배정");
  assert.equal(projectMembers.projectAssigneeSummary([assignment(987654)], directory, membership), "이름 정보 없음");
  assert.equal(projectMembers.projectAssignmentId({ company_project_work_assignment_id: 20, assignment_id: 99 }), 20);
  assert.equal(projectMembers.projectAssignmentId({ assignment_id: 99 }), 99);
  assert.equal(projectMembers.activeProjectMember({ status: "inactive" }), false);
  assert.equal(projectMembers.activeProjectMember({ status: "active" }), true);
});

test("company schedule creation and editing serialize offset times as UTC, preserving null clearing", async () => {
  response = { company_schedule: { company_schedule_id: 11 } };
  await schedules.createCompanySchedule({
    company_id: 7, title: "Review", schedule_type: "meeting",
    start_datetime: "2026-09-21T00:30:00+09:00", end_datetime: "2026-09-21T01:30:00+09:00",
    target_department_ids: [8, 9],
  });
  assert.equal(body().start_datetime, "2026-09-20T15:30:00.000Z");
  assert.equal(body().end_datetime, "2026-09-20T16:30:00.000Z");
  assert.deepEqual(body().target_department_ids, ["8", "9"]);
  await schedules.updateCompanySchedule(11, { start_datetime: "2026-09-21T01:00:00+09:00", end_datetime: null, description: null });
  assert.deepEqual(body(), { start_datetime: "2026-09-20T16:00:00.000Z", end_datetime: null, description: null });
  await schedules.updateCompanySchedule(11, { title: "Renamed" });
  assert.deepEqual(body(), { title: "Renamed" });
});

test("withdraw uses the approval ID without a body and preserves the lifecycle response", async () => {
  response = { company_schedule_id: 11, change_request_id: 4, status: "withdrawn" };
  const result = await approvals.withdrawCompanyScheduleApproval(27);
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/company-schedule-approvals/27/withdraw"] });
  assert.deepEqual(result.data, response);
  response = { approvals: [{ approval_id: 27, status: "withdrawn" }] };
  const list = await approvals.listCompanyScheduleApprovals({ status: "withdrawn", role: "requested" });
  assert.deepEqual(body().params, { status: "withdrawn", role: "requested" });
  assert.equal(list.data.approvals[0].status, "withdrawn");
});

test("a withdrawal conflict stays an error and refreshes approvals, calendars, home and briefing", async () => {
  invalidations.length = 0;
  const mutation = approvalHooks.useWithdrawCompanyScheduleApproval();
  rejection = { response: { status: 409, data: { error: { code: "COMPANY_SCHEDULE_REQUEST_ALREADY_DECIDED" } } } };
  try {
    await assert.rejects(() => mutation.mutationFn(27), (error) => error === rejection);
    mutation.onSettled(undefined, rejection);
  } finally {
    rejection = undefined;
  }
  for (const key of [["company-schedule-approvals"], ["company-schedules"], ["home", "today"], ["briefings", "today"]]) {
    assert.ok(invalidations.some((item) => JSON.stringify(item) === JSON.stringify(key)), `missing ${key}`);
  }
});

test("invitation rejection uses authenticated invite ID and refreshes the inbox after a competing decision", async () => {
  response = {};
  await invites.rejectMyCompanyInviteById(19);
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/company-memberships/invites/by-id/19/reject"] });
  invalidations.length = 0;
  const mutation = inviteHooks.useRejectMyCompanyInvite();
  rejection = { response: { status: 409 } };
  try {
    await assert.rejects(() => mutation.mutationFn(19), (error) => error === rejection);
    mutation.onSettled(undefined, rejection);
  } finally {
    rejection = undefined;
  }
  assert.deepEqual(invalidations, [["company-invites"]]);
});

test("project updates keep date-only fields and explicit nulls and use the general user route", async () => {
  response = { project: { company_project_id: 5, status: "archived" } };
  const result = await projects.updateCompanyProject(5, {
    status: "archived", description: null, origin_department_id: 8,
    planned_start_date: "2026-09-21", actual_end_date: null,
    completed_at: "2026-09-21T00:00:00+09:00",
  });
  assert.equal(calls.at(-1).args[0], "/company-projects/5");
  assert.deepEqual(body(), {
    status: "archived", description: null, origin_department_id: "8",
    planned_start_date: "2026-09-21", actual_end_date: null,
    completed_at: "2026-09-20T15:00:00.000Z",
  });
  assert.equal(result.data.project.status, "archived");
});

test("project member management distinguishes company member and project member IDs and preserves owner conflicts", async () => {
  response = { member: { company_member_id: 3, company_project_member_id: 17, role: "manager" } };
  await projects.createCompanyProjectMember(5, { company_member_id: 3, role: "manager" });
  assert.equal(calls.at(-1).args[0], "/company-projects/5/members");
  assert.deepEqual(body(), { company_member_id: "3", role: "manager" });
  await projects.updateCompanyProjectMember(5, 17, { role: "owner" });
  assert.equal(calls.at(-1).args[0], "/company-projects/5/members/17");
  rejection = { response: { status: 409, data: { error: { code: "PROJECT_LAST_OWNER_REQUIRED" } } } };
  try {
    await assert.rejects(() => projects.removeCompanyProjectMember(5, 17), (error) => error === rejection);
  } finally {
    rejection = undefined;
  }
});

test("project member hooks use documented roles and membership IDs without creating invitation states", async () => {
  const create = projectHooks.useCreateCompanyProjectMember();
  for (const role of ["owner", "manager", "member", "viewer"]) {
    response = { member: { company_member_id: 302, company_project_member_id: 17, role, status: "active" } };
    const result = await create.mutationFn({ companyProjectId: 51, payload: { company_member_id: 302, role } });
    assert.equal(result.status, "active");
    assert.deepEqual(calls.at(-1), { method: "post", args: ["/company-projects/51/members", { company_member_id: "302", role }] });
  }
  response = { member: { company_member_id: 302, company_project_member_id: 17, role: "member", status: "inactive" } };
  await projectHooks.useUpdateCompanyProjectMember().mutationFn({ companyProjectId: 51, projectMemberId: 17, payload: { status: "inactive" } });
  assert.deepEqual(calls.at(-1), { method: "patch", args: ["/company-projects/51/members/17", { status: "inactive" }] });
  await projectHooks.useRemoveCompanyProjectMember().mutationFn({ companyProjectId: 51, projectMemberId: 17 });
  assert.deepEqual(calls.at(-1), { method: "delete", args: ["/company-projects/51/members/17"] });
});

test("managed assignment hooks create, replace and cancel through the documented assignment routes", async () => {
  response = { assignment: { company_project_work_assignment_id: 20, company_project_work_item_id: 10, assignee_company_member_id: 302, status: "todo" } };
  const created = await projectHooks.useCreateCompanyProjectAssignment().mutationFn({ companyProjectId: 51, workItemId: 10,
    payload: { assignee_company_member_id: 302, department_id: null, role: "reviewer" } });
  assert.equal(created.company_project_work_assignment_id, 20);
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/company-projects/51/work-items/10/assignments", { assignee_company_member_id: 302, department_id: null, role: "reviewer" }] });
  const update = projectHooks.useUpdateManagedCompanyProjectAssignment();
  response = { assignment: { ...response.assignment, assignee_company_member_id: 303 } };
  await update.mutationFn({ companyProjectId: 51, workItemId: 10, assignmentId: 20, payload: { assignee_company_member_id: 303, department_id: null } });
  assert.deepEqual(calls.at(-1), { method: "patch", args: ["/company-projects/51/work-items/10/assignments/20", { assignee_company_member_id: 303, department_id: null }] });
  response = { assignment: { ...response.assignment, status: "cancelled" } };
  await update.mutationFn({ companyProjectId: 51, workItemId: 10, assignmentId: 20, payload: { status: "cancelled" } });
  assert.deepEqual(calls.at(-1), { method: "patch", args: ["/company-projects/51/work-items/10/assignments/20", { status: "cancelled" }] });
});

test("member and assignment mutations reject missing results or identities belonging to another resource", async () => {
  const member = { company_member_id: 302, company_project_member_id: 17, role: "member", status: "active" };
  for (const malformed of [undefined, {}, { member: null }, { member: { ...member, company_member_id: 303 } }, { member: { ...member, company_project_member_id: 0 } }]) {
    response = malformed;
    await assert.rejects(() => projectHooks.useCreateCompanyProjectMember().mutationFn({ companyProjectId: 51, payload: { company_member_id: 302 } }), /변경 결과/);
  }
  response = { member: { ...member, company_project_member_id: 18 } };
  for (const mutation of [projectHooks.useUpdateCompanyProjectMember(), projectHooks.useRemoveCompanyProjectMember()]) {
    await assert.rejects(() => mutation.mutationFn({ companyProjectId: 51, projectMemberId: 17, payload: { role: "manager" } }), /변경 결과/);
  }
  const assignment = { company_project_work_assignment_id: 20, company_project_work_item_id: 10, assignee_company_member_id: 302 };
  for (const malformed of [undefined, {}, { assignment: null }, { assignment: { ...assignment, company_project_work_assignment_id: 0 } },
    { assignment: { ...assignment, company_project_work_item_id: 11 } }, { assignment: { ...assignment, assignee_company_member_id: 303 } }]) {
    response = malformed;
    await assert.rejects(() => projectHooks.useCreateCompanyProjectAssignment().mutationFn({ companyProjectId: 51, workItemId: 10, payload: { assignee_company_member_id: 302 } }), /배정 결과/);
  }
  response = { assignment: { ...assignment, company_project_work_assignment_id: 21 } };
  await assert.rejects(() => projectHooks.useUpdateManagedCompanyProjectAssignment().mutationFn({ companyProjectId: 51, workItemId: 10, assignmentId: 20, payload: { status: "cancelled" } }), /배정 결과/);
});

test("member and managed-assignment failures retain server errors and refresh related server data", async () => {
  const failure = { response: { status: 409, data: { error: { code: "PROJECT_LAST_OWNER_REQUIRED" } } } };
  for (const [mutation, args] of [
    [projectHooks.useCreateCompanyProjectMember(), { companyProjectId: 51, payload: { company_member_id: 302 } }],
    [projectHooks.useUpdateCompanyProjectMember(), { companyProjectId: 51, projectMemberId: 17, payload: { role: "manager" } }],
    [projectHooks.useRemoveCompanyProjectMember(), { companyProjectId: 51, projectMemberId: 17 }],
    [projectHooks.useCreateCompanyProjectAssignment(), { companyProjectId: 51, workItemId: 10, payload: { assignee_company_member_id: 302 } }],
    [projectHooks.useUpdateManagedCompanyProjectAssignment(), { companyProjectId: 51, workItemId: 10, assignmentId: 20, payload: { status: "cancelled" } }],
  ]) {
    const start = calls.length;
    invalidations.length = 0;
    rejection = failure;
    try {
      await assert.rejects(() => mutation.mutationFn(args), (error) => error === failure);
      mutation.onSettled(undefined, failure, args);
    } finally {
      rejection = undefined;
    }
    assert.equal(calls.length, start + 1);
    for (const key of [["company-projects"], ["company-schedules"], ["home", "today"], ["briefings", "today"]]) {
      assert.ok(invalidations.some((value) => JSON.stringify(value) === JSON.stringify(key)), `missing ${key}`);
    }
  }
});

test("creating a pending collaboration does not insert an unapproved event into calendar list caches", () => {
  calls.length = 0;
  const mutation = adminHooks.useCreateCompanyAdminSchedule();
  mutation.onSuccess({ company_schedule_id: 11, status: "pending_approval", approval_status: "pending" });
  assert.equal(calls.some((call) => call.method === "setQueryData"), false);
  mutation.onSuccess({ company_schedule_id: 12, status: "active", approval_status: "approved" });
  assert.equal(calls.some((call) => call.method === "setQueryData"), true);
});

test("joining and leaving refresh membership-dependent home and approval data", () => {
  for (const apply of [
    () => inviteHooks.useAcceptMyCompanyInvite().onSuccess(),
    () => membershipHooks.useLeaveCompanyMembership().onSuccess({}, 3),
  ]) {
    invalidations.length = 0;
    apply();
    for (const key of [["company-memberships"], ["company-schedule-approvals"], ["home", "today"], ["briefings", "today"]]) {
      assert.ok(invalidations.some((item) => JSON.stringify(item) === JSON.stringify(key)), `missing ${key}`);
    }
  }
});
