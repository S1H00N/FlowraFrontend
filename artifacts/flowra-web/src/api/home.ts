import apiClient from "./client";
import type { ApiResponse, HomeTodayQuery, TodayHome } from "@/types";

export async function getTodayHome(query: HomeTodayQuery = {}) {
  const res = await apiClient.get<ApiResponse<TodayHome>>("/home/today", {
    params: query,
  });
  return res.data;
}
