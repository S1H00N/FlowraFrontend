import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCompanyOrgChart,
  listCompanies,
  listCompanyDepartmentMembers,
  listCompanyDepartments,
  updateCompanyDepartmentApprovalDelegateMode,
} from "@/api/companies";
import type {
  CompanyAdminDepartment,
  CompanyAdminMember,
  CompanyMembership,
} from "@/types";

export const COMPANIES_QUERY_KEY = ["companies"] as const;

export function useCompanies(enabled = true) {
  return useQuery<CompanyMembership[]>({
    queryKey: [...COMPANIES_QUERY_KEY, "list"],
    enabled,
    queryFn: async () => {
      const res = await listCompanies();
      if (!res.success) {
        throw new Error(res.message || "회사 목록을 불러오지 못했습니다.");
      }
      return res.data.companies ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCompanyDepartments(
  companyId: number | null,
  query: { view?: "tree" | "flat"; status?: "active" | "inactive" } = {},
  enabled = true,
) {
  return useQuery<CompanyAdminDepartment[]>({
    queryKey: [...COMPANIES_QUERY_KEY, "departments", companyId, query],
    enabled: enabled && companyId !== null,
    queryFn: async () => {
      const res = await listCompanyDepartments(companyId as number, query);
      if (!res.success) {
        throw new Error(res.message || "부서 목록을 불러오지 못했습니다.");
      }
      return res.data.departments ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCompanyOrgChart(companyId: number | null, enabled = true) {
  return useQuery({
    queryKey: [...COMPANIES_QUERY_KEY, "org-chart", companyId],
    enabled: enabled && companyId !== null,
    queryFn: async () => {
      const res = await getCompanyOrgChart(companyId as number);
      if (!res.success) {
        throw new Error(res.message || "조직도를 불러오지 못했습니다.");
      }
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useCompanyDepartmentMembers(
  companyId: number | null,
  departmentId: number | null,
  enabled = true,
) {
  return useQuery<CompanyAdminMember[]>({
    queryKey: [
      ...COMPANIES_QUERY_KEY,
      "department-members",
      companyId,
      departmentId,
    ],
    enabled: enabled && companyId !== null && departmentId !== null,
    queryFn: async () => {
      const res = await listCompanyDepartmentMembers(
        companyId as number,
        departmentId as number,
      );
      if (!res.success) {
        throw new Error(res.message || "부서원을 불러오지 못했습니다.");
      }
      return res.data.members ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateCompanyDepartmentDelegateMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      departmentId,
      approvalDelegateEnabled,
    }: {
      companyId: number;
      departmentId: number;
      approvalDelegateEnabled: boolean;
    }) => {
      const res = await updateCompanyDepartmentApprovalDelegateMode(
        companyId,
        departmentId,
        approvalDelegateEnabled,
      );
      if (!res.success) {
        throw new Error(res.message || "대행승인 모드 변경에 실패했습니다.");
      }
      return res.data.department;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY });
    },
  });
}
