import apiClient from "./client";
import { compactParams } from "./normalize";
import type { ApiResponse, TodayBriefing, TodayBriefingQuery } from "@/types";

export async function getTodayBriefing(query: TodayBriefingQuery = {}) {
  const res = await apiClient.get<ApiResponse<TodayBriefing>>(
    "/briefings/today",
    {
      params: compactParams({
        date: query.date,
      }),
    },
  );
  return res.data;
}
