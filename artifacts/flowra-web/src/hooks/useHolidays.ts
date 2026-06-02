import { useQuery } from "@tanstack/react-query";
import { listHolidaysInRange } from "@/api/holidays";
import type { Holiday, HolidayRangeQuery } from "@/types";

export const HOLIDAYS_QUERY_KEY = ["holidays"] as const;

export function holidaysRangeKey(query: HolidayRangeQuery) {
  return [...HOLIDAYS_QUERY_KEY, "range", query] as const;
}

export function useHolidaysInRange(
  query: HolidayRangeQuery | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery<Holiday[]>({
    queryKey: query
      ? holidaysRangeKey(query)
      : [...HOLIDAYS_QUERY_KEY, "range", "idle"],
    enabled: Boolean(query) && (options.enabled ?? true),
    staleTime: 1000 * 60 * 60,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      if (!query) return [];
      const res = await listHolidaysInRange(query);
      if (!res.success) {
        throw new Error(res.message || "공휴일을 불러오지 못했습니다.");
      }
      return res.data.holidays ?? [];
    },
  });
}
