import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const loaded = new Map();
function load(name) {
  if (loaded.has(name)) return loaded.get(name);
  const module = { exports: {} };
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", compiled)(
    (request) => request.startsWith("./") ? load(request.slice(2)) : require(request), module, module.exports,
  );
  loaded.set(name, module.exports);
  return module.exports;
}
const { buildProjectWorkTree } = load("projectWorkTree");
const { buildProjectHierarchy } = load("projectHierarchy");
const { emptyProjectGanttFilters, filterProjectGanttItems, getProjectGanttAssignmentState } = load("projectGanttFilters");
const item = (id, extra = {}) => ({
  company_project_work_item_id: id, company_project_id: 7, title: `Work ${id}`, status: "todo", ...extra,
});
const assignment = (id, memberId, status = "todo") => ({
  assignment_id: id, assignee_company_member_id: memberId, status,
});
const phase = (id) => ({ company_project_phase_id: id, name: `Phase ${id}` });
function setup(items, options = {}) {
  const graph = buildProjectWorkTree(items, 7);
  const hierarchy = buildProjectHierarchy(graph, options.phases ?? [], options.phased ?? true,
    new Set([null, ...graph.nodes.keys()]));
  return {
    graph, hierarchy,
    filter: (filters = {}) => filterProjectGanttItems(graph, hierarchy, { ...emptyProjectGanttFilters, ...filters },
      options.assignments ?? new Map(), options.known ?? new Set(), options.phased ?? true),
  };
}
const ids = (values) => [...values].sort((a, b) => a - b);

test("Gantt filters apply search, status and priority as AND conditions", () => {
  const { filter } = setup([
    item(1, { title: "Search design", status: "in_progress", priority: "high" }),
    item(2, { title: "Search review", status: "todo", priority: "high" }),
    item(3, { title: "Search delivery", status: "in_progress", priority: "low" }),
    item(4, { title: "Other", status: "in_progress", priority: "high" }),
  ]);
  assert.deepEqual(ids(filter({ status: "in_progress" }).matchingIds), [1, 3, 4]);
  assert.deepEqual(ids(filter({ priority: "high" }).matchingIds), [1, 2, 4]);
  const result = filter({ search: "  SEARCH  ", status: "in_progress", priority: "high" });
  assert.deepEqual(ids(result.matchingIds), [1]);
  assert.deepEqual(ids(result.includedIds), [1]);
});

test("matching descendants preserve available ancestors without counting them as matches", () => {
  const { filter } = setup([
    item(1, { status: "done" }),
    item(2, { parent_work_item_id: 1, status: "done" }),
    item(3, { parent_work_item_id: 2, title: "Target", status: "in_progress" }),
    item(4, { parent_work_item_id: 1, title: "Sibling" }),
  ]);
  const result = filter({ search: "target", status: "in_progress" });
  assert.deepEqual(ids(result.matchingIds), [3]);
  assert.deepEqual(ids(result.includedIds), [1, 2, 3]);
});

test("Phase filtering follows the existing WBS group without rewriting independent Phase fields", () => {
  const items = [
    item(1, { company_project_phase_id: 10 }),
    item(2, { company_project_phase_id: 20, parent_work_item_id: 1 }),
    item(3, { company_project_phase_id: 20 }),
  ];
  const before = structuredClone(items);
  const { filter } = setup(items, { phases: [phase(10), phase(20)] });
  assert.deepEqual(ids(filter({ phase: "10" }).matchingIds), [1, 2]);
  assert.deepEqual(ids(filter({ phase: "20" }).matchingIds), [3]);
  assert.deepEqual(items, before);
});

test("unassigned Phase groups remain selectable and Phase-less projects ignore Phase state", () => {
  const items = [item(1), item(2, { company_project_phase_id: 10 })];
  const phased = setup(items, { phases: [phase(10)] });
  assert.deepEqual(ids(phased.filter({ phase: "none" }).matchingIds), [1]);
  const phaseLess = setup(items, { phased: false });
  const result = phaseLess.filter({ phase: "10" });
  assert.equal(result.filtering, false);
  assert.equal(result.includedIds, null);
  assert.deepEqual(ids(result.matchingIds), [1, 2]);
});

test("person filters use only known assignment coverage, excluding cancelled and masked IDs", () => {
  const { filter } = setup([item(1), item(2), item(3), item(4), item(5)], {
    assignments: new Map([
      [1, [assignment(1, 301)]], [2, [assignment(2, 301)]],
      [3, [assignment(3, 301, "cancelled")]], [4, [assignment(4, 0)]],
    ]),
    known: new Set([1, 3, 4, 5]),
  });
  assert.deepEqual(ids(filter({ assignee: "301" }).matchingIds), [1]);
  assert.deepEqual(ids(filter({ assignee: "0" }).matchingIds), []);
});

