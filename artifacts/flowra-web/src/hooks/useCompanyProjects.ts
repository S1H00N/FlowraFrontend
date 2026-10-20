import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelCompanyProjectPhase,
  cancelCompanyProjectWorkItem,
  createCompanyProject,
  createCompanyProjectMember,
  updateCompanyProjectMember,
  removeCompanyProjectMember,
  createCompanyProjectAssignment,
  updateManagedCompanyProjectAssignment,
  createCompanyProjectPhase,
  updateCompanyProjectPhase,
  createCompanyProjectWorkItem,
  updateCompanyProjectWorkItem,
  createCompanyProjectWorkReminder,
  deleteCompanyProjectWorkReminder,
  getCompanyProject,
  getCompanyProjectGantt,
  listCompanyProjects,
  listCompanyProjectMembers,
  listCompanyProjectWorkItemChildren,
  listCompanyProjectWorkReminders,
  listMyCompanyProjectCalendarItems,
  listMyCompanyProjectWorkItems,
  updateCompanyProjectWorkAssignment,
  updateCompanyProject,
} from "@/api/companyProjects";
import { listCompanyAdminMembers } from "@/api/companyAdmin";
import { COMPANY_SCHEDULES_QUERY_KEY } from "@/hooks/useCompanySchedules";
import { TODAY_BRIEFING_QUERY_KEY } from "@/hooks/useTodayBriefing";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CompanyProject,
  CompanyProjectAssignment,
  CompanyAdminMember,
  CreateCompanyProjectMemberRequest,
  UpdateCompanyProjectMemberRequest,
  CreateCompanyProjectAssignmentRequest,
  UpdateManagedCompanyProjectAssignmentRequest,
  CompanyProjectMember,
  CompanyProjectPhase,
  CompanyProjectWorkItem,
  CompanyProjectCalendarItemsData,
  CompanyProjectCalendarItemsQuery,
  CompanyProjectDetailData,
  CompanyProjectGanttData,
  CompanyProjectGanttQuery,
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
  CreateCompanyProjectWorkReminderRequest,
  MyCompanyProjectWorkItemsData,
  MyCompanyProjectWorkItemsQuery,
  UpdateCompanyProjectWorkAssignmentRequest,
  UpdateCompanyProjectRequest,
} from "@/types";

export const COMPANY_PROJECTS_QUERY_KEY = ["company-projects"] as const;

function confirmedProjectMember(member: CompanyProjectMember | undefined, companyMemberId?: string | number, projectMemberId?: number) {
  const id = member?.company_project_member_id ?? member?.project_member_id;
  if (!member || !Number.isSafeInteger(id) || Number(id) <= 0 ||
    !Number.isSafeInteger(member.company_member_id) || member.company_member_id <= 0 || typeof member.role !== "string" ||
    (companyMemberId !== undefined && member.company_member_id !== Number(companyMemberId)) ||
    (projectMemberId !== undefined && id !== projectMemberId))
    throw new Error("프로젝트 구성원 변경 결과를 확인할 수 없습니다. 최신 목록을 확인해 주세요.");
  return member;
}

function confirmedProjectAssignment(assignment: CompanyProjectAssignment | undefined, workItemId: number, assignmentId?: number, memberId?: number) {
  const id = assignment?.company_project_work_assignment_id ?? assignment?.assignment_id;
  if (!assignment || !Number.isSafeInteger(id) || Number(id) <= 0 ||
    (assignmentId !== undefined && id !== assignmentId) ||
    (assignment.company_project_work_item_id !== undefined && assignment.company_project_work_item_id !== workItemId) ||
    (memberId !== undefined && assignment.assignee_company_member_id !== memberId))
    throw new Error("담당자 배정 결과를 확인할 수 없습니다. 최신 목록을 확인해 주세요.");
  return assignment;
}

export function companyProjectsListKey(query: CompanyProjectsQuery = {}) {
  return [...COMPANY_PROJECTS_QUERY_KEY, "list", query] as const;
}

export function companyProjectDetailKey(companyProjectId: number | null) {
  return [...COMPANY_PROJECTS_QUERY_KEY, "detail", companyProjectId ?? 0] as const;
}

