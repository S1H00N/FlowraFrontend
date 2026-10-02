import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const axios = require("axios");

function loadModule(relativePath, dependencies = {}) {
  const source = readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8")
    .replace("import.meta.env.VITE_API_BASE_URL", '"https://api.example.invalid/api/v1"');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => dependencies[name] ?? require(name), module, module.exports,
  );
  return module.exports;
}

function createClient() {
  let accessToken = "old-access";
  let refreshToken = "old-refresh";
  let logoutCount = 0;
  let user = { user_id: 9001 };
  const authStorage = {
    getAccessToken: () => accessToken,
    getRefreshToken: () => refreshToken,
    getUser: () => user,
    setUser: (value) => { user = value; },
    setTokens: (access, refresh) => { accessToken = access; refreshToken = refresh; },
    clear: () => { accessToken = null; refreshToken = null; logoutCount += 1; },
  };
  const { apiClient } = loadModule("api/client.ts", { "@/lib/auth-storage": { authStorage } });
  return { apiClient, authStorage, logoutCount: () => logoutCount };
}

function rejectResponse(config, status, code) {
  return new axios.AxiosError("Request failed", "ERR_BAD_REQUEST", config, undefined, {
    status, statusText: "Error", config, headers: { "x-request-id": "server-request-id" },
    data: { success: false, message: "Request rejected", error: { code } },
  });
}

