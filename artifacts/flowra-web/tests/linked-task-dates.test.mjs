import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const axios = require("axios");
const { QueryClient, QueryObserver } = require("@tanstack/react-query");

function loadModule(relativePath, dependencies) {
  const source = readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => dependencies[name] ?? require(name), module, module.exports,
  );
  return module.exports;
}

const dateUtils = loadModule("utils/dateUtils.ts", {});
const localDatetime = (year, month, day, hour = 10, minute = 0) =>
  dateUtils.toOffsetISOString(new Date(year, month - 1, day, hour, minute));
const schedule = (day = 10, scheduleId = 201) => ({
  schedule_id: scheduleId,
  start_datetime: localDatetime(2026, 9, day),
  end_datetime: localDatetime(2026, 9, day, 11),
});

function loadSync(api) {
  return loadModule("lib/syncLinkedTaskDates.ts", {
    "@/api/tasks": api,
    "@/utils/dateUtils": dateUtils,
  }).syncLinkedTaskDates;
}

function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("moving a schedule queries every linked task and preserves each task's time and completion", async () => {
  const tasks = [
    { task_id: 1, status: "todo", due_datetime: localDatetime(2026, 9, 9, 12, 30) },
    { task_id: 2, status: "done", due_datetime: localDatetime(2026, 8, 31, 18, 45) },
    { task_id: 3, status: "todo", due_datetime: null },
    { task_id: 4, status: "todo", due_datetime: localDatetime(2026, 9, 10, 9) },
  ];
  const queries = [];
  const updates = [];
  const sync = loadSync({
    listTasks: async (query) => { queries.push(query); return { success: true, data: { tasks } }; },
    updateTask: async (taskId, payload) => { updates.push({ taskId, payload }); return { success: true }; },
  });

  await sync(schedule());

  assert.deepEqual(queries, [{ schedule_id: 201 }]);
  assert.deepEqual(updates, [
    { taskId: 1, payload: { due_datetime: localDatetime(2026, 9, 10, 12, 30) } },
    { taskId: 2, payload: { due_datetime: localDatetime(2026, 9, 10, 18, 45) } },
  ]);
  assert.equal(tasks[0].status, "todo");
  assert.equal(tasks[1].status, "done");
});

test("a multi-day schedule does not infer a new task deadline", async () => {
  const sync = loadSync({
    listTasks: async () => assert.fail("Multi-day schedules must not change task deadlines"),
  });
  await sync({ ...schedule(), end_datetime: localDatetime(2026, 9, 11, 11) });
});

test("partial task failure waits for all writes and a manual retry only writes the outstanding date", async () => {
  const tasks = [1, 2, 3].map((taskId) => ({ task_id: taskId, due_datetime: localDatetime(2026, 9, 9, taskId + 10) }));
  const lastWrite = deferred();
  const writes = [];
  let firstAttempt = true;
  const sync = loadSync({
    listTasks: async () => ({ success: true, data: { tasks } }),
    updateTask: async (taskId, payload) => {
      writes.push(taskId);
      if (firstAttempt && taskId === 1) return { success: false, message: "deadline rejected" };
      if (firstAttempt && taskId === 3) await lastWrite.promise;
      tasks.find((task) => task.task_id === taskId).due_datetime = payload.due_datetime;
      return { success: true };
    },
  });
  let completed = false;
  const result = sync(schedule()).finally(() => { completed = true; });
  const failure = assert.rejects(result, /deadline rejected/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, [1, 2, 3]);
  assert.equal(completed, false);
  lastWrite.resolve();
  await failure;
  firstAttempt = false;
  await sync(schedule());
  assert.deepEqual(writes, [1, 2, 3, 1]);
  assert.ok(tasks.every((task) => task.due_datetime.startsWith("2026-09-10T")));
});

test("a failed linked-task read rejects before any task is changed", async () => {
  const sync = loadSync({
    listTasks: async () => ({ success: false, message: "task read failed" }),
    updateTask: async () => assert.fail("No writes after a failed task read"),
  });
  await assert.rejects(sync(schedule()), /task read failed/);
});

