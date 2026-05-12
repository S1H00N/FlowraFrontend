import { useQuery } from "@tanstack/react-query";
import { listCompanySchedules } from "@/api/companySchedules";
import type { CompanySchedule, CompanyScheduleListQuery } from "@/types";

export const COMPANY_SCHEDULES_QUERY_KEY = ["company-schedules"] as const;

export function companySchedulesListKey(
  query: CompanyScheduleListQuery = {},
) {
  return [...COMPANY_SCHEDULES_QUERY_KEY, "list", query] as const;
}

export function useCompanySchedules(
  query: CompanyScheduleListQuery = {},
) {
  return useQuery<CompanySchedule[]>({
    queryKey: companySchedulesListKey(query),
    queryFn: async () => {
      const res = await listCompanySchedules(query);
      if (!res.success) {
        throw new Error(
          res.message || "회사 일정을 불러오지 못했습니다.",
        );
      }
      return res.data.company_schedules ?? [];
    },
  });
}
