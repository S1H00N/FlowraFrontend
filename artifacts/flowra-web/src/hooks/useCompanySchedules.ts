import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteCompanySchedule,
  getCompanySchedule,
  getCompanyScheduleApprovalStatus,
  listCompanySchedules,
  updateCompanySchedule,
} from "@/api/companySchedules";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CompanySchedule,
  CompanyScheduleApprovalStatusData,
  CompanyScheduleListQuery,
  UpdateCompanyScheduleRequest,
} from "@/types";

export const COMPANY_SCHEDULES_QUERY_KEY = ["company-schedules"] as const;

export function companySchedulesListKey(
  query: CompanyScheduleListQuery = {},
) {
  return [...COMPANY_SCHEDULES_QUERY_KEY, "list", query] as const;
}

export function companyScheduleDetailKey(companyScheduleId: number) {
  return [...COMPANY_SCHEDULES_QUERY_KEY, "detail", companyScheduleId] as const;
}

export function companyScheduleApprovalStatusKey(companyScheduleId: number) {
  return [
    ...COMPANY_SCHEDULES_QUERY_KEY,
    "approval-status",
    companyScheduleId,
  ] as const;
}

export function useCompanySchedules(
  query: CompanyScheduleListQuery = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanySchedule[]>({
    queryKey: companySchedulesListKey(query),
    queryFn: async () => {
      const res = await listCompanySchedules(query);
      if (!res.success) {
        throw new Error(
          res.message || "회사 일정을 불러오지 못했습니다.",
        );
      }
      return res.data.company_schedules ?? [];
    },
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export function useCompanySchedule(
  companyScheduleId: number | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanySchedule>({
    queryKey: companyScheduleDetailKey(companyScheduleId ?? 0),
    enabled: companyScheduleId !== null && (options.enabled ?? true),
    queryFn: async () => {
      const res = await getCompanySchedule(companyScheduleId as number);
      if (!res.success) {
        throw new Error(res.message || "회사 일정을 불러오지 못했습니다.");
      }
      return res.data.company_schedule;
    },
  });
}

export function useCompanyScheduleApprovalStatus(
  companyScheduleId: number | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanyScheduleApprovalStatusData>({
    queryKey: companyScheduleApprovalStatusKey(companyScheduleId ?? 0),
    enabled: companyScheduleId !== null && (options.enabled ?? true),
    queryFn: async () => {
      const res = await getCompanyScheduleApprovalStatus(
        companyScheduleId as number,
      );
      if (!res.success) {
        throw new Error(res.message || "회사 일정 승인 상태를 불러오지 못했습니다.");
      }
      return res.data;
    },
  });
}

function useInvalidateCompanySchedules() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: COMPANY_SCHEDULES_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
  };
}

export function useUpdateCompanySchedule() {
  const invalidate = useInvalidateCompanySchedules();
  return useMutation({
    mutationFn: async ({
      companyScheduleId,
      payload,
    }: {
      companyScheduleId: number;
      payload: UpdateCompanyScheduleRequest;
    }) => {
      const res = await updateCompanySchedule(companyScheduleId, payload);
      if (!res.success) {
        throw new Error(res.message || "회사 일정 수정에 실패했습니다.");
      }
      return res.data.company_schedule;
    },
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCompanySchedule() {
  const invalidate = useInvalidateCompanySchedules();
  return useMutation({
    mutationFn: async (companyScheduleId: number) => {
      const res = await deleteCompanySchedule(companyScheduleId);
      if (!res.success) {
        throw new Error(res.message || "회사 일정 삭제에 실패했습니다.");
      }
      return res.data;
    },
    onSuccess: () => invalidate(),
  });
}
