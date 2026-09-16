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
const calls = [];
const clientMock = Object.fromEntries(
  ["get", "post", "patch", "put", "delete"].map((method) => [
    method,
    async (...args) => {
      calls.push({ method, args });
      return { data: { success: true, message: "OK", data: response } };
    },
  ]),
);
const modules = {
  schedules: "api/schedules",
  tasks: "api/tasks",
  memos: "api/memos",
  chat: "api/aiChat",
  company: "api/companySchedules",
  projects: "api/companyProjects",
  notices: "api/notices",
  home: "api/home",
  reminders: "api/reminders",
  schemas: "lib/schemas",
  actions: "lib/aiActionState",
  calendar: "lib/projectCalendar",
};
const cache = new Map();
function loadSource(source) {
  const filename = [source, `${source}.ts`, path.join(source, "index.ts")].find(
    (file) => file.endsWith(".ts") && existsSync(file),
  );
  if (!filename) throw new Error(`Missing test module: ${source}`);
  if (filename === path.join(webRoot, "src/api/client.ts"))
    return { __esModule: true, default: clientMock, apiClient: clientMock };
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const importModule = (specifier) =>
    specifier.startsWith("@/")
      ? loadSource(path.join(webRoot, "src", specifier.slice(2)))
      : specifier.startsWith(".")
        ? loadSource(path.resolve(path.dirname(filename), specifier))
        : require(specifier);
  new Function("require", "module", "exports", compiled)(
    importModule,
    module,
    module.exports,
  );
  return module.exports;
}
const api = Object.fromEntries(
  Object.entries(modules).map(([name, file]) => [
    name,
    loadSource(path.join(webRoot, "src", file)),
  ]),
);
const lastCall = () => calls.at(-1);
const body = () => JSON.parse(JSON.stringify(lastCall().args[1]));

test("chat deletion uses the session endpoint and accepts success or no content", async (t) => {
  await api.chat.deleteAiChatSession(42);
  assert.deepEqual(lastCall(), { method: "delete", args: ["/ai-chat/sessions/42"] });
  t.mock.method(clientMock, "delete", async () => ({ status: 204 }));
  await assert.doesNotReject(() => api.chat.deleteAiChatSession(42));
});

test("chat deletion rejects failed responses and network errors", async (t) => {
  const mock = t.mock.method(clientMock, "delete", async () => ({
    status: 200, data: { success: false, message: "Deletion refused" },
  }));
  await assert.rejects(() => api.chat.deleteAiChatSession(42), /Deletion refused/);
  mock.mock.mockImplementation(async () => { throw new Error("Network unavailable"); });
  await assert.rejects(() => api.chat.deleteAiChatSession(42), /Network unavailable/);
});

test("chat deletion accepts only the documented missing-session 404", async (t) => {
  const failure = {
    isAxiosError: true,
    response: { status: 404, data: { error: { code: "AI_CHAT_SESSION_NOT_FOUND" } } },
  };
  t.mock.method(clientMock, "delete", async () => { throw failure; });
  await assert.doesNotReject(() => api.chat.deleteAiChatSession(42));
  failure.response.data.error.code = "NOT_FOUND";
  await assert.rejects(() => api.chat.deleteAiChatSession(42), (error) => error === failure);
  failure.response.status = 400;
  failure.response.data.error.code = "AI_CHAT_SESSION_NOT_FOUND";
  await assert.rejects(() => api.chat.deleteAiChatSession(42), (error) => error === failure);
});

test("create omits absent relation IDs, patch preserves explicit null unlinking", async () => {
  for (const [name, create, update, wrapper] of [
    ["schedules", "createSchedule", "updateSchedule", "schedule"],
    ["tasks", "createTask", "updateTask", "task"],
    ["memos", "createMemo", "updateMemo", "memo"],
  ]) {
    response = { [wrapper]: { [`${wrapper}_id`]: 21 } };
    await api[name][create]({
      title: "Test",
      raw_text: "Test",
      category_id: null,
    });
    assert.equal("category_id" in body(), false, `${name} create`);
    await api[name][update](21, { category_id: null });
    assert.deepEqual(body(), { category_id: null });
    await api[name][update](21, { category_id: 3 });
    assert.deepEqual(body(), { category_id: "3" });
  }
  response = { task: {} };
  await api.tasks.createTask({ title: "Task", schedule_id: null });
  assert.equal("schedule_id" in body(), false);
  await api.tasks.updateTask(1, { schedule_id: null });
  assert.deepEqual(body(), { schedule_id: null });
});

