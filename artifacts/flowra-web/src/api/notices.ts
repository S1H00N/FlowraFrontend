import apiClient from "./client";
import { compactParams } from "./normalize";
import type { ApiResponse, Notice, NoticesData, NoticesQuery } from "@/types";

export async function listNotices(query: NoticesQuery = {}) {
  const res = await apiClient.get<ApiResponse<NoticesData>>("/notices", {
    params: compactParams({ page: query.page, page_size: query.page_size }),
  });
  return res.data;
}

export async function getNotice(noticeId: number) {
  const res = await apiClient.get<ApiResponse<{ notice: Notice }>>(
    `/notices/${noticeId}`,
  );
  return res.data;
}
