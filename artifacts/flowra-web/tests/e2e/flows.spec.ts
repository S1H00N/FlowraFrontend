import { expect, test, type Page } from "@playwright/test";
import { installMockApi, QA_NOW, seedAuth } from "./fixtures";

type MockApi = Awaited<ReturnType<typeof installMockApi>>;

async function openMemoList(page: Page) {
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByRole("button", { name: /^메모 목록 (열기|접기)$/ })).toBeVisible();
  const opener = page.getByRole("button", { name: "메모 목록 열기", exact: true });
  if (await opener.isVisible()) await opener.click();
  await expect(page.getByRole("textbox", { name: "메모 검색", exact: true })).toBeVisible();
}

async function selectMonthView(page: Page) {
  await page.getByRole("button", { name: "보기 선택", exact: true }).click();
  await page.getByRole("menuitem", { name: "월 M", exact: true }).click();
  await expect(page.getByRole("button", { name: "보기 선택", exact: true })).toHaveText("월");
}

async function openScheduleCreate(page: Page) {
  await selectMonthView(page);
  // The fixed September grid also includes October 9. Its first "9" is
  // September 9; scope the add control to that day and verify the editor date.
  const day = page.locator("[data-flowra-schedule-page]").getByRole("button", { name: "9", exact: true }).first();
  await day.locator("..").getByRole("button", { name: "추가", exact: true }).click();
  await expect(page.getByPlaceholder("일정 제목", { exact: true })).toBeVisible();
  await expect(page.getByLabel("시작 날짜", { exact: true })).toHaveValue("09.09(수)");
}

async function revealSeptember9Schedule(page: Page, title: string) {
  const monthBlock = page.getByRole("button", { name: `${title} select`, exact: true });
  const day = page.locator("[data-flowra-schedule-page]").getByRole("button", { name: "9", exact: true }).first();
  const more = day.locator("..").getByRole("button", { name: /^\+\d+개 더보기$/ });
  // Month cells may hide later entries in the overflow. Follow the visible
  // day control and verify the actual card, including after reloading.
  await expect(monthBlock.or(more).first()).toBeVisible();
  if (await more.isVisible()) {
    await more.click();
    await expect(page.getByRole("button", { name: "보기 선택", exact: true })).toHaveText("일");
    const dayBlock = page.getByRole("button", { name: `Move ${title}`, exact: true })
      .or(page.getByRole("button", { name: `${title} schedule block`, exact: true }));
    await expect(dayBlock).toBeVisible();
    return dayBlock;
  }
  await expect(monthBlock).toBeVisible();
  return monthBlock;
}

async function openTaskCreate(page: Page) {
  const schedule = page.getByRole("button", { name: /QA 디자인 검토 회의/ }).first();
  await expect(schedule).toBeVisible();
  if ((await schedule.getAttribute("aria-expanded")) !== "true") await schedule.click();
  const card = schedule.locator("xpath=ancestor::li[1]");
  await card.getByRole("button", { name: "할 일 추가", exact: true }).click();
  await expect(page.getByPlaceholder("새 할 일 입력")).toBeVisible();
}

