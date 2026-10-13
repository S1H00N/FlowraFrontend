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
const invalidated = [];
const queryClient = {
  invalidateQueries: async ({ queryKey }) => { invalidated.push(queryKey); },
};
const client = Object.fromEntries(
  ["get", "post", "patch", "delete"].map((method) => [method, async (...args) => {
    calls.push({ method, args });
    return { data: { success: true, message: "OK", data: response } };
  }]),
);
const mocks = {
  "@tanstack/react-query": {
    useMutation: (options) => options,
    useQueryClient: () => queryClient,
  },
  "@/hooks/useSchedules": { SCHEDULES_QUERY_KEY: ["schedules"] },
  "@/hooks/useTasks": { TASKS_QUERY_KEY: ["tasks"] },
  "@/hooks/useReminders": { REMINDERS_QUERY_KEY: ["reminders"] },
  "@/hooks/useTodayBriefing": { TODAY_BRIEFING_QUERY_KEY: ["briefings", "today"] },
  "@/hooks/useTodayHome": { TODAY_HOME_QUERY_KEY: ["home", "today"] },
};
const cache = new Map();
function loadSource(source) {
  const filename = [source, `${source}.ts`, path.join(source, "index.ts")].find(
    (file) => file.endsWith(".ts") && existsSync(file),
  );
  if (!filename) throw new Error(`Missing test module: ${source}`);
  if (filename === path.join(webRoot, "src/api/client.ts"))
    return { __esModule: true, default: client };
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
  const importModule = (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    return specifier.startsWith("@/")
      ? loadSource(path.join(webRoot, "src", specifier.slice(2)))
      : specifier.startsWith(".")
        ? loadSource(path.resolve(path.dirname(filename), specifier))
        : require(specifier);
  };
  new Function("require", "module", "exports", compiled)(importModule, module, module.exports);
  return module.exports;
}
const chat = loadSource(path.join(webRoot, "src/api/aiChat"));
const memos = loadSource(path.join(webRoot, "src/api/memos"));
const briefing = loadSource(path.join(webRoot, "src/api/briefings"));
const actions = loadSource(path.join(webRoot, "src/lib/aiActionState"));
const memoHooks = loadSource(path.join(webRoot, "src/hooks/useMemos"));
const chatHooks = loadSource(path.join(webRoot, "src/hooks/useAiChat"));

const expectedApplyQueries = [
  ["memos"], ["tasks"], ["schedules"], ["reminders"],
  ["briefings", "today"], ["home", "today"],
];

test("chat detail uses GET and preserves message order and application history", async () => {
  const applications = [{ action_index: 0, resource_type: "schedule", resource_id: 91 }];
  response = { session: {
    ai_chat_session_id: 5,
    status: "archived",
    messages: [
      { ai_chat_message_id: 11, ai_chat_session_id: 5, role: "user", content: "회의" },
      { ai_chat_message_id: 12, ai_chat_session_id: 5, role: "assistant", content: "제안", applications },
    ],
  } };
  const result = await chat.getAiChatSession(5);
  assert.deepEqual(calls.at(-1), { method: "get", args: ["/ai-chat/sessions/5"] });
  assert.equal(result.data.session.session_id, 5);
  assert.equal(result.data.session.status, "archived");
  assert.deepEqual(result.data.session.messages.map((entry) => entry.message_id), [11, 12]);
  assert.equal(result.data.session.messages[1].session_id, 5);
  assert.deepEqual(result.data.session.messages[1].applications, applications);
});

test("missing chat detail propagates the 404 without creating another session", async (t) => {
  const error = { isAxiosError: true, response: { status: 404, data: { error: { code: "AI_CHAT_SESSION_NOT_FOUND" } } } };
  const start = calls.length;
  const mock = t.mock.method(client, "get", async () => { throw error; });
  await assert.rejects(() => chat.getAiChatSession(5), (actual) => actual === error);
  assert.equal(mock.mock.callCount(), 1);
  assert.equal(calls.length, start);
});

test("AI apply sends only declared DTO fields and pins the memo result version", async () => {
  response = { resource: null, resources: [], applied_action_indexes: [0] };
  const payload = {
    apply_type: "action", action_index: 0, category_id: 3, schedule_id: 21,
    ai_result_id: 44, suggested_actions: [{ title: "changed" }], recurrence: { repeat_interval_days: 1 },
  };
  await memos.applyMemo(12, payload);
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/memos/12/apply", {
    apply_type: "action", action_index: 0, ai_result_id: "44", category_id: "3", schedule_id: "21",
  }] });
  await chat.applyAiChatMessageAction(86, payload);
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/ai-chat/messages/86/apply", {
    apply_type: "action", action_index: 0, category_id: "3", schedule_id: "21",
  }] });
  const result = await memos.applyMemo(12, { ai_result_id: 44, apply_type: "all" });
  assert.deepEqual(calls.at(-1).args[1], { apply_type: "all", ai_result_id: "44" });
  assert.equal(result.data.resource, null);
  assert.deepEqual(result.data.resources, []);
});

test("explicit null latest memo result does not restore a stale compatibility result", async () => {
  response = {
    memo: { memo_id: 12, parse_status: "pending", parse_requested: true },
    latest_result: null,
    result: { ai_result_id: 43, status: "approved" },
    parse_results: [{ ai_result_id: 43, status: "approved" }],
  };
  const result = await memos.getMemoParseResult(12);
  assert.equal(result.data.latest_result, null);
  assert.equal(result.data.parse_results[0].ai_result_id, 43);
  assert.equal(result.data.memo.parse_requested, true);
});

