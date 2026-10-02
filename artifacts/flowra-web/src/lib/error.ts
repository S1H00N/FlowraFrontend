import axios from "axios";

interface ErrorBody {
  message?: string;
  code?: string;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

const errorMessages: Record<string, string> = {
  INVALID_CREDENTIALS: "이메일 또는 비밀번호를 확인해 주세요.",
  EMAIL_NOT_VERIFIED: "이메일 인증을 완료한 뒤 다시 시도해 주세요.",
  SIGNUP_DISABLED: "현재 회원가입을 사용할 수 없습니다.",
  SIGNUP_DOMAIN_NOT_ALLOWED: "가입이 허용되지 않은 이메일 도메인입니다.",
  INVALID_GOOGLE_ID_TOKEN: "Google 인증이 만료되었거나 유효하지 않습니다. 다시 시작해 주세요.",
  INVALID_GOOGLE_LINK_TICKET: "Google 계정 연결 단계가 만료되었습니다. 다시 시작해 주세요.",
  GOOGLE_ACCOUNT_ALREADY_LINKED: "이미 Google 계정이 연결되어 있습니다. 연결된 계정을 확인해 주세요.",
  GOOGLE_ACCOUNT_CONFLICT: "가입 또는 연결 중 계정 정보가 변경되었습니다. 다시 로그인해 주세요.",
  GOOGLE_ACCOUNT_UNAVAILABLE: "연결된 계정을 사용할 수 없습니다. 계정 상태를 확인해 주세요.",
  GOOGLE_AUTH_RATE_LIMITED: "Google 인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  GOOGLE_LINK_FLOW_REQUIRED: "로그인한 계정의 설정에서 Google 계정을 연결해 주세요.",
  GOOGLE_LOGIN_NOT_CONFIGURED: "Google 로그인을 아직 사용할 수 없습니다. 이메일로 로그인해 주세요.",
  GOOGLE_VERIFICATION_EMAIL_FAILED: "확인 메일을 보내지 못했습니다. Google 로그인을 다시 시작해 주세요.",
  TASK_ORDER_MISMATCH: "할 일 목록이 변경되었습니다. 새로고침한 목록에서 다시 순서를 변경해 주세요.",
  TASK_SCHEDULE_REQUIRED: "일정에 연결된 할 일만 순서를 저장할 수 있습니다.",
};

function getErrorBody(err: unknown): ErrorBody | null {
  if (!axios.isAxiosError(err)) return null;
  const data: unknown = err.response?.data;
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? data as ErrorBody
    : null;
}

export function getApiErrorDetails(err: unknown) {
  if (!axios.isAxiosError(err)) return null;
  const data = getErrorBody(err);
  const headers = err.response?.headers;
  return {
    status: err.response?.status ?? null,
    code: getErrorCode(err),
    message: data?.message ?? data?.error?.message ?? null,
    details: data?.error?.details ?? null,
    requestId: (typeof headers?.get === "function"
      ? headers.get("x-request-id")
      : headers?.["x-request-id"]) ?? null,
  };
}

export function getErrorCode(err: unknown): string | null {
  if (axios.isAxiosError(err)) {
    const data = getErrorBody(err);
    const code = data?.error?.code ?? data?.code;
    if (typeof code === "string") return code;
    return err.code === "NON_JSON_RESPONSE" ? err.code : null;
  }
  return null;
}

export function getErrorMessage(err: unknown, fallback = "오류가 발생했습니다."): string {
  if (axios.isAxiosError(err)) {
    const code = getErrorCode(err);
    if (code && Object.hasOwn(errorMessages, code)) return errorMessages[code];
    const data = getErrorBody(err);
    if (typeof data?.message === "string" && data.message) return data.message;
    if (typeof data?.error?.message === "string" && data.error.message) return data.error.message;
    // HTML from a proxy and network failures do not contain an API message.
    return fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
