import apiClient from "./client";
import type {
  AcceptCompanyInviteData,
  ApiListData,
  ApiResponse,
  CompanyInvite,
} from "@/types";

type CompanyInvitesListData = Partial<ApiListData<CompanyInvite>> & {
  invites?: CompanyInvite[];
};

function unwrapInvite(data: CompanyInvite | { invite: CompanyInvite }) {
  return "invite" in data ? data.invite : data;
}

function unwrapInvites(data: CompanyInvitesListData) {
  return data.items ?? data.invites ?? [];
}

export async function listMyCompanyInvites() {
  const res = await apiClient.get<ApiResponse<CompanyInvitesListData>>(
    "/company-memberships/invites",
  );

  return {
    ...res.data,
    data: {
      invites: unwrapInvites(res.data.data),
      pagination: res.data.data.pagination,
    },
  };
}

export async function getMyCompanyInviteById(companyInviteId: number) {
  const res = await apiClient.get<
    ApiResponse<CompanyInvite | { invite: CompanyInvite }>
  >(`/company-memberships/invites/by-id/${companyInviteId}`);

  return { ...res.data, data: unwrapInvite(res.data.data) };
}

export async function acceptMyCompanyInviteById(companyInviteId: number) {
  const res = await apiClient.post<ApiResponse<AcceptCompanyInviteData>>(
    `/company-memberships/invites/by-id/${companyInviteId}/accept`,
  );

  return res.data;
}

export async function getCompanyInvite(token: string) {
  const res = await apiClient.get<
    ApiResponse<CompanyInvite | { invite: CompanyInvite }>
  >(`/company-memberships/invites/${encodeURIComponent(token)}`);

  return { ...res.data, data: unwrapInvite(res.data.data) };
}

export async function acceptCompanyInvite(token: string) {
  const res = await apiClient.post<ApiResponse<AcceptCompanyInviteData>>(
    `/company-memberships/invites/${encodeURIComponent(token)}/accept`,
  );

  return res.data;
}
