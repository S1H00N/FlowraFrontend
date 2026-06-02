import apiClient from "./client";
import { compactParams } from "./normalize";
import type { ApiResponse, Holiday, HolidayRangeQuery } from "@/types";

interface HolidayListData {
  holidays?: Holiday[];
}

export async function listHolidaysInRange(query: HolidayRangeQuery) {
  const res = await apiClient.get<ApiResponse<HolidayListData>>(
    "/holidays/range",
    {
      params: compactParams({
        start_date: query.start_date,
        end_date: query.end_date,
        country_code: query.country_code,
        public_only:
          query.public_only === undefined ? undefined : String(query.public_only),
      }),
    },
  );

  return {
    ...res.data,
    data: {
      holidays: res.data.data.holidays ?? [],
    },
  };
}
