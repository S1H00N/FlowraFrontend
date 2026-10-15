import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type {
  CompanyMembership,
  CompanyProject,
  CompanyProjectAssignment,
  CompanyProjectPhase,
  CompanyProjectWorkItem,
} from "../../src/types";
import { installMockApi, QA_NOW, QA_USER, seedAuth } from "./fixtures";

/** Fictional fixtures exercise documented project reads, creation, updates and cancellation. */
const membership: CompanyMembership = {
  company_member_id: 171,
  company_id: 71,
  department_id: 271,
  user_public_uid: QA_USER.public_uid,
  name: QA_USER.name,
  email: QA_USER.email,
  role: "member", // A company role must not grant project management rights.
  status: "active",
  company: { company_id: 71, name: "QA 회사", status: "active" },
  department: { department_id: 271, name: "QA 개발부", status: "active" },
};

function project(id: number, phaseLess = false): CompanyProject {
  return {
    company_project_id: id,
    company_id: 71,
    origin_department_id: 271,
    name: id === 901 ? "QA 계층형 프로젝트" : "QA 독립 프로젝트",
    description: "프로젝트 개요가 업무와 함께 유지됩니다.",
    status: "active",
    phase_mode: phaseLess ? "phase_less" : "phased",
    visibility: "department_tree",
    planned_start_date: "2026-09-09",
    planned_end_date: "2026-09-30",
    created_at: QA_NOW,
  };
}

function work(
  id: number,
  title: string,
  fields: Partial<CompanyProjectWorkItem> = {},
): CompanyProjectWorkItem {
  return {
    company_project_work_item_id: id,
    company_project_id: 901,
    company_project_phase_id: 501,
    parent_work_item_id: null,
    depth_level: 1,
    title,
    description: `${title} 설명`,
    status: "in_progress",
    priority: "high",
    planned_start_date: "2026-09-10",
    planned_end_date: "2026-09-20",
    progress_percent: 37,
    progress_override_percent: null,
    sort_order: id,
    rollup: { child_count: 0 },
    ...fields,
  };
}

type Request = {
  method: string;
  path: string;
  query: Record<string, string>;
  body: Record<string, unknown>;
};
type Failure = { status: number; code: string; message: string; details?: { issues: { path: string[]; message: string }[] } };
type Options = { phaseLess?: boolean; partial?: boolean; summary?: boolean; unverifiedFull?: boolean; incompleteFull?: boolean; returnedCountMismatch?: boolean; readOnly?: boolean };

const pendingGates = new Set<() => void>();

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  const safeRelease = () => {
    pendingGates.delete(safeRelease);
    release();
  };
  pendingGates.add(safeRelease);
  return { promise, release: safeRelease };
}

async function installWorkApi(page: Page, options: Options = {}) {
  const base = await installMockApi(page);
  await seedAuth(page);
  await page.clock.setFixedTime(new Date(QA_NOW));
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const state = {
    projects: [project(901, options.phaseLess), project(902, true)],
    phases: options.phaseLess
      ? []
      : ([
          {
            company_project_phase_id: 501,
            company_project_id: 901,
            name: "QA 구현 단계",
            status: "in_progress",
            sort_order: 1,
          },
          {
            company_project_phase_id: 502,
            company_project_id: 901,
            name: "QA 운영 단계",
            status: "todo",
            sort_order: 2,
          },
        ] as CompanyProjectPhase[]),
    workItems: [
      // Phase and Work Item IDs deliberately overlap; they are different resources.
      work(501, "QA 백엔드 개발", { rollup: { child_count: 1 } }),
      work(502, "QA 운영 검토", {
        company_project_phase_id: 502,
        status: "todo",
        priority: "low",
      }),
      work(511, "QA 인증 시스템", {
        parent_work_item_id: 501,
        depth_level: 2,
        rollup: { child_count: 1 },
      }),
      work(521, "QA 로그인 API", {
        parent_work_item_id: 511,
        depth_level: 3,
        rollup: { child_count: 1 },
      }),
      work(531, "QA JWT 발급", { parent_work_item_id: 521, depth_level: 4 }),
      work(601, "QA 다른 프로젝트 업무", {
        company_project_id: 902,
        company_project_phase_id: null,
      }),
    ],
    requests: [] as Request[],
    failures: new Map<string, Failure>(),
    gates: new Map<string, Promise<void>>(),
    childrenPayloads: new Map<number, unknown>(),
    departments: [{ company_project_work_item_id: 501, department_id: 271, responsibility_type: "responsible" }],
    dependencies: [{ company_project_work_dependency_id: 801, predecessor_work_item_id: 511, successor_work_item_id: 521 }],
    workReminders: [{ reminder_id: 901, company_project_work_item_id: 511, status: "scheduled" }],
    assignments: [
      {
        assignment_id: 701,
        company_project_work_item_id: 501,
        assignee_company_member_id: 171,
        status: "in_progress",
        progress_percent: 37,
      },
    ] as CompanyProjectAssignment[],
  };
  if (options.phaseLess)
    state.workItems.forEach((item) => {
      item.company_project_phase_id = null;
    });
  await page.route("**/api/v1/company-memberships", (route) =>
    route.fulfill({
      json: { success: true, message: "OK", data: { items: [membership] } },
    }),
  );
  await page.route("**/api/v1/companies/71/org-chart", (route) => route.fulfill({
    json: { success: true, message: "OK", data: { company: membership.company,
      departments: [{ ...membership.department, members: [{
        company_member_id: membership.company_member_id, name: membership.name,
        email: membership.email, user_public_uid: membership.user_public_uid, status: "active",
      }], children: [] }], unassigned_members: [] } },
  }));
  await page.route("**/api/v1/company-schedules**", async (route) => {
    if (
      route.request().method() === "GET" &&
      new URL(route.request().url()).pathname === "/api/v1/company-schedules"
    ) {
      await route.fulfill({
        json: { success: true, message: "OK", data: { items: [] } },
      });
    } else await route.fallback();
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
    state.requests.push({
      method,
      path,
      query: Object.fromEntries(url.searchParams),
      body: request.postDataJSON() || {},
    });
    const key = `${method} ${path}`;
    const failure = state.failures.get(key);
    if (failure) {
      await route.fulfill({
        status: failure.status,
        json: {
          success: false,
          message: failure.message,
          error: { code: failure.code, details: failure.details },
        },
      });
      return;
    }
    if (state.gates.has(key)) await state.gates.get(key);
    const reply = (data: unknown, status = 200) =>
      route.fulfill({ status, json: { success: true, message: "OK", data } });
    if (path === "/company-projects" && method === "GET") {
      await reply({
        items: state.projects,
        pagination: { total_items: 2, total_pages: 1, has_next: false },
      });
      return;
    }
    const detail = path.match(/^\/company-projects\/(\d+)$/);
    const currentProject =
      detail &&
      state.projects.find(
        (item) => item.company_project_id === Number(detail[1]),
      );
    if (detail && currentProject && method === "GET") {
      const items = state.workItems.filter(
        (item) => item.company_project_id === currentProject.company_project_id,
      );
      // Legacy partial responses have no policy. Contract summary includes depth 1 and 2.
      const returnedItems = options.partial || options.incompleteFull ? items.filter((item) => !item.parent_work_item_id)
        : options.summary ? items.filter((item) => (item.depth_level ?? 1) <= 2) : items;
      const returnedIds = new Set(returnedItems.map((item) => item.company_project_work_item_id));
      await reply({
        project: currentProject,
        phases: state.phases.filter(
          (item) =>
            item.company_project_id === currentProject.company_project_id,
        ),
        work_items: returnedItems,
        departments: state.departments.filter((item) => returnedIds.has(item.company_project_work_item_id)),
        assignments:
          currentProject.company_project_id === 901
            ? state.assignments.filter((item) => returnedIds.has(item.company_project_work_item_id!)) : [],
        dependencies: state.dependencies.filter((item) => returnedIds.has(item.predecessor_work_item_id) && returnedIds.has(item.successor_work_item_id)),
        summary: options.returnedCountMismatch ? undefined : { phase_count: state.phases.filter((item) => item.company_project_id === currentProject.company_project_id).length, work_item_count: options.partial || options.summary ? 501 : items.length, assignment_count: state.assignments.length },
        detail_policy: options.partial || options.unverifiedFull ? undefined : { scale: options.summary ? "medium" : "small", mode: options.summary ? "summary" : "full", max_depth: options.summary ? 2 : 5, full_load_allowed: !options.summary, returned_work_item_count: options.returnedCountMismatch ? returnedItems.length + 1 : returnedItems.length },
      });
      return;
    }
    const members = path.match(/^\/company-projects\/(\d+)\/members$/);
    if (members && method === "GET") {
      if (options.readOnly)
        await route.fulfill({
          status: 403,
          json: {
            success: false,
            message: "프로젝트 관리 권한이 없습니다.",
            error: { code: "PROJECT_MANAGEMENT_FORBIDDEN" },
          },
        });
      else
        await reply({
          members: [
            {
              company_project_member_id: 1901,
              company_member_id: 171,
              role: "owner",
              status: "active",
            },
          ],
        });
      return;
    }
    const children = path.match(
      /^\/company-projects\/(\d+)\/work-items\/(\d+)\/children$/,
    );
    if (children && method === "GET") {
      const id = Number(children[2]);
      const parent = state.workItems.find((item) => item.company_project_work_item_id === id && item.company_project_id === Number(children[1]));
      const childItems = state.workItems.filter((item) => item.company_project_id === Number(children[1]) && item.parent_work_item_id === id);
      const childIds = new Set(childItems.map((item) => item.company_project_work_item_id));
      const relationIds = new Set([id, ...childIds]);
      await reply(
        state.childrenPayloads.get(id) ?? {
          parent, items: childItems,
          departments: state.departments.filter((item) => relationIds.has(item.company_project_work_item_id)),
          assignments: state.assignments.filter((item) => relationIds.has(item.company_project_work_item_id!)),
          dependencies: state.dependencies.filter((item) => childIds.has(item.predecessor_work_item_id) || childIds.has(item.successor_work_item_id)),
        },
      );
      return;
    }
    const creation = path.match(/^\/company-projects\/(\d+)\/(phases|work-items)$/);
    if (creation && method === "POST") {
      const body = request.postDataJSON();
      const companyProjectId = Number(creation[1]);
      if (creation[2] === "phases") {
        const phase: CompanyProjectPhase = {
          company_project_phase_id: Math.max(700, ...state.phases.map((item) => item.company_project_phase_id)) + 1,
          company_project_id: companyProjectId, name: body.name, description: null, status: "todo", sort_order: 0,
          planned_start_date: null, planned_end_date: null, actual_start_date: null, actual_end_date: null,
          progress_percent: 0, ...body,
        };
        state.phases.push(phase);
        await reply({ phase }, 201);
      } else {
        const parent = state.workItems.find((item) => item.company_project_work_item_id === Number(body.parent_work_item_id));
        const item = work(Math.max(1000, ...state.workItems.map((entry) => entry.company_project_work_item_id)) + 1, body.title, {
          company_project_id: companyProjectId, company_project_phase_id: null,
          parent_work_item_id: body.parent_work_item_id == null ? null : Number(body.parent_work_item_id),
          depth_level: parent ? parent.depth_level! + 1 : 1,
          description: null, status: "todo", priority: "medium", sort_order: 0,
          planned_start_date: null, planned_end_date: null, actual_start_date: null, actual_end_date: null,
          due_datetime: null, progress_percent: 0, progress_override_percent: body.progress_percent ?? null,
          ...body,
        });
        state.workItems.push(item);
        if (parent) parent.rollup = { ...parent.rollup, child_count: state.workItems.filter((entry) => entry.parent_work_item_id === parent.company_project_work_item_id).length };
        await reply({ work_item: item }, 201);
      }
      return;
    }
    const cancellation = path.match(
      /^\/company-projects\/(\d+)\/(phases|work-items)\/(\d+)$/,
    );
    if (cancellation && ["DELETE", "PATCH"].includes(method)) {
      const phase = cancellation[2] === "phases";
      const collection = phase ? state.phases : state.workItems;
      const idField = phase
        ? "company_project_phase_id"
        : "company_project_work_item_id";
      const item = collection.find(
        (entry) =>
          entry[idField] === Number(cancellation[3]) &&
          entry.company_project_id === Number(cancellation[1]),
      );
      if (item) {
        if (method === "PATCH") {
          const body = request.postDataJSON();
          Object.assign(item, body);
          if (!phase && "progress_percent" in body) item.progress_override_percent = body.progress_percent;
          if (!phase && "parent_work_item_id" in body) {
            const parent = state.workItems.find((entry) => entry.company_project_work_item_id === Number(body.parent_work_item_id));
            item.depth_level = parent ? parent.depth_level! + 1 : 1;
          }
        } else {
          item.status = "cancelled";
          if (!phase) {
            const cancelled = new Set([Number(cancellation[3])]);
            let previousSize = 0;
            while (previousSize !== cancelled.size) {
              previousSize = cancelled.size;
              state.workItems.filter((entry) => entry.company_project_id === Number(cancellation[1]) && cancelled.has(entry.parent_work_item_id!))
                .forEach((entry) => cancelled.add(entry.company_project_work_item_id));
            }
            state.workItems.filter((entry) => cancelled.has(entry.company_project_work_item_id)).forEach((entry) => { entry.status = "cancelled"; });
            state.assignments.filter((entry) => cancelled.has(entry.company_project_work_item_id!)).forEach((entry) => { entry.status = "cancelled"; });
            state.workReminders.filter((entry) => cancelled.has(entry.company_project_work_item_id) && entry.status === "scheduled").forEach((entry) => { entry.status = "cancelled"; });
            for (let index = state.dependencies.length - 1; index >= 0; index -= 1) {
              const dependency = state.dependencies[index];
              if (cancelled.has(dependency.predecessor_work_item_id) || cancelled.has(dependency.successor_work_item_id)) state.dependencies.splice(index, 1);
            }
          }
        }
        await reply({ [phase ? "phase" : "work_item"]: item });
        return;
      }
    }
    // Unsupported writes and speculative endpoints remain explicit fixture failures.
    await route.fallback();
  });
  return { ...state, base, pageErrors };
}