test("null memo parse responses remain safe while the status is reloaded", async () => {
  response = { memo: null };
  assert.equal((await memos.parseMemo(12)).data.memo, null);
  response = { memo: null, memo_id: 12, parse_status: "pending", latest_result: null };
  const result = await memos.getMemoParseResult(12);
  assert.equal(result.data.memo.memo_id, 12);
  assert.equal(result.data.memo.parse_status, "pending");
  assert.equal(memoHooks.isMemoParseInFlight(result.data.memo), false);
});

test("detail applications preserve original action indexes and computed state wins", () => {
  assert.equal(actions.isAiActionApplied({ applications: [{ action_index: 0 }] }, 0), true);
  assert.equal(actions.isAiActionApplied({ applications: [{ action_index: 0 }] }, 1), false);
  assert.equal(actions.isAiActionApplied({
    applications: [{ action_index: 0 }],
    action_states: [{ action_index: 0, applied: false }],
  }, 0), false);
});

test("reloaded unapplied actions discard local resource IDs before schedule recreation", () => {
  const previous = { 0: [{ type: "schedule", id: 91 }], 1: [{ type: "task", id: 92 }] };
  const reloaded = {
    status: "approved",
    applied_action_indexes: [1], remaining_action_indexes: [0],
    action_states: [{ action_index: 0, applicable: true, applied: false }, { action_index: 1, applicable: true, applied: true }],
  };
  const reconciled = actions.reconcileAiAppliedResources(reloaded, previous);
  assert.deepEqual(reconciled, { 1: [{ type: "task", id: 92 }] });
  const recreated = { ...reconciled, 0: [...(reconciled[0] ?? []), { type: "schedule", id: 93 }] };
  assert.equal(recreated[0][0].id, 93);
  assert.equal(actions.reconcileAiAppliedResources({ applied_action_indexes: [0, 1] }, recreated), recreated);
});

test("memo polling distinguishes requested work from unrequested pending memos", () => {
  assert.equal(memoHooks.isMemoParseInFlight({ parse_status: "pending", parse_requested: true }), true);
  assert.equal(memoHooks.isMemoParseInFlight({ parse_status: "pending", parse_requested: false }), false);
  assert.equal(memoHooks.isMemoParseInFlight({ parse_status: "pending" }), false);
  assert.equal(memoHooks.isMemoParseInFlight({ parse_status: "processing" }), true);
  assert.equal(memoHooks.isMemoParseInFlight({ parse_status: "failed", parse_requested: true }), false);
});

test("memo apply reconciles stored state after success, conflicts and lost responses", async () => {
  const mutation = memoHooks.useApplyMemo();
  assert.equal(mutation.retry, false);
  for (const error of [null, new Error("Network unavailable"), {
    response: { status: 409, data: { error: { code: "AI_RESULT_ALREADY_APPLIED" } } },
  }]) {
    invalidated.length = 0;
    await mutation.onSettled(undefined, error, { memoId: 12 });
    assert.deepEqual(invalidated, expectedApplyQueries);
  }
});

test("memo parse requests are not retried automatically and refresh conflict state", async () => {
  const mutation = memoHooks.useParseMemo();
  assert.equal(mutation.retry, false);
  response = { memo: { memo_id: 12, parse_status: "pending", parse_requested: true } };
  await mutation.mutationFn({ memoId: 12, force: true });
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/memos/12/parse", { force: true }] });
  invalidated.length = 0;
  await mutation.onSettled(undefined, new Error("Conflict"));
  assert.deepEqual(invalidated, [["memos"]]);
});

test("chat apply reloads resources after a lost response and refreshes a missing session", async () => {
  const mutation = chatHooks.useApplyAiChatMessageAction();
  invalidated.length = 0;
  await mutation.onError(new Error("Network unavailable"), { sessionId: 5, messageId: 86 });
  assert.deepEqual(invalidated, [
    ["ai-chat", "messages", 5], ["tasks"], ["schedules"], ["reminders"],
    ["home", "today"], ["briefings", "today"],
  ]);
  invalidated.length = 0;
  await mutation.onError({ isAxiosError: true, response: { status: 404, data: { error: { code: "AI_CHAT_SESSION_NOT_FOUND" } } } }, { sessionId: 5, messageId: 86 });
  assert.ok(invalidated.some((key) => JSON.stringify(key) === JSON.stringify(["ai-chat", "sessions"])));
});

test("today briefing uses the documented date query and preserves aggregate arrays", async () => {
  response = {
    date: "2026-10-13", summary: { schedule_count: 0, task_count: 0, overdue_task_count: 0, reminder_count: 0 },
    schedules: [], company_schedules: [], tasks: [], overdue_tasks: [],
    project_work_items: [], overdue_project_work_items: [], reminders: [],
  };
  const result = await briefing.getTodayBriefing({ date: "2026-10-13", timezone: "Asia/Seoul" });
  assert.deepEqual(calls.at(-1), { method: "get", args: ["/briefings/today", { params: { date: "2026-10-13" } }] });
  assert.deepEqual(result.data, response);
});
