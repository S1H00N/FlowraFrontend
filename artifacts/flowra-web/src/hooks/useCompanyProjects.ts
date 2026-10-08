import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCompanyProject,
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
import { COMPANY_SCHEDULES_QUERY_KEY } from "@/hooks/useCompanySchedules";
import { TODAY_BRIEFING_QUERY_KEY } from "@/hooks/useTodayBriefing";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CompanyProject,
  CompanyProjectMember,
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
  CreateCompanyProjectWorkReminderRequest,
  MyCompanyProjectWorkItemsData,
  MyCompanyProjectWorkItemsQuery,
  UpdateCompanyProjectWorkAssignmentRequest,
  UpdateCompanyProjectRequest,
} from "@/types";

export const COMPANY_PROJECTS_QUERY_KEY = ["company-projects"] as const;

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
    void queryClient.invalidateQueries({ queryKey: COMPANY_PROJECTS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: COMPANY_SCHEDULES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: TODAY_BRIEFING_QUERY_KEY });
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

export function useCompanyProject(
  companyProjectId: number | null,
  options: { enabled?: boolean } = {},
) {
  return useQuery<CompanyProjectDetailData>({
    queryKey: companyProjectDetailKey(companyProjectId),
    enabled: companyProjectId !== null && (options.enabled ?? true),
    queryFn: async () => {
      const res = await getCompanyProject(companyProjectId as number);
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
    queryFn: async () => {
      const res = await getCompanyProjectGantt(companyProjectId as number, query);
      if (!res.success) {
        throw new Error(res.message || "프로젝트 간트를 불러오지 못했습니다.");
      }
      return res.data;
    },
    placeholderData: (previousData) => previousData,
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
    queryFn: async () => {
      const res = await listCompanyProjectWorkItemChildren(
        companyProjectId as number,
        workItemId as number,
        query,
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
    onSuccess: () => invalidate(),
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
