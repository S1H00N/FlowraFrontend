import apiClient from "./client";
import { compactParams, toCommaParam, toOptionalString } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CompanyProject,
  CompanyProjectAssignment,
  CompanyProjectCalendarItemsData,
  CompanyProjectCalendarItemsQuery,
  CompanyProjectDetailData,
  CompanyProjectGanttData,
  CompanyProjectGanttQuery,
  CompanyProjectListData,
  CompanyProjectMember,
  CompanyProjectPhase,
  CompanyProjectWorkItem,
  CompanyProjectWorkItemChildrenData,
  CompanyProjectWorkItemChildrenQuery,
  CompanyProjectWorkReminder,
  CompanyProjectWorkRemindersData,
  CompanyProjectWorkRemindersQuery,
  CompanyProjectsQuery,
  CreateCompanyProjectRequest,
  CreateCompanyProjectPhaseRequest,
  UpdateCompanyProjectPhaseRequest,
  CreateCompanyProjectWorkItemRequest,
  UpdateCompanyProjectWorkItemRequest,
  CreateCompanyProjectAssignmentRequest,
  UpdateManagedCompanyProjectAssignmentRequest,
  CreateCompanyProjectDependencyRequest,
  CompanyProjectWorkDependency,
  CreateCompanyProjectMemberRequest,
  CreateCompanyProjectWorkReminderRequest,
  MyCompanyProjectWorkItemsData,
  MyCompanyProjectWorkItemsQuery,
  ProjectCalendarItem,
  UpdateCompanyProjectWorkAssignmentRequest,
  UpdateCompanyProjectRequest,
  UpdateCompanyProjectMemberRequest,
} from "@/types";

type ListResponseData<T> = Partial<ApiListData<T>> & Record<string, unknown>;

type CompanyProjectData = CompanyProject | { project: CompanyProject };
type CompanyProjectWorkAssignmentData =
  | Record<string, unknown>
  | { assignment: Record<string, unknown> };
type CompanyProjectWorkReminderData =
  | CompanyProjectWorkReminder
  | { reminder: CompanyProjectWorkReminder };

// Keep transport completeness outside the public DTO. A missing relationship
// array is normalized for existing consumers, but cannot prove "unassigned".
const assignmentCoverage = new WeakSet<object>();