test("concurrent 401 responses share rotated tokens and retry the original method/body once", async (t) => {
  const { apiClient, authStorage } = createClient();
  const attempts = [];
  const refresh = t.mock.method(axios, "post", async (url, payload) => {
    assert.equal(url, "https://api.example.invalid/api/v1/auth/refresh");
    assert.deepEqual(payload, { refresh_token: "old-refresh" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    return { data: { success: true, data: { tokens: { access_token: "new-access", refresh_token: "new-refresh" } } } };
  });
  apiClient.defaults.adapter = async (config) => {
    attempts.push({ method: config.method, url: config.url, data: config.data,
      requestId: config.headers.get("X-Request-Id"), token: config.headers.get("Authorization") });
    if (config.headers.get("Authorization") === "Bearer old-access") {
      throw rejectResponse(config, 401, "UNAUTHORIZED");
    }
    return { status: 200, statusText: "OK", config, headers: {}, data: { success: true, data: {} } };
  };
  await Promise.all([
    apiClient.post("/ai-chat/messages/9/apply", { apply_type: "action", action_index: 0 }),
    apiClient.patch("/tasks/4", { category_id: null }),
  ]);
  assert.equal(refresh.mock.callCount(), 1);
  assert.equal(authStorage.getRefreshToken(), "new-refresh");
  for (const url of ["/ai-chat/messages/9/apply", "/tasks/4"]) {
    const [initial, retry] = attempts.filter((attempt) => attempt.url === url);
    assert.equal(retry.method, initial.method);
    assert.equal(retry.data, initial.data);
    assert.notEqual(retry.requestId, initial.requestId);
    assert.equal(retry.token, "Bearer new-access");
  }
  assert.equal(attempts.length, 4);
});

test("a delayed old-token 401 reuses the rotated token without refreshing twice", async (t) => {
  const { apiClient } = createClient();
  const refresh = t.mock.method(axios, "post", async () => ({
    data: { success: true, data: { tokens: { access_token: "new-access", refresh_token: "new-refresh" } } },
  }));
  let releaseLate;
  const attempts = [];
  apiClient.defaults.adapter = async (config) => {
    attempts.push({ url: config.url, data: config.data, token: config.headers.get("Authorization") });
    if (config.headers.get("Authorization") === "Bearer old-access") {
      if (config.url === "/tasks/late") {
        return new Promise((resolve, reject) => { releaseLate = () => reject(rejectResponse(config, 401, "UNAUTHORIZED")); });
      }
      throw rejectResponse(config, 401, "UNAUTHORIZED");
    }
    return { status: 200, statusText: "OK", config, headers: {}, data: {} };
  };
  const late = apiClient.patch("/tasks/late", { status: "done" });
  await apiClient.get("/users/me");
  releaseLate();
  await late;
  assert.equal(refresh.mock.callCount(), 1);
  assert.deepEqual(attempts.filter((attempt) => attempt.url === "/tasks/late").map(({ data, token }) => ({ data, token })), [
    { data: '{"status":"done"}', token: "Bearer old-access" },
    { data: '{"status":"done"}', token: "Bearer new-access" },
  ]);
});

test("a request from another user is never replayed in the new session", async (t) => {
  const { apiClient, authStorage, logoutCount } = createClient();
  const refresh = t.mock.method(axios, "post", async () => { throw new Error("Must not refresh"); });
  let attempts = 0;
  apiClient.defaults.adapter = async (config) => {
    attempts += 1;
    authStorage.setUser({ user_id: 9002 });
    authStorage.setTokens("other-access", "other-refresh");
    throw rejectResponse(config, 401, "UNAUTHORIZED");
  };
  await assert.rejects(apiClient.patch("/tasks/4", { status: "done" }));
  assert.equal(attempts, 1);
  assert.equal(refresh.mock.callCount(), 0);
  assert.equal(logoutCount(), 0);
  assert.equal(authStorage.getAccessToken(), "other-access");
});

test("a refresh response cannot restore a session that changed during the request", async (t) => {
  const { apiClient, authStorage, logoutCount } = createClient();
  t.mock.method(axios, "post", async () => {
    authStorage.setUser({ user_id: 9002 });
    authStorage.setTokens("other-access", "other-refresh");
    return { data: { success: true, data: { tokens: { access_token: "new-access", refresh_token: "new-refresh" } } } };
  });
  apiClient.defaults.adapter = async (config) => { throw rejectResponse(config, 401, "UNAUTHORIZED"); };
  await assert.rejects(apiClient.get("/users/me"), (error) => axios.isCancel(error));
  assert.equal(logoutCount(), 0);
  assert.equal(authStorage.getAccessToken(), "other-access");
});

test("public auth failures never refresh or clear an existing session", async (t) => {
  const { apiClient, logoutCount } = createClient();
  const refresh = t.mock.method(axios, "post", async () => { throw new Error("Must not refresh"); });
  apiClient.defaults.adapter = async (config) => { throw rejectResponse(config, 401, "UNAUTHORIZED"); };
  for (const path of ["login", "verify-email", "reset-password", "refresh", "logout"]) {
    await assert.rejects(apiClient.post(`/auth/${path}`, {}));
  }
  assert.equal(refresh.mock.callCount(), 0);
  assert.equal(logoutCount(), 0);
});

test("anonymous Google steps omit Bearer credentials and never refresh on failure", async (t) => {
  const { apiClient, authStorage, logoutCount } = createClient();
  const refresh = t.mock.method(axios, "post", async () => { throw new Error("Must not refresh"); });
  let attempts = 0;
  apiClient.defaults.adapter = async (config) => {
    attempts += 1;
    assert.equal(config.headers.has("Authorization"), false);
    assert.ok(config.headers.get("X-Request-Id"));
    throw rejectResponse(config, 401, "INVALID_GOOGLE_LINK_TICKET");
  };
  for (const step of ["prepare", "link-with-password", "signup"]) {
    await assert.rejects(apiClient.post(`/auth/google/${step}`, { link_ticket: "memory-ticket" }, {
      headers: { Authorization: "Bearer manually-supplied-token" },
    }));
  }
  assert.equal(attempts, 3);
  assert.equal(refresh.mock.callCount(), 0);
  assert.equal(logoutCount(), 0);
  assert.equal(authStorage.getAccessToken(), "old-access");
});

test("invalid Google credentials on session linking do not refresh or revoke the Flowra session", async (t) => {
  const { apiClient, logoutCount } = createClient();
  const refresh = t.mock.method(axios, "post", async () => { throw new Error("Must not refresh"); });
  for (const [step, code] of [["prepare-link", "INVALID_GOOGLE_ID_TOKEN"], ["link", "INVALID_GOOGLE_LINK_TICKET"], ["link", "INVALID_CREDENTIALS"]]) {
    let attempts = 0;
    apiClient.defaults.adapter = async (config) => {
      attempts += 1;
      assert.equal(config.headers.get("Authorization"), "Bearer old-access");
      throw rejectResponse(config, 401, code);
    };
    await assert.rejects(apiClient.post(`/auth/google/${step}`, { link_ticket: "memory-ticket" }));
    assert.equal(attempts, 1);
  }
  assert.equal(refresh.mock.callCount(), 0);
  assert.equal(logoutCount(), 0);
});

test("Google linking preserves its payload during refresh and reports a ticket bound to the old session", async (t) => {
  const { apiClient, authStorage, logoutCount } = createClient();
  const refresh = t.mock.method(axios, "post", async () => ({
    data: { success: true, data: { tokens: { access_token: "new-access", refresh_token: "new-refresh" } } },
  }));
  const attempts = [];
  apiClient.defaults.adapter = async (config) => {
    attempts.push({ method: config.method, data: config.data, token: config.headers.get("Authorization") });
    if (attempts.length === 1) throw rejectResponse(config, 401, "UNAUTHORIZED");
    // prepare-link tickets belong to their issuing session; rotating that
    // session requires another Google selection instead of replaying the ticket.
    throw rejectResponse(config, 401, "INVALID_GOOGLE_LINK_TICKET");
  };
  await assert.rejects(apiClient.post("/auth/google/link", { link_ticket: "memory-ticket", password: "account-password" }),
    (error) => error.response?.data?.error?.code === "INVALID_GOOGLE_LINK_TICKET");
  assert.equal(refresh.mock.callCount(), 1);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].method, attempts[1].method);
  assert.equal(attempts[0].data, attempts[1].data);
  assert.equal(attempts[1].token, "Bearer new-access");
  assert.equal(authStorage.getAccessToken(), "new-access");
  assert.equal(logoutCount(), 0);
});

