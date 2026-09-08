import { useQuery } from "@tanstack/react-query";
import { getNotice, listNotices } from "@/api/notices";
import type { NoticesQuery } from "@/types";

export const NOTICES_QUERY_KEY = ["notices"] as const;

export function useNotices(query: NoticesQuery = {}) {
  return useQuery({
    queryKey: [...NOTICES_QUERY_KEY, "list", query],
    queryFn: async () => {
      const res = await listNotices(query);
      if (!res.success)
        throw new Error(res.message || "공지를 불러오지 못했습니다.");
      return res.data;
    },
  });
}

export function useNotice(noticeId: number | null) {
  return useQuery({
    queryKey: [...NOTICES_QUERY_KEY, "detail", noticeId],
    enabled: noticeId !== null,
    queryFn: async () => {
      const res = await getNotice(noticeId as number);
      if (!res.success)
        throw new Error(res.message || "공지를 불러오지 못했습니다.");
      return res.data.notice;
    },
  });
}