export function hasCompanyProjectAssignmentCoverage(data: object) {
  return assignmentCoverage.has(data);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findList<T>(data: unknown, keys: string[]): T[] | undefined {
  if (Array.isArray(data)) return data as T[];
  if (!isRecord(data)) return undefined;

  let emptyList: T[] | undefined;
  for (const key of ["items", ...keys, "data", "results", "rows"]) {
    const value = data[key];
    if (Array.isArray(value)) {
      const list = value as T[];
      if (list.length > 0) return list;
      emptyList = list;
      continue;
    }
    if (isRecord(value)) {
      const nested = findList<T>(value, keys);
      if (nested?.length) return nested;
      if (nested) emptyList = nested;
    }
  }

  return emptyList;
}

function extractList<T>(data: unknown, keys: string[]): T[] {
  return findList<T>(data, keys) ?? [];
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
  const project: unknown = isRecord(data) && isRecord(data.project) ? data.project : data;
  if (!isRecord(project) || !Number.isSafeInteger(project.company_project_id) || Number(project.company_project_id) <= 0) {
    throw new Error("프로젝트 응답에 유효한 프로젝트 ID가 없습니다. 목록을 새로고침해 주세요.");
  }
  return project as unknown as CompanyProject;
}

function hasProjectBasics(project: unknown): project is CompanyProject {
  return isRecord(project) && Number.isSafeInteger(project.company_project_id) && Number(project.company_project_id) > 0 &&
    Number.isSafeInteger(project.company_id) && Number(project.company_id) > 0 &&
    typeof project.name === "string" && typeof project.status === "string";
}

function isResourceId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function hasValidAssignments(values: unknown): values is CompanyProjectAssignment[] {
  return Array.isArray(values) && values.every((value) => isRecord(value) &&
    ["assignment_id", "company_project_work_assignment_id", "company_project_work_item_id"]
      .every((key) => value[key] === undefined || isResourceId(value[key])) &&
    // Zero is the documented privacy mask, never a real company member ID.
    (value.assignee_company_member_id == null || value.assignee_company_member_id === 0 ||
      isResourceId(value.assignee_company_member_id)));
}

function hasValidDependencies(values: unknown): values is CompanyProjectWorkDependency[] {
  return Array.isArray(values) && values.every((value) => isRecord(value) &&
    ["company_project_work_dependency_id", "predecessor_work_item_id", "successor_work_item_id"]
      .every((key) => value[key] === undefined || isResourceId(value[key])));
}

function requestFields(payload: object, allowed: readonly string[], datetimeFields: readonly string[] = []) {
  const source = payload as Record<string, unknown>;
  return Object.fromEntries(allowed.flatMap((key) => {
    const value = source[key];
    if (value === undefined) return [];
    return [[key, datetimeFields.includes(key) && typeof value === "string" && value
      ? new Date(value).toISOString() : value]];
  }));
}

const phaseFields = ["name", "description", "status", "planned_start_date", "planned_end_date",
  "actual_start_date", "actual_end_date", "sort_order", "external_phase_id"] as const;
const workItemFields = ["title", "company_project_phase_id", "parent_work_item_id", "description", "status",
  "priority", "planned_start_date", "planned_end_date", "actual_start_date", "actual_end_date", "planned_minutes",
  "due_datetime", "progress_percent", "progress_weight", "is_milestone", "sort_order", "wbs_code", "department_ids"] as const;
const assignmentFields = ["assignee_company_member_id", "department_id", "assigned_by_company_member_id",
  "role", "allocation_percent", "planned_minutes", "status", "progress_percent", "starts_at", "ends_at"] as const;

function belongsToProject(value: Record<string, unknown>, companyProjectId: number) {
  return value.company_project_id === undefined || value.company_project_id === companyProjectId;
}

function hasPhaseBasics(value: unknown, companyProjectId: number): value is CompanyProjectPhase {
  return isRecord(value) && isResourceId(value.company_project_phase_id) &&
    typeof value.name === "string" && belongsToProject(value, companyProjectId);
}

function hasWorkItemBasics(value: unknown, companyProjectId: number): value is CompanyProjectWorkItem {
  return isRecord(value) && isResourceId(value.company_project_work_item_id) &&
    typeof value.title === "string" && typeof value.status === "string" &&
    belongsToProject(value, companyProjectId) &&
    (value.parent_work_item_id == null || isResourceId(value.parent_work_item_id)) &&
    (value.company_project_phase_id == null || isResourceId(value.company_project_phase_id)) &&
    value.parent_work_item_id !== value.company_project_work_item_id;
}

function hasUniqueIds<T>(items: T[], getId: (item: T) => number) {
  return new Set(items.map(getId)).size === items.length;
}

function requirePhase(value: unknown, companyProjectId: number, phaseId?: number) {
  if (!hasPhaseBasics(value, companyProjectId) ||
    (phaseId !== undefined && value.company_project_phase_id !== phaseId)) {
    throw new Error("단계 응답 형식을 확인할 수 없습니다. 프로젝트를 새로고침해 주세요.");
  }
  return value;
}

function requireWorkItem(value: unknown, companyProjectId: number, workItemId?: number) {
  if (!hasWorkItemBasics(value, companyProjectId) ||
    (workItemId !== undefined && value.company_project_work_item_id !== workItemId)) {
    throw new Error("업무 응답 형식을 확인할 수 없습니다. 프로젝트를 새로고침해 주세요.");
  }
  return value;
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
    ...requestFields(payload, ["company_id", "name", "description", "status", "phase_mode", "visibility",
      "origin_department_id", "planned_start_date", "planned_end_date", "actual_start_date", "actual_end_date"]),
    company_id: toOptionalString(payload.company_id),
    origin_department_id: payload.origin_department_id === null ? null : toOptionalString(payload.origin_department_id),
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
  const projects = findList<CompanyProject>(res.data.data, ["projects", "company_projects"]);
  if (!projects) {
    throw new Error("프로젝트 목록 응답 형식을 확인할 수 없습니다. 다시 조회해 주세요.");
  }
  if (projects.some((project) => !hasProjectBasics(project))) {
    throw new Error("프로젝트 목록에 유효하지 않은 정보가 있습니다. 다시 조회해 주세요.");
  }
  return {
    ...res.data,
    data: {
      projects,
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

export async function getCompanyProject(
  companyProjectId: number,
  options: { signal?: AbortSignal } = {},
) {
  const res = await apiClient.get<ApiResponse<CompanyProjectDetailData>>(
    `/company-projects/${companyProjectId}`,
    { signal: options.signal },
  );
  if (!hasProjectBasics(res.data.data?.project) || res.data.data.project.company_project_id !== companyProjectId) {
    throw new Error("프로젝트 상세 응답 형식을 확인할 수 없습니다. 다시 조회해 주세요.");
  }
  const phases = res.data.data.phases ?? [];
  const workItems = res.data.data.work_items ?? [];
  const assignments = res.data.data.assignments ?? [];
  const dependencies = res.data.data.dependencies ?? [];
  if (!Array.isArray(phases) || phases.some((phase) => !hasPhaseBasics(phase, companyProjectId)) ||
    !hasUniqueIds(phases, (phase) => phase.company_project_phase_id) ||
    !Array.isArray(workItems) || workItems.some((item) => !hasWorkItemBasics(item, companyProjectId)) ||
    !hasUniqueIds(workItems, (item) => item.company_project_work_item_id) ||
    [res.data.data.phases, res.data.data.work_items, res.data.data.departments,
      res.data.data.assignments, res.data.data.dependencies]
      .some((value) => value !== undefined && !Array.isArray(value)) ||
    !hasValidAssignments(assignments) || !hasValidDependencies(dependencies)) {
    throw new Error("프로젝트 업무 응답 형식을 확인할 수 없습니다. 다시 조회해 주세요.");
  }
  const data: CompanyProjectDetailData = {
    project: unwrapProject(res.data.data.project),
    phases,
    work_items: workItems,
    departments: res.data.data.departments ?? [],
    assignments,
    dependencies,
    summary: res.data.data.summary,
    detail_policy: res.data.data.detail_policy,
  };
  if (Array.isArray(res.data.data.assignments) && assignments.every((assignment) =>
    Number.isSafeInteger(assignment.company_project_work_item_id) && Number(assignment.company_project_work_item_id) > 0)) assignmentCoverage.add(data);
  return { ...res.data, data };
}

export async function createCompanyProjectPhase(companyProjectId: number, payload: CreateCompanyProjectPhaseRequest) {
  const res = await apiClient.post<ApiResponse<{ phase: CompanyProjectPhase }>>(
    `/company-projects/${companyProjectId}/phases`, requestFields(payload, phaseFields),
  );
  return { ...res.data, data: { phase: requirePhase(res.data.data?.phase, companyProjectId) } };
}

export async function updateCompanyProjectPhase(companyProjectId: number, phaseId: number, payload: UpdateCompanyProjectPhaseRequest) {
  const res = await apiClient.patch<ApiResponse<{ phase: CompanyProjectPhase }>>(
    `/company-projects/${companyProjectId}/phases/${phaseId}`, requestFields(payload, phaseFields),
  );
  return { ...res.data, data: { phase: requirePhase(res.data.data?.phase, companyProjectId, phaseId) } };
}

export async function createCompanyProjectWorkItem(companyProjectId: number, payload: CreateCompanyProjectWorkItemRequest) {
  const res = await apiClient.post<ApiResponse<{ work_item: CompanyProjectWorkItem }>>(
    `/company-projects/${companyProjectId}/work-items`,
    requestFields(payload, [...workItemFields, "external_work_item_id"], ["due_datetime"]),
  );
  return { ...res.data, data: { work_item: requireWorkItem(res.data.data?.work_item, companyProjectId) } };
}

export async function updateCompanyProjectWorkItem(companyProjectId: number, workItemId: number, payload: UpdateCompanyProjectWorkItemRequest) {
  const res = await apiClient.patch<ApiResponse<{ work_item: CompanyProjectWorkItem }>>(
    `/company-projects/${companyProjectId}/work-items/${workItemId}`,
    requestFields(payload, [...workItemFields, "completed_at", "progress_override_percent"], ["due_datetime", "completed_at"]),
  );
  return { ...res.data, data: { work_item: requireWorkItem(res.data.data?.work_item, companyProjectId, workItemId) } };
}

export async function replaceCompanyProjectWorkDepartments(companyProjectId: number, workItemId: number, departmentIds: number[]) {
  const res = await apiClient.put<ApiResponse<{ departments: Array<Record<string, unknown>> }>>(
    `/company-projects/${companyProjectId}/work-items/${workItemId}/departments`, { department_ids: departmentIds },
  );
  return res.data;
}

export async function createCompanyProjectAssignment(companyProjectId: number, workItemId: number, payload: CreateCompanyProjectAssignmentRequest) {
  const res = await apiClient.post<ApiResponse<{ assignment: CompanyProjectAssignment }>>(
    `/company-projects/${companyProjectId}/work-items/${workItemId}/assignments`,
    requestFields(payload, [...assignmentFields, "external_assignment_id"], ["starts_at", "ends_at"]),
  );
  return res.data;
}

export async function updateManagedCompanyProjectAssignment(companyProjectId: number, workItemId: number, assignmentId: number, payload: UpdateManagedCompanyProjectAssignmentRequest) {
  const res = await apiClient.patch<ApiResponse<{ assignment: CompanyProjectAssignment }>>(
    `/company-projects/${companyProjectId}/work-items/${workItemId}/assignments/${assignmentId}`,
    requestFields(payload, [...assignmentFields, "completed_at"], ["starts_at", "ends_at", "completed_at"]),
  );
  return res.data;
}

export async function createCompanyProjectDependency(companyProjectId: number, payload: CreateCompanyProjectDependencyRequest) {
  const res = await apiClient.post<ApiResponse<{ dependency: CompanyProjectWorkDependency }>>(
    `/company-projects/${companyProjectId}/dependencies`,
    requestFields(payload, ["predecessor_work_item_id", "successor_work_item_id", "dependency_type", "lag_days", "external_dependency_id"]),
  );
  return res.data;
}

export async function deleteCompanyProjectDependency(companyProjectId: number, dependencyId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/company-projects/${companyProjectId}/dependencies/${dependencyId}`,
  );
  return res.data;
}

// DELETE transitions to cancelled; these resources remain in project history.
export async function cancelCompanyProjectPhase(companyProjectId: number, phaseId: number) {
  const res = await apiClient.delete<ApiResponse<{ phase: CompanyProjectPhase }>>(
    `/company-projects/${companyProjectId}/phases/${phaseId}`,
  );
  return {
    ...res.data,
    data: { phase: requirePhase(res.data.data?.phase, companyProjectId, phaseId) },
  };
}

export async function cancelCompanyProjectWorkItem(companyProjectId: number, workItemId: number) {
  const res = await apiClient.delete<ApiResponse<{ work_item: CompanyProjectWorkItem }>>(
    `/company-projects/${companyProjectId}/work-items/${workItemId}`,
  );
  return {
    ...res.data,
    data: { work_item: requireWorkItem(res.data.data?.work_item, companyProjectId, workItemId) },
  };
}

// These are user API routes; the server checks the project's owner/manager role.
export async function updateCompanyProject(
  companyProjectId: number,
  payload: UpdateCompanyProjectRequest,
) {
  const res = await apiClient.patch<ApiResponse<CompanyProjectData>>(
    `/company-projects/${companyProjectId}`,
    compactParams({
      ...requestFields(payload, ["name", "description", "status", "visibility", "origin_department_id",
        "planned_start_date", "planned_end_date", "actual_start_date", "actual_end_date", "completed_at"], ["completed_at"]),
      origin_department_id: payload.origin_department_id === null ? null : toOptionalString(payload.origin_department_id),
    }),
  );
  return { ...res.data, data: { project: unwrapProject(res.data.data) } };
}

export async function listCompanyProjectMembers(companyProjectId: number) {
  const res = await apiClient.get<ApiResponse<{ members: CompanyProjectMember[] }>>(
    `/company-projects/${companyProjectId}/members`,
  );
  return res.data;
}

export async function createCompanyProjectMember(
  companyProjectId: number,
  payload: CreateCompanyProjectMemberRequest,
) {
  const res = await apiClient.post<ApiResponse<{ member: CompanyProjectMember }>>(
    `/company-projects/${companyProjectId}/members`,
    compactParams({ ...payload, company_member_id: toOptionalString(payload.company_member_id) }),
  );
  return res.data;
}

export async function updateCompanyProjectMember(
  companyProjectId: number,
  projectMemberId: number,
  payload: UpdateCompanyProjectMemberRequest,
) {
  const res = await apiClient.patch<ApiResponse<{ member: CompanyProjectMember }>>(
    `/company-projects/${companyProjectId}/members/${projectMemberId}`,
    compactParams({ ...payload }),
  );
  return res.data;
}

export async function removeCompanyProjectMember(
  companyProjectId: number,
  projectMemberId: number,
) {
  const res = await apiClient.delete<ApiResponse<{ member: CompanyProjectMember }>>(
    `/company-projects/${companyProjectId}/members/${projectMemberId}`,
  );
  return res.data;
}

export async function getCompanyProjectGantt(
  companyProjectId: number,
  query: CompanyProjectGanttQuery = {},
  options: { signal?: AbortSignal } = {},
) {
  const res = await apiClient.get<ApiResponse<CompanyProjectGanttData>>(
    `/company-projects/${companyProjectId}/gantt`,
    {
      params: normalizeGanttQuery(query),
      signal: options.signal,
    },
  );
  const data: unknown = res.data.data;
  if (!isRecord(data) || !isRecord(data.gantt_policy) ||
    !["small", "medium", "large"].includes(String(data.gantt_policy.scale)) ||
    !["auto", "summary", "full"].includes(String(data.gantt_policy.mode)) ||
    !Number.isInteger(data.gantt_policy.max_depth) ||
    Number(data.gantt_policy.max_depth) < 1 || Number(data.gantt_policy.max_depth) > 5 ||
    typeof data.gantt_policy.full_load_allowed !== "boolean" ||
    !Array.isArray(data.phases) || data.phases.some((phase) => !hasPhaseBasics(phase, companyProjectId)) ||
    !hasUniqueIds(data.phases as CompanyProjectPhase[], (phase) => phase.company_project_phase_id) ||
    !Array.isArray(data.items) || data.items.some((item) => !hasWorkItemBasics(item, companyProjectId) ||
      (item.depth_level !== undefined && (!Number.isInteger(item.depth_level) || item.depth_level < 1 || item.depth_level > 5))) ||
    !hasUniqueIds(data.items as CompanyProjectWorkItem[], (item) => item.company_project_work_item_id) ||
    !hasValidDependencies(data.dependencies) || data.dependencies.some((dependency) =>
      !isResourceId(dependency.company_project_work_dependency_id) ||
      !isResourceId(dependency.predecessor_work_item_id) || !isResourceId(dependency.successor_work_item_id) ||
      !belongsToProject(dependency, companyProjectId))) {
    throw new Error("프로젝트 간트 응답 형식을 확인할 수 없습니다. 다시 조회해 주세요.");
  }
  return {
    ...res.data,
    data: {
      gantt_policy: res.data.data.gantt_policy,
      phases: res.data.data.phases,
      items: res.data.data.items,
      dependencies: res.data.data.dependencies,
    } satisfies CompanyProjectGanttData,
  };
}

export async function listCompanyProjectWorkItemChildren(
  companyProjectId: number,
  workItemId: number,
  query: CompanyProjectWorkItemChildrenQuery = {},
  options: { signal?: AbortSignal } = {},
) {
  const res = await apiClient.get<ApiResponse<CompanyProjectWorkItemChildrenData>>(
    `/company-projects/${companyProjectId}/work-items/${workItemId}/children`,
    {
      params: compactParams({ depth: query.depth }),
      signal: options.signal,
    },
  );
  const items = findList<CompanyProjectWorkItem>(res.data.data, ["children", "work_items"]);
  const parent = res.data.data?.parent;
  const departments = res.data.data?.departments ?? [];
  const assignments = res.data.data?.assignments ?? [];
  const dependencies = res.data.data?.dependencies ?? [];
  if (!items || items.some((item) => !hasWorkItemBasics(item, companyProjectId) ||
    item.company_project_work_item_id === workItemId ||
    ((query.depth ?? 1) === 1 && item.parent_work_item_id !== workItemId)) ||
    !hasUniqueIds(items, (item) => item.company_project_work_item_id) ||
    (parent !== undefined && (!hasWorkItemBasics(parent, companyProjectId) || parent.company_project_work_item_id !== workItemId)) ||
    !Array.isArray(departments) || !hasValidAssignments(assignments) || !hasValidDependencies(dependencies)) {
    throw new Error("하위 업무 응답 형식을 확인할 수 없습니다. 다시 조회해 주세요.");
  }
  const data: CompanyProjectWorkItemChildrenData = {
    parent, items, departments, assignments, dependencies,
  };
  if (Array.isArray(res.data.data.assignments) && assignments.every((assignment) =>
    Number.isSafeInteger(assignment.company_project_work_item_id) && Number(assignment.company_project_work_item_id) > 0)) assignmentCoverage.add(data);
  return { ...res.data, data };
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
    requestFields(payload, ["status", "progress_percent", "completed_at"], ["completed_at"]),
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
  const res = await apiClient.delete<ApiResponse<{ reminder: CompanyProjectWorkReminder }>>(
    `/company-projects/work-reminders/${reminderId}`,
  );
  return res.data;
}
