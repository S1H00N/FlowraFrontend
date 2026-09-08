import apiClient from "./client";
import { compactParams, toOptionalString } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CompanySchedule,
  CompanyScheduleApprovalStatusData,
  CompanyScheduleListResponseData,
  CompanyScheduleListQuery,
  CreateCompanyScheduleApiRequest,
  UpdateCompanyScheduleRequest,
} from "@/types";

type CompanyScheduleListData = Partial<
  ApiListData<CompanySchedule> & CompanyScheduleListResponseData
>;
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
    include_project_work_items:
      query.include_project_work_items === undefined
        ? undefined
        : String(query.include_project_work_items),
    include_done_project_work_items:
      query.include_done_project_work_items === undefined
        ? undefined
        : String(query.include_done_project_work_items),
    project_id: toOptionalString(query.project_id),
    project_work_item_limit: query.project_work_item_limit,
  });
}

function normalizeCreateCompanySchedulePayload(
  payload: CreateCompanyScheduleApiRequest,
) {
  const targetDepartmentIds = payload.target_department_ids
    ?.map((departmentId) => toOptionalString(departmentId))
    .filter((departmentId): departmentId is string => Boolean(departmentId));

  return compactParams({
    ...payload,
    company_id: toOptionalString(payload.company_id),
    description: payload.description || undefined,
    end_datetime: payload.end_datetime || undefined,
    location: payload.location || undefined,
    target_department_ids:
      targetDepartmentIds && targetDepartmentIds.length > 0
        ? targetDepartmentIds
        : undefined,
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
      project_work_items: res.data.data.project_work_items ?? [],
      summary: res.data.data.summary,
      pagination: res.data.data.pagination,
    },
  };
}

export async function createCompanySchedule(
  payload: CreateCompanyScheduleApiRequest,
) {
  const res = await apiClient.post<ApiResponse<CompanyScheduleData>>(
    "/company-schedules",
    normalizeCreateCompanySchedulePayload(payload),
  );
  return {
    ...res.data,
    data: {
      company_schedule: unwrapCompanySchedule(res.data.data),
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