test("recurring creation preserves recurrence rules and omits empty category", async () => {
  response = { recurrence_group_id: "group", schedules: [] };
  await api.schedules.createRecurringSchedule({
    title: "Weekly",
    start_datetime: "2026-06-01T10:00:00+09:00",
    category_id: null,
    repeat_interval_days: 7,
    repeat_until: "2026-08-30T10:00:00+09:00",
    weekday_rules: [{ weekday: "sunday", action: "skip" }],
  });
  assert.equal(lastCall().args[0], "/schedules/recurring");
  assert.equal("category_id" in body(), false);
  assert.deepEqual(body().weekday_rules, [
    { weekday: "sunday", action: "skip" },
  ]);
});

test("memo queries send only documented filters and parse returns asynchronous state", async () => {
  response = { memos: [] };
  await api.memos.listMemos({
    memo_type: "quick",
    category_id: 4,
    page: 2,
    size: 20,
  });
  assert.deepEqual(body().params, { memo_type: "quick", category_id: "4" });
  response = { memo: { memo_id: 12, parse_status: "pending" } };
  const result = await api.memos.parseMemo(12, true);
  assert.equal(lastCall().args[0], "/memos/12/parse");
  assert.deepEqual(body(), { force: true });
  assert.equal(result.data.memo.parse_status, "pending");
});

test("AI apply keeps numeric action index and serializes relation IDs", async () => {
  response = {
    result_status: "partially_applied",
    remaining_action_indexes: [1],
    action_states: [{ action_index: 0, applied: true }],
  };
  const result = await api.memos.applyMemo(12, {
    ai_result_id: 44,
    apply_type: "action",
    action_index: 0,
    category_id: 3,
    schedule_id: 21,
  });
  assert.deepEqual(body(), {
    ai_result_id: "44",
    apply_type: "action",
    action_index: 0,
    category_id: "3",
    schedule_id: "21",
  });
  assert.deepEqual(result.data.remaining_action_indexes, [1]);
  await api.chat.applyAiChatMessageAction(8, { apply_type: "all" });
  assert.deepEqual(body(), { apply_type: "all" });
});

test("chat uses documented content and canonical backend IDs", async () => {
  response = { session: { ai_chat_session_id: 5, title: "Test" } };
  assert.equal(
    (await api.chat.createAiChatSession({ title: "Test" })).data.session
      .session_id,
    5,
  );
  response = {
    user_message: { ai_chat_message_id: 11, role: "user", content: "Hello" },
    assistant_message: {
      ai_chat_message_id: 12,
      role: "assistant",
      content: "Hi",
    },
  };
  const result = await api.chat.sendAiChatMessage(5, { content: "Hello" });
  assert.deepEqual(body(), { content: "Hello" });
  assert.equal(result.data.assistant_message.message_id, 12);
});

test("server action state takes precedence over stale aggregate status", () => {
  const schedule = { type: "create_schedule" };
  const state = {
    action_status: "applied",
    applied_action_indexes: [0, 1],
    remaining_action_indexes: [1],
    action_states: [{ action_index: 1, applicable: true, applied: false }],
  };
  assert.equal(api.actions.isAiActionApplied(state, 1), false);
  assert.equal(api.actions.canApplyAiAction(state, schedule, 1), true);
  assert.equal(
    api.actions.canApplyAiAction({ status: "rejected" }, schedule, 0),
    false,
  );
  assert.equal(
    api.actions.canApplyAiAction({}, { type: "pending_item" }, 0),
    false,
  );
  assert.equal(
    api.actions.canApplyAiAction({ remaining_action_indexes: [] }, schedule, 0),
    false,
  );
  assert.equal(
    api.actions.canApplyAiAction(
      {
        action_states: [{ action_index: 0, applicable: false, applied: false }],
      },
      schedule,
      0,
    ),
    false,
  );
  assert.equal(
    api.actions.canApplyAiAction(
      {
        status: "approved",
        result_status: "partially_applied",
        remaining_action_indexes: [1],
      },
      schedule,
      1,
    ),
    true,
  );
});

test("company feed retains project items and documented filters", async () => {
  const item = {
    item_type: "project_work_item",
    id: 7,
    assignment_id: 9,
    title: "Work",
    project_name: "ERP",
  };
  response = {
    company_schedules: [],
    project_work_items: [item],
    summary: { company_schedule_count: 0, project_work_item_count: 1 },
  };
  const result = await api.company.listCompanySchedules({
    project_id: 2,
    include_project_work_items: true,
    include_done_project_work_items: false,
    project_work_item_limit: 500,
  });
  assert.deepEqual(body().params, {
    project_id: "2",
    include_project_work_items: "true",
    include_done_project_work_items: "false",
    project_work_item_limit: 500,
  });
  assert.deepEqual(result.data.project_work_items, [item]);
});

