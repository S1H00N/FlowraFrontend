import { expect, test, type Page } from "@playwright/test";
import type { CompanyMembership, CompanyProject } from "../../src/types";
import { installMockApi, QA_NOW, QA_USER, seedAuth } from "./fixtures";

/** The server fixtures in this suite are fictional and never contact a real API. */
const memberships: CompanyMembership[] = [71, 72].map((companyId) => ({
  company_member_id: companyId + 100,
  company_id: companyId,
  user_public_uid: QA_USER.public_uid,
  department_id: companyId + 200,
  email: QA_USER.email,
  name: QA_USER.name,
  role: "manager",
  status: "active",
  company: {
    company_id: companyId,
    name: `QA 회사 ${companyId}`,
    status: "active",
  },
  department: {
    department_id: companyId + 200,
    name: "QA 개발부",
    status: "active",
  },
}));

function makeProject(
  id: number,
  companyId: number,
  name: string,
  status = "active",
): CompanyProject {
  return {
    company_project_id: id,
    company_id: companyId,
    name,
    description: id === 901 ? "고객 온보딩 개선" : "운영 개선",
    status,
    phase_mode: "phased",
    visibility: "department_tree",
    origin_department_id: companyId + 200,
    planned_start_date: "2026-09-09",
    planned_end_date: "2026-09-30",
    created_at: QA_NOW,
  };
}

