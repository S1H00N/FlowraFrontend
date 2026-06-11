import apiClient from "./client";
import { compactParams } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CompanyAdminDepartment,
  CompanyAdminMe,
  CompanyAdminMember,
  CompanyInviteDepartment,
  CompanyInviteCompany,
  CompanySchedule,
  CreateCompanyScheduleRequest,
} from "@/types";

type ListResponseData<T> = T[] | (Partial<ApiListData<T>> & Record<string, unknown>);
type CompanyAdminDepartmentListData = ListResponseData<CompanyAdminDepartment>;

type CompanyAdminScheduleData =
  | CompanySchedule
  | { schedule: CompanySchedule }
  | { company_schedule: CompanySchedule };

interface CompanyScheduleApiPayload {
  company_id: string | number;
  title: string;
  description?: string;
  schedule_type: CreateCompanyScheduleRequest["schedule_type"];
  start_datetime: string;
  end_datetime?: string;
  all_day?: boolean;
  location?: string;
  target_type?: "company";
  target_department_ids?: Array<string | number>;
}

interface CompanyMembershipRecord {
  company_member_id?: number | string | null;
  company_id?: number | string | null;
  user_id?: number | string | null;
  user_public_uid?: string | null;
  department_id?: number | string | null;
  public_uid?: string | null;
  email?: string | null;
  name?: string | null;
  role?: string | null;
  status?: string | null;
  company_schedule_create_policy?: string | null;
  department?: Partial<CompanyInviteDepartment> & {
    department_id?: number | string | null;
  } | null;
  company?: Partial<CompanyInviteCompany> & {
    company_id?: number | string | null;
  } | null;
}

type CompanyMembershipListData = ListResponseData<CompanyMembershipRecord>;

interface CompanyOrgChartDepartment extends CompanyAdminDepartment {
  members?: CompanyAdminMember[];
  children?: CompanyOrgChartDepartment[];
}

interface CompanyOrgChartData {
  departments?: CompanyOrgChartDepartment[];
  unassigned_members?: CompanyAdminMember[];
}

interface CompanyMembersListData {
  members?: CompanyAdminMember[];
}

function unwrapCompanySchedule(data: CompanyAdminScheduleData) {
  if ("schedule" in data) return data.schedule;
  if ("company_schedule" in data) return data.company_schedule;
  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractList<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (!isRecord(data)) return [];

  let emptyList: T[] = [];
  for (const key of ["items", ...keys, "data", "results", "rows"]) {
    const value = data[key];
    if (Array.isArray(value)) {
      const list = value as T[];
      if (list.length > 0) return list;
      emptyList = list;
      continue;
    }
    if (isRecord(value)) {
      const nested = extractList<T>(value, keys);
      if (nested.length > 0) return nested;
    }
  }

  return emptyList;
}