test("project assignment mutations and reminders use their own resource paths", async () => {
  response = { assignment: { assignment_id: 9, status: "done" } };
  await api.projects.updateCompanyProjectWorkAssignment(9, {
    status: "done",
    progress_percent: 100,
    completed_at: "2026-07-31T09:00:00+09:00",
  });
  assert.equal(lastCall().args[0], "/company-projects/work-assignments/9");
  assert.equal(body().progress_percent, 100);
  response = { reminder: { reminder_id: 1 } };
  await api.projects.createCompanyProjectWorkReminder(9, {
    remind_at: "2026-07-30T09:00:00+09:00",
    reminder_type: "custom",
    message: "Check",
  });
  assert.equal(
    lastCall().args[0],
    "/company-projects/work-assignments/9/reminders",
  );
  await api.reminders.createReminder({
    target_type: "project_work_assignment",
    target_id: 9,
    remind_at: "2026-07-30T09:00:00+09:00",
  });
  assert.equal(body().target_id, "9");
});

test("project calendar uses assignment identity and server dates", () => {
  const item = {
    id: 7,
    assignment_id: 9,
    title: "Work",
    project_name: "ERP",
    start_datetime: "2026-07-01T00:00:00+09:00",
    status: "done",
  };
  const first = api.calendar.projectWorkItemToSchedule(item);
  const second = api.calendar.projectWorkItemToSchedule({
    ...item,
    assignment_id: 10,
  });
  assert.notEqual(first.schedule_id, second.schedule_id);
  assert.equal(first.project_work_item.assignment_id, 9);
  assert.equal(first.start_datetime, item.start_datetime);
  assert.equal(first.is_completed, true);
  assert.equal(
    api.calendar.projectWorkItemToSchedule({ ...item, start_datetime: null }),
    null,
  );
});

test("home retains project work, focus references and completed schedules", async () => {
  response = {
    date: "2026-07-01",
    timezone: "Asia/Seoul",
    today_schedules: [{ id: 1, title: "Done", is_completed: true }],
    project_work_items: [{ id: 7, assignment_id: 9 }],
    overdue_project_work_items: [{ id: 8, assignment_id: 10 }],
    focus_items: [{ item_type: "project_work_item", id: 7, assignment_id: 9 }],
  };
  const result = await api.home.getTodayHome();
  assert.equal(result.data.summary.today_personal_schedule_count, 0);
  assert.equal(result.data.today_schedules.length, 1);
  assert.deepEqual(result.data.project_work_items, response.project_work_items);
  assert.deepEqual(result.data.focus_items, response.focus_items);
});

test("notices preserve pagination metadata and body format", async () => {
  response = {
    notices: [{ notice_id: 1, body_format: "markdown", body: "**Notice**" }],
    meta: { page: 2, page_size: 20, total: 22, total_pages: 2 },
  };
  const result = await api.notices.listNotices({ page: 2, page_size: 20 });
  assert.deepEqual(body().params, { page: 2, page_size: 20 });
  assert.deepEqual(result.data.meta, response.meta);
  response = { notice: response.notices[0] };
  assert.equal(
    (await api.notices.getNotice(1)).data.notice.body_format,
    "markdown",
  );
});

test("form limits match specification boundaries", () => {
  assert.equal(
    api.schemas.signupSchema.safeParse({
      name: "가".repeat(50),
      email: "test@example.com",
      password: "a".repeat(72),
    }).success,
    true,
  );
  assert.equal(
    api.schemas.signupSchema.safeParse({
      name: "가",
      email: "test@example.com",
      password: "a".repeat(73),
    }).success,
    false,
  );
  assert.equal(
    api.schemas.taskSchema.safeParse({
      title: "가".repeat(100),
      priority: "medium",
      status: "todo",
    }).success,
    true,
  );
  assert.equal(
    api.schemas.taskSchema.safeParse({
      title: "가".repeat(101),
      priority: "medium",
      status: "todo",
    }).success,
    false,
  );
  assert.equal(
    api.schemas.memoSchema.safeParse({
      raw_text: "가".repeat(20000),
      memo_type: "quick",
    }).success,
    true,
  );
  assert.equal(
    api.schemas.memoSchema.safeParse({
      raw_text: "가".repeat(20001),
      memo_type: "quick",
    }).success,
    false,
  );
});