export function companyProjectGanttKey(
  companyProjectId: number | null,
  query: CompanyProjectGanttQuery = {},
) {
  return [
    ...COMPANY_PROJECTS_QUERY_KEY,
    "gantt",
    companyProjectId ?? 0,
    query,
  ] as const;
}

export function companyProjectWorkItemChildrenKey(
  companyProjectId: number | null,
  workItemId: number | null,
  query: CompanyProjectWorkItemChildrenQuery = {},
) {
  return [
    ...COMPANY_PROJECTS_QUERY_KEY,
    "work-item-children",
    companyProjectId ?? 0,
    workItemId ?? 0,
    query,
  ] as const;
}

export function myCompanyProjectWorkItemsKey(
  query: MyCompanyProjectWorkItemsQuery = {},
) {
  return [...COMPANY_PROJECTS_QUERY_KEY, "my-work-items", query] as const;
}

export function myCompanyProjectCalendarItemsKey(
  query: CompanyProjectCalendarItemsQuery = {},
) {
  return [...COMPANY_PROJECTS_QUERY_KEY, "my-calendar-items", query] as const;
}

export function companyProjectWorkRemindersKey(
  query: CompanyProjectWorkRemindersQuery = {},
) {
  return [...COMPANY_PROJECTS_QUERY_KEY, "work-reminders", query] as const;
}

function useInvalidateCompanyProjectSurfaces() {
  const queryClient = useQueryClient();
  return () => {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: COMPANY_PROJECTS_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: COMPANY_SCHEDULES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: TODAY_BRIEFING_QUERY_KEY }),
    ]);
  };
}

function useInvalidateCompanyProjectAssignments() {
  const queryClient = useQueryClient();
  return async (companyProjectId: number) => {
    const companyId = queryClient.getQueryData<CompanyProjectDetailData>(companyProjectDetailKey(companyProjectId))?.project.company_id;
    const matchesCompany = (filter: unknown) => {
      if (!filter || typeof filter !== "object" || !("company_id" in filter)) return true;
      return companyId === undefined || filter.company_id === undefined || Number(filter.company_id) === companyId;
    };
    const relatedProjectQuery = ({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (queryKey[0] !== COMPANY_PROJECTS_QUERY_KEY[0]) return false;
      const kind = queryKey[1];
      if (kind === "detail" || kind === "work-item-children" || kind === "gantt" || kind === "members")
        return queryKey[2] === companyProjectId;
      if (kind === "list") return matchesCompany(queryKey[2]);
      if (kind === "my-work-items" || kind === "my-calendar-items") {
        const filter = queryKey[2] as { project_id?: string | number } | undefined;
        return filter?.project_id === undefined || Number(filter.project_id) === companyProjectId;
      }
      return false;
    };
    const relatedCompanyFeed = ({ queryKey }: { queryKey: readonly unknown[] }) => {
      if (queryKey[1] !== "feed") return false;
      const filter = queryKey[2] as { include_project_work_items?: boolean; project_id?: string | number } | undefined;
      return filter?.include_project_work_items !== false && matchesCompany(filter) &&
        (filter?.project_id === undefined || Number(filter.project_id) === companyProjectId);
    };
    // Cancel even an initial detail/children request with no cached data.
    // invalidateQueries alone can otherwise reuse a pre-mutation response.
    await Promise.all([
      queryClient.cancelQueries({ queryKey: COMPANY_PROJECTS_QUERY_KEY, predicate: relatedProjectQuery }),
      queryClient.cancelQueries({ queryKey: COMPANY_SCHEDULES_QUERY_KEY, predicate: relatedCompanyFeed }),
    ]);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: COMPANY_PROJECTS_QUERY_KEY, predicate: relatedProjectQuery }),
      queryClient.invalidateQueries({ queryKey: COMPANY_SCHEDULES_QUERY_KEY, predicate: relatedCompanyFeed }),
      queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY, predicate: ({ queryKey }) => matchesCompany(queryKey[2]) }),
      queryClient.invalidateQueries({ queryKey: TODAY_BRIEFING_QUERY_KEY, predicate: ({ queryKey }) => matchesCompany(queryKey[2]) }),
    ]);
  };
}

