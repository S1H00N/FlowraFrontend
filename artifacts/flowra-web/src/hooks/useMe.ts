import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getMe, updateMe } from "@/api/auth";
import { authStorage } from "@/lib/auth-storage";
import type { UpdateUserRequest, User } from "@/types";

export const ME_QUERY_KEY = ["users", "me"] as const;

export function useMe() {
  return useQuery<User>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const res = await getMe();
      if (!res.success) {
        throw new Error(res.message || "사용자 정보를 가져오지 못했습니다.");
      }
      return res.data;
    },
    staleTime: 1000 * 60,
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: UpdateUserRequest) => {
      const res = await updateMe(payload);
      if (!res.success) {
        throw new Error(res.message || "프로필 수정에 실패했습니다.");
      }
      return res.data;
    },
    onSuccess: (user) => {
      authStorage.setUser(user);
      queryClient.setQueryData(ME_QUERY_KEY, user);
    },
    meta: {
      successMessage: "프로필을 저장했습니다.",
      errorMessage: "프로필 수정에 실패했습니다.",
    },
  });
}
