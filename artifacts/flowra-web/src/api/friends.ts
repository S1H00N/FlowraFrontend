import apiClient from "./client";
import type {
  ApiResponse,
  CreateFriendRequestPayload,
  CreateFriendRequestResponseData,
  Friend,
} from "@/types";

interface FriendsListData {
  friends?: Friend[];
}

interface FriendRequestsListData {
  requests?: Friend[];
}

export async function listFriends() {
  const res = await apiClient.get<ApiResponse<FriendsListData>>("/friends");
  return {
    ...res.data,
    data: { friends: res.data.data.friends ?? [] },
  };
}

export async function listFriendRequests() {
  const res = await apiClient.get<ApiResponse<FriendRequestsListData>>(
    "/friends/requests",
  );
  return {
    ...res.data,
    data: { requests: res.data.data.requests ?? [] },
  };
}

export async function createFriendRequest(payload: CreateFriendRequestPayload) {
  const res = await apiClient.post<ApiResponse<CreateFriendRequestResponseData>>(
    "/friends/requests",
    payload,
  );
  return res.data;
}

export async function acceptFriendRequest(friendshipId: number) {
  const res = await apiClient.post<ApiResponse<{ friendship: Friend }>>(
    `/friends/requests/${friendshipId}/accept`,
  );
  return res.data;
}

export async function rejectFriendRequest(friendshipId: number) {
  const res = await apiClient.post<ApiResponse<{ friendship: Friend }>>(
    `/friends/requests/${friendshipId}/reject`,
  );
  return res.data;
}

export async function deleteFriendByPublicUid(publicUid: string) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/friends/by-public-uid/${encodeURIComponent(publicUid)}`,
  );
  return res.data;
}

export async function deleteFriendByUserId(friendUserId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/friends/${friendUserId}`,
  );
  return res.data;
}
