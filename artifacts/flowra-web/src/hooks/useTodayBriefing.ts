import { useQuery } from "@tanstack/react-query";
import { getTodayBriefing } from "@/api/briefings";
import type { TodayBriefing } from "@/types";

export const TODAY_BRIEFING_QUERY_KEY = ["briefings", "today"] as const;

export function useTodayBriefing() {
  return useQuery<TodayBriefing>({
    queryKey: TODAY_BRIEFING_QUERY_KEY,
    queryFn: async () => {
      const res = await getTodayBriefing();
      if (!res.success) {
        throw new Error(res.message || "오늘 브리핑을 가져오지 못했습니다.");
      }
      return res.data;
    },
    staleTime: 1000 * 60,
  });
}