test("proxy HTML and failure envelopes reject without replaying mutations; 204 stays valid", async (t) => {
  const { apiClient, logoutCount } = createClient();
  const { getApiErrorDetails, getErrorMessage } = loadModule("lib/error.ts");
  const refresh = t.mock.method(axios, "post", async () => { throw new Error("Must not refresh"); });
  let attempts = 0;
  apiClient.defaults.adapter = async (config) => {
    attempts += 1;
    return { status: 200, statusText: "OK", config, headers: { "x-request-id": "proxy-id" }, data: "<html>Proxy login</html>" };
  };
  await assert.rejects(apiClient.patch("/tasks/4", { status: "done" }), (error) => {
    assert.equal(getApiErrorDetails(error).code, "NON_JSON_RESPONSE");
    assert.equal(getApiErrorDetails(error).requestId, "proxy-id");
    assert.equal(getErrorMessage(error, "연결 확인"), "연결 확인");
    return true;
  });
  assert.equal(attempts, 1);
  apiClient.defaults.adapter = async (config) => {
    attempts += 1;
    throw new axios.AxiosError("Proxy authentication failed", "ERR_BAD_REQUEST", config, undefined, {
      status: 401, statusText: "Unauthorized", config,
      headers: { "x-request-id": "proxy-401-id" }, data: "<html>Proxy login</html>",
    });
  };
  await assert.rejects(apiClient.patch("/tasks/4", { status: "done" }), (error) => {
    assert.equal(getApiErrorDetails(error).status, 401);
    assert.equal(getApiErrorDetails(error).code, "NON_JSON_RESPONSE");
    assert.equal(getApiErrorDetails(error).requestId, "proxy-401-id");
    return true;
  });
  assert.equal(attempts, 2);
  assert.equal(logoutCount(), 0);
  apiClient.defaults.adapter = async (config) => ({
    status: 200, statusText: "OK", config, headers: {},
    data: { success: false, message: "Rejected", error: { code: "TASK_ORDER_MISMATCH" } },
  });
  await assert.rejects(apiClient.patch("/schedules/1/tasks/reorder", { task_ids: ["4"] }), (error) => {
    assert.equal(getApiErrorDetails(error).code, "TASK_ORDER_MISMATCH");
    assert.equal(getErrorMessage(error), "할 일 목록이 변경되었습니다. 새로고침한 목록에서 다시 순서를 변경해 주세요.");
    return true;
  });
  apiClient.defaults.adapter = async (config) => ({ status: 204, statusText: "No Content", config, headers: {}, data: "" });
  assert.equal((await apiClient.delete("/tasks/4")).status, 204);
  assert.equal(refresh.mock.callCount(), 0);
});