test("unassigned means a complete relationship snapshot with no active rows", () => {
  const { filter } = setup([item(1), item(2), item(3), item(4), item(5), item(6)], {
    assignments: new Map([
      [2, [assignment(2, 301, "cancelled")]], [3, [assignment(3, 0)]],
      [4, [assignment(4, null)]], [5, [assignment(5, 302)]],
    ]),
    known: new Set([1, 2, 3, 4, 5]),
  });
  assert.deepEqual(ids(filter({ unassignedOnly: true }).matchingIds), [1, 2]);
  assert.deepEqual(ids(filter({ assignee: "302", unassignedOnly: true }).matchingIds), []);
});

test("assignment coverage is reported separately from all loaded Gantt work items", () => {
  const { filter } = setup([item(1), item(2), item(3), item(4)], {
    assignments: new Map([[2, [assignment(2, 301)]], [99, [assignment(99, 301)]]]),
    known: new Set([1, 99]),
  });
  assert.deepEqual(filter().assignmentCoverage, {
    knownCount: 1, partialCount: 1, unqueriedCount: 2, totalCount: 4, complete: false,
  });
  assert.deepEqual(ids(filter().matchingIds), [1, 2, 3, 4]);
});

test("assignment states distinguish complete, partial, unqueried, private and active records", () => {
  assert.equal(getProjectGanttAssignmentState([], false).coverage, "unqueried");
  assert.equal(getProjectGanttAssignmentState([], false).kind, "unknown");
  assert.equal(getProjectGanttAssignmentState([assignment(1, 301)], false).coverage, "partial");
  assert.equal(getProjectGanttAssignmentState([], true).kind, "unassigned");
  assert.equal(getProjectGanttAssignmentState([assignment(1, 301, "cancelled")], true).kind, "unassigned");
  const masked = getProjectGanttAssignmentState([assignment(1, 0), assignment(2, 0)], true);
  assert.equal(masked.coverage, "complete");
  assert.equal(masked.kind, "private");
  assert.equal(masked.privateCount, 2);
  const mixed = getProjectGanttAssignmentState([assignment(1, 0), assignment(2, 301), assignment(3, 301)], true);
  assert.equal(mixed.kind, "active");
  assert.equal(mixed.activeCount, 2);
  assert.equal(mixed.privateCount, 1);
});

test("filters reuse the unfiltered hierarchy and preserve WBS and source rows", () => {
  const source = [item(1), item(2), item(3, { parent_work_item_id: 1, title: "Target" })];
  const { graph, hierarchy, filter } = setup(source);
  const wbs = [...hierarchy.wbsByKey];
  const nodes = [...graph.nodes].map(([id, node]) => [id, structuredClone(node)]);
  assert.deepEqual(ids(filter({ search: "target" }).includedIds), [1, 3]);
  assert.deepEqual(ids(filter({ status: "done" }).matchingIds), []);
  assert.deepEqual([...hierarchy.wbsByKey], wbs);
  assert.deepEqual([...graph.nodes], nodes);
  assert.equal(filter().includedIds, null);
});

test("missing ancestors and duplicate source IDs never invent rows or duplicate matches", () => {
  const { filter } = setup([
    item(1, { parent_work_item_id: 999, title: "Target old" }),
    item(1, { parent_work_item_id: 999, title: "Target current" }),
    item(2, { title: "Target other" }),
  ]);
  const result = filter({ search: "target" });
  assert.deepEqual(ids(result.matchingIds), [1, 2]);
  assert.deepEqual(ids(result.includedIds), [1, 2]);
  assert.equal(result.assignmentCoverage.totalCount, 2);
});

test("shared ancestors and malformed parent cycles terminate and retain direct results", () => {
  const { filter } = setup([
    item(1, { parent_work_item_id: 2 }), item(2, { parent_work_item_id: 1 }),
    item(3, { parent_work_item_id: 2, title: "Target first" }),
    item(4, { parent_work_item_id: 2, title: "Target second" }),
  ]);
  const result = filter({ search: "target" });
  assert.deepEqual(ids(result.matchingIds), [3, 4]);
  assert.deepEqual(ids(result.includedIds), [1, 2, 3, 4]);
});

test("clearing all conditions restores normal expansion and does not change options", () => {
  const { filter } = setup([item(1), item(2, { parent_work_item_id: 1 })]);
  assert.equal(filter({ search: "absent", status: "done" }).includedIds.size, 0);
  const cleared = filter({ ...emptyProjectGanttFilters });
  assert.equal(cleared.filtering, false);
  assert.equal(cleared.includedIds, null);
  assert.deepEqual(ids(cleared.matchingIds), [1, 2]);
  assert.equal(emptyProjectGanttFilters.search, "");
});
