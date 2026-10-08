import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const source = readFileSync(
  new URL("../src/lib/homeTasks.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const module = { exports: {} };
new Function("exports", compiled)(module.exports);
const {
  taskDateKey,
  overdueDays,
  selectTodayTasks,
  taskPlanStatus,
  taskPlanDateKey,
} = module.exports;
const task = (id, due, status = "todo", extra = {}) => ({
  task_id: id,
  due_datetime: due,
  status,
  priority: "medium",
  ...extra,
});

test("home overdue uses the feed timezone and excludes done, missing and invalid deadlines", () => {
  assert.equal(taskDateKey("2026-10-05T16:00:00Z", "Asia/Seoul"), "2026-10-06");
  assert.equal(
    overdueDays(task(1, "2026-10-05T16:00:00Z"), "2026-10-06", "Asia/Seoul"),
    0,
  );
  assert.equal(
    overdueDays(
      task(1, "2026-10-04T18:00:00+09:00"),
      "2026-10-06",
      "Asia/Seoul",
    ),
    2,
  );
  for (const item of [
    task(1, null),
    task(2, "invalid"),
    task(3, "2026-10-01T18:00:00+09:00", "done"),
  ]) {
    assert.equal(overdueDays(item, "2026-10-06", "Asia/Seoul"), 0);
  }
});

test("overdue days count calendar dates across daylight-saving changes", () => {
  assert.equal(
    overdueDays(
      task(1, "2026-03-07T12:00:00-05:00"),
      "2026-03-09",
      "America/New_York",
    ),
    2,
  );
});

test("today shows only incomplete work planned today or due today without changing the input", () => {
  const tasks = [
    task(1, "2026-10-08T12:00:00+09:00"),
    task(2, null),
    task(3, "2026-10-04T12:00:00+09:00"),
    task(4, "2026-10-06T18:00:00+09:00"),
    task(5, null, "todo", { schedule_id: 99 }),
    task(6, null, "done"),
    task(7, null, "in_progress"),
    task(8, "2026-10-06T18:00:00+09:00", "done", { schedule_id: 99 }),
    task(9, "invalid", "in_progress"),
  ];
  assert.deepEqual(
    selectTodayTasks(tasks, "2026-10-06", "Asia/Seoul", new Set([99])).map(
      (item) => item.task_id,
    ),
    [5, 4],
  );
  assert.deepEqual(
    tasks.map((item) => item.task_id),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("only actual today schedule IDs include linked work, while today's deadline can have another link", () => {
  const tasks = [
    task(1, "2026-10-04T12:00:00+09:00", "todo", { schedule_id: 99 }),
    task(2, null, "todo", { schedule_id: 777 }),
    task(3, "2026-10-04T12:00:00+09:00", "todo", { schedule_id: 201 }),
    task(4, "2026-10-06T18:00:00+09:00", "todo", { schedule_id: 201 }),
    task(5, "2026-10-08T12:00:00+09:00", "todo", { schedule_id: 99 }),
    task(6, null, "todo", { schedule_id: 99 }),
  ];
  assert.deepEqual(
    selectTodayTasks(tasks, "2026-10-06", "Asia/Seoul", new Set([99]))
      .map((item) => item.task_id)
      .sort((a, b) => a - b),
    [1, 4, 5, 6],
  );
});

test("today deadlines use the home feed timezone rather than the timestamp's date text", () => {
  assert.deepEqual(
    selectTodayTasks(
      [task(1, "2026-10-05T16:00:00Z"), task(2, "2026-10-06T16:00:00Z")],
      "2026-10-06",
      "Asia/Seoul",
      new Set(),
    ).map((item) => item.task_id),
    [1],
  );
});

const now = new Date("2026-10-07T12:00:00+09:00");
const timezone = "Asia/Seoul";
const linked = task(1, "2026-09-22T18:00:00+09:00", "todo", {
  schedule_id: 42,
});
const schedule = (start, end = null, extra = {}) => ({
  start_datetime: start,
  end_datetime: end,
  all_day: false,
  ...extra,
});

test("cases A-E distinguish unplanned, future, today upcoming, past and completed tasks", () => {
  assert.equal(
    taskPlanStatus(task(1, linked.due_datetime), null, now, timezone),
    "unplanned",
  );
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-08T14:00:00+09:00"),
      now,
      timezone,
    ),
    "planned",
  );
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-07T18:00:00+09:00"),
      now,
      timezone,
    ),
    "planned",
  );
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-09-22T09:00:00+09:00"),
      now,
      timezone,
    ),
    "past",
  );
  const completed = { ...linked, status: "done" };
  assert.equal(taskPlanStatus(completed, null, now, timezone), "completed");
  assert.equal(overdueDays(completed, "2026-10-07", timezone), 0);
  assert.deepEqual(
    selectTodayTasks([completed], "2026-10-07", timezone, new Set([42])),
    [],
  );
});

