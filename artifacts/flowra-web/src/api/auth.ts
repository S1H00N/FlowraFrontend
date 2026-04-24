import apiClient from "./client";
import type {
  ApiResponse,
  AuthTokens,
  LoginRequest,
  LoginResponseData,
  SignupRequest,
  SignupResponseData,
  UpdateUserRequest,
  User,
} from "@/types";

type RawLoginResponseData =
  | LoginResponseData
  | {
      user: User;
      tokens: AuthTokens;
    };

type RawUserResponseData = User | { user: User };

function normalizeLoginData(data: RawLoginResponseData): LoginResponseData {
  if ("tokens" in data) {
    return {
      user: data.user,
      access_token: data.tokens.access_token,
      refresh_token: data.tokens.refresh_token,
      expires_in: data.tokens.expires_in,
    };
  }
  return data;
}

function normalizeUserData(data: RawUserResponseData): User {
  return "user" in data ? data.user : data;
}

export async function login(payload: LoginRequest) {
  const res = await apiClient.post<ApiResponse<RawLoginResponseData>>(
    "/auth/login",
    payload,
  );
  return { ...res.data, data: normalizeLoginData(res.data.data) };
}

export async function signup(payload: SignupRequest) {
  const res = await apiClient.post<ApiResponse<RawUserResponseData>>(
    "/auth/signup",
    payload,
  );
  return { ...res.data, data: normalizeUserData(res.data.data) };
}

export async function getMe() {
  const res = await apiClient.get<ApiResponse<RawUserResponseData>>("/users/me");
  return { ...res.data, data: normalizeUserData(res.data.data) };
}

export async function updateMe(payload: UpdateUserRequest) {
  const res = await apiClient.patch<ApiResponse<RawUserResponseData>>(
    "/users/me",
    payload,
  );
  return { ...res.data, data: normalizeUserData(res.data.data) };
}

export async function deleteMe() {
  const res =
    await apiClient.delete<ApiResponse<Record<string, never>>>("/users/me");
  return res.data;
}

export async function logout(refreshToken: string) {
  const res = await apiClient.post<ApiResponse<Record<string, never>>>(
    "/auth/logout",
    { refresh_token: refreshToken },
  );
  return res.data;
}
