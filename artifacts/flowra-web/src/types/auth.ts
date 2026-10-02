export type LoginType = "local" | "google" | "naver";

export interface User {
  user_id: number;
  email: string;
  name: string;
  login_type: LoginType;
  profile_image_url?: string | null;
  public_uid?: string;
  timezone?: string | null;
  status?: string;
  banned_until?: string | null;
  ban_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_at?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginResponseData {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_at?: string;
}

export interface LegacyTokenResponseData {
  user: User;
  tokens: AuthTokens;
}

export interface SignupResponseData {
  user: User;
  requires_email_verification: boolean;
  email_sent: boolean;
  verification_expires_at: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export type VerifyEmailResponseData = LoginResponseData;

export interface ResendVerificationEmailRequest {
  email: string;
}

export interface ResendVerificationEmailResponseData {
  accepted: boolean;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ForgotPasswordResponseData {
  accepted: boolean;
}

export interface ResetPasswordRequest {
  token: string;
  new_password: string;
  new_password_confirm: string;
}

export type RefreshResponseData = AuthTokens;

export interface UpdateUserRequest {
  name?: string;
  profile_image_url?: string | null;
  timezone?: string;
}

export interface GoogleProfile {
  email: string;
  name?: string;
  picture?: string | null;
}

export interface GoogleLinkTicketData {
  link_ticket: string;
  expires_at: string;
  google_profile?: GoogleProfile;
}

export interface GoogleExistingAccount {
  name: string;
  masked_email?: string;
  email_masked?: string;
}

export type GooglePrepareResponseData =
  | (LoginResponseData & { next_action: "signed_in" })
  | (GoogleLinkTicketData & {
      next_action: "existing_account" | "signup";
      google_profile: GoogleProfile;
      existing_account: GoogleExistingAccount | null;
    });

export interface GoogleLinkWithPasswordRequest {
  link_ticket: string;
  email: string;
  password: string;
}

export interface GoogleSignupRequest {
  link_ticket: string;
  name: string;
  password: string;
  timezone?: string;
}

export interface GoogleEmailVerificationData {
  requires_email_verification: true;
  email_sent?: boolean;
  verification_expires_at?: string;
}

export type GoogleSignupResponseData =
  | (LoginResponseData & { requires_email_verification?: false })
  | GoogleEmailVerificationData;

export interface LinkedAuthAccount {
  provider: string;
  linked_at?: string;
  created_at?: string;
}
