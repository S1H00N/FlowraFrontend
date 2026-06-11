import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  leaveCompanyMembership,
  listCompanyMemberships,
} from "@/api/companyMemberships";
import { COMPANY_ADMIN_QUERY_KEY } from "@/hooks/useCompanyAdmin";
import type { CompanyMembership } from "@/types";

export const COMPANY_MEMBERSHIPS_QUERY_KEY = ["company-memberships"] as const;

export function useCompanyMemberships(enabled = true) {
  return useQuery<CompanyMembership[]>({
    queryKey: [...COMPANY_MEMBERSHIPS_QUERY_KEY, "list"],
    enabled,
    queryFn: async () => {
      const res = await listCompanyMemberships();
      if (!res.success) {
        throw new Error(res.message || "회사 멤버십을 불러오지 못했습니다.");
      }
      return res.data.memberships ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useLeaveCompanyMembership() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (companyMemberId: number) => {
      const res = await leaveCompanyMembership(companyMemberId);
      if (!res.success) {
        throw new Error(res.message || "회사 탈퇴에 실패했습니다.");
      }
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: COMPANY_MEMBERSHIPS_QUERY_KEY,
      });
      void queryClient.invalidateQueries({ queryKey: COMPANY_ADMIN_QUERY_KEY });
    },
  });
}
