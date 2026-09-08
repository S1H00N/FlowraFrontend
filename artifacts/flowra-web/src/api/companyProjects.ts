import apiClient from "./client";
import { compactParams, toCommaParam, toOptionalString } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CompanyProject,
  CompanyProjectCalendarItemsData,
  CompanyProjectCalendarItemsQuery,
  CompanyProjectDetailData,
  CompanyProjectGanttData,
  CompanyProjectGanttQuery,
  CompanyProjectListData,
  CompanyProjectWorkItem,
  CompanyProjectWorkItemChildrenData,
  CompanyProjectWorkItemChildrenQuery,
  CompanyProjectWorkReminder,
  CompanyProjectWorkRemindersData,
  CompanyProjectWorkRemindersQuery,
  CompanyProjectsQuery,
  CreateCompanyProjectRequest,
  CreateCompanyProjectWorkReminderRequest,
  MyCompanyProjectWorkItemsData,
  MyCompanyProjectWorkItemsQuery,
  ProjectCalendarItem,
  UpdateCompanyProjectWorkAssignmentRequest,
} from "@/types";

type ListResponseData<T> = Partial<ApiListData<T>> & Record<string, unknown>;

type CompanyProjectData = CompanyProject | { project: CompanyProject };
type CompanyProjectWorkAssignmentData =
  | Record<string, unknown>
  | { assignment: Record<string, unknown> };
type CompanyProjectWorkReminderData =
  | CompanyProjectWorkReminder
  | { reminder: CompanyProjectWorkReminder };

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

function unwrapProject(data: CompanyProjectData): CompanyProject {
  if (isRecord(data) && isRecord(data.project)) {
    return data.project as unknown as CompanyProject;
  }
  return data as CompanyProject;
}

function unwrapAssignment(
  data: CompanyProjectWorkAssignmentData,
): Record<string, unknown> {
  if (isRecord(data) && isRecord(data.assignment)) {
    return data.assignment;
  }
  return data;
}

function unwrapWorkReminder(
  data: CompanyProjectWorkReminderData,
): CompanyProjectWorkReminder {
  if (isRecord(data) && isRecord(data.reminder)) {
    return data.reminder as unknown as CompanyProjectWorkReminder;
  }
  return data as CompanyProjectWorkReminder;
}

function normalizeCompanyProjectsQuery(query: CompanyProjectsQuery = {}) {
  return compactParams({
    company_id: toOptionalString(query.company_id),
    status: toCommaParam(query.status),
    q: query.q,
    from: query.from,
    to: query.to,
    assigned_only:
      query.assigned_only === undefined ? undefined : String(query.assigned_only),
  });
}

function normalizeCreateCompanyProjectPayload(
  payload: CreateCompanyProjectRequest,
) {
  return compactParams({
    ...payload,
    company_id: toOptionalString(payload.company_id),
    origin_department_id: toOptionalString(payload.origin_department_id),
    description: payload.description || undefined,
    planned_start_date: payload.planned_start_date || undefined,
    planned_end_date: payload.planned_end_date || undefined,
  });
}

function normalizeGanttQuery(query: CompanyProjectGanttQuery = {}) {
  return compactParams({
    mode: query.mode,
    max_depth: query.max_depth,
    phase_id: toOptionalString(query.phase_id),
    from: query.from,
    to: query.to,
  });
}

function normalizeMyWorkItemsQuery(
  query: MyCompanyProjectWorkItemsQuery = {},
) {
  return compactParams({
    status: toCommaParam(query.status),
    project_id: toOptionalString(query.project_id),
  });
}

function normalizeCalendarItemsQuery(
  query: CompanyProjectCalendarItemsQuery = {},
) {
  return compactParams({
    start_from: query.start_from,
    start_to: query.start_to,
    include_done:
      query.include_done === undefined ? undefined : String(query.include_done),
    project_id: toOptionalString(query.project_id),
    limit: query.limit,
  });
}

function normalizeWorkRemindersQuery(
  query: CompanyProjectWorkRemindersQuery = {},
) {
  return compactParams({
    status: query.status,
    assignment_id: toOptionalString(query.assignment_id),
  });
}

export async function listCompanyProjects(
  query: CompanyProjectsQuery = {},
) {
  const res = await apiClient.get<ApiResponse<ListResponseData<CompanyProject>>>(
    "/company-projects",
    {
      params: normalizeCompanyProjectsQuery(query),
    },
  );
  return {
    ...res.data,
    data: {
      projects: extractList<CompanyProject>(res.data.data, [
        "projects",
        "company_projects",
      ]),
      pagination: extractPagination<CompanyProject>(res.data.data),
    } satisfies CompanyProjectListData,
  };
}

export async function createCompanyProject(
  payload: CreateCompanyProjectRequest,
) {
  const res = await apiClient.post<ApiResponse<CompanyProjectData>>(
    "/company-projects",
    normalizeCreateCompanyProjectPayload(payload),
  );
  return {
    ...res.data,
    data: {
      project: unwrapProject(res.data.data),
    },
  };
}

