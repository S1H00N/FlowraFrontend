import { useQuery } from "@tanstack/react-query";
import { getTodayHome } from "@/api/home";
import type { HomeTodayQuery, TodayHome } from "@/types";

export const TODAY_HOME_QUERY_KEY = ["home", "today"] as const;

export function todayHomeKey(query: HomeTodayQuery = {}) {
  return [...TODAY_HOME_QUERY_KEY, query] as const;
}

export function useTodayHome(query: HomeTodayQuery = {}) {
  return useQuery<TodayHome>({
    queryKey: todayHomeKey(query),
    queryFn: async () => {
      const res = await getTodayHome(query);
      if (!res.success) {
        throw new Error(res.message || "오늘 홈 피드를 가져오지 못했습니다.");
      }
      return res.data;
    },
    staleTime: 1000 * 60,
  });
}