test("known end times distinguish upcoming, running and ended at exact boundaries", () => {
  const timed = schedule(
    "2026-10-07T12:00:00+09:00",
    "2026-10-07T13:00:00+09:00",
  );
  for (const [instant, expected] of [
    ["2026-10-07T11:59:59.999+09:00", "planned"],
    ["2026-10-07T12:00:00+09:00", "active"],
    ["2026-10-07T12:59:59.999+09:00", "active"],
    ["2026-10-07T13:00:00+09:00", "past"],
  ]) {
    assert.equal(
      taskPlanStatus(linked, timed, new Date(instant), timezone),
      expected,
    );
  }
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-06T23:00:00+09:00", "2026-10-08T01:00:00+09:00"),
      now,
      timezone,
    ),
    "active",
  );
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-07T09:00:00+09:00", "2026-10-07T10:00:00+09:00"),
      now,
      timezone,
    ),
    "past",
  );
});

test("missing and malformed times remain unknown rather than inventing a duration", () => {
  for (const item of [
    null,
    {},
    schedule(null),
    schedule("invalid"),
    schedule("2026-10-07"),
    schedule("2026-10-07T09:00:00"),
    schedule("2026-02-30T09:00:00+09:00"),
    schedule("2026-10-07T24:00:00+09:00"),
    schedule("2026-10-07T09:00:00+09:00"),
    schedule("2026-10-08T09:00:00+09:00", "invalid"),
    schedule("2026-10-08T09:00:00+09:00", ""),
    schedule("2026-10-08T09:00:00+09:00", "2026-10-07T09:00:00+09:00"),
  ]) {
    assert.equal(taskPlanStatus(linked, item, now, timezone), "unknown");
  }
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-06T09:00:00+09:00"),
      now,
      timezone,
    ),
    "past",
  );
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-07T18:00:00+09:00", "2026-10-07T18:00:00+09:00"),
      now,
      timezone,
    ),
    "planned",
  );
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-07T18:00:00+09:00"),
      new Date("invalid"),
      timezone,
    ),
    "unknown",
  );
});

test("all-day schedules use calendar-day semantics without requiring an invented end", () => {
  for (const [date, expected] of [
    ["2026-10-06", "past"],
    ["2026-10-07", "active"],
    ["2026-10-08", "planned"],
  ]) {
    assert.equal(
      taskPlanStatus(
        linked,
        schedule(date, null, { all_day: true }),
        now,
        timezone,
      ),
      expected,
    );
    assert.equal(
      taskPlanStatus(
        linked,
        schedule(`${date}T00:00:00+09:00`, null, { all_day: true }),
        now,
        timezone,
      ),
      expected,
    );
  }
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-06", "2026-10-08", { all_day: true }),
      now,
      timezone,
    ),
    "active",
  );
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-08", "2026-10-06", { all_day: true }),
      now,
      timezone,
    ),
    "unknown",
  );
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-07T00:00:00+09:00", "2026-10-07T23:59:00+09:00", {
        all_day: true,
      }),
      new Date("2026-10-07T23:59:00+09:00"),
      timezone,
    ),
    "past",
  );
});

