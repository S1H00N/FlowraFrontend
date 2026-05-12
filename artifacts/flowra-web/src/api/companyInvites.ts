import apiClient from "./client";
import type {
  AcceptCompanyInviteData,
  ApiResponse,
  CompanyInvite,
} from "@/types";

function unwrapInvite(data: CompanyInvite | { invite: CompanyInvite }) {
  return "invite" in data ? data.invite : data;
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