export function useCompanyProjects(
  query: CompanyProjectsQuery = {},
  options: { enabled?: boolean; keepPreviousData?: boolean } = {},
) {
  return useQuery<CompanyProject[]>({
    queryKey: companyProjectsListKey(query),
    queryFn: async () => {
      const res = await listCompanyProjects(query);
      if (!res.success) {
        throw new Error(res.message || "회사 프로젝트를 불러오지 못했습니다.");
      }
      return res.data.projects;
    },
    enabled: options.enabled ?? true,
    placeholderData: (previousData, previousQuery) => {
      const previousFilter = previousQuery?.queryKey[2] as CompanyProjectsQuery | undefined;
      // A company change must never show another company's cached rows.
      return options.keepPreviousData !== false && previousFilter?.company_id === query.company_id
        ? previousData
        : undefined;
    },
  });
}

export function useCompanyProjectMembers(
  companyProjectId: number,
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanyProjectMember[]>({
    queryKey: [...COMPANY_PROJECTS_QUERY_KEY, "members", companyProjectId],
    enabled: options.enabled ?? true,
    retry: false,
    queryFn: async () => {
      const res = await listCompanyProjectMembers(companyProjectId);
      if (!res.success) throw new Error(res.message || "프로젝트 권한을 확인하지 못했습니다.");
      if (!Array.isArray(res.data?.members) || res.data.members.some((member) =>
        !member || typeof member !== "object" || !Number.isSafeInteger(member.company_member_id) ||
        member.company_member_id <= 0 || typeof member.role !== "string" ||
        (member.status !== undefined && typeof member.status !== "string"),
      )) throw new Error("프로젝트 멤버 응답 형식을 확인할 수 없습니다.");
      return res.data.members;
    },
  });
}

export function useCompanyProjectDirectory(companyId: number, options: { enabled?: boolean } = {}) {
  return useQuery<CompanyAdminMember[]>({
    queryKey: [...COMPANY_PROJECTS_QUERY_KEY, "directory", companyId],
    enabled: companyId > 0 && (options.enabled ?? true),
    retry: false,
    queryFn: async ({ signal }) => {
      const res = await listCompanyAdminMembers(companyId, { signal });
      if (!res.success) throw new Error(res.message || "회사 구성원을 불러오지 못했습니다.");
      return res.data.members;
    },
  });
}

export function useCreateCompanyProjectMember() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation({
    mutationFn: async ({ companyProjectId, payload }: { companyProjectId: number; payload: CreateCompanyProjectMemberRequest }) => {
      const res = await createCompanyProjectMember(companyProjectId, payload);
      if (!res.success) throw new Error(res.message || "프로젝트 구성원을 추가하지 못했습니다.");
      return confirmedProjectMember(res.data?.member, payload.company_member_id);
    },
    onSettled: invalidate,
    meta: { successMessage: "프로젝트 구성원을 추가했습니다.", errorMessage: "프로젝트 구성원을 추가하지 못했습니다." },
  });
}

export function useUpdateCompanyProjectMember() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation({
    mutationFn: async ({ companyProjectId, projectMemberId, payload }: { companyProjectId: number; projectMemberId: number; payload: UpdateCompanyProjectMemberRequest }) => {
      const res = await updateCompanyProjectMember(companyProjectId, projectMemberId, payload);
      if (!res.success) throw new Error(res.message || "프로젝트 구성원을 변경하지 못했습니다.");
      return confirmedProjectMember(res.data?.member, undefined, projectMemberId);
    },
    onSettled: invalidate,
    meta: { successMessage: "프로젝트 구성원을 변경했습니다.", errorMessage: "프로젝트 구성원을 변경하지 못했습니다." },
  });
}

