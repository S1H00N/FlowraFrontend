import { expect, test, type Page, type Route } from "@playwright/test";
import type { Memo, User } from "../../src/types";
import { installMockApi, QA_API_ORIGIN, QA_NOW, QA_USER, seedAuth } from "./fixtures";

const USER_B: User = {
  ...QA_USER,
  user_id: 9002,
  email: "qa-second@example.invalid",
  name: "QA 두 번째 사용자",
  public_uid: "FLOWRA-QA-9002",
};
const TITLE_A = "QA A 계정 전용 메모";
const TITLE_B = "QA B 계정 전용 메모";
const ACCESS_B = "qa-second-access-token";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** Override only session-sensitive routes; all traffic stays inside the mock fixture. */
async function installSessionApi(page: Page) {
  const api = await installMockApi(page);
  const reads: string[] = [];
  const firstReadStarted = deferred();
  const deleteStarted = deferred();
  const logoutStarted = deferred();
  const releaseRead = deferred();
  const releaseDelete = deferred();
  const releaseLogout = deferred();
  let holdFirstRead = false;
  let holdDelete = false;
  let holdLogout = false;
  const logouts: { authorization?: string; refresh_token?: string }[] = [];
  let aReads = 0;

  const memoFor = (owner: User): Memo => ({
    ...api.state.memos[0],
    // Deliberately reuse a resource ID to check that identity includes its session.
    memo_id: 301,
    user_id: owner.user_id,
    raw_text: `${owner.user_id === USER_B.user_id ? TITLE_B : TITLE_A}\n계정별 비공개 본문`,
  });

  await page.route(`${QA_API_ORIGIN}/api/v1/**`, async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api/v1", "");
    const method = request.method();
    if (method === "OPTIONS") return route.fallback();
    const owner = request.headers().authorization === `Bearer ${ACCESS_B}` ? USER_B : QA_USER;
    const reply = (data: unknown) => route.fulfill({
      status: 200,
      headers: { "access-control-allow-origin": "*" },
      json: { success: true, message: "QA 세션 응답", data },
    });

    if (path === "/auth/login" && method === "POST") {
      expect(request.postDataJSON()).toMatchObject({ email: USER_B.email, password: "Qa-test-1234!" });
      return reply({ user: USER_B, access_token: ACCESS_B, refresh_token: "qa-second-refresh-token", expires_in: 3600 });
    }
    if (path === "/users/me" && method === "GET") return reply({ user: owner });
    if (path === "/auth/logout" && method === "POST" && holdLogout) {
      logouts.push({ authorization: request.headers().authorization, ...request.postDataJSON() });
      logoutStarted.resolve();
      await releaseLogout.promise;
      return reply({});
    }
    if (path === "/memos" && method === "GET") {
      reads.push(owner.email);
      if (owner.user_id === QA_USER.user_id && ++aReads === 1) {
        firstReadStarted.resolve();
        if (holdFirstRead) await releaseRead.promise;
      }
      return reply({ memos: [memoFor(owner)] });
    }
    if (path === "/memos/301/parse-result" && method === "GET") {
      return reply({ memo: memoFor(owner), latest_result: null, parse_results: [] });
    }
    if (path === "/memos/301" && method === "DELETE" && holdDelete) {
      expect(owner.user_id).toBe(QA_USER.user_id);
      deleteStarted.resolve();
      await releaseDelete.promise;
      return reply({});
    }
    return route.fallback();
  });

  return {
    api,
    reads,
    firstReadStarted,
    deleteStarted,
    logoutStarted,
    logouts,
    holdFirstRead: () => { holdFirstRead = true; },
    holdDelete: () => { holdDelete = true; },
    holdLogout: () => { holdLogout = true; },
    releaseRead: releaseRead.resolve,
    releaseDelete: releaseDelete.resolve,
    releaseLogout: releaseLogout.resolve,
  };
}

async function sidebar(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 600) {
    await page.locator("header").getByRole("button", { name: "사이드바 열기", exact: true }).click();
  }
  return page.locator(".flowra-app-shell > aside");
}

