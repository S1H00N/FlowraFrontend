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
let responseForCall;
const calls = [];
const invalidations = [];
let queryClientOverride;
const queryClientStub = {
  cancelQueries: () => Promise.resolve(),
  invalidateQueries: ({ queryKey }) => { invalidations.push(queryKey); return Promise.resolve(); },
};
const client = Object.fromEntries(["get", "post", "patch", "put", "delete"].map((method) => [method, async (...args) => {
  calls.push({ method, args });
  if (rejection) throw rejection;
  return { data: { success: true, message: "OK", data: responseForCall ? await responseForCall(method, args) : response } };
}]));
const cache = new Map();
function loadSource(source) {
  const filename = [source, `${source}.ts`, path.join(source, "index.ts")].find((file) => file.endsWith(".ts") && existsSync(file));
  if (!filename) throw new Error(`Missing test module: ${source}`);
  if (filename === path.join(webRoot, "src/api/client.ts")) return { __esModule: true, default: client };
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  }).outputText;
  const importModule = (specifier) => {
    if (specifier === "@tanstack/react-query") return {
      useMutation: (options) => options, useQuery: (options) => options,
      useQueryClient: () => queryClientOverride ?? queryClientStub,
    };
    if (specifier.startsWith("@/")) return loadSource(path.join(webRoot, "src", specifier.slice(2)));
    if (specifier.startsWith(".")) return loadSource(path.resolve(path.dirname(filename), specifier));
    return require(specifier);
  };
  new Function("require", "module", "exports", compiled)(importModule, module, module.exports);
  return module.exports;
}
const api = loadSource(path.join(webRoot, "src/api/companyProjects"));
const hooks = loadSource(path.join(webRoot, "src/hooks/useCompanyProjects"));
const last = () => calls.at(-1);
const project = { company_project_id: 7, company_id: 3, name: "Project", status: "active" };
const work = (id, parent = null) => ({ company_project_work_item_id: id, company_project_id: 7, parent_work_item_id: parent, title: `Work ${id}`, status: "todo" });

test("assigned_only false is sent explicitly and project creation preserves nullable actual dates", async () => {
  response = { projects: [project] };
  await api.listCompanyProjects({ assigned_only: false });
  assert.deepEqual(last().args[1].params, { assigned_only: "false" });
  response = { project };
  await api.createCompanyProject({ name: "Project", origin_department_id: null, description: null,
    planned_start_date: null, actual_start_date: "2026-10-12", actual_end_date: null, source_type: "api" });
  assert.deepEqual(last().args, ["/company-projects", { name: "Project", description: null, origin_department_id: null,
    planned_start_date: null, actual_start_date: "2026-10-12", actual_end_date: null }]);
});

test("project PATCH sends supported fields only and converts completion time to UTC", async () => {
  response = { project };
  await api.updateCompanyProject(7, { status: "completed", completed_at: "2026-10-12T12:30:00+09:00",
    phase_mode: "phase_less", progress_percent: 100, description: null });
  assert.deepEqual(last().args, ["/company-projects/7", { description: null, status: "completed", completed_at: "2026-10-12T03:30:00.000Z" }]);
});

test("masked assignment zero is accepted in detail while negative IDs remain invalid", async () => {
  const assignment = { company_project_work_assignment_id: 30, company_project_work_item_id: 10,
    assignee_company_member_id: 0, assigned_by_company_member_id: null, completed_by_company_member_id: null };
  response = { project, work_items: [work(10)], phases: [], assignments: [assignment], departments: [], dependencies: [],
    summary: { phase_count: 0, work_item_count: 1, assignment_count: 1 },
    detail_policy: { scale: "small", mode: "full", max_depth: 5, full_load_allowed: true, returned_work_item_count: 1 } };
  const result = await api.getCompanyProject(7);
  assert.equal(result.data.assignments[0].assignee_company_member_id, 0);
  assert.deepEqual(result.data.summary, response.summary);
  response = { ...response, assignments: [{ ...assignment, assignee_company_member_id: -1 }] };
  await assert.rejects(api.getCompanyProject(7), /업무 응답 형식/);
});