test("a session cancellation takes precedence over an earlier task failure", async () => {
  const sync = loadSync({
    listTasks: async () => ({ success: true, data: { tasks: [
      { task_id: 1, due_datetime: localDatetime(2026, 9, 9, 12) },
      { task_id: 2, due_datetime: localDatetime(2026, 9, 9, 13) },
    ] } }),
    updateTask: async (taskId) => {
      if (taskId === 1) throw new Error("earlier task failed");
      throw new axios.CanceledError("Session changed while awaiting response");
    },
  });
  await assert.rejects(sync(schedule()), (error) => axios.isCancel(error));
});

function loadScheduleHooks(queryClient, { api = {}, sync = async () => {}, errors = [] } = {}) {
  return loadModule("hooks/useSchedules.ts", {
    "@tanstack/react-query": { useMutation: (options) => options, useQueryClient: () => queryClient },
    "@/api/schedules": api,
    "@/hooks/useTodayHome": { TODAY_HOME_QUERY_KEY: ["home", "today"] },
    "@/hooks/useTasks": { TASKS_QUERY_KEY: ["tasks"] },
    "@/lib/syncLinkedTaskDates": { syncLinkedTaskDates: sync },
    "@/lib/toast": { toast: { error: (message) => errors.push(message) } },
    "@/utils/dateUtils": dateUtils,
  });
}

function observeQuery(queryClient, queryKey, queryFn) {
  const observer = new QueryObserver(queryClient, { queryKey, queryFn, staleTime: Infinity });
  return observer.subscribe(() => {});
}

test("a lost schedule PATCH response refetches server state without repeating the write", async (t) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  t.after(() => queryClient.clear());
  let storedSchedule = { ...schedule(9), title: "saved schedule" };
  const listKey = ["schedules", "list", {}];
  const detailKey = ["schedules", "detail", 201];
  queryClient.setQueryData(listKey, [storedSchedule]);
  queryClient.setQueryData(detailKey, storedSchedule);
  const stopList = observeQuery(queryClient, listKey, async () => [storedSchedule]);
  const stopDetail = observeQuery(queryClient, detailKey, async () => storedSchedule);
  t.after(() => { stopList(); stopDetail(); });
  let writes = 0;
  const hooks = loadScheduleHooks(queryClient, { api: {
    updateSchedule: async () => {
      writes += 1;
      storedSchedule = { ...storedSchedule, ...schedule(10) };
      throw new Error("response lost after commit");
    },
  } });
  const mutation = hooks.useUpdateSchedule();
  const variables = { scheduleId: 201, payload: { start_datetime: schedule(10).start_datetime } };
  await assert.rejects(async () => {
    try {
      await mutation.mutationFn(variables);
    } catch (error) {
      await mutation.onError?.(error, variables);
      throw error;
    }
  }, /response lost after commit/);
  assert.equal(writes, 1);
  assert.equal(queryClient.getQueryData(listKey)[0].start_datetime, storedSchedule.start_datetime);
  assert.equal(queryClient.getQueryData(detailKey).start_datetime, storedSchedule.start_datetime);
});

test("home and task caches refresh after the linked deadline writes finish", async (t) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  t.after(() => queryClient.clear());
  let dueDatetime = localDatetime(2026, 9, 9, 12, 30);
  const taskKey = ["tasks", "list", {}];
  const homeKey = ["home", "today", {}];
  queryClient.setQueryData(taskKey, dueDatetime);
  queryClient.setQueryData(homeKey, dueDatetime);
  const stopTasks = observeQuery(queryClient, taskKey, async () => dueDatetime);
  const stopHome = observeQuery(queryClient, homeKey, async () => dueDatetime);
  t.after(() => { stopTasks(); stopHome(); });
  const finishSync = deferred();
  const hooks = loadScheduleHooks(queryClient, { sync: async () => {
    await finishSync.promise;
    dueDatetime = localDatetime(2026, 9, 10, 12, 30);
  } });
  const mutation = hooks.useUpdateSchedule();
  const result = mutation.onSuccess(schedule(), { payload: { start_datetime: schedule().start_datetime } });
  // Let the schedule-only invalidation finish while task writes are pending.
  await new Promise((resolve) => setImmediate(resolve));
  finishSync.resolve();
  await result;
  assert.equal(queryClient.getQueryData(taskKey), dueDatetime);
  assert.equal(queryClient.getQueryData(homeKey), dueDatetime);
});

