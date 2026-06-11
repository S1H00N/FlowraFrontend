import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFriendPreset,
  deleteFriendPreset,
  listFriendPresets,
  replaceFriendPresetMembers,
  updateFriendPreset,
} from "@/api/friendPresets";
import type {
  CreateFriendPresetRequest,
  ReplaceFriendPresetMembersRequest,
  UpdateFriendPresetRequest,
} from "@/types";

export const FRIEND_PRESETS_QUERY_KEY = ["friend-presets"] as const;

export function useFriendPresets() {
  return useQuery({
    queryKey: [...FRIEND_PRESETS_QUERY_KEY, "list"],
    queryFn: async () => {
      const res = await listFriendPresets();
      if (!res.success)
        throw new Error(res.message || "친구 프리셋을 불러오지 못했습니다.");
      return res.data.presets;
    },
  });
}

function useInvalidateFriendPresets() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: FRIEND_PRESETS_QUERY_KEY });
}

export function useCreateFriendPreset() {
  const invalidate = useInvalidateFriendPresets();
  return useMutation({
    mutationFn: async (payload: CreateFriendPresetRequest) => {
      const res = await createFriendPreset(payload);
      if (!res.success) throw new Error(res.message || "친구 프리셋 생성에 실패했습니다.");
      return res.data.preset;
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateFriendPreset() {
  const invalidate = useInvalidateFriendPresets();
  return useMutation({
    mutationFn: async ({
      friendPresetId,
      payload,
    }: {
      friendPresetId: number;
      payload: UpdateFriendPresetRequest;
    }) => {
      const res = await updateFriendPreset(friendPresetId, payload);
      if (!res.success) throw new Error(res.message || "친구 프리셋 수정에 실패했습니다.");
      return res.data.preset;
    },
    onSuccess: () => invalidate(),
  });
}

export function useReplaceFriendPresetMembers() {
  const invalidate = useInvalidateFriendPresets();
  return useMutation({
    mutationFn: async ({
      friendPresetId,
      payload,
    }: {
      friendPresetId: number;
      payload: ReplaceFriendPresetMembersRequest;
    }) => {
      const res = await replaceFriendPresetMembers(friendPresetId, payload);
      if (!res.success)
        throw new Error(res.message || "친구 프리셋 멤버 수정에 실패했습니다.");
      return res.data.preset;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteFriendPreset() {
  const invalidate = useInvalidateFriendPresets();
  return useMutation({
    mutationFn: async (friendPresetId: number) => {
      const res = await deleteFriendPreset(friendPresetId);
      if (!res.success) throw new Error(res.message || "친구 프리셋 삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
  });
}
