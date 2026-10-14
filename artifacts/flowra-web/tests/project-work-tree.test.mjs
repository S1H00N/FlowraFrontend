import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/projectWorkTree.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(require, module, module.exports);
const {
  buildProjectWorkTree,
  getWorkItemAncestorPath,
  getWorkItemDepthInfo,
  getWorkItemUiDepth,
  mergeProjectWorkItems,
  getProjectWorkParentError,
} = module.exports;
const hierarchyModule = { exports: {} };
new Function("require", "module", "exports", ts.transpileModule(
  readFileSync(new URL("../src/lib/projectHierarchy.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText)((name) => name === "./projectWorkTree" ? module.exports : require(name), hierarchyModule, hierarchyModule.exports);
const { buildProjectHierarchy, getCompleteProjectSiblingSets, getProjectWorkSearchScope, projectHierarchyTitle } = hierarchyModule.exports;
const fullPolicy = { mode: "full", max_depth: 5 };
const summaryPolicy = { mode: "summary", max_depth: 2 };
function hierarchy(items, phases = [], policy = fullPolicy, loaded = [], phased = true) {
  const graph = buildProjectWorkTree(items, 7);
  return buildProjectHierarchy(graph, phases, phased, getCompleteProjectSiblingSets(graph, policy, loaded));
}
function phase(id, sort_order) {
  return { company_project_phase_id: id, name: `Phase ${id}`, sort_order };
}

function item(id, parent = null, extra = {}) {
  return {
    company_project_work_item_id: id,
    company_project_id: 7,
    parent_work_item_id: parent,
    title: `Work ${id}`,
    status: "todo",
    ...extra,
  };
}

test("location parents reject cycles, foreign rows and known subtree depth overflow", () => {
  const tree = buildProjectWorkTree([
    item(1), item(2, 1), item(3, 2), item(4, 3), item(5, 4),
    item(6), item(7, 6), item(8, null, { company_project_id: 8 }),
    item(9, 999, { depth_level: 4 }), item(10, 999),
  ], 7);
  assert.equal(getProjectWorkParentError(tree, 4), null);
  assert.match(getProjectWorkParentError(tree, 5), /5단계/);
  assert.match(getProjectWorkParentError(tree, 1, 1), /자기 자신/);
  assert.match(getProjectWorkParentError(tree, 4, 1), /하위 업무/);
  assert.equal(getProjectWorkParentError(tree, 3, 6), null);
  assert.match(getProjectWorkParentError(tree, 4, 6), /5단계/);
  assert.match(getProjectWorkParentError(tree, 8), /확인/);
  assert.equal(getProjectWorkParentError(tree, 9), null);
  assert.match(getProjectWorkParentError(tree, 10), /깊이/);
});

test("UI depth includes the project, excludes Phase, and supports five backend work levels", () => {
  const tree = buildProjectWorkTree([
    item(1, null, { company_project_phase_id: 11, depth_level: 0 }),
    item(2, 1, { company_project_phase_id: 11, depth_level: 1 }),
    item(3, 2, { company_project_phase_id: 11, depth_level: 2 }),
    item(4, 3, { company_project_phase_id: 11, depth_level: 3 }),
    item(5, null, { depth_level: 1 }),
    item(6, 4, { depth_level: 5 }),
  ], 7);
  assert.equal(getWorkItemUiDepth(tree, 1), 2);
  assert.equal(getWorkItemUiDepth(tree, 4), 5);
  assert.equal(getWorkItemUiDepth(tree, 5), 2);
  assert.equal(getWorkItemUiDepth(tree, 6), 6);
  assert.equal(getWorkItemDepthInfo(tree, 6).workItemDepth, 5);
  assert.equal(getWorkItemDepthInfo(tree, 1).backendDepthLevel, null);
  assert.deepEqual(getWorkItemDepthInfo(tree, 4), {
    uiDepth: 5,
    workItemDepth: 4,
    backendDepthLevel: 3,
    ancestryComplete: true,
  });
  assert.deepEqual(getWorkItemAncestorPath(tree, 4).map((entry) => entry.company_project_work_item_id), [1, 2, 3, 4]);
});

test("a lazy response with a missing ancestor stays visible without claiming a valid creation depth", () => {
  const initial = [item(2, 1), item(3, 2)];
  const partial = buildProjectWorkTree(initial, 7);
  assert.deepEqual(partial.rootIds, [2]);
  assert.equal(partial.nodes.get(2).sourceParentId, 1);
  assert.equal(getWorkItemUiDepth(partial, 2), null);
  assert.equal(getWorkItemUiDepth(partial, 3), null);
  assert.equal(partial.warnings.some((warning) => warning.type === "missing-parent"), true);

  const complete = buildProjectWorkTree(mergeProjectWorkItems(initial, [item(1)], 7), 7);
  assert.deepEqual(complete.rootIds, [1]);
  assert.equal(getWorkItemUiDepth(complete, 3), 4);
});

test("cyclic and self-parent graphs remain traversable and cannot claim a complete hierarchy", () => {
  const tree = buildProjectWorkTree([item(2, 1), item(1, 2), item(3, 2), item(4, 4)], 7);
  assert.deepEqual(tree.rootIds, [1, 4]);
  assert.deepEqual(tree.childrenByParent.get(1), [2]);
  assert.deepEqual(tree.childrenByParent.get(2), [3]);
  assert.deepEqual(getWorkItemAncestorPath(tree, 3).map((entry) => entry.company_project_work_item_id), [1, 2, 3]);
  assert.equal(getWorkItemUiDepth(tree, 3), null);
  assert.equal(getWorkItemUiDepth(tree, 4), null);
  assert.equal(tree.warnings.filter((warning) => warning.type === "cycle").length, 2);
});

test("route-scoped merging deduplicates child results and excludes conflicting project IDs", () => {
  const merged = mergeProjectWorkItems(
    [item(1), item(2, 1)],
    [item(2, 1, { title: "Updated" }), item(3, 2), item(4, null, { company_project_id: undefined }), item(9, null, { company_project_id: 99 })],
    7,
  );
  assert.equal(merged.length, 4);
  assert.equal(merged.find((entry) => entry.company_project_work_item_id === 2).title, "Updated");
  assert.equal(merged.some((entry) => entry.company_project_work_item_id === 9), false);
  const tree = buildProjectWorkTree([...merged, item(9, null, { company_project_id: 99 }), item(0)], 7);
  assert.deepEqual(tree.rootIds, [1, 4]);
  assert.equal(tree.warnings.some((warning) => warning.type === "foreign-project"), true);
  assert.equal(tree.warnings.some((warning) => warning.type === "invalid-id"), true);
});

test("stable sibling sorting honors sort_order and malformed parents do not become verified roots", () => {
  const tree = buildProjectWorkTree([
    item(8, null, { sort_order: 20 }),
    item(9, null, { sort_order: 1 }),
    item(10, null, { sort_order: 3 }),
    item(9, null, { sort_order: 3 }),
    item(11, 0),
    item(12, -1),
  ], 7);
  assert.deepEqual(tree.rootIds, [11, 12, 9, 10, 8]);
  assert.equal(tree.nodes.size, 5);
  assert.equal(tree.warnings.filter((warning) => warning.type === "duplicate-id").length, 1);
  assert.equal(getWorkItemUiDepth(tree, 11), null);
  assert.equal(getWorkItemUiDepth(tree, 12), null);
  assert.equal(getWorkItemUiDepth(tree, 404), null);
});

test("WBS shares Phase/Work order, distinguishes resource keys, and preserves server fields", () => {
  const items = [item(1, null, { company_project_phase_id: 1, wbs_code: "SAVED", sort_order: -2 }),
    item(2, null, { company_project_phase_id: 1, sort_order: null }),
    item(3, null, { company_project_phase_id: 1 }), item(4, null, { company_project_phase_id: 1, sort_order: 0 }),
    item(5, null, { sort_order: -1 }), item(6), item(7, 5)];
  const original = structuredClone(items);
  const model = hierarchy(items, [phase(3, null), phase(2), phase(1, -1), phase(4, 0)]);
  assert.deepEqual(model.phases.map((p) => p.company_project_phase_id), [1, 2, 3, 4]);
  assert.equal(model.wbsByKey.get("phase:1"), "1");
  assert.equal(model.wbsByKey.get("work:1"), "1.1");
  assert.equal(model.wbsByKey.get("work:4"), "1.4");
  assert.equal(model.wbsByKey.get("work:5"), "5");
  assert.equal(model.wbsByKey.get("work:6"), "6");
  assert.equal(model.wbsByKey.get("work:7"), "5.1");
  assert.equal(model.wbsByKey.has("group:unassigned"), false);
  assert.deepEqual(items, original);
});

test("no phases and five work levels use root numbers, including cancelled siblings", () => {
  const items = [item(1, null, { status: "cancelled" }), item(2), item(3, 2), item(4, 3), item(5, 4), item(6, 5)];
  for (const phased of [true, false]) {
    const model = hierarchy(items, [], fullPolicy, [], phased);
    assert.equal(model.wbsByKey.get("work:2"), "2");
    assert.equal(model.wbsByKey.get("work:6"), "2.1.1.1.1");
    const filtered = items.filter((entry) => entry.status !== "cancelled");
    assert.deepEqual(filtered.map((entry) => model.wbsByKey.get(`work:${entry.company_project_work_item_id}`)),
      ["2", "2.1", "2.1.1", "2.1.1.1", "2.1.1.1.1"]);
  }
});

test("cross-phase descendants keep the root display group and are visited exactly once", () => {
  const model = hierarchy([item(1, null, { company_project_phase_id: 10 }),
    item(2, 1, { company_project_phase_id: 20 }), item(3, 2, { company_project_phase_id: null })],
  [phase(10, 0), phase(20, 0)]);
  assert.deepEqual(model.groups.map((group) => group.rootIds), [[1], [], []]);
  assert.equal(model.wbsByKey.get("work:3"), "1.1.1.1");
  assert.equal(model.parentByKey.get("work:2"), "work:1");
  assert.equal(model.displayPhaseByWorkId.get(2).company_project_phase_id, 10);
  assert.equal([...model.wbsByKey.keys()].filter((key) => key.startsWith("work:")).length, 3);
});

test("summary and successful direct sibling sets keep established WBS stable during lazy exploration", () => {
  const base = [item(1), item(2), item(3, 1, { rollup: { child_count: 0 } }), item(4, 1)];
  const initial = hierarchy(base, [], summaryPolicy);
  const deeper = [...base, item(9, 3), item(8, 3), item(10, 8)];
  const unverified = hierarchy(deeper, [], summaryPolicy);
  assert.equal(unverified.wbsByKey.has("work:8"), false);
  const loaded = hierarchy(deeper, [], summaryPolicy, [3]);
  for (const [key, number] of initial.wbsByKey) assert.equal(loaded.wbsByKey.get(key), number);
  assert.equal(loaded.wbsByKey.get("work:8"), "1.1.1");
  assert.equal(loaded.wbsByKey.get("work:9"), "1.1.2");
  assert.equal(loaded.wbsByKey.has("work:10"), false);
  const graph = buildProjectWorkTree(base, 7);
  assert.equal(getCompleteProjectSiblingSets(graph, summaryPolicy, []).has(3), false);
  assert.equal(getCompleteProjectSiblingSets(graph, summaryPolicy, [3]).has(3), true);
});

test("unknown policy and malformed ancestry never invent root or descendant WBS", () => {
  const items = [item(1), item(2, 1)];
  assert.deepEqual([...getCompleteProjectSiblingSets(buildProjectWorkTree(items, 7), undefined, [1])], [1]);
  for (const policy of [null, { mode: "summary", max_depth: 5 }]) {
    assert.equal(hierarchy(items, [], policy, [1]).wbsByKey.size, 0);
  }
  for (const invalid of [[item(2, 404)], [item(1, 2), item(2, 1)], [item(1, -1)], [item(1), item(1)]]) {
    assert.equal(hierarchy(invalid).wbsByKey.size, 0);
  }
  assert.equal(hierarchy([item(1, null, { company_project_phase_id: 404 })]).wbsByKey.size, 0);
});

test("global search requires verified roots and every branch, independently of counts and rollup hints", () => {
  const graph = buildProjectWorkTree([item(1), item(2, 1, { rollup: { child_count: 0 } })], 7);
  const initial = getCompleteProjectSiblingSets(graph, summaryPolicy, []);
  assert.equal(getProjectWorkSearchScope(graph, initial, 2), "loaded");
  assert.equal(getProjectWorkSearchScope(graph, getCompleteProjectSiblingSets(graph, undefined, [1, 2]), 2), "loaded");
  assert.equal(getProjectWorkSearchScope(graph, getCompleteProjectSiblingSets(graph, { mode: "full", max_depth: 2 }, [1, 2]), 2), "loaded");

  // A successful direct response verifies an empty branch, even with stale hints.
  const staleHint = buildProjectWorkTree([item(1), item(2, 1, { rollup: { child_count: 9 } })], 7);
  const explored = getCompleteProjectSiblingSets(staleHint, summaryPolicy, [2]);
  assert.equal(getProjectWorkSearchScope(staleHint, explored, 2), "complete");
  assert.equal(getProjectWorkSearchScope(staleHint, explored, 3), "loaded");
});

test("newly discovered descendants keep search scoped until their own direct branch is verified", () => {
  const graph = buildProjectWorkTree([item(1), item(2, 1), item(3, 2)], 7);
  assert.equal(getProjectWorkSearchScope(graph, getCompleteProjectSiblingSets(graph, summaryPolicy, [2]), 3), "loaded");
  assert.equal(getProjectWorkSearchScope(graph, getCompleteProjectSiblingSets(graph, summaryPolicy, [2, 3]), 3), "complete");
});

test("full search preserves cancelled work and accepts empty projects only with consistent totals", () => {
  for (const items of [[], [item(1), item(2, 1, { status: "cancelled" })]]) {
    const graph = buildProjectWorkTree(items, 7);
    const complete = getCompleteProjectSiblingSets(graph, fullPolicy, []);
    assert.equal(getProjectWorkSearchScope(graph, complete), "complete");
    assert.equal(getProjectWorkSearchScope(graph, complete, items.length), "complete");
    for (const count of [items.length + 1, -1, Number.NaN])
      assert.equal(getProjectWorkSearchScope(graph, complete, count), "loaded");
  }
});

test("detail policy must report the original returned count even when the global summary is absent", () => {
  const items = [item(1), item(2, 1)];
  const graph = buildProjectWorkTree(items, 7);
  const complete = getCompleteProjectSiblingSets(graph, fullPolicy, []);
  const snapshot = (returnedCount) => ({ work_items: items,
    detail_policy: { ...fullPolicy, returned_work_item_count: returnedCount } });
  assert.equal(getProjectWorkSearchScope(graph, complete, undefined, snapshot(2)), "complete");
  for (const count of [undefined, null, -1, 1, 3, "2", Number.NaN, 1.5])
    assert.equal(getProjectWorkSearchScope(graph, complete, undefined, snapshot(count)), "loaded");
  assert.equal(getProjectWorkSearchScope(graph, complete, undefined, { work_items: items }), "loaded");

  const empty = buildProjectWorkTree([], 7);
  assert.equal(getProjectWorkSearchScope(empty, getCompleteProjectSiblingSets(empty, fullPolicy, []), undefined,
    { work_items: [], detail_policy: { ...fullPolicy, returned_work_item_count: 0 } }), "complete");
});

test("lazy search checks detail returned count against its original payload rather than the merged graph", () => {
  const initial = [item(1), item(2, 1)];
  const graph = buildProjectWorkTree([...initial, item(3, 2)], 7);
  const complete = getCompleteProjectSiblingSets(graph, summaryPolicy, [2, 3]);
  const snapshot = { work_items: initial, detail_policy: { ...summaryPolicy, returned_work_item_count: 2 } };
  assert.equal(getProjectWorkSearchScope(graph, complete, 3, snapshot), "complete");
  assert.equal(getProjectWorkSearchScope(graph, complete, 3,
    { ...snapshot, detail_policy: { ...summaryPolicy, returned_work_item_count: 3 } }), "loaded");
});

test("missing parents and cyclic or malformed rows are hierarchy errors even under a full policy", () => {
  for (const items of [[item(2, 404)], [item(1, 2), item(2, 1)],
    [item(1, -1)], [item(1), item(1)], [item(0)], [item(1, null, { company_project_id: 8 })]]) {
    const graph = buildProjectWorkTree(items, 7);
    assert.equal(getProjectWorkSearchScope(graph, getCompleteProjectSiblingSets(graph, fullPolicy, []), items.length), "invalid");
    assert.equal(getProjectWorkSearchScope(graph, new Set([null, ...graph.nodes.keys()])), "invalid");
    assert.equal(getProjectWorkSearchScope(graph, new Set([null, ...graph.nodes.keys()]), undefined,
      { work_items: items, detail_policy: fullPolicy }), "invalid");
  }
});

test("real creation, movement, order changes renumber while cancellation does not", () => {
  const items = [item(1), item(2), item(3, 1)];
  assert.equal(hierarchy(items).wbsByKey.get("work:2"), "2");
  assert.equal(hierarchy([...items, item(4, null, { sort_order: -1 })]).wbsByKey.get("work:2"), "3");
  assert.equal(hierarchy([item(1, null, { sort_order: 5 }), item(2), item(3, 2)]).wbsByKey.get("work:3"), "1.1");
  assert.deepEqual(hierarchy(items.map((entry) => ({ ...entry, status: "cancelled" }))).wbsByKey,
    hierarchy(items).wbsByKey);
});

test("hierarchy titles avoid identical prefixes and preserve intentional title numbers", () => {
  assert.equal(projectHierarchyTitle("1.1. API 개발", "1.1"), "1.1. API 개발");
  assert.equal(projectHierarchyTitle("1.1 API 개발", "1.1"), "1.1 API 개발");
  assert.equal(projectHierarchyTitle("1.10 API 개발", "1.1"), "1.1. 1.10 API 개발");
  assert.equal(projectHierarchyTitle("2026년 개발", "1"), "1. 2026년 개발");
  assert.equal(projectHierarchyTitle("API 개발", undefined), "API 개발");
});