test("phase create and PATCH preserve explicit null, signed ordering and reject mismatched response IDs", async () => {
  response = { phase: { company_project_phase_id: 4, company_project_id: 7, name: "Planning" } };
  await api.createCompanyProjectPhase(7, { name: "Planning", sort_order: -2, description: null, progress_percent: 99 });
  assert.deepEqual(last().args, ["/company-projects/7/phases", { name: "Planning", description: null, sort_order: -2 }]);
  await api.updateCompanyProjectPhase(7, 4, { actual_end_date: null, planned_start_date: "2026-10-12" });
  assert.deepEqual(last().args, ["/company-projects/7/phases/4", { planned_start_date: "2026-10-12", actual_end_date: null }]);
  await assert.rejects(api.updateCompanyProjectPhase(7, 5, { name: "Renamed" }), /단계 응답 형식/);
});

test("work CRUD retains root/phase clearing and override release without synthesizing completion", async () => {
  response = { work_item: work(10) };
  await api.createCompanyProjectWorkItem(7, { title: "Work", parent_work_item_id: 8, status: "done",
    due_datetime: "2026-10-12T12:00:00+09:00", department_ids: [], progress_percent: 0,
    external_work_item_id: "external", depth_level: 4 });
  assert.deepEqual(last().args, ["/company-projects/7/work-items", { title: "Work", parent_work_item_id: 8,
    status: "done", due_datetime: "2026-10-12T03:00:00.000Z", progress_percent: 0, department_ids: [], external_work_item_id: "external" }]);
  await api.updateCompanyProjectWorkItem(7, 10, { parent_work_item_id: null, company_project_phase_id: null,
    progress_override_percent: null, completed_at: null, external_work_item_id: "ignored" });
  assert.deepEqual(last().args, ["/company-projects/7/work-items/10", {
    company_project_phase_id: null, parent_work_item_id: null, completed_at: null, progress_override_percent: null,
  }]);
});

test("children preserve parent and privacy-filtered relationships including an external dependency endpoint", async () => {
  const child = { ...work(11, 10), rollup: { child_count: 1, rollup_progress_percent: 35 } };
  response = { parent: work(10), items: [child], departments: [{ company_project_work_department_id: 4, company_project_work_item_id: 11, department_id: 8 }],
    assignments: [{ company_project_work_assignment_id: 20, company_project_work_item_id: 11, assignee_company_member_id: 0 }],
    dependencies: [{ company_project_work_dependency_id: 5, predecessor_work_item_id: 99, successor_work_item_id: 11 }] };
  const result = await api.listCompanyProjectWorkItemChildren(7, 10, { depth: 1 });
  assert.deepEqual(result.data, response);
  assert.deepEqual(last().args[1].params, { depth: 1 });
  response = { ...response, parent: work(12) };
  await assert.rejects(api.listCompanyProjectWorkItemChildren(7, 10), /하위 업무 응답 형식/);
});

test("Gantt preserves its response without requiring a project object and sends explicit depth five", async () => {
  response = { gantt_policy: { scale: "small", mode: "full", max_depth: 5, full_load_allowed: true }, phases: [], items: [work(10)], dependencies: [] };
  const signal = new AbortController().signal;
  const result = await api.getCompanyProjectGantt(7, { mode: "full", max_depth: 5 }, { signal });
  assert.deepEqual(result.data, response);
  assert.equal(Object.hasOwn(result.data, "project"), false);
  assert.deepEqual(last().args[1].params, { mode: "full", max_depth: 5 });
  assert.equal(last().args[1].signal, signal);
});

test("Gantt distinguishes an explicit empty response from missing or malformed required data", async () => {
  const empty = { gantt_policy: { scale: "small", mode: "auto", max_depth: 2, full_load_allowed: true }, phases: [], items: [], dependencies: [] };
  response = empty;
  assert.deepEqual((await api.getCompanyProjectGantt(7)).data, empty);
  for (const field of ["gantt_policy", "phases", "items", "dependencies"]) {
    for (const value of [undefined, null, "invalid", {}]) {
      response = { ...empty, [field]: value };
      await assert.rejects(api.getCompanyProjectGantt(7), /간트 응답 형식/, `${field}: ${String(value)}`);
    }
  }
  for (const policy of [
    { ...empty.gantt_policy, scale: "invalid" }, { ...empty.gantt_policy, mode: "invalid" },
    { ...empty.gantt_policy, max_depth: 0 }, { ...empty.gantt_policy, max_depth: 6 },
    { ...empty.gantt_policy, max_depth: "2" }, { ...empty.gantt_policy, full_load_allowed: undefined },
  ]) {
    response = { ...empty, gantt_policy: policy };
    await assert.rejects(api.getCompanyProjectGantt(7), /간트 응답 형식/);
  }
});

