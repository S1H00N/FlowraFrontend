import apiClient from "./client";
import { compactParams } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CompanyAdminDepartment,
  CompanyAdminMember,
  CompanyMembership,
} from "@/types";

type CompaniesListData = Partial<ApiListData<CompanyMembership>> & {
  companies?: CompanyMembership[];
  memberships?: CompanyMembership[];
  company_memberships?: CompanyMembership[];
};

type CompanyDepartmentsListData = Partial<ApiListData<CompanyAdminDepartment>> & {
  departments?: CompanyAdminDepartment[];
};

interface CompanyOrgChartData {
  company?: unknown;
  departments?: CompanyAdminDepartment[];
  unassigned_members?: CompanyAdminMember[];
}

interface CompanyDepartmentMembersData {
  members?: CompanyAdminMember[];
}

export async function listCompanies() {
  const res = await apiClient.get<ApiResponse<CompaniesListData>>("/companies");
  return {
    ...res.data,
    data: {
      companies:
        res.data.data.items ??
        res.data.data.companies ??
        res.data.data.memberships ??
        res.data.data.company_memberships ??
        [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function listCompanyDepartments(
  companyId: number,
  query: { view?: "tree" | "flat"; status?: "active" | "inactive" } = {},
) {
  const res = await apiClient.get<ApiResponse<CompanyDepartmentsListData>>(
    `/companies/${companyId}/departments`,
    { params: compactParams(query) },
  );
  return {
    ...res.data,
    data: {
      departments: res.data.data.items ?? res.data.data.departments ?? [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function getCompanyOrgChart(companyId: number) {
  const res = await apiClient.get<ApiResponse<CompanyOrgChartData>>(
    `/companies/${companyId}/org-chart`,
  );
  return res.data;
}

export async function listCompanyDepartmentMembers(
  companyId: number,
  departmentId: number,
) {
  const res = await apiClient.get<ApiResponse<CompanyDepartmentMembersData>>(
    `/companies/${companyId}/departments/${departmentId}/members`,
  );
  return {
    ...res.data,
    data: {
      members: res.data.data.members ?? [],
    },
  };
}

export async function updateCompanyDepartmentApprovalDelegateMode(
  companyId: number,
  departmentId: number,
  approvalDelegateEnabled: boolean,
) {
  const res = await apiClient.patch<ApiResponse<{ department: CompanyAdminDepartment }>>(
    `/companies/${companyId}/departments/${departmentId}/approval-delegate-mode`,
    { approval_delegate_enabled: approvalDelegateEnabled },
  );
  return res.data;
}
