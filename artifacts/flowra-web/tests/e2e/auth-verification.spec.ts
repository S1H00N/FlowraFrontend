import { expect, test } from "@playwright/test";
import { installMockApi, QA_NOW, QA_USER } from "./fixtures";

const TOKEN = "qa-single-use-email-verification";
const ACCESS_TOKEN = "qa-verified-access-token";
const REFRESH_TOKEN = "qa-verified-refresh-token";

for (const [label, path] of [
  ["쿼리", `/verify-email?token=${TOKEN}`],
  ["경로", `/auth/verify-email/${TOKEN}`],
] as const) {
  test(`이메일 인증은 ${label} 토큰을 한 번 검증하고 성공 안내 후 홈으로 이동한다`, async ({ page }) => {
    const api = await installMockApi(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const requests: unknown[] = [];
    let markRequested!: () => void;
    let permitResponse!: () => void;
    const requested = new Promise<void>((resolve) => { markRequested = resolve; });
    const responseAllowed = new Promise<void>((resolve) => { permitResponse = resolve; });

    await page.route("**/api/v1/auth/verify-email", async (route) => {
      expect(route.request().method()).toBe("POST");
      expect(route.request().headers().authorization).toBeUndefined();
      requests.push(route.request().postDataJSON());
      if (requests.length > 1) {
        return route.fulfill({
          status: 400,
          headers: { "access-control-allow-origin": "*" },
          json: { success: false, message: "이미 사용한 인증 토큰입니다.", error: { code: "INVALID_EMAIL_TOKEN" }, data: null },
        });
      }
      markRequested();
      await responseAllowed;
      return route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*" },
        json: {
          success: true,
          message: "QA 이메일 인증 완료",
          data: { user: QA_USER, tokens: { access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN, expires_in: 900 } },
        },
      });
    });

    // Load normally, then pause before the success response so the 900 ms
    // notice remains observable regardless of browser or worker speed.
    await page.clock.install({ time: new Date(Date.parse(QA_NOW) - 60_000) });
    try {
      await page.goto(path);
      await requested;
      await page.clock.pauseAt(new Date(QA_NOW));
      permitResponse();
      const success = page.getByText("이메일 인증이 완료되었습니다.", { exact: true });
      await expect(success).toBeVisible();
      expect(requests).toEqual([{ token: TOKEN }]);
      expect(await page.evaluate(() => ({
        access: localStorage.getItem("access_token"),
        refresh: localStorage.getItem("refresh_token"),
        userId: JSON.parse(localStorage.getItem("auth_user") || "null")?.user_id,
      }))).toEqual({ access: ACCESS_TOKEN, refresh: REFRESH_TOKEN, userId: QA_USER.user_id });

      await page.clock.runFor(899);
      await expect(success).toBeVisible();
      await expect(page).toHaveURL((url) => `${url.pathname}${url.search}` === path);
      await page.clock.runFor(1);
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.locator(".flowra-app-shell main")).toBeVisible();
      expect(requests).toEqual([{ token: TOKEN }]);
      expect(api.unhandled, "처리하지 않은 모의 API 요청").toEqual([]);
      expect(errors, "브라우저 실행 오류").toEqual([]);
    } finally {
      permitResponse();
    }
  });
}