export function useRemoveCompanyProjectMember() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation({
    mutationFn: async ({ companyProjectId, projectMemberId }: { companyProjectId: number; projectMemberId: number }) => {
      const res = await removeCompanyProjectMember(companyProjectId, projectMemberId);
      if (!res.success) throw new Error(res.message || "프로젝트 구성원을 제외하지 못했습니다.");
      return confirmedProjectMember(res.data?.member, undefined, projectMemberId);
    },
    onSettled: invalidate,
    meta: { successMessage: "프로젝트 구성원을 제외했습니다.", errorMessage: "프로젝트 구성원을 제외하지 못했습니다." },
  });
}

export function useCreateCompanyProjectAssignment() {
  const invalidate = useInvalidateCompanyProjectAssignments();
  return useMutation({
    retry: false,
    mutationFn: async ({ companyProjectId, workItemId, payload }: { companyProjectId: number; workItemId: number; payload: CreateCompanyProjectAssignmentRequest }) => {
      const res = await createCompanyProjectAssignment(companyProjectId, workItemId, payload);
      if (!res.success) throw new Error(res.message || "담당자를 배정하지 못했습니다.");
      return confirmedProjectAssignment(res.data?.assignment, workItemId, undefined, payload.assignee_company_member_id);
    },
    onSettled: (_data, _error, variables) => invalidate(variables.companyProjectId),
    meta: { successMessage: "담당자를 배정했습니다.", errorMessage: "담당자를 배정하지 못했습니다." },
  });
}

export function useUpdateManagedCompanyProjectAssignment() {
  const invalidate = useInvalidateCompanyProjectAssignments();
  return useMutation({
    retry: false,
    mutationFn: async ({ companyProjectId, workItemId, assignmentId, payload }: { companyProjectId: number; workItemId: number; assignmentId: number; payload: UpdateManagedCompanyProjectAssignmentRequest }) => {
      const res = await updateManagedCompanyProjectAssignment(companyProjectId, workItemId, assignmentId, payload);
      if (!res.success) throw new Error(res.message || "담당자 배정을 변경하지 못했습니다.");
      return confirmedProjectAssignment(res.data?.assignment, workItemId, assignmentId, payload.assignee_company_member_id);
    },
    onSettled: (_data, _error, variables) => invalidate(variables.companyProjectId),
    meta: { successMessage: "담당자 배정을 변경했습니다.", errorMessage: "담당자 배정을 변경하지 못했습니다." },
  });
}

export function useCompanyProject(
  companyProjectId: number | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanyProjectDetailData>({
    queryKey: companyProjectDetailKey(companyProjectId),
    enabled: companyProjectId !== null && (options.enabled ?? true),
    // Preserve the response-local assignment completeness bookkeeping.
    structuralSharing: false,
    queryFn: async ({ signal }) => {
      const res = await getCompanyProject(companyProjectId as number, { signal });
      if (!res.success) {
        throw new Error(res.message || "회사 프로젝트를 불러오지 못했습니다.");
      }
      return res.data;
    },
  });
}

export function useCompanyProjectGantt(
  companyProjectId: number | null,
  query: CompanyProjectGanttQuery = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanyProjectGanttData>({
    queryKey: companyProjectGanttKey(companyProjectId, query),
    enabled: companyProjectId !== null && (options.enabled ?? true),
    queryFn: async ({ signal }) => {
      const res = await getCompanyProjectGantt(companyProjectId as number, query, { signal });
      if (!res.success) {
        throw new Error(res.message || "프로젝트 간트를 불러오지 못했습니다.");
      }
      return res.data;
    },
  });
}

export function useCompanyProjectWorkItemChildren(
  companyProjectId: number | null,
  workItemId: number | null,
  query: CompanyProjectWorkItemChildrenQuery = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanyProjectWorkItemChildrenData>({
    queryKey: companyProjectWorkItemChildrenKey(
      companyProjectId,
      workItemId,
      query,
    ),
    enabled:
      companyProjectId !== null &&
      workItemId !== null &&
      (options.enabled ?? true),
    structuralSharing: false,
    queryFn: async ({ signal }) => {
      const res = await listCompanyProjectWorkItemChildren(
        companyProjectId as number,
        workItemId as number,
        query,
        { signal },
      );
      if (!res.success) {
        throw new Error(res.message || "하위 업무를 불러오지 못했습니다.");
      }
      return res.data;
    },
  });
}

