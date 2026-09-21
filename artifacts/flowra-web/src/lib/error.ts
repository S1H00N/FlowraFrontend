import axios from "axios";

interface ErrorBody {
  message?: string;
  code?: string;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

export function getApiErrorDetails(err: unknown) {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as ErrorBody | undefined;
  const headers = err.response?.headers;
  return {
    status: err.response?.status ?? null,
    code: data?.error?.code ?? data?.code ?? null,
    message: data?.message ?? data?.error?.message ?? null,
    details: data?.error?.details ?? null,
    requestId: (typeof headers?.get === "function"
      ? headers.get("x-request-id")
      : headers?.["x-request-id"]) ?? null,
  };
}

export function getErrorCode(err: unknown): string | null {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: { code?: string }; code?: string }
      | undefined;
    return data?.error?.code ?? data?.code ?? null;
  }
  return null;
}

export function getErrorMessage(err: unknown, fallback = "오류가 발생했습니다."): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as ErrorBody | undefined;
    if (data?.message) return data.message;
    if (data?.error?.message) return data.error.message;
    // HTML from a proxy and network failures do not contain an API message.
    return fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
