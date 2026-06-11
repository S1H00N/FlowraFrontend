import { useQuery } from "@tanstack/react-query";
import { checkHoliday, listHolidays, listHolidaysInRange } from "@/api/holidays";
import type {
  Holiday,
  HolidayCheckQuery,
  HolidayCheckResult,
  HolidayListQuery,
  HolidayRangeQuery,
} from "@/types";

export const HOLIDAYS_QUERY_KEY = ["holidays"] as const;

export function holidaysRangeKey(query: HolidayRangeQuery) {
  return [...HOLIDAYS_QUERY_KEY, "range", query] as const;
}

export function holidaysListKey(query: HolidayListQuery) {
  return [...HOLIDAYS_QUERY_KEY, "list", query] as const;
}

export function holidayCheckKey(query: HolidayCheckQuery) {
  return [...HOLIDAYS_QUERY_KEY, "check", query] as const;
}

export function useHolidays(
  query: HolidayListQuery | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery<Holiday[]>({
    queryKey: query
      ? holidaysListKey(query)
      : [...HOLIDAYS_QUERY_KEY, "list", "idle"],
    enabled: Boolean(query) && (options.enabled ?? true),
    staleTime: 1000 * 60 * 60,
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      if (!query) return [];
      const res = await listHolidays(query);
      if (!res.success) {
        throw new Error(res.message || "공휴일을 불러오지 못했습니다.");
      }
      return res.data.holidays ?? [];
    },
  });
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

export function useHolidayCheck(
  query: HolidayCheckQuery | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery<HolidayCheckResult>({
    queryKey: query
      ? holidayCheckKey(query)
      : [...HOLIDAYS_QUERY_KEY, "check", "idle"],
    enabled: Boolean(query) && (options.enabled ?? true),
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      if (!query) {
        return {
          date: "",
          country_code: "KR",
          is_holiday: false,
          holidays: [],
        };
      }
      const res = await checkHoliday(query);
      if (!res.success) {
        throw new Error(res.message || "공휴일 여부를 확인하지 못했습니다.");
      }
      return res.data;
    },
  });
}
