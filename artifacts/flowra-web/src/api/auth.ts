import apiClient from "./client";
import type {
  ApiResponse,
  LoginRequest,
  LoginResponseData,
  SignupRequest,
  SignupResponseData,
  UpdateUserRequest,
  User,
} from "@/types";

export async function login(payload: LoginRequest) {
  const res = await apiClient.post<ApiResponse<LoginResponseData>>(
    "/auth/login",
    payload,
  );
  return res.data;
}

export async function signup(payload: SignupRequest) {
  const res = await apiClient.post<ApiResponse<SignupResponseData>>(
    "/auth/signup",
    payload,
  );
  return res.data;
}

export async function getMe() {
  const res = await apiClient.get<ApiResponse<{ user: User }>>("/users/me");
  return res.data;
}

export async function updateMe(payload: UpdateUserRequest) {
  const res = await apiClient.patch<ApiResponse<{ user: User }>>(
    "/users/me",
    payload,
  );
  return res.data;
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
