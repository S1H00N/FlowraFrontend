import apiClient from "./client";
import { compactParams } from "./normalize";
import type {
  ApiResponse,
  Holiday,
  HolidayCheckQuery,
  HolidayCheckResult,
  HolidayListQuery,
  HolidayRangeQuery,
} from "@/types";

interface HolidayListData {
  holidays?: Holiday[];
}

function normalizeHolidayParams(
  query: HolidayListQuery | HolidayRangeQuery | HolidayCheckQuery,
) {
  return compactParams({
    ...query,
    public_only:
      "public_only" in query && query.public_only !== undefined
        ? String(query.public_only)
        : undefined,
  });
}

export async function listHolidays(query: HolidayListQuery) {
  const res = await apiClient.get<ApiResponse<HolidayListData>>("/holidays", {
    params: normalizeHolidayParams(query),
  });

  return {
    ...res.data,
    data: {
      holidays: res.data.data.holidays ?? [],
    },
  };
}

export async function listHolidaysInRange(query: HolidayRangeQuery) {
  const res = await apiClient.get<ApiResponse<HolidayListData>>(
    "/holidays/range",
    {
      params: normalizeHolidayParams(query),
    },
  );

  return {
    ...res.data,
    data: {
      holidays: res.data.data.holidays ?? [],
    },
  };
}

export async function checkHoliday(query: HolidayCheckQuery) {
  const res = await apiClient.get<ApiResponse<HolidayCheckResult>>(
    "/holidays/check",
    {
      params: normalizeHolidayParams(query),
    },
  );
  return res.data;
}
