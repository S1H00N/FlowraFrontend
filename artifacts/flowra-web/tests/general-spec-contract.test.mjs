import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");

function load(relativePath, dependencies) {
  const source = readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, (name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  });
  return exports;
}

const compactParams = (record) => Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));

test("notifications keep native page_size/total metadata including an empty zero-page inbox", async () => {
  const meta = { page: 1, page_size: 100, total: 0, total_pages: 0 };
  const api = load("api/notifications.ts", {
    "./client": { get: async () => ({ data: { success: true, data: { notifications: [], meta } } }) },
    "./normalize": { compactParams },
  });
  assert.deepEqual((await api.listNotifications()).data, { notifications: [], meta });
});

test("read updates use recipient IDs and preserve the nested recipient response", async () => {
  const recipient = {
    notification_recipient_id: 41, notification_id: 9, read_at: "2026-10-13T00:00:00Z",
    notification: { notification_id: 9, type: "schedule", title: "일정 알림", body: null, data: {} },
  };
  const calls = [];
  const api = load("api/notifications.ts", {
    "./client": { patch: async (url) => {
      calls.push(url);
      return { data: { success: true, data: { notification: recipient } } };
    } },
    "./normalize": { compactParams },
  });
  assert.deepEqual((await api.markNotificationRead(41)).data.notification, recipient);
  assert.deepEqual(calls, ["/notifications/41/read"]);
});

function mutationDependencies(extra = {}) {
  const invalidated = [];
  const removed = [];
  let cache = [{ schedule_id: 201 }, { schedule_id: 202 }];
  const listKey = ["schedules", "list", {}];
  const queryClient = {
    invalidateQueries: async ({ queryKey }) => invalidated.push(queryKey),
    removeQueries: ({ queryKey }) => removed.push(queryKey),
    getQueryCache: () => ({ findAll: () => [{ queryKey: listKey }] }),
    setQueryData: (_key, update) => { cache = update(cache); },
  };
  return {
    invalidated, removed, cache: () => cache,
    dependencies: {
      axios: { isCancel: () => false },
      "@tanstack/react-query": { useMutation: (options) => options, useQuery: (options) => options, useQueryClient: () => queryClient },
      "@/api/schedules": {}, "@/api/reminders": {},
      "@/hooks/useTodayHome": { TODAY_HOME_QUERY_KEY: ["home", "today"] },
      "@/hooks/useTodayBriefing": { TODAY_BRIEFING_QUERY_KEY: ["briefings", "today"] },
      "@/hooks/useTasks": { TASKS_QUERY_KEY: ["tasks"] },
      "@/hooks/useReminders": { REMINDERS_QUERY_KEY: ["reminders"] },
      "@/lib/syncLinkedTaskDates": { syncLinkedTaskDates: async () => {} },
      "@/lib/toast": { toast: {} },
      "@/utils/dateUtils": { toOffsetISOString: (date) => date.toISOString() },
      ...extra,
    },
  };
}

for (const name of ["useDeleteSchedule", "useDeleteSchedules"]) {
  test(`${name} refreshes tasks, reminders and briefings after a success or lost response`, async () => {
    const harness = mutationDependencies();
    const hook = load("hooks/useSchedules.ts", harness.dependencies)[name]();
    await hook.onSettled(undefined, new Error("lost response"));
    assert.deepEqual(harness.invalidated, [
      ["schedules"], ["home", "today"], ["tasks"], ["reminders"], ["briefings", "today"],
    ]);
  });
}

test("bulk schedule deletion removes only successfully deleted schedule caches", () => {
  const harness = mutationDependencies();
  const hook = load("hooks/useSchedules.ts", harness.dependencies).useDeleteSchedules();
  hook.onSuccess({ deleted_count: 1, failed_ids: [202] }, [201, 202]);
  assert.deepEqual(harness.cache(), [{ schedule_id: 202 }]);
  assert.deepEqual(harness.removed, [["schedules", "detail", 201]]);
});

