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
} = module.exports;

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
  assert.deepEqual(tree.rootIds, [9, 10, 8, 11, 12]);
  assert.equal(tree.nodes.size, 5);
  assert.equal(tree.warnings.filter((warning) => warning.type === "duplicate-id").length, 1);
  assert.equal(getWorkItemUiDepth(tree, 11), null);
  assert.equal(getWorkItemUiDepth(tree, 12), null);
  assert.equal(getWorkItemUiDepth(tree, 404), null);
});
