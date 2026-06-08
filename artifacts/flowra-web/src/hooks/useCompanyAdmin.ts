import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  createCompanyScheduleTargetDepartmentRequest,
  createCompanyAdminSchedule,
  getCompanyAdminMe,
  listCompanyAdminDepartments,
  listCompanyAdminMembers,
} from "@/api/companyAdmin";
import { COMPANY_SCHEDULE_APPROVALS_QUERY_KEY } from "@/hooks/useCompanyScheduleApprovals";
import { COMPANY_SCHEDULES_QUERY_KEY } from "@/hooks/useCompanySchedules";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CompanyAdminDepartment,
  CompanyAdminMe,
  CompanyAdminMember,
  CompanyAdminPermission,
  CompanySchedule,
  CompanyScheduleListQuery,
  CreateCompanyScheduleTargetDepartmentRequest,
  CreateCompanyScheduleRequest,
} from "@/types";

export const COMPANY_ADMIN_QUERY_KEY = ["company-admin"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function companyScheduleListQueryFromKey(
  queryKey: QueryKey,
): CompanyScheduleListQuery | null {
  if (
    queryKey[0] !== COMPANY_SCHEDULES_QUERY_KEY[0] ||
    queryKey[1] !== "list" ||
    !isRecord(queryKey[2])
  ) {
    return null;
  }

  return queryKey[2] as CompanyScheduleListQuery;
}

function dateTimeValue(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function companyScheduleMatchesListQuery(
  schedule: CompanySchedule,
  query: CompanyScheduleListQuery,
) {
  const start = dateTimeValue(schedule.start_datetime);

  if (query.start_from || query.start_to) {
    if (start === null) return false;

    const startFrom = dateTimeValue(query.start_from);
    if (startFrom !== null && start < startFrom) return false;

    const startTo = dateTimeValue(query.start_to);
    if (startTo !== null && start > startTo) return false;
  }

  return true;
}

function sortCompanySchedulesByStart(
  first: CompanySchedule,
  second: CompanySchedule,
) {
  return (
    (dateTimeValue(first.start_datetime) ?? 0) -
    (dateTimeValue(second.start_datetime) ?? 0)
  );
}

function upsertCompanySchedules(
  current: CompanySchedule[] | undefined,
  next: CompanySchedule[],
) {
  const schedulesById = new Map<number, CompanySchedule>();

  for (const schedule of current ?? []) {
    schedulesById.set(schedule.company_schedule_id, schedule);
  }

  for (const schedule of next) {
    schedulesById.set(schedule.company_schedule_id, schedule);
  }

  return [...schedulesById.values()].sort(sortCompanySchedulesByStart);
}

function syncCreatedCompanySchedulesToListCaches(
  queryClient: QueryClient,
  schedules: CompanySchedule[],
) {
  if (schedules.length === 0) return;

  queryClient
    .getQueryCache()
    .findAll({ queryKey: COMPANY_SCHEDULES_QUERY_KEY })
    .forEach((query) => {
      const listQuery = companyScheduleListQueryFromKey(query.queryKey);
      if (!listQuery) return;

      const matchingSchedules = schedules.filter((schedule) =>
        companyScheduleMatchesListQuery(schedule, listQuery),
      );

      if (matchingSchedules.length === 0) return;

      queryClient.setQueryData<CompanySchedule[]>(query.queryKey, (current) =>
        upsertCompanySchedules(current, matchingSchedules),
      );
    });
}

function permissionCode(permission: CompanyAdminPermission) {
  return typeof permission === "string"
    ? permission
    : (permission.code ?? permission.permission_code ?? "");
}

export function hasCompanyAdminPermission(
  admin: CompanyAdminMe | null | undefined,
  code: string,
) {
  return (
    admin?.permissions?.some((permission) => permissionCode(permission) === code) ??
    false
  );
}

export function useCompanyAdminMe() {
  return useQuery<CompanyAdminMe>({
    queryKey: [...COMPANY_ADMIN_QUERY_KEY, "me"],
    queryFn: async () => {
      const res = await getCompanyAdminMe();
      if (!res.success) {
        throw new Error(res.message || "회사 관리자 정보를 불러오지 못했습니다.");
      }
      return res.data;
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCompanyAdminDepartments(enabled = true) {
  return useQuery<CompanyAdminDepartment[]>({
    queryKey: [...COMPANY_ADMIN_QUERY_KEY, "departments"],
    queryFn: async () => {
      const res = await listCompanyAdminDepartments();
      if (!res.success) {
        throw new Error(res.message || "부서 목록을 불러오지 못했습니다.");
      }
      return res.data.departments ?? [];
    },
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCompanyAdminMembers(enabled = true) {
  return useQuery<CompanyAdminMember[]>({
    queryKey: [...COMPANY_ADMIN_QUERY_KEY, "members"],
    queryFn: async () => {
      const res = await listCompanyAdminMembers();
      if (!res.success) {
        throw new Error(res.message || "구성원 목록을 불러오지 못했습니다.");
      }
      return res.data.members ?? [];
    },
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateCompanyAdminSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCompanyScheduleRequest) => {
      const res = await createCompanyAdminSchedule(payload);
      if (!res.success) {
        throw new Error(res.message || "회사 일정 추가에 실패했습니다.");
      }
      return res.data.schedule;
    },
    onSuccess: (schedule) => {
      syncCreatedCompanySchedulesToListCaches(queryClient, [schedule]);
      void queryClient.invalidateQueries({
        queryKey: COMPANY_SCHEDULES_QUERY_KEY,
      });
      void queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: COMPANY_ADMIN_QUERY_KEY });
    },
    meta: {
      successMessage: "회사 일정을 추가했습니다.",
      errorMessage: "회사 일정 추가에 실패했습니다.",
    },
  });
}

export function useCreateCompanyScheduleTargetDepartmentRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      companyScheduleId,
      payload,
    }: {
      companyScheduleId: number;
      payload: CreateCompanyScheduleTargetDepartmentRequest;
    }) => {
      const res = await createCompanyScheduleTargetDepartmentRequest(
        companyScheduleId,
        payload,
      );
      if (!res.success) {
        throw new Error(res.message || "협업 부서 요청에 실패했습니다.");
      }
      return res.data.schedule;
    },
    onSuccess: (schedule) => {
      syncCreatedCompanySchedulesToListCaches(queryClient, [schedule]);
      void queryClient.invalidateQueries({
        queryKey: COMPANY_SCHEDULES_QUERY_KEY,
      });
      void queryClient.invalidateQueries({
        queryKey: COMPANY_SCHEDULE_APPROVALS_QUERY_KEY,
      });
      void queryClient.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: COMPANY_ADMIN_QUERY_KEY });
    },
    meta: {
      successMessage: "협업 부서 요청을 보냈습니다.",
      errorMessage: "협업 부서 요청에 실패했습니다.",
    },
  });
}
