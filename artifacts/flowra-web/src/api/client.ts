import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from "axios";
import { authStorage } from "@/lib/auth-storage";

const baseURL = import.meta.env.VITE_API_BASE_URL;

if (!baseURL) {
  throw new Error("VITE_API_BASE_URL environment variable is required.");
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  _skipAuthRefresh?: boolean;
  _authUserId?: number | null;
}

interface RefreshResponseData {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  tokens?: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

interface ApiErrorBody {
  success?: boolean;
  message?: string;
  error?: { code?: string };
}

export const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`.slice(0, 40);
}

function isPublicAuthRequest(config: InternalAxiosRequestConfig) {
  const pathname = (config.url ?? "").split(/[?#]/, 1)[0];
  return /\/auth\/(login|signup|refresh|logout|verify-email|resend-verification-email|forgot-password|reset-password)\/?$/.test(pathname);
}

function prepareRetry(config: RetriableConfig, token: string) {
  config._retry = true;
  config.headers.set("Authorization", `Bearer ${token}`);
  config.headers.set("X-Request-Id", createRequestId());
}

// ---- Auth failure callback (set by AuthProvider) ----

let onAuthFailure: (() => void) | null = null;

export function setOnAuthFailure(handler: (() => void) | null) {
  onAuthFailure = handler;
}

// ---- Refresh queue ----

let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function flushQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error || !token) reject(error);
    else resolve(token);
  });
  pendingQueue = [];
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = authStorage.getRefreshToken();
  if (!refreshToken) {
    throw new Error("No refresh token available");
  }

  // Use a separate axios call so it doesn't trigger this interceptor
  const res = await axios.post<{
    success: boolean;
    message: string;
    data: RefreshResponseData;
  }>(
    `${baseURL}/auth/refresh`,
    { refresh_token: refreshToken },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": createRequestId(),
      },
    },
  );

  const tokens = res.data?.data?.tokens ?? res.data?.data;
  if (!res.data?.success || !tokens?.access_token || !tokens?.refresh_token) {
    throw new Error(res.data?.message || "Failed to refresh token");
  }

  if (authStorage.getRefreshToken() !== refreshToken) {
    throw new axios.CanceledError("Session changed while refreshing");
  }

  authStorage.setTokens(tokens.access_token, tokens.refresh_token);
  return tokens.access_token;
}

function handleAuthFailure() {
  authStorage.clear();
  if (onAuthFailure) onAuthFailure();
}

// ---- Request interceptor: attach access token ----

apiClient.interceptors.request.use((config: RetriableConfig) => {
  const userId = authStorage.getUser<{ user_id: number }>()?.user_id ?? null;
  if (config._retry && config._authUserId !== userId) {
    throw new axios.CanceledError("Session changed before retrying");
  }
  config._authUserId = userId;
  const token = authStorage.getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  if (!config.headers.has("X-Request-Id")) {
    config.headers.set("X-Request-Id", createRequestId());
  }
  return config;
});

// ---- Response interceptor: refresh on 401 / TOKEN_EXPIRED ----

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as RetriableConfig | undefined;
    const status = error.response?.status;
    const code = error.response?.data?.error?.code;
    const isPublicAuthError =
      code === "INVALID_CREDENTIALS" ||
      code === "INVALID_EMAIL_TOKEN" ||
      code === "INVALID_REFRESH_TOKEN";

    const isAuthError =
      !isPublicAuthError &&
      (status === 401 || code === "TOKEN_EXPIRED" || code === "UNAUTHORIZED");

    if (
      !isAuthError ||
      !original ||
      original._retry ||
      original._skipAuthRefresh ||
      isPublicAuthRequest(original)
    ) {
      return Promise.reject(error);
    }

    const userId = authStorage.getUser<{ user_id: number }>()?.user_id ?? null;
    if (original._authUserId !== userId) return Promise.reject(error);

    // A delayed 401 may refer to the token another request already rotated.
    // Reuse that token instead of revoking its session with a second refresh.
    const currentToken = authStorage.getAccessToken();
    if (userId !== null && currentToken &&
        original.headers.get("Authorization") !== `Bearer ${currentToken}`) {
      prepareRetry(original, currentToken);
      return apiClient(original as AxiosRequestConfig);
    }

    // No refresh token? Force logout.
    if (!authStorage.getRefreshToken()) {
      handleAuthFailure();
      return Promise.reject(error);
    }

    // If a refresh is already in progress, queue this request.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token: string) => {
            prepareRetry(original, token);
            resolve(apiClient(original as AxiosRequestConfig));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;
    const refreshToken = authStorage.getRefreshToken();

    try {
      const newToken = await refreshAccessToken();
      flushQueue(null, newToken);
      prepareRetry(original, newToken);
      return apiClient(original as AxiosRequestConfig);
    } catch (refreshError) {
      flushQueue(refreshError, null);
      if (authStorage.getRefreshToken() === refreshToken) handleAuthFailure();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
