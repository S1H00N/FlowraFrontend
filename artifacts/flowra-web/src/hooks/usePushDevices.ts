import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deletePushDevice,
  listPushDevices,
  registerPushDevice,
  unregisterPushDevice,
} from "@/api/pushDevices";
import type { PushDevice, RegisterPushDeviceRequest } from "@/types";

export const PUSH_DEVICES_QUERY_KEY = ["push-devices"] as const;

export function usePushDevices() {
  return useQuery<PushDevice[]>({
    queryKey: PUSH_DEVICES_QUERY_KEY,
    queryFn: async () => {
      const res = await listPushDevices();
      if (!res.success) {
        throw new Error(res.message || "푸시 디바이스를 불러오지 못했습니다.");
      }
      return res.data.devices ?? [];
    },
  });
}

function useInvalidatePushDevices() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: PUSH_DEVICES_QUERY_KEY });
  };
}

export function useRegisterPushDevice() {
  const invalidate = useInvalidatePushDevices();
  return useMutation({
    mutationFn: async (payload: RegisterPushDeviceRequest) => {
      const res = await registerPushDevice(payload);
      if (!res.success) {
        throw new Error(res.message || "브라우저 알림 등록에 실패했습니다.");
      }
      return res.data.device;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "브라우저 알림을 켰습니다.",
      errorMessage: "브라우저 알림 등록에 실패했습니다.",
    },
  });
}

export function useUnregisterPushDevice() {
  const invalidate = useInvalidatePushDevices();
  return useMutation({
    mutationFn: async (deviceToken: string) => {
      const res = await unregisterPushDevice({ device_token: deviceToken });
      if (!res.success) {
        throw new Error(res.message || "브라우저 알림 해제에 실패했습니다.");
      }
      return res.data.device;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "이 브라우저의 알림을 껐습니다.",
      errorMessage: "브라우저 알림 해제에 실패했습니다.",
    },
  });
}

export function useDeletePushDevice() {
  const invalidate = useInvalidatePushDevices();
  return useMutation({
    mutationFn: async (pushDeviceId: number) => {
      const res = await deletePushDevice(pushDeviceId);
      if (!res.success) {
        throw new Error(res.message || "푸시 디바이스 비활성화에 실패했습니다.");
      }
      return res.data.device;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "알림 디바이스를 비활성화했습니다.",
      errorMessage: "알림 디바이스 비활성화에 실패했습니다.",
    },
  });
}
