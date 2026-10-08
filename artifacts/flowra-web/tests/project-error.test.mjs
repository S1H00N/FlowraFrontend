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
const { getApiErrorDetails, getErrorMessage } = module.exports;

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
