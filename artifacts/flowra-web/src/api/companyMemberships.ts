import apiClient from "./client";
import type { ApiListData, ApiResponse, CompanyMembership } from "@/types";

type CompanyMembershipsListData = Partial<ApiListData<CompanyMembership>> & {
  memberships?: CompanyMembership[];
  company_memberships?: CompanyMembership[];
};

interface LeaveCompanyMembershipData {
  member: CompanyMembership;
}

export async function listCompanyMemberships() {
  const res = await apiClient.get<ApiResponse<CompanyMembershipsListData>>(
    "/company-memberships",
  );
  return {
    ...res.data,
    data: {
      memberships:
        res.data.data.items ??
        res.data.data.memberships ??
        res.data.data.company_memberships ??
        [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function leaveCompanyMembership(companyMemberId: number) {
  const res = await apiClient.post<ApiResponse<LeaveCompanyMembershipData>>(
    `/company-memberships/${companyMemberId}/leave`,
  );
  return res.data;
}