test("reminder conflicts refresh the collection and detail queries after rejection", () => {
  const harness = mutationDependencies();
  const hook = load("hooks/useReminders.ts", harness.dependencies).useUpdateReminder();
  hook.onSettled(undefined, { response: { status: 409, data: { error: { code: "REMINDER_CHANGED" } } } });
  assert.deepEqual(harness.invalidated, [["reminders"], ["home", "today"]]);
});

function rescheduleHarness({ onCreate, listFails = false, initialCandidates = [], listError } = {}) {
  const task = { task_id: 1, title: "재계획 작업", status: "todo", schedule_id: null, due_datetime: "2026-10-01T00:00:00Z" };
  const candidates = [...initialCandidates];
  const calls = [];
  const states = [];
  const refs = [];
  let stateIndex = 0;
  let refIndex = 0;
  const dependencies = {
    react: {
      useRef: (value) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: value }),
      useState: (value) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = value;
        return [states[index], (next) => { states[index] = typeof next === "function" ? next(states[index]) : next; }];
      },
    },
    "@tanstack/react-query": { useQueryClient: () => ({ invalidateQueries: async () => {}, setQueryData: () => {} }) },
    "@/api/tasks": { getTask: async () => ({ success: true, data: { task: { ...task } } }) },
    "@/api/schedules": {
      getSchedule: async (id) => ({ success: true, data: { schedule: candidates.find((item) => item.schedule_id === id) } }),
      listSchedules: async (query) => {
        calls.push(["list", query]);
        if (listError) throw listError;
        if (listFails) throw new Error("offline");
        return { success: true, data: { schedules: [...candidates] } };
      },
    },
    "@/hooks/useSchedules": {
      SCHEDULES_QUERY_KEY: ["schedules"], scheduleDetailKey: (id) => ["schedules", "detail", id],
      useCreateSchedule: () => ({ mutateAsync: async (payload) => {
        calls.push(["create", payload]);
        if (onCreate) return onCreate(payload, candidates);
        const schedule = { schedule_id: candidates.length + 101, ...payload };
        candidates.push(schedule);
        return schedule;
      } }),
    },
    "@/hooks/useTasks": { TASKS_QUERY_KEY: ["tasks"], useUpdateTask: () => ({ mutateAsync: async ({ payload }) => {
      calls.push(["patch", payload]);
      Object.assign(task, payload);
      return task;
    } }) },
    "@/hooks/useTodayHome": { TODAY_HOME_QUERY_KEY: ["home", "today"] },
    "@/lib/homeTasks": { taskPlanStatus: () => "past" },
    "@/lib/toast": { toast: { success: () => {} } },
    "@/utils/dateUtils": { toOffsetISOString: (date) => date.toISOString() },
  };
  const hooks = load("hooks/useTaskReschedule.ts", dependencies);
  const render = () => {
    stateIndex = refIndex = 0;
    return hooks.useTaskReschedule("Asia/Seoul");
  };
  return { render, calls, task: { ...task }, candidates, currentTask: task };
}

const start = new Date("2026-10-20T01:00:00Z");

test("a committed schedule POST with a lost response is linked only after explicit candidate selection", async () => {
  const harness = rescheduleHarness({ onCreate: async (payload, candidates) => {
    candidates.push({ schedule_id: 101, ...payload });
    throw new Error("lost response");
  } });
  await assert.rejects(harness.render().save(harness.task, start, 30), /생성 응답/);
  assert.deepEqual(harness.render().creationRecovery[1].candidates.map((item) => item.schedule_id), [101]);
  await assert.rejects(harness.render().save(harness.task, start, 30), /생성 응답/);
  assert.equal(harness.calls.filter(([name]) => name === "create").length, 1);
  assert.equal(harness.calls.filter(([name]) => name === "patch").length, 0);
  const recovered = await harness.render().save(harness.task, start, 30, { scheduleId: 101 });
  assert.equal(recovered.schedule_id, 101);
  assert.equal(harness.currentTask.schedule_id, 101);
  assert.equal(harness.currentTask.due_datetime, harness.task.due_datetime);
  assert.equal(harness.calls.filter(([name]) => name === "create").length, 1);
});

