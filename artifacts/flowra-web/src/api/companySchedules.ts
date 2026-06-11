import apiClient from "./client";
import { compactParams } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CompanySchedule,
  CompanyScheduleApprovalStatusData,
  CompanyScheduleListQuery,
  UpdateCompanyScheduleRequest,
} from "@/types";

type CompanyScheduleListData = Partial<ApiListData<CompanySchedule>> & {
  company_schedules?: CompanySchedule[];
};
type CompanyScheduleData =
  | CompanySchedule
  | { company_schedule: CompanySchedule }
  | { schedule: CompanySchedule };

function unwrapCompanySchedule(data: CompanyScheduleData): CompanySchedule {
  if ("company_schedule" in data) return data.company_schedule;
  if ("schedule" in data) return data.schedule;
  return data;
}

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

export async function getCompanySchedule(companyScheduleId: number) {
  const res = await apiClient.get<ApiResponse<CompanyScheduleData>>(
    `/company-schedules/${companyScheduleId}`,
  );
  return {
    ...res.data,
    data: {
      company_schedule: unwrapCompanySchedule(res.data.data),
    },
  };
}

export async function updateCompanySchedule(
  companyScheduleId: number,
  payload: UpdateCompanyScheduleRequest,
) {
  const res = await apiClient.patch<ApiResponse<CompanyScheduleData>>(
    `/company-schedules/${companyScheduleId}`,
    compactParams(payload as Record<string, unknown>),
  );
  return {
    ...res.data,
    data: {
      company_schedule: unwrapCompanySchedule(res.data.data),
    },
  };
}

export async function deleteCompanySchedule(companyScheduleId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/company-schedules/${companyScheduleId}`,
  );
  return res.data;
}

export async function getCompanyScheduleApprovalStatus(
  companyScheduleId: number,
) {
  const res = await apiClient.get<ApiResponse<CompanyScheduleApprovalStatusData>>(
    `/company-schedules/${companyScheduleId}/approval-status`,
  );
  return res.data;
}
