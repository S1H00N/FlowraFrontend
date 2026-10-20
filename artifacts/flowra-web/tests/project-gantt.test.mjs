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
const {
  addProjectGanttDays, addProjectGanttMonths, projectGanttDayDistance, createProjectGanttAxis,
  getProjectGanttHeaders, getProjectGanttPeriod, getProjectGanttRange, getProjectGanttProgress,
} = load("projectGantt");
const period = (start, end) => ({ planned_start_date: start, planned_end_date: end });
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`); }

test("DATE arithmetic preserves calendar boundaries and rejects invalid dates", () => {
  for (const [date, next] of [
    ["2026-01-31", "2026-02-01"], ["2026-02-28", "2026-03-01"],
    ["2024-02-28", "2024-02-29"], ["2024-02-29", "2024-03-01"], ["2026-12-31", "2027-01-01"],
  ]) {
    assert.equal(addProjectGanttDays(date, 1), next);
    assert.equal(addProjectGanttDays(next, -1), date);
    assert.equal(projectGanttDayDistance(date, next), 1);
    assert.equal(projectGanttDayDistance(next, date), -1);
  }
  assert.equal(addProjectGanttDays("2026-10-18T00:00:00+09:00", 1), "2026-10-19");
  assert.equal(addProjectGanttDays("2026-02-29", 1), "");
  assert.equal(projectGanttDayDistance("bad", "2026-10-18"), null);
  assert.equal(addProjectGanttDays("0001-01-01", -1), "");
  assert.equal(addProjectGanttDays("9999-12-31", 1), "");
  assert.equal(addProjectGanttMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addProjectGanttMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addProjectGanttMonths("2026-12-31", 1), "2027-01-31");
});

test("day and week scales use exact widths with existing configurable week starts", () => {
  const day = createProjectGanttAxis("2026-10-18", "2026-10-25", "day");
  assert.equal(day.width, 8 * 43);
  assert.equal(day.dateToX("2026-10-19"), 43);
  assert.equal(day.dateToX("2026-10-17"), -43);
  assert.equal(day.dateToX("2026-02-29"), null);
  for (const [weekStart, expectedStart, expectedEnd] of [
    ["sunday", "2026-10-18", "2026-10-24"], ["monday", "2026-10-12", "2026-10-18"],
  ]) {
    const week = createProjectGanttAxis("2026-10-18", "2026-10-18", "week", weekStart);
    assert.equal(week.start, expectedStart);
    assert.equal(week.end, expectedEnd);
    close(week.width, 143);
    close(week.dateToX(addProjectGanttDays(week.start, 1)), 143 / 7);
    assert.equal(week.headers.minor[0].start, expectedStart);
  }
  assert.throws(() => createProjectGanttAxis("2026-10-20", "2026-10-18", "day"), RangeError);
  assert.throws(() => createProjectGanttAxis("2026-02-29", "2026-10-18", "day"), RangeError);
});

test("month positions reflect actual month lengths including leap February", () => {
  const axis = createProjectGanttAxis("2024-01-31", "2024-03-01", "month");
  assert.equal(axis.start, "2024-01-01");
  assert.equal(axis.end, "2024-03-31");
  close(axis.width, 3 * 176);
  close(axis.dateToX("2024-02-01"), 176);
  close(axis.dateToX("2024-03-01"), 352);
  close(axis.dateToX("2024-01-31"), 176 * 30 / 31);
  close(axis.dateToX("2024-02-29"), 176 + 176 * 28 / 29);
  close(getProjectGanttPeriod(period("2024-02-29", "2024-02-29"), axis).width, 176 / 29);
  const common = createProjectGanttAxis("2026-02-01", "2026-02-28", "month");
  close(getProjectGanttPeriod(period("2026-02-28", "2026-02-28"), common).width, 176 / 28);
});

test("date and fractional viewport center round trips survive zoom and timezone boundaries", () => {
  for (const zoom of ["day", "week", "month"]) {
    const axis = createProjectGanttAxis("2024-01-01", "2027-12-31", zoom, "monday");
    for (const date of ["2024-02-29", "2026-01-31", "2026-03-08", "2026-11-01", "2026-12-31", "2027-01-01"]) {
      assert.equal(axis.xToDate(axis.dateToX(date)), date);
      const before = { date, fraction: 0.625 };
      const x = axis.positionToX(before);
      const after = axis.xToPosition(x);
      assert.equal(after.date, date);
      close(after.fraction, before.fraction);
      const other = createProjectGanttAxis(axis.start, axis.end, zoom === "month" ? "day" : "month");
      const switched = other.xToPosition(other.positionToX(after));
      assert.equal(switched.date, before.date);
      close(switched.fraction, before.fraction);
    }
    assert.equal(axis.xToPosition(Number.NaN), null);
    assert.equal(axis.positionToX({ date: "2026-02-29", fraction: 0.5 }), null);
    assert.equal(axis.positionToX({ date: "2026-10-18", fraction: Number.NaN }), null);
  }
});

test("periods include their end day across month/year boundaries without invented dates", () => {
  for (const [start, end, days] of [
    ["2026-10-18", "2026-10-18", 1], ["2026-01-31", "2026-02-01", 2],
    ["2026-02-28", "2026-03-01", 2], ["2024-02-28", "2024-03-01", 3],
    ["2026-12-31", "2027-01-01", 2], ["2026-01-01", "2026-03-31", 90],
  ]) {
    for (const zoom of ["day", "week", "month"]) {
      const axis = createProjectGanttAxis(start, end, zoom);
      const value = getProjectGanttPeriod(period(start, end), axis);
      assert.equal(value.kind, "period");
      if (zoom !== "month") close(value.width, days * (zoom === "day" ? 43 : 143 / 7));
      close(value.x + value.width, axis.positionToX({ date: end, fraction: 1 }));
    }
  }
  const axis = createProjectGanttAxis("2026-10-01", "2026-10-31", "day");
  assert.equal(getProjectGanttPeriod(period("2026-10-18", null), axis).kind, "start");
  assert.equal(getProjectGanttPeriod(period(null, "2026-10-18"), axis).kind, "end");
  assert.equal(getProjectGanttPeriod({ due_datetime: "2026-10-18T10:00:00Z" }, axis).kind, "unset");
  for (const plan of [period("bad", "2026-10-18"), period("2026-10-20", "2026-10-18"), period(null, "2026-02-29")]) {
    const result = getProjectGanttPeriod({ ...plan, status: "done" }, axis);
    assert.equal(result.kind, "invalid");
    assert.equal(result.width, undefined);
  }
});

test("range fit prefers valid project plans then loaded actual plans and clearly reports fallback", () => {
  const plans = [period("2026-10-05", "2026-10-10"), period(null, "2026-11-01"),
    period("2026-12-01", "2026-01-01"), period("bad", "2029-01-01")];
  const original = structuredClone(plans);
  assert.deepEqual(getProjectGanttRange(period("2026-10-01", "2026-10-31"), plans, "2026-10-18"),
    { start: "2026-10-01", end: "2026-10-31", source: "project" });
  assert.deepEqual(getProjectGanttRange(period("2026-10-20", "2026-10-01"), plans, "2026-10-18"),
    { start: "2026-10-05", end: "2026-11-01", source: "items" });
  assert.deepEqual(getProjectGanttRange({}, [{ rollup: { planned_start_date: "2020-01-01" } }], "2026-10-18"),
    { start: "2026-10-18", end: "2026-10-18", source: "today" });
  assert.deepEqual(plans, original);
});

test("headers stay viewport bounded over century-scale projects and align to the axis", () => {
  for (const zoom of ["day", "week", "month"]) {
    const axis = createProjectGanttAxis("1900-01-01", "2100-12-31", zoom, "monday");
    const middle = axis.dateToX("2026-10-18");
    const headers = getProjectGanttHeaders(axis, middle, 1200);
    assert.ok(headers.major.length > 0 && headers.major.length < 20);
    assert.ok(headers.minor.length > 0 && headers.minor.length < 40);
    assert.ok(headers.major.some((segment) => segment.start <= "2026-10-18" && segment.end >= "2026-10-18"));
    for (const segment of [...headers.major, ...headers.minor]) {
      close(segment.x, axis.dateToX(segment.start));
      assert.ok(segment.width > 0);
    }
    const huge = getProjectGanttHeaders(axis, 0, Number.MAX_SAFE_INTEGER);
    assert.ok(huge.major.length <= 600);
    assert.ok(huge.minor.length <= 600);
  }
  const day = createProjectGanttAxis("2026-10-17", "2026-10-19", "day");
  assert.deepEqual(day.headers.minor.map((segment) => segment.weekend), [true, true, false]);
});

test("supported DATE extremes retain inclusive widths and bounded year headers", () => {
  for (const zoom of ["day", "week", "month"]) {
    for (const date of ["0001-01-01", "9999-12-31"]) {
      const axis = createProjectGanttAxis(date, date, zoom);
      const result = getProjectGanttPeriod(period(date, date), axis);
      assert.equal(result.kind, "period");
      assert.ok(result.width > 0 && Number.isFinite(result.width));
      assert.equal(axis.xToDate(axis.dateToX(date)), date);
      assert.ok(axis.headers.minor.every((segment) => segment.start && segment.end && segment.width > 0));
    }
  }
});

test("server progress preserves zero and never infers progress from status, completion or rollup", () => {
  assert.equal(getProjectGanttProgress({ progress_percent: 0, progress_override_percent: 0 }), 0);
  assert.equal(getProjectGanttProgress({ progress_percent: 31, progress_override_percent: 0 }), 31);
  assert.equal(getProjectGanttProgress({ progress_percent: 50 }), 50);
  assert.equal(getProjectGanttProgress({ progress_percent: 100 }), 100);
  for (const value of [null, undefined, Number.NaN, Infinity, -1, 101])
    assert.equal(getProjectGanttProgress({ progress_percent: value }), null);
  assert.equal(getProjectGanttProgress({ status: "done", completed_at: "2026-10-18", rollup: { progress_percent: 100 } }), null);
  assert.equal(getProjectGanttProgress({ progress_override_percent: 0 }), null);
});

test("day headers split December and January at the same coordinate as inclusive work periods", () => {
  const axis = createProjectGanttAxis("2026-12-30", "2027-01-04", "day");
  const headers = getProjectGanttHeaders(axis, 0, axis.width);
  assert.deepEqual(headers.major.map(({ label, start, end, x, width }) => ({ label, start, end, x, width })), [
    { label: "2026년 12월", start: "2026-12-30", end: "2026-12-31", x: 0, width: 86 },
    { label: "2027년 1월", start: "2027-01-01", end: "2027-01-04", x: 86, width: 172 },
  ]);
  assert.deepEqual(headers.minor.map(({ label, weekend }) => [label, weekend]), [
    ["30 수", false], ["31 목", false], ["1 금", false], ["2 토", true], ["3 일", true], ["4 월", false],
  ]);
  const work = getProjectGanttPeriod(period("2026-12-31", "2027-01-01"), axis);
  assert.equal(work.x, 43);
  assert.equal(work.width, 86);
  assert.equal(headers.major[1].x, axis.dateToX("2027-01-01"));
  assert.equal(headers.minor.every(({ width }) => width === 43), true);
});

test("weeks crossing a year or month retain configured starts and accurately split upper month headers", () => {
  for (const { from, to, weekStart, start, end, labels, monthDays } of [
    { from: "2026-12-31", to: "2027-01-01", weekStart: "sunday", start: "2026-12-27", end: "2027-01-02",
      labels: ["12/27"], monthDays: [5, 2] },
    { from: "2026-12-31", to: "2027-01-01", weekStart: "monday", start: "2026-12-28", end: "2027-01-03",
      labels: ["12/28"], monthDays: [4, 3] },
    { from: "2027-01-31", to: "2027-02-01", weekStart: "sunday", start: "2027-01-31", end: "2027-02-06",
      labels: ["1/31"], monthDays: [1, 6] },
    { from: "2027-01-31", to: "2027-02-01", weekStart: "monday", start: "2027-01-25", end: "2027-02-07",
      labels: ["1/25", "2/1"], monthDays: [7, 7] },
  ]) {
    const axis = createProjectGanttAxis(from, to, "week", weekStart);
    const headers = getProjectGanttHeaders(axis, 0, axis.width);
    assert.equal(axis.start, start);
    assert.equal(axis.end, end);
    assert.deepEqual(headers.minor.map(({ label }) => label), labels);
    for (const tick of headers.minor) close(tick.width, 143);
    headers.major.forEach((tick, index) => close(tick.width, monthDays[index] * 143 / 7));
    close(headers.major[0].x + headers.major[0].width, headers.major[1].x);
    assert.equal(headers.major[1].start, from.startsWith("2026") ? "2027-01-01" : "2027-02-01");
    close(getProjectGanttPeriod(period(from, to), axis).width, 2 * 143 / 7);
  }
});

test("month year groups describe July through January correctly before and after horizontal scrolling", () => {
  const axis = createProjectGanttAxis("2026-07-01", "2027-02-28", "month");
  const all = getProjectGanttHeaders(axis, 0, axis.width);
  assert.deepEqual(all.major.map(({ label, start, end, x, width }) => ({ label, start, end, x, width })), [
    { label: "2026년", start: "2026-07-01", end: "2026-12-31", x: 0, width: 1056 },
    { label: "2027년", start: "2027-01-01", end: "2027-02-28", x: 1056, width: 352 },
  ]);
  assert.deepEqual(all.minor.map(({ label }) => label), ["7월", "8월", "9월", "10월", "11월", "12월", "1월", "2월"]);
  all.minor.forEach((tick, index) => {
    assert.equal(tick.x, index * 176);
    assert.equal(tick.width, 176);
  });
  const crossing = getProjectGanttHeaders(axis, axis.dateToX("2026-12-20"), 176);
  assert.deepEqual(crossing.major.map(({ label }) => label), ["2026년", "2027년"]);
  const january = getProjectGanttHeaders(axis, axis.dateToX("2027-01-01"), 175);
  assert.deepEqual(january.major.map(({ label }) => label), ["2027년"]);
  assert.deepEqual(january.minor.map(({ label }) => label), ["1월"]);
  assert.equal(january.major[0].x, 1056);
  assert.equal(january.minor[0].x, january.major[0].x);
});

test("monthly bars crossing year, January and leap February use each side's actual day width", () => {
  for (const [start, end, expectedWidth] of [
    ["2026-12-31", "2027-01-01", 176 / 31 + 176 / 31],
    ["2027-01-31", "2027-02-01", 176 / 31 + 176 / 28],
    ["2028-02-28", "2028-03-01", 2 * 176 / 29 + 176 / 31],
    ["2028-02-29", "2028-02-29", 176 / 29],
  ]) {
    const source = Object.freeze(period(start, end));
    const axis = createProjectGanttAxis(start, end, "month");
    const plan = getProjectGanttPeriod(source, axis);
    assert.equal(plan.kind, "period");
    close(plan.width, expectedWidth);
    const headers = getProjectGanttHeaders(axis, 0, axis.width);
    for (const tick of headers.minor) {
      assert.equal(tick.width, 176);
      close(axis.dateToX(tick.start), tick.x);
      close(axis.positionToX({ date: tick.end, fraction: 1 }), tick.x + 176);
    }
    assert.deepEqual(source, period(start, end));
  }
});

test("viewport header recalculation preserves boundary centers and the actual today coordinate", () => {
  const position = Object.freeze({ date: "2027-01-01", fraction: 0.375 });
  for (const zoom of ["day", "week", "month"]) {
    const axis = createProjectGanttAxis("2026-11-01", "2027-03-31", zoom, "monday");
    const center = axis.positionToX(position);
    for (const width of [320, 768, 1200]) {
      const left = Math.max(0, center - width / 2);
      const headers = getProjectGanttHeaders(axis, left, width);
      assert.ok(headers.major.some(({ start, end }) => start <= position.date && end >= position.date));
      assert.equal(axis.xToDate(axis.dateToX("2026-12-31")), "2026-12-31");
      assert.equal(axis.xToDate(axis.dateToX("2027-01-01")), "2027-01-01");
      assert.equal(axis.xToDate(axis.dateToX("2027-02-01")), "2027-02-01");
      const restored = axis.xToPosition(center);
      assert.equal(restored.date, position.date);
      close(restored.fraction, position.fraction);
    }
  }
});
