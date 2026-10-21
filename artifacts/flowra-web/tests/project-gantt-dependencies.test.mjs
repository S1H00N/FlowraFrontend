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
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", compiled)(
    (path) => path.startsWith("./") ? load(path.slice(2)) : require(path), module, module.exports,
  );
  loaded.set(name, module.exports);
  return module.exports;
}
const { createProjectGanttAxis, getProjectGanttPeriod } = load("projectGantt");
const { buildProjectGanttDependencies, projectGanttDependencyDescription, projectGanttDependencyLagLabel } = load("projectGanttDependencies");
const item = (id, start = "2026-12-30", end = "2026-12-31", extra = {}) => ({
  company_project_work_item_id: id, title: `업무 ${id}`, status: "todo", planned_start_date: start, planned_end_date: end, ...extra,
});
const dependency = (id, type = "finish_to_start", extra = {}) => ({
  company_project_work_dependency_id: id, predecessor_work_item_id: 1, successor_work_item_id: 2, dependency_type: type, lag_days: 0, ...extra,
});
const rows = (items) => items.map((item) => ({ kind: "work", item }));
const axis = createProjectGanttAxis("2026-12-25", "2027-01-10", "day");
const items = [item(1), item(2, "2027-01-02", "2027-01-05")];
const build = (dependencies, source = items, visible = rows(source), scale = axis) =>
  buildProjectGanttDependencies(dependencies, source, visible, scale);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`);

for (const [type, fromBoundary, toBoundary] of [
  ["finish_to_start", "end", "start"], ["start_to_start", "start", "start"],
  ["finish_to_finish", "end", "end"], ["start_to_finish", "start", "end"],
]) {
  test(`${type} uses the actual required DATE boundaries and inclusive end`, () => {
    const relation = build([dependency(1, type)])[0];
    assert.equal(relation.hiddenReason, null);
    const expected = (source, boundary) => boundary === "start"
      ? axis.dateToX(source.planned_start_date) : axis.positionToX({ date: source.planned_end_date, fraction: 1 });
    close(relation.geometry.from.x, expected(items[0], fromBoundary));
    close(relation.geometry.to.x, expected(items[1], toBoundary));
    assert.deepEqual([relation.geometry.from.y, relation.geometry.to.y], [23, 69]);
    assert.ok(relation.geometry.path.startsWith(`M ${relation.geometry.from.x} 23 H `));
    assert.ok(relation.geometry.path.endsWith(` H ${relation.geometry.to.x}`));
  });
}

test("lag_days retains positive, zero and negative server values without moving coordinates or plans", () => {
  const frozen = structuredClone(items);
  const relations = build([-7, 0, 5].map((lag_days, index) => dependency(index + 1, "finish_to_start", { lag_days })));
  for (const relation of relations) assert.deepEqual(relation.geometry, relations[0].geometry);
  assert.deepEqual(relations.map(({ dependency }) => dependency.lag_days), [-7, 0, 5]);
  assert.match(projectGanttDependencyDescription(relations[0]), /lag_days -7일/);
  assert.match(projectGanttDependencyDescription(relations[1]), /lag_days 0일/);
  assert.match(projectGanttDependencyDescription(relations[2]), /lag_days \+5일/);
  assert.deepEqual(items, frozen);
});

test("only the server dependency ID dedupes; distinct relation types between the same work items remain", () => {
  const source = [dependency(1), dependency(1), dependency(2, "start_to_start"), dependency(3)];
  assert.deepEqual(build(source).map(({ dependency }) => dependency.company_project_work_dependency_id), [1, 2, 3]);
  assert.equal(build(source).filter(({ geometry }) => geometry).length, 3);
});

test("actual visible row indexes include Phase rows and never substitute a collapsed parent endpoint", () => {
  const source = [items[0], { ...items[1], parent_work_item_id: 3 }, item(3)];
  const visible = [{ kind: "phase" }, { kind: "work", item: source[0] }, { kind: "phase" }, { kind: "work", item: source[1] }];
  const shown = build([dependency(1)], source, visible)[0];
  assert.deepEqual([shown.geometry.from.y, shown.geometry.to.y], [69, 161]);
  const hidden = build([dependency(1)], source, rows([source[0], source[2]]))[0];
  assert.equal(hidden.geometry, null);
  assert.equal(hidden.hiddenReason, "hidden-row");
  assert.equal(hidden.successor.company_project_work_item_id, 2);
});

test("filtered rows and out-of-query work remain readable relations with their distinct coverage reason", () => {
  const filtered = build([dependency(1)], items, rows([items[1]]))[0];
  assert.equal(filtered.hiddenReason, "hidden-row");
  assert.equal(filtered.geometry, null);
  assert.match(projectGanttDependencyDescription(filtered), /접힘 또는 필터/);
  const outside = build([dependency(1, "finish_to_start", { successor_work_item_id: 999 })])[0];
  assert.equal(outside.hiddenReason, "outside-query");
  assert.equal(outside.geometry, null);
  assert.match(projectGanttDependencyDescription(outside), /업무 #999/);
  assert.match(projectGanttDependencyDescription(outside), /조회 범위/);
});

test("partial dates allow only the actual endpoints needed by each relation type", () => {
  const scenarios = [
    { source: [item(1, "2026-12-30", null), item(2, "2027-01-02", null)], allowed: ["start_to_start"] },
    { source: [item(1, null, "2026-12-31"), item(2, null, "2027-01-05")], allowed: ["finish_to_finish"] },
    { source: [item(1, null, "2026-12-31"), item(2, "2027-01-02", null)], allowed: ["finish_to_start"] },
    { source: [item(1, "2026-12-30", null), item(2, null, "2027-01-05")], allowed: ["start_to_finish"] },
    { source: [item(1, null, null), items[1]], allowed: [] },
  ];
  for (const { source, allowed } of scenarios) {
    for (const type of ["finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish"]) {
      const relation = build([dependency(1, type)], source)[0];
      assert.equal(Boolean(relation.geometry), allowed.includes(type), type);
      assert.equal(relation.hiddenReason, allowed.includes(type) ? null : "missing-date");
    }
  }
});

test("invalid periods or unknown dependency types preserve textual relationships without fabricated paths", () => {
  for (const invalid of [item(1, "bad", "2026-12-31"), item(1, "2027-01-01", "2026-12-31"), item(1, null, "2026-02-29")]) {
    const relation = build([dependency(1)], [invalid, items[1]])[0];
    assert.equal(relation.hiddenReason, "invalid-date");
    assert.equal(relation.geometry, null);
  }
  for (const type of ["future_contract_type", "constructor", "__proto__"]) {
    const relation = build([dependency(1, type)])[0];
    assert.equal(relation.hiddenReason, "unknown-type");
    assert.equal(relation.geometry, null);
    assert.ok(projectGanttDependencyDescription(relation).includes(type));
  }
});

test("malformed dependency metadata never renders object types or invents missing lag values", () => {
  for (const type of [undefined, null, {}, [], 42, "", "   "]) {
    const relation = build([dependency(1, "finish_to_start", { dependency_type: type })])[0];
    assert.equal(relation.typeLabel, "관계 유형 확인 필요");
    assert.equal(relation.hiddenReason, "unknown-type");
    assert.equal(relation.geometry, null);
    assert.match(projectGanttDependencyDescription(relation), /관계 유형 확인 필요/);
  }
  for (const lag_days of [undefined, null, {}, [], "3", Number.NaN, Infinity, -Infinity]) {
    const relation = build([dependency(1, "finish_to_start", { lag_days })])[0];
    assert.ok(relation.geometry, "lag metadata never changes the returned plan boundaries");
    assert.equal(projectGanttDependencyLagLabel(relation.dependency), "lag_days 확인 필요");
    assert.match(projectGanttDependencyDescription(relation), /lag_days 확인 필요/);
  }
  for (const lag_days of [-3, 0, 2, 0.5]) {
    const relation = build([dependency(1, "finish_to_start", { lag_days })])[0];
    assert.equal(projectGanttDependencyLagLabel(relation.dependency), `lag_days ${lag_days > 0 ? "+" : ""}${lag_days}일`);
    assert.equal(relation.dependency.lag_days, lag_days);
  }
});

test("day, week and month endpoints stay aligned with existing bars across year and leap February", () => {
  for (const zoom of ["day", "week", "month"]) {
    for (const source of [items, [item(1, "2028-02-28", "2028-02-29"), item(2, "2028-03-01", "2028-03-02")]]) {
      const scale = createProjectGanttAxis(source[0].planned_start_date, source[1].planned_end_date, zoom, "monday");
      const relation = build([dependency(1)], source, rows(source), scale)[0];
      const predecessorPeriod = getProjectGanttPeriod(source[0], scale);
      const successorPeriod = getProjectGanttPeriod(source[1], scale);
      close(relation.geometry.from.x, predecessorPeriod.x + predecessorPeriod.width);
      close(relation.geometry.to.x, successorPeriod.x);
    }
  }
});

test("row changes recompute y while date coordinates stay independent of WBS width and scroll", () => {
  const ordinary = build([dependency(1)])[0].geometry;
  const reordered = build([dependency(1)], items, rows([...items].reverse()))[0].geometry;
  assert.equal(reordered.from.x, ordinary.from.x);
  assert.equal(reordered.to.x, ordinary.to.x);
  assert.equal(reordered.from.y, ordinary.to.y);
  assert.equal(reordered.to.y, ordinary.from.y);
  // All coordinates are timeline-local. WBS/scroll are applied once by the host.
  assert.deepEqual(build([dependency(1)])[0].geometry, ordinary);
  const narrowRange = createProjectGanttAxis("2027-01-02", "2027-01-03", "day");
  const clipped = build([dependency(1)], items, rows(items), narrowRange)[0];
  assert.ok(clipped.geometry.from.x < 0);
  assert.ok(clipped.geometry.to.x >= 0);
});

test("self and reverse-row relations retain directional endpoint stubs and finite routes", () => {
  const relations = build([dependency(1, "finish_to_start", { successor_work_item_id: 1 }),
    dependency(2, "start_to_finish", { predecessor_work_item_id: 2, successor_work_item_id: 1 })]);
  for (const relation of relations) {
    assert.ok(relation.geometry);
    assert.ok(!relation.geometry.path.includes("NaN"));
    assert.ok(!relation.geometry.path.includes("Infinity"));
  }
  assert.equal(relations[0].geometry.from.y, relations[0].geometry.to.y);
  assert.ok(relations[1].geometry.from.y > relations[1].geometry.to.y);
});

test("hundreds of work items and relations use only displayed endpoints without duplicate rows", () => {
  const source = Array.from({ length: 800 }, (_, index) => item(index + 1));
  const deps = source.slice(1).map((_, index) => dependency(index + 1, "finish_to_start", {
    predecessor_work_item_id: index + 1, successor_work_item_id: index + 2,
  }));
  const sourceCopy = structuredClone(source);
  const relations = build(deps, source, rows(source.slice(0, 400)));
  assert.equal(relations.length, 799);
  assert.equal(relations.filter(({ geometry }) => geometry).length, 399);
  assert.equal(relations.filter(({ hiddenReason }) => hiddenReason === "hidden-row").length, 400);
  assert.deepEqual(source, sourceCopy);
  const duplicateRow = build([dependency(1)], items, rows([items[0], items[0], items[1]]))[0];
  assert.equal(duplicateRow.geometry.from.y, 23);
  assert.equal(duplicateRow.geometry.to.y, 115);
});
