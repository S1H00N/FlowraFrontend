import { expect, test, type Page, type Route } from "@playwright/test";
import { installMockApi, QA_USER, seedAuth } from "./fixtures";

test.skip(!process.env.QA_GOOGLE_OAUTH_CLIENT_ID, "Set QA_GOOGLE_OAUTH_CLIENT_ID to enable mocked Google Identity Services tests.");

const GOOGLE_ID_TOKEN = "qa-google-id-token";
const LINK_TICKET = "qa-one-use-google-ticket";
const loginData = {
  user: QA_USER,
  tokens: { access_token: "qa-google-access", refresh_token: "qa-google-refresh", expires_in: 900 },
};

const pending = (nextAction: "existing_account" | "signup" = "signup") => ({
  next_action: nextAction,
  link_ticket: LINK_TICKET,
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  google_profile: { email: "google@example.invalid", name: "Google QA" },
  existing_account: nextAction === "existing_account" ? { name: "QA 테스터", masked_email: "q***@example.invalid" } : null,
});

async function installGoogleIdentity(page: Page) {
  // Drive the real GIS adapter through its official callback API, with no external login.
  await page.route("https://accounts.google.com/gsi/client**", (route) => route.fulfill({
    contentType: "text/javascript",
    body: `(() => {
      let callback;
      window.google = { accounts: { id: {
        initialize(options) { callback = options.callback; },
        renderButton(element, options) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Google 계정으로 계속';
          button.addEventListener('click', () => callback({ credential: '${GOOGLE_ID_TOKEN}', state: options.state }));
          element.replaceChildren(button);
        }
      } } };
    })();`,
  }));
}

async function reply(route: Route, data: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ success: true, message: "OK", data }),
  });
}

async function fail(route: Route, code: string, status = 401) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ success: false, message: "Google authentication rejected", error: { code } }),
  });
}

async function readAuth(page: Page) {
  return page.evaluate(() => ({
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
    user: JSON.parse(localStorage.getItem("auth_user") || "null"),
    persistent: `${JSON.stringify(localStorage)}${JSON.stringify(sessionStorage)}${location.href}`,
  }));
}

test("linked Google identity signs in through prepare without Bearer and returns to the requested page", async ({ page }) => {
  await installMockApi(page);
  await installGoogleIdentity(page);
  let authorization: string | undefined;
  let payload: unknown;
  await page.route("**/api/v1/auth/google/prepare", async (route) => {
    authorization = route.request().headers().authorization;
    payload = route.request().postDataJSON();
    await reply(route, { next_action: "signed_in", ...loginData });
  });
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  expect(authorization).toBeUndefined();
  expect(payload).toEqual({ id_token: GOOGLE_ID_TOKEN });
  const storage = await readAuth(page);
  expect(storage.access).toBe("qa-google-access");
  expect(storage.user.login_type).toBe("local");
  expect(storage.persistent).not.toContain(GOOGLE_ID_TOKEN);
  expect(storage.persistent).not.toContain(LINK_TICKET);
});

