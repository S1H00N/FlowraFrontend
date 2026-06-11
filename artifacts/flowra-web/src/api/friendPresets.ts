import apiClient from "./client";
import type {
  ApiResponse,
  CreateFriendPresetRequest,
  FriendPreset,
  ReplaceFriendPresetMembersRequest,
  UpdateFriendPresetRequest,
} from "@/types";

interface FriendPresetsListData {
  presets?: FriendPreset[];
}

type FriendPresetData = FriendPreset | { preset: FriendPreset };

function unwrapPreset(data: FriendPresetData): FriendPreset {
  return "preset" in data ? data.preset : data;
}

export async function listFriendPresets() {
  const res =
    await apiClient.get<ApiResponse<FriendPresetsListData>>("/friend-presets");
  return {
    ...res.data,
    data: { presets: res.data.data.presets ?? [] },
  };
}

export async function createFriendPreset(payload: CreateFriendPresetRequest) {
  const res = await apiClient.post<ApiResponse<FriendPresetData>>(
    "/friend-presets",
    payload,
  );
  return { ...res.data, data: { preset: unwrapPreset(res.data.data) } };
}

export async function updateFriendPreset(
  friendPresetId: number,
  payload: UpdateFriendPresetRequest,
) {
  const res = await apiClient.patch<ApiResponse<FriendPresetData>>(
    `/friend-presets/${friendPresetId}`,
    payload,
  );
  return { ...res.data, data: { preset: unwrapPreset(res.data.data) } };
}

export async function replaceFriendPresetMembers(
  friendPresetId: number,
  payload: ReplaceFriendPresetMembersRequest,
) {
  const res = await apiClient.put<ApiResponse<FriendPresetData>>(
    `/friend-presets/${friendPresetId}/members`,
    payload,
  );
  return { ...res.data, data: { preset: unwrapPreset(res.data.data) } };
}

export async function deleteFriendPreset(friendPresetId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/friend-presets/${friendPresetId}`,
  );
  return res.data;
}
