import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/api/auth";
import type { User } from "@/types";

export const ME_QUERY_KEY = ["users", "me"] as const;

export function useMe() {
  return useQuery<User>({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      const res = await getMe();
      if (!res.success) {
        throw new Error(res.message || "사용자 정보를 가져오지 못했습니다.");
      }
      return res.data.user;
    },
    staleTime: 1000 * 60,
  });
}