type ProjectRequest = {
  method: string;
  path: string;
  query: Record<string, string>;
  body: Record<string, unknown>;
};
type Failure = { status: number; code: string; message: string };
type ProjectFixtureOptions = {
  empty?: boolean;
  noMemberships?: boolean;
  readOnly?: boolean;
  longContent?: boolean;
  createResponseLost?: "network" | "503";
};

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function installProjectApi(
  page: Page,
  options: ProjectFixtureOptions = {},
) {
  const base = await installMockApi(page);
  await seedAuth(page);
  await page.clock.setFixedTime(new Date(QA_NOW));
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const state = {
    projects: options.empty
      ? []
      : [
          makeProject(
            901,
            71,
            options.longContent
              ? `QA 긴 프로젝트 ${"매우 긴 이름 ".repeat(20)}`
              : "QA 고객 프로젝트",
          ),
          makeProject(902, 71, "QA 완료 프로젝트", "completed"),
          makeProject(903, 72, "QA 다른 회사 프로젝트"),
        ],
    requests: [] as ProjectRequest[],
    failures: new Map<string, Failure>(),
    gates: new Map<string, Promise<void>>(),
    payloads: new Map<string, unknown>(),
  };
  await page.route("**/api/v1/company-memberships", async (route) => {
    await route.fulfill({
      json: {
        success: true,
        message: "OK",
        data: { items: options.noMemberships ? [] : memberships },
      },
    });
  });
  await page.route("**/api/v1/company-schedules**", async (route) => {
    if (
      route.request().method() === "GET" &&
      new URL(route.request().url()).pathname === "/api/v1/company-schedules"
    ) {
      await route.fulfill({
        json: { success: true, message: "OK", data: { items: [] } },
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/api/v1/company-projects**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const method = request.method();
    if (
      [
        "/company-projects/my-work-items",
        "/company-projects/my-calendar-items",
      ].includes(path)
    ) {
      await route.fulfill({
        json: { success: true, message: "OK", data: { items: [] } },
      });
      return;
    }
    const body = request.postDataJSON() || {};
    state.requests.push({
      method,
      path,
      query: Object.fromEntries(url.searchParams),
      body,
    });
    const key = `${method} ${path}`;
    const failure = state.failures.get(key);
    if (failure) {
      await route.fulfill({
        status: failure.status,
        json: {
          success: false,
          message: failure.message,
          error: { code: failure.code },
        },
      });
      return;
    }
    const gate =
      state.gates.get(`${key} ${url.searchParams.get("company_id") ?? ""}`) ??
      state.gates.get(key);
    if (gate) await gate;
    const reply = async (data: unknown, status = 200) =>
      route.fulfill({ status, json: { success: true, message: "OK", data } });
    if (state.payloads.has(key)) {
      await reply(state.payloads.get(key));
      return;
    }
    if (path === "/company-projects" && method === "GET") {
      const companyId = Number(url.searchParams.get("company_id"));
      const status = url.searchParams.get("status");
      const q = url.searchParams.get("q")?.toLowerCase();
      const projects = state.projects.filter(
        (project) =>
          (!companyId || project.company_id === companyId) &&
          (!status || project.status === status) &&
          (!q ||
            `${project.name} ${project.description ?? ""}`
              .toLowerCase()
              .includes(q)),
      );
      await reply({
        items: projects,
        pagination: {
          total_items: projects.length,
          total_pages: 1,
          has_next: false,
        },
      });
      return;
    }
    if (path === "/company-projects" && method === "POST") {
      const project = {
        ...makeProject(
          997,
          Number(body.company_id),
          String(body.name),
          String(body.status ?? "draft"),
        ),
        ...body,
        company_id: Number(body.company_id),
        description: body.description ?? null,
        planned_start_date: body.planned_start_date ?? null,
        planned_end_date: body.planned_end_date ?? null,
        origin_department_id: memberships.find(
          (membership) => membership.company_id === Number(body.company_id),
        )?.department_id,
      } as CompanyProject;
      state.projects.push(project);
      if (options.createResponseLost) {
        if (options.createResponseLost === "503") {
          await route.fulfill({
            status: 503,
            json: {
              success: false,
              message: "QA 생성 응답을 확인할 수 없습니다.",
              error: { code: "INTERNAL_ERROR" },
            },
          });
        } else {
          await route.abort("failed");
        }
        return;
      }
      await reply({ project }, 201);
      return;
    }
    const match = path.match(/^\/company-projects\/(\d+)(\/members)?$/);
    const project =
      match &&
      state.projects.find(
        (item) => item.company_project_id === Number(match[1]),
      );
    if (match && project) {
      if (match[2] && method === "GET") {
        if (options.readOnly) {
          await route.fulfill({
            status: 403,
            json: {
              success: false,
              message: "프로젝트 관리 권한이 없습니다.",
              error: { code: "COMPANY_PROJECT_FORBIDDEN" },
            },
          });
        } else {
          await reply({
            members: [
              {
                company_project_member_id: project.company_project_id + 1000,
                company_member_id: memberships.find(
                  (membership) => membership.company_id === project.company_id,
                )?.company_member_id,
                role: "owner",
                status: "active",
              },
            ],
          });
        }
        return;
      }
      if (!match[2] && method === "GET") {
        await reply({
          project,
          phases: [],
          work_items: [],
          departments: [],
          assignments: [],
          dependencies: [],
        });
        return;
      }
      if (!match[2] && method === "PATCH") {
        Object.assign(project, body, { updated_at: QA_NOW });
        await reply({ project });
        return;
      }
    }
    await route.fallback();
  });
  return { ...state, base, pageErrors };
}

async function selectOption(
  page: Page,
  label: string,
  option: string | RegExp,
) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("listbox", { name: label, exact: true })
    .getByRole("option", { name: option, exact: true })
    .click();
}

async function fillDate(page: Page, label: string, value: string) {
  if (!value) {
    await page
      .getByRole("button", { name: `${label} 지우기`, exact: true })
      .click();
    return;
  }
  const field = page.getByRole("textbox", { name: label, exact: true });
  await field.fill(value);
  await field.press("Tab");
}

async function expectProjectMenuInsideFields(page: Page, label: string) {
  const menu = page.getByRole("listbox", { name: label, exact: true });
  await expect(menu).toBeVisible();
  const readBounds = () =>
    menu.evaluate((element, name) => {
      const dialog = element.closest('[role="dialog"]')!;
      const form = dialog.querySelector<HTMLElement>("[data-project-fields]")!;
      const trigger = dialog.querySelector<HTMLElement>(
        `button[aria-label="${name}"]`,
      )!;
      const formRect = form.getBoundingClientRect();
      const menuRect = element.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const footerRect = dialog
        .querySelector('button[type="submit"]')!
        .parentElement!.getBoundingClientRect();
      return {
        top: formRect.top + form.clientTop,
        bottom: formRect.top + form.clientTop + form.clientHeight,
        left: formRect.left + form.clientLeft,
        right: formRect.left + form.clientLeft + form.clientWidth,
        menu: {
          top: menuRect.top,
          bottom: menuRect.bottom,
          left: menuRect.left,
          right: menuRect.right,
          width: menuRect.width,
        },
        trigger: {
          top: triggerRect.top,
          bottom: triggerRect.bottom,
          left: triggerRect.left,
          width: triggerRect.width,
        },
        footerTop: footerRect.top,
        side: element.getAttribute("data-side"),
      };
    }, label);
  // Scroll, ResizeObserver and animation frames may update a portal after the trigger.
  await expect
    .poll(async () => {
      const bounds = await readBounds();
      return (
        bounds.menu.top >= bounds.top - 1 &&
        bounds.menu.bottom <= bounds.bottom + 1 &&
        bounds.menu.left >= bounds.left - 1 &&
        bounds.menu.right <= bounds.right + 1 &&
        Math.abs(bounds.menu.left - bounds.trigger.left) <= 1 &&
        Math.abs(bounds.menu.width - bounds.trigger.width) <= 1 &&
        (bounds.side === "top"
          ? Math.abs(bounds.trigger.top - bounds.menu.bottom - 7) <= 1
          : Math.abs(bounds.menu.top - bounds.trigger.bottom - 7) <= 1)
      );
    })
    .toBe(true);
  const bounds = await readBounds();
  expect(bounds.menu.bottom).toBeLessThanOrEqual(bounds.footerTop + 1);
  return bounds;
}

test.describe("프로젝트 기본 관리 · 가상 API", () => {
  let api: Awaited<ReturnType<typeof installProjectApi>>;

  test.afterEach(async ({}, testInfo) => {
    if (!api) return;
    await testInfo.attach("project-api-requests", {
      body: JSON.stringify(api.requests, null, 2),
      contentType: "application/json",
    });
    expect
      .soft(api.base.unhandled, "Every tested API path has an explicit fixture")
      .toEqual([]);
    expect.soft(api.pageErrors, "No uncaught JavaScript error").toEqual([]);
    expect
      .soft(
        api.requests.some((request) => request.method === "DELETE"),
        "Project deletion is outside the documented API",
      )
      .toBe(false);
  });

  test("검색·상태·회사 필터를 서버에 전달하고 회사 전환 중 이전 회사 결과를 숨긴다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects");
    await expect(
      page.getByRole("heading", { name: "프로젝트", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^QA 다른 회사 프로젝트(?:\s|$)/ }),
    ).toHaveCount(0);
    const search = page.getByRole("textbox", {
      name: "프로젝트 검색",
      exact: true,
    });
    await search.fill("온보딩");
    await expect
      .poll(() => api.requests.some((request) => request.query.q === "온보딩"))
      .toBe(true);
    await expect(
      page.getByRole("link", { name: /^QA 완료 프로젝트(?:\s|$)/ }),
    ).toHaveCount(0);
    await search.fill("");
    await selectOption(page, "프로젝트 상태", "완료");
    await expect(
      page.getByRole("link", { name: /^QA 완료 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toHaveCount(0);
    await selectOption(page, "프로젝트 상태", "모든 상태");
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    const gate = deferred();
    api.gates.set("GET /company-projects 72", gate.promise);
    await selectOption(page, "회사 선택", "QA 회사 72");
    await expect
      .poll(() =>
        api.requests.some((request) => request.query.company_id === "72"),
      )
      .toBe(true);
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toHaveCount(0);
    gate.release();
    await expect(
      page.getByRole("link", { name: /^QA 다른 회사 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await search.fill("존재하지 않는 프로젝트");
    await expect(
      page.getByRole("link", { name: /^QA 다른 회사 프로젝트(?:\s|$)/ }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/검색.*결과.*없|조건.*프로젝트.*없/).first(),
    ).toBeVisible();
  });

  test("기존 사이드바에서 프로젝트로 이동하고 상세 화면에서도 프로젝트 메뉴와 헤더가 활성화된다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/tasks");
    if ((page.viewportSize()?.width ?? 1280) < 600) {
      await page
        .locator(".flowra-app-shell > div > header")
        .getByRole("button", { name: "사이드바 열기", exact: true })
        .click();
    }
    const navigationLink = page.locator(
      ".flowra-app-shell > aside nav a[href='/projects']",
    );
    await navigationLink.click();
    await expect(page).toHaveURL((url) => url.pathname === "/projects");
    await expect(navigationLink).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: "프로젝트", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }).click();
    await expect(
      page.getByRole("heading", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await expect(navigationLink).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: "프로젝트", exact: true }),
    ).toBeVisible();
  });

  test("생성 폼을 검증하고 중복 제출 없이 날짜·정책 값을 전송한 뒤 서버 ID를 사용한다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects");
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "프로젝트 검색", exact: true })
      .fill("고객");
    await expect(page).toHaveURL((url) => url.searchParams.get("q") === "고객");
    await selectOption(page, "프로젝트 상태", "진행 중");
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("status") === "active",
    );
    await page
      .getByRole("button", { name: "프로젝트 생성", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 생성",
      exact: true,
    });
    await dialog.getByRole("button", { name: "생성", exact: true }).click();
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(0);
    await dialog
      .getByRole("textbox", { name: "프로젝트명", exact: true })
      .fill("QA 새 프로젝트");
    await dialog
      .getByRole("textbox", { name: "설명", exact: true })
      .fill("QA 생성 설명");
    await fillDate(page, "계획 시작일", "2026-09-20");
    await fillDate(page, "계획 종료일", "2026-09-10");
    await dialog.getByRole("button", { name: "생성", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "계획 종료일이 계획 시작일보다 빠를 수 없습니다.",
    );
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(0);
    await fillDate(page, "계획 종료일", "2026-09-30");
    const gate = deferred();
    api.gates.set("POST /company-projects", gate.promise);
    await dialog.getByRole("button", { name: "생성", exact: true }).click();
    await expect
      .poll(
        () =>
          api.requests.filter((request) => request.method === "POST").length,
      )
      .toBe(1);
    await expect(
      dialog.getByRole("button", { name: /생성|저장/ }).last(),
    ).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: "프로젝트명", exact: true })
      .press("Enter");
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);
    const body = api.requests.find(
      (request) => request.method === "POST",
    )!.body;
    expect(body).toMatchObject({
      company_id: "71",
      name: "QA 새 프로젝트",
      description: "QA 생성 설명",
      planned_start_date: "2026-09-20",
      planned_end_date: "2026-09-30",
      phase_mode: "phased",
    });
    expect(["draft", "active"]).toContain(body.status);
    expect(["department_tree", "members"]).toContain(body.visibility);
    expect([undefined, "271"]).toContain(body.origin_department_id);
    expect(body).not.toHaveProperty("owner_company_member_id");
    gate.release();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(
      (url) => !url.searchParams.has("q") && !url.searchParams.has("status"),
    );
    const createdLink = page.getByRole("link", {
      name: /^QA 새 프로젝트(?:\s|$)/,
    });
    await expect(createdLink).toHaveAttribute(
      "href",
      /^\/projects\/997(?:\?|$)/,
    );
    await createdLink.click();
    await expect(page).toHaveURL(/\/projects\/997(?:\?|$)/);
    await expect(
      page.getByRole("heading", { name: /^QA 새 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
  });

  test("날짜 입력 안의 X로 해당 날짜만 지우고 캘린더 선택값과 초기화값을 생성 요청에 반영한다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects");
    await page
      .getByRole("button", { name: "프로젝트 생성", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 생성",
      exact: true,
    });
    const start = dialog.getByRole("textbox", {
      name: "계획 시작일",
      exact: true,
    });
    const end = dialog.getByRole("textbox", {
      name: "계획 종료일",
      exact: true,
    });
    const startClear = dialog.getByRole("button", {
      name: "계획 시작일 지우기",
      exact: true,
    });
    const endClear = dialog.getByRole("button", {
      name: "계획 종료일 지우기",
      exact: true,
    });
    const calendar = dialog.locator(".schedule-date-popover");
    await expect(startClear).toHaveCount(0);
    await expect(endClear).toHaveCount(0);
    await expect(dialog.getByText("지우기", { exact: true })).toHaveCount(0);

    await dialog
      .getByRole("textbox", { name: "프로젝트명", exact: true })
      .fill("QA 날짜 초기화 프로젝트");
    await start.click();
    await expect(calendar).toBeVisible();
    await calendar.getByRole("button", { name: "20", exact: true }).click();
    await expect(start).toHaveValue("09.20(일)");
    await expect(startClear).toBeVisible();
    await expect(calendar).toHaveCount(0);
    await end.click();
    await expect(calendar).toBeVisible();
    await calendar.getByRole("button", { name: "30", exact: true }).click();
    await expect(end).toHaveValue("09.30(수)");
    await expect(endClear).toBeVisible();

    const fieldBounds = (await start.locator("..").boundingBox())!;
    const clearBounds = (await startClear.boundingBox())!;
    expect(clearBounds.x).toBeGreaterThanOrEqual(fieldBounds.x);
    expect(clearBounds.x + clearBounds.width).toBeLessThanOrEqual(
      fieldBounds.x + fieldBounds.width + 1,
    );
    expect(clearBounds.y).toBeGreaterThanOrEqual(fieldBounds.y);
    expect(clearBounds.y + clearBounds.height).toBeLessThanOrEqual(
      fieldBounds.y + fieldBounds.height + 1,
    );
    expect(clearBounds.width).toBeGreaterThanOrEqual(28);
    expect(clearBounds.height).toBeGreaterThanOrEqual(28);
    await expect(startClear).toHaveText("");
    await expect(startClear.locator("svg")).toBeVisible();
    await startClear.click();
    await expect(startClear).toHaveCount(0);
    await expect(start).toHaveValue("날짜 선택");
    await expect(end).toHaveValue("09.30(수)");
    await expect(endClear).toBeVisible();
    await expect(start).toHaveAttribute("aria-expanded", "false");
    await expect(end).toHaveAttribute("aria-expanded", "false");
    await expect(calendar).toHaveCount(0);

    await start.click();
    await expect(calendar).toBeVisible();
    await calendar.getByRole("button", { name: "20", exact: true }).click();
    await endClear.focus();
    await endClear.press("Enter");
    await expect(endClear).toHaveCount(0);
    await expect(end).toHaveValue("날짜 선택");
    await expect(start).toHaveValue("09.20(일)");
    await expect(startClear).toBeVisible();
    await expect(calendar).toHaveCount(0);
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(0);

    await end.click();
    await expect(calendar).toBeVisible();
    await calendar.getByRole("button", { name: "30", exact: true }).click();
    await startClear.click();
    await dialog.getByRole("button", { name: "생성", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const createdBody = api.requests.find(
      (request) => request.method === "POST",
    )!.body;
    expect(createdBody).toMatchObject({
      name: "QA 날짜 초기화 프로젝트",
      planned_end_date: "2026-09-30",
    });
    // The existing create API omits empty dates; PATCH sends explicit null to clear them.
    expect(createdBody).not.toHaveProperty("planned_start_date");
    expect(
      api.projects.find((project) => project.company_project_id === 997)
        ?.planned_start_date,
    ).toBeNull();
  });

  test("상세 정보 수정·보관과 명시적 날짜 초기화가 재조회 및 새로고침 후 유지된다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects/901");
    await expect(
      page.getByRole("heading", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "프로젝트 수정", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 수정",
      exact: true,
    });
    await dialog
      .getByRole("textbox", { name: "프로젝트명", exact: true })
      .fill("QA 보관 프로젝트");
    await dialog.getByRole("textbox", { name: "설명", exact: true }).fill("");
    await fillDate(page, "계획 시작일", "");
    await fillDate(page, "계획 종료일", "");
    await selectOption(page, "프로젝트 상태 변경", "보관");
    page.once("dialog", (confirmation) => confirmation.accept());
    await dialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "QA 보관 프로젝트", exact: true }),
    ).toBeVisible();
    const patch = api.requests.find((request) => request.method === "PATCH");
    expect(patch).toMatchObject({
      path: "/company-projects/901",
      body: {
        name: "QA 보관 프로젝트",
        description: null,
        status: "archived",
        planned_start_date: null,
        planned_end_date: null,
      },
    });
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "QA 보관 프로젝트", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator("main").getByText("보관", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "간트 차트", exact: true }),
    ).toHaveCount(0);
  });

  test("회사 역할과 별개로 프로젝트 관리 권한이 없으면 수정 기능을 제공하지 않는다", async ({
    page,
  }) => {
    api = await installProjectApi(page, { readOnly: true });
    await page.goto("/projects/901");
    await expect(
      page.getByRole("heading", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await expect
      .poll(() =>
        api.requests.some(
          (request) => request.path === "/company-projects/901/members",
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "프로젝트 수정", exact: true }),
    ).toHaveCount(0);
    expect(
      api.requests.filter((request) => request.method === "PATCH"),
    ).toHaveLength(0);
  });

  test("회사 멤버십이 없으면 프로젝트 조회 및 생성을 요청하지 않는다", async ({
    page,
  }) => {
    api = await installProjectApi(page, { noMemberships: true });
    await page.goto("/projects");
    await expect(
      page.getByText(/소속.*회사.*없|활성.*회사.*없|회사.*멤버십.*없/).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "프로젝트 생성", exact: true }),
    ).toHaveCount(0);
    expect(
      api.requests.filter((request) => request.path === "/company-projects"),
    ).toHaveLength(0);
  });

  test("조회 오류를 빈 목록과 구분하고 재시도로 서버 결과를 갱신한다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    api.failures.set("GET /company-projects", {
      status: 503,
      code: "INTERNAL_ERROR",
      message: "QA 프로젝트 서버 오류",
    });
    await page.goto("/projects");
    await expect(
      page.getByText("QA 프로젝트 서버 오류", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/아직.*프로젝트.*없|프로젝트가 없습니다/),
    ).toHaveCount(0);
    api.failures.delete("GET /company-projects");
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await expect(
      page.getByText("QA 프로젝트 서버 오류", { exact: true }),
    ).toHaveCount(0);
  });

  test("잘못된 목록 응답을 정상적인 빈 프로젝트 목록으로 처리하지 않는다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    api.payloads.set("GET /company-projects", { items: "not-a-project-list" });
    await page.goto("/projects");
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(
      page.getByText("프로젝트가 없습니다", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "조회된 프로젝트 현황", exact: true }),
    ).toHaveCount(0);
    api.payloads.delete("GET /company-projects");
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
  });

  test("변경한 폼을 취소할 때 확인을 거절하면 입력을 유지하고 수락하면 저장 없이 닫는다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects");
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "프로젝트 생성", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 생성",
      exact: true,
    });
    await dialog
      .getByRole("textbox", { name: "프로젝트명", exact: true })
      .fill("QA 저장하지 않은 프로젝트");
    page.once("dialog", (confirmation) => confirmation.dismiss());
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(
      dialog.getByRole("textbox", { name: "프로젝트명", exact: true }),
    ).toHaveValue("QA 저장하지 않은 프로젝트");
    page.once("dialog", (confirmation) => confirmation.accept());
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(0);
  });

  test("미저장 상세 수정 중 브라우저 뒤로 가기 확인을 거절하거나 수락할 수 있다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects");
    await page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }).click();
    await page
      .getByRole("button", { name: "프로젝트 수정", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 수정",
      exact: true,
    });
    await dialog
      .getByRole("textbox", { name: "프로젝트명", exact: true })
      .fill("QA 뒤로 가기 미저장 이름");
    page.once("dialog", (confirmation) => confirmation.dismiss());
    await page.goBack();
    await expect(page).toHaveURL(/\/projects\/901(?:\?|$)/);
    await expect(
      dialog.getByRole("textbox", { name: "프로젝트명", exact: true }),
    ).toHaveValue("QA 뒤로 가기 미저장 이름");
    page.once("dialog", (confirmation) => confirmation.accept());
    await page.goBack();
    await expect(page).toHaveURL(/\/projects(?:\?|$)/);
    await expect(dialog).toHaveCount(0);
    expect(
      api.requests.filter((request) => request.method === "PATCH"),
    ).toHaveLength(0);
  });

  test("저장 응답을 기다리는 동안 폼 닫기와 뒤로 가기를 차단한다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects");
    await page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }).click();
    await page
      .getByRole("button", { name: "프로젝트 수정", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 수정",
      exact: true,
    });
    await dialog
      .getByRole("textbox", { name: "프로젝트명", exact: true })
      .fill("QA 저장 대기 프로젝트");
    const gate = deferred();
    api.gates.set("PATCH /company-projects/901", gate.promise);
    await dialog.getByRole("button", { name: "저장", exact: true }).click();
    await expect
      .poll(
        () =>
          api.requests.filter((request) => request.method === "PATCH").length,
      )
      .toBe(1);
    await expect(
      dialog.getByRole("button", { name: "취소", exact: true }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/projects\/901(?:\?|$)/);
    await expect(dialog).toBeVisible();
    gate.release();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "QA 저장 대기 프로젝트", exact: true }),
    ).toBeVisible();
    expect(
      api.requests.filter((request) => request.method === "PATCH"),
    ).toHaveLength(1);
  });

  for (const loss of ["network", "503"] as const) {
    test(`생성 ${loss} 응답 불확실 시 중복 요청을 막고 목록에서 생성 결과를 확인한다`, async ({
      page,
    }) => {
      api = await installProjectApi(page, { createResponseLost: loss });
      await page.goto("/projects");
      await expect(
        page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "프로젝트 생성", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "프로젝트 생성",
        exact: true,
      });
      await dialog
        .getByRole("textbox", { name: "프로젝트명", exact: true })
        .fill("QA 응답 유실 프로젝트");
      await dialog.getByRole("button", { name: "생성", exact: true }).click();
      await expect(dialog.getByText(/저장되었을 수.*목록.*확인/)).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "생성", exact: true }),
      ).toBeDisabled();
      await dialog
        .getByRole("textbox", { name: "프로젝트명", exact: true })
        .press("Enter");
      expect(
        api.requests.filter((request) => request.method === "POST"),
      ).toHaveLength(1);
      await dialog
        .getByRole("button", { name: "목록에서 확인", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: /^QA 응답 유실 프로젝트(?:\s|$)/ }),
      ).toHaveAttribute("href", /^\/projects\/997(?:\?|$)/);
      expect(
        api.requests.filter((request) => request.method === "POST"),
      ).toHaveLength(1);
    });
  }

  test("서버의 부서 생성 정책 거절을 표시하고 작성 내용을 보존한다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    api.failures.set("POST /company-projects", {
      status: 403,
      code: "COMPANY_PROJECT_CREATE_DISABLED",
      message: "Project creation is disabled for this department",
    });
    await page.goto("/projects");
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "프로젝트 생성", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 생성",
      exact: true,
    });
    await dialog
      .getByRole("textbox", { name: "프로젝트명", exact: true })
      .fill("QA 정책 거절 프로젝트");
    await dialog
      .getByRole("textbox", { name: "설명", exact: true })
      .fill("QA 작성 내용 유지");
    await fillDate(page, "계획 시작일", "2026-09-20");
    await fillDate(page, "계획 종료일", "2026-09-30");
    await selectOption(page, "공개 범위", "프로젝트 멤버");
    await selectOption(page, "생성 상태", "진행 중");
    await selectOption(page, "운영 방식", /^단계 없음/);
    await expect(
      dialog.getByRole("button", { name: "생성", exact: true }),
    ).toBeEnabled();
    await dialog.getByRole("button", { name: "생성", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "프로젝트를 생성할 수 없습니다.",
    );
    await expect(dialog.getByRole("alert")).toContainText(
      "현재 소속 부서에서는 프로젝트 생성이 제한되어 있습니다. 부서 관리자에게 권한을 문의해 주세요.",
    );
    await expect(
      dialog.getByText("Project creation is disabled for this department"),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("textbox", { name: "프로젝트명", exact: true }),
    ).toHaveValue("QA 정책 거절 프로젝트");
    await expect(
      dialog.getByRole("textbox", { name: "설명", exact: true }),
    ).toHaveValue("QA 작성 내용 유지");
    await expect(
      dialog.getByRole("textbox", { name: "계획 시작일", exact: true }),
    ).toHaveValue("09.20(일)");
    await expect(
      dialog.getByRole("textbox", { name: "계획 종료일", exact: true }),
    ).toHaveValue("09.30(수)");
    await expect(
      dialog.getByRole("button", { name: "공개 범위", exact: true }),
    ).toContainText("프로젝트 멤버");
    await expect(
      dialog.getByRole("button", { name: "생성 상태", exact: true }),
    ).toContainText("진행 중");
    await expect(
      dialog.getByRole("button", { name: "운영 방식", exact: true }),
    ).toContainText("단계 없음");
    expect(
      api.projects.some((project) => project.name === "QA 정책 거절 프로젝트"),
    ).toBe(false);
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(1);

    api.failures.set("POST /company-projects", {
      status: 403,
      code: "QA_UNKNOWN_CREATE_ERROR",
      message: "QA another project creation error",
    });
    await dialog.getByRole("button", { name: "생성", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "QA another project creation error",
    );
    await expect(dialog.getByRole("alert")).not.toContainText(
      "소속 부서에서는 프로젝트 생성이 제한",
    );
    await expect(
      dialog.getByRole("textbox", { name: "프로젝트명", exact: true }),
    ).toHaveValue("QA 정책 거절 프로젝트");
    api.failures.delete("POST /company-projects");
    await dialog.getByRole("button", { name: "생성", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const posts = api.requests.filter((request) => request.method === "POST");
    expect(posts).toHaveLength(3);
    expect(posts[2].body).toMatchObject({
      name: "QA 정책 거절 프로젝트",
      description: "QA 작성 내용 유지",
      planned_start_date: "2026-09-20",
      planned_end_date: "2026-09-30",
      visibility: "members",
      status: "active",
      phase_mode: "phase_less",
    });
  });

  test("검색과 필터의 높이·간격·너비가 균형을 이루고 좁은 모바일에서도 겹치지 않는다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects");
    await expect(
      page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    for (const width of [page.viewportSize()!.width, 320]) {
      await page.setViewportSize({
        width,
        height: page.viewportSize()!.height,
      });
      const metrics = await page
        .locator(".projects-toolbar")
        .evaluate((toolbar) => {
          const rect = (element: Element) => {
            const bounds = element.getBoundingClientRect();
            return {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
              right: bounds.right,
              bottom: bounds.bottom,
            };
          };
          const controls = [
            "회사 선택",
            "프로젝트 검색",
            "프로젝트 상태",
            "프로젝트 새로고침",
          ].map((label) =>
            rect(toolbar.querySelector(`[aria-label="${label}"]`)!),
          );
          const input = toolbar.querySelector<HTMLInputElement>(
            'input[aria-label="프로젝트 검색"]',
          )!;
          const inputStyle = getComputedStyle(input);
          const context = document.createElement("canvas").getContext("2d")!;
          context.font = inputStyle.font;
          return {
            toolbar: rect(toolbar),
            controls,
            icon: rect(toolbar.querySelector(".projects-search > svg")!),
            textStart:
              input.getBoundingClientRect().left +
              parseFloat(inputStyle.paddingLeft),
            placeholderWidth: context.measureText(input.placeholder).width,
            textWidth:
              input.clientWidth -
              parseFloat(inputStyle.paddingLeft) -
              parseFloat(inputStyle.paddingRight),
            documentWidth: document.documentElement.scrollWidth,
          };
        });
      expect(metrics.documentWidth).toBeLessThanOrEqual(width + 1);
      expect(metrics.placeholderWidth).toBeLessThanOrEqual(
        metrics.textWidth + 1,
      );
      expect(metrics.textStart).toBeGreaterThanOrEqual(metrics.icon.right + 4);
      for (const control of metrics.controls) {
        expect(control.x).toBeGreaterThanOrEqual(metrics.toolbar.x - 1);
        expect(control.right).toBeLessThanOrEqual(metrics.toolbar.right + 1);
        expect(control.height).toBeCloseTo(metrics.controls[0].height, 0);
      }
      for (let first = 0; first < metrics.controls.length; first += 1) {
        for (
          let second = first + 1;
          second < metrics.controls.length;
          second += 1
        ) {
          const a = metrics.controls[first],
            b = metrics.controls[second];
          expect(
            a.right <= b.x + 1 ||
              b.right <= a.x + 1 ||
              a.bottom <= b.y + 1 ||
              b.bottom <= a.y + 1,
          ).toBe(true);
        }
      }
      const [company, search, status, refresh] = metrics.controls;
      expect(refresh.width).toBeLessThanOrEqual(48);
      if (width >= 1000) {
        expect(search.width).toBeGreaterThan(company.width);
        expect(search.width).toBeGreaterThan(status.width);
        expect(status.width).toBeLessThanOrEqual(company.width + 1);
        for (const control of metrics.controls)
          expect(control.y).toBeCloseTo(company.y, 0);
        expect(search.x - company.right).toBeCloseTo(
          status.x - search.right,
          0,
        );
        expect(status.x - search.right).toBeCloseTo(
          refresh.x - status.right,
          0,
        );
      }
    }
  });

  test("낮은 화면에서 폼만 스크롤하고 모달 버튼·드롭다운 선택과 키보드 포커스를 유지한다", async ({
    page,
  }) => {
    const width = page.viewportSize()!.width;
    await page.setViewportSize({ width, height: 500 });
    api = await installProjectApi(page);
    await page.goto("/projects");
    await page
      .getByRole("button", { name: "프로젝트 생성", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 생성",
      exact: true,
    });
    const title = dialog.getByRole("heading", {
      name: "프로젝트 생성",
      exact: true,
    });
    const create = dialog.getByRole("button", { name: "생성", exact: true });
    const cancel = dialog.getByRole("button", { name: "취소", exact: true });
    const fields = dialog.locator("[data-project-fields]");
    await expect(title).toBeInViewport({ ratio: 1 });
    await expect(create).toBeInViewport({ ratio: 1 });
    await expect(cancel).toBeInViewport({ ratio: 1 });
    const titleBefore = (await title.boundingBox())!;
    const createBefore = (await create.boundingBox())!;
    const formMetrics = await fields.evaluate((form) => ({
      height: form.clientHeight,
      scrollHeight: form.scrollHeight,
      overflow: getComputedStyle(form).overflowY,
    }));
    expect(formMetrics.scrollHeight).toBeGreaterThan(formMetrics.height);
    expect(formMetrics.overflow).toBe("auto");

    const startBox = (await dialog
      .getByRole("textbox", { name: "계획 시작일", exact: true })
      .boundingBox())!;
    const endBox = (await dialog
      .getByRole("textbox", { name: "계획 종료일", exact: true })
      .boundingBox())!;
    const visibilityBox = (await dialog
      .getByRole("button", { name: "공개 범위", exact: true })
      .boundingBox())!;
    const statusBox = (await dialog
      .getByRole("button", { name: "생성 상태", exact: true })
      .boundingBox())!;
    for (const [first, second] of [
      [startBox, endBox],
      [visibilityBox, statusBox],
    ]) {
      if (width < 640) {
        expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
        expect(second.x).toBeCloseTo(first.x, 0);
      } else {
        expect(second.y).toBeCloseTo(first.y, 0);
        expect(second.x).toBeGreaterThan(first.x + first.width);
      }
    }

    await fields.evaluate((form) => {
      form.scrollTop = form.scrollHeight;
    });
    expect(await fields.evaluate((form) => form.scrollTop)).toBeGreaterThan(0);
    expect((await title.boundingBox())!.y).toBeCloseTo(titleBefore.y, 0);
    expect((await create.boundingBox())!.y).toBeCloseTo(createBefore.y, 0);
    await create.click({ trial: true });
    await cancel.click({ trial: true });
    const trigger = dialog.getByRole("button", {
      name: "운영 방식",
      exact: true,
    });
    await trigger.focus();
    await trigger.press("ArrowDown");
    const menu = dialog.getByRole("listbox", {
      name: "운영 방식",
      exact: true,
    });
    const phased = menu.getByRole("option", { name: /^단계형/ });
    const phaseLess = menu.getByRole("option", { name: /^단계 없음/ });
    await expect(menu).toBeVisible();
    await expect(phased).toHaveAttribute("aria-selected", "true");
    await expect(phased.locator("svg.lucide-check")).toBeVisible();
    await expect(phaseLess.locator("svg.lucide-check")).toHaveCount(0);
    await expect(menu.locator("[class*='rounded-full']")).toHaveCount(0);
    await expect(
      menu.getByText("프로젝트를 여러 단계로 구분하여 관리합니다.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      menu.getByText("별도 프로젝트 단계 없이 업무를 직접 관리합니다.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await menu.evaluate(
        (element) => element.closest("[data-project-fields]") === null,
      ),
    ).toBe(true);
    const triggerBounds = (await trigger.boundingBox())!;
    const menuBounds = (await menu.boundingBox())!;
    expect(menuBounds.width).toBeCloseTo(triggerBounds.width, 0);
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(width + 1);
    expect(menuBounds.y).toBeGreaterThanOrEqual(0);
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(500);
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(
      triggerBounds.y + 1,
    );
    await expect(phased).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(phaseLess).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toContainText("단계 없음");
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await expect(phaseLess).toHaveAttribute("aria-selected", "true");
    await expect(phaseLess.locator("svg.lucide-check")).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await expect(phased).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText("단계 없음");
    await expect(create).toBeInViewport({ ratio: 1 });
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(0);
  });

  test("생성 드롭다운이 입력 영역 안에서 열리고 footer를 가리지 않는다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects");
    await page
      .getByRole("button", { name: "프로젝트 생성", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 생성",
      exact: true,
    });
    const name = dialog.getByRole("textbox", {
      name: "프로젝트명",
      exact: true,
    });
    const description = dialog.getByRole("textbox", {
      name: "설명",
      exact: true,
    });
    await name.fill("QA dropdown footer 검증");
    await description.fill("메뉴를 조작해도 작성 내용을 유지합니다.");
    for (const { label, next } of [
      { label: "공개 범위", next: "프로젝트 멤버" },
      { label: "생성 상태", next: "진행 중" },
      { label: "운영 방식", next: "단계 없음" },
    ]) {
      const trigger = dialog.getByRole("button", { name: label, exact: true });
      await trigger.click();
      const menu = dialog.getByRole("listbox", { name: label, exact: true });
      const bounds = await expectProjectMenuInsideFields(page, label);
      if (label === "운영 방식") expect(bounds.side).toBe("top");
      await dialog
        .getByRole("button", { name: "생성", exact: true })
        .click({ trial: true });
      await dialog
        .getByRole("button", { name: "취소", exact: true })
        .click({ trial: true });
      await expect(menu.getByRole("option", { selected: true })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(
        menu.getByRole("option", { name: new RegExp(`^${next}`) }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(trigger).toContainText(next);
      await trigger.press("Enter");
      await expectProjectMenuInsideFields(page, label);
      await page.keyboard.press("ArrowUp");
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(trigger).toContainText(next);
      await trigger.click();
      await expectProjectMenuInsideFields(page, label);
      await dialog
        .getByRole("heading", { name: "프로젝트 생성", exact: true })
        .click();
      await expect(menu).toHaveCount(0);
      await expect(dialog).toBeVisible();
      await expect(name).toHaveValue("QA dropdown footer 검증");
      await expect(description).toHaveValue(
        "메뉴를 조작해도 작성 내용을 유지합니다.",
      );
    }
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(0);
  });

  test("낮은 모달 드롭다운은 스크롤·리사이즈 후 입력 영역 경계를 유지한다", async ({
    page,
  }) => {
    const width = page.viewportSize()!.width;
    await page.setViewportSize({ width, height: 340 });
    api = await installProjectApi(page);
    await page.goto("/projects");
    await page
      .getByRole("button", { name: "프로젝트 생성", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 생성",
      exact: true,
    });
    const name = dialog.getByRole("textbox", {
      name: "프로젝트명",
      exact: true,
    });
    await name.fill("QA 작은 화면 입력 유지");
    const trigger = dialog.getByRole("button", {
      name: "운영 방식",
      exact: true,
    });
    await trigger.evaluate((element) => {
      const form = element.closest<HTMLElement>("[data-project-fields]")!;
      const fieldBounds = form.getBoundingClientRect();
      const triggerBounds = element.getBoundingClientRect();
      form.scrollTop +=
        triggerBounds.top +
        triggerBounds.height / 2 -
        (fieldBounds.top + form.clientTop + form.clientHeight / 2);
    });
    await trigger.click();
    const menu = dialog.getByRole("listbox", {
      name: "운영 방식",
      exact: true,
    });
    const beforeScroll = await expectProjectMenuInsideFields(page, "운영 방식");
    const menuMetrics = await menu.evaluate((element) => ({
      height: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflow: getComputedStyle(element).overflowY,
      maxHeight: parseFloat(getComputedStyle(element).maxHeight),
    }));
    expect(menuMetrics.maxHeight).toBeLessThan(100);
    expect(menuMetrics.scrollHeight).toBeGreaterThan(menuMetrics.height);
    expect(menuMetrics.overflow).toBe("auto");
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("option", { name: /^단계 없음/ }),
    ).toBeFocused();
    await expect
      .poll(() => menu.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("option", { name: /^단계형/ })).toBeFocused();
    await dialog
      .getByRole("button", { name: "취소", exact: true })
      .click({ trial: true });
    await dialog
      .getByRole("button", { name: "생성", exact: true })
      .click({ trial: true });
    await dialog.locator("[data-project-fields]").evaluate((form) => {
      form.scrollTop -= 16;
    });
    await expect
      .poll(async () => (await trigger.boundingBox())!.y)
      .toBeGreaterThan(beforeScroll.trigger.top + 10);
    await expectProjectMenuInsideFields(page, "운영 방식");
    await page.setViewportSize({
      width: width < 640 ? 360 : 1000,
      height: 500,
    });
    await expectProjectMenuInsideFields(page, "운영 방식");
    await expect(menu).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(
      menu.getByRole("option", { name: /^단계 없음/ }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toContainText("단계 없음");
    await expect(name).toHaveValue("QA 작은 화면 입력 유지");
    await expect(
      dialog.getByRole("button", { name: "생성", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await trigger.click();
    await expect(menu).toBeVisible();
    await dialog.locator("[data-project-fields]").evaluate((form) => {
      form.scrollTop = 0;
    });
    await expect(menu).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toContainText("단계 없음");
    await expect(name).toHaveValue("QA 작은 화면 입력 유지");
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(0);
  });

  test("수정 모달 드롭다운과 목록 필터의 기존 선택을 유지한다", async ({
    page,
  }) => {
    api = await installProjectApi(page);
    await page.goto("/projects/901");
    await page
      .getByRole("button", { name: "프로젝트 수정", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "프로젝트 수정",
      exact: true,
    });
    const name = dialog.getByRole("textbox", {
      name: "프로젝트명",
      exact: true,
    });
    await name.fill("QA 수정 dropdown 작성 유지");
    for (const label of ["공개 범위", "프로젝트 상태 변경"]) {
      const trigger = dialog.getByRole("button", { name: label, exact: true });
      await trigger.click();
      const menu = dialog.getByRole("listbox", { name: label, exact: true });
      await expectProjectMenuInsideFields(page, label);
      await dialog
        .getByRole("button", { name: "저장", exact: true })
        .click({ trial: true });
      await dialog
        .getByRole("button", { name: "취소", exact: true })
        .click({ trial: true });
      await expect(menu.getByRole("option", { selected: true })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await expect(name).toHaveValue("QA 수정 dropdown 작성 유지");
    }
    page.once("dialog", (confirmation) => confirmation.accept());
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(
      api.requests.filter((request) => request.method === "PATCH"),
    ).toHaveLength(0);
    await page.goto("/projects");
    await selectOption(page, "회사 선택", "QA 회사 72");
    await expect(
      page.getByRole("link", { name: /^QA 다른 회사 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
    await selectOption(page, "프로젝트 상태", "진행 중");
    await expect
      .poll(() =>
        api.requests.some(
          (request) =>
            request.query.company_id === "72" &&
            request.query.status === "active",
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("link", { name: /^QA 다른 회사 프로젝트(?:\s|$)/ }),
    ).toBeVisible();
  });

  test("라이트·다크 테마에서 프로젝트 페이지와 생성 모달·드롭다운의 가독성을 유지한다", async ({
    page,
  }, testInfo) => {
    api = await installProjectApi(page);
    await page.goto("/projects");
    const capture = async (name: string) => {
      const path = testInfo.outputPath(`${name}.png`);
      await page.screenshot({ path, animations: "disabled" });
      await testInfo.attach(name, { path, contentType: "image/png" });
    };
    const themeColors: Record<
      string,
      { foreground: string; background: string }
    > = {};
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((value) => {
        localStorage.setItem(
          "flowra:user-settings",
          JSON.stringify({ theme: value }),
        );
      }, theme);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute(
        "data-resolved-theme",
        theme,
      );
      await expect(
        page.getByRole("link", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
      ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await capture(`${theme}-projects-page`);
      await page
        .getByRole("button", { name: "프로젝트 생성", exact: true })
        .click();
      const dialog = page.getByRole("dialog", {
        name: "프로젝트 생성",
        exact: true,
      });
      await dialog
        .getByRole("textbox", { name: "프로젝트명", exact: true })
        .fill("QA UI/UX 검증 프로젝트");
      await fillDate(page, "계획 시작일", "2026-09-20");
      await fillDate(page, "계획 종료일", "2026-09-30");
      await expect(
        dialog.getByRole("button", { name: "계획 시작일 지우기", exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: "생성", exact: true })
        .click({ trial: true });
      await capture(`${theme}-project-create-modal`);
      await dialog
        .getByRole("button", { name: "운영 방식", exact: true })
        .click();
      const menu = dialog.getByRole("listbox", {
        name: "운영 방식",
        exact: true,
      });
      await expect(
        menu.getByRole("option", { name: /^단계형/ }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(
        menu.getByRole("option", { name: /^단계 없음/ }),
      ).toBeVisible();
      await capture(`${theme}-project-create-dropdown`);
      const colors = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d")!;
        const rgb = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data];
        };
        const luminance = (color: number[]) =>
          color.slice(0, 3).reduce((total, channel, index) => {
            const value = channel / 255;
            return (
              total +
              [0.2126, 0.7152, 0.0722][index] *
                (value <= 0.04045
                  ? value / 12.92
                  : ((value + 0.055) / 1.055) ** 2.4)
            );
          }, 0);
        return [
          ".projects-heading h2",
          ".projects-search input",
          '[role="dialog"] h2',
          '[role="dialog"] input[aria-label="계획 시작일"]',
          '[role="listbox"] [aria-selected="true"] .font-semibold',
          '[role="listbox"] [aria-selected="false"] .font-semibold',
        ].map((selector) => {
          const element = document.querySelector(selector)!;
          const foreground = getComputedStyle(element).color;
          const ancestors: Element[] = [];
          for (
            let ancestor: Element | null = element;
            ancestor;
            ancestor = ancestor.parentElement
          )
            ancestors.unshift(ancestor);
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = "white";
          context.fillRect(0, 0, 1, 1);
          for (const ancestor of ancestors) {
            context.fillStyle = getComputedStyle(ancestor).backgroundColor;
            context.fillRect(0, 0, 1, 1);
          }
          const background = [...context.getImageData(0, 0, 1, 1).data];
          const foregroundLuminance = luminance(rgb(foreground));
          const backgroundLuminance = luminance(background);
          return {
            selector,
            foreground,
            background: background.join(","),
            contrast:
              (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
              (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
          };
        });
      });
      for (const color of colors) {
        expect(
          color.contrast,
          `${theme}: readable text in ${color.selector}`,
        ).toBeGreaterThanOrEqual(3);
      }
      themeColors[theme] = colors[2];
      await testInfo.attach(`${theme}-project-colors`, {
        body: JSON.stringify(colors, null, 2),
        contentType: "application/json",
      });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      page.once("dialog", (confirmation) => confirmation.accept());
      await dialog.getByRole("button", { name: "취소", exact: true }).click();
      await expect(dialog).toHaveCount(0);
    }
    expect(themeColors.dark.background).not.toBe(themeColors.light.background);
    expect(themeColors.dark.foreground).not.toBe(themeColors.light.foreground);
    expect(
      api.requests.filter((request) => request.method === "POST"),
    ).toHaveLength(0);
  });

  test("빈 목록과 긴 이름을 포함한 목록에서도 모바일 가로 넘침 없이 표시한다", async ({
    page,
  }) => {
    api = await installProjectApi(page, { empty: true });
    await page.goto("/projects");
    await expect(
      page.getByText(/아직.*프로젝트.*없|프로젝트가 없습니다/).first(),
    ).toBeVisible();
    api.projects.push(
      makeProject(950, 71, `QA 긴 프로젝트 ${"매우 긴 이름 ".repeat(20)}`),
    );
    await page.reload();
    await expect(
      page.getByRole("link", { name: /^QA 긴 프로젝트/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  });

  for (const failure of [
    {
      status: 403,
      code: "COMPANY_PROJECT_FORBIDDEN",
      message: "QA 프로젝트 접근 권한이 없습니다.",
    },
    {
      status: 404,
      code: "COMPANY_PROJECT_NOT_FOUND",
      message: "QA 프로젝트를 찾을 수 없습니다.",
    },
  ]) {
    test(`상세 ${failure.status} 오류를 정상 개요와 구분한다`, async ({
      page,
    }) => {
      api = await installProjectApi(page);
      api.failures.set("GET /company-projects/901", failure);
      await page.goto("/projects/901");
      await expect(
        page.getByText(failure.message, { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: /^QA 고객 프로젝트(?:\s|$)/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "프로젝트 수정", exact: true }),
      ).toHaveCount(0);
    });
  }
});