test("date-only all-day labels and today filtering retain the actual calendar date in negative-offset timezones", () => {
  assert.equal(
    taskPlanDateKey(
      schedule("2026-10-07", null, { all_day: true }),
      "America/New_York",
    ),
    "2026-10-07",
  );
  assert.equal(
    taskPlanDateKey(
      schedule("2026-10-07T00:00:00Z", null, { all_day: true }),
      "America/New_York",
    ),
    "2026-10-06",
  );
  assert.equal(
    taskPlanDateKey(schedule("2026-02-30", null, { all_day: true }), timezone),
    null,
  );
  assert.equal(taskPlanDateKey(schedule("2026-10-07"), timezone), null);
  assert.equal(taskPlanDateKey(null, timezone), null);
});

test("plan dates follow the requested timezone and completed schedules never replace task completion", () => {
  const instant = new Date("2026-10-06T16:00:00Z");
  const withoutEnd = schedule("2026-10-06T15:30:00Z");
  assert.equal(
    taskPlanStatus(linked, withoutEnd, instant, timezone),
    "unknown",
  );
  assert.equal(
    taskPlanStatus(linked, withoutEnd, instant, "America/New_York"),
    "unknown",
  );
  const acrossDate = schedule("2026-10-06T10:00:00Z");
  assert.equal(taskPlanStatus(linked, acrossDate, instant, timezone), "past");
  assert.equal(
    taskPlanStatus(linked, acrossDate, instant, "America/New_York"),
    "unknown",
  );
  assert.equal(
    taskPlanStatus(
      linked,
      schedule("2026-10-08T18:00:00+09:00", null, { is_completed: true }),
      now,
      timezone,
    ),
    "past",
  );
  assert.equal(linked.status, "todo");
  assert.equal(linked.due_datetime, "2026-09-22T18:00:00+09:00");
});

