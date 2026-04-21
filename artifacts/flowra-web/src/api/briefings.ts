import apiClient from "./client";
import type { ApiResponse, TodayBriefing } from "@/types";

export async function getTodayBriefing() {
  const res = await apiClient.get<ApiResponse<TodayBriefing>>("/briefings/today");
  return res.data;
}
