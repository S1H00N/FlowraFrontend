export type LoginType = "local" | "google" | "naver";

export interface User {
  user_id: number;
  email: string;
  name: string;
  login_type: LoginType;
  profile_image_url?: string | null;
  public_uid?: string;
  timezone?: string;
  status?: string;
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
  tokens: AuthTokens;
}

export interface SignupResponseData {
  user: User;
  tokens?: AuthTokens;
}

export interface RefreshResponseData {
  user?: User;
  tokens: AuthTokens;
}