test("a partially synced schedule warns once and refetches successful and failed deadlines", async (t) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  t.after(() => queryClient.clear());
  const initial = [localDatetime(2026, 9, 9, 12), localDatetime(2026, 9, 9, 13)];
  let storedDeadlines = initial;
  const taskKey = ["tasks", "list", {}];
  queryClient.setQueryData(taskKey, initial);
  const stopTasks = observeQuery(queryClient, taskKey, async () => storedDeadlines);
  t.after(stopTasks);
  const errors = [];
  const hooks = loadScheduleHooks(queryClient, { errors, sync: async () => {
    storedDeadlines = [localDatetime(2026, 9, 10, 12), initial[1]];
    throw new Error("second task failed");
  } });
  await hooks.useUpdateSchedule().onSuccess(schedule(), { payload: { start_datetime: schedule().start_datetime } });
  assert.deepEqual(queryClient.getQueryData(taskKey), storedDeadlines);
  assert.deepEqual(errors, ["일정 날짜는 변경됐지만 연결된 할 일 날짜를 모두 갱신하지 못했습니다."]);
});

test("a cancelled deadline response does not display an old-session partial-failure warning", async (t) => {
  const queryClient = new QueryClient();
  t.after(() => queryClient.clear());
  const errors = [];
  const hooks = loadScheduleHooks(queryClient, { errors, sync: async () => {
    throw new axios.CanceledError("Session changed while awaiting response");
  } });
  await hooks.useUpdateSchedule().onSuccess(schedule(), { payload: { start_datetime: schedule().start_datetime } });
  assert.deepEqual(errors, []);
});

test("series date synchronization visits every changed occurrence and refreshes after a failure", async () => {
  const changed = [schedule(10, 201), schedule(11, 202)];
  const invalidated = [];
  const synced = [];
  const errors = [];
  let cancelled = false;
  const queryClient = {
    removeQueries: () => {},
    invalidateQueries: async ({ queryKey }) => { invalidated.push(queryKey); },
  };
  const hooks = loadModule("hooks/useScheduleSeries.ts", {
    "@tanstack/react-query": { useMutation: (options) => options, useQueryClient: () => queryClient },
    "@/api/schedules": {},
    "@/hooks/useSchedules": { SCHEDULES_QUERY_KEY: ["schedules"], scheduleDetailKey: (id) => ["schedules", "detail", id] },
    "@/hooks/useTasks": { TASKS_QUERY_KEY: ["tasks"] },
    "@/hooks/useReminders": { REMINDERS_QUERY_KEY: ["reminders"] },
    "@/hooks/useTodayHome": { TODAY_HOME_QUERY_KEY: ["home", "today"] },
    "@/hooks/useTodayBriefing": { TODAY_BRIEFING_QUERY_KEY: ["briefings", "today"] },
    "@/lib/syncLinkedTaskDates": { syncLinkedTaskDates: async (item) => {
      synced.push(item.schedule_id);
      if (item.schedule_id === 201) throw new Error("task failed");
      if (cancelled) throw new axios.CanceledError("Session changed while awaiting response");
    } },
    "@/lib/toast": { toast: { error: (message) => errors.push(message) } },
  });
  const mutation = hooks.useUpdateScheduleSeries();
  const impact = { schedules: changed, removed_schedule_ids: [] };
  await mutation.onSuccess(impact, { payload: { changes: { title: "content only" } } });
  assert.deepEqual(synced, []);
  await mutation.onSuccess(impact, { payload: { changes: { start_datetime: changed[0].start_datetime } } });
  await mutation.onSettled(impact);
  assert.deepEqual(synced, [201, 202]);
  assert.equal(errors.length, 1);
  assert.deepEqual(invalidated, [["schedules"], ["tasks"], ["reminders"], ["home", "today"], ["briefings", "today"]]);
  cancelled = true;
  await mutation.onSuccess(impact, { payload: { changes: { start_datetime: changed[0].start_datetime } } });
  assert.equal(errors.length, 1, "Cancelled old-session responses must not show another failure warning");
});
