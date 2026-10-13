import { test, expect } from "@playwright/test";
import type { AiParseResult, Memo, Schedule } from "../../src/types";
import { installMockApi, QA_API_ORIGIN, QA_NOW, seedAuth } from "./fixtures";

function analysis(memo: Memo, resultId = 44): AiParseResult {
  return {
    ai_result_id: resultId,
    memo_id: memo.memo_id,
    detected_type: "schedule",
    status: "suggested",
    result_status: "suggested",
    suggested_actions: [{
      type: "create_schedule",
      title: resultId === 44 ? "처음 확인한 회의" : "새 분석의 회의",
      start_datetime: QA_NOW,
    }],
    executable_action_indexes: [0],
    applied_action_indexes: [],
    remaining_action_indexes: [0],
    action_states: [{ action_index: 0, applicable: true, applied: false }],
  };
}

async function openResult(page: import("@playwright/test").Page) {
  await page.goto("/memos");
  await expect(page.getByRole("heading", { name: "QA 회의 메모", exact: true })).toBeVisible();
  const opener = page.getByRole("button", { name: "AI 추출 결과 열기", exact: true });
  if (await opener.isVisible()) await opener.click();
  const panel = page.locator("[data-flowra-memo-ai-result]");
  await expect(panel.getByText("처음 확인한 회의", { exact: true })).toBeVisible();
  return panel;
}

for (const outcome of ["success", "conflict"] as const) {
  test(`메모 단일 적용은 확인한 분석 버전을 지정하고 새 분석에 과거 상태를 덮어쓰지 않는다: ${outcome}`, async ({ page }) => {
    const api = await installMockApi(page);
    await seedAuth(page);
    const memo = api.state.memos[0];
    Object.assign(memo, { parse_status: "completed", last_ai_result_id: 44, last_ai_result: analysis(memo) });
    let attempts = 0;
    await page.route(`${QA_API_ORIGIN}/api/v1/memos/${memo.memo_id}/apply`, async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback();
      attempts += 1;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postDataJSON()).toEqual({ ai_result_id: "44", apply_type: "action", action_index: 0 });
      Object.assign(memo, { last_ai_result_id: 45, last_ai_result: analysis(memo, 45) });
      if (outcome === "conflict") {
        return route.fulfill({ status: 409, headers: { "access-control-allow-origin": "*" }, json: {
          success: false, message: "이미 적용된 분석입니다.", error: { code: "AI_RESULT_ALREADY_APPLIED" },
        } });
      }
      return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, json: {
        success: true, data: {
          apply_type: "action", result_status: "approved", applied_action_indexes: [0], remaining_action_indexes: [],
          action_states: [{ action_index: 0, applicable: true, applied: true }],
          resource: { schedule_id: 901, title: "처음 확인한 회의" },
        },
      } });
    });

    const panel = await openResult(page);
    await panel.getByRole("button", { name: "추가", exact: true }).click();
    await expect(panel.getByText("새 분석의 회의", { exact: true })).toBeVisible();
    await expect(panel.getByText("처음 확인한 회의", { exact: true })).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "추가", exact: true })).toBeEnabled();
    await expect(panel.getByRole("button", { name: "추가됨, 다시 누르면 삭제 확인", exact: true })).toHaveCount(0);
    expect(attempts).toBe(1);
    expect(api.unhandled).toEqual([]);
  });
}

test("메모 전체 적용 충돌 후 실제 저장된 액션 상태를 재조회한다", async ({ page }) => {
  const api = await installMockApi(page);
  await seedAuth(page);
  const memo = api.state.memos[0];
  const result = analysis(memo);
  result.detected_type = "mixed";
  result.suggested_actions!.push({ type: "create_task", title: "회의 자료 준비", related_action_index: 0 });
  result.executable_action_indexes = [0, 1];
  result.remaining_action_indexes = [0, 1];
  result.action_states!.push({ action_index: 1, applicable: true, applied: false });
  Object.assign(memo, { parse_status: "completed", last_ai_result_id: 44, last_ai_result: result });
  let attempts = 0;
  await page.route(`${QA_API_ORIGIN}/api/v1/memos/${memo.memo_id}/apply`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    attempts += 1;
    expect(route.request().postDataJSON()).toEqual({ ai_result_id: "44", apply_type: "all" });
    result.result_status = "partially_applied";
    result.applied_action_indexes = [0];
    result.remaining_action_indexes = [1];
    result.action_states![0].applied = true;
    return route.fulfill({ status: 409, headers: { "access-control-allow-origin": "*" }, json: {
      success: false, message: "적용 상태를 다시 확인해 주세요.", error: { code: "AI_RESULT_ALREADY_APPLIED" },
    } });
  });

  const panel = await openResult(page);
  await panel.getByRole("button", { name: "전체 추가", exact: true }).click();
  await expect(panel.getByRole("button", { name: "추가됨, 다시 누르면 삭제 확인", exact: true })).toHaveCount(1);
  await expect(panel.getByRole("button", { name: "추가", exact: true })).toBeEnabled();
  await expect(panel.getByText("적용 상태를 다시 확인해 주세요.", { exact: true })).toBeVisible();
  expect(attempts).toBe(1);
  expect(api.unhandled).toEqual([]);
});

