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
    { headers: { "Content-Type": "application/json" } },
  );

  const tokens = res.data?.data?.tokens ?? res.data?.data;
  if (!res.data?.success || !tokens?.access_token || !tokens?.refresh_token) {
    throw new Error(res.data?.message || "Failed to refresh token");
  }

  authStorage.setTokens(tokens.access_token, tokens.refresh_token);
  return tokens.access_token;
}

function handleAuthFailure() {
  authStorage.clear();
  if (onAuthFailure) onAuthFailure();
}

// ---- Request interceptor: attach access token ----

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = authStorage.getAccessToken();
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`);
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

    const isAuthError =
      status === 401 || code === "TOKEN_EXPIRED" || code === "UNAUTHORIZED";

    if (
      !isAuthError ||
      !original ||
      original._retry ||
      original._skipAuthRefresh
    ) {
      return Promise.reject(error);
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
            original._retry = true;
            original.headers.set("Authorization", `Bearer ${token}`);
            resolve(apiClient(original as AxiosRequestConfig));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const newToken = await refreshAccessToken();
      flushQueue(null, newToken);
      original.headers.set("Authorization", `Bearer ${newToken}`);
      return apiClient(original as AxiosRequestConfig);
    } catch (refreshError) {
      flushQueue(refreshError, null);
      handleAuthFailure();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default apiClient;