export async function getCompanyProject(companyProjectId: number) {
  const res = await apiClient.get<ApiResponse<CompanyProjectDetailData>>(
    `/company-projects/${companyProjectId}`,
  );
  return {
    ...res.data,
    data: {
      project: res.data.data.project,
      phases: res.data.data.phases ?? [],
      work_items: res.data.data.work_items ?? [],
      departments: res.data.data.departments ?? [],
      assignments: res.data.data.assignments ?? [],
      dependencies: res.data.data.dependencies ?? [],
      summary: res.data.data.summary,
      detail_policy: res.data.data.detail_policy,
    } satisfies CompanyProjectDetailData,
  };
}

export async function getCompanyProjectGantt(
  companyProjectId: number,
  query: CompanyProjectGanttQuery = {},
) {
  const res = await apiClient.get<ApiResponse<CompanyProjectGanttData>>(
    `/company-projects/${companyProjectId}/gantt`,
    {
      params: normalizeGanttQuery(query),
    },
  );
  return {
    ...res.data,
    data: {
      project: res.data.data.project,
      gantt_policy: res.data.data.gantt_policy,
      phases: res.data.data.phases ?? [],
      items: res.data.data.items ?? [],
      dependencies: res.data.data.dependencies ?? [],
    } satisfies CompanyProjectGanttData,
  };
}

export async function listCompanyProjectWorkItemChildren(
  companyProjectId: number,
  workItemId: number,
  query: CompanyProjectWorkItemChildrenQuery = {},
) {
  const res = await apiClient.get<ApiResponse<ListResponseData<CompanyProjectWorkItem>>>(
    `/company-projects/${companyProjectId}/work-items/${workItemId}/children`,
    {
      params: compactParams({ depth: query.depth }),
    },
  );
  return {
    ...res.data,
    data: {
      items: extractList<CompanyProjectWorkItem>(res.data.data, [
        "children",
        "work_items",
      ]),
    } satisfies CompanyProjectWorkItemChildrenData,
  };
}

export async function listMyCompanyProjectWorkItems(
  query: MyCompanyProjectWorkItemsQuery = {},
) {
  const res = await apiClient.get<ApiResponse<ListResponseData<CompanyProjectWorkItem>>>(
    "/company-projects/my-work-items",
    {
      params: normalizeMyWorkItemsQuery(query),
    },
  );
  return {
    ...res.data,
    data: {
      items: extractList<CompanyProjectWorkItem>(res.data.data, [
        "work_items",
      ]),
      pagination: extractPagination<CompanyProjectWorkItem>(res.data.data),
    } satisfies MyCompanyProjectWorkItemsData,
  };
}

export async function updateCompanyProjectWorkAssignment(
  assignmentId: number,
  payload: UpdateCompanyProjectWorkAssignmentRequest,
) {
  const res = await apiClient.patch<ApiResponse<CompanyProjectWorkAssignmentData>>(
    `/company-projects/work-assignments/${assignmentId}`,
    compactParams(payload as Record<string, unknown>),
  );
  return {
    ...res.data,
    data: {
      assignment: unwrapAssignment(res.data.data),
    },
  };
}

export async function listMyCompanyProjectCalendarItems(
  query: CompanyProjectCalendarItemsQuery = {},
) {
  const res = await apiClient.get<ApiResponse<ListResponseData<ProjectCalendarItem>>>(
    "/company-projects/my-calendar-items",
    {
      params: normalizeCalendarItemsQuery(query),
    },
  );
  return {
    ...res.data,
    data: {
      items: extractList<ProjectCalendarItem>(res.data.data, [
        "project_work_items",
        "calendar_items",
      ]),
      pagination: extractPagination<ProjectCalendarItem>(res.data.data),
    } satisfies CompanyProjectCalendarItemsData,
  };
}

export async function createCompanyProjectWorkReminder(
  assignmentId: number,
  payload: CreateCompanyProjectWorkReminderRequest,
) {
  const res = await apiClient.post<ApiResponse<CompanyProjectWorkReminderData>>(
    `/company-projects/work-assignments/${assignmentId}/reminders`,
    compactParams(payload as unknown as Record<string, unknown>),
  );
  return {
    ...res.data,
    data: {
      reminder: unwrapWorkReminder(res.data.data),
    },
  };
}

export async function listCompanyProjectWorkReminders(
  query: CompanyProjectWorkRemindersQuery = {},
) {
  const res = await apiClient.get<ApiResponse<ListResponseData<CompanyProjectWorkReminder>>>(
    "/company-projects/work-reminders",
    {
      params: normalizeWorkRemindersQuery(query),
    },
  );
  return {
    ...res.data,
    data: {
      reminders: extractList<CompanyProjectWorkReminder>(res.data.data, [
        "reminders",
      ]),
      pagination: extractPagination<CompanyProjectWorkReminder>(res.data.data),
    } satisfies CompanyProjectWorkRemindersData,
  };
}

export async function deleteCompanyProjectWorkReminder(reminderId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/company-projects/work-reminders/${reminderId}`,
  );
  return res.data;
}
