export type LoginType = "local" | "google" | "naver";

export interface User {
  user_id: number;
  email: string;
  name: string;
  login_type: LoginType;
  profile_image_url?: string | null;
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
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export interface SignupResponseData {
  user_id: number;
  email: string;
  name: string;
  login_type: LoginType;
  created_at: string;
}
