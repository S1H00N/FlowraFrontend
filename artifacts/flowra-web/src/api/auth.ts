import apiClient from "./client";
import type {
  ApiResponse,
  LoginRequest,
  LoginResponseData,
  SignupRequest,
  SignupResponseData,
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
  const res = await apiClient.get<ApiResponse<User>>("/users/me");
  return res.data;
}