function extractPagination<T>(
  data: unknown,
): ApiListData<T>["pagination"] | undefined {
  if (!isRecord(data)) return undefined;
  const pagination = data.pagination;
  if (isRecord(pagination)) {
    return pagination as unknown as ApiListData<T>["pagination"];
  }
  return extractPagination<T>(data.data);
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

function dedupeDepartments(departments: CompanyAdminDepartment[]) {
  const seen = new Set<number>();
  const items: CompanyAdminDepartment[] = [];

  for (const department of departments) {
    const departmentId = toPositiveNumber(department.department_id);
    if (!departmentId || seen.has(departmentId)) continue;
    seen.add(departmentId);
    items.push(department);
  }

  return items;
}

function toPositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function membershipCompany(
  membership: CompanyMembershipRecord,
): CompanyInviteCompany | null {
  const companyId = toPositiveNumber(
    membership.company?.company_id ?? membership.company_id,
  );
  if (!companyId) return null;

  return {
    company_id: companyId,
    public_uid: membership.company?.public_uid ?? membership.public_uid ?? undefined,
    name: membership.company?.name ?? membership.name ?? "회사",
    status: membership.company?.status ?? membership.status ?? undefined,
    company_schedule_create_policy:
      membership.company?.company_schedule_create_policy ??
      membership.company_schedule_create_policy,
  };
}

function membershipDepartment(
  membership: CompanyMembershipRecord,
): CompanyInviteDepartment | null {
  const departmentId = toPositiveNumber(
    membership.department?.department_id ?? membership.department_id,
  );
  if (!departmentId) return null;

  return {
    department_id: departmentId,
    name: membership.department?.name ?? `부서 ${departmentId}`,
    code: membership.department?.code ?? null,
    status: membership.department?.status ?? undefined,
  };
}

async function listCompanyMembershipRecords() {
  let fallbackMemberships: CompanyMembershipRecord[] = [];

  try {
    const membershipsRes = await apiClient.get<
      ApiResponse<CompanyMembershipListData>
    >("/company-memberships");
    fallbackMemberships = extractList<CompanyMembershipRecord>(
      membershipsRes.data.data,
      ["memberships", "company_memberships", "companies"],
    );
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status !== 404 && status !== 405) throw error;
  }

  try {
    const companiesRes = await apiClient.get<
      ApiResponse<CompanyMembershipListData>
    >("/companies");
    const companies = extractList<CompanyMembershipRecord>(
      companiesRes.data.data,
      ["companies", "memberships", "company_memberships"],
    );

    if (companies.length > 0) {
      return companies.map((company) => {
        const companyId = toPositiveNumber(
          company.company?.company_id ?? company.company_id,
        );
        const membership = fallbackMemberships.find(
          (item) =>
            toPositiveNumber(item.company?.company_id ?? item.company_id) ===
            companyId,
        );
        return membership ? { ...company, ...membership } : company;
      });
    }
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status !== 404 && status !== 405) throw error;
  }

  return fallbackMemberships;
}

async function getActiveCompanyMembership() {
  const memberships = await listCompanyMembershipRecords();
  return (
    memberships.find((item) => {
      const status = item.status?.toLowerCase();
      return !status || status === "active";
    }) ?? null
  );
}

function companyAdminMeFromMembership(
  membership: CompanyMembershipRecord,
): CompanyAdminMe | null {
  const company = membershipCompany(membership);
  if (!company) return null;
  const department = membershipDepartment(membership);

  return {
    company_admin_id:
      toPositiveNumber(membership.company_member_id) ?? company.company_id,
    user_id: toPositiveNumber(membership.user_id),
    user_public_uid: membership.user_public_uid ?? null,
    email: membership.email ?? "",
    name: membership.name ?? company.name,
    status: membership.status ?? "active",
    company,
    department_id: department?.department_id ?? null,
    department,
    role: membership.role ?? null,
    permissions: [],
  };
}

function collectDepartmentMembers(
  departments: CompanyOrgChartDepartment[],
): CompanyAdminMember[] {
  const members: CompanyAdminMember[] = [];

  const visit = (department: CompanyOrgChartDepartment) => {
    members.push(
      ...(department.members ?? []).map((member) => ({
        ...member,
        department_id: member.department_id ?? department.department_id,
        department: member.department ?? {
          department_id: department.department_id,
          name: department.name,
          code: department.code,
          status: department.status,
        },
      })),
    );
    department.children?.forEach(visit);
  };

  departments.forEach(visit);
  return members;
}

function dedupeMembers(members: CompanyAdminMember[]) {
  const seen = new Set<string>();
  const items: CompanyAdminMember[] = [];

  for (const member of members) {
    const key =
      toPositiveNumber(member.company_member_id)?.toString() ??
      member.email?.trim().toLowerCase();

    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(member);
  }

  return items;
}

async function getFallbackCompanyId() {
  const membership = await getActiveCompanyMembership();
  return membership ? membershipCompany(membership)?.company_id ?? null : null;
}

async function getFallbackDepartmentId() {
  const membership = await getActiveCompanyMembership();
  return membership
    ? toPositiveNumber(
        membership.department?.department_id ?? membership.department_id,
      )
    : null;
}

