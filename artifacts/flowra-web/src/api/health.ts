import apiClient from "./client";
import type { ApiResponse } from "@/types";

export async function getHealth() {
  const res = await apiClient.get<ApiResponse<Record<string, never>>>("/health");
  return res.data;
}