test("Gantt rejects invalid and duplicate IDs or explicit foreign project rows without requiring missing ancestors", async () => {
  const valid = { gantt_policy: { scale: "medium", mode: "summary", max_depth: 2, full_load_allowed: false },
    phases: [{ company_project_phase_id: 4, company_project_id: 7, name: "Planning" }], items: [work(11, 10)], dependencies: [] };
  response = valid;
  assert.deepEqual((await api.getCompanyProjectGantt(7)).data.items, [work(11, 10)]);
  for (const patch of [
    { phases: [{ ...valid.phases[0], company_project_phase_id: 0 }] },
    { phases: [{ ...valid.phases[0], company_project_id: 8 }] },
    { phases: [valid.phases[0], valid.phases[0]] },
    { items: [{ ...work(11), company_project_work_item_id: undefined }] },
    { items: [{ ...work(11), company_project_work_item_id: "11" }] },
    { items: [{ ...work(11), company_project_id: 8 }] },
    { items: [{ ...work(11), depth_level: 6 }] },
    { items: [work(11), work(11)] },
    { dependencies: [{}] },
    { dependencies: [{ company_project_work_dependency_id: 5, predecessor_work_item_id: 11, successor_work_item_id: 0 }] },
  ]) {
    response = { ...valid, ...patch };
    await assert.rejects(api.getCompanyProjectGantt(7), /간트 응답 형식/);
  }
});

test("Gantt hook waits for activation, forwards cancellation and keeps requested mode and depth", async () => {
  const before = calls.length;
  assert.equal(hooks.useCompanyProjectGantt(7, {}, { enabled: false }).enabled, false);
  assert.equal(hooks.useCompanyProjectGantt(null).enabled, false);
  assert.equal(calls.length, before);
  response = { gantt_policy: { scale: "small", mode: "auto", max_depth: 2, full_load_allowed: true }, phases: [], items: [], dependencies: [] };
  for (const query of [{ mode: "auto", max_depth: 2 }, { mode: "full", max_depth: 5 }]) {
    const signal = new AbortController().signal;
    const options = hooks.useCompanyProjectGantt(7, query);
    assert.equal(options.enabled, true);
    assert.equal(options.placeholderData, undefined);
    await options.queryFn({ signal });
    assert.equal(last().args[1].signal, signal);
    assert.deepEqual(last().args[1].params, query);
  }
});

test("Gantt query observers discard a cancelled project's late response and never reuse another project's rows", async () => {
  const { QueryClient, QueryObserver } = require("@tanstack/react-query");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const pending = new Map();
  responseForCall = (_method, args) => new Promise((resolve) => pending.set(args[0], { resolve, signal: args[1].signal }));
  const observer = new QueryObserver(queryClient, hooks.useCompanyProjectGantt(7, { mode: "full", max_depth: 5 }));
  const unsubscribe = observer.subscribe(() => {});
  const data = (id) => ({ gantt_policy: { scale: "small", mode: "full", max_depth: 5, full_load_allowed: true },
    phases: [], items: [{ ...work(id), company_project_id: id }], dependencies: [] });
  try {
    assert.equal(pending.has("/company-projects/7/gantt"), true);
    observer.setOptions(hooks.useCompanyProjectGantt(8, { mode: "full", max_depth: 5 }));
    assert.equal(pending.get("/company-projects/7/gantt").signal.aborted, true);
    assert.equal(observer.getCurrentResult().data, undefined);
    pending.get("/company-projects/7/gantt").resolve(data(7));
    pending.get("/company-projects/8/gantt").resolve(data(8));
    await queryClient.fetchQuery(hooks.useCompanyProjectGantt(8, { mode: "full", max_depth: 5 }));
    assert.equal(observer.getCurrentResult().data.items[0].company_project_id, 8);
    observer.setOptions(hooks.useCompanyProjectGantt(9, { mode: "full", max_depth: 5 }));
    assert.equal(observer.getCurrentResult().data, undefined);
    pending.get("/company-projects/9/gantt").resolve(data(9));
    await queryClient.fetchQuery(hooks.useCompanyProjectGantt(9, { mode: "full", max_depth: 5 }));
    assert.equal(observer.getCurrentResult().data.items[0].company_project_id, 9);
  } finally {
    responseForCall = undefined;
    unsubscribe();
    observer.destroy();
    queryClient.clear();
  }
});

