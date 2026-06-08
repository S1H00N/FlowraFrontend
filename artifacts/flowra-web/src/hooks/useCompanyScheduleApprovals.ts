import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveCompanyScheduleApproval,
  getCompanyScheduleApproval,
  listCompanyScheduleApprovals,
  rejectCompanyScheduleApproval,
} from "@/api/companyScheduleApprovals";
import { COMPANY_SCHEDULES_QUERY_KEY } from "@/hooks/useCompanySchedules";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CompanyScheduleApproval,
  CompanyScheduleApprovalActionRequest,
  CompanyScheduleApprovalListQuery,
} from "@/types";

export const COMPANY_SCHEDULE_APPROVALS_QUERY_KEY = [
  "company-schedule-approvals",
] as const;

export function getCompanyScheduleApprovalId(
  approval: CompanyScheduleApproval,
) {
  return (
    approval.approval_id ??
    approval.company_schedule_approval_id ??
    Number(approval.id)
  );
}

function useInvalidateCompanyScheduleApprovals() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({
      queryKey: COMPANY_SCHEDULE_APPROVALS_QUERY_KEY,
    });
    void queryClient.invalidateQueries({ queryKey: COMPANY_SCHEDULES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
  };
}

export function companyScheduleApprovalsListKey(
  query: CompanyScheduleApprovalListQuery = {},
) {
  return [...COMPANY_SCHEDULE_APPROVALS_QUERY_KEY, "list", query] as const;
}

export function useCompanyScheduleApprovals(
  query: CompanyScheduleApprovalListQuery = {},
  enabled = true,
) {
  return useQuery<CompanyScheduleApproval[]>({
    queryKey: companyScheduleApprovalsListKey(query),
    queryFn: async () => {
      const res = await listCompanyScheduleApprovals(query);
      if (!res.success) {
        throw new Error(res.message || "회사 일정 승인 요청을 불러오지 못했습니다.");
      }
      return res.data.approvals ?? [];
    },
    enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useCompanyScheduleApproval(approvalId?: number | null) {
  return useQuery<CompanyScheduleApproval>({
    queryKey: [...COMPANY_SCHEDULE_APPROVALS_QUERY_KEY, "detail", approvalId],
    queryFn: async () => {
      if (!approvalId) throw new Error("승인 요청을 찾을 수 없습니다.");
      const res = await getCompanyScheduleApproval(approvalId);
      if (!res.success) {
        throw new Error(res.message || "회사 일정 승인 요청을 불러오지 못했습니다.");
      }
      return res.data.approval;
    },
    enabled: !!approvalId,
  });
}

export function useApproveCompanyScheduleApproval() {
  const invalidate = useInvalidateCompanyScheduleApprovals();

  return useMutation({
    mutationFn: async ({
      approvalId,
      payload = {},
    }: {
      approvalId: number;
      payload?: CompanyScheduleApprovalActionRequest;
    }) => {
      const res = await approveCompanyScheduleApproval(approvalId, payload);
      if (!res.success) {
        throw new Error(res.message || "회사 일정 승인에 실패했습니다.");
      }
      return res.data.approval;
    },
    onSuccess: invalidate,
    meta: {
      successMessage: "회사 일정 요청을 승인했습니다.",
      errorMessage: "회사 일정 승인에 실패했습니다.",
    },
  });
}

export function useRejectCompanyScheduleApproval() {
  const invalidate = useInvalidateCompanyScheduleApprovals();

  return useMutation({
    mutationFn: async ({
      approvalId,
      payload = {},
    }: {
      approvalId: number;
      payload?: CompanyScheduleApprovalActionRequest;
    }) => {
      const res = await rejectCompanyScheduleApproval(approvalId, payload);
      if (!res.success) {
        throw new Error(res.message || "회사 일정 반려에 실패했습니다.");
      }
      return res.data.approval;
    },
    onSuccess: invalidate,
    meta: {
      successMessage: "회사 일정 요청을 반려했습니다.",
      errorMessage: "회사 일정 반려에 실패했습니다.",
    },
  });
}
