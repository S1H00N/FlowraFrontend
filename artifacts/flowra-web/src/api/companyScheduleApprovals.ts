import apiClient from "./client";
import { compactParams } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CompanyScheduleApproval,
  CompanyScheduleApprovalActionRequest,
  CompanyScheduleApprovalListQuery,
} from "@/types";

type CompanyScheduleApprovalListData =
  | CompanyScheduleApproval[]
  | (Partial<ApiListData<CompanyScheduleApproval>> & {
      approvals?: CompanyScheduleApproval[];
      company_schedule_approvals?: CompanyScheduleApproval[];
    });

type CompanyScheduleApprovalData =
  | CompanyScheduleApproval
  | { approval: CompanyScheduleApproval }
  | { company_schedule_approval: CompanyScheduleApproval };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractApprovals(data: unknown): CompanyScheduleApproval[] {
  if (Array.isArray(data)) return data as CompanyScheduleApproval[];
  if (!isRecord(data)) return [];

  for (const key of [
    "items",
    "approvals",
    "company_schedule_approvals",
    "data",
    "results",
  ]) {
    const value = data[key];
    if (Array.isArray(value)) return value as CompanyScheduleApproval[];
    if (isRecord(value)) {
      const nested = extractApprovals(value);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function unwrapApproval(
  data: CompanyScheduleApprovalData,
): CompanyScheduleApproval {
  const record = data as Record<string, unknown>;
  if (isRecord(record.approval)) {
    return record.approval as CompanyScheduleApproval;
  }
  if (isRecord(record.company_schedule_approval)) {
    return record.company_schedule_approval as CompanyScheduleApproval;
  }
  return data as CompanyScheduleApproval;
}

export async function listCompanyScheduleApprovals(
  query: CompanyScheduleApprovalListQuery = {},
) {
  const res = await apiClient.get<ApiResponse<CompanyScheduleApprovalListData>>(
    "/company-schedule-approvals",
    {
      params: compactParams({
        status: query.status,
        role: query.role,
      }),
    },
  );

  return {
    ...res.data,
    data: {
      approvals: extractApprovals(res.data.data),
    },
  };
}

export async function getCompanyScheduleApproval(approvalId: number) {
  const res = await apiClient.get<ApiResponse<CompanyScheduleApprovalData>>(
    `/company-schedule-approvals/${approvalId}`,
  );

  return {
    ...res.data,
    data: { approval: unwrapApproval(res.data.data) },
  };
}

export async function approveCompanyScheduleApproval(
  approvalId: number,
  payload: CompanyScheduleApprovalActionRequest = {},
) {
  const res = await apiClient.post<ApiResponse<CompanyScheduleApprovalData>>(
    `/company-schedule-approvals/${approvalId}/approve`,
    compactParams({
      comment: payload.comment,
      reason: payload.reason,
    }),
  );

  return {
    ...res.data,
    data: { approval: unwrapApproval(res.data.data) },
  };
}

export async function rejectCompanyScheduleApproval(
  approvalId: number,
  payload: CompanyScheduleApprovalActionRequest = {},
) {
  const res = await apiClient.post<ApiResponse<CompanyScheduleApprovalData>>(
    `/company-schedule-approvals/${approvalId}/reject`,
    compactParams({
      comment: payload.comment,
      reason: payload.reason,
    }),
  );

  return {
    ...res.data,
    data: { approval: unwrapApproval(res.data.data) },
  };
}
