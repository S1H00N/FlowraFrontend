import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptMyCompanyInviteById,
  getMyCompanyInviteById,
  listMyCompanyInvites,
} from "@/api/companyInvites";
import { COMPANY_ADMIN_QUERY_KEY } from "@/hooks/useCompanyAdmin";
import type { CompanyInvite } from "@/types";

export const COMPANY_INVITES_QUERY_KEY = ["company-invites"] as const;

export function useMyCompanyInvites(enabled = true) {
  return useQuery<CompanyInvite[]>({
    queryKey: [...COMPANY_INVITES_QUERY_KEY, "mine"],
    queryFn: async () => {
      const res = await listMyCompanyInvites();
      if (!res.success) {
        throw new Error(res.message || "회사 초대 목록을 불러오지 못했습니다.");
      }
      return res.data.invites ?? [];
    },
    enabled,
    staleTime: 1000 * 60,
  });
}

export function useMyCompanyInvite(companyInviteId?: number | null) {
  return useQuery<CompanyInvite>({
    queryKey: [...COMPANY_INVITES_QUERY_KEY, "detail", companyInviteId],
    queryFn: async () => {
      if (!companyInviteId) throw new Error("회사 초대를 찾을 수 없습니다.");
      const res = await getMyCompanyInviteById(companyInviteId);
      if (!res.success) {
        throw new Error(res.message || "회사 초대를 불러오지 못했습니다.");
      }
      return res.data;
    },
    enabled: !!companyInviteId,
    retry: false,
  });
}

export function useAcceptMyCompanyInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (companyInviteId: number) => {
      const res = await acceptMyCompanyInviteById(companyInviteId);
      if (!res.success) {
        throw new Error(res.message || "회사 초대 수락에 실패했습니다.");
      }
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: COMPANY_INVITES_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: COMPANY_ADMIN_QUERY_KEY });
    },
    meta: {
      successMessage: "회사 초대를 수락했습니다.",
      errorMessage: "회사 초대 수락에 실패했습니다.",
    },
  });
}