export function useMyCompanyProjectWorkItems(
  query: MyCompanyProjectWorkItemsQuery = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<MyCompanyProjectWorkItemsData>({
    queryKey: myCompanyProjectWorkItemsKey(query),
    queryFn: async () => {
      const res = await listMyCompanyProjectWorkItems(query);
      if (!res.success) {
        throw new Error(res.message || "내 프로젝트 업무를 불러오지 못했습니다.");
      }
      return res.data;
    },
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export function useMyCompanyProjectCalendarItems(
  query: CompanyProjectCalendarItemsQuery = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanyProjectCalendarItemsData>({
    queryKey: myCompanyProjectCalendarItemsKey(query),
    queryFn: async () => {
      const res = await listMyCompanyProjectCalendarItems(query);
      if (!res.success) {
        throw new Error(
          res.message || "프로젝트 캘린더 업무를 불러오지 못했습니다.",
        );
      }
      return res.data;
    },
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export function useCompanyProjectWorkReminders(
  query: CompanyProjectWorkRemindersQuery = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanyProjectWorkRemindersData>({
    queryKey: companyProjectWorkRemindersKey(query),
    queryFn: async () => {
      const res = await listCompanyProjectWorkReminders(query);
      if (!res.success) {
        throw new Error(
          res.message || "프로젝트 업무 리마인더를 불러오지 못했습니다.",
        );
      }
      return res.data;
    },
    enabled: options.enabled ?? true,
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateCompanyProject() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation<CompanyProject, Error, CreateCompanyProjectRequest>({
    mutationFn: async (payload) => {
      const res = await createCompanyProject(payload);
      if (!res.success) {
        throw new Error(res.message || "회사 프로젝트 생성에 실패했습니다.");
      }
      return res.data.project;
    },
    // A failed transport may still have committed this non-idempotent POST.
    onSettled: invalidate,
    meta: {
      successMessage: "회사 프로젝트를 추가했습니다.",
      errorMessage: "회사 프로젝트 생성에 실패했습니다.",
    },
  });
}

export function useUpdateCompanyProject() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation({
    mutationFn: async ({ companyProjectId, payload }: {
      companyProjectId: number;
      payload: UpdateCompanyProjectRequest;
    }) => {
      const res = await updateCompanyProject(companyProjectId, payload);
      if (!res.success) {
        throw new Error(res.message || "회사 프로젝트 수정에 실패했습니다.");
      }
      return res.data.project;
    },
    onSettled: invalidate,
    meta: {
      successMessage: "회사 프로젝트를 변경했습니다.",
      errorMessage: "회사 프로젝트 수정에 실패했습니다.",
    },
  });
}

export function useCancelCompanyProjectPhase() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation<CompanyProjectPhase, Error, { companyProjectId: number; phaseId: number }>({
    mutationFn: async ({ companyProjectId, phaseId }) => {
      const res = await cancelCompanyProjectPhase(companyProjectId, phaseId);
      if (!res.success) throw new Error(res.message || "단계를 취소하지 못했습니다.");
      return res.data.phase;
    },
    onSettled: invalidate,
    meta: {
      successMessage: "단계를 취소했습니다.",
      errorMessage: "단계를 취소하지 못했습니다.",
    },
  });
}

export function useCreateCompanyProjectPhase() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation({
    mutationFn: async ({ companyProjectId, payload }: { companyProjectId: number; payload: CreateCompanyProjectPhaseRequest }) => {
      const res = await createCompanyProjectPhase(companyProjectId, payload);
      if (!res.success) throw new Error(res.message || "단계를 추가하지 못했습니다.");
      return res.data.phase;
    },
    onSettled: invalidate,
    meta: { successMessage: "단계를 추가했습니다.", errorMessage: "단계를 추가하지 못했습니다." },
  });
}

export function useUpdateCompanyProjectPhase() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation({
    mutationFn: async ({ companyProjectId, phaseId, payload }: { companyProjectId: number; phaseId: number; payload: UpdateCompanyProjectPhaseRequest }) => {
      const res = await updateCompanyProjectPhase(companyProjectId, phaseId, payload);
      if (!res.success) throw new Error(res.message || "단계를 수정하지 못했습니다.");
      return res.data.phase;
    },
    onSettled: invalidate,
    meta: { successMessage: "단계를 수정했습니다.", errorMessage: "단계를 수정하지 못했습니다." },
  });
}

export function useCreateCompanyProjectWorkItem() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation({
    mutationFn: async ({ companyProjectId, payload }: { companyProjectId: number; payload: CreateCompanyProjectWorkItemRequest }) => {
      const res = await createCompanyProjectWorkItem(companyProjectId, payload);
      if (!res.success) throw new Error(res.message || "업무를 추가하지 못했습니다.");
      return res.data.work_item;
    },
    onSettled: invalidate,
    meta: { successMessage: "업무를 추가했습니다.", errorMessage: "업무를 추가하지 못했습니다." },
  });
}

export function useUpdateCompanyProjectWorkItem() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation({
    mutationFn: async ({ companyProjectId, workItemId, payload }: { companyProjectId: number; workItemId: number; payload: UpdateCompanyProjectWorkItemRequest }) => {
      const res = await updateCompanyProjectWorkItem(companyProjectId, workItemId, payload);
      if (!res.success) throw new Error(res.message || "업무를 수정하지 못했습니다.");
      return res.data.work_item;
    },
    onSettled: invalidate,
    meta: { successMessage: "업무를 수정했습니다.", errorMessage: "업무를 수정하지 못했습니다." },
  });
}

export function useCancelCompanyProjectWorkItem() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation<CompanyProjectWorkItem, Error, { companyProjectId: number; workItemId: number }>({
    mutationFn: async ({ companyProjectId, workItemId }) => {
      const res = await cancelCompanyProjectWorkItem(companyProjectId, workItemId);
      if (!res.success) throw new Error(res.message || "업무를 취소하지 못했습니다.");
      return res.data.work_item;
    },
    onSettled: invalidate,
    meta: {
      successMessage: "업무를 취소했습니다.",
      errorMessage: "업무를 취소하지 못했습니다.",
    },
  });
}

export function useUpdateCompanyProjectWorkAssignment() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation<
    Record<string, unknown>,
    Error,
    {
      assignmentId: number;
      payload: UpdateCompanyProjectWorkAssignmentRequest;
    }
  >({
    mutationFn: async ({ assignmentId, payload }) => {
      const res = await updateCompanyProjectWorkAssignment(
        assignmentId,
        payload,
      );
      if (!res.success) {
        throw new Error(res.message || "프로젝트 업무 상태 변경에 실패했습니다.");
      }
      return res.data.assignment;
    },
    onSettled: invalidate,
    meta: {
      successMessage: "프로젝트 업무 상태를 변경했습니다.",
      errorMessage: "프로젝트 업무 상태 변경에 실패했습니다.",
    },
  });
}

