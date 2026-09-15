import type { Page, Route } from "@playwright/test";
import type {
  AiChatMessage,
  AiChatSession,
  AiParseResult,
  Category,
  Memo,
  Notice,
  Reminder,
  Schedule,
  Task,
  User,
} from "../../src/types";

/** Fictional data only. This fixture never contacts the real API or AI provider. */
export const QA_NOW = "2026-09-09T01:00:00.000Z";
export const QA_DATE = "2026-09-09";
export const QA_API_ORIGIN = "http://qa-api.invalid";
export const QA_USER: User = {
  user_id: 9001,
  email: "qa@example.invalid",
  name: "QA 테스터",
  login_type: "local",
  public_uid: "FLOWRA-QA-9001",
  timezone: "Asia/Seoul",
  status: "active",
  profile_image_url: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: QA_NOW,
};

export interface MockOptions {
  empty?: boolean;
  longContent?: boolean;
  latencyMs?: number;
  /** Keys are paths ("/tasks") or method + path ("POST /tasks"). */
  failures?: Record<string, number>;
}

export interface MockRequest {
  method: string;
  path: string;
  url: string;
  body: Record<string, unknown>;
  status?: number;
}

export interface MockState {
  user: User;
  tasks: Task[];
  schedules: Schedule[];
  memos: Memo[];
  categories: Category[];
  notices: Notice[];
  reminders: Reminder[];
  sessions: AiChatSession[];
  messages: AiChatMessage[];
}

export function createMockState(options: MockOptions = {}): MockState {
  const longTitle = "QA 긴 제목 확인 — " + "여러 줄에 걸친 제목과 버튼 배치 확인 ".repeat(8);
  return {
    user: { ...QA_USER },
    categories: [
      { category_id: 11, name: "업무", color: "#3B82F6", type: "task", is_default: true },
      { category_id: 12, name: "개인", color: "#10B981", type: "task" },
      { category_id: 21, name: "회의", color: "#8B5CF6", type: "schedule", is_default: true },
      { category_id: 22, name: "개인 일정", color: "#10B981", type: "schedule" },
      { category_id: 31, name: "아이디어", color: "#F59E0B", type: "memo", is_default: true },
    ],
    tasks: options.empty ? [] : [
      { task_id: 101, user_id: 9001, title: "QA 오늘 할 일", description: "주요 버튼의 동작을 확인합니다.", priority: "high", status: "todo", due_datetime: "2026-09-09T18:00:00+09:00", category_id: 11, created_at: QA_NOW },
      { task_id: 102, user_id: 9001, title: options.longContent ? longTitle : "QA 진행 중인 할 일", description: "화면 크기별 배치를 확인합니다.", priority: "medium", status: "in_progress", due_datetime: "2026-09-10T18:00:00+09:00", category_id: 12, created_at: QA_NOW },
      { task_id: 103, user_id: 9001, title: "QA 완료한 할 일", priority: "low", status: "done", due_datetime: "2026-09-09T09:00:00+09:00", completed_at: QA_NOW, category_id: 11, created_at: QA_NOW },
      { task_id: 104, user_id: 9001, title: "QA 기한 없는 할 일", priority: "medium", status: "todo", due_datetime: null, category_id: null, created_at: QA_NOW },
    ],
    schedules: options.empty ? [] : [
      { schedule_id: 201, user_id: 9001, title: "QA 디자인 검토 회의", description: "홈과 달력 화면을 검토합니다.", schedule_type: "meeting", priority: "high", is_completed: false, start_datetime: "2026-09-09T10:00:00+09:00", end_datetime: "2026-09-09T11:00:00+09:00", all_day: false, location: "테스트 회의실", category_id: 21, visibility: "private", created_at: QA_NOW },
      { schedule_id: 202, user_id: 9001, title: options.longContent ? longTitle : "QA 일정 겹침 확인", schedule_type: "personal", priority: "medium", is_completed: false, start_datetime: "2026-09-09T10:30:00+09:00", end_datetime: "2026-09-09T11:30:00+09:00", all_day: false, category_id: 22, visibility: "private", created_at: QA_NOW },
      { schedule_id: 203, user_id: 9001, title: "QA 하루 일정", schedule_type: "deadline", priority: "medium", is_completed: false, start_datetime: "2026-09-10T00:00:00+09:00", end_datetime: "2026-09-10T23:59:00+09:00", all_day: true, category_id: 21, visibility: "private", created_at: QA_NOW },
    ],
    memos: options.empty ? [] : [
      { memo_id: 301, user_id: 9001, raw_text: "QA 회의 메모\n버튼과 화면 배치를 확인합니다.", memo_type: "general", source_type: "manual", parse_status: "pending", category_id: 31, created_at: QA_NOW },
      { memo_id: 302, user_id: 9001, raw_text: options.longContent ? longTitle + "\n" + "줄바꿈이 있는 긴 메모 본문입니다.\n".repeat(20) : "QA 다음 회의 아이디어\n모바일에서도 입력 내용을 확인합니다.", memo_type: "meeting", source_type: "manual", parse_status: "pending", category_id: 31, created_at: "2026-09-08T02:00:00.000Z" },
    ],
    notices: options.empty ? [] : [
      { notice_id: 401, category: "system", title: "QA 서비스 이용 안내", body: "## 테스트 안내\n\n이 공지는 자동 화면 점검을 위한 가상 데이터입니다.\n\n- 일정 등록\n- 할 일 완료\n- 메모 저장", body_format: "markdown", is_pinned: true, publish_start_at: "2026-09-01T00:00:00.000Z", publish_end_at: null, created_at: "2026-09-01T00:00:00.000Z", updated_at: QA_NOW },
      { notice_id: 402, category: "system", title: options.longContent ? longTitle : "QA 업데이트 소식", body: "화면 크기를 바꾸어 공지 내용을 확인합니다.", body_format: "plain", is_pinned: false, publish_start_at: "2026-09-08T00:00:00.000Z", publish_end_at: null, created_at: "2026-09-08T00:00:00.000Z", updated_at: QA_NOW },
    ],
    reminders: [],
    sessions: [],
    messages: [],
  };
}

