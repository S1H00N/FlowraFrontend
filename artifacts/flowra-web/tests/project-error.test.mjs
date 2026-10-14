import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const axios = require("axios");
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/lib/error.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  },
).outputText;
const module = { exports: {} };
new Function("require", "module", "exports", compiled)(
  require,
  module,
  module.exports,
);
const { getApiErrorDetails, getErrorMessage, isTransientApiReadError } = module.exports;

test("temporary read failures retain drafts without treating denied or invalid responses as recoverable", () => {
  assert.equal(isTransientApiReadError(new axios.AxiosError("Network Error")), true);
  for (const status of [408, 429, 500, 503])
    assert.equal(isTransientApiReadError(projectFailure({}, status)), true);
  for (const status of [200, 400, 401, 403, 404, 409])
    assert.equal(isTransientApiReadError(projectFailure({}, status)), false);
  assert.equal(isTransientApiReadError(new Error("Invalid project response")), false);
  assert.equal(isTransientApiReadError(new axios.CanceledError("Session changed")), false);
});

function projectFailure(data, status = 403) {
  return new axios.AxiosError(
    "Request failed",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status,
      statusText: "Forbidden",
      headers: { "x-request-id": "project-create-request" },
      data,
    },
  );
}

test("disabled project creation is localized for both supported error envelopes", () => {
  const message =
    "프로젝트를 생성할 수 없습니다.\n현재 소속 부서에서는 프로젝트 생성이 제한되어 있습니다. 부서 관리자에게 권한을 문의해 주세요.";
  for (const data of [
    {
      message: "Project creation is disabled for this department",
      error: { code: "COMPANY_PROJECT_CREATE_DISABLED" },
    },
    {
      error: {
        code: "COMPANY_PROJECT_CREATE_DISABLED",
        message: "Project creation is disabled for this department",
      },
    },
    {
      code: "COMPANY_PROJECT_CREATE_DISABLED",
      message: "Project creation is disabled for this department",
    },
  ]) {
    assert.equal(
      getErrorMessage(projectFailure(data), "프로젝트를 저장하지 못했습니다."),
      message,
    );
  }
});

test("other 403 codes and uncoded server messages retain their specific meaning", () => {
  for (const [code, message] of [
    [
      "COMPANY_PROJECT_CREATE_FORBIDDEN",
      "Only the department leader can create projects for this department",
    ],
    ["COMPANY_PROJECT_FORBIDDEN", "Project is not visible to this user"],
    ["FORBIDDEN", "This action is forbidden"],
    [
      "UNRECOGNIZED_PROJECT_ERROR",
      "Project creation is disabled for this department",
    ],
    [undefined, "Project creation is disabled for this department"],
  ]) {
    assert.equal(
      getErrorMessage(projectFailure({ error: { code, message } })),
      message,
    );
  }
});

test("localization preserves the original code, server message and diagnostic details", () => {
  const details = { department_id: 17 };
  const serverMessage = "Project creation is disabled for this department";
  const error = projectFailure({
    message: serverMessage,
    error: { code: "COMPANY_PROJECT_CREATE_DISABLED", details },
  });
  getErrorMessage(error);
  assert.deepEqual(getApiErrorDetails(error), {
    status: 403,
    code: "COMPANY_PROJECT_CREATE_DISABLED",
    message: serverMessage,
    details,
    requestId: "project-create-request",
  });
});

test("project contract failures explain the action while retaining server diagnostics", () => {
  for (const [code, status, message] of [
    ["PROJECT_WORK_ITEM_DEPTH_EXCEEDED", 400, "하위 업무는 최대 5단계까지 만들 수 있습니다. 이동할 업무의 하위 단계도 확인해 주세요."],
    ["INVALID_PROJECT_WORK_ITEM_PARENT", 400, "업무를 자기 자신이나 자신의 하위 업무 아래로 옮길 수 없습니다."],
    ["PROJECT_DEPENDENCY_CYCLE", 400, "업무 연결이 순환합니다. 선행·후행 업무의 연결을 확인해 주세요."],
    ["PROJECT_DEPENDENCY_EXISTS", 409, "같은 선행·후행 업무와 종류의 연결이 이미 있습니다."],
    ["PROJECT_LAST_OWNER_REQUIRED", 409, "프로젝트에는 활성 소유자가 최소 한 명 있어야 합니다."],
    ["INVALID_PROJECT_ASSIGNMENT_STATE", 400, "완료 상태의 배정에만 완료 시각을 지정할 수 있습니다."],
    ["INVALID_WORK_ITEM_DATE_RANGE", 400, "업무 계획 종료일은 시작일보다 빠를 수 없습니다."],
    ["INVALID_ASSIGNMENT_DATE_RANGE", 400, "배정 종료 시각은 시작 시각보다 빠를 수 없습니다."],
  ]) {
    const error = projectFailure({
      message: "Original server message",
      error: { code, details: { work_item_id: 101 } },
    }, status);
    assert.equal(getErrorMessage(error), message);
    assert.deepEqual(getApiErrorDetails(error), {
      status, code, message: "Original server message",
      details: { work_item_id: 101 }, requestId: "project-create-request",
    });
  }
});

test("network and unrelated server failures are not classified as disabled project creation", () => {
  const fallback = "프로젝트를 저장하지 못했습니다.";
  assert.equal(
    getErrorMessage(new axios.AxiosError("Network Error"), fallback),
    fallback,
  );
  assert.equal(
    getErrorMessage(
      projectFailure(
        {
          message: "Internal server failure",
          error: { code: "INTERNAL_SERVER_ERROR" },
        },
        500,
      ),
      fallback,
    ),
    "Internal server failure",
  );
  assert.equal(
    getErrorMessage(
      new Error("Project creation is disabled for this department"),
      fallback,
    ),
    "Project creation is disabled for this department",
  );
});
