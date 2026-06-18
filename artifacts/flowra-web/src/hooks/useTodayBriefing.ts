import { useQuery } from "@tanstack/react-query";
import { getTodayBriefing } from "@/api/briefings";
import type { TodayBriefing, TodayBriefingQuery } from "@/types";

export const TODAY_BRIEFING_QUERY_KEY = ["briefings", "today"] as const;

export function todayBriefingQueryKey(query: TodayBriefingQuery = {}) {
  return [...TODAY_BRIEFING_QUERY_KEY, query] as const;
}

export function useTodayBriefing(query: TodayBriefingQuery = {}) {
  return useQuery<TodayBriefing>({
    queryKey: todayBriefingQueryKey(query),
    queryFn: async () => {
      const res = await getTodayBriefing(query);
      if (!res.success) {
        throw new Error(res.message || "오늘 브리핑을 가져오지 못했습니다.");
      }
      return res.data;
    },
    staleTime: 1000 * 60,
  });
}