async function getCompanyOrgChart() {
  const companyId = await getFallbackCompanyId();
  if (!companyId) return null;

  const res = await apiClient.get<ApiResponse<CompanyOrgChartData>>(
    `/companies/${companyId}/org-chart`,
  );

  return res.data.data;
}

async function listCompanyDepartmentsFromOrgChart() {
  const orgChart = await getCompanyOrgChart();
  if (!orgChart) return [];

  return flattenDepartments(
    extractList<CompanyOrgChartDepartment>(orgChart, ["departments"]),
  );
}

async function listCompanyMembersFromOrgChart() {
  const orgChart = await getCompanyOrgChart();
  if (!orgChart) return [];

  const departments = extractList<CompanyOrgChartDepartment>(orgChart, [
    "departments",
  ]);
  const unassignedMembers = extractList<CompanyAdminMember>(orgChart, [
    "unassigned_members",
  ]);

  return dedupeMembers([
    ...collectDepartmentMembers(departments),
    ...unassignedMembers,
  ]);
}

async function tryFallbackList<T>(loader: () => Promise<T[]>) {
  try {
    return await loader();
  } catch {
    return [];
  }
}

function uniqNumbers(values: Array<number | null>) {
  return [...new Set(values.filter((value): value is number => value !== null))];
}

function toApiId(value: number, idFormat: "string" | "number") {
  return idFormat === "number" ? value : String(value);
}

function toUtcDateTimeBodyParam(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  return value;
}

function shouldRetryCompanyScheduleWithNumericIds(error: unknown) {
  const response = (
    error as {
      response?: {
        status?: number;
        data?: {
          error?: {
            code?: string;
            details?: {
              issues?: Array<{ path?: string; message?: string }>;
            };
          };
        };
      };
    }
  ).response;

  if (
    response?.status !== 400 ||
    response.data?.error?.code !== "VALIDATION_ERROR"
  ) {
    return false;
  }

  return (
    response.data.error.details?.issues?.some((issue) => {
      const path = issue.path ?? "";
      const message = issue.message ?? "";
      return (
        (path === "company_id" || path.startsWith("target_department_ids")) &&
        /Expected number/i.test(message)
      );
    }) ?? false
  );
}

async function resolveTargetDepartmentIds(
  targets: CreateCompanyScheduleRequest["targets"],
) {
  const targetDepartmentIds = targets
    .filter((target) => target.target_type === "department")
    .map((target) => toPositiveNumber(target.department_id));
  const targetMemberIds = targets
    .filter((target) => target.target_type === "member")
    .map((target) => toPositiveNumber(target.company_member_id));

  let memberDepartmentIds: Array<number | null> = [];
  if (targetMemberIds.some((memberId) => memberId !== null)) {
    const members = await listCompanyMembersFromOrgChart();
    memberDepartmentIds = targetMemberIds.map((memberId) => {
      const member = members.find(
        (item) => toPositiveNumber(item.company_member_id) === memberId,
      );
      return toPositiveNumber(
        member?.department_id ?? member?.department?.department_id,
      );
    });
  }

  return uniqNumbers([
    ...targetDepartmentIds,
    ...memberDepartmentIds,
  ]);
}

async function normalizeCompanySchedulePayload(
  payload: CreateCompanyScheduleRequest,
  options: {
    idFormat?: "string" | "number";
  } = {},
): Promise<CompanyScheduleApiPayload> {
  const idFormat = options.idFormat ?? "string";
  const companyId = await getFallbackCompanyId();
  if (!companyId) {
    throw new Error("회사 정보를 찾지 못했습니다.");
  }

  const ownDepartmentId = await getFallbackDepartmentId();
  if (!ownDepartmentId) {
    throw new Error("회사 일정은 활성 소속 부서가 있어야 추가할 수 있습니다.");
  }

  const isCompanyWideSchedule = payload.targets.some(
    (target) => target.target_type === "company",
  );
  const targetDepartmentIds = isCompanyWideSchedule
    ? []
    : (await resolveTargetDepartmentIds(payload.targets)).filter(
        (departmentId) => departmentId !== ownDepartmentId,
      );

  return compactParams({
    company_id: toApiId(companyId, idFormat),
    title: payload.title,
    description: payload.description || undefined,
    schedule_type: payload.schedule_type,
    start_datetime: toUtcDateTimeBodyParam(payload.start_datetime),
    end_datetime: toUtcDateTimeBodyParam(payload.end_datetime),
    all_day: payload.all_day,
    location: payload.location || undefined,
    target_type: isCompanyWideSchedule ? "company" : undefined,
    target_department_ids:
      targetDepartmentIds.length > 0
        ? targetDepartmentIds.map((departmentId) =>
            toApiId(departmentId, idFormat),
          )
        : undefined,
  }) as CompanyScheduleApiPayload;
}