test("matching Google email requires explicit existing-account credentials and accepts a different Flowra email", async ({ page }) => {
  const mock = await installMockApi(page);
  await installGoogleIdentity(page);
  let linkPayload: unknown;
  let linkAuthorization: string | undefined;
  await page.route("**/api/v1/auth/google/prepare", (route) => reply(route, pending("existing_account")));
  await page.route("**/api/v1/auth/google/link-with-password", async (route) => {
    linkPayload = route.request().postDataJSON();
    linkAuthorization = route.request().headers().authorization;
    await reply(route, loginData);
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  const form = page.getByRole("form", { name: "Google 기존 계정 연결" });
  await expect(form).toBeVisible();
  expect((await readAuth(page)).access).toBeNull();
  await form.getByLabel("Flowra 이메일", { exact: true }).fill("different@example.invalid");
  await form.getByLabel("Flowra 비밀번호", { exact: true }).fill("password123");
  await form.getByRole("button", { name: "계정 연결 후 로그인" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(linkPayload).toEqual({ link_ticket: LINK_TICKET, email: "different@example.invalid", password: "password123" });
  expect(linkAuthorization).toBeUndefined();
  expect(mock.requests.filter((request) => request.path === "/auth/login")).toHaveLength(0);
});

test("Google authoritative-email signup creates a local-password session without sending a form email", async ({ page }) => {
  await installMockApi(page);
  await installGoogleIdentity(page);
  let signupPayload: Record<string, unknown> | undefined;
  await page.route("**/api/v1/auth/google/prepare", (route) => reply(route, pending()));
  await page.route("**/api/v1/auth/google/signup", async (route) => {
    signupPayload = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBeUndefined();
    await reply(route, loginData, 201);
  });
  await page.goto("/signup");
  await page.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  const form = page.getByRole("form", { name: "Google 회원가입" });
  await form.getByLabel("표시 이름", { exact: true }).fill("가입 QA");
  await form.getByLabel("Flowra 비밀번호", { exact: true }).fill("password123");
  await form.getByRole("button", { name: "Google 계정으로 가입" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(signupPayload).toEqual({ link_ticket: LINK_TICKET, name: "가입 QA", password: "password123", timezone: "Asia/Seoul" });
  expect((await readAuth(page)).access).toBe("qa-google-access");
});

test("202 Google signup keeps the user signed out until the existing verify-email endpoint succeeds", async ({ page }) => {
  await installMockApi(page);
  await installGoogleIdentity(page);
  let verifyPayload: unknown;
  await page.route("**/api/v1/auth/google/prepare", (route) => reply(route, pending()));
  await page.route("**/api/v1/auth/google/signup", (route) => reply(route, { requires_email_verification: true, email_sent: true }, 202));
  await page.route("**/api/v1/auth/verify-email", async (route) => {
    verifyPayload = route.request().postDataJSON();
    expect(route.request().headers().authorization).toBeUndefined();
    await reply(route, loginData);
  });
  await page.goto("/signup");
  await page.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  const form = page.getByRole("form", { name: "Google 회원가입" });
  await form.getByLabel("Flowra 비밀번호", { exact: true }).fill("password123");
  await form.getByRole("button", { name: "Google 계정으로 가입" }).click();
  await expect(page.getByText("인증 링크를 확인하면 회원가입이 완료됩니다.", { exact: false })).toBeVisible();
  const before = await readAuth(page);
  expect(before.access).toBeNull();
  expect(before.refresh).toBeNull();
  expect(before.user).toBeNull();
  expect(before.persistent).not.toContain(LINK_TICKET);
  expect(before.persistent).not.toContain(GOOGLE_ID_TOKEN);
  await page.goto("/verify-email?token=qa-google-email-verification");
  await expect(page.getByText("이메일 인증이 완료되었습니다.", { exact: true })).toBeVisible();
  expect(verifyPayload).toEqual({ token: "qa-google-email-verification" });
  await expect(page).toHaveURL(/\/$/);
  expect((await readAuth(page)).access).toBe("qa-google-access");
});

test("expired anonymous tickets return to Google selection without refresh or persistent ticket storage", async ({ page }) => {
  const mock = await installMockApi(page);
  await installGoogleIdentity(page);
  let prepareCalls = 0;
  await page.route("**/api/v1/auth/google/prepare", async (route) => {
    prepareCalls++;
    await reply(route, pending("existing_account"));
  });
  await page.route("**/api/v1/auth/google/link-with-password", (route) => fail(route, "INVALID_GOOGLE_LINK_TICKET"));
  await page.goto("/login");
  await page.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  const form = page.getByRole("form", { name: "Google 기존 계정 연결" });
  await form.getByLabel("Flowra 이메일", { exact: true }).fill("qa@example.invalid");
  await form.getByLabel("Flowra 비밀번호", { exact: true }).fill("password123");
  await form.getByRole("button", { name: "계정 연결 후 로그인" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("다시");
  await page.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  await expect(form).toBeVisible();
  expect(prepareCalls).toBe(2);
  expect(mock.requests.filter((request) => request.path === "/auth/refresh")).toHaveLength(0);
  expect((await readAuth(page)).persistent).not.toContain(LINK_TICKET);
});

test("settings session-bound ticket is discarded after refresh and can be prepared again", async ({ page }) => {
  await seedAuth(page);
  const mock = await installMockApi(page);
  await installGoogleIdentity(page);
  let linked = false;
  let linkCalls = 0;
  let prepareCalls = 0;
  const calls: Array<{ path: string; body: unknown; authorization?: string }> = [];
  await page.route("**/api/v1/auth/google/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.method() === "POST" ? request.postDataJSON() : null;
    calls.push({ path, body, authorization: request.headers().authorization });
    if (path.endsWith("/accounts")) return reply(route, { accounts: linked ? [{ provider: "google", created_at: "2026-10-01T01:00:00Z" }] : [{ provider: "local" }] });
    if (path.endsWith("/prepare-link")) {
      prepareCalls++;
      return reply(route, { ...pending(), link_ticket: `${LINK_TICKET}-${prepareCalls}` });
    }
    if (path.endsWith("/link")) {
      linkCalls++;
      if (linkCalls === 1) return fail(route, "UNAUTHORIZED");
      if (linkCalls === 2) return fail(route, "INVALID_GOOGLE_LINK_TICKET");
      linked = true;
      return reply(route, {});
    }
    throw new Error(`Unexpected Google route ${path}`);
  });
  await page.goto("/settings");
  await page.getByRole("button", { name: "계정", exact: true }).filter({ visible: true }).click();
  const section = page.getByRole("region", { name: "Google 계정 연결", exact: true });
  await section.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  const form = section.getByRole("form", { name: "현재 계정에 Google 연결" });
  await form.getByLabel("현재 Flowra 비밀번호", { exact: true }).fill("password123");
  await form.getByRole("button", { name: "Google 계정 연결 확인", exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(section.getByRole("alert")).toContainText("다시");
  await expect(page).toHaveURL(/\/settings$/);
  expect(mock.requests.filter((request) => request.path === "/auth/refresh")).toHaveLength(1);
  await section.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  await expect(form).toBeVisible();
  await expect(form.getByLabel("현재 Flowra 비밀번호", { exact: true })).toHaveValue("");
  await form.getByLabel("현재 Flowra 비밀번호", { exact: true }).fill("password123");
  await form.getByRole("button", { name: "Google 계정 연결 확인", exact: true }).click();
  await expect(section.getByText("Google 계정이 연결되어 있습니다.", { exact: true })).toBeVisible();
  expect(prepareCalls).toBe(2);
  expect(calls.filter((call) => call.path.endsWith("/prepare-link")).map((call) => call.body)).toEqual([{ id_token: GOOGLE_ID_TOKEN }, { id_token: GOOGLE_ID_TOKEN }]);
  expect(calls.every((call) => call.authorization?.startsWith("Bearer "))).toBe(true);
  expect((await readAuth(page)).persistent).not.toContain(LINK_TICKET);
  expect((await readAuth(page)).persistent).not.toContain(GOOGLE_ID_TOKEN);
});

test("wrong session-link password keeps the active Flowra session and permits another attempt", async ({ page }) => {
  await seedAuth(page);
  const mock = await installMockApi(page);
  await installGoogleIdentity(page);
  await page.route("**/api/v1/auth/google/accounts", (route) => reply(route, { accounts: [] }));
  await page.route("**/api/v1/auth/google/prepare-link", (route) => reply(route, { link_ticket: LINK_TICKET, expires_at: pending().expires_at }));
  await page.route("**/api/v1/auth/google/link", (route) => fail(route, "INVALID_CREDENTIALS"));
  await page.goto("/settings");
  await page.getByRole("button", { name: "계정", exact: true }).filter({ visible: true }).click();
  const section = page.getByRole("region", { name: "Google 계정 연결", exact: true });
  await section.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  const form = section.getByRole("form", { name: "현재 계정에 Google 연결" });
  await expect(form.getByText("연결할 Google 계정: 선택한 Google 계정", { exact: true })).toBeVisible();
  await form.getByLabel("현재 Flowra 비밀번호", { exact: true }).fill("wrongpassword");
  await form.getByRole("button", { name: "Google 계정 연결 확인", exact: true }).click();
  await expect(section.getByRole("alert")).toContainText("비밀번호");
  await expect(form).toBeVisible();
  await expect(form.getByLabel("현재 Flowra 비밀번호", { exact: true })).toHaveValue("");
  expect((await readAuth(page)).access).toBe("qa-access-token");
  expect(mock.requests.filter((request) => request.path === "/auth/refresh")).toHaveLength(0);
});

test("pending Google login blocks email submission and releases both controls after an error", async ({ page }) => {
  await installMockApi(page);
  await installGoogleIdentity(page);
  let releaseGoogle!: () => void;
  const holdGoogle = new Promise<void>((resolve) => { releaseGoogle = resolve; });
  let googleCalls = 0;
  let emailCalls = 0;
  await page.route("**/api/v1/auth/google/prepare", async (route) => {
    googleCalls++;
    await holdGoogle;
    await fail(route, "INVALID_GOOGLE_ID_TOKEN");
  });
  await page.route("**/api/v1/auth/login", async (route) => {
    emailCalls++;
    await fail(route, "INVALID_CREDENTIALS");
  });
  await page.goto("/login");
  await page.getByLabel("이메일", { exact: true }).fill("qa@example.invalid");
  await page.getByLabel("비밀번호", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Google 계정으로 계속", exact: true }).click();
  await expect.poll(() => googleCalls).toBe(1);
  const emailButton = page.getByRole("button", { name: "로그인", exact: true });
  await expect(emailButton).toBeDisabled();
  // Dispatch an actual submit event to verify the handler guard as well as UI disabling.
  await page.locator("form").first().evaluate((form) => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  releaseGoogle();
  await expect(page.getByRole("alert")).toContainText("Google 인증");
  await expect(emailButton).toBeEnabled();
  expect(emailCalls).toBe(0);
  await emailButton.click();
  await expect.poll(() => emailCalls).toBe(1);
  await expect(emailButton).toBeEnabled();
  expect((await readAuth(page)).access).toBeNull();
});

test("pending email signup blocks GIS credentials and releases Google controls after an error", async ({ page }) => {
  await installMockApi(page);
  await installGoogleIdentity(page);
  let releaseEmail!: () => void;
  const holdEmail = new Promise<void>((resolve) => { releaseEmail = resolve; });
  let googleCalls = 0;
  let emailCalls = 0;
  await page.route("**/api/v1/auth/signup", async (route) => {
    emailCalls++;
    await holdEmail;
    await fail(route, "SIGNUP_DOMAIN_NOT_ALLOWED", 403);
  });
  await page.route("**/api/v1/auth/google/prepare", async (route) => {
    googleCalls++;
    await fail(route, "INVALID_GOOGLE_ID_TOKEN");
  });
  await page.goto("/signup");
  await page.getByLabel("이름", { exact: true }).fill("가입 QA");
  await page.getByLabel("이메일", { exact: true }).fill("qa@example.invalid");
  await page.getByLabel("비밀번호", { exact: true }).fill("password123");
  const emailButton = page.getByRole("button", { name: "회원가입", exact: true });
  await emailButton.click();
  await expect.poll(() => emailCalls).toBe(1);
  const googleButton = page.getByRole("button", { name: "Google 계정으로 계속", exact: true });
  await expect(page.getByLabel("Google 계정으로 계속하기", { exact: true })).toHaveAttribute("aria-disabled", "true");
  // Simulate a late GIS popup result even though its page button is disabled.
  await googleButton.evaluate((button: HTMLButtonElement) => button.click());
  releaseEmail();
  await expect(emailButton).toBeEnabled();
  await expect(page.getByLabel("Google 계정으로 계속하기", { exact: true })).toHaveAttribute("aria-disabled", "false");
  expect(googleCalls).toBe(0);
  await googleButton.click();
  await expect.poll(() => googleCalls).toBe(1);
  await expect(page.getByRole("alert").filter({ hasText: "Google 인증" })).toBeVisible();
  expect((await readAuth(page)).access).toBeNull();
});