export function useCreateCompanyProjectWorkReminder() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation<
    CompanyProjectWorkReminder,
    Error,
    {
      assignmentId: number;
      payload: CreateCompanyProjectWorkReminderRequest;
    }
  >({
    mutationFn: async ({ assignmentId, payload }) => {
      const res = await createCompanyProjectWorkReminder(assignmentId, payload);
      if (!res.success) {
        throw new Error(
          res.message || "프로젝트 업무 리마인더 생성에 실패했습니다.",
        );
      }
      return res.data.reminder;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "프로젝트 업무 리마인더를 추가했습니다.",
      errorMessage: "프로젝트 업무 리마인더 생성에 실패했습니다.",
    },
  });
}

export function useDeleteCompanyProjectWorkReminder() {
  const invalidate = useInvalidateCompanyProjectSurfaces();
  return useMutation({
    mutationFn: async (reminderId: number) => {
      const res = await deleteCompanyProjectWorkReminder(reminderId);
      if (!res.success) {
        throw new Error(
          res.message || "프로젝트 업무 리마인더 삭제에 실패했습니다.",
        );
      }
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "프로젝트 업무 리마인더를 삭제했습니다.",
      errorMessage: "프로젝트 업무 리마인더 삭제에 실패했습니다.",
    },
  });
}
