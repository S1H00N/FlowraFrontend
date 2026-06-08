export type PushProvider = "fcm";
export type PushPlatform = "web" | "android";
export type PushDeviceStatus = "active" | "inactive";

export interface PushDevice {
  push_device_id: number;
  user_id: number;
  provider: PushProvider;
  platform: PushPlatform;
  device_name?: string | null;
  app_version?: string | null;
  status: PushDeviceStatus;
  last_seen_at?: string | null;
  failed_count?: number;
  last_error_code?: string | null;
  last_error_message?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface RegisterPushDeviceRequest {
  provider?: PushProvider;
  platform: PushPlatform;
  device_token: string;
  device_name?: string | null;
  app_version?: string | null;
}

export interface UnregisterPushDeviceRequest {
  device_token: string;
}
