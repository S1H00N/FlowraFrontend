import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptFriendRequest,
  createFriendRequest,
  deleteFriendByPublicUid,
  deleteFriendByUserId,
  listFriendRequests,
  listFriends,
  rejectFriendRequest,
} from "@/api/friends";
import type { CreateFriendRequestPayload } from "@/types";

export const FRIENDS_QUERY_KEY = ["friends"] as const;

export function useFriends() {
  return useQuery({
    queryKey: [...FRIENDS_QUERY_KEY, "list"],
    queryFn: async () => {
      const res = await listFriends();
      if (!res.success) throw new Error(res.message || "친구 목록을 불러오지 못했습니다.");
      return res.data.friends;
    },
  });
}

export function useFriendRequests() {
  return useQuery({
    queryKey: [...FRIENDS_QUERY_KEY, "requests"],
    queryFn: async () => {
      const res = await listFriendRequests();
      if (!res.success) throw new Error(res.message || "친구 요청을 불러오지 못했습니다.");
      return res.data.requests;
    },
  });
}

function useInvalidateFriends() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });
}

export function useCreateFriendRequest() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: async (payload: CreateFriendRequestPayload) => {
      const res = await createFriendRequest(payload);
      if (!res.success) throw new Error(res.message || "친구 요청에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
  });
}

export function useAcceptFriendRequest() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: async (friendshipId: number) => {
      const res = await acceptFriendRequest(friendshipId);
      if (!res.success) throw new Error(res.message || "친구 요청 수락에 실패했습니다.");
      return res.data.friendship;
    },
    onSuccess: () => invalidate(),
  });
}

export function useRejectFriendRequest() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: async (friendshipId: number) => {
      const res = await rejectFriendRequest(friendshipId);
      if (!res.success) throw new Error(res.message || "친구 요청 거절에 실패했습니다.");
      return res.data.friendship;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteFriend() {
  const invalidate = useInvalidateFriends();
  return useMutation({
    mutationFn: async (
      target: { public_uid: string } | { friend_user_id: number },
    ) => {
      const res =
        "public_uid" in target
          ? await deleteFriendByPublicUid(target.public_uid)
          : await deleteFriendByUserId(target.friend_user_id);
      if (!res.success) throw new Error(res.message || "친구 삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
  });
}