/** Seeds once per tab so a subsequent logout/reload remains logged out. */
export async function seedAuth(page: Page) {
  await page.addInitScript((user) => {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) return;
    if (sessionStorage.getItem("flowra-qa-auth-seeded")) return;
    localStorage.setItem("access_token", "qa-access-token");
    localStorage.setItem("refresh_token", "qa-refresh-token");
    localStorage.setItem("auth_user", JSON.stringify(user));
    sessionStorage.setItem("flowra-qa-auth-seeded", "1");
  }, QA_USER);
}

function listData<T>(items: T[], key?: string) {
  return {
    items,
    ...(key ? { [key]: items } : {}),
    pagination: { page: 1, size: items.length || 20, total_items: items.length, total_pages: items.length ? 1 : 0, has_next: false },
  };
}

function normalizeIds(body: Record<string, unknown>) {
  const result = { ...body };
  for (const key of ["category_id", "schedule_id", "target_id"]) {
    if (result[key] != null) result[key] = Number(result[key]);
  }
  return result;
}

function matches(value: unknown, filter: string | null) {
  return !filter || filter.split(",").includes(String(value));
}

function inRange(value: string | null | undefined, from: string | null, to: string | null) {
  if (!value) return !from && !to;
  const time = Date.parse(value);
  return (!from || time >= Date.parse(from)) && (!to || time <= Date.parse(to));
}

function mockParseResult(memo: Memo): AiParseResult {
  return { ai_result_id: memo.memo_id + 10000, memo_id: memo.memo_id, detected_type: "note", extracted_title: memo.raw_text.split("\n")[0], extracted_summary: "QA 모의 분석 결과입니다.", suggested_actions: [], status: "suggested", created_at: QA_NOW };
}