test("management assignment route allows replacement while self PATCH strips identity and normalizes UTC", async () => {
  response = { assignment: { company_project_work_assignment_id: 20 } };
  await api.updateManagedCompanyProjectAssignment(7, 10, 20, { assignee_company_member_id: 9, department_id: null,
    starts_at: "2026-10-12T12:00:00+09:00", external_assignment_id: "ignored" });
  assert.deepEqual(last().args, ["/company-projects/7/work-items/10/assignments/20", {
    assignee_company_member_id: 9, department_id: null, starts_at: "2026-10-12T03:00:00.000Z",
  }]);
  await api.updateCompanyProjectWorkAssignment(20, { status: "done", completed_at: "2026-10-12T12:00:00+09:00", assignee_company_member_id: 9 });
  assert.deepEqual(last().args, ["/company-projects/work-assignments/20", { status: "done", completed_at: "2026-10-12T03:00:00.000Z" }]);
});

test("department replacement sends an empty list and dependency DELETE has no body or guessed update route", async () => {
  response = { departments: [] };
  await api.replaceCompanyProjectWorkDepartments(7, 10, []);
  assert.deepEqual(last(), { method: "put", args: ["/company-projects/7/work-items/10/departments", { department_ids: [] }] });
  response = {};
  await api.deleteCompanyProjectDependency(7, 5);
  assert.deepEqual(last(), { method: "delete", args: ["/company-projects/7/dependencies/5"] });
  const start = calls.length;
  rejection = { response: { status: 400, data: { error: { code: "PROJECT_DEPENDENCY_CYCLE" } } } };
  try { await assert.rejects(api.createCompanyProjectDependency(7, { predecessor_work_item_id: 10, successor_work_item_id: 11 }), (error) => error === rejection); }
  finally { rejection = undefined; }
  assert.equal(calls.length, start + 1);
});

test("work mutation failures still refresh project, home, calendar and briefing caches", async () => {
  for (const mutation of [hooks.useCreateCompanyProjectPhase(), hooks.useUpdateCompanyProjectPhase(),
    hooks.useCreateCompanyProjectWorkItem(), hooks.useUpdateCompanyProjectWorkItem(), hooks.useUpdateCompanyProjectWorkAssignment()]) {
    invalidations.length = 0;
    await mutation.onSettled(undefined, new Error("response lost"));
    for (const key of [["company-projects"], ["company-schedules"], ["home", "today"], ["briefings", "today"]])
      assert.ok(invalidations.some((value) => JSON.stringify(value) === JSON.stringify(key)), `missing ${key}`);
  }
});

test("work saves cancel an initial Gantt read and refetch before accepting a late pre-save response", async () => {
  const { QueryClient, QueryObserver } = require("@tanstack/react-query");
  for (const error of [undefined, new Error("response lost after saving")]) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    queryClientOverride = queryClient;
    let release;
    let initialSignal;
    let reads = 0;
    const data = (title) => ({ gantt_policy: { scale: "small", mode: "full", max_depth: 5, full_load_allowed: true },
      phases: [], items: [{ ...work(10), title }], dependencies: [] });
    responseForCall = (_method, args) => {
      reads += 1;
      if (reads === 1) {
        initialSignal = args[1].signal;
        return new Promise((resolve) => { release = resolve; });
      }
      return data("Saved title");
    };
    const options = hooks.useCompanyProjectGantt(7, { mode: "full", max_depth: 5 });
    const observer = new QueryObserver(queryClient, options);
    const unsubscribe = observer.subscribe(() => {});
    try {
      assert.equal(reads, 1);
      assert.equal(observer.getCurrentResult().data, undefined);
      const settled = hooks.useUpdateCompanyProjectWorkItem().onSettled(undefined, error);
      // The old HTTP response may arrive after the server processed the write.
      release(data("Pre-save title"));
      await settled;
      assert.equal(initialSignal.aborted, true);
      assert.equal(reads, 2);
      assert.equal(observer.getCurrentResult().data.items[0].title, "Saved title");
      assert.equal(queryClient.getQueryState(options.queryKey).isInvalidated, false);
    } finally {
      responseForCall = undefined;
      queryClientOverride = undefined;
      unsubscribe();
      observer.destroy();
      queryClient.clear();
    }
  }
});
