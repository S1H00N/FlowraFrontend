import apiClient from "./client";
import { compactParams } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CompanyAdminDepartment,
  CompanyAdminMe,
  CompanyAdminMember,
  CompanySchedule,
  CreateCompanyScheduleRequest,
} from "@/types";

type CompanyAdminDepartmentListData =
  Partial<ApiListData<CompanyAdminDepartment>> & {
    departments?: CompanyAdminDepartment[];
  };

type CompanyAdminMemberListData = Partial<ApiListData<CompanyAdminMember>> & {
  members?: CompanyAdminMember[];
};

type CompanyAdminScheduleData =
  | CompanySchedule
  | { schedule: CompanySchedule }
  | { company_schedule: CompanySchedule };

const apiBaseURL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const explicitCompanyAdminBaseURL = import.meta.env
  .VITE_COMPANY_ADMIN_API_BASE_URL as string | undefined;

function getCompanyAdminBaseURL() {
  if (explicitCompanyAdminBaseURL) return explicitCompanyAdminBaseURL;
  if (!apiBaseURL) return "/company-admin/api/v1";

  return apiBaseURL.replace(/\/api\/v1\/?$/, "/company-admin/api/v1");
}

function companyAdminEndpoint(path: string) {
  const baseURL = getCompanyAdminBaseURL().replace(/\/$/, "");
  return `${baseURL}/${path.replace(/^\//, "")}`;
}

function normalizeCompanyAdminMe(data: CompanyAdminMe | { admin: CompanyAdminMe }) {
  return "admin" in data ? data.admin : data;
}

function unwrapCompanySchedule(data: CompanyAdminScheduleData) {
  if ("schedule" in data) return data.schedule;
  if ("company_schedule" in data) return data.company_schedule;
  return data;
}

function flattenDepartments(
  departments: CompanyAdminDepartment[],
): CompanyAdminDepartment[] {
  const items: CompanyAdminDepartment[] = [];

  const visit = (department: CompanyAdminDepartment) => {
    items.push(department);
    department.children?.forEach(visit);
  };

  departments.forEach(visit);
  return items;
}

export async function getCompanyAdminMe() {
  const res = await apiClient.get<
    ApiResponse<CompanyAdminMe | { admin: CompanyAdminMe }>
  >(companyAdminEndpoint("/auth/me"));

  return { ...res.data, data: normalizeCompanyAdminMe(res.data.data) };
}

export async function listCompanyAdminDepartments() {
  const res = await apiClient.get<ApiResponse<CompanyAdminDepartmentListData>>(
    companyAdminEndpoint("/departments"),
    {
      params: compactParams({ view: "flat", status: "active" }),
    },
  );

  const departments = res.data.data.items ?? res.data.data.departments ?? [];
  return {
    ...res.data,
    data: {
      departments: flattenDepartments(departments),
      pagination: res.data.data.pagination,
    },
  };
}

export async function listCompanyAdminMembers() {
  const res = await apiClient.get<ApiResponse<CompanyAdminMemberListData>>(
    companyAdminEndpoint("/members"),
    {
      params: compactParams({
        status: "active",
        page_size: 200,
      }),
    },
  );

  return {
    ...res.data,
    data: {
      members: res.data.data.items ?? res.data.data.members ?? [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function createCompanyAdminSchedule(
  payload: CreateCompanyScheduleRequest,
) {
  const res = await apiClient.post<ApiResponse<CompanyAdminScheduleData>>(
    companyAdminEndpoint("/schedules"),
    compactParams({
      ...payload,
      description: payload.description || undefined,
      location: payload.location || undefined,
      status: payload.status ?? "active",
    }),
  );

  return {
    ...res.data,
    data: { schedule: unwrapCompanySchedule(res.data.data) },
  };
}
