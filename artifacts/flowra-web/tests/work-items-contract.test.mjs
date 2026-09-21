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
let rejection;
const calls = [];
const invalidations = [];
const client = Object.fromEntries(
  ["get", "post", "patch", "delete"].map((method) => [method, async (...args) => {
    calls.push({ method, args });
    if (rejection) throw rejection;
    return { data: { success: true, message: "OK", data: response } };
  }]),
);
const queryClient = {
  invalidateQueries: ({ queryKey }) => { invalidations.push(queryKey); return Promise.resolve(); },
  getQueryCache: () => ({ findAll: () => [{ queryKey: ["company-schedules", "list", {}] }] }),
  setQueryData: (...args) => { calls.push({ method: "setQueryData", args }); },
};
const cache = new Map();
function loadSource(source) {
  const filename = [source, `${source}.ts`, path.join(source, "index.ts")].find(
    (file) => file.endsWith(".ts") && existsSync(file),
  );
  if (!filename) throw new Error(`Missing test module: ${source}`);
  if (filename === path.join(webRoot, "src/api/client.ts")) {
    return { __esModule: true, default: client, apiClient: client };
  }
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const importModule = (specifier) => {
    if (specifier === "@tanstack/react-query") {
      return { useMutation: (options) => options, useQuery: (options) => options, useQueryClient: () => queryClient };
    }
    if (specifier.startsWith("@/")) return loadSource(path.join(webRoot, "src", specifier.slice(2)));
    if (specifier.startsWith(".")) return loadSource(path.resolve(path.dirname(filename), specifier));
    return require(specifier);
  };
  new Function("require", "module", "exports", compiled)(importModule, module, module.exports);
  return module.exports;
}
const load = (name) => loadSource(path.join(webRoot, "src", name));
const schedules = load("api/schedules");
const friends = load("api/friends");
const memos = load("api/memos");
const memoHooks = load("hooks/useMemos");

test("series updates preserve rule replacement, scope, explicit null and string relation IDs", async () => {
  response = { recurrence_group_id: "group", schedules: [], skipped_exception_ids: [3], removed_schedule_ids: [] };
  const recurrence = { repeat_interval_days: 7, repeat_until: "2026-10-31T23:59:59+09:00", timezone: "Asia/Seoul", excluded_dates: ["2026-10-13"] };
  const result = await schedules.updateScheduleSeries(2, { scope: "following", changes: { title: "Review", category_id: 8, description: null }, recurrence, include_exceptions: false, confirm_remove_linked: false });
  assert.deepEqual(calls.at(-1), { method: "patch", args: ["/schedules/2/series", {
    scope: "following", changes: { title: "Review", category_id: "8", description: null }, recurrence,
    include_exceptions: false, confirm_remove_linked: false,
  }] });
  assert.deepEqual(result.data.skipped_exception_ids, [3]);
  await schedules.updateScheduleSeries(2, { scope: "single", changes: { category_id: null } });
  assert.equal(calls.at(-1).args[1].changes.category_id, null);
});

test("series DELETE sends the explicit scope and linked-data confirmation as a body", async () => {
  await schedules.deleteScheduleSeries(2, { scope: "all", confirm_remove_linked: false });
  assert.deepEqual(calls.at(-1), { method: "delete", args: ["/schedules/2/series", { data: { scope: "all", confirm_remove_linked: false } }] });
  await schedules.getScheduleSeries(2);
  assert.deepEqual(calls.at(-1), { method: "get", args: ["/schedules/2/series"] });
});

test("bulk deletion validation failure is propagated without individual delete retries", async () => {
  const start = calls.length;
  rejection = { response: { status: 400, data: { error: { code: "VALIDATION_ERROR", details: { issues: [{ path: "schedule_id" }] } } } } };
  try {
    await assert.rejects(schedules.deleteSchedulesBulk([2, 3]), (error) => error === rejection);
    assert.equal(calls.length - start, 1);
    assert.deepEqual(calls.at(-1), { method: "delete", args: ["/schedules/bulk", { data: { schedule_ids: ["2", "3"] } }] });
  } finally { rejection = undefined; }
});

test("leaving a share and cancelling a pending friend request use distinct resource IDs", async () => {
  response = {};
  await schedules.leaveSharedSchedule(81);
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/shared-schedules/81/leave"] });
  await friends.cancelFriendRequest(82);
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/friends/requests/82/cancel"] });
});

test("only requested pending or processing memos poll, and parse accepts null", async () => {
  const interval = memoHooks.useMemos().refetchInterval;
  for (const [memo, expected] of [
    [{ parse_status: "pending", parse_requested: false }, false],
    [{ parse_status: "pending" }, false],
    [{ parse_status: "pending", parse_requested: true }, 3000],
    [{ parse_status: "processing" }, 3000],
    [{ parse_status: "completed", parse_requested: true }, false],
    [{ parse_status: "failed" }, false],
  ]) assert.equal(interval({ state: { data: [memo] } }), expected);
  response = { memo: null };
  assert.equal((await memos.parseMemo(9)).data.memo, null);
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/memos/9/parse", { force: false }] });
});