test("삭제 후 다시 생성한 메모 일정의 새 ID에 연결 할 일을 추가한다", async ({ page }) => {
  const api = await installMockApi(page);
  await seedAuth(page);
  const memo = api.state.memos[0];
  const result = analysis(memo);
  result.detected_type = "mixed";
  result.suggested_actions!.push({ type: "create_task", title: "회의 자료 준비", related_action_index: 0 });
  result.executable_action_indexes = [0, 1];
  result.remaining_action_indexes = [0, 1];
  result.action_states!.push({ action_index: 1, applicable: true, applied: false });
  Object.assign(memo, { parse_status: "completed", last_ai_result_id: 44, last_ai_result: result });
  let attempts = 0;
  let scheduleId = 901;
  let holdScheduleLists = false;
  let releaseScheduleLists = () => {};
  const scheduleBarrier = new Promise<void>((resolve) => { releaseScheduleLists = resolve; });
  await page.route(/\/api\/v1\/schedules(?:\?.*)?$/, async (route) => {
    if (route.request().method() === "GET" && holdScheduleLists) await scheduleBarrier;
    return route.fallback();
  });
  await page.route(`${QA_API_ORIGIN}/api/v1/memos/${memo.memo_id}/apply`, async (route) => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    attempts += 1;
    const body = route.request().postDataJSON();
    expect(body.ai_result_id).toBe("44");
    if (body.action_index === 0) {
      expect(body.schedule_id).toBeUndefined();
      scheduleId = attempts === 1 ? 901 : 902;
      holdScheduleLists = scheduleId === 902;
      const schedule = {
        schedule_id: scheduleId, title: "처음 확인한 회의", schedule_type: "meeting",
        start_datetime: QA_NOW, source_memo_id: memo.memo_id, source_ai_result_id: 44,
        all_day: false, priority: "medium", visibility: "private", created_at: QA_NOW,
      } satisfies Schedule;
      api.state.schedules.push(schedule);
      result.result_status = "partially_applied";
      result.applied_action_indexes = [0];
      result.remaining_action_indexes = [1];
      result.action_states![0].applied = true;
      return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, json: {
        success: true, data: {
          apply_type: "action", result_status: "partially_applied", applied_action_indexes: [0], remaining_action_indexes: [1],
          action_states: result.action_states, resource: schedule,
        },
      } });
    }
    if (attempts === 2) {
      expect(body.schedule_id).toBe("901");
      return route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" }, json: {
        success: false, message: "연결 일정이 삭제되었습니다.", error: { code: "SCHEDULE_NOT_FOUND" },
      } });
    }
    expect(body.action_index).toBe(1);
    expect(body.schedule_id).toBe("902");
    result.result_status = "approved";
    result.applied_action_indexes = [0, 1];
    result.remaining_action_indexes = [];
    result.action_states![1].applied = true;
    releaseScheduleLists();
    return route.fulfill({ status: 201, headers: { "access-control-allow-origin": "*" }, json: {
      success: true, data: {
        apply_type: "action", result_status: "approved", applied_action_indexes: [0, 1], remaining_action_indexes: [],
        action_states: result.action_states, resource: { task_id: 1001, schedule_id: 902, title: "회의 자료 준비" },
      },
    } });
  });

  try {
    const panel = await openResult(page);
    await panel.getByRole("button", { name: "추가", exact: true }).first().click();
    await expect(panel.getByRole("button", { name: "추가됨, 다시 누르면 삭제 확인", exact: true })).toHaveCount(1);
    api.state.schedules = api.state.schedules.filter((schedule) => schedule.schedule_id !== 901);
    result.result_status = "suggested";
    result.applied_action_indexes = [];
    result.remaining_action_indexes = [0, 1];
    result.action_states![0].applied = false;
    await panel.getByRole("button", { name: "추가", exact: true }).click();
    await expect(panel.getByText("연결 일정이 삭제되었습니다.", { exact: true })).toBeVisible();
    await expect(panel.getByRole("button", { name: "추가", exact: true })).toHaveCount(2);
    await panel.getByRole("button", { name: "추가", exact: true }).first().click();
    await expect(panel.getByRole("button", { name: "추가됨, 다시 누르면 삭제 확인", exact: true })).toHaveCount(1);
    await panel.getByRole("button", { name: "추가", exact: true }).click();
    await expect(panel.getByRole("button", { name: "추가됨, 다시 누르면 삭제 확인", exact: true })).toHaveCount(2);
    expect(attempts).toBe(4);
    expect(api.unhandled).toEqual([]);
  } finally {
    releaseScheduleLists();
  }
});
