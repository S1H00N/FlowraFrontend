import apiClient from "./client";
import { compactParams } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CompanySchedule,
  CompanyScheduleListQuery,
} from "@/types";

type CompanyScheduleListData = Partial<ApiListData<CompanySchedule>> & {
  company_schedules?: CompanySchedule[];
};

function toUtcDateTimeParam(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return value;
}

function normalizeCompanyScheduleQuery(query: CompanyScheduleListQuery) {
  return compactParams({
    start_from: toUtcDateTimeParam(query.start_from),
    start_to: toUtcDateTimeParam(query.start_to),
  });
}

export async function listCompanySchedules(
  query: CompanyScheduleListQuery = {},
) {
  const res = await apiClient.get<ApiResponse<CompanyScheduleListData>>(
    "/company-schedules",
    {
      params: normalizeCompanyScheduleQuery(query),
    },
  );

  return {
    ...res.data,
    data: {
      company_schedules:
        res.data.data.items ?? res.data.data.company_schedules ?? [],
    },
  };
}