async function storageWriter(page: Page) {
  const writer = await page.context().newPage();
  await installMockApi(writer);
  await writer.goto("/login");
  return writer;
}

async function switchToB(writer: Page, currentPage: Page) {
  await writer.evaluate(({ user, access }) => {
    localStorage.setItem("access_token", access);
    localStorage.setItem("refresh_token", "qa-second-refresh-token");
    localStorage.setItem("auth_user", JSON.stringify(user));
  }, { user: USER_B, access: ACCESS_B });
  await currentPage.bringToFront();
}

test.describe("계정별 캐시와 진행 중 요청 격리", () => {
  let session: Awaited<ReturnType<typeof installSessionApi>>;
  let errors: string[];

  test.beforeEach(async ({ page }) => {
    errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.clock.setFixedTime(new Date(QA_NOW));
    session = await installSessionApi(page);
    await seedAuth(page);
  });

  test.afterEach(async () => {
    session.releaseRead();
    session.releaseDelete();
    session.releaseLogout();
    expect.soft(errors, "브라우저 실행 오류").toEqual([]);
    expect.soft(session.api.unhandled, "처리하지 않은 모의 API 요청").toEqual([]);
  });

  test("로그아웃 후 B 로그인은 A의 메모 캐시를 재사용하지 않는다", async ({ page }) => {
    await page.goto("/memos");
    await expect(page.getByRole("heading", { name: TITLE_A, exact: true })).toBeVisible();
    const nav = await sidebar(page);
    await nav.getByRole("button", { name: "프로필 메뉴", exact: true }).click();
    await page.getByRole("menuitem", { name: "로그아웃", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일", { exact: true }).fill(USER_B.email);
    await page.getByLabel("비밀번호", { exact: true }).fill("Qa-test-1234!");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    if (new URL(page.url()).pathname !== "/memos") {
      await (await sidebar(page)).getByRole("link", { name: "메모", exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: TITLE_B, exact: true })).toBeVisible();
    await expect(page.getByText(TITLE_A, { exact: true })).toHaveCount(0);
    expect(session.reads.filter((owner) => owner === USER_B.email)).toHaveLength(1);
  });

  test("다른 탭의 사용자 변경은 현재 페이지와 작성 중인 내용을 초기화한다", async ({ page }) => {
    await page.goto("/memos");
    await expect(page.getByRole("heading", { name: TITLE_A, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "AI 채팅 열기", exact: true }).click();
    await page.getByPlaceholder("AI에게 요청하기", { exact: true }).fill("A 계정의 비공개 초안");
    const writer = await storageWriter(page);
    await switchToB(writer, page);
    await expect(page.getByRole("heading", { name: TITLE_B, exact: true })).toBeVisible();
    await expect(page.getByText(TITLE_A, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "AI 채팅 열기", exact: true }).click();
    await expect(page.getByPlaceholder("AI에게 요청하기", { exact: true })).toHaveValue("");
    expect(session.reads.filter((owner) => owner === USER_B.email)).toHaveLength(1);
  });

  test("토큰 갱신은 같은 사용자의 캐시와 작성 중인 내용을 유지한다", async ({ page }) => {
    await page.goto("/memos");
    await expect(page.getByRole("heading", { name: TITLE_A, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "AI 채팅 열기", exact: true }).click();
    await page.getByPlaceholder("AI에게 요청하기", { exact: true }).fill("유지할 초안");
    const writer = await storageWriter(page);
    await writer.evaluate(() => {
      localStorage.setItem("access_token", "qa-rotated-access-token");
      localStorage.setItem("refresh_token", "qa-rotated-refresh-token");
    });
    await page.bringToFront();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await expect(page.getByPlaceholder("AI에게 요청하기", { exact: true })).toHaveValue("유지할 초안");
    await expect(page.getByRole("heading", { name: TITLE_A, exact: true })).toBeVisible();
    expect(session.reads).toEqual([QA_USER.email]);
  });

  test("늦게 끝난 A 조회가 B 세션의 새 조회와 화면을 덮어쓰지 않는다", async ({ page }) => {
    session.holdFirstRead();
    await page.goto("/memos");
    await session.firstReadStarted.promise;
    const writer = await storageWriter(page);
    await switchToB(writer, page);
    await expect(page.getByRole("heading", { name: TITLE_B, exact: true })).toBeVisible();
    const oldResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/v1/memos" &&
      response.request().headers().authorization === "Bearer qa-access-token");
    session.releaseRead();
    await oldResponse;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("heading", { name: TITLE_B, exact: true })).toBeVisible();
    await expect(page.getByText(TITLE_A, { exact: true })).toHaveCount(0);
    expect(session.reads.filter((owner) => owner === USER_B.email)).toHaveLength(1);
  });

  test("늦게 끝난 A 삭제가 B 캐시를 수정하거나 다시 조회하지 않는다", async ({ page }) => {
    session.holdDelete();
    await page.goto("/memos");
    await expect(page.getByRole("heading", { name: TITLE_A, exact: true })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "메모 삭제", exact: true }).last().click();
    await session.deleteStarted.promise;
    const writer = await storageWriter(page);
    await switchToB(writer, page);
    await expect(page.getByRole("heading", { name: TITLE_B, exact: true })).toBeVisible();
    const oldResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/v1/memos/301" && response.request().method() === "DELETE");
    session.releaseDelete();
    await oldResponse;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByRole("heading", { name: TITLE_B, exact: true })).toBeVisible();
    expect(session.reads.filter((owner) => owner === USER_B.email)).toHaveLength(1);
  });

  test("A 로그아웃 응답을 기다리는 동안 로그인한 B 세션을 지우지 않는다", async ({ page }) => {
    session.holdLogout();
    await page.goto("/memos");
    await expect(page.getByRole("heading", { name: TITLE_A, exact: true })).toBeVisible();
    await (await sidebar(page)).getByRole("button", { name: "프로필 메뉴", exact: true }).click();
    await page.getByRole("menuitem", { name: "로그아웃", exact: true }).click();
    await session.logoutStarted.promise;
    const writer = await storageWriter(page);
    await switchToB(writer, page);
    await expect(page.getByRole("heading", { name: TITLE_B, exact: true })).toBeVisible();
    const oldResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === "/api/v1/auth/logout" && response.request().method() === "POST");
    session.releaseLogout();
    await oldResponse;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page).toHaveURL(/\/memos$/);
    await expect(page.getByRole("heading", { name: TITLE_B, exact: true })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("access_token"))).toBe(ACCESS_B);
    expect(session.logouts).toEqual([{ authorization: undefined, refresh_token: "qa-refresh-token" }]);
  });

  test("로그아웃 응답 대기 중 같은 계정의 토큰을 갱신해도 로그아웃을 완료한다", async ({ page }) => {
    session.holdLogout();
    await page.goto("/memos");
    await expect(page.getByRole("heading", { name: TITLE_A, exact: true })).toBeVisible();
    await (await sidebar(page)).getByRole("button", { name: "프로필 메뉴", exact: true }).click();
    await page.getByRole("menuitem", { name: "로그아웃", exact: true }).click();
    await session.logoutStarted.promise;
    const writer = await storageWriter(page);
    await writer.evaluate(() => {
      localStorage.setItem("access_token", "qa-rotated-access-token");
      localStorage.setItem("refresh_token", "qa-rotated-refresh-token");
    });
    await page.bringToFront();
    session.releaseLogout();
    await expect(page).toHaveURL(/\/login$/);
    expect(await page.evaluate(() => ({
      user: localStorage.getItem("auth_user"),
      access: localStorage.getItem("access_token"),
      refresh: localStorage.getItem("refresh_token"),
    }))).toEqual({ user: null, access: null, refresh: null });
    expect(session.logouts).toEqual([{ authorization: undefined, refresh_token: "qa-refresh-token" }]);
  });
});