test("refresh rejection ends the session without recursive refresh", async (t) => {
  const { apiClient, logoutCount } = createClient();
  const refresh = t.mock.method(axios, "post", async () => { throw new Error("Invalid refresh token"); });
  let attempts = 0;
  apiClient.defaults.adapter = async (config) => {
    attempts += 1;
    throw rejectResponse(config, 401, "UNAUTHORIZED");
  };
  await assert.rejects(apiClient.get("/users/me"), /Invalid refresh token/);
  assert.equal(refresh.mock.callCount(), 1);
  assert.equal(attempts, 1);
  assert.equal(logoutCount(), 1);
});

test("permission, conflict and server failures do not replay mutations", async (t) => {
  const { apiClient, logoutCount } = createClient();
  const refresh = t.mock.method(axios, "post", async () => { throw new Error("Must not refresh"); });
  for (const [status, code] of [[400, "VALIDATION_ERROR"], [403, "FORBIDDEN"], [409, "AI_CHAT_ACTION_ALREADY_APPLIED"], [500, "INTERNAL_SERVER_ERROR"]]) {
    let attempts = 0;
    apiClient.defaults.adapter = async (config) => { attempts += 1; throw rejectResponse(config, status, code); };
    await assert.rejects(apiClient.post("/ai-chat/messages/9/apply", { apply_type: "all" }));
    assert.equal(attempts, 1);
  }
  assert.equal(refresh.mock.callCount(), 0);
  assert.equal(logoutCount(), 0);
});

test("error helpers retain validation details and request ID and handle both envelopes", () => {
  const { getApiErrorDetails, getErrorMessage } = loadModule("lib/error.ts");
  const failure = rejectResponse({}, 400, "VALIDATION_ERROR");
  failure.response.data.error.details = { issues: [{ path: "action_index", message: "Expected number" }] };
  assert.deepEqual(getApiErrorDetails(failure), {
    status: 400, code: "VALIDATION_ERROR", message: "Request rejected",
    requestId: "server-request-id", details: failure.response.data.error.details,
  });
  failure.response.data = { error: { code: "BAD_REQUEST", message: "Invalid request." } };
  assert.equal(getErrorMessage(failure), "Invalid request.");
  failure.response.data = { message: "Google token rejected", error: { code: "INVALID_GOOGLE_ID_TOKEN" } };
  assert.equal(getErrorMessage(failure), "Google 인증이 만료되었거나 유효하지 않습니다. 다시 시작해 주세요.");
  assert.equal(getApiErrorDetails(failure).message, "Google token rejected");
  failure.response.data = { message: "Unknown failure", error: { code: "constructor" } };
  assert.equal(getErrorMessage(failure), "Unknown failure");
  failure.response.data = "<html>Proxy failure</html>";
  assert.equal(getErrorMessage(failure, "다시 확인해 주세요."), "다시 확인해 주세요.");
  assert.equal(getErrorMessage(new axios.AxiosError("Network Error"), "연결 확인"), "연결 확인");
});