export async function getCompanyAdminMe() {
  const membership = await getActiveCompanyMembership();
  const admin = membership ? companyAdminMeFromMembership(membership) : null;
  if (!admin) {
    return {
      success: false,
      message: "회사 정보를 찾지 못했습니다.",
      data: null as unknown as CompanyAdminMe,
    };
  }

  return { success: true, message: "", data: admin };
}

export async function listCompanyAdminDepartments() {
  try {
    const companyId = await getFallbackCompanyId();
    if (!companyId) {
      throw new Error("회사 정보를 찾지 못했습니다.");
    }

    const res = await apiClient.get<ApiResponse<CompanyAdminDepartmentListData>>(
      `/companies/${companyId}/departments`,
      {
        params: compactParams({ view: "flat", status: "active" }),
      },
    );

    const adminDepartments = flattenDepartments(
      extractList<CompanyAdminDepartment>(res.data.data, ["departments"]),
    );
    const orgChartDepartments = await tryFallbackList(
      listCompanyDepartmentsFromOrgChart,
    );
    const departments = dedupeDepartments([
      ...adminDepartments,
      ...orgChartDepartments,
    ]);

    return {
      ...res.data,
      data: {
        departments,
        pagination: extractPagination<CompanyAdminDepartment>(res.data.data),
      },
    };
  } catch (error) {
    const fallbackDepartments = await tryFallbackList(
      listCompanyDepartmentsFromOrgChart,
    );
    if (fallbackDepartments.length === 0) throw error;

    return {
      success: true,
      message: "",
      data: {
        departments: fallbackDepartments,
        pagination: undefined,
      },
    };
  }
}

export async function listCompanyAdminMembers() {
  try {
    const members = await listCompanyMembersFromOrgChart();

    return {
      success: true,
      message: "",
      data: {
        members,
        pagination: undefined,
      },
    };
  } catch (error) {
    const fallbackMembers = await tryFallbackList(
      listCompanyMembersFromOrgChart,
    );
    if (fallbackMembers.length === 0) throw error;

    return {
      success: true,
      message: "",
      data: {
        members: fallbackMembers,
        pagination: undefined,
      },
    };
  }
}

export async function listCompanyDepartmentMembers(
  companyId: number,
  departmentId: number,
) {
  const res = await apiClient.get<ApiResponse<CompanyMembersListData>>(
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

export async function createCompanyAdminSchedule(
  payload: CreateCompanyScheduleRequest,
) {
  const requestPayload = await normalizeCompanySchedulePayload(payload);

  let res;
  try {
    res = await apiClient.post<ApiResponse<CompanyAdminScheduleData>>(
      "/company-schedules",
      requestPayload,
    );
  } catch (error) {
    if (!shouldRetryCompanyScheduleWithNumericIds(error)) {
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      if (status === 403) {
        throw new Error(
          "회사 일정 생성 권한이 없습니다. 소속 부서의 일정 생성 정책이 leader_only이면 부서장만 등록할 수 있습니다.",
        );
      }
      throw error;
    }

    res = await apiClient.post<ApiResponse<CompanyAdminScheduleData>>(
      "/company-schedules",
      await normalizeCompanySchedulePayload(payload, { idFormat: "number" }),
    );
  }

  return {
    ...res.data,
    data: { schedule: unwrapCompanySchedule(res.data.data) },
  };
}
