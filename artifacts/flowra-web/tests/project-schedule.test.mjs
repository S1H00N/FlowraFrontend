import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
function load(name) {
  const module = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "module", "exports", compiled)(require, module, module.exports);
  return module.exports;
}
const { projectSchedule, projectDate, isValidProjectDate, applyParentPeriod, periodWarnings, aggregateProjectDelays, parentPeriodOptions } = load("projectSchedule");
const { buildProjectWorkTree } = load("projectWorkTree");
const today = "2026-10-14";
const period = (start, end) => ({ planned_start_date: start, planned_end_date: end });

test("calendar validation handles leap days and keeps date-only values independent of UTC", () => {
  assert.equal(isValidProjectDate("2024-02-29"), true);
  for (const value of ["2026-02-29", "2026-13-01", "0000-01-01", "2026-10-14\n", "2026-1-1"]) assert.equal(isValidProjectDate(value), false);
  assert.equal(projectDate("2026-10-14T00:00:00+09:00"), "2026-10-14");
});

test("schedule covers missing, single-sided, future, start-day and inclusive due-day dates", () => {
  for (const [start, end, kind] of [
    [null, null, "unset"], ["2026-10-15", null, "upcoming"],
    [today, null, "starting"], ["2026-10-13", null, "normal"],
    [null, "2026-10-20", "normal"], [today, today, "due"],
    [null, today, "due"], ["2026-10-20", today, "invalid"],
  ]) assert.equal(projectSchedule(period(start, end), today).kind, kind);
});

test("delay starts the next calendar day and ignores stale completion timestamps on open work", () => {
  const source = { ...period(null, "2026-10-13"), status: "todo", completed_at: "2026-10-01T00:00:00Z" };
  const original = { ...source };
  assert.equal(projectSchedule(source, today).delayedDays, 1);
  assert.equal(projectSchedule(period(null, "2026-09-30"), today).delayedDays, 14);
  assert.equal(projectSchedule(period(null, "2024-02-28"), "2024-03-01").delayedDays, 2);
  assert.deepEqual(source, original);
});

test("completion and cancellation do not count as delay; postponed work remains incomplete", () => {
  for (const status of ["done", "completed", "cancelled", "archived"])
    assert.equal(projectSchedule({ ...period(null, "2026-10-01"), status }, today).delayedDays, 0);
  assert.equal(projectSchedule({ ...period(null, "2026-10-13"), status: "postponed" }, today).delayedDays, 1);
  assert.equal(projectSchedule({ status: "done" }, today).label, "완료");
});

test("parent application fills only missing values and never mutates either period", () => {
  const parent = period("2026-10-01", "2026-10-20");
  const child = period("2026-10-03", null);
  assert.deepEqual(applyParentPeriod(child, parent), period("2026-10-03", "2026-10-20"));
  assert.deepEqual(child, period("2026-10-03", null));
  assert.deepEqual(applyParentPeriod(period(null, null), period(null, "2026-10-20")), period(null, "2026-10-20"));
  assert.deepEqual(applyParentPeriod(period(null, null), period(null, null)), period(null, null));
});

test("parent bounds warn on both sides, allow equal dates and compare only present bounds", () => {
  const parent = period("2026-10-01", "2026-10-20");
  assert.deepEqual(periodWarnings(parent, parent), []);
  assert.deepEqual(periodWarnings(period(null, null), parent), []);
  assert.equal(periodWarnings(period("2026-09-30", "2026-10-25"), parent).length, 2);
  assert.match(periodWarnings(period(null, "2026-10-25"), parent)[0], /5일/);
  assert.deepEqual(periodWarnings(parent, period(null, null)), []);
});

function item(id, parent = null, phase = 10, status = "todo") {
  return { company_project_work_item_id: id, parent_work_item_id: parent, company_project_phase_id: phase,
    title: `Work ${id}`, status, ...period(null, "2026-10-13") };
}

test("five-level hierarchy deduplicates work IDs and propagates across independent phase links", () => {
  const graph = buildProjectWorkTree([item(1), item(2, 1), item(3, 2, 20), item(4, 3, 20), item(5, 4, 20), item(5, 4, 20), item(6, 1, 10, "done"), item(7, 1, 10, "cancelled")]);
  const result = aggregateProjectDelays(graph, today);
  assert.equal(result.project.size, 5);
  assert.equal(result.phases.get(10).size, 5);
  assert.equal(result.phases.get(20).size, 3);
  assert.equal(result.work.get(1).size, 4);
  assert.equal(result.work.get(4).size, 1);
});

test("partial and malformed graphs count only known IDs and terminate on cycles", () => {
  const result = aggregateProjectDelays(buildProjectWorkTree([item(1, 999), item(2, 3), item(3, 2)]), today);
  assert.equal(result.project.size, 3);
  assert.equal(result.work.get(2).size, 1);
});

test("parent choices preserve independent work/phase relations without invented fallback dates", () => {
  const graph = buildProjectWorkTree([item(1)]);
  const phases = [{ company_project_phase_id: 20, name: "다른 단계", ...period(today, null) }];
  assert.deepEqual(parentPeriodOptions("1", "20", graph, phases, {}).map((p) => p.key), ["work:1", "phase:20"]);
  assert.deepEqual(parentPeriodOptions("999", "none", graph, phases, period(today, today)), []);
  assert.equal(parentPeriodOptions("none", "none", graph, phases, period(today, today))[0].key, "project");
});
