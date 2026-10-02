import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const calls = [];
let response;
const client = Object.fromEntries(["get", "post"].map((method) => [method, async (...args) => {
  calls.push({ method, args });
  return { data: { success: true, message: "OK", data: response } };
}]));
const source = readFileSync(new URL("../src/api/auth.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(() => ({ __esModule: true, default: client }), module, module.exports);
const auth = module.exports;
const user = { user_id: 1, email: "qa@example.invalid", name: "QA", login_type: "local" };
const tokens = { access_token: "flowra-access", refresh_token: "flowra-refresh", expires_in: 900, refresh_expires_at: "2026-11-01T00:00:00Z" };

test("Google prepare sends only the Google ID token and normalizes signed-in Flowra tokens", async () => {
  response = { next_action: "signed_in", user, tokens };
  const result = await auth.prepareGoogleLogin("google-id-token");
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/auth/google/prepare", { id_token: "google-id-token" }] });
  assert.deepEqual(result.data, { next_action: "signed_in", user, ...tokens });
});

test("prepare preserves signup and existing-account tickets without treating email matches as login", async () => {
  for (const next_action of ["signup", "existing_account"]) {
    response = {
      next_action,
      link_ticket: "one-use-ticket",
      expires_at: "2026-10-01T01:10:00Z",
      google_profile: { email: "google@example.invalid", name: "Google QA" },
      existing_account: next_action === "existing_account" ? { name: "QA", masked_email: "q***@example.invalid" } : null,
    };
    assert.deepEqual((await auth.prepareGoogleLogin("google-id-token")).data, response);
  }
});

test("password linking submits the chosen Flowra email, which may differ from Google email", async () => {
  response = { user, tokens };
  const payload = { link_ticket: "one-use-ticket", email: "another@example.invalid", password: "password123" };
  const result = await auth.linkGoogleWithPassword(payload);
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/auth/google/link-with-password", payload] });
  assert.deepEqual(result.data, { user, ...tokens });
});

test("Google signup strips email and extra fields and preserves pending verification without session tokens", async () => {
  response = { requires_email_verification: true, email_sent: true, verification_expires_at: "2026-10-01T02:00:00Z" };
  const result = await auth.signupWithGoogle({
    link_ticket: "one-use-ticket", name: "QA", password: "password123", timezone: "Asia/Seoul",
    email: "untrusted@example.invalid", id_token: "must-not-reuse",
  });
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/auth/google/signup", {
    link_ticket: "one-use-ticket", name: "QA", password: "password123", timezone: "Asia/Seoul",
  }] });
  assert.deepEqual(result.data, response);
  assert.equal("access_token" in result.data, false);
});

test("Google signup and verify-email share standard nested Flowra token normalization", async () => {
  response = { user, tokens };
  assert.deepEqual((await auth.signupWithGoogle({ link_ticket: "ticket", name: "QA", password: "password123" })).data, { user, ...tokens });
  assert.deepEqual((await auth.verifyEmail({ token: "email-verification" })).data, { user, ...tokens });
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/auth/verify-email", { token: "email-verification" }] });
});

test("session linking uses prepare-link and link, and lists auth providers independently of login_type", async () => {
  response = { link_ticket: "session-bound-ticket", expires_at: "2026-10-01T01:10:00Z", google_profile: { email: "google@example.invalid" } };
  await auth.prepareGoogleLink("google-id-token");
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/auth/google/prepare-link", { id_token: "google-id-token" }] });
  response = {};
  await auth.linkGoogleToSession({ link_ticket: "session-bound-ticket", password: "password123" });
  assert.deepEqual(calls.at(-1), { method: "post", args: ["/auth/google/link", { link_ticket: "session-bound-ticket", password: "password123" }] });
  const accounts = [{ provider: "local", created_at: "2026-10-01T00:00:00Z" }, { provider: "google", created_at: "2026-10-01T01:00:00Z" }];
  for (const shape of [accounts, { accounts }]) {
    response = shape;
    assert.deepEqual((await auth.getLinkedGoogleAccounts()).data, accounts);
    assert.deepEqual(calls.at(-1), { method: "get", args: ["/auth/google/accounts"] });
  }
});