test("ambiguous schedule candidates are preserved until the user chooses a specific ID", async () => {
  const harness = rescheduleHarness({ onCreate: async (payload, candidates) => {
    candidates.push({ schedule_id: 101, ...payload }, { schedule_id: 102, ...payload });
    throw new Error("lost response");
  } });
  await assert.rejects(harness.render().save(harness.task, start, 30));
  assert.equal(harness.render().creationRecovery[1].candidates.length, 2);
  await harness.render().save(harness.task, start, 30, { scheduleId: 102 });
  assert.equal(harness.currentTask.schedule_id, 102);
  assert.equal(harness.candidates.length, 2);
});

test("a new schedule after an uncertain POST requires a separate creation choice and a successful list check", async () => {
  let attempts = 0;
  const harness = rescheduleHarness({ onCreate: async (payload, candidates) => {
    if (++attempts === 1) throw new Error("lost response");
    const schedule = { schedule_id: 103, ...payload };
    candidates.push(schedule);
    return schedule;
  } });
  await assert.rejects(harness.render().save(harness.task, start, 30));
  await assert.rejects(harness.render().save(harness.task, start, 30));
  assert.equal(attempts, 1);
  await harness.render().save(harness.task, start, 30, { createNew: true });
  assert.equal(attempts, 2);
  assert.equal(harness.currentTask.schedule_id, 103);

  const offline = rescheduleHarness({ listFails: true, onCreate: async () => { throw new Error("offline"); } });
  await assert.rejects(offline.render().save(offline.task, start, 30), /생성 결과/);
  await assert.rejects(offline.render().save(offline.task, start, 30, { createNew: true }), /생성 결과/);
  assert.equal(offline.render().creationRecovery[1].listChecked, false);
  assert.equal(offline.calls.filter(([name]) => name === "create").length, 1);
});

test("a validated 400 rejection permits a normal retry without creating a recovery prompt", async () => {
  let attempts = 0;
  const harness = rescheduleHarness({ onCreate: async (payload, candidates) => {
    if (++attempts === 1) throw { response: { status: 400, data: { success: false, error: { code: "VALIDATION_ERROR" } } } };
    const schedule = { schedule_id: 105, ...payload };
    candidates.push(schedule);
    return schedule;
  } });
  await assert.rejects(harness.render().save(harness.task, start, 30));
  assert.equal(harness.render().creationRecovery[1], undefined);
  await harness.render().save(harness.task, start, 30);
  assert.equal(attempts, 2);
  assert.equal(harness.calls.filter(([name]) => name === "list").length, 0);
});

test("completed schedules are excluded from creation recovery and are never relinked", async () => {
  const harness = rescheduleHarness({ onCreate: async (payload, candidates) => {
    candidates.push({ schedule_id: 101, ...payload, is_completed: true });
    throw new Error("lost response");
  } });
  await assert.rejects(harness.render().save(harness.task, start, 30));
  assert.deepEqual(harness.render().creationRecovery[1].candidates, []);
  await assert.rejects(harness.render().save(harness.task, start, 30, { scheduleId: 101 }), /선택한 일정/);
  assert.equal(harness.currentTask.schedule_id, null);
});

test("a cancelled recovery list preserves cancellation and clears the old recovery attempt", async () => {
  const cancellation = Object.assign(new Error("session changed"), { code: "ERR_CANCELED" });
  const harness = rescheduleHarness({
    listError: cancellation,
    onCreate: async () => { throw new Error("lost response"); },
  });
  await assert.rejects(harness.render().save(harness.task, start, 30), (error) => error === cancellation);
  assert.equal(harness.render().creationRecovery[1], undefined);
});
