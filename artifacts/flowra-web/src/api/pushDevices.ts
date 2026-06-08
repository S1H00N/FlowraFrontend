import { apiClient } from "./client";
import { compactParams } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  PushDevice,
  RegisterPushDeviceRequest,
  UnregisterPushDeviceRequest,
} from "@/types";

interface PushDevicesData {
  devices: PushDevice[];
}

type PushDeviceListData = ApiListData<PushDevice> & {
  devices?: PushDevice[];
};
type PushDeviceData = PushDevice | { device: PushDevice };

function unwrapPushDevice(data: PushDeviceData): PushDevice {
  return "device" in data ? data.device : data;
}

export async function listPushDevices() {
  const res =
    await apiClient.get<ApiResponse<PushDeviceListData>>("/push/devices");
  const devices = res.data.data.items ?? res.data.data.devices ?? [];
  return {
    ...res.data,
    data: { devices } satisfies PushDevicesData,
  };
}

export async function registerPushDevice(
  payload: RegisterPushDeviceRequest,
) {
  const res = await apiClient.post<ApiResponse<PushDeviceData>>(
    "/push/devices",
    compactParams({
      provider: payload.provider ?? "fcm",
      platform: payload.platform,
      device_token: payload.device_token,
      device_name: payload.device_name,
      app_version: payload.app_version,
    }),
  );
  return { ...res.data, data: { device: unwrapPushDevice(res.data.data) } };
}

export async function unregisterPushDevice(
  payload: UnregisterPushDeviceRequest,
) {
  const res = await apiClient.post<ApiResponse<PushDeviceData>>(
    "/push/devices/unregister",
    payload,
  );
  return { ...res.data, data: { device: unwrapPushDevice(res.data.data) } };
}

export async function deletePushDevice(pushDeviceId: number) {
  const res = await apiClient.delete<ApiResponse<PushDeviceData>>(
    `/push/devices/${pushDeviceId}`,
  );
  return { ...res.data, data: { device: unwrapPushDevice(res.data.data) } };
}
