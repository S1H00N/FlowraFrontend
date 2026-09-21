import { test, expect } from "@playwright/test";
import { installMockApi, QA_NOW, QA_USER, seedAuth } from "./fixtures";

for (const conflict of [false, true]) {
  test(`회사 초대 거절 후 목록을 갱신한다${conflict ? " · 이미 결정된 요청" : ""}`, async ({ page }) => {
    const api = await installMockApi(page);
    await seedAuth(page);
    await page.clock.setFixedTime(new Date(QA_NOW));
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    let pending = true;
    let rejectionCalls = 0;
    await page.route("**/api/v1/company-memberships/invites**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (request.method() === "GET" && path === "/api/v1/company-memberships/invites") {
        await route.fulfill({ json: { success: true, message: "OK", data: { invites: pending ? [{
          company_invite_id: 731, email: QA_USER.email, name: QA_USER.name,
          expires_at: "2026-09-16T00:00:00.000Z", company: { company_id: 72, name: "QA 초대 회사" },
          department: { department_id: 73, name: "QA 개발부" },
        }] : [] } } });
        return;
      }
      if (request.method() === "POST" && path === "/api/v1/company-memberships/invites/by-id/731/reject") {
        rejectionCalls += 1;
        expect(request.postData()).toBeNull();
        pending = false;
        await route.fulfill({ status: conflict ? 409 : 200, json: conflict
          ? { success: false, message: "이미 처리된 초대입니다.", error: { code: "COMPANY_INVITE_NOT_PENDING" } }
          : { success: true, message: "OK", data: {} } });
        return;
      }
      await route.fallback();
    });
    await page.goto("/settings");
    await page.getByRole("button", { name: "계정", exact: true }).click();
    await expect(page.getByText("QA 초대 회사", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "초대 거절", exact: true }).click();
    await expect(page.getByText("대기 중인 회사 초대가 없습니다.", { exact: true })).toBeVisible();
    if (conflict) await expect(page.getByText("이미 처리된 초대입니다.", { exact: true })).toBeVisible();
    expect(rejectionCalls).toBe(1);
    expect(api.unhandled).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
}
