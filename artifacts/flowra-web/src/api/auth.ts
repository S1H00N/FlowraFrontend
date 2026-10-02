import apiClient from "./client";
import type {
  ApiResponse,
  AuthTokens,
  ForgotPasswordRequest,
  ForgotPasswordResponseData,
  GoogleLinkTicketData,
  GoogleLinkWithPasswordRequest,
  GooglePrepareResponseData,
  GoogleSignupRequest,
  GoogleSignupResponseData,
  LinkedAuthAccount,
  LoginRequest,
  LoginResponseData,
  ResendVerificationEmailRequest,
  ResendVerificationEmailResponseData,
  ResetPasswordRequest,
  SignupRequest,
  SignupResponseData,
  UpdateUserRequest,
  User,
  VerifyEmailRequest,
  VerifyEmailResponseData,
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
      refresh_expires_at: data.tokens.refresh_expires_at,
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
  const res = await apiClient.post<ApiResponse<SignupResponseData>>(
    "/auth/signup",
    payload,
  );
  return res.data;
}

export async function verifyEmail(payload: VerifyEmailRequest) {
  const res = await apiClient.post<ApiResponse<RawLoginResponseData>>(
    "/auth/verify-email",
    payload,
  );
  return {
    ...res.data,
    data: normalizeLoginData(res.data.data) as VerifyEmailResponseData,
  };
}

export async function resendVerificationEmail(
  payload: ResendVerificationEmailRequest,
) {
  const res = await apiClient.post<
    ApiResponse<ResendVerificationEmailResponseData>
  >("/auth/resend-verification-email", payload);
  return res.data;
}

export async function forgotPassword(payload: ForgotPasswordRequest) {
  const res = await apiClient.post<ApiResponse<ForgotPasswordResponseData>>(
    "/auth/forgot-password",
    payload,
  );
  return res.data;
}

export async function resetPassword(payload: ResetPasswordRequest) {
  const res = await apiClient.post<ApiResponse<Record<string, never>>>(
    "/auth/reset-password",
    payload,
  );
  return res.data;
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

type RawGooglePrepareData =
  | Exclude<GooglePrepareResponseData, { next_action: "signed_in" }>
  | (RawLoginResponseData & { next_action: "signed_in" });

export async function prepareGoogleLogin(idToken: string) {
  const res = await apiClient.post<ApiResponse<RawGooglePrepareData>>(
    "/auth/google/prepare",
    { id_token: idToken },
  );
  const data: GooglePrepareResponseData = res.data.data.next_action === "signed_in"
    ? { ...normalizeLoginData(res.data.data), next_action: "signed_in" }
    : res.data.data;
  return { ...res.data, data };
}

export async function linkGoogleWithPassword(payload: GoogleLinkWithPasswordRequest) {
  const res = await apiClient.post<ApiResponse<RawLoginResponseData>>(
    "/auth/google/link-with-password",
    payload,
  );
  return { ...res.data, data: normalizeLoginData(res.data.data) };
}

export async function signupWithGoogle(payload: GoogleSignupRequest) {
  // The verified Google email comes from the ticket, never from a form field.
  const res = await apiClient.post<ApiResponse<
    RawLoginResponseData | Extract<GoogleSignupResponseData, { requires_email_verification: true }>
  >>("/auth/google/signup", {
    link_ticket: payload.link_ticket,
    name: payload.name,
    password: payload.password,
    ...(payload.timezone ? { timezone: payload.timezone } : {}),
  });
  const data: GoogleSignupResponseData = "requires_email_verification" in res.data.data &&
      res.data.data.requires_email_verification
    ? res.data.data
    : normalizeLoginData(res.data.data as RawLoginResponseData);
  return { ...res.data, data };
}

export async function prepareGoogleLink(idToken: string) {
  const res = await apiClient.post<ApiResponse<GoogleLinkTicketData>>(
    "/auth/google/prepare-link",
    { id_token: idToken },
  );
  return res.data;
}

export async function linkGoogleToSession(payload: { link_ticket: string; password: string }) {
  const res = await apiClient.post<ApiResponse<unknown>>("/auth/google/link", payload);
  return res.data;
}

export async function getLinkedGoogleAccounts() {
  const res = await apiClient.get<ApiResponse<LinkedAuthAccount[] | { accounts: LinkedAuthAccount[] }>>(
    "/auth/google/accounts",
  );
  return {
    ...res.data,
    data: Array.isArray(res.data.data) ? res.data.data : res.data.data.accounts,
  };
}
