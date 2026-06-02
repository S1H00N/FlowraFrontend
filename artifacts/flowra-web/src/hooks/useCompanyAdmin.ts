import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompanyAdminSchedule,
  getCompanyAdminMe,
  listCompanyAdminDepartments,
  listCompanyAdminMembers,
} from "@/api/companyAdmin";
import { COMPANY_SCHEDULES_QUERY_KEY } from "@/hooks/useCompanySchedules";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CompanyAdminDepartment,
  CompanyAdminMe,
  CompanyAdminMember,
  CompanyAdminPermission,
  CreateCompanyScheduleRequest,
} from "@/types";

export const COMPANY_ADMIN_QUERY_KEY = ["company-admin"] as const;

function permissionCode(permission: CompanyAdminPermission) {
  return typeof permission === "string"
    ? permission
    : (permission.code ?? permission.permission_code ?? "");
}

export function hasCompanyAdminPermission(
  admin: CompanyAdminMe | null | undefined,
  code: string,
) {
  return (
    admin?.permissions?.some((permission) => permissionCode(permission) === code) ??
    false
  );
}

export function useCompanyAdminMe() {
  return useQuery<CompanyAdminMe>({
    queryKey: [...COMPANY_ADMIN_QUERY_KEY, "me"],
    queryFn: async () => {
      const res = await getCompanyAdminMe();
      if (!res.success) {
        throw new Error(res.message || "회사 관리자 정보를 불러오지 못했습니다.");
      }
      return res.data;
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCompanyAdminDepartments(enabled = true) {
  return useQuery<CompanyAdminDepartment[]>({
    queryKey: [...COMPANY_ADMIN_QUERY_KEY, "departments"],
    queryFn: async () => {
      const res = await listCompanyAdminDepartments();
      if (!res.success) {
        throw new Error(res.message || "부서 목록을 불러오지 못했습니다.");
      }
      return res.data.departments ?? [];
    },
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCompanyAdminMembers(enabled = true) {
  return useQuery<CompanyAdminMember[]>({
    queryKey: [...COMPANY_ADMIN_QUERY_KEY, "members"],
    queryFn: async () => {
      const res = await listCompanyAdminMembers();
      if (!res.success) {
        throw new Error(res.message || "구성원 목록을 불러오지 못했습니다.");
      }
      return res.data.members ?? [];
    },
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateCompanyAdminSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCompanyScheduleRequest) => {
      const res = await createCompanyAdminSchedule(payload);
      if (!res.success) {
        throw new Error(res.message || "회사 일정 추가에 실패했습니다.");
      }
      return res.data.schedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: COMPANY_SCHEDULES_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: COMPANY_ADMIN_QUERY_KEY });
    },
    meta: {
      successMessage: "회사 일정을 추가했습니다.",
      errorMessage: "회사 일정 추가에 실패했습니다.",
    },
  });
}