/** Install before navigation. State lives in Node and therefore survives reloads. */
export async function installMockApi(page: Page, options: MockOptions = {}) {
  const state = createMockState(options);
  const requests: MockRequest[] = [];
  const unhandled: MockRequest[] = [];
  const blockedExternal: string[] = [];
  let nextId = 1001;

  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (local && !url.pathname.startsWith("/api/")) return route.continue();

    if (url.origin !== QA_API_ORIGIN) {
      blockedExternal.push(url.href);
      // Remote fonts/assets are intentionally omitted; no production request is sent.
      return route.fulfill({ status: 200, contentType: request.resourceType() === "stylesheet" ? "text/css" : "text/plain", body: "", headers: { "access-control-allow-origin": "*" } });
    }

    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "*",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let body: Record<string, unknown> = {};
    try { body = request.postDataJSON() ?? {}; } catch { /* A GET has no JSON body. */ }
    const path = url.pathname.replace(/^\/api\/v1(?=\/|$)/, "");
    const method = request.method();
    const entry: MockRequest = { method, path, url: url.href, body };
    requests.push(entry);
    if (options.latencyMs) await new Promise((resolve) => setTimeout(resolve, options.latencyMs));
    const reply = async (data: unknown, status = 200) => {
      entry.status = status;
      await route.fulfill({ status, headers, json: { success: true, message: "QA 모의 응답", data } });
    };
    const fail = async (status: number, code: string, message: string) => {
      entry.status = status;
      await route.fulfill({ status, headers, json: { success: false, message, error: { code }, data: null } });
    };
    const failure = options.failures?.[`${method} ${path}`] ?? options.failures?.[path];
    if (failure) return fail(failure, "QA_INJECTED_ERROR", "QA 테스트용 서버 오류입니다.");
    const params = url.searchParams;
    const input = normalizeIds(body);

    if (path === "/users/me" && method === "GET") return reply({ user: state.user });
    if (path === "/users/me" && method === "PATCH") {
      Object.assign(state.user, body, { updated_at: QA_NOW });
      return reply({ user: state.user });
    }
    if (path === "/auth/login" && method === "POST") {
      if (body.email !== QA_USER.email || body.password !== "Qa-test-1234!") return fail(401, "INVALID_CREDENTIALS", "이메일 또는 비밀번호를 확인해 주세요.");
      return reply({ user: state.user, access_token: "qa-access-token", refresh_token: "qa-refresh-token", expires_in: 3600 });
    }
    if (path === "/auth/refresh" && method === "POST") return reply({ access_token: "qa-access-token", refresh_token: "qa-refresh-token", expires_in: 3600 });
    if (path === "/auth/logout" && method === "POST") return reply({});

    if (path === "/home/today" && method === "GET") {
      const date = params.get("date") || QA_DATE;
      const schedules = state.schedules.filter((item) => item.start_datetime.slice(0, 10) === date);
      const tasks = state.tasks.filter((item) => item.status !== "done" && item.due_datetime?.slice(0, 10) === date);
      return reply({ date, timezone: "Asia/Seoul", briefing_text: options.empty ? "오늘 등록된 일정이 없습니다." : "오늘의 일정과 할 일을 확인하고 차근차근 시작해 보세요.", summary: { today_schedule_count: schedules.length, today_personal_schedule_count: schedules.filter((item) => !item.is_completed).length, today_company_schedule_count: 0, today_deadline_schedule_count: schedules.filter((item) => item.schedule_type === "deadline").length, today_project_work_item_count: 0, overdue_project_work_item_count: 0, incomplete_task_count: state.tasks.filter((item) => item.status !== "done").length, current_completion_streak_days: options.empty ? 0 : 3, best_completion_streak_days: options.empty ? 0 : 5 }, slot_counts: { meeting: schedules.filter((item) => item.schedule_type === "meeting").length, fieldwork: 0, deadline: 0, other: 0 }, today_schedules: schedules.map((item) => ({ ...item, id: item.schedule_id })), due_today_tasks: tasks.map((item) => ({ ...item, id: item.task_id })), organization_schedules: [], project_work_items: [], overdue_project_work_items: [], focus_items: tasks.map((item) => ({ item_type: "task", id: item.task_id })), ai_insights: { optimal_focus_time: { label: "오후 2시 ~ 4시" }, weekly_completion_rate: { percent: 75 }, schedule_density: { percent: options.empty ? 0 : 25, level: "low", busy_minutes: options.empty ? 0 : 120, available_minutes: 480, scheduled_hours: options.empty ? 0 : 2, peak_time_label: options.empty ? null : "오전" } }, completion_streak: { days: options.empty ? 0 : 3, current_days: options.empty ? 0 : 3, best_days: options.empty ? 0 : 5, source: "schedule_completed_at", week: Array.from({ length: 7 }, (_, index) => ({ date: `2026-09-${String(index + 7).padStart(2, "0")}`, label: ["월", "화", "수", "목", "금", "토", "일"][index], status: options.empty ? "empty" : index < 2 ? "completed" : index === 2 ? "pending" : "future" })) } });
    }
    if (path === "/briefings/today" && method === "GET") return reply({ date: params.get("date") || QA_DATE, summary: { schedule_count: state.schedules.length, task_count: state.tasks.length, overdue_task_count: 0, reminder_count: 0 }, schedules: state.schedules, tasks: state.tasks, company_schedules: [], overdue_tasks: [], project_work_items: [], overdue_project_work_items: [], reminders: [] });

    if (path === "/tasks" && method === "GET") {
      const items = state.tasks.filter((item) => matches(item.status, params.get("status")) && matches(item.priority, params.get("priority")) && matches(item.category_id, params.get("category_id")) && matches(item.schedule_id, params.get("schedule_id")) && (!params.get("q") || `${item.title} ${item.description || ""}`.toLowerCase().includes(params.get("q")!.toLowerCase())) && (params.get("schedule_filter") !== "linked" || !!item.schedule_id) && (params.get("schedule_filter") !== "unlinked" || !item.schedule_id) && ((!item.due_datetime && params.get("include_no_due") === "true") || inRange(item.due_datetime, params.get("due_from"), params.get("due_to"))));
      return reply(listData(items, "tasks"));
    }
    if (path === "/schedules" && method === "GET") {
      const items = state.schedules.filter((item) => matches(item.category_id, params.get("category_id")) && matches(item.schedule_type, params.get("schedule_type")) && matches(item.priority, params.get("priority")) && matches(item.is_completed ?? false, params.get("is_completed")) && inRange(item.start_datetime, params.get("start_from"), params.get("start_to")) && (!params.get("q") || item.title.toLowerCase().includes(params.get("q")!.toLowerCase())) && (!params.get("location") || (item.location || "").includes(params.get("location")!)));
      return reply(listData(items, "schedules"));
    }
    if (path === "/memos" && method === "GET") return reply(listData(state.memos.filter((item) => matches(item.category_id, params.get("category_id")) && matches(item.memo_type, params.get("memo_type")) && matches(item.parse_status, params.get("parse_status"))), "memos"));
    if (path === "/categories" && method === "GET") return reply(listData(state.categories.filter((item) => matches(item.type, params.get("type"))), "categories"));
    if (path === "/reminders" && method === "GET") return reply(listData(state.reminders.filter((item) => matches(item.target_type, params.get("target_type")) && matches(item.is_sent ?? false, params.get("is_sent"))), "reminders"));

    // Narrow CRUD mapping: unknown routes must remain visible as fixture gaps.
    const resource = path.match(/^\/(tasks|schedules|memos|categories|reminders)(?:\/(\d+))?$/);
    if (resource) {
      const kind = resource[1] as "tasks" | "schedules" | "memos" | "categories" | "reminders";
      const singular = { tasks: "task", schedules: "schedule", memos: "memo", categories: "category", reminders: "reminder" }[kind];
      const idKey = `${singular}_id`;
      // The wire-level patch is dynamic; seed data remains checked against app types above.
      const collection = state[kind] as unknown as Record<string, unknown>[];
      const id = Number(resource[2]);
      const index = collection.findIndex((item) => item[idKey] === id);
      if (resource[2] && index < 0) return fail(404, "NOT_FOUND", "요청한 항목을 찾을 수 없습니다.");
      if (resource[2] && method === "GET") return reply({ [singular]: collection[index] });
      if (!resource[2] && method === "POST") {
        const defaults: Record<string, Record<string, unknown>> = { tasks: { title: "", status: "todo", priority: "medium", due_datetime: null, schedule_id: null, category_id: null }, schedules: { title: "", schedule_type: "personal", priority: "medium", start_datetime: QA_NOW, all_day: false, is_completed: false, visibility: "private", category_id: null }, memos: { raw_text: "", memo_type: "quick", source_type: "manual", parse_status: "pending", category_id: null }, categories: { name: "", color: "#3B82F6", type: "task" }, reminders: { reminder_type: "in_app", is_sent: false } };
        const item = { ...defaults[kind], ...input, [idKey]: nextId++, user_id: 9001, created_at: QA_NOW, updated_at: QA_NOW };
        if (kind === "memos" && input.auto_parse) {
          item.parse_status = "completed";
          item.last_ai_result = mockParseResult(item as unknown as Memo);
          item.last_ai_result_id = (item.last_ai_result as AiParseResult).ai_result_id;
        }
        collection.unshift(item);
        return reply({ [singular]: item }, 201);
      }
      if (resource[2] && method === "PATCH") {
        Object.assign(collection[index], input, { updated_at: QA_NOW });
        if (kind === "memos" && input.auto_parse) Object.assign(collection[index], { parse_status: "completed", last_ai_result: mockParseResult(collection[index] as unknown as Memo) });
        return reply({ [singular]: collection[index] });
      }
      if (resource[2] && method === "DELETE") { collection.splice(index, 1); return reply({}); }
    }
    if (path === "/schedules/bulk" && method === "DELETE") {
      const ids = new Set((body.schedule_ids as unknown[] || []).map(Number));
      const before = state.schedules.length;
      state.schedules = state.schedules.filter((item) => !ids.has(item.schedule_id));
      return reply({ deleted_count: before - state.schedules.length, failed_ids: [] });
    }
    const memoParse = path.match(/^\/memos\/(\d+)\/(parse|parse-result)$/);
    if (memoParse && ((memoParse[2] === "parse" && method === "POST") || (memoParse[2] === "parse-result" && method === "GET"))) {
      const memo = state.memos.find((item) => item.memo_id === Number(memoParse[1]));
      if (!memo) return fail(404, "NOT_FOUND", "메모를 찾을 수 없습니다.");
      if (method === "POST") Object.assign(memo, { parse_status: "completed", last_ai_result: mockParseResult(memo), parsed_at: QA_NOW });
      const result = memo.last_ai_result || null;
      return reply({ memo, latest_result: result, parse_results: result ? [result] : [] });
    }

    if (path === "/notices" && method === "GET") return reply({ notices: state.notices, meta: { page: 1, page_size: 20, total: state.notices.length, total_pages: state.notices.length ? 1 : 0 } });
    const noticeDetail = path.match(/^\/notices\/(\d+)$/);
    if (noticeDetail && method === "GET") {
      const notice = state.notices.find((item) => item.notice_id === Number(noticeDetail[1]));
      return notice ? reply({ notice }) : fail(404, "NOT_FOUND", "공지를 찾을 수 없습니다.");
    }

    const emptyGet: Record<string, string> = { "/companies": "companies", "/company-memberships": "memberships", "/friends": "friends", "/friends/requests": "requests", "/friend-presets": "presets", "/shared-schedules": "shared_schedules", "/notifications": "notifications", "/push/devices": "devices", "/holidays": "holidays", "/holidays/range": "holidays" };
    if (method === "GET" && path === "/company-memberships/invites") return reply(listData([], "invites"));
    if (method === "GET" && emptyGet[path]) return reply(listData([], emptyGet[path]));
    if (method === "GET" && /^\/schedules\/\d+\/(shares|share-links)$/.test(path)) return reply(listData([], path.endsWith("share-links") ? "share_links" : "shares"));
    if (path === "/notifications/unread-count" && method === "GET") return reply({ unread_count: 0 });
    if (path === "/notifications/read-all" && method === "PATCH") return reply({ updated_count: 0 });
    if (path === "/holidays/check" && method === "GET") return reply({ date: params.get("date"), country_code: "KR", is_holiday: false, holidays: [] });

    if (path === "/ai-chat/sessions" && method === "GET") return reply(listData(state.sessions, "sessions"));
    if (path === "/ai-chat/sessions" && method === "POST") {
      const session: AiChatSession = { session_id: nextId++, title: String(body.title || "새 대화"), status: "active", created_at: QA_NOW, updated_at: QA_NOW, messages: [] };
      state.sessions.unshift(session);
      return reply({ session }, 201);
    }
    const chat = path.match(/^\/ai-chat\/sessions\/(\d+)(\/messages)?$/);
    if (chat) {
      const sessionId = Number(chat[1]);
      if (chat[2] && method === "GET") return reply(listData(state.messages.filter((item) => item.session_id === sessionId), "messages"));
      if (chat[2] && method === "POST") {
        const userMessage: AiChatMessage = { message_id: nextId++, session_id: sessionId, role: "user", content: String(body.content || body.message || ""), created_at: QA_NOW };
        const assistantMessage: AiChatMessage = { message_id: nextId++, session_id: sessionId, role: "assistant", content: "QA 모의 답변입니다. 오늘 일정과 할 일을 확인해 보세요.", response_type: "answer", action_status: "none", suggested_actions: [], created_at: QA_NOW };
        state.messages.push(userMessage, assistantMessage);
        return reply({ user_message: userMessage, assistant_message: assistantMessage });
      }
      if (!chat[2] && method === "DELETE") { state.sessions = state.sessions.filter((item) => item.session_id !== sessionId); state.messages = state.messages.filter((item) => item.session_id !== sessionId); return reply({}); }
    }

    unhandled.push(entry);
    return fail(501, "QA_UNHANDLED_ROUTE", `Missing QA fixture: ${method} ${path}`);
  });

  return { state, requests, unhandled, blockedExternal };
}