function rowTitle(page: Page, title: string) {
  return page
    .getByRole("treegrid", { name: "계층형 업무", exact: true })
    .locator(".work-title-button").filter({ hasText: title });
}
function panel(page: Page) {
  return page
    .getByRole("complementary", { name: "업무 상세", exact: true })
    .or(page.getByRole("dialog", { name: "업무 상세", exact: true }));
}
async function selectOption(page: Page | Locator, label: string, option: string) {
  const workFilter = ["업무 상태", "업무 우선순위", "Phase 선택"].includes(label);
  if (workFilter && !(await page.getByRole("button", { name: label, exact: true }).isVisible()))
    await page.getByRole("button", { name: "업무 필터", exact: true }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("listbox", { name: label, exact: true })
    .getByRole("option", { name: option, exact: true })
    .click();
  if (workFilter && await page.getByLabel("업무 필터 조건", { exact: true }).isVisible())
    await page.getByRole("button", { name: "업무 필터", exact: true }).click();
}
async function fillDate(scope: Page | Locator, label: string, value: string) {
  if (!value) {
    await scope.getByRole("button", { name: `${label} 지우기`, exact: true }).click();
    return;
  }
  const field = scope.getByRole("textbox", { name: label, exact: true });
  await field.fill(value);
  await field.press("Tab");
}
function advancedSettings(dialog: Locator) {
  return dialog.getByRole("button", { name: /^상세 설정/ });
}
function discardConfirmation(page: Page) {
  return page.getByRole("dialog", { name: "저장하지 않은 변경사항이 있습니다.", exact: true });
}
async function cancelForm(page: Page, dialog: Locator) {
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  if (await discardConfirmation(page).isVisible())
    await discardConfirmation(page).getByRole("button", { name: "변경사항 버리고 나가기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
async function expectFieldError(dialog: Locator, label: string, message: string) {
  const field = dialog.getByLabel(label, { exact: true });
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAccessibleDescription(message);
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
}
async function expectWorkMenuInsideFields(dialog: Locator, label: string) {
  const menu = dialog.getByRole("listbox", { name: label, exact: true });
  await expect(menu).toBeVisible();
  const readBounds = () => menu.evaluate((element, name) => {
    const dialog = element.closest('[role="dialog"]')!;
    const form = dialog.querySelector<HTMLElement>("[data-project-work-fields]")!;
    const formRect = form.getBoundingClientRect();
    const menuRect = element.getBoundingClientRect();
    const triggerRect = dialog.querySelector(`button[aria-label="${name}"]`)!.getBoundingClientRect();
    const footerRect = dialog.querySelector('button[type="submit"]')!.parentElement!.getBoundingClientRect();
    return {
      top: formRect.top + form.clientTop, bottom: formRect.top + form.clientTop + form.clientHeight,
      left: formRect.left + form.clientLeft, right: formRect.left + form.clientLeft + form.clientWidth,
      menu: { top: menuRect.top, bottom: menuRect.bottom, left: menuRect.left, right: menuRect.right, width: menuRect.width },
      trigger: { left: triggerRect.left, width: triggerRect.width }, footerTop: footerRect.top,
    };
  }, label);
  await expect.poll(async () => {
    const bounds = await readBounds();
    return bounds.menu.top >= bounds.top - 1 && bounds.menu.bottom <= bounds.bottom + 1 &&
      bounds.menu.left >= bounds.left - 1 && bounds.menu.right <= bounds.right + 1 &&
      bounds.menu.bottom <= bounds.footerTop + 1 &&
      Math.abs(bounds.menu.left - bounds.trigger.left) <= 1 &&
      Math.abs(bounds.menu.width - bounds.trigger.width) <= 1;
  }).toBe(true);
}
async function expectNoPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
}
async function locationScrollMetrics(picker: Locator) {
  return picker.evaluate((dialog) => {
    const describe = (selector: string) => {
      const element = dialog.querySelector<HTMLElement>(selector)!;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        scrollable: ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1,
        scrollTop: element.scrollTop,
        scrollbarWidth: element.offsetWidth - element.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
        top: rect.top,
        bottom: rect.bottom,
      };
    };
    return {
      body: describe("[data-project-location-picker]"),
      children: describe("[data-project-location-children]"),
    };
  });
}
async function singleLocationScroller(picker: Locator) {
  await expect.poll(async () => {
    const metrics = await locationScrollMetrics(picker);
    return Number(metrics.body.scrollable) + Number(metrics.children.scrollable);
  }).toBe(1);
  const metrics = await locationScrollMetrics(picker);
  return picker.locator(metrics.children.scrollable ? "[data-project-location-children]" : "[data-project-location-picker]");
}
async function navigateLocationAncestor(picker: Locator, title: string) {
  const breadcrumb = picker.getByRole("navigation", { name: "소속 위치 경로", exact: true });
  const direct = breadcrumb.getByRole("button", { name: title, exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  const details = picker.locator("details").filter({ hasText: "전체 경로 보기" });
  if (await details.getAttribute("open") === null) await details.locator("summary").click();
  await details.getByRole("button", { name: title, exact: true }).click();
  // Close the supplemental path before continuing the compact exploration.
  if (await details.getAttribute("open") !== null) await details.locator("summary").click();
}
async function attachLayout(page: Page, testInfo: TestInfo, label: string) {
  const data = await page.evaluate(() => {
    const describe = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const hit = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return {
        rect: rect.toJSON(),
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        width: style.width,
        minWidth: style.minWidth,
        maxWidth: style.maxWidth,
        overflowX: style.overflowX,
        position: style.position,
        hit: hit ? `${hit.tagName}.${hit.className}` : null,
      };
    };
    const viewport = window.visualViewport;
    const visibleWidth = document.documentElement.clientWidth;
    const spills = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        if (element.closest(".work-table-scroll")) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.right <= visibleWidth + 1) return false;
        for (
          let ancestor = element.parentElement;
          ancestor && ancestor !== document.body;
          ancestor = ancestor.parentElement
        ) {
          const style = getComputedStyle(ancestor);
          if (
            ["hidden", "clip", "auto", "scroll"].includes(style.overflowX) &&
            rect.right > ancestor.getBoundingClientRect().right + 1
          )
            return false;
        }
        return true;
      })
      .map((element) => ({
        tag: element.tagName,
        class: String(element.className),
        label: element.getAttribute("aria-label"),
        rect: element.getBoundingClientRect().toJSON(),
        position: getComputedStyle(element).position,
        visibility: getComputedStyle(element).visibility,
        transform: getComputedStyle(element).transform,
      }))
      .sort((left, right) => right.rect.right - left.rect.right)
      .slice(0, 20);
    const selectors = [
      "html",
      "body",
      "#root",
      ".flowra-app-shell",
      "main",
      ".project-work-layout",
      ".project-work-list",
      ".work-table-scroll",
      ".work-expand",
      ".work-phase-row",
      ".work-title-button",
      ".project-work-panel",
      ".work-panel-header",
      ".work-panel-content",
      ".work-panel-children button",
      "[data-radix-popper-content-wrapper]",
      '[role="menu"]',
      '[role="menuitem"]:not([data-disabled])',
      '[aria-label="업무 상세 닫기"]',
    ];
    return {
      innerWidth: innerWidth,
      innerHeight: innerHeight,
      mobileMedia: matchMedia("(max-width: 700px)").matches,
      devicePixelRatio,
      scrollX,
      scrollY,
      visualViewport: viewport && {
        width: viewport.width,
        height: viewport.height,
        offsetLeft: viewport.offsetLeft,
        offsetTop: viewport.offsetTop,
        pageLeft: viewport.pageLeft,
        pageTop: viewport.pageTop,
        scale: viewport.scale,
      },
      spillsOutsideClippedTable: spills,
      elements: Object.fromEntries(
        selectors.map((selector) => [selector, describe(selector)]),
      ),
    };
  });
  const playwrightBoxes = Object.fromEntries(
    await Promise.all(
      [
        ".work-expand",
        ".work-title-button",
        ".project-work-panel",
        ".work-panel-header",
        '[aria-label="업무 상세 닫기"]',
      ].map(async (selector) => {
        const target = page.locator(selector).first();
        return [
          selector,
          (await target.count()) ? await target.boundingBox() : null,
        ];
      }),
    ),
  );
  await testInfo.attach(`work-layout-${label}`, {
    body: JSON.stringify(
      { ...data, playwrightViewport: page.viewportSize(), playwrightBoxes },
      null,
      2,
    ),
    contentType: "application/json",
  });
}
async function confirmCancellation(
  page: Page,
  target: string,
  phase = false,
  testInfo?: TestInfo,
) {
  if (phase && await panel(page).count())
    await panel(page).getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
  const scope =
    !phase && (await panel(page).getByRole("button", { name: `${target} 더 보기`, exact: true }).count())
      ? panel(page)
      : page.getByRole("treegrid", { name: "계층형 업무", exact: true });
  const action = scope.getByRole("button", { name: `${target} 더 보기`, exact: true });
  if (page.viewportSize()!.width <= 700) {
    await action.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  }
  await action.click();
  if (testInfo && page.viewportSize()!.width <= 700)
    await attachLayout(page, testInfo, "after-cancel-menu-open");
  await page
    .getByRole("menuitem", {
      name: phase ? "단계 취소" : "업무 취소",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: phase ? "단계 취소" : "업무 취소",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("취소 상태로 변경합니다.");
  await expect(dialog).toContainText("영구 삭제되지 않습니다.");
  await dialog.getByRole("button", { name: "취소 처리", exact: true }).click();
  return dialog;
}

async function editResource(page: Page, title: string, phase = false) {
  if (phase && await panel(page).count())
    await panel(page).getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
  const scope = phase ? page.getByRole("treegrid", { name: "계층형 업무", exact: true }) : panel(page);
  const action = scope.getByRole("button", { name: `${title} 더 보기`, exact: true });
  if (page.viewportSize()!.width <= 700) {
    await action.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
  }
  await action.click();
  await page.getByRole("menuitem", { name: phase ? "단계 수정" : "업무 수정", exact: true }).click();
  return page.getByRole("dialog", { name: phase ? "단계 수정" : "업무 수정", exact: true });
}

test.describe("프로젝트 계층형 업무 · 가상 API", () => {
  let api: Awaited<ReturnType<typeof installWorkApi>>;
  test.afterEach(async ({}, testInfo) => {
    // Failed assertions must not leave route handlers blocking browser teardown.
    for (const release of pendingGates) release();
    if (!api) return;
    await testInfo.attach("work-item-api-requests", {
      body: JSON.stringify(api.requests, null, 2),
      contentType: "application/json",
    });
    expect
      .soft(api.base.unhandled, "No invented or unmocked API contract")
      .toEqual([]);
    expect.soft(api.pageErrors, "No uncaught JavaScript error").toEqual([]);
    expect
      .soft(
        api.requests.filter(
          (request) =>
            request.method !== "GET" &&
            /members|assignments|dependencies|company-admin/.test(request.path),
        ),
        "Phase 3 writes are out of scope",
      )
      .toEqual([]);
    expect
      .soft(
        api.requests.filter((request) =>
          ["POST", "PATCH", "PUT"].includes(request.method) &&
          !((request.method === "POST" && /^\/company-projects\/\d+\/(phases|work-items)$/.test(request.path)) ||
            (request.method === "PATCH" && /^\/company-projects\/\d+\/(phases|work-items)\/\d+$/.test(request.path))),
        ),
        "Unknown write DTOs must never be sent",
      )
      .toEqual([]);
  });

  test("일정 정책: 단계·업무는 미정으로 시작하고 부모 적용은 빈 날짜만 채운다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    for (const kind of ["단계", "업무"]) {
      await page.getByRole("button", { name: `${kind} 추가`, exact: true }).click();
      const form = page.getByRole("dialog", { name: `${kind} 추가`, exact: true });
      await expect(form.getByLabel(`${kind} 계획 시작일`, { exact: true })).toHaveValue("날짜 선택");
      await expect(form.getByLabel(`${kind} 계획 종료일`, { exact: true })).toHaveValue("날짜 선택");
      await fillDate(form, `${kind} 계획 시작일`, "2026-09-15");
      const parentPeriod = form.getByRole("button", { name: kind === "단계" ? "프로젝트 기간 적용" : "상위 기간 적용", exact: true });
      await parentPeriod.click();
      await expect(form.getByLabel(`${kind} 계획 시작일`, { exact: true })).toHaveValue(/09\.15/);
      await expect(form.getByLabel(`${kind} 계획 종료일`, { exact: true })).toHaveValue(/09\.30/);
      await expect(parentPeriod).toBeDisabled();
      await cancelForm(page, form);
    }
    expect(api.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });

  test("일정 정책: 기간 초과는 확인 후 저장하고 날짜 역전은 저장을 차단한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await form.getByLabel("업무명", { exact: true }).fill("QA 기간 초과 업무");
    await fillDate(form, "업무 계획 시작일", "2026-10-02");
    await fillDate(form, "업무 계획 종료일", "2026-10-01");
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expectFieldError(form, "업무 계획 종료일", "계획 종료일은 시작일과 같거나 이후여야 합니다.");
    expect(api.requests.filter((r) => r.method === "POST")).toEqual([]);
    await fillDate(form, "업무 계획 시작일", "2026-10-01");
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    const warning = page.getByRole("dialog", { name: "상위 일정 범위를 벗어났습니다", exact: true });
    await expect(warning).toContainText("1일 늦습니다");
    await warning.getByRole("button", { name: "날짜 수정", exact: true }).click();
    expect(api.requests.filter((r) => r.method === "POST")).toEqual([]);
    await expect(form.getByLabel("업무 계획 종료일", { exact: true })).toHaveValue(/10\.01/);
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await warning.getByRole("button", { name: "그대로 저장", exact: true }).click();
    await expect(form).toHaveCount(0);
    const writes = api.requests.filter((r) => r.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ planned_start_date: "2026-10-01", planned_end_date: "2026-10-01", status: "todo" });
  });

  test("일정 정책: 상위 업무와 연결 단계의 일부 날짜를 선택 적용하고 위치 변경 시 보존한다", async ({ page }) => {
    api = await installWorkApi(page);
    api.phases[1].planned_end_date = "2026-09-18";
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    await panel(page).getByRole("button", { name: "하위 업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await expect(form.getByLabel("업무 계획 시작일", { exact: true })).toHaveValue("날짜 선택");
    await changeLinkedPhase(page, form, "2. QA 운영 단계");
    await selectOption(form, "부모 기간 적용 기준", "연결 단계: QA 운영 단계");
    await form.getByRole("button", { name: "상위 기간 적용", exact: true }).click();
    await expect(form.getByLabel("업무 계획 시작일", { exact: true })).toHaveValue("날짜 선택");
    await expect(form.getByLabel("업무 계획 종료일", { exact: true })).toHaveValue(/09\.18/);
    await selectOption(form, "부모 기간 적용 기준", "상위 업무: QA 백엔드 개발");
    await form.getByRole("button", { name: "상위 기간 적용", exact: true }).click();
    await expect(form.getByLabel("업무 계획 시작일", { exact: true })).toHaveValue(/09\.10/);
    await expect(form.getByLabel("업무 계획 종료일", { exact: true })).toHaveValue(/09\.18/);
    await changeLinkedPhase(page, form, "1. QA 구현 단계");
    await expect(form.getByLabel("업무 계획 종료일", { exact: true })).toHaveValue(/09\.18/);
  });

  test("일정 정책: 자체 일정과 중첩 지연 집계를 분리하고 상태와 진행률을 유지한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.clock.setFixedTime(new Date("2026-10-14T01:00:00Z"));
    for (const item of api.workItems) { item.planned_start_date = null; item.planned_end_date = null; }
    Object.assign(api.workItems.find((item) => item.company_project_work_item_id === 511)!, { planned_end_date: "2026-10-13", status: "todo" });
    Object.assign(api.workItems.find((item) => item.company_project_work_item_id === 521)!, { planned_end_date: "2026-10-12", status: "postponed" });
    Object.assign(api.workItems.find((item) => item.company_project_work_item_id === 531)!, { planned_end_date: "2026-10-01", status: "done" });
    api.phases[0].planned_end_date = "2026-10-20";
    await page.goto("/projects/901");
    await expect(page.getByLabel("프로젝트 지연 현황")).toContainText("하위 업무 지연 2건 · 전체 업무 기준");
    const phase = page.locator('[data-hierarchy-key="phase:501"]');
    await expect(phase.getByLabel("일정: 일정 정상", { exact: true })).toHaveCount(0);
    await expect(phase).toContainText("하위 업무 지연 2건");
    await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
    const row = page.locator('[data-work-id="511"]');
    await expect(row).toContainText("대기");
    await expect(row).toContainText("37%");
    await expect(page.locator('[data-work-id="531"]').getByLabel(/일정:.*지연/)).toHaveCount(0);
    if (page.viewportSize()!.width <= 700) {
      await rowTitle(page, "QA 인증 시스템").click();
      await expect(panel(page).getByLabel("일정: 1일 지연", { exact: true })).toBeVisible();
      await expect(panel(page)).toContainText("大기".replace("大", "대"));
      await expect(panel(page)).toContainText("37%");
    } else {
      await expect(row.getByLabel("일정: 1일 지연", { exact: true })).toBeVisible();
    }
    expect(api.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });

  test("일정 정책: 부분 조회 집계임을 표시하고 날짜 변경 시 열린 화면을 갱신한다", async ({ page }) => {
    api = await installWorkApi(page, { partial: true });
    await page.clock.setFixedTime(new Date("2026-10-13T14:59:59Z"));
    for (const item of api.workItems) { item.planned_start_date = null; item.planned_end_date = null; }
    api.workItems[0].planned_end_date = "2026-10-13";
    await page.goto("/projects/901");
    const row = page.locator('[data-work-id="501"]');
    await expect(page.getByLabel("프로젝트 지연 현황")).toHaveCount(0);
    const mobile = page.viewportSize()!.width <= 700;
    if (mobile) await rowTitle(page, "QA 백엔드 개발").click();
    const schedule = mobile ? panel(page) : row;
    await expect(schedule.getByLabel("일정: 오늘 마감", { exact: true })).toBeVisible();
    await page.clock.setFixedTime(new Date("2026-10-13T15:00:01Z"));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(schedule.getByLabel("일정: 1일 지연", { exact: true })).toBeVisible();
    if (mobile) await panel(page).getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await expect(page.getByLabel("프로젝트 지연 현황")).toContainText("1건 · 조회된 업무 기준");
    expect(api.requests.filter((r) => r.method !== "GET")).toEqual([]);
  });

  test("일정 정책: 단계 기간 축소 경고를 승인해도 기존 하위 날짜를 수정하지 않는다", async ({ page }) => {
    api = await installWorkApi(page);
    api.phases[0].planned_end_date = "2026-09-30";
    const originalItems = structuredClone(api.workItems);
    await page.goto("/projects/901");
    const form = await editResource(page, "QA 구현 단계", true);
    await fillDate(form, "단계 계획 종료일", "2026-09-15");
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    const warning = page.getByRole("dialog", { name: "상위 일정 범위를 벗어났습니다", exact: true });
    await expect(warning).toContainText("조회된 하위 업무");
    await warning.getByRole("button", { name: "그대로 저장", exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(api.workItems).toEqual(originalItems);
    expect(api.requests.filter((r) => r.method === "PATCH").map((r) => r.body)).toEqual([{ planned_end_date: "2026-09-15" }]);
  });

  test("소속 탐색 취소와 Escape는 입력·포커스를 보존하고 확정한 Phase만 생성에 반영한다", async ({ page }, testInfo) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    const trigger = form.getByRole("button", { name: "소속 위치 선택", exact: true });
    await expect(advancedSettings(form)).toHaveAttribute("aria-expanded", "false");
    await form.getByLabel("업무명", { exact: true }).fill("QA 위치 선택 업무");
    await fillDate(form, "업무 계획 시작일", "2026-09-11");
    await advancedSettings(form).click();
    await form.getByLabel("업무 설명", { exact: true }).fill("탐색 후에도 보존");
    await advancedSettings(form).click();
    await page.screenshot({ path: testInfo.outputPath("project-work-simple-form.png"), animations: "disabled" });
    for (const cancel of ["button", "escape"]) {
      await trigger.click();
      const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
      await expect(picker.getByRole("heading", { name: "소속 위치 선택" })).toBeFocused();
      await expect(picker.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true })).toHaveCount(0);
      const applied = picker.getByLabel("현재 선택한 소속 관계", { exact: true });
      const candidate = picker.getByLabel("선택할 소속 관계", { exact: true });
      await expect(applied).toContainText("프로젝트 최상위");
      await expect(applied).toContainText("단계 미지정");
      const phaseRow = picker.getByRole("button", { name: "1. QA 구현 단계", exact: true });
      await expect(phaseRow).toHaveAccessibleDescription("단계 내 업무를 탐색하고 연결 단계 후보로 선택합니다.");
      await phaseRow.click();
      await expect(candidate).toContainText("프로젝트 최상위");
      await expect(candidate).toContainText("1. QA 구현 단계");
      await picker.getByRole("button", { name: "1.1. QA 백엔드 개발", exact: true }).click();
      await expect(applied).toContainText("프로젝트 최상위");
      await expect(applied).toContainText("단계 미지정");
      await expect(candidate).toContainText("1.1. QA 백엔드 개발");
      await expect(picker.getByRole("navigation").getByRole("button", { name: "1.1. QA 백엔드 개발", exact: true })).toBeFocused();
      await expect(picker.getByRole("button", { name: "1.1.1. QA 인증 시스템", exact: true })).toBeVisible();
      await picker.getByRole("button", { name: "연결 단계 변경", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(picker).toBeVisible();
      await expect(picker.getByRole("listbox")).toHaveCount(0);
      if (cancel === "button") await picker.getByRole("button", { name: "취소", exact: true }).click();
      else await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      await expect(trigger).toContainText("프로젝트 최상위");
      await expect(form.getByLabel("업무명", { exact: true })).toHaveValue("QA 위치 선택 업무");
      await expect(form.getByLabel("업무 계획 시작일", { exact: true })).toHaveValue(/09\.11/);
    }
    await trigger.click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await picker.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
    await selectOption(picker, "연결 단계 변경", "2. QA 운영 단계");
    await expect(picker.getByRole("navigation")).toContainText("QA 구현 단계");
    await expect(picker.getByRole("navigation")).not.toContainText("QA 운영 단계");
    await expect(picker.getByRole("button", { name: "1.1. QA 백엔드 개발", exact: true })).toBeVisible();
    await expect(picker.getByLabel("선택할 소속 관계", { exact: true })).toContainText("2. QA 운영 단계");
    await expect(picker.getByLabel("현재 선택한 소속 관계", { exact: true })).toContainText("단계 미지정");
    await expectNoPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath("project-location-picker.png"), animations: "disabled" });
    await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(form).toHaveCount(0);
    const writes = api.requests.filter((request) => request.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0].body).toMatchObject({ title: "QA 위치 선택 업무", description: "탐색 후에도 보존", parent_work_item_id: null, company_project_phase_id: 502, status: "todo", priority: "medium" });
  });

  test("상세 펼침과 위치 후보 탐색은 변경으로 처리하지 않고 원래 입력으로 되돌리면 확인 없이 닫는다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    for (const revert of [false, true]) {
      await page.getByRole("button", { name: "업무 추가", exact: true }).click();
      const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
      await advancedSettings(form).click();
      await advancedSettings(form).click();
      if (revert) {
        await form.getByLabel("업무명", { exact: true }).fill("QA 되돌릴 입력");
        await form.getByLabel("업무명", { exact: true }).fill("");
      }
      await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
      await picker.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
      await picker.getByRole("button", { name: "1.1. QA 백엔드 개발", exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(form.getByRole("button", { name: "소속 위치 선택", exact: true })).toContainText("프로젝트 최상위");
      await form.getByRole("button", { name: "취소", exact: true }).click();
      await expect(form).toHaveCount(0);
      await expect(discardConfirmation(page)).toHaveCount(0);
    }
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  for (const tooltipTarget of ["location", "period", "disabled-period"] as const) {
    test(`폼 툴팁에서 Escape는 ${tooltipTarget} 포커스의 입력 보호와 원복 후 닫기를 유지한다`, async ({ page }) => {
      api = await installWorkApi(page);
      if (tooltipTarget === "disabled-period") {
        api.projects[0].planned_start_date = null;
        api.projects[0].planned_end_date = null;
      }
      await page.goto("/projects/901");
      await page.getByRole("button", { name: "업무 추가", exact: true }).click();
      const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
      const title = form.getByRole("textbox", { name: "업무명", exact: true });
      await title.fill("QA 툴팁 Escape 입력 보존");
      const period = form.getByRole("button", { name: "상위 기간 적용", exact: true });
      const trigger = tooltipTarget === "location"
        ? form.getByRole("button", { name: "소속 위치 선택", exact: true })
        : tooltipTarget === "disabled-period" ? period.locator("xpath=..") : period;
      const help = tooltipTarget === "location" ? "프로젝트 최상위"
        : tooltipTarget === "disabled-period" ? "적용할 상위 기간이 없습니다."
          : "비어 있는 날짜만 채웁니다.";
      if (tooltipTarget === "location") {
        await trigger.click();
        await expect(page.getByRole("dialog", { name: "소속 위치 선택", exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
      } else {
        if (tooltipTarget === "disabled-period") {
          await expect(period).toBeDisabled();
          await expect(trigger).toHaveAttribute("tabindex", "0");
          await expect(trigger).toHaveAccessibleDescription(help);
        } else await expect(period).toBeEnabled();
        await trigger.focus();
      }
      await expect(trigger).toBeFocused();
      await expect(page.locator('[role="tooltip"]')).toContainText(help);
      await page.keyboard.press("Escape");
      const confirmation = discardConfirmation(page);
      await expect(confirmation).toBeVisible();
      await confirmation.getByRole("button", { name: "계속 편집", exact: true }).click();
      await expect(confirmation).toHaveCount(0);
      await expect(title).toHaveValue("QA 툴팁 Escape 입력 보존");
      await expect(trigger).toBeFocused();
      await expect(form.getByLabel("업무 계획 시작일", { exact: true })).toHaveValue("날짜 선택");
      await expect(form.getByLabel("업무 계획 종료일", { exact: true })).toHaveValue("날짜 선택");
      expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
      await title.fill("");
      await trigger.focus();
      await expect(page.locator('[role="tooltip"]')).toContainText(help);
      await page.keyboard.press("Escape");
      await expect(form).toHaveCount(0);
      await expect(confirmation).toHaveCount(0);
      expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
    });
  }

  test("업무 입력 중 뒤로 가기를 보류하면 값을 보존하고 변경 폐기를 승인해야 프로젝트 목록으로 이동한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects");
    await page.getByRole("link", { name: /^QA 계층형 프로젝트(?:\s|$)/ }).click();
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await form.getByLabel("업무명", { exact: true }).fill("QA 뒤로 가기 보존 업무");
    await page.goBack();
    await expect(discardConfirmation(page)).toBeVisible();
    await discardConfirmation(page).getByRole("button", { name: "계속 편집", exact: true }).click();
    await expect(page).toHaveURL(/\/projects\/901(?:\?|$)/);
    await expect(form.getByLabel("업무명", { exact: true })).toHaveValue("QA 뒤로 가기 보존 업무");
    await page.goBack();
    await discardConfirmation(page).getByRole("button", { name: "변경사항 버리고 나가기", exact: true }).click();
    await expect(page).toHaveURL(/\/projects(?:\?|$)/);
    await expect(form).toHaveCount(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("단계 행은 열 정렬과 업무 수를 유지하고 선택·접기·메뉴 동작을 구분한다", async ({ page }, testInfo) => {
    api = await installWorkApi(page);
    api.phases[0].planned_start_date = "2026-09-10";
    api.phases[0].planned_end_date = "2026-09-20";
    await page.goto("/projects/901");
    const row = page.locator('[data-hierarchy-key="phase:501"]');
    await expect(row.locator("td")).toHaveCount(7);
    await expect(row.locator(".work-phase-count")).toHaveText("업무 4개");
    await expect(row.locator(".work-dates")).toContainText("09.10");
    await expect(row.getByLabel("일정: 일정 정상", { exact: true })).toHaveCount(0);
    await expect(row.getByText(/하위 업무 지연 0건/)).toHaveCount(0);
    await row.locator(".work-phase-title").click();
    await expect(row).toHaveAttribute("aria-selected", "true");
    await row.getByRole("button", { name: "QA 구현 단계 접기", exact: true }).click();
    await expect(row).toHaveAttribute("aria-selected", "true");
    await row.getByRole("button", { name: "QA 구현 단계 펼치기", exact: true }).click();
    // Menu interaction must not select its row.
    const other = page.locator('[data-hierarchy-key="phase:502"]');
    await other.getByRole("button", { name: "QA 운영 단계 더 보기", exact: true }).click();
    await expect(other).toHaveAttribute("aria-selected", "false");
    await page.keyboard.press("Escape");
    await expect(row.locator(".work-phase-count")).toHaveText("업무 4개");
    await page.screenshot({ path: testInfo.outputPath("phase-table.png"), animations: "disabled" });
  });

  test("업무 개수는 직계 자식과 Phase 모든 깊이를 구분하며 취소·검색 필터가 원본 집계를 바꾸지 않는다", async ({ page }) => {
    api = await installWorkApi(page);
    api.workItems.find((item) => item.company_project_work_item_id === 501)!.rollup = { child_count: 99 };
    api.workItems.push(work(512, "QA 취소된 직계 자식", {
      parent_work_item_id: 501, depth_level: 2, status: "cancelled", company_project_phase_id: 502,
    }));
    await page.goto("/projects/901");
    const parentCount = page.locator('[data-work-id="501"] .work-child-count');
    const phaseCount = page.locator('[data-hierarchy-key="phase:501"] .work-phase-count');
    await expect(parentCount).toHaveText("하위 2개");
    await expect(parentCount).toHaveAttribute("title", "직계 하위 업무 2개 · 조회 완료 기준 · 취소 포함");
    await expect(phaseCount).toHaveText("업무 5개");
    await expect(phaseCount).toHaveAttribute("title", "표시 그룹의 모든 깊이 업무 5개 · 전체 조회 기준 · 취소 포함");
    // A child's independent linked Phase does not move it out of its parent group.
    await expect(page.locator('[data-hierarchy-key="phase:502"] .work-phase-count')).toHaveText("업무 1개");
    await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
    await expect(rowTitle(page, "QA 취소된 직계 자식")).toBeVisible();
    await selectOption(page, "업무 상태", "진행 중");
    await expect(rowTitle(page, "QA 취소된 직계 자식")).toHaveCount(0);
    await expect(parentCount).toHaveText("하위 2개");
    await expect(phaseCount).toHaveText("업무 5개");
    await page.getByRole("textbox", { name: "업무 검색", exact: true }).fill("JWT 발급");
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeVisible();
    await expect(rowTitle(page, "QA JWT 발급")).toBeVisible();
    await expect(parentCount).toHaveText("하위 2개");
    await expect(phaseCount).toHaveText("업무 5개");
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("부분 조회의 서버 직계 집계는 lazy 조회 후 완료 기준으로 바뀌고 Phase 전체 개수를 추정하지 않는다", async ({ page }) => {
    api = await installWorkApi(page, { partial: true });
    api.workItems.find((item) => item.company_project_work_item_id === 501)!.rollup = { child_count: 2 };
    api.workItems.push(work(512, "QA 아직 조회하지 않은 직계 자식", { parent_work_item_id: 501, depth_level: 2 }));
    await page.goto("/projects/901");
    const parentCount = page.locator('[data-work-id="501"] .work-child-count');
    const phaseCount = page.locator('[data-hierarchy-key="phase:501"] .work-phase-count');
    await expect(parentCount).toHaveText("하위 2개");
    await expect(parentCount).toHaveAttribute("title", "직계 하위 업무 2개 · 서버 집계 기준 · 취소 포함");
    await expect(phaseCount).toHaveText("조회 1개");
    await expect(phaseCount).toHaveAttribute("title", "표시 그룹의 모든 깊이 업무 1개 · 현재 불러온 업무 기준 · 취소 포함");
    await page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 펼치기", exact: true }).click();
    await expect(rowTitle(page, "QA 아직 조회하지 않은 직계 자식")).toBeVisible();
    await expect(parentCount).toHaveText("하위 2개");
    await expect(parentCount).toHaveAttribute("title", "직계 하위 업무 2개 · 조회 완료 기준 · 취소 포함");
    await expect(phaseCount).toHaveText("조회 3개");
    await page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 접기", exact: true }).click();
    await expect(phaseCount).toHaveText("조회 3개");
    await page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 펼치기", exact: true }).click();
    expect(api.requests.filter((request) => request.path.endsWith("/501/children"))).toHaveLength(1);
    await expect(page.getByText(/^불러온 업무명에서 검색·필터합니다\./)).toBeVisible();
    await expect(page.getByText(/^전체 업무명에서 검색·필터합니다\./)).toHaveCount(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("정책 없는 응답은 총건수가 맞아도 불러온 직계 개수만 표시하고 완료한 빈 branch는 오래된 집계를 제거한다", async ({ page }) => {
    api = await installWorkApi(page, { unverifiedFull: true });
    api.workItems.find((item) => item.company_project_work_item_id === 501)!.rollup = undefined;
    api.workItems.find((item) => item.company_project_work_item_id === 511)!.rollup = { child_count: 9 };
    api.workItems.push(work(512, "QA 집계 없는 부모의 직계 자식", { parent_work_item_id: 501, depth_level: 2 }));
    api.childrenPayloads.set(511, {
      parent: api.workItems.find((item) => item.company_project_work_item_id === 511),
      items: [],
    });
    await page.goto("/projects/901");
    const parentCount = page.locator('[data-work-id="501"] .work-child-count');
    const phaseCount = page.locator('[data-hierarchy-key="phase:501"] .work-phase-count');
    await expect(parentCount).toHaveText("조회 하위 2개");
    await expect(parentCount).toHaveAttribute("title", "현재 불러온 직계 하위 업무 2개 · 전체 개수는 확인되지 않았습니다.");
    await expect(phaseCount).toHaveText("조회 5개");
    await expect(page.getByText(/^불러온 업무명에서 검색·필터합니다\./)).toBeVisible();
    await expect(page.getByText(/^전체 업무명에서 검색·필터합니다\./)).toHaveCount(0);
    await page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 펼치기", exact: true }).click();
    await expect(parentCount).toHaveText("하위 2개");
    await expect(parentCount).toHaveAttribute("title", "직계 하위 업무 2개 · 조회 완료 기준 · 취소 포함");
    const nestedCount = page.locator('[data-work-id="511"] .work-child-count');
    await expect(nestedCount).toHaveText("하위 9개");
    await expect(nestedCount).toHaveAttribute("title", "직계 하위 업무 9개 · 서버 집계 기준 · 취소 포함");
    await page.getByRole("button", { name: "QA 인증 시스템 하위 업무 펼치기", exact: true }).click();
    await expect(nestedCount).toHaveCount(0);
    await expect(page.getByRole("button", { name: /QA 인증 시스템 하위 업무/ })).toHaveCount(0);
    await expect(phaseCount).toHaveText("조회 3개");
    const beforeSearch = api.requests.filter((request) => request.path.endsWith("/children")).length;
    await page.getByRole("textbox", { name: "업무 검색", exact: true }).fill("로그인 API");
    await expect(page.getByText("현재 불러온 업무 중 검색 조건에 맞는 업무가 없습니다.", { exact: true })).toBeVisible();
    await expect(page.getByText(/^불러온 업무명에서 검색·필터합니다\./)).toBeVisible();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(beforeSearch);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("낮은 화면의 연결 단계 팝업은 불투명하고 위로 열리며 스크롤·키보드·취소를 지원한다", async ({ page }, testInfo) => {
    api = await installWorkApi(page);
    for (let id = 503; id < 523; id++) api.phases.push({ company_project_phase_id: id, company_project_id: 901, name: `QA 추가 단계 ${id}`, sort_order: id });
    await page.setViewportSize({ width: testInfo.project.name === "mobile" ? 390 : 1024, height: 600 });
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    await page.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await picker.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
    await picker.getByRole("button", { name: "1.1. QA 백엔드 개발", exact: true }).click();
    const trigger = picker.getByRole("button", { name: "연결 단계 변경", exact: true });
    for (const dark of [false, true]) {
      await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
      await trigger.click();
      const menu = picker.getByRole("listbox");
      await expect(menu).toBeVisible();
      await expect(menu).toHaveAttribute("data-side", "top");
      await expect.poll(() => menu.evaluate((element) => {
        const bounds = element.closest('[role="dialog"]')!.querySelector('[data-project-location-picker]')!.getBoundingClientRect();
        const rect = element.getBoundingClientRect();
        const color = getComputedStyle(element).backgroundColor;
        return color.startsWith("rgb(") && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1 && element.scrollHeight > element.clientHeight;
      })).toBe(true);
      await page.keyboard.press("End");
      await expect(menu.getByRole("option").last()).toBeFocused();
      await expect.poll(() => menu.getByRole("option").last().evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--flowra-accent-text)";
        element.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return getComputedStyle(element).color === expected;
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`location-menu-${dark ? "dark" : "light"}.png`), animations: "disabled" });
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }
    await trigger.click();
    await picker.getByRole("heading").click();
    await expect(picker.getByRole("listbox")).toHaveCount(0);
    await selectOption(picker, "연결 단계 변경", "2. QA 운영 단계");
    await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await expect(form.getByLabel("선택한 소속 관계", { exact: true })).toContainText("연결 단계: 2. QA 운영 단계");
    await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    await selectOption(picker, "연결 단계 변경", "단계 미지정");
    await picker.getByRole("button", { name: "취소", exact: true }).click();
    await expect(form.getByLabel("선택한 소속 관계", { exact: true })).toContainText("연결 단계: 2. QA 운영 단계");
    await expectNoPageOverflow(page);
  });

  test("소속 선택 후 접힌 상세의 서버 오류는 자동 펼침하고 재저장 중 중복 요청을 막는다", async ({ page }) => {
    api = await installWorkApi(page);
    const key = "POST /company-projects/901/work-items";
    api.failures.set(key, { status: 400, code: "VALIDATION_ERROR", message: "우선순위를 확인해 주세요.", details: { issues: [{ path: ["priority"], message: "우선순위 오류" }] } });
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await form.getByLabel("업무명", { exact: true }).fill("QA 재시도 입력 보존");
    await changeLinkedPhase(page, form, "1. QA 구현 단계");
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(advancedSettings(form)).toHaveAttribute("aria-expanded", "true");
    await expect(form.getByRole("alert").filter({ hasText: "우선순위를 확인" })).toBeVisible();
    await expectFieldError(form, "업무 우선순위 선택", "우선순위 오류");
    await expect(form.getByLabel("업무명", { exact: true })).toHaveValue("QA 재시도 입력 보존");
    await expect(form.getByRole("button", { name: "소속 위치 선택", exact: true })).toContainText("1. QA 구현 단계");
    await selectOption(form, "업무 우선순위 선택", "높음");
    api.failures.delete(key);
    const gate = deferred();
    api.gates.set(key, gate.promise);
    await form.locator("form").evaluate((element) => {
      (element as HTMLFormElement).requestSubmit();
      (element as HTMLFormElement).requestSubmit();
    });
    await expect(form.getByRole("button", { name: "저장 중...", exact: true })).toBeDisabled();
    await expect.poll(() => api.requests.filter((request) => request.method === "POST").length).toBe(2);
    gate.release();
    await expect(form).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(2);
    expect(api.workItems.filter((item) => item.title === "QA 재시도 입력 보존")).toHaveLength(1);
  });

  test("소속 선택은 부모·단계 변경을 독립 PATCH하고 동일 위치 확정 및 두 관계 해제를 구분한다", async ({ page }) => {
    api = await installWorkApi(page);
    const item = api.workItems.find((item) => item.company_project_work_item_id === 511)!;
    item.company_project_phase_id = 502;
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
    await rowTitle(page, item.title).click();
    let form = await editResource(page, item.title);
    await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    let picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await expect(picker.getByRole("navigation")).toHaveAttribute("title", /1\. QA 구현 단계/);
    await expect(picker.getByLabel("선택할 소속 관계")).toContainText("연결 단계: 2. QA 운영 단계");
    await expect(picker.locator("[data-project-location-phase-hint]")).toHaveText("현재 적용된 연결 단계를 유지합니다.");
    await expect(picker).not.toContainText("상위 업무 기준 추천");
    await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "PATCH")).toHaveLength(0);

    form = await editResource(page, item.title);
    await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await navigateLocationAncestor(picker, "프로젝트 최상위");
    await picker.getByRole("button", { name: "2. QA 운영 단계", exact: true }).click();
    await picker.getByRole("button", { name: "2.1. QA 운영 검토", exact: true }).click();
    await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "PATCH").at(-1)?.body).toEqual({ parent_work_item_id: 502 });

    form = await editResource(page, item.title);
    await changeLinkedPhase(page, form, "1. QA 구현 단계");
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "PATCH").at(-1)?.body).toEqual({ company_project_phase_id: 501 });

    form = await editResource(page, item.title);
    await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await navigateLocationAncestor(picker, "프로젝트 최상위");
    await expect(picker).toContainText("상위 업무와 연결 단계를 모두 해제합니다.");
    await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "PATCH").at(-1)?.body).toEqual({ parent_work_item_id: null, company_project_phase_id: null });
  });

  test("소속 선택기는 미확인 branch의 로딩·실패·재시도·빈 목록과 명시한 연결 단계를 보존한다", async ({ page }) => {
    api = await installWorkApi(page, { summary: true });
    const key = "GET /company-projects/901/work-items/511/children";
    api.workItems.find((item) => item.company_project_work_item_id === 511)!.rollup = { child_count: 0 };
    api.failures.set(key, { status: 503, code: "TEMPORARY", message: "선택기 조회 실패" });
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await form.getByLabel("업무명", { exact: true }).fill("QA 지연 하위 업무");
    await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await picker.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
    await picker.getByRole("button", { name: "1.1. QA 백엔드 개발", exact: true }).click();
    await selectOption(picker, "연결 단계 변경", "2. QA 운영 단계");
    await picker.getByRole("button", { name: "1.1.1. QA 인증 시스템", exact: true }).click();
    await expect(picker.getByRole("alert")).toContainText("선택기 조회 실패");
    await expect(picker.getByText("하위 항목이 없습니다.", { exact: true })).toHaveCount(0);
    await expect(picker.getByText("현재 위치를 상위 업무로 선택할 수 있습니다.", { exact: true })).toHaveCount(0);
    api.failures.delete(key);
    const gate = deferred();
    api.gates.set(key, gate.promise);
    await picker.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(picker.locator('[aria-label="하위 위치"]')).toHaveAttribute("aria-busy", "true");
    await expect(picker.getByText("하위 항목이 없습니다.", { exact: true })).toHaveCount(0);
    await expect(picker.getByRole("status").filter({ hasText: "하위 업무를 불러오는 중..." })).toBeVisible();
    gate.release();
    await picker.getByRole("button", { name: "1.1.1.1. QA 로그인 API", exact: true }).click();
    await picker.getByRole("button", { name: "1.1.1.1.1. QA JWT 발급", exact: true }).click();
    await expect(picker).toContainText("하위 항목이 없습니다.");
    await expect(picker.getByText("현재 위치를 상위 업무로 선택할 수 있습니다.", { exact: true })).toBeVisible();
    expect(await picker.getByLabel("하위 위치", { exact: true }).evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(120);
    await picker.getByRole("button", { name: "상위 위치로", exact: true }).click();
    await expect(picker.getByLabel("선택할 소속 관계")).toContainText("연결 단계: 2. QA 운영 단계");
    expect(api.requests.filter((request) => request.path.endsWith("/511/children"))).toHaveLength(2);
    await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(api.requests.find((request) => request.method === "POST")?.body).toMatchObject({ parent_work_item_id: 521, company_project_phase_id: 502 });
  });

  test("소속 탐색은 깊이 5와 자기·자손 선택을 막고 미조회 원본 관계를 보존한다", async ({ page }) => {
    api = await installWorkApi(page);
    api.workItems.push(work(541, "QA 다섯 번째 업무", { parent_work_item_id: 531, depth_level: 5 }));
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    let picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    for (const title of ["1. QA 구현 단계", "1.1. QA 백엔드 개발", "1.1.1. QA 인증 시스템", "1.1.1.1. QA 로그인 API", "1.1.1.1.1. QA JWT 발급"]) {
      await picker.getByRole("button", { name: title, exact: true }).click();
    }
    await expect(picker.getByRole("button", { name: "이 위치 적용", exact: true })).toBeEnabled();
    await picker.getByRole("button", { name: "1.1.1.1.1.1. QA 다섯 번째 업무", exact: true }).click();
    await expect(picker.getByRole("button", { name: "이 위치 적용", exact: true })).toBeDisabled();
    await expect(picker.getByRole("alert")).toContainText("최대 5단계");
    await expect(picker.getByText("하위 항목이 없습니다.", { exact: true })).toBeVisible();
    await expect(picker.getByText("현재 위치를 상위 업무로 선택할 수 있습니다.", { exact: true })).toHaveCount(0);
    await picker.getByRole("button", { name: "취소", exact: true }).click();
    await form.getByRole("button", { name: "취소", exact: true }).click();
    await rowTitle(page, "QA 백엔드 개발").click();
    const edit = await editResource(page, "QA 백엔드 개발");
    await edit.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await picker.getByRole("button", { name: "1.1. QA 백엔드 개발", exact: true }).click();
    await expect(picker.getByRole("button", { name: "이 위치 적용", exact: true })).toBeDisabled();
    await picker.getByRole("button", { name: "1.1.1. QA 인증 시스템", exact: true }).click();
    await expect(picker.getByRole("alert")).toContainText("자기 자신이나 하위 업무");
    await picker.getByRole("button", { name: "취소", exact: true }).click();
    await edit.getByRole("button", { name: "취소", exact: true }).click();

    const item = api.workItems.find((item) => item.company_project_work_item_id === 502)!;
    Object.assign(item, { parent_work_item_id: 9999, company_project_phase_id: 8888 });
    await page.reload();
    await rowTitle(page, item.title).click();
    const unknown = await editResource(page, item.title);
    await unknown.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await expect(picker).toContainText("현재 상위 업무 9999");
    await expect(picker).toContainText("현재 단계 8888");
    await expect(picker).toContainText("현재 상위 업무가 조회되지 않았습니다.");
    await expect(picker.getByText("하위 항목이 없습니다.", { exact: true })).toHaveCount(0);
    await expect(picker.getByText("현재 위치를 상위 업무로 선택할 수 있습니다.", { exact: true })).toHaveCount(0);
    await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
    await unknown.getByLabel("업무명", { exact: true }).fill("QA 미조회 관계 유지");
    await unknown.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(unknown).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "PATCH").at(-1)?.body).toEqual({ title: "QA 미조회 관계 유지" });
    expect(item.parent_work_item_id).toBe(9999);
    expect(item.company_project_phase_id).toBe(8888);
  });

  test("많은 형제 위치는 상위 복귀 시 스크롤을 복원하고 단계 후보만 바꿔도 탐색 경로를 유지한다", async ({ page }) => {
    api = await installWorkApi(page, { summary: true });
    const lastTitle = "QA 탐색 형제 59 아주 긴 업무명으로도 현재 위치를 보존합니다";
    for (let index = 0; index < 60; index++)
      api.workItems.push(work(8000 + index, index === 59 ? lastTitle : `QA 탐색 형제 ${index}`, {
        rollup: { child_count: index === 59 ? 1 : 0 },
      }));
    api.workItems.push(work(9000, "QA 마지막 형제의 자식", { parent_work_item_id: 8059, depth_level: 2 }));
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 560 });
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    const trigger = form.getByRole("button", { name: "소속 위치 선택", exact: true });
    await trigger.click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await picker.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
    const children = picker.getByLabel("하위 위치", { exact: true });
    await expect(children.getByRole("button")).toHaveCount(61);
    const scroller = await singleLocationScroller(picker);
    const last = children.getByRole("button", { name: new RegExp(lastTitle) });
    await last.scrollIntoViewIfNeeded();
    const originalScroll = await scroller.evaluate((element) => element.scrollTop);
    expect(originalScroll).toBeGreaterThan(0);
    await last.click();
    await expect(children.getByRole("button", { name: /QA 마지막 형제의 자식/ })).toBeVisible();
    await selectOption(picker, "연결 단계 변경", "2. QA 운영 단계");
    await expect(picker.getByRole("navigation")).toContainText(lastTitle);
    await expect(picker.getByLabel("현재 선택한 소속 관계", { exact: true })).toContainText("단계 미지정");
    await picker.getByRole("button", { name: "상위 위치로", exact: true }).click();
    await expect(children.getByRole("button")).toHaveCount(61);
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(originalScroll);
    // A manually selected Phase survives ancestor navigation as well as Work
    // exploration, independently of the displayed Phase branch.
    await expect(picker.getByLabel("선택할 소속 관계", { exact: true })).toContainText("2. QA 운영 단계");
    await last.click();
    await expect(children.getByRole("button", { name: /QA 마지막 형제의 자식/ })).toBeVisible();
    // This complete snapshot already contains the children; revisiting it must
    // reuse that data rather than introduce a redundant lazy request.
    expect(api.requests.filter((request) => request.path.endsWith("/8059/children"))).toHaveLength(0);
    await picker.getByRole("button", { name: "취소", exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText("프로젝트 최상위");
    await expect(form.getByLabel("업무명", { exact: true })).toHaveValue("");
    await form.getByRole("button", { name: "취소", exact: true }).click();
    await expect(discardConfirmation(page)).toHaveCount(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("소수의 소속 위치 항목은 내용에 맞춰 Dialog 높이를 줄이고 후보와 Footer에 스크롤 없이 접근한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    const initialHeight = (await picker.boundingBox())!.height;
    await picker.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
    const list = picker.getByLabel("하위 위치", { exact: true });
    await expect(list.getByRole("button")).toHaveCount(1);
    await expect.poll(async () => (await picker.boundingBox())!.height).toBeLessThan(initialHeight);
    const rowHeight = (await list.getByRole("button").boundingBox())!.height;
    expect(await list.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(rowHeight + 1);
    const metrics = await locationScrollMetrics(picker);
    expect(metrics.body.scrollable).toBe(false);
    expect(metrics.children.scrollable).toBe(false);
    await expect(picker.getByLabel("선택할 소속 관계", { exact: true })).toBeInViewport();
    await expect(picker.getByRole("button", { name: "이 위치 적용", exact: true })).toBeInViewport();
    await picker.getByRole("button", { name: "취소", exact: true }).click();
    await expect(form.getByRole("button", { name: "소속 위치 선택", exact: true })).toBeFocused();
    await form.getByRole("button", { name: "취소", exact: true }).click();
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("빈 소속 위치는 내용 높이로 줄어들고 유효한 부모 위치에서만 선택 가능 안내를 표시한다", async ({ page }) => {
    api = await installWorkApi(page);
    api.workItems.splice(api.workItems.findIndex((item) => item.company_project_work_item_id === 502), 1);
    api.workItems.push(work(532, "QA 빈 네 번째 업무", { parent_work_item_id: 521, depth_level: 4 }));
    api.workItems.push(work(541, "QA 빈 다섯 번째 업무", { parent_work_item_id: 531, depth_level: 5 }));
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    const children = picker.getByLabel("하위 위치", { exact: true });
    const parentHint = picker.getByText("현재 위치를 상위 업무로 선택할 수 있습니다.", { exact: true });
    const apply = picker.getByRole("button", { name: "이 위치 적용", exact: true });
    const expectCompactEmpty = async (validParent: boolean) => {
      await expect(children).toHaveAttribute("data-list-state", "empty");
      await expect(children.getByText("하위 항목이 없습니다.", { exact: true })).toBeVisible();
      await expect(children.getByRole("button")).toHaveCount(0);
      expect(await children.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(120);
      await expect(parentHint).toHaveCount(validParent ? 1 : 0);
      if (validParent) await expect(parentHint).toBeVisible();
      const metrics = await locationScrollMetrics(picker);
      expect(metrics.children.scrollable).toBe(false);
      expect(Number(metrics.body.scrollable) + Number(metrics.children.scrollable)).toBeLessThanOrEqual(1);
      await expect(picker.getByLabel("선택할 소속 관계", { exact: true })).toBeInViewport();
      await expect(apply).toBeInViewport();
      await expectNoPageOverflow(page);
    };
    await children.getByRole("button", { name: "2. QA 운영 단계", exact: true }).click();
    await expectCompactEmpty(false);
    await expect(apply).toBeEnabled();
    await picker.getByRole("button", { name: "상위 위치로", exact: true }).click();
    for (const title of ["1. QA 구현 단계", "1.1. QA 백엔드 개발", "1.1.1. QA 인증 시스템", "1.1.1.1. QA 로그인 API"])
      await children.getByRole("button", { name: title, exact: true }).click();
    await children.getByRole("button", { name: /QA 빈 네 번째 업무/ }).click();
    await expectCompactEmpty(true);
    await expect(apply).toBeEnabled();
    await picker.getByRole("button", { name: "상위 위치로", exact: true }).click();
    await children.getByRole("button", { name: /QA JWT 발급/ }).click();
    await children.getByRole("button", { name: /QA 빈 다섯 번째 업무/ }).click();
    await expectCompactEmpty(false);
    await expect(apply).toBeDisabled();
    await expect(picker.getByRole("alert")).toContainText("최대 5단계");
    await picker.getByRole("button", { name: "취소", exact: true }).click();
    await expect(form.getByRole("button", { name: "소속 위치 선택", exact: true })).toBeFocused();
    await form.getByRole("button", { name: "취소", exact: true }).click();
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  for (const width of [320, 390, 800, 1440]) {
    test(`깊은 소속 경로 ${width}px는 마지막 두 업무명을 생략 없이 표시하고 전체 경로에서 상위를 탐색한다`, async ({ page, isMobile }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      api = await installWorkApi(page);
      const longParent = `QA 로그인 API ${"권한과 인증 데이터 처리 ".repeat(4)}`.trim();
      const longCurrent = `QA JWT 발급 ${"오랫동안 유지되는 세션 인증 정보 ".repeat(4)}`.trim();
      api.workItems.find((item) => item.company_project_work_item_id === 521)!.title = longParent;
      api.workItems.find((item) => item.company_project_work_item_id === 531)!.title = longCurrent;
      api.workItems.push(work(541, "QA 마지막 다섯 번째 업무", { parent_work_item_id: 531, depth_level: 5 }));
      const completeTitles = ["프로젝트 최상위", "1. QA 구현 단계", "1.1. QA 백엔드 개발", "1.1.1. QA 인증 시스템",
        `1.1.1.1. ${longParent}`, `1.1.1.1.1. ${longCurrent}`, "1.1.1.1.1.1. QA 마지막 다섯 번째 업무"];
      const displayTitles = ["프로젝트 최상위", "QA 구현 단계", "QA 백엔드 개발", "QA 인증 시스템",
        longParent, longCurrent, "QA 마지막 다섯 번째 업무"];
      await page.goto("/projects/901");
      await page.getByRole("button", { name: "업무 추가", exact: true }).click();
      await page.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
      const breadcrumb = picker.getByRole("navigation", { name: "소속 위치 경로", exact: true });
      const current = breadcrumb.locator('[aria-current="location"]');
      const children = picker.getByLabel("하위 위치", { exact: true });
      for (let index = 0; index < completeTitles.length; index++) {
        if (index > 0) {
          const next = children.getByRole("button", { name: completeTitles[index], exact: true });
          if (isMobile) await next.tap();
          else await next.click();
          await expect(current).toBeFocused();
        }
        await expect(current).toHaveAttribute("title", completeTitles[index]);
        await expect(current).toHaveAccessibleName(completeTitles[index]);
        await expect(current).toHaveText(displayTitles[index]);
        await expect(breadcrumb).toHaveAttribute("title", completeTitles.slice(0, index + 1).join(" › "));
        const pathLength = index + 1;
        const collapsed = pathLength >= 4;
        const buttons = breadcrumb.getByRole("button");
        await expect(buttons).toHaveCount(collapsed ? 3 : pathLength);
        if (collapsed) {
          await expect(breadcrumb.getByText("…", { exact: true })).toBeVisible();
          await expect(buttons).toHaveText(["프로젝트", displayTitles[index - 1], displayTitles[index]]);
          await expect(buttons.nth(1)).toHaveAttribute("title", completeTitles[index - 1]);
          await expect(buttons.nth(1)).toHaveAccessibleName(completeTitles[index - 1]);
        } else {
          await expect(buttons).toHaveText(pathLength === 1 ? [displayTitles[0]] : ["프로젝트", ...displayTitles.slice(1, pathLength)]);
          await expect(breadcrumb.getByText("…", { exact: true })).toHaveCount(0);
        }
        const buttonMetrics = await buttons.evaluateAll((elements) => elements.map((element) => ({
          clipped: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
          whiteSpace: getComputedStyle(element).whiteSpace,
          textOverflow: getComputedStyle(element).textOverflow,
        })));
        expect(buttonMetrics.every((metrics) => !metrics.clipped)).toBe(true);
        expect(buttonMetrics.every((metrics) => metrics.whiteSpace !== "nowrap" && metrics.textOverflow !== "ellipsis")).toBe(true);
        expect(await breadcrumb.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      }
      if (width === 320 || width === 1440)
        await page.screenshot({ path: testInfo.outputPath(`location-deep-breadcrumb-${width}.png`), animations: "disabled" });
      const details = picker.locator("details").filter({ hasText: "전체 경로 보기" });
      if (isMobile) await details.locator("summary").tap();
      else await details.locator("summary").click();
      const fullPath = picker.getByRole("list", { name: "전체 소속 위치 경로", exact: true });
      await expect(fullPath.getByRole("button")).toHaveText(completeTitles);
      await expect(fullPath.locator('[aria-current="location"]')).toHaveText(completeTitles.at(-1)!);
      const fullLongName = fullPath.getByRole("button", { name: completeTitles[5], exact: true });
      await expect(fullLongName).toHaveAccessibleName(completeTitles[5]);
      expect(await fullLongName.evaluate((element) => getComputedStyle(element).whiteSpace)).not.toBe("nowrap");
      expect(await fullPath.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      const ancestor = fullPath.getByRole("button", { name: completeTitles[3], exact: true });
      await ancestor.focus();
      await page.keyboard.press("Enter");
      await expect(current).toHaveText(displayTitles[3]);
      await expect(current).toHaveAccessibleName(completeTitles[3]);
      await expect(current).toBeFocused();
      await expect(fullPath.getByRole("button")).toHaveText(completeTitles.slice(0, 4));
      await details.locator("summary").click();
      await expect(picker.getByRole("button", { name: "이 위치 적용", exact: true })).toBeInViewport();
      await expectNoPageOverflow(page);
      await picker.getByRole("button", { name: "취소", exact: true }).click();
      await page.getByRole("dialog", { name: "업무 추가", exact: true }).getByRole("button", { name: "취소", exact: true }).click();
      expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
    });
  }

  test("연결 단계 후보는 실제 부모 기본값만 안내하고 직접 선택은 모든 위치 탐색·적용·취소에서 보존한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
    const trigger = form.getByRole("button", { name: "소속 위치 선택", exact: true });
    const description = "Phase 후보를 적용해도 상세 입력과 스크롤을 유지합니다.\n".repeat(20);
    await form.getByLabel("업무명", { exact: true }).fill("QA 수동 Phase 보존 업무");
    await fillDate(form, "업무 계획 시작일", "2026-09-11");
    await fillDate(form, "업무 계획 종료일", "2026-09-19");
    await advancedSettings(form).click();
    await form.getByLabel("업무 설명", { exact: true }).fill(description);
    await trigger.scrollIntoViewIfNeeded();
    const fields = form.locator("[data-project-work-fields]");
    await fields.evaluate((element) => { element.scrollTop = Math.min(48, element.scrollHeight - element.clientHeight); });
    await trigger.focus();
    const formScroll = await fields.evaluate((element) => element.scrollTop);
    await page.keyboard.press("Enter");
    let picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    const children = picker.getByLabel("하위 위치", { exact: true });
    const hint = picker.locator("[data-project-location-phase-hint]");
    const candidate = picker.getByLabel("선택할 소속 관계", { exact: true });
    const applied = picker.getByLabel("현재 선택한 소속 관계", { exact: true });
    await expect(hint).toHaveText("현재 적용된 연결 단계를 유지합니다.");
    await children.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
    await expect(hint).toHaveText("탐색한 단계가 연결 단계 후보입니다.");
    await children.getByRole("button", { name: "1.1. QA 백엔드 개발", exact: true }).click();
    await expect(hint).toHaveText("상위 업무 기준 추천 · 새 업무의 기본 후보입니다.");
    await selectOption(picker, "연결 단계 변경", "2. QA 운영 단계");
    for (const action of ["child", "parent", "phase", "root", "other-phase", "other-work", "root", "original-phase", "original-work", "child"] as const) {
      if (action === "child") await children.getByRole("button", { name: "1.1.1. QA 인증 시스템", exact: true }).click();
      else if (action === "parent" || action === "phase") await picker.getByRole("button", { name: "상위 위치로", exact: true }).click();
      else if (action === "root") await navigateLocationAncestor(picker, "프로젝트 최상위");
      else if (action === "other-phase") await children.getByRole("button", { name: "2. QA 운영 단계", exact: true }).click();
      else if (action === "other-work") await children.getByRole("button", { name: "2.1. QA 운영 검토", exact: true }).click();
      else if (action === "original-phase") await children.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
      else await children.getByRole("button", { name: "1.1. QA 백엔드 개발", exact: true }).click();
      await expect(candidate).toContainText("연결 단계: 2. QA 운영 단계");
      await expect(hint).toHaveText("직접 선택한 연결 단계입니다. 위치를 탐색해도 유지됩니다.");
      await expect(applied).toContainText("단계 미지정");
      await expect(applied).toContainText("프로젝트 최상위");
    }
    await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
    await expect(trigger).toBeFocused();
    await expect(trigger).toContainText("QA 인증 시스템");
    await expect(form.getByLabel("선택한 소속 관계", { exact: true })).toContainText("연결 단계: 2. QA 운영 단계");
    await expect.poll(() => fields.evaluate((element) => element.scrollTop)).toBe(formScroll);
    await expect(form.getByLabel("업무명", { exact: true })).toHaveValue("QA 수동 Phase 보존 업무");
    await expect(form.getByLabel("업무 계획 시작일", { exact: true })).toHaveValue(/09\.11/);
    await expect(form.getByLabel("업무 계획 종료일", { exact: true })).toHaveValue(/09\.19/);
    await expect(advancedSettings(form)).toHaveAttribute("aria-expanded", "true");
    await expect(form.getByLabel("업무 설명", { exact: true })).toHaveValue(description);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
    await trigger.click();
    picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await expect(picker.locator("[data-project-location-phase-hint]")).toHaveText("현재 적용된 연결 단계를 유지합니다.");
    await expect(picker).not.toContainText("상위 업무 기준 추천");
    await selectOption(picker, "연결 단계 변경", "단계 미지정");
    await navigateLocationAncestor(picker, "프로젝트 최상위");
    await expect(picker.getByLabel("선택할 소속 관계", { exact: true })).toContainText("연결 단계: 단계 미지정");
    await picker.getByRole("button", { name: "취소", exact: true }).click();
    await expect(trigger).toContainText("QA 인증 시스템");
    await expect(form.getByLabel("선택한 소속 관계", { exact: true })).toContainText("연결 단계: 2. QA 운영 단계");
    await expect(form.getByLabel("업무 설명", { exact: true })).toHaveValue(description);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
    await form.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(form).toHaveCount(0);
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    expect(api.requests.find((request) => request.method === "POST")?.body).toMatchObject({
      title: "QA 수동 Phase 보존 업무", description: description.trimEnd(), parent_work_item_id: 511, company_project_phase_id: 502,
      planned_start_date: "2026-09-11", planned_end_date: "2026-09-19",
    });
  });

  for (const viewport of [
    { width: 1440, height: 900, mode: "list" },
    { width: 320, height: 740, mode: "body" },
    { width: 390, height: 844, mode: "body" },
    { width: 600, height: 800, mode: "list" },
    { width: 800, height: 800, mode: "list" },
    { width: 1024, height: 420, mode: "body" },
  ] as const) {
    test(`소속 위치 ${viewport.width}x${viewport.height}는 단일 스크롤·고정 Footer·마지막 항목 키보드 탐색과 폼 복귀를 유지한다`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      api = await installWorkApi(page);
      const lastTitle = `QA 위치 끝 업무 ${"길고 깊은 경로를 확인합니다 ".repeat(4)}`.trim();
      const childTitle = `QA 위치 마지막 자식 ${"연결 단계와 상위 업무가 독립입니다 ".repeat(4)}`.trim();
      for (let index = 0; index < 40; index++)
        api.workItems.push(work(8000 + index, index === 39 ? lastTitle : `QA 위치 형제 ${index}`, {
          rollup: { child_count: index === 39 ? 1 : 0 },
        }));
      api.workItems.push(work(9000, childTitle, { parent_work_item_id: 8039, depth_level: 2 }));
      await page.goto("/projects/901");
      await page.getByRole("button", { name: "업무 추가", exact: true }).click();
      const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
      const trigger = form.getByRole("button", { name: "소속 위치 선택", exact: true });
      await form.getByLabel("업무명", { exact: true }).fill("QA 위치 화면 복귀 보존");
      await fillDate(form, "업무 계획 시작일", "2026-09-11");
      await fillDate(form, "업무 계획 종료일", "2026-09-19");
      await advancedSettings(form).click();
      await form.getByLabel("업무 설명", { exact: true }).fill("스크롤과 상세 입력도 함께 보존합니다.\n".repeat(20));
      await trigger.scrollIntoViewIfNeeded();
      const fields = form.locator("[data-project-work-fields]");
      await fields.evaluate((element) => { element.scrollTop = Math.min(48, element.scrollHeight - element.clientHeight); });
      await trigger.focus();
      const formScroll = await fields.evaluate((element) => element.scrollTop);
      await page.keyboard.press("Enter");
      const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
      await expect(picker.getByText("현재 적용된 위치", { exact: true })).toBeVisible();
      await expect(picker.getByText("위치 탐색", { exact: true })).toBeVisible();
      await expect(picker.getByText("선택 후보", { exact: true })).toBeVisible();
      await expect(picker.getByText("단계 내 업무 탐색 · 연결 단계 후보", { exact: true })).toHaveCount(0);
      const applied = picker.getByLabel("현재 선택한 소속 관계", { exact: true });
      await expect(applied).toContainText("프로젝트 최상위");
      await expect(applied).toContainText("단계 미지정");
      await picker.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
      const body = picker.locator("[data-project-location-picker]");
      await expect(body).toHaveAttribute("data-scroll-mode", viewport.mode);
      const scroller = await singleLocationScroller(picker);
      const children = picker.getByLabel("하위 위치", { exact: true });
      const footer = picker.getByRole("button", { name: "이 위치 적용", exact: true }).locator("..");
      const footerBefore = await footer.boundingBox();
      expect(footerBefore).not.toBeNull();
      await children.getByRole("button").nth(39).focus();
      await page.keyboard.press("Tab");
      const last = children.getByRole("button").last();
      await expect(last).toBeFocused();
      await expect(last).toHaveAccessibleName(new RegExp(lastTitle));
      const originalScroll = await scroller.evaluate((element) => element.scrollTop);
      expect(originalScroll).toBeGreaterThan(0);
      const lastBounds = await last.boundingBox();
      const scrollBounds = await scroller.boundingBox();
      expect(lastBounds!.y).toBeGreaterThanOrEqual(scrollBounds!.y - 1);
      expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(Math.min(scrollBounds!.y + scrollBounds!.height, footerBefore!.y) + 1);
      const footerAfter = await footer.boundingBox();
      expect(Math.abs(footerAfter!.y - footerBefore!.y)).toBeLessThanOrEqual(1);
      expect(footerAfter!.y + footerAfter!.height).toBeLessThanOrEqual(viewport.height + 1);
      await page.keyboard.press("Enter");
      await expect(picker.getByRole("navigation").locator('[aria-current="location"]')).toBeFocused();
      await children.getByRole("button", { name: new RegExp(childTitle) }).click();
      await picker.locator("summary").filter({ hasText: "전체 경로 보기" }).click();
      const completePath = picker.getByRole("list", { name: "전체 소속 위치 경로", exact: true });
      await expect(completePath).toContainText(lastTitle);
      await expect(completePath).toContainText(childTitle);
      await selectOption(picker, "연결 단계 변경", "2. QA 운영 단계");
      await expect(picker.getByRole("navigation")).toContainText(childTitle);
      await expect(applied).toContainText("단계 미지정");
      await picker.getByRole("button", { name: "상위 위치로", exact: true }).click();
      await picker.getByRole("button", { name: "상위 위치로", exact: true }).click();
      await singleLocationScroller(picker);
      await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(originalScroll);
      await expectNoPageOverflow(page);
      await picker.getByRole("button", { name: "취소", exact: true }).click();
      await expect(trigger).toBeFocused();
      await expect.poll(() => fields.evaluate((element) => element.scrollTop)).toBe(formScroll);
      await expect(trigger).toContainText("프로젝트 최상위");
      await expect(form.getByLabel("업무명", { exact: true })).toHaveValue("QA 위치 화면 복귀 보존");
      await expect(form.getByLabel("업무 계획 시작일", { exact: true })).toHaveValue(/09\.11/);
      await expect(form.getByLabel("업무 계획 종료일", { exact: true })).toHaveValue(/09\.19/);
      await expect(advancedSettings(form)).toHaveAttribute("aria-expanded", "true");
      await expect(form.getByLabel("업무 설명", { exact: true })).toHaveValue("스크롤과 상세 입력도 함께 보존합니다.\n".repeat(20));
      await cancelForm(page, form);
      expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
      expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
    });
  }

  test("소속 위치의 목록·본문 스크롤 모드는 화면 높이 전환 후 각각의 위치와 후보를 복원한다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    api = await installWorkApi(page);
    for (let index = 0; index < 40; index++) api.workItems.push(work(8000 + index, `QA 모드 전환 형제 ${index}`));
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    await page.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await picker.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
    const body = picker.locator("[data-project-location-picker]");
    const children = picker.locator("[data-project-location-children]");
    const apply = picker.getByRole("button", { name: "이 위치 적용", exact: true });
    const currentPath = picker.getByRole("navigation").locator('[aria-current="location"]');
    await expect(body).toHaveAttribute("data-scroll-mode", "list");
    await singleLocationScroller(picker);
    await children.evaluate(async (element) => {
      element.scrollTop = 200;
      // Let the native scroll event record this mode before the next resize.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    });
    await expect.poll(() => children.evaluate((element) => element.scrollTop)).toBe(200);
    const navigation = await currentPath.textContent();
    for (const [index, height] of [420, 900, 420].entries()) {
      await page.setViewportSize({ width: 1440, height });
      const mode = height === 420 ? "body" : "list";
      await expect(body).toHaveAttribute("data-scroll-mode", mode);
      await singleLocationScroller(picker);
      if (index === 0) {
        await body.evaluate(async (element) => {
          element.scrollTop = 100;
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
      }
      await expect.poll(() => (mode === "body" ? body : children).evaluate((element) => element.scrollTop)).toBe(mode === "body" ? 100 : 200);
      await expect(currentPath).toHaveText(navigation!);
      await expect(currentPath).toBeFocused();
      await expect(picker.getByLabel("선택할 소속 관계", { exact: true })).toContainText("1. QA 구현 단계");
      await expect(picker.getByLabel("현재 선택한 소속 관계", { exact: true })).toContainText("단계 미지정");
      await expect(apply).toBeInViewport();
      const footer = await apply.locator("..").boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(height + 1);
      await expectNoPageOverflow(page);
    }
    await picker.getByRole("button", { name: "취소", exact: true }).click();
    await page.getByRole("dialog", { name: "업무 추가", exact: true }).getByRole("button", { name: "취소", exact: true }).click();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("소속 위치 목록은 공간을 차지하는 스크롤바에서도 마지막 항목과 후보·Footer에 접근할 수 있다", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 800 });
    api = await installWorkApi(page);
    for (let index = 0; index < 40; index++) api.workItems.push(work(8000 + index, `QA 일반 스크롤바 업무 ${index}`));
    await page.goto("/projects/901");
    await page.addStyleTag({ content: `
      [data-project-location-picker], [data-project-location-children] { scrollbar-gutter: stable; }
      [data-project-location-picker]::-webkit-scrollbar,
      [data-project-location-children]::-webkit-scrollbar { width: 20px; }
      [data-project-location-picker]::-webkit-scrollbar-thumb,
      [data-project-location-children]::-webkit-scrollbar-thumb { background: #7c3aed; }
    ` });
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    await page.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await picker.getByRole("button", { name: "1. QA 구현 단계", exact: true }).click();
    const scroller = await singleLocationScroller(picker);
    const metrics = await locationScrollMetrics(picker);
    const scrollbarWidth = metrics.children.scrollable ? metrics.children.scrollbarWidth : metrics.body.scrollbarWidth;
    test.skip(scrollbarWidth === 0, "위치 선택기에 스크롤바 폭을 지정해도 이 브라우저는 레이아웃 공간을 차지하지 않습니다.");
    expect(scrollbarWidth).toBeGreaterThanOrEqual(15);
    const last = picker.getByLabel("하위 위치", { exact: true }).getByRole("button").last();
    await last.focus();
    await expect(last).toBeInViewport();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await scroller.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await selectOption(picker, "연결 단계 변경", "2. QA 운영 단계");
    await expect(picker.getByLabel("선택할 소속 관계", { exact: true })).toContainText("2. QA 운영 단계");
    await expect(picker.getByRole("button", { name: "이 위치 적용", exact: true })).toBeInViewport();
    await expectNoPageOverflow(page);
    await picker.getByRole("button", { name: "취소", exact: true }).click();
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("WBS는 Phase·Work ID 충돌, 다른 단계의 자식, 미지정 업무와 취소 필터에도 유지된다", async ({ page }) => {
    api = await installWorkApi(page);
    api.workItems.find((item) => item.company_project_work_item_id === 511)!.company_project_phase_id = 502;
    api.workItems.push(work(540, "QA 다섯째 업무", { parent_work_item_id: 531, depth_level: 5 }));
    api.workItems.push(work(700, "QA 미지정 업무", { company_project_phase_id: null }));
    api.workItems.push(work(701, "QA 취소된 업무", { sort_order: -1, status: "cancelled" }));
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
    await expect(page.locator('[data-hierarchy-key="phase:501"] .work-phase-title')).toHaveText("1. QA 구현 단계");
    await expect(rowTitle(page, "QA 취소된 업무")).toHaveText("1.1. QA 취소된 업무");
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveText("1.2. QA 백엔드 개발");
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveText("1.2.1. QA 인증 시스템");
    await expect(rowTitle(page, "QA 다섯째 업무")).toHaveText("1.2.1.1.1.1. QA 다섯째 업무");
    await expect(rowTitle(page, "QA 미지정 업무")).toHaveText("3. QA 미지정 업무");
    await expect(page.locator('[data-hierarchy-key="group:unassigned"] .work-phase-title')).toHaveText("단계 미지정");
    await selectOption(page, "업무 상태", "진행 중");
    await expect(rowTitle(page, "QA 취소된 업무")).toHaveCount(0);
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveText("1.2. QA 백엔드 개발");
    await selectOption(page, "업무 상태", "전체 상태");
    await selectOption(page, "Phase 선택", "QA 운영 단계");
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(1);
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveText("1.2.1. QA 인증 시스템");
    await selectOption(page, "Phase 선택", "전체 단계");
    await page.getByRole("textbox", { name: "업무 검색", exact: true }).fill("다섯째");
    await expect(rowTitle(page, "QA 다섯째 업무")).toHaveText("1.2.1.1.1.1. QA 다섯째 업무");
    await expect(page.locator('[data-hierarchy-key="phase:502"]')).toHaveCount(0);
  });

  test("Phase 접힘은 독립적이며 검색 해제 후 복원되고 업무 펼침 상태를 보존한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 펼치기", exact: true }).click();
    const phaseToggle = page.getByRole("button", { name: "QA 구현 단계 접기", exact: true });
    await phaseToggle.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveCount(0);
    await expect(rowTitle(page, "QA 운영 검토")).toBeVisible();
    const search = page.getByRole("textbox", { name: "업무 검색", exact: true });
    await search.fill("로그인");
    await expect(rowTitle(page, "QA 로그인 API")).toBeVisible();
    await expect(page.getByRole("button", { name: "QA 구현 단계 접기", exact: true })).toBeDisabled();
    await expect(page.locator('[data-hierarchy-key="phase:502"]')).toHaveCount(0);
    await search.fill("");
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveCount(0);
    await page.getByRole("button", { name: "QA 구현 단계 펼치기", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(rowTitle(page, "QA 인증 시스템")).toBeVisible();
    await expect(rowTitle(page, "QA 로그인 API")).toHaveCount(0);
    await page.getByRole("button", { name: "전체 접기", exact: true }).click();
    await expect(page.locator("tr[data-work-id]")).toHaveCount(0);
    await expect(page.getByText("검색 조건에 맞는 업무가 없습니다.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
    await expect(rowTitle(page, "QA JWT 발급")).toBeVisible();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
  });

  test("Phase를 접어도 선택된 업무 패널과 보라색 행 선택을 보존한다", async ({ page }) => {
    test.skip(page.viewportSize()!.width <= 700, "모바일 상세 패널은 배경 목록을 비활성화한다.");
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    await page.getByRole("button", { name: "QA 구현 단계 접기", exact: true }).click();
    await expect(panel(page)).toContainText("QA 백엔드 개발 설명");
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveCount(0);
    await page.getByRole("button", { name: "QA 구현 단계 펼치기", exact: true }).click();
    await expect(page.locator('tr[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('tr[data-work-id="501"]')).toHaveClass("work-row-selected");
  });

  test("summary WBS는 직계 lazy 조회 전후 유지되고 child_count 0도 직접 탐색한다", async ({ page }) => {
    api = await installWorkApi(page, { summary: true });
    api.workItems.find((item) => item.company_project_work_item_id === 511)!.rollup = { child_count: 0 };
    await page.goto("/projects/901");
    await expect(page.getByText(/^불러온 업무명에서 검색·필터합니다\./)).toBeVisible();
    await expect(page.getByText(/^전체 업무명에서 검색·필터합니다\./)).toHaveCount(0);
    await expect(page.locator('[data-hierarchy-key="phase:501"] .work-phase-count')).toHaveText("조회 2개");
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveText("1.1. QA 백엔드 개발");
    await page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 펼치기", exact: true }).click();
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveText("1.1.1. QA 인증 시스템");
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    const gate = deferred();
    const path = "/company-projects/901/work-items/511/children";
    api.gates.set(`GET ${path}`, gate.promise);
    await page.getByRole("button", { name: "QA 인증 시스템 하위 업무 펼치기", exact: true }).click();
    await expect.poll(() => api.requests.filter((request) => request.path === path).length).toBe(1);
    await page.getByRole("button", { name: "QA 인증 시스템 하위 업무 접기", exact: true }).click();
    await page.getByRole("button", { name: "QA 인증 시스템 하위 업무 펼치기", exact: true }).click();
    gate.release();
    await expect(rowTitle(page, "QA 로그인 API")).toHaveText("1.1.1.1. QA 로그인 API");
    await expect(page.getByText(/^불러온 업무명에서 검색·필터합니다\./)).toBeVisible();
    await expect(page.locator('[data-hierarchy-key="phase:501"] .work-phase-count')).toHaveText("조회 3개");
    await expect(rowTitle(page, "QA 운영 검토")).toHaveText("2.1. QA 운영 검토");
    expect(api.requests.filter((request) => request.path === path)).toHaveLength(1);
    await page.getByRole("button", { name: "불러온 업무 펼치기", exact: true }).click();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(1);
    // An explicitly explored successful empty response is complete despite old hints.
    api.workItems.find((item) => item.company_project_work_item_id === 521)!.rollup = { child_count: 9 };
    api.childrenPayloads.set(521, { items: [] });
    await page.getByRole("button", { name: "QA 로그인 API 하위 업무 펼치기", exact: true }).click();
    await expect(page.getByRole("button", { name: /QA 로그인 API 하위 업무/ })).toHaveCount(0);
    await rowTitle(page, "QA 로그인 API").click();
    await expect(panel(page)).toContainText("하위 업무 없음");
    await page.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    expect(api.requests.filter((request) => request.path.endsWith("/521/children"))).toHaveLength(1);
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveText("1.1. QA 백엔드 개발");
  });

  test("조회 정책이 없는 부분 응답은 임의 WBS를 만들지 않는다", async ({ page }) => {
    api = await installWorkApi(page, { partial: true });
    await page.goto("/projects/901");
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveText("QA 백엔드 개발");
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveAttribute("title", "QA 백엔드 개발 (번호 확인 필요)");
    await page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 펼치기", exact: true }).click();
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveText("QA 인증 시스템");
  });

  test("긴 제목의 5단계 업무는 계층 번호와 말줄임을 보존하고 화면 크기에 맞게 표시한다", async ({ page }, testInfo) => {
    api = await installWorkApi(page);
    const title = "QA 다섯째 업무의 아주 긴 제목으로 목록 가독성과 전체 제목 접근을 확인합니다 ".repeat(4);
    const ancestorTitle = "QA JWT 발급의 긴 업무 경로를 키보드와 모바일에서 확인합니다 ".repeat(3);
    api.workItems.find((item) => item.company_project_work_item_id === 531)!.title = ancestorTitle;
    api.workItems.push(work(540, title, { parent_work_item_id: 531, depth_level: 5 }));
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
    const deepest = page.locator('[data-work-id="540"] .work-title-button');
    await expect(deepest).toHaveText(`1.1.1.1.1.1. ${title}`);
    await expect(deepest).toHaveAttribute("title", `1.1.1.1.1.1. ${title}`);
    await expect(deepest).toHaveCSS("font-weight", "400");
    await expect(deepest).toHaveCSS("font-size", "14px");
    const mobile = page.viewportSize()!.width <= 700;
    await expect(page.locator('[data-work-id="540"] .work-name')).toHaveCSS("padding-left", mobile ? "60px" : "110px");
    await expect(page.locator('[data-hierarchy-key="phase:501"] .work-phase-title')).toHaveCSS("font-weight", "600");
    await expect(page.locator('[data-hierarchy-key="phase:501"] .work-phase-title')).toHaveCSS("font-size", "14px");
    expect(await deepest.evaluate((element) => element.clientWidth)).toBeGreaterThan(60);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    if (mobile) {
      await expect(deepest.locator(".work-wbs-number")).toBeHidden();
      const scroller = page.locator(".work-table-scroll");
      expect(await scroller.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await scroller.evaluate((element) => { element.scrollLeft = 100; });
      expect(await scroller.evaluate((element) => element.scrollLeft)).toBe(0);
      expect(await deepest.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(44);
      expect(await page.locator('[data-work-id="540"]').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);
    } else {
      await expect(deepest.locator(".work-wbs-number")).toBeVisible();
      const titleText = deepest.locator(".work-title-text");
      await expect(titleText).toHaveCSS("text-overflow", "ellipsis");
      expect(await titleText.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath("hierarchy-numbers.png"), fullPage: true });
    await deepest.click();
    const detail = panel(page);
    const fullPath = detail.locator(".work-panel-path");
    const pathTrigger = fullPath.locator("summary");
    await expect(pathTrigger).toHaveAccessibleName("업무 전체 경로");
    const path = await pathTrigger.getAttribute("title");
    expect(path).toContain(ancestorTitle);
    await pathTrigger.focus();
    await page.keyboard.press("Enter");
    await expect(fullPath).toHaveAttribute("open", "");
    await expect(fullPath.locator("p")).toHaveText(path!);
    await expectNoPageOverflow(page);
    await page.keyboard.press("Enter");
    await expect(fullPath).not.toHaveAttribute("open", "");
    const actions = detail.locator(".work-panel-header-actions button");
    const boxes = await actions.evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    }));
    for (let index = 1; index < boxes.length; index++)
      expect(boxes[index].left).toBeGreaterThanOrEqual(boxes[index - 1].right);
    await expect(detail.getByRole("button", { name: "업무 수정", exact: true })).toBeVisible();
    await detail.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
  });

  test("단계 없는 프로젝트의 업무를 탐색하고 키보드로 상세 패널을 전환·닫는다", async ({
    page,
  }, testInfo) => {
    api = await installWorkApi(page, { phaseLess: true });
    await page.goto("/projects/901");
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeVisible();
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveText("1. QA 백엔드 개발");
    await expect(rowTitle(page, "QA 운영 검토")).toHaveText("2. QA 운영 검토");
    await expect(page.getByRole("button", { name: /단계 추가/ })).toHaveCount(
      0,
    );
    await expect(panel(page)).toHaveCount(0);
    if (page.viewportSize()!.width <= 700)
      await attachLayout(page, testInfo, "before-keyboard-selection");
    await rowTitle(page, "QA 백엔드 개발").focus();
    await page.keyboard.press("Enter");
    await expect(panel(page)).toContainText("QA 백엔드 개발 설명");
    await expect(panel(page)).toContainText("37%");
    await expect(
      panel(page).getByRole("button", {
        name: "하위 업무 추가",
        exact: true,
      }),
    ).toBeEnabled();
    if (page.viewportSize()!.width <= 700)
      await attachLayout(page, testInfo, "selected-parent");
    await expect(
      panel(page).getByText(QA_USER.name, { exact: true }),
    ).toBeVisible();
    if (page.viewportSize()!.width <= 700) {
      await panel(page)
        .getByRole("button", { name: /^QA 인증 시스템/ })
        .click();
      await expect(panel(page)).toContainText("QA 인증 시스템 설명");
    } else {
      await rowTitle(page, "QA 운영 검토").click();
      await expect(panel(page)).toContainText("QA 운영 검토 설명");
    }
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await rowTitle(page, "QA 백엔드 개발").click();
    if (page.viewportSize()!.width <= 700)
      await attachLayout(page, testInfo, "before-close");
    await page
      .getByRole("button", { name: "업무 상세 닫기", exact: true })
      .click();
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "개요", exact: true }).click();
    await expect(
      page.getByText("프로젝트 개요가 업무와 함께 유지됩니다.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(api.requests.every((request) => request.method === "GET")).toBe(
      true,
    );
  });

  for (const phaseLess of [false, true]) {
    test(`빈 ${phaseLess ? "단계 없는" : "단계형"} 프로젝트도 명시적으로 생성 창을 열고 저장 전에는 쓰기를 보내지 않는다`, async ({
      page,
    }) => {
      api = await installWorkApi(page, { phaseLess });
      api.workItems.splice(0);
      api.assignments.splice(0);
      await page.goto("/projects/901");
      await expect(
        page.getByText("표시할 업무가 없습니다.", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("0개 불러옴", { exact: true })).toHaveCount(
        0,
      );
      const addWork = page.getByRole("button", {
        name: "업무 추가",
        exact: true,
      });
      await expect(addWork).toBeEnabled();
      await addWork.click();
      const dialog = page.getByRole("dialog", { name: "업무 추가", exact: true });
      await expect(dialog.getByRole("textbox", { name: "업무명", exact: true })).toBeVisible();
      await expect(advancedSettings(dialog)).toHaveAttribute("aria-expanded", "false");
      if (phaseLess) await expect(dialog.getByRole("button", { name: "업무 단계 선택", exact: true })).toHaveCount(0);
      await dialog.getByRole("button", { name: "취소", exact: true }).click();
      const addPhase = page.getByRole("button", {
        name: "단계 추가",
        exact: true,
      });
      if (phaseLess) await expect(addPhase).toHaveCount(0);
      else {
        await expect(addPhase).toBeEnabled();
        await addPhase.click();
        await page.getByRole("dialog", { name: "단계 추가", exact: true }).getByRole("button", { name: "취소", exact: true }).click();
      }
      expect(api.requests.every((request) => request.method === "GET")).toBe(
        true,
      );
    });
  }

  test("단계 생성과 수정은 문서의 DTO를 보내고 수정 시 바뀐 필드와 명시 null만 저장한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "단계 추가", exact: true }).click();
    const create = page.getByRole("dialog", { name: "단계 추가", exact: true });
    await create.getByLabel("단계명", { exact: true }).fill("QA 신규 단계");
    await expect(advancedSettings(create)).toHaveAttribute("aria-expanded", "false");
    await expect(create.getByLabel("단계 실적 시작일", { exact: true })).toHaveCount(0);
    await advancedSettings(create).click();
    await create.getByLabel("단계 설명", { exact: true }).fill("QA 단계 설명");
    await selectOption(create, "단계 상태 선택", "진행 중");
    await fillDate(create, "단계 계획 시작일", "2026-09-10");
    await fillDate(create, "단계 계획 종료일", "2026-09-12");
    await create.getByLabel("단계 정렬 순서", { exact: true }).fill("3");
    await create.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(create).toHaveCount(0);
    const createdPhase = api.phases.find((item) => item.name === "QA 신규 단계")!;
    expect(createdPhase).toBeDefined();
    const creation = api.requests.find((request) => request.method === "POST" && request.path === "/company-projects/901/phases")!;
    expect(creation.body).toEqual({
      name: "QA 신규 단계", description: "QA 단계 설명", status: "in_progress", sort_order: 3,
      planned_start_date: "2026-09-10", planned_end_date: "2026-09-12", actual_start_date: null, actual_end_date: null,
    });
    const edit = await editResource(page, "QA 신규 단계", true);
    await edit.getByLabel("단계명", { exact: true }).fill("QA 수정된 단계");
    await advancedSettings(edit).click();
    await edit.getByLabel("단계 설명", { exact: true }).fill("");
    await selectOption(edit, "단계 상태 선택", "완료");
    await fillDate(edit, "단계 계획 종료일", "");
    await edit.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(edit).toHaveCount(0);
    expect(api.requests.find((request) => request.method === "PATCH" && request.path === `/company-projects/901/phases/${createdPhase.company_project_phase_id}`)?.body)
      .toEqual({ name: "QA 수정된 단계", description: null, status: "done", planned_end_date: null });
    expect(api.workItems.find((item) => item.company_project_work_item_id === 501)?.status).toBe("in_progress");
  });

  test("루트 업무 생성은 상태와 진행률을 따로 저장하고 계획 날짜와 UTC 마감을 전달한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await expect(dialog.getByRole("button", { name: "소속 위치 선택", exact: true })).toContainText("프로젝트 최상위");
    await dialog.getByLabel("업무명", { exact: true }).fill("QA 새 루트 업무");
    await advancedSettings(dialog).click();
    await selectOption(dialog, "업무 상태 선택", "완료");
    await selectOption(dialog, "업무 우선순위 선택", "긴급");
    await fillDate(dialog, "업무 계획 시작일", "2026-09-11");
    await fillDate(dialog, "업무 계획 종료일", "2026-09-13");
    await fillDate(dialog, "업무 마감 날짜", "2026-09-13");
    await dialog.getByLabel("업무 마감 시간", { exact: true }).fill("09:30");
    await dialog.getByLabel("업무 마감 시간", { exact: true }).press("Tab");
    await selectOption(dialog, "업무 진행률 설정", "수동 설정");
    await dialog.getByLabel("업무 진행률", { exact: true }).fill("55");
    await dialog.getByLabel("업무 WBS 코드", { exact: true }).fill("QA.1");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(rowTitle(page, "QA 새 루트 업무")).toBeVisible();
    const body = api.requests.find((request) => request.method === "POST" && request.path === "/company-projects/901/work-items")!.body;
    expect(body).toMatchObject({ title: "QA 새 루트 업무", status: "done", priority: "urgent", progress_percent: 55,
      parent_work_item_id: null, company_project_phase_id: null, planned_start_date: "2026-09-11", planned_end_date: "2026-09-13",
      due_datetime: "2026-09-13T00:30:00.000Z", wbs_code: "QA.1" });
    expect(body).not.toHaveProperty("completed_at");
    expect(body).not.toHaveProperty("department_ids");
    expect(api.workItems.find((item) => item.title === "QA 새 루트 업무")?.progress_percent).toBe(55);
  });

  test("하위 업무는 부모의 단계를 기본 선택하고 별도 단계 선택과 루트 이동을 유지한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    await panel(page).getByRole("button", { name: "하위 업무 추가", exact: true }).click();
    const create = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await expect(create.getByRole("button", { name: "소속 위치 선택", exact: true })).toContainText("QA 백엔드 개발");
    await expect(create.getByRole("button", { name: "소속 위치 선택", exact: true })).toContainText("QA 구현 단계");
    await changeLinkedPhase(page, create, "2. QA 운영 단계");
    await create.getByLabel("업무명", { exact: true }).fill("QA 새 하위 업무");
    await create.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(create).toHaveCount(0);
    const createdWork = api.workItems.find((item) => item.title === "QA 새 하위 업무")!;
    expect(createdWork.parent_work_item_id).toBe(501);
    expect(createdWork.company_project_phase_id).toBe(502);
    expect(createdWork.depth_level).toBe(2);
    expect(api.departments.some((item) => item.company_project_work_item_id === createdWork.company_project_work_item_id)).toBe(false);
    await panel(page).getByRole("button", { name: /^QA 새 하위 업무/ }).click();
    const edit = await editResource(page, "QA 새 하위 업무");
    await edit.getByLabel("업무명", { exact: true }).fill("QA 이동한 루트 업무");
    await edit.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await navigateLocationAncestor(picker, "프로젝트 최상위");
    await picker.getByRole("button", { name: "2. QA 운영 단계", exact: true }).click();
    await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
    await edit.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(edit).toHaveCount(0);
    expect(api.requests.find((request) => request.method === "PATCH" && request.path === `/company-projects/901/work-items/${createdWork.company_project_work_item_id}`)?.body)
      .toEqual({ title: "QA 이동한 루트 업무", parent_work_item_id: null });
    expect(createdWork.depth_level).toBe(1);
    expect(createdWork.company_project_phase_id).toBe(502);
  });

  test("단계 행 업무 추가와 업무 행 하위 추가는 각 진입점의 독립된 기본 관계를 저장한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    const grid = page.getByRole("treegrid", { name: "계층형 업무", exact: true });
    for (const entry of [
      { title: "QA 운영 단계", action: "업무 추가", name: "QA 단계 행 신규 업무", parentId: null, phaseId: 502 },
      { title: "QA 백엔드 개발", action: "하위 업무 추가", name: "QA 업무 행 신규 하위", parentId: 501, phaseId: 501 },
    ]) {
      await grid.getByRole("button", { name: `${entry.title} 더 보기`, exact: true }).click();
      await page.getByRole("menuitem", { name: entry.action, exact: true }).click();
      const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
      const location = form.getByRole("button", { name: "소속 위치 선택", exact: true });
      await expect(location).toContainText(entry.title);
      if (entry.parentId === null) await expect(location).toContainText("프로젝트 최상위");
      await form.getByLabel("업무명", { exact: true }).fill(entry.name);
      await form.getByRole("button", { name: "업무 추가", exact: true }).click();
      await expect(form).toHaveCount(0);
      expect(api.requests.find((request) => request.method === "POST" && request.body.title === entry.name)?.body)
        .toMatchObject({ parent_work_item_id: entry.parentId, company_project_phase_id: entry.phaseId });
    }
    await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
    await expect(rowTitle(page, "QA 단계 행 신규 업무")).toBeVisible();
    await expect(rowTitle(page, "QA 업무 행 신규 하위")).toBeVisible();
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(2);
  });

  test("업무 수정은 날짜·단계·설명을 null로 지우고 진행률 override를 해제한다", async ({ page }) => {
    api = await installWorkApi(page);
    const item = api.workItems.find((entry) => entry.company_project_work_item_id === 501)!;
    Object.assign(item, { actual_start_date: "2026-09-10", actual_end_date: "2026-09-12", due_datetime: "2026-09-13T00:30:00Z", wbs_code: "QA.OLD", progress_override_percent: 37 });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    const dialog = await editResource(page, "QA 백엔드 개발");
    await dialog.getByLabel("업무명", { exact: true }).fill("QA 수정된 업무");
    await advancedSettings(dialog).click();
    await dialog.getByLabel("업무 설명", { exact: true }).fill("");
    await changeLinkedPhase(page, dialog, "단계 미지정");
    for (const label of ["업무 계획 시작일", "업무 계획 종료일", "업무 실적 시작일", "업무 실적 종료일", "업무 마감 날짜"]) {
      await fillDate(dialog, label, "");
      await expect(dialog.getByLabel(label, { exact: true })).toHaveAttribute("aria-expanded", "false");
    }
    await dialog.getByRole("button", { name: "업무 마감 시간 지우기", exact: true }).click();
    await dialog.getByLabel("업무 WBS 코드", { exact: true }).fill("");
    await selectOption(dialog, "업무 진행률 설정", "자동 계산");
    await expect(dialog.getByLabel("업무 진행률", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(api.requests.find((request) => request.method === "PATCH" && request.path === "/company-projects/901/work-items/501")?.body)
      .toEqual({ title: "QA 수정된 업무", description: null, company_project_phase_id: null,
        planned_start_date: null, planned_end_date: null, actual_start_date: null, actual_end_date: null,
        due_datetime: null, wbs_code: null, progress_override_percent: null });
    expect(item.progress_percent).toBe(37);
  });

  test("상세 설정을 접고 펼치거나 접은 채 생성해도 입력한 실적·마감·WBS·수동 0%를 유지한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "업무 추가", exact: true });
    const disclosure = advancedSettings(dialog);
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await expect(dialog.getByLabel("업무 WBS 코드", { exact: true })).toHaveCount(0);
    await dialog.getByLabel("업무명", { exact: true }).fill("QA 접힌 상세 설정 업무");
    await disclosure.click();
    await fillDate(dialog, "업무 실적 시작일", "2026-09-10");
    await fillDate(dialog, "업무 실적 종료일", "2026-09-12");
    await fillDate(dialog, "업무 마감 날짜", "2026-09-13");
    await dialog.getByLabel("업무 마감 시간", { exact: true }).fill("09:30");
    await dialog.getByLabel("업무 마감 시간", { exact: true }).press("Tab");
    await selectOption(dialog, "업무 진행률 설정", "수동 설정");
    await dialog.getByLabel("업무 진행률", { exact: true }).fill("0");
    await dialog.getByLabel("업무 WBS 코드", { exact: true }).fill("QA.KEPT");
    await dialog.getByLabel("업무 정렬 순서", { exact: true }).fill("8");
    await disclosure.click();
    await expect(disclosure).toHaveAttribute("aria-expanded", "false");
    await expect(disclosure).toContainText("설정됨");
    await expect(dialog.getByLabel("업무 WBS 코드", { exact: true })).toHaveCount(0);
    await disclosure.click();
    await expect(dialog.getByLabel("업무 실적 시작일", { exact: true })).toHaveValue(/09\.10/);
    await expect(dialog.getByLabel("업무 실적 종료일", { exact: true })).toHaveValue(/09\.12/);
    await expect(dialog.getByLabel("업무 마감 날짜", { exact: true })).toHaveValue(/09\.13/);
    await expect(dialog.getByLabel("업무 마감 시간", { exact: true })).toHaveValue("09:30");
    await expect(dialog.getByRole("button", { name: "업무 진행률 설정", exact: true })).toContainText("수동 설정");
    await expect(dialog.getByLabel("업무 진행률", { exact: true })).toHaveValue("0");
    await expect(dialog.getByLabel("업무 WBS 코드", { exact: true })).toHaveValue("QA.KEPT");
    await expect(dialog.getByLabel("업무 정렬 순서", { exact: true })).toHaveValue("8");
    await disclosure.click();
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const body = api.requests.find((request) => request.method === "POST" && request.path === "/company-projects/901/work-items")!.body;
    expect(body).toMatchObject({
      title: "QA 접힌 상세 설정 업무", actual_start_date: "2026-09-10", actual_end_date: "2026-09-12",
      due_datetime: "2026-09-13T00:30:00.000Z", wbs_code: "QA.KEPT", sort_order: 8, progress_percent: 0,
    });
    expect(api.workItems.find((item) => item.title === "QA 접힌 상세 설정 업무")?.progress_override_percent).toBe(0);
  });

  test("자동 계산 생성은 진행률을 생략하고 수동 0% 생성은 명시적인 0을 전달한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    for (const manual of [false, true]) {
      await page.getByRole("button", { name: "업무 추가", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "업무 추가", exact: true });
      const title = manual ? "QA 수동 영 진행률" : "QA 자동 계산 진행률";
      await dialog.getByLabel("업무명", { exact: true }).fill(title);
      await advancedSettings(dialog).click();
      await expect(dialog.getByRole("button", { name: "업무 진행률 설정", exact: true })).toContainText("자동 계산");
      await expect(dialog.getByLabel("업무 진행률", { exact: true })).toHaveCount(0);
      await dialog.getByLabel("업무 마감 시간", { exact: true }).focus();
      await dialog.getByLabel("업무 WBS 코드", { exact: true }).focus();
      if (manual) {
        await selectOption(dialog, "업무 진행률 설정", "수동 설정");
        await dialog.getByLabel("업무 진행률", { exact: true }).fill("0");
      }
      await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const body = api.requests.find((request) => request.method === "POST" && request.body.title === title)!.body;
      if (manual) expect(body).toHaveProperty("progress_percent", 0);
      else expect(body).not.toHaveProperty("progress_percent");
      expect(body).not.toHaveProperty("progress_override_percent");
      expect(body).toHaveProperty("due_datetime", null);
      expect(api.workItems.find((item) => item.title === title)?.progress_override_percent).toBe(manual ? 0 : null);
    }
  });

  test("하위 업무의 접힌 상세 설정을 수정하지 않으면 기존 값과 부모·단계 ID를 PATCH에서 제외하고 유지한다", async ({ page }) => {
    api = await installWorkApi(page);
    const item = api.workItems.find((entry) => entry.company_project_work_item_id === 511)!;
    const advanced = {
      actual_start_date: "2026-09-10", actual_end_date: "2026-09-12", due_datetime: "2026-09-13T00:30:45+00:00",
      wbs_code: "QA.EXISTING", sort_order: 11, progress_percent: 37, progress_override_percent: 0,
      parent_work_item_id: 501, company_project_phase_id: 501,
    };
    Object.assign(item, advanced);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
    await rowTitle(page, "QA 인증 시스템").click();
    const dialog = await editResource(page, "QA 인증 시스템");
    await expect(advancedSettings(dialog)).toHaveAttribute("aria-expanded", "false");
    await expect(advancedSettings(dialog)).toContainText("설정됨");
    await expect(dialog.getByRole("button", { name: "소속 위치 선택", exact: true })).toContainText("QA 백엔드 개발");
    await expect(dialog.getByRole("button", { name: "소속 위치 선택", exact: true })).toContainText("QA 구현 단계");
    await advancedSettings(dialog).click();
    await expect(dialog.getByRole("button", { name: "업무 진행률 설정", exact: true })).toContainText("수동 설정");
    // Use the override, including explicit zero, rather than the separate server aggregate.
    await expect(dialog.getByLabel("업무 진행률", { exact: true })).toHaveValue("0");
    await advancedSettings(dialog).click();
    await expect(dialog.getByLabel("업무 WBS 코드", { exact: true })).toHaveCount(0);
    await dialog.getByLabel("업무명", { exact: true }).fill("QA 이름만 수정한 하위 업무");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(api.requests.find((request) => request.method === "PATCH" && request.path === "/company-projects/901/work-items/511")?.body)
      .toEqual({ title: "QA 이름만 수정한 하위 업무" });
    expect(item).toMatchObject(advanced);
  });

  test("수동 0%를 자동 계산으로 전환할 때 override null만 보내고 서버 진행률은 유지한다", async ({ page }) => {
    api = await installWorkApi(page);
    const item = api.workItems.find((entry) => entry.company_project_work_item_id === 501)!;
    item.progress_override_percent = 0;
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    const dialog = await editResource(page, "QA 백엔드 개발");
    await advancedSettings(dialog).click();
    await expect(dialog.getByLabel("업무 진행률", { exact: true })).toHaveValue("0");
    await selectOption(dialog, "업무 진행률 설정", "자동 계산");
    await expect(dialog.getByLabel("업무 진행률", { exact: true })).toHaveCount(0);
    await advancedSettings(dialog).click();
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(api.requests.find((request) => request.method === "PATCH" && request.path === "/company-projects/901/work-items/501")?.body)
      .toEqual({ progress_override_percent: null });
    expect(item.progress_override_percent).toBeNull();
    expect(item.progress_percent).toBe(37);
  });

  test("자동 0%를 수동으로 확정하면 0을 PATCH하고 자동으로 되돌리면 진행률 필드를 생략한다", async ({ page }) => {
    api = await installWorkApi(page);
    for (const id of [501, 502]) {
      Object.assign(api.workItems.find((item) => item.company_project_work_item_id === id)!, {
        progress_percent: 0, progress_override_percent: null,
      });
    }
    await page.goto("/projects/901");
    for (const commitManual of [true, false]) {
      const id = commitManual ? 501 : 502;
      const item = api.workItems.find((entry) => entry.company_project_work_item_id === id)!;
      await rowTitle(page, item.title).click();
      const dialog = await editResource(page, item.title);
      await advancedSettings(dialog).click();
      await expect(dialog.getByRole("button", { name: "업무 진행률 설정", exact: true })).toContainText("자동 계산");
      await expect(dialog.getByLabel("업무 진행률", { exact: true })).toHaveCount(0);
      await selectOption(dialog, "업무 진행률 설정", "수동 설정");
      await expect(dialog.getByLabel("업무 진행률", { exact: true })).toHaveValue("0");
      if (!commitManual) {
        await selectOption(dialog, "업무 진행률 설정", "자동 계산");
        await dialog.getByLabel("업무명", { exact: true }).fill("QA 자동 상태 유지 제목");
      }
      await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const body = api.requests.find((request) => request.method === "PATCH" && request.path === `/company-projects/901/work-items/${id}`)!.body;
      expect(body).toEqual(commitManual ? { progress_percent: 0 } : { title: "QA 자동 상태 유지 제목" });
      expect(item.progress_override_percent).toBe(commitManual ? 0 : null);
      expect(item.progress_percent).toBe(0);
      await page.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    }
  });

  test("단계의 기존 실적 날짜와 정렬 순서는 상세 설정을 접은 수정에서도 유지한다", async ({ page }) => {
    api = await installWorkApi(page);
    const phase = api.phases.find((entry) => entry.company_project_phase_id === 501)!;
    const advanced = { actual_start_date: "2026-09-10", actual_end_date: "2026-09-12", sort_order: 9 };
    Object.assign(phase, advanced);
    await page.goto("/projects/901");
    const dialog = await editResource(page, "QA 구현 단계", true);
    await expect(advancedSettings(dialog)).toHaveAttribute("aria-expanded", "false");
    await expect(advancedSettings(dialog)).toContainText("설정됨");
    await advancedSettings(dialog).click();
    await expect(dialog.getByLabel("단계 실적 시작일", { exact: true })).toHaveValue(/09\.10/);
    await advancedSettings(dialog).click();
    await dialog.getByLabel("단계명", { exact: true }).fill("QA 이름만 수정한 단계");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(api.requests.find((request) => request.method === "PATCH" && request.path === "/company-projects/901/phases/501")?.body)
      .toEqual({ name: "QA 이름만 수정한 단계" });
    expect(phase).toMatchObject(advanced);
    expect(api.workItems.find((item) => item.company_project_work_item_id === 501)?.company_project_phase_id).toBe(501);
  });

  test("접힌 상세 설정의 잘못된 실적 날짜는 영역을 펼쳐 표시하며 입력을 보존한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await dialog.getByLabel("업무명", { exact: true }).fill("QA 상세 날짜 검증 업무");
    await advancedSettings(dialog).click();
    await fillDate(dialog, "업무 실적 시작일", "2026-09-13");
    await fillDate(dialog, "업무 실적 종료일", "2026-09-11");
    await dialog.getByLabel("업무 WBS 코드", { exact: true }).fill("QA.RETRY");
    await advancedSettings(dialog).click();
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expectFieldError(dialog, "업무 실적 종료일", "실적 종료일은 시작일과 같거나 이후여야 합니다.");
    await expect(advancedSettings(dialog)).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.getByLabel("업무 WBS 코드", { exact: true })).toHaveValue("QA.RETRY");
    await expect(dialog.getByLabel("업무 실적 시작일", { exact: true })).toHaveValue(/09\.13/);
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(0);
    await fillDate(dialog, "업무 실적 종료일", "2026-09-14");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(api.workItems.find((item) => item.title === "QA 상세 날짜 검증 업무"))
      .toMatchObject({ actual_start_date: "2026-09-13", actual_end_date: "2026-09-14", wbs_code: "QA.RETRY" });
  });

  test("단계·업무 날짜 X는 해당 날짜만 지우고 작은 화면에서 상세 폼을 스크롤해도 제목과 저장 버튼은 유지한다", async ({ page }, testInfo) => {
    api = await installWorkApi(page);
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 560 });
    await page.goto("/projects/901");
    for (const kind of ["단계", "업무"]) {
      const name = `${kind} 추가`;
      await page.getByRole("button", { name, exact: true }).click();
      const dialog = page.getByRole("dialog", { name, exact: true });
      await fillDate(dialog, `${kind} 계획 시작일`, "2026-09-10");
      await fillDate(dialog, `${kind} 계획 종료일`, "2026-09-12");
      await fillDate(dialog, `${kind} 계획 시작일`, "");
      await expect(dialog.getByLabel(`${kind} 계획 시작일`, { exact: true })).toHaveValue("날짜 선택");
      await expect(dialog.getByLabel(`${kind} 계획 시작일`, { exact: true })).toHaveAttribute("aria-expanded", "false");
      await expect(dialog.getByLabel(`${kind} 계획 종료일`, { exact: true })).toHaveValue(/09\.12/);
      await expect(dialog.locator(".schedule-date-popover")).toHaveCount(0);
      await testInfo.attach(`${kind}-create-collapsed`, { body: await page.screenshot(), contentType: "image/png" });
      await advancedSettings(dialog).click();
      const fields = dialog.locator("[data-project-work-fields]");
      const title = dialog.getByRole("heading", { name, exact: true });
      const save = dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true });
      const beforeTitle = await title.boundingBox();
      const beforeSave = await save.boundingBox();
      const scroll = await fields.evaluate((element) => ({
        clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, overflowY: getComputedStyle(element).overflowY,
      }));
      expect(["auto", "scroll"]).toContain(scroll.overflowY);
      expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
      await fields.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect.poll(() => fields.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      await testInfo.attach(`${kind}-create-expanded`, { body: await page.screenshot(), contentType: "image/png" });
      const afterTitle = await title.boundingBox();
      const afterSave = await save.boundingBox();
      expect(Math.abs(afterTitle!.y - beforeTitle!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(afterSave!.y - beforeSave!.y)).toBeLessThanOrEqual(1);
      expect(afterTitle!.y).toBeGreaterThanOrEqual(0);
      expect(afterSave!.y + afterSave!.height).toBeLessThanOrEqual(560);
      await expect(save).toBeInViewport();
      await expectNoPageOverflow(page);
      await cancelForm(page, dialog);
      await expect(dialog).toHaveCount(0);
    }
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("라이트·다크 단계·업무 모달의 드롭다운은 폼 안에 배치되고 키보드 선택과 Escape를 지원한다", async ({ page }, testInfo) => {
    api = await installWorkApi(page);
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 560 });
    await page.goto("/projects/901");
    const colors: Record<string, { background: string; foreground: string; menuBackground: string; menuForeground: string }> = {};
    for (const theme of ["light", "dark"] as const) {
      await page.evaluate((theme) => {
        localStorage.setItem("flowra:user-settings", JSON.stringify({ theme }));
      }, theme);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-resolved-theme", theme);
      for (const kind of ["단계", "업무"]) {
        const name = `${kind} 추가`;
        await page.getByRole("button", { name, exact: true }).click();
        const dialog = page.getByRole("dialog", { name, exact: true });
        await advancedSettings(dialog).click();
        const label = `${kind} 상태 선택`;
        const trigger = dialog.getByRole("button", { name: label, exact: true });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.press("ArrowDown");
        const menu = dialog.getByRole("listbox", { name: label, exact: true });
        await expect(menu.getByRole("option", { name: "대기", exact: true })).toBeFocused();
        await expectWorkMenuInsideFields(dialog, label);
        colors[`${theme}-${kind}`] = await menu.evaluate((element) => {
          const dialogStyle = getComputedStyle(element.closest('[role="dialog"]')!);
          const menuStyle = getComputedStyle(element);
          return {
            background: dialogStyle.backgroundColor, foreground: dialogStyle.color,
            menuBackground: menuStyle.backgroundColor, menuForeground: menuStyle.color,
          };
        });
        const screenshotPath = testInfo.outputPath(`${theme}-${kind}-work-form-menu.png`);
        await page.screenshot({ path: screenshotPath, animations: "disabled" });
        await testInfo.attach(`${theme}-${kind}-work-form-menu`, { path: screenshotPath, contentType: "image/png" });
        await page.keyboard.press("ArrowDown");
        await expect(menu.getByRole("option", { name: "진행 중", exact: true })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(menu).toHaveCount(0);
        await expect(trigger).toContainText("진행 중");
        await expect(trigger).toBeFocused();
        const labels = kind === "업무"
          ? [label, "업무 우선순위 선택", "업무 진행률 설정"]
          : [label];
        for (const currentLabel of labels) {
          const currentTrigger = dialog.getByRole("button", { name: currentLabel, exact: true });
          await currentTrigger.click();
          await expectWorkMenuInsideFields(dialog, currentLabel);
          await page.keyboard.press("Escape");
          await expect(dialog.getByRole("listbox", { name: currentLabel, exact: true })).toHaveCount(0);
          await expect(dialog).toBeVisible();
          await expect(currentTrigger).toBeFocused();
        }
        await expectNoPageOverflow(page);
        await cancelForm(page, dialog);
        await expect(dialog).toHaveCount(0);
      }
    }
    for (const kind of ["단계", "업무"]) {
      const light = colors[`light-${kind}`];
      const dark = colors[`dark-${kind}`];
      expect(dark.background).not.toBe(light.background);
      expect(dark.foreground).not.toBe(light.foreground);
      expect(dark.menuBackground).not.toBe(light.menuBackground);
      expect(dark.menuForeground).not.toBe(light.menuForeground);
    }
    await testInfo.attach("phase-work-modal-theme-colors", { body: JSON.stringify(colors, null, 2), contentType: "application/json" });
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("마감 날짜·시간의 일부 입력과 잘못된 시간은 저장을 막고 유효한 완성 입력만 UTC로 저장한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await dialog.getByLabel("업무명", { exact: true }).fill("QA 마감 일시 검증 업무");
    await advancedSettings(dialog).click();
    await fillDate(dialog, "업무 마감 날짜", "2026-09-13");
    await dialog.getByLabel("업무 마감 시간", { exact: true }).fill("invalid");
    await dialog.getByLabel("업무 마감 시간", { exact: true }).press("Tab");
    await expect(dialog.getByLabel("업무 마감 시간", { exact: true })).toHaveValue("시간 선택");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expectFieldError(dialog, "업무 마감 시간", "마감 날짜와 시간을 모두 입력해 주세요.");
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(0);
    await dialog.getByLabel("업무 마감 시간", { exact: true }).fill("09:30");
    await dialog.getByLabel("업무 마감 시간", { exact: true }).press("Tab");
    await fillDate(dialog, "업무 마감 날짜", "");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expectFieldError(dialog, "업무 마감 날짜", "마감 날짜와 시간을 모두 입력해 주세요.");
    await expect(dialog.getByLabel("업무 마감 시간", { exact: true })).toHaveValue("09:30");
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(0);
    await fillDate(dialog, "업무 마감 날짜", "2026-09-13");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(api.requests.find((request) => request.method === "POST" && request.body.title === "QA 마감 일시 검증 업무")?.body)
      .toHaveProperty("due_datetime", "2026-09-13T00:30:00.000Z");
  });

  test("backend depth4의 하위 생성은 가능하고 backend depth5에서는 하위 생성 버튼을 제한한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
    await rowTitle(page, "QA JWT 발급").click();
    await panel(page).locator("summary").filter({ hasText: "추가 정보" }).click();
    await expect(panel(page).getByText("D5", { exact: true })).toBeVisible();
    await panel(page).getByRole("button", { name: "하위 업무 추가", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await dialog.getByLabel("업무명", { exact: true }).fill("QA 최대 깊이 업무");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await panel(page).getByRole("button", { name: /^QA 최대 깊이 업무/ }).click();
    await panel(page).locator("summary").filter({ hasText: "추가 정보" }).click();
    await expect(panel(page).getByText("D6", { exact: true })).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "하위 업무 추가", exact: true })).toBeDisabled();
    const deepest = api.workItems.find((item) => item.title === "QA 최대 깊이 업무")!;
    expect(deepest.depth_level).toBe(5);
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(1);
  });

  test("상세 기본 정보는 양쪽·한쪽·미정 기간과 서버 진행률 0%를 하나의 항목으로 표시한다", async ({ page }) => {
    api = await installWorkApi(page);
    const cases = [
      { start: null, end: null, expected: "미정", progress: 0 },
      { start: "2026-09-10", end: null, expected: "2026.09.10 ~ 종료일 미정", progress: 37 },
      { start: null, end: "2026-09-20", expected: "시작일 미정 ~ 2026.09.20", progress: 60 },
      { start: "2026-09-10", end: "2026-09-20", expected: "2026.09.10 ~ 2026.09.20", progress: 100 },
    ];
    for (const [index, value] of cases.entries())
      api.workItems.push(work(8500 + index, `QA 간결한 기본 정보 ${index}`, {
        planned_start_date: value.start,
        planned_end_date: value.end,
        progress_percent: value.progress,
        progress_override_percent: index === 0 ? 0 : null,
        description: null,
      }));
    await page.goto("/projects/901");
    for (const [index, value] of cases.entries()) {
      await rowTitle(page, `QA 간결한 기본 정보 ${index}`).click();
      const detail = panel(page);
      const basic = detail.getByLabel("업무 기본 정보", { exact: true });
      const period = basic.locator("dt").filter({ hasText: /^계획 기간$/ });
      await expect(period).toHaveCount(1);
      await expect(period.locator("..").locator("dd")).toHaveText(value.expected);
      await expect(basic.locator("dt").filter({ hasText: /^계획 (시작|종료)일$/ })).toHaveCount(0);
      if (index === 0)
        await expect(basic.locator("dt").filter({ hasText: /^일정 상태$/ })).toHaveCount(0);
      const progress = basic.locator(".work-panel-progress");
      await expect(progress.getByText(`${value.progress}%`, { exact: true })).toHaveCount(1);
      await expect(progress.getByRole("progressbar", { name: "업무 진행률", exact: true })).toHaveAttribute("aria-valuenow", String(value.progress));
      await expect(detail.getByText("설명 없음", { exact: true })).toHaveCount(1);
      await expect(detail.getByText("하위 업무 없음", { exact: true })).toHaveCount(1);
      await expect(detail.getByText(/지연 0건/)).toHaveCount(0);
      await detail.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    }
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("조회 전용 권한과 마스킹된 담당자 ID0을 올바르게 표시한다", async ({ page }) => {
    api = await installWorkApi(page, { readOnly: true });
    api.assignments[0].assignee_company_member_id = 0;
    await page.goto("/projects/901");
    await expect(page.getByRole("button", { name: "업무 추가", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "단계 추가", exact: true })).toHaveCount(0);
    await rowTitle(page, "QA 백엔드 개발").click();
    await expect(panel(page).getByText("담당자 정보 비공개", { exact: true })).toBeVisible();
    await expect(panel(page).getByText("구성원 0", { exact: true })).toHaveCount(0);
    await expect(panel(page).getByRole("button", { name: "하위 업무 추가", exact: true })).toHaveCount(0);
    await expect(panel(page).getByRole("button", { name: "업무 수정", exact: true })).toHaveCount(0);
    await expect(panel(page).getByRole("button", { name: "QA 백엔드 개발 더 보기", exact: true })).toHaveCount(0);
    expect(api.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("역전 날짜는 쓰기 전에 검증하고 서버403 수정 실패는 기존 업무를 보존한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    const dialog = await editResource(page, "QA 백엔드 개발");
    await fillDate(dialog, "업무 계획 시작일", "2026-09-25");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expectFieldError(dialog, "업무 계획 종료일", "계획 종료일은 시작일과 같거나 이후여야 합니다.");
    expect(api.requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
    await fillDate(dialog, "업무 계획 시작일", "2026-09-10");
    await dialog.getByLabel("업무명", { exact: true }).fill("QA 금지된 업무 수정");
    api.failures.set("PATCH /company-projects/901/work-items/501", { status: 403, code: "PROJECT_MANAGEMENT_FORBIDDEN", message: "프로젝트 관리 권한이 없습니다." });
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    expect(api.workItems.find((item) => item.company_project_work_item_id === 501)?.title).toBe("QA 백엔드 개발");
    await cancelForm(page, dialog);
    await expect(panel(page)).toContainText("QA 백엔드 개발 설명");
  });

  test("저장 실패 후 상세·권한 재조회가 일시 실패해도 입력을 보존하고 권한 복구 후 저장하며 실제403은 편집을 종료한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    let form = await editResource(page, "QA 백엔드 개발");
    const title = form.getByLabel("업무명", { exact: true });
    await title.fill("QA 실패 후 보존한 수정");
    const update = "PATCH /company-projects/901/work-items/501";
    const detail = "GET /company-projects/901";
    const permission = "GET /company-projects/901/members";
    for (const key of [update, detail, permission])
      api.failures.set(key, { status: 503, code: "INTERNAL_ERROR", message: "QA 일시적인 서버 오류" });
    await form.getByRole("button", { name: "저장", exact: true }).click();
    await expect(form.getByRole("button", { name: "권한 다시 확인", exact: true })).toBeVisible();
    await expect(title).toHaveValue("QA 실패 후 보존한 수정");
    await expect(title).toBeDisabled();
    await expect(form.getByRole("button", { name: "저장", exact: true })).toBeDisabled();
    const refreshError = page.locator('.projects-work-page [role="alert"]').filter({ hasText: "프로젝트를 불러오지 못했습니다" });
    await expect(refreshError).toBeVisible();
    await expect(refreshError).toContainText("QA 일시적인 서버 오류");
    await expect(page.locator(".project-work-panel")).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
    expect(api.workItems[0].title).toBe("QA 백엔드 개발");
    for (const key of [update, detail, permission]) api.failures.delete(key);
    await form.getByRole("button", { name: "권한 다시 확인", exact: true }).click();
    await expect(form.getByRole("button", { name: "저장", exact: true })).toBeEnabled();
    await expect(title).toHaveValue("QA 실패 후 보존한 수정");
    await form.getByRole("button", { name: "저장", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(panel(page)).toHaveAttribute("data-panel-mode", "docked");
    await expect(panel(page).getByRole("heading", { name: "QA 실패 후 보존한 수정", exact: true })).toBeVisible();
    expect(api.requests.filter((request) => request.method === "PATCH").map((request) => request.body))
      .toEqual([{ title: "QA 실패 후 보존한 수정" }, { title: "QA 실패 후 보존한 수정" }]);
    form = await editResource(page, "QA 실패 후 보존한 수정");
    await form.getByLabel("업무명", { exact: true }).fill("QA 권한이 해제된 수정");
    for (const key of [update, permission])
      api.failures.set(key, { status: 403, code: "PROJECT_MANAGEMENT_FORBIDDEN", message: "프로젝트 관리 권한이 없습니다." });
    await form.getByRole("button", { name: "저장", exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect(panel(page).getByRole("button", { name: "QA 실패 후 보존한 수정 더 보기", exact: true })).toHaveCount(0);
    await expect(page.locator(".project-work-panel")).toHaveJSProperty("inert", false);
    expect(api.workItems[0].title).toBe("QA 실패 후 보존한 수정");
    await panel(page).getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("생성 응답의 성공 여부가 불명확하면 같은 창에서 다시 POST하지 않는다", async ({ page }) => {
    api = await installWorkApi(page);
    api.failures.set("POST /company-projects/901/work-items", { status: 503, code: "INTERNAL_SERVER_ERROR", message: "QA 응답 유실" });
    await page.goto("/projects/901");
    await page.getByRole("button", { name: "업무 추가", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "업무 추가", exact: true });
    await dialog.getByLabel("업무명", { exact: true }).fill("QA 확인 필요한 업무");
    await dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("목록을 새로고침하여 추가 여부를 확인해 주세요.");
    await expect(dialog.getByRole("button", { name: /^(저장|업무 추가|단계 추가)$/, exact: true })).toBeDisabled();
    expect(api.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    await cancelForm(page, dialog);
  });

  test("부분 트리는 필요한 직계 자식만 조회하고 중복 요청·행을 막고 접기 후 캐시를 재사용한다", async ({
    page,
  }, testInfo) => {
    api = await installWorkApi(page, { partial: true });
    const gate = deferred();
    const childPath = "/company-projects/901/work-items/501/children";
    api.gates.set(`GET ${childPath}`, gate.promise);
    await page.goto("/projects/901");
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeVisible();
    await expect(page.getByText(/^불러온 업무명에서 검색·필터합니다\./)).toBeVisible();
    expect(
      api.requests.filter((request) => request.path.endsWith("/children")),
    ).toHaveLength(0);
    if (page.viewportSize()!.width <= 700) {
      await attachLayout(page, testInfo, "phased-before-expand");
      await page
        .getByRole("button", {
          name: "QA 백엔드 개발 하위 업무 펼치기",
          exact: true,
        })
        .scrollIntoViewIfNeeded();
      await attachLayout(page, testInfo, "phased-after-scroll-before-expand");
    }
    await page
      .getByRole("button", {
        name: "QA 백엔드 개발 하위 업무 펼치기",
        exact: true,
      })
      .click();
    await expect
      .poll(
        () =>
          api.requests.filter((request) => request.path === childPath).length,
      )
      .toBe(1);
    expect(
      api.requests.find((request) => request.path === childPath)?.query,
    ).toEqual({ depth: "1" });
    await rowTitle(page, "QA 백엔드 개발").click();
    await expect(panel(page)).toBeVisible();
    gate.release();
    await expect(
      panel(page).getByRole("button", { name: /^QA 인증 시스템/ }),
    ).toHaveCount(1);
    await page
      .getByRole("button", { name: "업무 상세 닫기", exact: true })
      .click();
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(1);
    await page
      .getByRole("button", {
        name: "QA 백엔드 개발 하위 업무 접기",
        exact: true,
      })
      .click();
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "QA 백엔드 개발 하위 업무 펼치기",
        exact: true,
      })
      .click();
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(1);
    expect(
      api.requests.filter((request) => request.path === childPath),
    ).toHaveLength(1);
    await page.getByRole("button", { name: "전체 접기", exact: true }).click();
    await page
      .getByRole("button", { name: "불러온 업무 펼치기", exact: true })
      .click();
    await expect(rowTitle(page, "QA 인증 시스템")).toBeVisible();
    expect(
      api.requests.filter((request) => request.path.endsWith("/children")),
    ).toHaveLength(1);
  });

  test("하위 업무 조회 실패를 표시하고 명시적 재시도 후 트리를 복구한다", async ({
    page,
  }) => {
    api = await installWorkApi(page, { partial: true });
    const path = "/company-projects/901/work-items/501/children";
    api.failures.set(`GET ${path}`, {
      status: 503,
      code: "INTERNAL_ERROR",
      message: "QA 하위 업무 조회 실패",
    });
    await page.goto("/projects/901");
    await page
      .getByRole("button", {
        name: "QA 백엔드 개발 하위 업무 펼치기",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "QA 하위 업무 조회 실패" }),
    ).toBeVisible();
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(0);
    api.failures.delete(`GET ${path}`);
    await page
      .getByRole("button", { name: "하위 업무 다시 시도", exact: true })
      .click();
    await expect(rowTitle(page, "QA 인증 시스템")).toBeVisible();
    expect(
      api.requests.filter((request) => request.path === path),
    ).toHaveLength(2);
  });

  test("검색·상태·우선순위·단계 필터는 로드한 범위만 사용하고 Phase를 업무와 구별한다", async ({
    page,
  }) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeVisible();
    await expect(
      page.getByText(/^전체 업무명에서 검색·필터합니다\./),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "전체 펼치기", exact: true })
      .click();
    await expect(rowTitle(page, "QA JWT 발급")).toHaveCount(1);
    await rowTitle(page, "QA JWT 발급").click();
    await panel(page).locator("summary").filter({ hasText: "추가 정보" }).click();
    await expect(panel(page).getByText("D5", { exact: true })).toBeVisible();
    await expect(
      panel(page).getByRole("button", {
        name: "하위 업무 추가",
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "업무 상세 닫기", exact: true })
      .click();
    await selectOption(page, "업무 상태", "대기");
    await expect(rowTitle(page, "QA 운영 검토")).toBeVisible();
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveCount(0);
    await selectOption(page, "업무 상태", "전체 상태");
    await selectOption(page, "업무 우선순위", "높음");
    await expect(rowTitle(page, "QA 운영 검토")).toHaveCount(0);
    await selectOption(page, "업무 우선순위", "전체 우선순위");
    await selectOption(page, "Phase 선택", "QA 운영 단계");
    await expect(rowTitle(page, "QA 운영 검토")).toBeVisible();
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveCount(0);
    await selectOption(page, "Phase 선택", "전체 단계");
    await page
      .getByRole("textbox", { name: "업무 검색", exact: true })
      .fill("로그인");
    await expect(rowTitle(page, "QA 로그인 API")).toBeVisible();
    expect(
      api.requests.filter((request) => request.path.endsWith("/children")),
    ).toHaveLength(0);
  });

  test("통합 필터는 조건 수와 상위 경로를 유지하고 초기화해도 하위 업무를 추가 조회하지 않는다", async ({ page }) => {
    api = await installWorkApi(page, { partial: true });
    await page.goto("/projects/901");
    await expect(page.getByText(/^불러온 업무명에서 검색·필터합니다\./)).toBeVisible();
    const filterTrigger = page.getByRole("button", { name: "업무 필터", exact: true });
    await filterTrigger.click();
    await page.getByRole("button", { name: "업무 상태", exact: true }).click();
    await expect(page.getByRole("listbox", { name: "업무 상태", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("listbox", { name: "업무 상태", exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "업무 필터 조건", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "업무 필터 조건", exact: true })).toHaveCount(0);
    await expect(filterTrigger).toBeFocused();
    await page.getByRole("button", { name: "불러온 업무 펼치기", exact: true }).click();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    const search = page.getByRole("textbox", { name: "업무 검색", exact: true });
    await search.fill("인증");
    await expect(page.getByText("현재 불러온 업무 중 검색 조건에 맞는 업무가 없습니다.", { exact: true })).toBeVisible();
    await expect(page.getByText("등록된 업무가 없습니다.", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "검색 해제", exact: true }).click();
    await expect(search).toBeFocused();
    await page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 펼치기", exact: true }).click();
    await expect(rowTitle(page, "QA 인증 시스템")).toBeVisible();
    await selectOption(page, "업무 상태", "진행 중");
    await selectOption(page, "업무 우선순위", "높음");
    await selectOption(page, "Phase 선택", "QA 구현 단계");
    await expect(page.getByRole("button", { name: "업무 필터", exact: true })).toContainText("3");
    await expect(rowTitle(page, "QA 운영 검토")).toHaveCount(0);
    await search.fill("인증");
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeVisible();
    await expect(rowTitle(page, "QA 인증 시스템")).toBeVisible();
    await expect(page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 접기", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "우선순위 필터 해제", exact: true }).click();
    await expect(search).toBeFocused();
    await expect(page.getByRole("button", { name: "업무 필터", exact: true })).toContainText("2");
    await page.getByRole("button", { name: "업무 필터 초기화", exact: true }).click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await expect(page.getByRole("button", { name: "상태 필터 해제", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "단계 필터 해제", exact: true })).toHaveCount(0);
    await expect(rowTitle(page, "QA 운영 검토")).toBeVisible();
    await expect(rowTitle(page, "QA 인증 시스템")).toBeVisible();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(1);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
    await expectNoPageOverflow(page);
  });

  test("필터 팝오버 안의 초기화는 완료 버튼으로 포커스를 옮기고 닫을 때 필터 버튼을 복구한다", async ({ page }) => {
    api = await installWorkApi(page, { partial: true });
    await page.goto("/projects/901");
    await selectOption(page, "업무 상태", "진행 중");
    const trigger = page.getByRole("button", { name: "업무 필터", exact: true });
    await trigger.click();
    const conditions = page.getByRole("dialog", { name: "업무 필터 조건", exact: true });
    await conditions.getByRole("button", { name: "초기화", exact: true }).click();
    const done = conditions.getByRole("button", { name: "완료", exact: true });
    await expect(done).toBeFocused();
    await expect(conditions.getByRole("button", { name: "초기화", exact: true })).toBeDisabled();
    await expect(conditions.getByRole("button", { name: "업무 상태", exact: true })).toContainText("전체 상태");
    await done.click();
    await expect(trigger).toBeFocused();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("full 정책이어도 전체 업무 수가 일치하지 않으면 검색 범위와 새로고침을 안내하고 추가 조회하지 않는다", async ({ page }) => {
    api = await installWorkApi(page, { incompleteFull: true });
    await page.goto("/projects/901");
    const scope = page.getByText(/^불러온 업무명에서 검색·필터합니다\./);
    await expect(scope).toBeVisible();
    await expect(scope).toContainText("조회 정보가 완전하지 않습니다. 새로고침으로 확인해 주세요.");
    await expect(scope).not.toContainText("하위 업무는 펼칠 때 불러옵니다.");
    await expect(page.getByText(/^전체 업무명에서 검색·필터합니다\./)).toHaveCount(0);
    await page.getByRole("button", { name: "불러온 업무 펼치기", exact: true }).click();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    await page.getByRole("textbox", { name: "업무 검색", exact: true }).fill("인증");
    await expect(page.getByText("현재 불러온 업무 중 검색 조건에 맞는 업무가 없습니다.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "검색 및 필터 초기화", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "업무 검색", exact: true })).toBeFocused();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("부분 조회에 업무가 없으면 불러온 업무가 없다고 안내하며 등록 업무가 없다고 확정하지 않는다", async ({ page }) => {
    api = await installWorkApi(page, { partial: true });
    api.workItems.splice(0);
    await page.goto("/projects/901");
    await expect(page.getByText(/^불러온 업무명에서 검색·필터합니다\./)).toBeVisible();
    await expect(page.getByText("현재 불러온 업무가 없습니다.", { exact: true })).toBeVisible();
    await expect(page.getByText("등록된 업무가 없습니다.", { exact: true })).toHaveCount(0);
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("전체 건수 요약이 없어도 반환 업무 수가 일치하지 않으면 검색 범위를 제한한다", async ({ page }) => {
    api = await installWorkApi(page, { returnedCountMismatch: true });
    await page.goto("/projects/901");
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeVisible();
    await expect(rowTitle(page, "QA 운영 검토")).toBeVisible();
    const scope = page.getByText(/^불러온 업무명에서 검색·필터합니다\./);
    await expect(scope).toBeVisible();
    await expect(scope).toContainText("조회 정보가 완전하지 않습니다. 새로고침으로 확인해 주세요.");
    await expect(page.getByText(/^전체 업무명에서 검색·필터합니다\./)).toHaveCount(0);
    await page.getByRole("button", { name: "불러온 업무 펼치기", exact: true }).click();
    await expect(rowTitle(page, "QA JWT 발급")).toBeVisible();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("full 정책의 계층 정보 오류는 검색 경로 경고를 표시하고 업무 설명을 업무명 검색에 섞지 않는다", async ({ page }) => {
    api = await installWorkApi(page);
    const item = api.workItems.find((work) => work.company_project_work_item_id === 502)!;
    item.parent_work_item_id = 9999;
    item.description = "QA 설명에만 존재하는 검색어";
    await page.goto("/projects/901");
    await expect(page.getByText(/^불러온 업무명에서 검색·필터합니다\./)).toBeVisible();
    await expect(page.getByText("계층 정보에 오류가 있어 상위 경로가 완전하지 않을 수 있습니다.", { exact: true })).toBeVisible();
    await expect(page.getByText(/^전체 업무명에서 검색·필터합니다\./)).toHaveCount(0);
    await expect(rowTitle(page, item.title)).toBeVisible();
    await page.getByRole("textbox", { name: "업무 검색", exact: true }).fill("설명에만 존재하는");
    await expect(rowTitle(page, item.title)).toHaveCount(0);
    await expect(page.getByText("현재 불러온 업무 중 검색 조건에 맞는 업무가 없습니다.", { exact: true })).toBeVisible();
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("긴 상세 제목과 설명이 있어도 작은 화면에서 본문 정보와 닫기 버튼에 접근할 수 있다", async ({ page }) => {
    const mobile = page.viewportSize()!.width <= 700;
    await page.setViewportSize(mobile ? { width: 320, height: 568 } : { width: 1280, height: 540 });
    api = await installWorkApi(page);
    const item = api.workItems.find((work) => work.company_project_work_item_id === 501)!;
    item.title = `QA 긴 상세 제목 ${"한글 제목이 계속 이어지는 업무 ".repeat(20)}`.slice(0, 200);
    item.description = "긴 설명에서도 본문 정보에 접근할 수 있습니다.\n".repeat(80);
    await page.goto("/projects/901");
    await rowTitle(page, "QA 긴 상세 제목").click();
    const detail = panel(page);
    await expect(detail).toBeVisible();
    const content = detail.locator(".work-panel-content");
    expect(await content.evaluate((element) => element.clientHeight)).toBeGreaterThan(120);
    const additional = detail.locator("summary").filter({ hasText: "추가 정보" });
    await additional.click();
    await expect(detail.getByText("WBS 코드", { exact: true })).toBeVisible();
    expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const close = detail.getByRole("button", { name: "업무 상세 닫기", exact: true });
    await close.click();
    await expect(detail).toHaveCount(0);
    await expect(rowTitle(page, "QA 긴 상세 제목")).toBeFocused();
    await expectNoPageOverflow(page);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("데스크톱 상세는 테이블 너비와 스크롤을 유지하며 다른 업무로 전환하고 닫은 뒤 선택을 보존한다", async ({ page }) => {
    test.skip(page.viewportSize()!.width <= 700, "모바일은 전체 화면 상세를 사용한다.");
    api = await installWorkApi(page);
    for (let index = 0; index < 24; index++)
      api.workItems.push(work(8000 + index, `QA 목록 스크롤 업무 ${index}`, { company_project_phase_id: 502 }));
    await page.addInitScript(() => localStorage.setItem("flowra-project-work-panel-layout", "floating"));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/projects/901");
    const tableScroll = page.locator(".work-table-scroll");
    await rowTitle(page, "QA 백엔드 개발").focus();
    await tableScroll.evaluate((element) => { element.scrollLeft = 24; element.scrollTop = 24; });
    const readTable = () => tableScroll.evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    }));
    const before = await readTable();
    expect(before.scrollTop).toBeGreaterThan(0);
    await page.keyboard.press("Enter");
    await expect(panel(page)).toContainText("QA 백엔드 개발 설명");
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    expect(await readTable()).toEqual(before);
    await rowTitle(page, "QA 운영 검토").click();
    await expect(panel(page)).toContainText("QA 운영 검토 설명");
    await expect(page.locator('[data-work-id="502"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "false");
    expect(await readTable()).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(rowTitle(page, "QA 운영 검토")).toBeFocused();
    await expect(page.locator('[data-work-id="502"]')).toHaveAttribute("aria-selected", "true");
    expect(await readTable()).toEqual(before);
    await expectNoPageOverflow(page);
  });

  test("업무 상세는 기본 도킹으로 오른쪽 공간을 예약하고 닫으면 프로젝트 화면 너비를 복구한다", async ({ page }, testInfo) => {
    api = await installWorkApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/projects/901");
    const header = page.locator(".projects-detail-header");
    const table = page.locator(".work-table-scroll");
    const headerWidth = await header.evaluate((element) => element.getBoundingClientRect().width);
    const tableWidth = await table.evaluate((element) => element.getBoundingClientRect().width);
    const notification = page.getByRole("button", { name: "알림", exact: true });
    const notificationRight = await notification.evaluate((element) => element.getBoundingClientRect().right);
    await rowTitle(page, "QA 백엔드 개발").click();
    const detail = page.getByRole("complementary", { name: "업무 상세", exact: true });
    await expect(detail).toHaveAttribute("data-panel-mode", "docked");
    await expect(detail.getByRole("button", { name: "업무 상세 도킹 해제", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(detail).toHaveCSS("border-radius", "0px");
    await expect.poll(async () => headerWidth - await header.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(380, 0);
    await expect.poll(async () => tableWidth - await table.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(380, 0);
    const bounds = await detail.boundingBox();
    expect(bounds!.width).toBeCloseTo(380, 0);
    expect(bounds!.x + bounds!.width).toBeCloseTo(1440, 0);
    expect(bounds!.y).toBeCloseTo(0, 0);
    expect(bounds!.y + bounds!.height).toBeCloseTo(900, 0);
    await expect.poll(async () => notificationRight - await notification.evaluate((element) => element.getBoundingClientRect().right)).toBeCloseTo(380, 0);
    const notificationBounds = await notification.boundingBox();
    expect(notificationBounds!.x + notificationBounds!.width).toBeLessThan(bounds!.x);
    await notification.click({ trial: true });
    for (const selector of [".projects-detail-nav", ".projects-detail-header", ".projects-detail-tabs", ".work-table-scroll"]) {
      const box = await page.locator(selector).boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + 1);
    }
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    await page.screenshot({ path: testInfo.outputPath("project-work-docked-sidebar.png") });
    await detail.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await expect.poll(() => header.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(headerWidth, 0);
    await expect.poll(() => table.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(tableWidth, 0);
    await expect.poll(() => notification.evaluate((element) => element.getBoundingClientRect().right)).toBeCloseTo(notificationRight, 0);
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
    await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
    await expectNoPageOverflow(page);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("도킹 전환은 선택·본문 스크롤·추가 정보·버튼 포커스를 유지하고 닫기와 새로고침 후 선호를 복구한다", async ({ page }) => {
    api = await installWorkApi(page);
    api.workItems[0].description = "QA 도킹 전환의 긴 설명\n".repeat(80);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/projects/901");
    const notification = page.getByRole("button", { name: "알림", exact: true });
    const notificationRight = await notification.evaluate((element) => element.getBoundingClientRect().right);
    await rowTitle(page, "QA 백엔드 개발").click();
    const detail = panel(page);
    await expect(detail).toHaveAttribute("data-panel-mode", "docked");
    const original = await detail.elementHandle();
    const additional = detail.locator("details.work-panel-additional");
    await additional.locator("summary").click();
    const content = detail.locator(".work-panel-content");
    await content.evaluate((element) => { element.scrollTop = 200; });
    const scrollTop = await content.evaluate((element) => element.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);
    await detail.getByRole("button", { name: "업무 상세 도킹 해제", exact: true }).click();
    await expect(detail).toHaveAttribute("data-panel-mode", "floating");
    await expect.poll(() => notification.evaluate((element) => element.getBoundingClientRect().right)).toBeCloseTo(notificationRight, 0);
    const dock = detail.getByRole("button", { name: "업무 상세 도킹", exact: true });
    await expect(dock).toHaveAttribute("aria-pressed", "false");
    await expect(dock).toBeFocused();
    expect(await detail.evaluate((element, previous) => element === previous, original)).toBe(true);
    await expect(additional).toHaveAttribute("open", "");
    expect(await content.evaluate((element) => element.scrollTop)).toBe(scrollTop);
    await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("flowra-project-work-panel-layout"))).toBe("floating");
    await detail.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await rowTitle(page, "QA 백엔드 개발").click();
    await expect(detail).toHaveAttribute("data-panel-mode", "floating");
    await page.reload();
    await rowTitle(page, "QA 백엔드 개발").click();
    await expect(detail).toHaveAttribute("data-panel-mode", "floating");
    await detail.getByRole("button", { name: "업무 상세 도킹", exact: true }).click();
    await expect(detail).toHaveAttribute("data-panel-mode", "docked");
    await expect(detail.getByRole("button", { name: "업무 상세 도킹 해제", exact: true })).toBeFocused();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("flowra-project-work-panel-layout"))).toBe("docked");
    await page.reload();
    await rowTitle(page, "QA 백엔드 개발").click();
    await expect(detail).toHaveAttribute("data-panel-mode", "docked");
    expect(api.requests.filter((request) => request.path.endsWith("/children"))).toHaveLength(0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  for (const preferredMode of ["docked", "floating"] as const) {
    test(`${preferredMode} 상세에서 수정 저장·취소·하위 생성을 마쳐도 선택과 목록 탐색 및 포커스를 유지한다`, async ({ page }) => {
      test.skip(page.viewportSize()!.width <= 700, "데스크톱의 비모달 상세와 폼 연결을 검증한다.");
      api = await installWorkApi(page, { partial: true });
      for (let index = 0; index < 32; index++)
        api.workItems.push(work(8000 + index, `QA 탐색 유지 업무 ${index}`));
      await page.addInitScript((mode) => localStorage.setItem("flowra-project-work-panel-layout", mode), preferredMode);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/projects/901");
      await page.getByRole("button", { name: "QA 백엔드 개발 하위 업무 펼치기", exact: true }).click();
      await expect(rowTitle(page, "QA 인증 시스템")).toBeVisible();
      await selectOption(page, "Phase 선택", "QA 구현 단계");
      const search = page.getByRole("textbox", { name: "업무 검색", exact: true });
      await search.fill("QA");
      await rowTitle(page, "QA 백엔드 개발").click();
      const detail = panel(page);
      await expect(detail).toHaveAttribute("data-panel-mode", preferredMode);
      const scroller = page.locator(".work-table-scroll");
      await scroller.evaluate((element) => { element.scrollTop = 32; });
      const originalScroll = await scroller.evaluate((element) => element.scrollTop);
      expect(originalScroll).toBeGreaterThan(0);
      const expectPreserved = async (title: string) => {
        await expect(detail).toHaveAttribute("data-panel-mode", preferredMode);
        await expect(detail.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
        await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-expanded", "true");
        await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(1);
        await expect(search).toHaveValue("QA");
        await expect(page.getByRole("button", { name: "단계 필터 해제", exact: true })).toContainText("QA 구현 단계");
        await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBe(originalScroll);
      };
      const edit = detail.getByRole("button", { name: "업무 수정", exact: true });
      await expect(edit).toHaveAttribute("title", "업무 수정");
      await edit.focus();
      await page.keyboard.press("Enter");
      let form = page.getByRole("dialog", { name: "업무 수정", exact: true });
      await expect(form.getByRole("heading", { name: "업무 수정", exact: true })).toBeFocused();
      await form.getByLabel("업무명", { exact: true }).fill("QA 백엔드 개선");
      await form.getByRole("button", { name: "저장", exact: true }).click();
      await expect(form).toHaveCount(0);
      await expectPreserved("QA 백엔드 개선");
      await expect(edit).toBeFocused();
      expect(api.requests.filter((request) => request.method === "PATCH").map((request) => request.body)).toEqual([{ title: "QA 백엔드 개선" }]);

      form = await editResource(page, "QA 백엔드 개선");
      await form.getByLabel("업무명", { exact: true }).fill("QA 폐기할 수정");
      await form.getByRole("button", { name: "취소", exact: true }).click();
      await expect(discardConfirmation(page)).toBeVisible();
      await discardConfirmation(page).getByRole("button", { name: "계속 편집", exact: true }).click();
      await expect(form.getByLabel("업무명", { exact: true })).toHaveValue("QA 폐기할 수정");
      await cancelForm(page, form);
      await expectPreserved("QA 백엔드 개선");
      await expect(detail.getByRole("button", { name: "QA 백엔드 개선 더 보기", exact: true })).toBeFocused();
      expect(api.requests.filter((request) => request.method === "PATCH")).toHaveLength(1);

      const addChild = detail.getByRole("button", { name: "하위 업무 추가", exact: true });
      await addChild.click();
      form = page.getByRole("dialog", { name: "업무 추가", exact: true });
      await expect(form.getByRole("button", { name: "소속 위치 선택", exact: true })).toContainText("QA 백엔드 개선");
      await form.getByLabel("업무명", { exact: true }).fill("QA 탐색 유지 하위 업무");
      await form.getByRole("button", { name: "업무 추가", exact: true }).click();
      await expect(form).toHaveCount(0);
      await expectPreserved("QA 백엔드 개선");
      await expect(rowTitle(page, "QA 탐색 유지 하위 업무")).toHaveCount(1);
      await expect(addChild).toBeFocused();
      expect(api.requests.filter((request) => request.method === "POST").map((request) => request.body)).toEqual([
        expect.objectContaining({ title: "QA 탐색 유지 하위 업무", parent_work_item_id: 501, company_project_phase_id: 501 }),
      ]);
      const reads = api.requests.filter((request) => request.method === "GET").length;
      const toggle = detail.getByRole("button", { name: preferredMode === "docked" ? "업무 상세 도킹 해제" : "업무 상세 도킹", exact: true });
      await expect(toggle).toHaveAttribute("title", preferredMode === "docked" ? "상세 패널 고정 해제" : "상세 패널 고정");
      await toggle.click();
      await expect(detail).toHaveAttribute("data-panel-mode", preferredMode === "docked" ? "floating" : "docked");
      await expect(detail.getByRole("heading", { name: "QA 백엔드 개선", exact: true })).toBeVisible();
      expect(api.requests.filter((request) => request.method === "GET")).toHaveLength(reads);
      if (preferredMode === "docked") {
        await detail.getByRole("button", { name: "업무 상세 도킹", exact: true }).click();
        await expect(detail).toHaveAttribute("data-panel-mode", "docked");
      }
      await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      const lastMenu = page.getByRole("treegrid").getByRole("button", { name: "QA 탐색 유지 업무 31 더 보기", exact: true });
      await lastMenu.scrollIntoViewIfNeeded();
      expect(await lastMenu.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
      })).toBe(true);
      await lastMenu.click({ trial: true });
    });
  }

  test("320·390px 업무 표는 두 열 안에서 제목·상태·메뉴를 표시하고 가로 스크롤을 만들지 않는다", async ({ page }, testInfo) => {
    test.skip(page.viewportSize()!.width > 700, "모바일 표의 두 열 배치를 검증한다.");
    api = await installWorkApi(page);
    const title = "QA 모바일 다섯째 업무의 긴 제목 ".repeat(12).slice(0, 200);
    api.workItems.push(work(540, title, { parent_work_item_id: 531, depth_level: 5 }));
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/projects/901");
      await page.getByRole("button", { name: "전체 펼치기", exact: true }).click();
      const row = page.locator('[data-work-id="540"]');
      await expect(row.locator("td:visible")).toHaveCount(2);
      await expect(row.locator("td").first().getByText("진행 중", { exact: true })).toBeVisible();
      const name = row.locator(".work-title-button");
      await expect(name).toHaveAttribute("title", `1.1.1.1.1.1. ${title}`);
      await expect(name).toHaveCSS("font-size", "14px");
      expect(await name.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(44);
      expect(await row.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(56);
      const menu = row.getByRole("button", { name: `${title} 더 보기`, exact: true });
      await expect(menu).toBeVisible();
      await menu.scrollIntoViewIfNeeded();
      expect(await menu.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
      })).toBe(true);
      expect(await page.locator(".work-table-scroll").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await expectNoPageOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`project-work-table-${width}.png`), animations: "disabled" });
      await name.click();
      await expect(panel(page)).toHaveAttribute("aria-modal", "true");
      await page.screenshot({ path: testInfo.outputPath(`project-work-detail-${width}.png`), animations: "disabled" });
      await panel(page).getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
      await expect(name).toBeFocused();
      await expect(row).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "업무 추가", exact: true }).click();
      const form = page.getByRole("dialog", { name: "업무 추가", exact: true });
      await expect(advancedSettings(form)).toHaveAttribute("aria-expanded", "false");
      await expect(form.getByLabel("업무명", { exact: true })).toBeInViewport();
      await expect(form.getByRole("button", { name: "업무 추가", exact: true })).toBeInViewport();
      await expectNoPageOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`project-work-form-${width}.png`), animations: "disabled" });
      await form.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
      await expect(picker.getByRole("button", { name: "이 위치 적용", exact: true })).toBeInViewport();
      await expectNoPageOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`project-location-picker-${width}.png`), animations: "disabled" });
      await picker.getByRole("button", { name: "취소", exact: true }).click();
      await cancelForm(page, form);
    }
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("낮은 화면에서 도킹을 해제해 전체 화면으로 바뀌어도 본문 스크롤과 선택을 유지한다", async ({ page }) => {
    api = await installWorkApi(page);
    api.workItems[0].description = "QA 도킹 전환 스크롤\n".repeat(80);
    await page.setViewportSize({ width: 1280, height: 540 });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    const detail = panel(page);
    await expect(detail).toHaveAttribute("data-panel-mode", "docked");
    const content = detail.locator(".work-panel-content");
    await content.evaluate((element) => { element.scrollTop = 200; });
    await detail.getByRole("button", { name: "업무 상세 도킹 해제", exact: true }).click();
    await expect(detail).toHaveAttribute("data-panel-mode", "fullscreen");
    await expect(page.locator("#root")).toHaveJSProperty("inert", true);
    expect(await content.evaluate((element) => element.scrollTop)).toBe(200);
    const dock = detail.getByRole("button", { name: "업무 상세 도킹", exact: true });
    await expect(dock).toBeEnabled();
    await expect(dock).toBeFocused();
    await dock.click();
    await expect(detail).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    expect(await content.evaluate((element) => element.scrollTop)).toBe(200);
    await expect(detail.getByRole("button", { name: "업무 상세 도킹 해제", exact: true })).toBeFocused();
    await detail.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
    await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
  });

  test("스크롤바가 있는 경계 너비의 전체 화면 상세는 표시 모드와 배경 너비가 반복 전환되지 않는다", async ({ page }) => {
    test.skip(page.viewportSize()!.width <= 700, "데스크톱 스크롤바의 너비 보존을 검증한다.");
    api = await installWorkApi(page);
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.goto("/projects/901");
    await page.addStyleTag({ content: "body { min-height: 2000px; } html::-webkit-scrollbar { width: 20px; }" });
    const scrollbarWidth = await page.evaluate(() => window.innerWidth - document.documentElement.clientWidth);
    test.skip(scrollbarWidth === 0, "이 브라우저는 공간을 차지하지 않는 스크롤바를 사용한다.");
    const boundary = page.locator(".projects-detail-workspace");
    const width = await boundary.evaluate((element) => element.getBoundingClientRect().width);
    await page.setViewportSize({ width: Math.round(1000 + 675 - width), height: 900 });
    await expect.poll(() => boundary.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(675, 0);
    await rowTitle(page, "QA 백엔드 개발").click();
    const detail = panel(page);
    await expect(detail).toHaveAttribute("data-panel-mode", "fullscreen");
    for (let index = 0; index < 5; index++) {
      await page.keyboard.press("Tab");
      await expect(detail).toHaveAttribute("data-panel-mode", "fullscreen");
      await expect(page.locator("#root")).toHaveJSProperty("inert", true);
      expect(await boundary.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(675, 0);
    }
    await page.keyboard.press("Escape");
    await expect(detail).toHaveCount(0);
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
  });

  test("600·701·800px의 펼친 사이드바에서는 실제 작업 폭에 맞춰 상세를 모달로 열고 닫기 포커스를 복구한다", async ({ page }, testInfo) => {
    test.skip(page.viewportSize()!.width <= 700, "중간 화면 크기는 데스크톱 브라우저에서 검증한다.");
    api = await installWorkApi(page);
    await page.addInitScript(() => localStorage.setItem("flowra-sidebar-collapsed", "false"));
    for (const width of [600, 701, 800]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/projects/901");
      await expect(page.getByRole("button", { name: "사이드바 접기", exact: true })).toBeVisible();
      const title = rowTitle(page, "QA 백엔드 개발");
      await title.click();
      const detail = page.getByRole("dialog", { name: "업무 상세", exact: true });
      await expect(detail).toBeVisible();
      await expect(detail).toHaveAttribute("aria-modal", "true");
      await expect(detail.getByRole("button", { name: "업무 상세 도킹", exact: true })).toBeDisabled();
      await expect(page.locator("#root")).toHaveJSProperty("inert", true);
      const close = detail.getByRole("button", { name: "업무 상세 닫기", exact: true });
      await expect(close).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`project-detail-responsive-${width}-sidebar-open.png`), animations: "disabled" });
      await close.focus();
      for (let index = 0; index < 6; index++) {
        await page.keyboard.press("Tab");
        expect(await detail.evaluate((element) => element.contains(document.activeElement))).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(detail).toHaveCount(0);
      await expect(page.locator("#root")).toHaveJSProperty("inert", false);
      await expect(title).toBeFocused();
      await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
      await expectNoPageOverflow(page);
    }
  });

  test("1024px 공간 부족과 모바일 전체 화면을 거쳐 넓어지면 저장한 도킹 선호와 선택을 복구한다", async ({ page }, testInfo) => {
    test.skip(page.viewportSize()!.width <= 700, "창 크기 변경에 따른 도킹 선호 복구를 검증한다.");
    api = await installWorkApi(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    await expect(panel(page)).toHaveAttribute("data-panel-mode", "docked");
    const reads = api.requests.filter((request) => request.method === "GET").length;
    for (const width of [1100, 1024, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width === 1100) await expect(panel(page)).toHaveAttribute("data-panel-mode", "floating");
      if (width === 1024) await expect(panel(page)).not.toHaveAttribute("data-panel-mode", "docked");
      if (width === 390) await expect(panel(page)).toHaveAttribute("data-panel-mode", "fullscreen");
      if (width === 1440) await expect(panel(page)).toHaveAttribute("data-panel-mode", "docked");
      await expect(panel(page).getByRole("heading", { name: "QA 백엔드 개발", exact: true })).toBeVisible();
      await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
      expect(await page.evaluate(() => localStorage.getItem("flowra-project-work-panel-layout"))).not.toBe("floating");
      const bounds = await panel(page).boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await expectNoPageOverflow(page);
      await page.screenshot({ path: testInfo.outputPath(`project-detail-responsive-${width}.png`), animations: "disabled" });
    }
    expect(api.requests.filter((request) => request.method === "GET")).toHaveLength(reads);
    await panel(page).getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
  });

  test("사이드바 접기·펼치기는 뷰포트가 같아도 상세 모드를 작업 폭에 따라 전환한다", async ({ page }) => {
    test.skip(page.viewportSize()!.width <= 700, "사이드바 너비에 따른 상세 전환을 검증한다.");
    api = await installWorkApi(page);
    await page.addInitScript(() => localStorage.setItem("flowra-sidebar-collapsed", "true"));
    await page.setViewportSize({ width: 960, height: 900 });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    await expect(page.getByRole("complementary", { name: "업무 상세", exact: true })).toBeVisible();
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    await page.getByRole("button", { name: "사이드바 펼치기", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "업무 상세", exact: true })).toBeVisible();
    await expect(page.locator("#root")).toHaveJSProperty("inert", true);
    await page.keyboard.press("Escape");
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
  });

  test("넓은 화면의 상세 오버레이는 헤더·툴바 아래에 열리고 필터 메뉴를 가리지 않는다", async ({ page }) => {
    test.skip(page.viewportSize()!.width <= 700, "넓은 작업 영역의 오버레이를 검증한다.");
    api = await installWorkApi(page);
    await page.addInitScript(() => localStorage.setItem("flowra-project-work-panel-layout", "floating"));
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    const detail = page.getByRole("complementary", { name: "업무 상세", exact: true });
    await expect(detail).toBeVisible();
    await expect.poll(async () => {
      const bounds = await detail.boundingBox();
      const ai = await page.getByRole("button", { name: "AI 채팅 열기", exact: true }).boundingBox();
      return ai!.x + ai!.width - bounds!.x;
    }).toBeLessThan(0);
    const toolbar = page.locator(".work-tree-toolbar");
    await expect.poll(async () => {
      const bounds = await detail.boundingBox();
      const toolbarBounds = await toolbar.boundingBox();
      return bounds!.y - toolbarBounds!.y - toolbarBounds!.height;
    }).toBeGreaterThanOrEqual(7);
    const filter = page.getByRole("button", { name: "업무 필터", exact: true });
    expect(await filter.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    })).toBe(true);
    await filter.click();
    const conditions = page.getByRole("dialog", { name: "업무 필터 조건", exact: true });
    await conditions.getByRole("button", { name: "업무 상태", exact: true }).click();
    const menu = page.getByRole("listbox", { name: "업무 상태", exact: true });
    await expect(menu).toBeVisible();
    const option = menu.getByRole("option", { name: "진행 중", exact: true });
    await option.click();
    await expect(detail).toBeVisible();
    await conditions.getByRole("button", { name: "완료", exact: true }).click();
    await expect(filter).toBeFocused();
    await detail.getByRole("button", { name: "업무 상세 닫기", exact: true }).click();
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("넓고 낮은 화면에서는 상세를 전체 화면으로 바꿔 긴 본문과 닫기에 접근할 수 있다", async ({ page }) => {
    test.skip(page.viewportSize()!.width <= 700, "높이가 부족한 데스크톱 오버레이를 검증한다.");
    api = await installWorkApi(page);
    await page.addInitScript(() => localStorage.setItem("flowra-project-work-panel-layout", "floating"));
    api.workItems[0].description = "QA 낮은 화면의 긴 설명\n".repeat(80);
    await page.setViewportSize({ width: 1440, height: 400 });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    const detail = page.getByRole("dialog", { name: "업무 상세", exact: true });
    await expect(detail).toBeVisible();
    await expect(page.locator("#root")).toHaveJSProperty("inert", true);
    const close = detail.getByRole("button", { name: "업무 상세 닫기", exact: true });
    await expect(close).toBeInViewport();
    const content = detail.locator(".work-panel-content");
    await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(close).toBeInViewport();
    await close.click();
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
  });

  test("낮은 화면의 도킹 상세는 화면 상단부터 확장되어 본문을 스크롤하고 닫기 버튼을 유지한다", async ({ page }) => {
    api = await installWorkApi(page);
    api.workItems[0].description = "QA 낮은 화면의 도킹 설명\n".repeat(80);
    await page.setViewportSize({ width: 1440, height: 400 });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    const detail = page.getByRole("complementary", { name: "업무 상세", exact: true });
    await expect(detail).toHaveAttribute("data-panel-mode", "docked");
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    const bounds = await detail.boundingBox();
    expect(bounds!.y).toBeCloseTo(0, 0);
    expect(bounds!.height).toBeCloseTo(400, 0);
    const close = detail.getByRole("button", { name: "업무 상세 닫기", exact: true });
    await expect(close).toBeInViewport();
    const content = detail.locator(".work-panel-content");
    await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(close).toBeInViewport();
    await close.click();
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
  });

  test("상세 조회 실패로 업무 화면이 닫히면 AI와 알림 버튼 위치를 복구한다", async ({ page }) => {
    api = await installWorkApi(page);
    await page.setViewportSize({ width: 1920, height: 900 });
    await page.goto("/projects/901");
    const notification = page.getByRole("button", { name: "알림", exact: true });
    const notificationRight = await notification.evaluate((element) => element.getBoundingClientRect().right);
    await rowTitle(page, "QA 백엔드 개발").click();
    const detail = page.getByRole("complementary", { name: "업무 상세", exact: true });
    const ai = page.getByRole("button", { name: "AI 채팅 열기", exact: true });
    await expect(detail).toBeVisible();
    await expect.poll(async () => {
      const panelBounds = await detail.boundingBox();
      const aiBounds = await ai.boundingBox();
      return aiBounds!.x + aiBounds!.width - panelBounds!.x;
    }).toBeLessThan(0);
    api.failures.set("GET /company-projects/901", {
      status: 403,
      code: "PROJECT_ACCESS_FORBIDDEN",
      message: "QA 프로젝트 상세 조회 권한이 없습니다.",
    });
    await page.getByRole("button", { name: "프로젝트 새로고침", exact: true }).click();
    const error = page.getByRole("alert").filter({ hasText: "QA 프로젝트 상세 조회 권한이 없습니다." });
    await expect(error).toContainText("접근 권한이 없습니다");
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    await expect.poll(() => ai.evaluate((element) => parseFloat(getComputedStyle(element).right))).toBe(24);
    await expect.poll(() => notification.evaluate((element) => element.getBoundingClientRect().right)).toBeCloseTo(notificationRight, 0);
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("모바일 상세 위 수정 모달은 입력과 Escape를 처리하고 닫으면 상세와 배경 접근 제한을 복구한다", async ({ page }) => {
    test.skip(page.viewportSize()!.width > 700, "모바일 상세와 수정 모달의 겹침을 검증한다.");
    api = await installWorkApi(page);
    api.workItems[0].description = "QA 모바일 긴 설명\n".repeat(80);
    await page.goto("/projects/901");
    const originalOverflow = await page.locator("body").evaluate((element) => getComputedStyle(element).overflowY);
    await rowTitle(page, "QA 백엔드 개발").click();
    await expect(page.locator("#root")).toHaveJSProperty("inert", true);
    const content = page.locator(".work-panel-content");
    await content.evaluate((element) => { element.scrollTop = 200; });
    const originalScroll = await content.evaluate((element) => element.scrollTop);
    expect(originalScroll).toBeGreaterThan(0);
    const edit = panel(page).getByRole("button", { name: "업무 수정", exact: true });
    await edit.click();
    const dialog = page.getByRole("dialog", { name: "업무 수정", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".project-work-panel")).toHaveJSProperty("inert", true);
    await expect(page.locator("body")).toHaveCSS("overflow-y", "hidden");
    const title = dialog.getByRole("textbox", { name: "업무명", exact: true });
    await title.fill("QA 입력한 제목");
    await expect(title).toHaveValue("QA 입력한 제목");
    expect(await title.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element === document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    })).toBe(true);
    await page.keyboard.press("Escape");
    await expect(discardConfirmation(page)).toBeVisible();
    await discardConfirmation(page).getByRole("button", { name: "계속 편집", exact: true }).click();
    await expect(title).toHaveValue("QA 입력한 제목");
    const location = dialog.getByRole("button", { name: "소속 위치 선택", exact: true });
    await location.click();
    const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
    await navigateLocationAncestor(picker, "프로젝트 최상위");
    await picker.getByRole("button", { name: "2. QA 운영 단계", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);
    await expect(location).toBeFocused();
    await expect(location).toContainText("QA 구현 단계");
    await expect(title).toHaveValue("QA 입력한 제목");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(dialog).toBeVisible();
    await expect(page.locator(".project-work-panel")).toHaveJSProperty("inert", true);
    await expect(page.locator("body")).toHaveCSS("overflow-y", "hidden");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.keyboard.press("Escape");
    await discardConfirmation(page).getByRole("button", { name: "변경사항 버리고 나가기", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(panel(page)).toContainText("QA 모바일 긴 설명");
    await expect(page.locator(".project-work-panel")).toHaveJSProperty("inert", false);
    await expect(edit).toBeFocused();
    expect(await content.evaluate((element) => element.scrollTop)).toBe(originalScroll);
    await expect(page.locator("#root")).toHaveJSProperty("inert", true);
    await expect(page.locator("body")).toHaveCSS("overflow-y", "hidden");
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    await expect(page.locator("body")).toHaveCSS("overflow-y", originalOverflow);
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
    await expect(page.locator('[data-work-id="501"]')).toHaveAttribute("aria-selected", "true");
    expect(api.requests.filter((request) => request.method !== "GET")).toEqual([]);
  });

  test("업무·단계 취소는 각 DELETE 경로를 사용하고 서버 상태를 다시 조회한다", async ({
    page,
  }, testInfo) => {
    api = await installWorkApi(page);
    await page.goto("/projects/901");
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeVisible();
    const initialDetailReads = api.requests.filter(
      (request) => request.path === "/company-projects/901",
    ).length;
    const workDialog = await confirmCancellation(
      page,
      "QA 운영 검토",
      false,
      testInfo,
    );
    await expect(workDialog).toHaveCount(0);
    await expect
      .poll(
        () =>
          api.requests.filter(
            (request) => request.path === "/company-projects/901",
          ).length,
      )
      .toBeGreaterThan(initialDetailReads);
    expect(
      api.workItems.find((item) => item.company_project_work_item_id === 502)
        ?.status,
    ).toBe("cancelled");
    await expect(rowTitle(page, "QA 운영 검토")).toBeVisible();
    const phaseDialog = await confirmCancellation(
      page,
      "QA 구현 단계",
      true,
      testInfo,
    );
    await expect(phaseDialog).toHaveCount(0);
    expect(
      api.phases.find((item) => item.company_project_phase_id === 501)?.status,
    ).toBe("cancelled");
    expect(
      api.workItems.find((item) => item.company_project_work_item_id === 501)
        ?.status,
    ).toBe("in_progress");
    expect(
      api.requests
        .filter((request) => request.method === "DELETE")
        .map((request) => request.path),
    ).toEqual([
      "/company-projects/901/work-items/502",
      "/company-projects/901/phases/501",
    ]);
    await page.reload();
    await expect(rowTitle(page, "QA 운영 검토")).toBeVisible();
  });

  test("취소 403은 성공처럼 반영하지 않고 조회 전용 사용자의 변경 메뉴를 제한한다", async ({
    page,
  }) => {
    api = await installWorkApi(page);
    api.failures.set("DELETE /company-projects/901/work-items/502", {
      status: 403,
      code: "PROJECT_MANAGEMENT_FORBIDDEN",
      message: "QA 업무 취소 권한이 없습니다.",
    });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 운영 검토").click();
    const dialog = await confirmCancellation(page, "QA 운영 검토");
    await expect(dialog.getByRole("alert")).toBeVisible();
    expect(
      api.workItems.find((item) => item.company_project_work_item_id === 502)
        ?.status,
    ).toBe("todo");
    await dialog.getByRole("button", { name: "돌아가기", exact: true }).click();
    await expect(panel(page)).toContainText("QA 운영 검토 설명");
    api.failures.set("GET /company-projects/901/members", {
      status: 403,
      code: "PROJECT_MANAGEMENT_FORBIDDEN",
      message: "프로젝트 관리 권한이 없습니다.",
    });
    await page.reload();
    await expect(rowTitle(page, "QA 운영 검토")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "QA 운영 검토 더 보기", exact: true }),
    ).toHaveCount(0);
    expect(
      api.requests.filter((request) => request.method === "DELETE"),
    ).toHaveLength(1);
  });

  for (const corruption of ["duplicate", "cross-project"] as const) {
    test(`손상된 하위 응답 ${corruption}를 정상 업무로 표시하지 않는다`, async ({
      page,
    }) => {
      api = await installWorkApi(page, { partial: true });
      const child = api.workItems.find(
        (item) => item.company_project_work_item_id === 511,
      )!;
      api.childrenPayloads.set(501, {
        work_items:
          corruption === "duplicate"
            ? [child, { ...child }]
            : [
                {
                  ...child,
                  company_project_id: 902,
                  title: "QA 권한 밖의 업무",
                },
              ],
      });
      await page.goto("/projects/901");
      await page
        .getByRole("button", {
          name: "QA 백엔드 개발 하위 업무 펼치기",
          exact: true,
        })
        .click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(0);
      await expect(
        page.getByText("QA 권한 밖의 업무", { exact: true }),
      ).toHaveCount(0);
      api.childrenPayloads.delete(501);
      await page
        .getByRole("button", { name: "하위 업무 다시 시도", exact: true })
        .click();
      await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(1);
    });
  }

  test("불러온 자식 업무 취소 후 상세 패널과 트리를 최신 서버 응답으로 동기화한다", async ({
    page,
  }) => {
    api = await installWorkApi(page, { partial: true });
    api.assignments.push({ assignment_id: 702, company_project_work_item_id: 511, assignee_company_member_id: 171, status: "in_progress", progress_percent: 10 });
    await page.goto("/projects/901");
    await page
      .getByRole("button", {
        name: "QA 백엔드 개발 하위 업무 펼치기",
        exact: true,
      })
      .click();
    await expect(rowTitle(page, "QA 인증 시스템")).toBeVisible();
    await rowTitle(page, "QA 인증 시스템").click();
    const dialog = await confirmCancellation(page, "QA 인증 시스템");
    await expect(dialog).toHaveCount(0);
    for (const workId of [511, 521, 531]) {
      expect(api.workItems.find((item) => item.company_project_work_item_id === workId)?.status).toBe("cancelled");
    }
    expect(api.assignments.find((item) => item.assignment_id === 702)?.status).toBe("cancelled");
    expect(api.assignments.find((item) => item.assignment_id === 701)?.status).toBe("in_progress");
    expect(api.workReminders[0].status).toBe("cancelled");
    expect(api.dependencies).toEqual([]);
    await expect(
      panel(page).getByText("취소", { exact: true }).first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "업무 상세 닫기", exact: true })
      .click();
    const row = page
      .getByRole("treegrid")
      .getByRole("row")
      .filter({
        has: page.getByRole("button", { name: "QA 인증 시스템", exact: true }),
      });
    await expect(row.getByText("취소", { exact: true })).toBeVisible();
    expect(
      api.requests.filter(
        (request) =>
          request.path === "/company-projects/901/work-items/501/children",
      ).length,
    ).toBeGreaterThan(1);
  });

  test("다른 프로젝트로 이동하면 지연된 이전 프로젝트 하위 업무가 섞이지 않는다", async ({
    page,
  }) => {
    api = await installWorkApi(page, { partial: true });
    const gate = deferred();
    api.gates.set(
      "GET /company-projects/901/work-items/501/children",
      gate.promise,
    );
    await page.goto("/projects");
    await page
      .getByRole("link", { name: /^QA 계층형 프로젝트(?:\s|$)/ })
      .click();
    await page
      .getByRole("button", {
        name: "QA 백엔드 개발 하위 업무 펼치기",
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        api.requests.some((request) => request.path.endsWith("/501/children")),
      )
      .toBe(true);
    await page
      .getByRole("link", { name: "목록으로 돌아가기", exact: true })
      .click();
    await page.getByRole("link", { name: /^QA 독립 프로젝트(?:\s|$)/ }).click();
    await expect(rowTitle(page, "QA 다른 프로젝트 업무")).toBeVisible();
    gate.release();
    await expect(rowTitle(page, "QA 백엔드 개발")).toHaveCount(0);
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(0);
    await expect(panel(page)).toHaveCount(0);
  });

  test("접힌 부모의 패널에서 선택한 자식 취소 후 재조회 실패도 보이는 경로에서 재시도한다", async ({
    page,
  }) => {
    api = await installWorkApi(page, { partial: true });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    await panel(page)
      .getByRole("button", { name: /^QA 인증 시스템/ })
      .click();
    await expect(panel(page)).toContainText("QA 인증 시스템 설명");
    const childPath = "/company-projects/901/work-items/501/children";
    api.failures.set(`GET ${childPath}`, {
      status: 503,
      code: "INTERNAL_ERROR",
      message: "QA 취소 후 하위 업무 재조회 실패",
    });
    await panel(page)
      .getByRole("button", { name: "QA 인증 시스템 더 보기", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "업무 취소", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "업무 취소", exact: true });
    await dialog
      .getByRole("button", { name: "취소 처리", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "QA 취소 후 하위 업무 재조회 실패" }),
    ).toBeVisible();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).not.toContainText("QA 인증 시스템 설명");
    api.failures.delete(`GET ${childPath}`);
    await panel(page)
      .getByRole("button", { name: "하위 업무 다시 시도", exact: true })
      .click();
    // Recover using the server's cancelled child, without reopening the collapsed parent.
    await expect(panel(page)).toContainText("QA 인증 시스템 설명");
    await expect(
      panel(page).getByText("취소", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      panel(page).getByRole("heading", { name: "QA 인증 시스템", exact: true }),
    ).toBeFocused();
    expect(
      api.requests.filter((request) => request.path === childPath).length,
    ).toBeGreaterThanOrEqual(3);
  });

  test("선택한 자식이 새 서버 응답에서 사라지면 이전 상세를 남기지 않고 닫은 뒤 부모로 포커스를 복구한다", async ({
    page,
  }) => {
    api = await installWorkApi(page, { partial: true });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    await panel(page)
      .getByRole("button", { name: /^QA 인증 시스템/ })
      .click();
    await expect(panel(page)).toContainText("QA 인증 시스템 설명");
    // The authoritative branch response omits the selected child after cancellation.
    api.childrenPayloads.set(501, { work_items: [] });
    await panel(page)
      .getByRole("button", { name: "QA 인증 시스템 더 보기", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "업무 취소", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "업무 취소", exact: true });
    await dialog
      .getByRole("button", { name: "취소 처리", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await expect(panel(page)).toContainText(
      "선택한 업무를 현재 조회 결과에서 찾을 수 없습니다.",
    );
    await expect(panel(page)).not.toContainText("QA 인증 시스템 설명");
    await expect(
      panel(page).getByRole("button", {
        name: "QA 인증 시스템 더 보기",
        exact: true,
      }),
    ).toHaveCount(0);
    await panel(page)
      .getByRole("button", { name: "업무 상세 닫기", exact: true })
      .click();
    await expect(panel(page)).toHaveCount(0);
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
  });

  test("프로젝트 새로고침은 사라진 lazy 업무와 이전 지연 응답을 현재 트리에 복원하지 않는다", async ({
    page,
  }) => {
    api = await installWorkApi(page, { partial: true });
    // Refresh can return an unchanged shallow detail while a lazy branch changed.
    api.workItems.find(
      (item) => item.company_project_work_item_id === 501,
    )!.rollup = undefined;
    await page.goto("/projects/901");
    await page
      .getByRole("button", {
        name: "QA 백엔드 개발 하위 업무 펼치기",
        exact: true,
      })
      .click();
    await expect(rowTitle(page, "QA 인증 시스템")).toBeVisible();
    const gate = deferred();
    api.gates.set(
      "GET /company-projects/901/work-items/511/children",
      gate.promise,
    );
    const grandchild = {
      ...api.workItems.find(
        (item) => item.company_project_work_item_id === 521,
      )!,
    };
    api.childrenPayloads.set(511, { work_items: [grandchild] });
    await page
      .getByRole("button", {
        name: "QA 인증 시스템 하위 업무 펼치기",
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        api.requests.some((request) => request.path.endsWith("/511/children")),
      )
      .toBe(true);
    api.workItems.splice(2, 3);
    await page
      .getByRole("button", { name: "프로젝트 새로고침", exact: true })
      .click();
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(0);
    gate.release();
    await expect(
      page.getByRole("button", { name: "프로젝트 새로고침", exact: true }),
    ).toBeEnabled();
    await expect(rowTitle(page, "QA 인증 시스템")).toHaveCount(0);
    await expect(rowTitle(page, "QA 로그인 API")).toHaveCount(0);
  });

  test("상세 패널은 모바일 화면 안에 배치되고 기존 밝은·어두운 테마를 따른다", async ({
    page,
  }, testInfo) => {
    api = await installWorkApi(page);
    const colors: string[] = [];
    for (const theme of ["light", "dark"] as const) {
      await page.addInitScript((value) => {
        localStorage.setItem(
          "flowra:user-settings",
          JSON.stringify({ theme: value }),
        );
      }, theme);
      await page.goto("/projects/901");
      await expect(page.locator("html")).toHaveAttribute(
        "data-resolved-theme",
        theme,
      );
      if (page.viewportSize()!.width <= 700)
        await attachLayout(page, testInfo, `${theme}-before-pointer-selection`);
      await rowTitle(page, "QA 백엔드 개발").click();
      await expect(panel(page)).toBeVisible();
      colors.push(
        await panel(page).evaluate(
          (element) => getComputedStyle(element).backgroundColor,
        ),
      );
      const bounds = await panel(page).boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(-1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width + 1,
      );
      await expectNoPageOverflow(page);
      await testInfo.attach(`${theme}-work-detail`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    }
    expect(colors[0]).not.toBe(colors[1]);
  });

  test("선택한 상세 패널은 화면 전환 후 제목 포커스와 배경 접근 제한을 복구한다", async ({
    page,
  }, testInfo) => {
    api = await installWorkApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/projects/901");
    await rowTitle(page, "QA 백엔드 개발").click();
    await expect(
      panel(page).getByRole("heading", { name: "QA 백엔드 개발", exact: true }),
    ).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    const mobilePanel = page.getByRole("dialog", {
      name: "업무 상세",
      exact: true,
    });
    await expect(mobilePanel).toBeVisible();
    await expect(
      mobilePanel.getByRole("heading", { name: "QA 백엔드 개발", exact: true }),
    ).toBeFocused();
    await expect(page.locator("#root")).toHaveJSProperty("inert", true);
    await attachLayout(page, testInfo, "selected-breakpoint-mobile");
    const bounds = await mobilePanel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    await page.setViewportSize({ width: 1280, height: 900 });
    const desktopPanel = page.getByRole("complementary", {
      name: "업무 상세",
      exact: true,
    });
    await expect(desktopPanel).toBeVisible();
    await expect(desktopPanel).toHaveAttribute("data-panel-mode", "docked");
    await expect(
      desktopPanel.getByRole("heading", {
        name: "QA 백엔드 개발",
        exact: true,
      }),
    ).toBeFocused();
    await expect(page.locator("#root")).toHaveJSProperty("inert", false);
    await page
      .getByRole("button", { name: "업무 상세 닫기", exact: true })
      .click();
    await expect(panel(page)).toHaveCount(0);
    await expect(rowTitle(page, "QA 백엔드 개발")).toBeFocused();
  });
});

async function changeLinkedPhase(page: Page, dialog: Locator, label: string) {
  await dialog.getByRole("button", { name: "소속 위치 선택", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "소속 위치 선택", exact: true });
  await selectOption(picker, "연결 단계 변경", label);
  await picker.getByRole("button", { name: "이 위치 적용", exact: true }).click();
}