test.describe("사용자 기능 · 가상 API", () => {
  let api: MockApi;
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.clock.setFixedTime(new Date(QA_NOW));
    api = await installMockApi(page);
    await seedAuth(page);
  });

  test.afterEach(async ({}, testInfo) => {
    await testInfo.attach("mock-api-requests", {
      body: JSON.stringify(api.requests, null, 2), contentType: "application/json",
    });
    expect.soft(api.unhandled, "All tested API paths must have explicit fixtures").toEqual([]);
    expect.soft(pageErrors, "No uncaught JavaScript error during the workflow").toEqual([]);
  });

  test("주요 메뉴를 클릭해 이동하고 브라우저 뒤로 가기가 동작한다", async ({ page }) => {
    await page.goto("/");
    const destinations = [
      ["할일", "/tasks"], ["캘린더", "/schedules"], ["메모", "/memos"], ["공지사항", "/notices"],
    ] as const;
    for (const [label, path] of destinations) {
      // Open the visible header control on narrow screens; use the same sidebar links.
      if ((page.viewportSize()?.width ?? 1280) < 600) {
        await page.locator("header").getByRole("button", { name: "사이드바 열기", exact: true }).click();
      }
      const link = page.locator("aside nav").getByRole("link", { name: label, exact: true });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator("main")).toBeVisible();
      await expect(link).toHaveAttribute("aria-current", "page");
    }
    await page.goBack();
    await expect(page).toHaveURL(/\/memos$/);
    await expect(page.getByRole("heading", { name: "QA 회의 메모", exact: true })).toBeVisible();
  });

  test("연결된 할 일을 생성하고 완료 처리한 결과가 새로고침 후 유지된다", async ({ page }) => {
    const title = "QA 자동 등록 할 일";
    await page.goto("/tasks");
    await openTaskCreate(page);
    const form = page.locator("form").filter({ has: page.getByPlaceholder("새 할 일 입력") });
    await form.getByRole("button", { name: "할 일 추가", exact: true }).click();
    await expect(page.getByText("할 일 제목을 입력해 주세요.", { exact: true })).toBeVisible();
    expect(api.requests.filter((request) => request.method === "POST" && request.path === "/tasks")).toHaveLength(0);
    await page.getByPlaceholder("새 할 일 입력").fill(title);
    await form.getByRole("button", { name: "할 일 추가", exact: true }).click();
    await expect.poll(() => api.state.tasks.find((task) => task.title === title)?.schedule_id).toBe(201);
    await expect(page.getByPlaceholder("새 할 일 입력")).toHaveValue("");
    await page.getByRole("button", { name: "할 일 추가 패널 닫기", exact: true }).click();
    const row = page.locator("li").filter({ has: page.getByText(title, { exact: true }) }).last();
    await expect(row.getByText(title, { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "미완료, 완료로 변경", exact: true }).click();
    await expect.poll(() => api.state.tasks.find((task) => task.title === title)?.status).toBe("done");
    await page.reload();
    const schedule = page.getByRole("button", { name: /QA 디자인 검토 회의/ }).first();
    if ((await schedule.getAttribute("aria-expanded")) !== "true") await schedule.click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    const completedRow = page.locator("li").filter({ has: page.getByText(title, { exact: true }) }).last();
    await expect(completedRow.getByRole("button", { name: "완료됨, 미완료로 변경", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("할 일 검색과 완료 필터가 목록에 적용된다", async ({ page }) => {
    await page.goto("/tasks");
    const search = page.getByPlaceholder("일정 또는 할 일 검색...").locator("visible=true");
    await search.fill("QA 오늘 할 일");
    await expect(page.getByText("QA 오늘 할 일", { exact: true })).toBeVisible();
    await expect(page.getByText("QA 진행 중인 할 일", { exact: true })).toHaveCount(0);
    await search.fill("존재하지 않는 QA 검색 결과");
    await expect(page.getByText("QA 오늘 할 일", { exact: true })).toHaveCount(0);
    await search.clear();
    await page.getByRole("button", { name: "완료됨", exact: true }).click();
    await expect(page.getByText("QA 완료한 할 일", { exact: true })).toBeVisible();
    await expect(page.getByText("QA 오늘 할 일", { exact: true })).toHaveCount(0);
  });

  test("일정을 생성하고 제목을 수정한 결과가 달력과 새로고침에 반영된다", async ({ page }, testInfo) => {
    const title = "QA 자동 등록 일정";
    const editedTitle = "QA 수정된 자동 일정";
    await page.goto("/schedules");
    await openScheduleCreate(page);
    await page.getByPlaceholder("일정 제목", { exact: true }).fill(title);
    await testInfo.attach("schedule-create-editor", {
      body: await page.screenshot({ animations: "disabled" }), contentType: "image/png",
    });
    await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "추가", exact: true }).click();
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveCount(0);
    await expect.poll(() => api.state.schedules.some((schedule) => schedule.title === title)).toBe(true);
    const block = await revealSeptember9Schedule(page, title);
    await block.click();
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveValue(title);
    await page.getByPlaceholder("일정 제목", { exact: true }).fill(editedTitle);
    await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveCount(0);
    await expect.poll(() => api.state.schedules.some((schedule) => schedule.title === editedTitle)).toBe(true);
    await page.reload();
    await selectMonthView(page);
    await revealSeptember9Schedule(page, editedTitle);
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  });

  test("일정 입력 패널을 닫으면 미저장 내용이 생성되지 않는다", async ({ page }) => {
    await page.goto("/schedules");
    const count = api.state.schedules.length;
    await openScheduleCreate(page);
    await page.getByPlaceholder("일정 제목", { exact: true }).fill("QA 취소할 일정");
    await page.locator("[data-flowra-schedule-editor-footer]").getByRole("button", { name: "닫기", exact: true }).click();
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveCount(0);
    expect(api.state.schedules).toHaveLength(count);
    expect(api.requests.filter((request) => request.method === "POST" && request.path.startsWith("/schedules"))).toHaveLength(0);
    await openScheduleCreate(page);
    await expect(page.getByPlaceholder("일정 제목", { exact: true })).toHaveValue("");
  });

  test("메모를 생성하고 편집·취소·저장한 결과가 새로고침 후 유지된다", async ({ page }, testInfo) => {
    const title = "QA 자동 작성 메모";
    const initialText = `${title}\n저장 버튼과 내용 반영을 확인합니다.`;
    const editedText = `${title}\n수정한 메모 본문입니다.`;
    await page.goto("/memos");
    await expect(page.getByRole("heading", { name: "QA 회의 메모", exact: true })).toBeVisible();
    await openMemoList(page);
    await page.getByRole("button", { name: "새 메모", exact: true }).click();
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("메모 내용을 입력하세요.", { exact: true })).toBeVisible();
    await page.getByPlaceholder("메모를 입력하세요...").fill(initialText);
    const autoParse = page.getByRole("checkbox", { name: "저장 후 AI 분석", exact: true });
    if (await autoParse.isChecked()) {
      await page.locator("label").filter({ has: autoParse }).click();
    }
    await expect(autoParse).not.toBeChecked();
    await testInfo.attach("memo-create-editor", {
      body: await page.screenshot({ animations: "disabled" }), contentType: "image/png",
    });
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const reader = page.locator("section").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await page.getByRole("button", { name: "편집", exact: true }).click();
    await page.getByPlaceholder("메모를 입력하세요...").fill("QA 취소할 수정");
    await page.getByRole("button", { name: "취소", exact: true }).click();
    await expect(reader.getByText(initialText, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "편집", exact: true }).click();
    await page.getByPlaceholder("메모를 입력하세요...").fill(editedText);
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(reader.getByText(editedText, { exact: true })).toBeVisible();
    await page.reload();
    await openMemoList(page);
    await page.getByRole("textbox", { name: "메모 검색", exact: true }).fill(title);
    await page.locator("aside").getByText(title, { exact: true }).click();
    await expect(reader.getByText(editedText, { exact: true })).toBeVisible();
    expect(api.state.memos.filter((memo) => memo.raw_text === editedText)).toHaveLength(1);
  });

  test("메모 삭제 확인을 취소하면 유지되고 확인하면 목록에서 제거된다", async ({ page }) => {
    await page.goto("/memos");
    const heading = page.getByRole("heading", { name: "QA 회의 메모", exact: true });
    await expect(heading).toBeVisible();
    const reader = page.locator("section").filter({ has: heading });
    page.once("dialog", (dialog) => dialog.dismiss());
    await reader.getByRole("button", { name: "메모 삭제", exact: true }).click();
    await expect(heading).toBeVisible();
    expect(api.state.memos.some((memo) => memo.memo_id === 301)).toBe(true);
    page.once("dialog", (dialog) => dialog.accept());
    await reader.getByRole("button", { name: "메모 삭제", exact: true }).click();
    await expect(heading).toHaveCount(0);
    await expect.poll(() => api.state.memos.some((memo) => memo.memo_id === 301)).toBe(false);
    await page.reload();
    await expect(page.getByRole("heading", { name: "QA 다음 회의 아이디어", exact: true })).toBeVisible();
  });
});

test.describe("인증 화면 · 가상 API", () => {
  test("인증이 필요한 경로에서 로그인으로 이동하고 잘못된 입력을 차단한다", async ({ page }) => {
    const api = await installMockApi(page);
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByText("이메일을 입력하세요.", { exact: true })).toBeVisible();
    await expect(page.getByText("비밀번호를 입력하세요.", { exact: true })).toBeVisible();
    await page.getByLabel("이메일", { exact: true }).fill("invalid-address");
    await page.getByLabel("비밀번호", { exact: true }).fill("test");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page.getByText("올바른 이메일 형식이 아닙니다.", { exact: true })).toBeVisible();
    expect(api.requests.filter((request) => request.path === "/auth/login")).toHaveLength(0);
    await page.getByRole("link", { name: "비밀번호 찾기", exact: true }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    expect(api.unhandled).toEqual([]);
  });

  test("가상 계정으로 로그인하면 요청했던 화면으로 복귀한다", async ({ page }) => {
    const api = await installMockApi(page);
    await page.clock.setFixedTime(new Date(QA_NOW));
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일", { exact: true }).fill("qa@example.invalid");
    await page.getByLabel("비밀번호", { exact: true }).fill("Qa-test-1234!");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByText("QA 오늘 할 일", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByText("QA 오늘 할 일", { exact: true })).toBeVisible();
    expect(api.requests.filter((request) => request.path === "/auth/login")).toHaveLength(1);
    expect(api.unhandled).toEqual([]);
  });
});