const rescheduleSource = readFileSync(
  new URL("../src/hooks/useTaskReschedule.ts", import.meta.url),
  "utf8",
);
const rescheduleCompiled = ts.transpileModule(rescheduleSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function rescheduleHarness({ initial = linked, detail, onPatch } = {}) {
  let current = { ...initial, title: "API 테스트" };
  const calls = [];
  const cached = [];
  const createdSchedule = {
    schedule_id: 100,
    ...schedule("2026-10-07T18:00:00+09:00", "2026-10-07T18:30:00+09:00"),
  };
  const dependencies = {
    react: {
      useRef: (value) => ({ current: value }),
      useState: (value) => [value, () => {}],
    },
    "@tanstack/react-query": {
      useQueryClient: () => ({
        invalidateQueries: async () => {},
        setQueryData: (key, value) => cached.push([key, value]),
      }),
    },
    "@/api/tasks": {
      getTask: async (id) => {
        calls.push(["getTask", id]);
        return { success: true, data: { task: { ...current } } };
      },
    },
    "@/api/schedules": {
      getSchedule: async (id) => {
        calls.push(["getSchedule", id]);
        return { success: true, data: { schedule: detail } };
      },
    },
    "@/hooks/useSchedules": {
      scheduleDetailKey: (id) => ["schedules", "detail", id],
      useCreateSchedule: () => ({
        mutateAsync: async (payload) => {
          calls.push(["createSchedule", payload]);
          return createdSchedule;
        },
      }),
    },
    "@/hooks/useTasks": {
      TASKS_QUERY_KEY: ["tasks"],
      useUpdateTask: () => ({
        mutateAsync: async (request) => {
          calls.push(["updateTask", request]);
          if (onPatch)
            await onPatch(request, (next) => {
              current = { ...current, ...next };
            });
          current = { ...current, ...request.payload };
          return current;
        },
      }),
    },
    "@/hooks/useTodayHome": { TODAY_HOME_QUERY_KEY: ["home", "today"] },
    "@/lib/toast": { toast: { success: () => {} } },
    "@/lib/homeTasks": { taskPlanStatus },
    "@/utils/dateUtils": { toOffsetISOString: (date) => date.toISOString() },
  };
  const exports = {};
  class FixedDate extends Date {
    constructor(value) {
      super(value ?? now.toISOString());
    }
  }
  new Function("exports", "require", "Date", rescheduleCompiled)(
    exports,
    (name) => {
      assert.ok(dependencies[name], `Unexpected dependency ${name}`);
      return dependencies[name];
    },
    FixedDate,
  );
  return {
    hook: exports.useTaskReschedule(timezone),
    calls,
    cached,
    createdSchedule,
    current: () => current,
  };
}

const requestedStart = new Date("2026-10-07T18:00:00+09:00");

test("rescheduling re-reads an ended linked schedule and only changes schedule_id", async () => {
  const fixture = rescheduleHarness({
    detail: schedule("2026-09-22T09:00:00+09:00"),
  });
  assert.equal(
    await fixture.hook.save(linked, requestedStart, 30),
    fixture.createdSchedule,
  );
  assert.deepEqual(
    fixture.calls.map(([name]) => name),
    ["getTask", "getSchedule", "createSchedule", "updateTask"],
  );
  assert.deepEqual(fixture.calls.at(-1)[1], {
    taskId: 1,
    payload: { schedule_id: 100 },
  });
  assert.equal(fixture.current().due_datetime, linked.due_datetime);
  assert.equal(fixture.current().task_id, linked.task_id);
  assert.equal(fixture.current().status, "todo");
});

test("rescheduling protects upcoming, running and unknown links and completed or changed tasks", async () => {
  for (const detail of [
    schedule("2026-10-08T09:00:00+09:00"),
    schedule("2026-10-07T18:00:00+09:00"),
    schedule("2026-10-07T11:00:00+09:00", "2026-10-07T13:00:00+09:00"),
    schedule("2026-10-07T09:00:00+09:00"),
    null,
  ]) {
    const fixture = rescheduleHarness({ detail });
    await assert.rejects(fixture.hook.save(linked, requestedStart, 30));
    assert.deepEqual(
      fixture.calls.map(([name]) => name),
      ["getTask", "getSchedule"],
    );
    assert.deepEqual(fixture.cached, [[["schedules", "detail", 42], detail]]);
    assert.equal(fixture.current().schedule_id, 42);
  }
  for (const initial of [
    { ...linked, status: "done" },
    { ...linked, schedule_id: 43 },
  ]) {
    const fixture = rescheduleHarness({ initial });
    await assert.rejects(fixture.hook.save(linked, requestedStart, 30));
    assert.deepEqual(
      fixture.calls.map(([name]) => name),
      ["getTask"],
    );
  }
});

test("retry after a failed task link reuses the created schedule", async () => {
  let patches = 0;
  const fixture = rescheduleHarness({
    detail: schedule("2026-09-22T09:00:00+09:00"),
    onPatch: async () => {
      if (++patches === 1) throw new Error("network error");
    },
  });
  await assert.rejects(
    fixture.hook.save(linked, requestedStart, 30),
    /network error/,
  );
  assert.equal(
    await fixture.hook.save(linked, requestedStart, 30),
    fixture.createdSchedule,
  );
  assert.equal(
    fixture.calls.filter(([name]) => name === "createSchedule").length,
    1,
  );
  assert.equal(
    fixture.calls.filter(([name]) => name === "updateTask").length,
    2,
  );
  assert.equal(fixture.current().due_datetime, linked.due_datetime);
});

test("retry after a lost PATCH response recognizes a committed link without another write", async () => {
  const fixture = rescheduleHarness({
    detail: schedule("2026-09-22T09:00:00+09:00"),
    onPatch: async (request, commit) => {
      commit(request.payload);
      throw new Error("lost response");
    },
  });
  await assert.rejects(
    fixture.hook.save(linked, requestedStart, 30),
    /lost response/,
  );
  assert.equal(
    await fixture.hook.save(linked, requestedStart, 30),
    fixture.createdSchedule,
  );
  assert.equal(
    fixture.calls.filter(([name]) => name === "createSchedule").length,
    1,
  );
  assert.equal(
    fixture.calls.filter(([name]) => name === "updateTask").length,
    1,
  );
  assert.equal(
    fixture.calls.filter(([name]) => name === "getSchedule").length,
    1,
  );
});
