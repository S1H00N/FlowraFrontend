import { test, expect, type Page } from "@playwright/test";
import { installMockApi, QA_API_ORIGIN, QA_NOW, seedAuth } from "./fixtures";

async function setup(page: Page) {
  const api = await installMockApi(page);
  await seedAuth(page);
  await page.clock.setFixedTime(new Date(QA_NOW));
  return api;
}

test("공지를 키보드로 열고 닫으며 Markdown과 일반 텍스트를 읽는다", async ({
  page,
}, testInfo) => {
  const api = await setup(page);
  api.state.notices[0].body = "# 서비스 안내\n\n" + api.state.notices[0].body;
  const plainBody =
    "# 그대로 표시\n\n- 목록이 아닙니다.\n<strong>태그도 그대로 표시합니다.</strong>";
  api.state.notices[1].body = plainBody;
  await page.goto("/notices");
  const main = page.getByRole("main");
  const pinned = main.getByRole("button", { name: /QA 서비스 이용 안내/ });
  const update = main.getByRole("button", { name: /QA 업데이트 소식/ });
  const detail = main.getByRole("article", { name: /QA 서비스 이용 안내/ });
  await expect(
    main.getByRole("heading", { name: "공지사항", exact: true, level: 1 }),
  ).toBeVisible();
  const headerTitle = page
    .getByRole("banner")
    .getByRole("heading", { name: "공지사항", exact: true, level: 1 });
  const description = page.getByRole("tooltip");
  await expect(description).not.toBeVisible();
  await expect(main.getByText("서비스 공지를 확인합니다.", { exact: true })).toHaveCount(0);
  await headerTitle.hover();
  await expect(description).toHaveText("서비스 공지를 확인합니다.");
  await expect(description).toBeVisible();
  await testInfo.attach("notices-tooltip", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await main.getByRole("heading", { name: "공지사항", exact: true }).hover();
  await expect(description).not.toBeVisible();
  await headerTitle.focus();
  await expect(description).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(description).not.toBeVisible();
  await expect(headerTitle).toBeFocused();
  await expect(pinned).toHaveAttribute("aria-expanded", "false");
  await expect(pinned.getByText("고정", { exact: true })).toBeVisible();
  await expect(pinned.locator("time")).toHaveAttribute(
    "datetime",
    api.state.notices[0].publish_start_at,
  );
  await expect(pinned.locator("time")).not.toHaveText("");
  await expect(main.getByRole("navigation", { name: /^공지 페이지/ })).toHaveCount(0);
  await testInfo.attach("notices-closed", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await pinned.focus();
  await page.keyboard.press("Enter");
  await expect(pinned).toHaveAttribute("aria-expanded", "true");
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("button", { name: "닫기", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("heading", { name: "QA 서비스 이용 안내", exact: true })).toHaveCount(0);
  await expect(
    detail.getByRole("heading", { name: "서비스 안내", exact: true, level: 3 }),
  ).toBeVisible();
  await expect(
    detail.getByRole("heading", { name: "테스트 안내", exact: true, level: 3 }),
  ).toBeVisible();
  await expect(detail.getByRole("listitem")).toHaveText([
    "일정 등록",
    "할 일 완료",
    "메모 저장",
  ]);
  await testInfo.attach("notices-open", {
    body: await page.screenshot(),
    contentType: "image/png",
  });

  await pinned.focus();
  await page.keyboard.press("Enter");
  await expect(detail).toHaveCount(0);
  await expect(pinned).toHaveAttribute("aria-expanded", "false");
  await expect(pinned).toBeFocused();
  await pinned.focus();
  await page.keyboard.press("Space");
  await expect(detail).toBeVisible();
  await update.click();
  const plain = main.getByRole("article", { name: /QA 업데이트 소식/ });
  await expect(plain).toBeVisible();
  await expect(plain.getByText(plainBody, { exact: true })).toBeVisible();
  await expect(plain.getByRole("list")).toHaveCount(0);
  await expect(plain.locator("strong")).toHaveCount(0);
  await expect(detail).toHaveCount(0);
  await expect(pinned).toHaveAttribute("aria-expanded", "false");
  await expect(update).toHaveAttribute("aria-expanded", "true");
  expect(api.unhandled).toEqual([]);
});

test("공지 상세 오류를 표시하고 재시도하면 본문을 복구한다", async ({
  page,
}) => {
  const api = await setup(page);
  let failing = true;
  let detailRequests = 0;
  await page.route(`${QA_API_ORIGIN}/api/v1/notices/401`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    detailRequests += 1;
    if (!failing) return route.fallback();
    await route.fulfill({
      status: 503,
      json: {
        success: false,
        message: "QA 공지 상세를 잠시 불러올 수 없습니다.",
        data: null,
        error: { code: "QA_NOTICE_UNAVAILABLE" },
      },
    });
  });
  await page.goto("/notices");
  const row = page
    .getByRole("main")
    .getByRole("button", { name: /QA 서비스 이용 안내/ });
  await row.click();
  const detail = page.getByRole("article", { name: /QA 서비스 이용 안내/ });
  await expect(
    detail.getByText("문제가 발생했습니다", { exact: true }),
  ).toBeVisible();
  const failedRequests = detailRequests;
  expect(failedRequests).toBeGreaterThan(0);
  failing = false;
  await detail.getByRole("button", { name: /^(다시 시도|재시도)$/ }).click();
  await expect(
    detail.getByRole("heading", { name: "테스트 안내", exact: true, level: 3 }),
  ).toBeVisible();
  await expect(
    detail.getByText("문제가 발생했습니다", { exact: true }),
  ).toHaveCount(0);
  expect(detailRequests).toBeGreaterThan(failedRequests);
  await expect(row).toHaveAttribute("aria-expanded", "true");
  expect(api.unhandled).toEqual([]);
});

test("서버의 공지 페이지를 이동하며 경계 버튼과 열린 본문을 갱신한다", async ({
  page,
}) => {
  const api = await setup(page);
  const original = api.state.notices[0];
  api.state.notices = Array.from({ length: 21 }, (_, index) => ({
    ...original,
    notice_id: 401 + index,
    title: index === 0 ? original.title : `QA 공지 ${index + 1}`,
    is_pinned: index === 0,
  }));
  const listPages: number[] = [];
  await page.route(`${QA_API_ORIGIN}/api/v1/notices**`, async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() !== "GET" ||
      url.pathname !== "/api/v1/notices"
    )
      return route.fallback();
    const current = Number(url.searchParams.get("page"));
    expect(url.searchParams.get("page_size")).toBe("20");
    listPages.push(current);
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({
      json: {
        success: true,
        message: "OK",
        data: {
          notices: api.state.notices.slice((current - 1) * 20, current * 20),
          meta: { page: current, page_size: 20, total: 21, total_pages: 2 },
        },
      },
    });
  });
  await page.goto("/notices");
  const main = page.getByRole("main");
  const previous = main.getByRole("button", { name: "이전", exact: true });
  const next = main.getByRole("button", { name: "다음", exact: true });
  const navigation = main.getByRole("navigation", { name: /^공지 페이지,/ });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(main.getByLabel("총 21개")).toHaveText("21");
  await expect(navigation.getByText(/^1\s*\/\s*2$/)).toBeVisible();
  await main.getByRole("button", { name: /QA 서비스 이용 안내/ }).click();
  await expect(
    main.getByRole("article", { name: /QA 서비스 이용 안내/ }),
  ).toBeVisible();
  await next.focus();
  await page.keyboard.press("Enter");
  const last = main.getByRole("button", { name: /QA 공지 21/ });
  await expect(last).toBeVisible();
  await expect(last).toHaveAttribute("aria-expanded", "false");
  await expect(main.getByRole("article")).toHaveCount(0);
  await expect(navigation.getByText(/^2\s*\/\s*2$/)).toBeVisible();
  await expect(navigation).toHaveAccessibleName("공지 페이지, 2 / 2");
  await expect(navigation).toBeFocused();
  await expect(previous).toBeEnabled();
  await expect(next).toBeDisabled();
  await last.click();
  await expect(main.getByRole("article", { name: /QA 공지 21/ })).toBeVisible();
  await previous.focus();
  await page.keyboard.press("Enter");
  const first = main.getByRole("button", { name: /QA 서비스 이용 안내/ });
  await expect(first).toBeVisible();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await expect(main.getByRole("article")).toHaveCount(0);
  await expect(navigation).toHaveAccessibleName("공지 페이지, 1 / 2");
  await expect(navigation).toBeFocused();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  expect(listPages).toContain(1);
  expect(listPages).toContain(2);
  expect(api.unhandled).toEqual([]);
});

test("HTML 공지를 sandbox 안에서 읽고 스크립트 실행을 막는다", async ({
  page,
}) => {
  const api = await setup(page);
  api.state.notices[0].body_format = "html";
  api.state.notices[0].body =
    '<h1>HTML 이용 안내</h1><script>document.body.dataset.executed = "yes"; parent.document.body.dataset.noticeScript = "yes";</script>';
  await page.goto("/notices");
  await page
    .getByRole("main")
    .getByRole("button", { name: /QA 서비스 이용 안내/ })
    .click();
  const frame = page
    .getByRole("article", { name: /QA 서비스 이용 안내/ })
    .locator("iframe");
  await expect(frame).toHaveAttribute("sandbox", "");
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(
    frame
      .contentFrame()
      .getByRole("heading", { name: "HTML 이용 안내", exact: true }),
  ).toBeVisible();
  await expect(frame.contentFrame().locator("body")).not.toHaveAttribute(
    "data-executed",
    "yes",
  );
  await expect(page.locator("body")).not.toHaveAttribute(
    "data-notice-script",
    "yes",
  );
  expect(api.unhandled).toEqual([]);
});
