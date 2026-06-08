import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  createRecurringSchedule,
  createSchedule,
  deleteSchedule,
  deleteSchedulesBulk,
  listSchedules,
  updateSchedule,
} from "@/api/schedules";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import type {
  CreateRecurringScheduleRequest,
  CreateScheduleRequest,
  Schedule,
  ScheduleListQuery,
  UpdateScheduleRequest,
} from "@/types";

export const SCHEDULES_QUERY_KEY = ["schedules"] as const;

export function schedulesListKey(query: ScheduleListQuery = {}) {
  return [...SCHEDULES_QUERY_KEY, "list", query] as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function scheduleListQueryFromKey(queryKey: QueryKey): ScheduleListQuery | null {
  if (
    queryKey[0] !== SCHEDULES_QUERY_KEY[0] ||
    queryKey[1] !== "list" ||
    !isRecord(queryKey[2])
  ) {
    return null;
  }

  return queryKey[2] as ScheduleListQuery;
}

function toFilterValues<T>(value: T | T[] | undefined) {
  if (value === undefined || value === null || value === "") return [];
  return (Array.isArray(value) ? value : [value])
    .map((item) => String(item))
    .filter(Boolean);
}

function matchesFilter<T>(
  filterValue: T | T[] | undefined,
  scheduleValue: T | null | undefined,
) {
  const filters = toFilterValues(filterValue);
  if (filters.length === 0) return true;
  if (scheduleValue === undefined || scheduleValue === null) return false;
  return filters.includes(String(scheduleValue));
}

function dateTimeValue(value?: string | null) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function scheduleMatchesListQuery(
  schedule: Schedule,
  query: ScheduleListQuery,
) {
  const start = dateTimeValue(schedule.start_datetime);

  if (query.start_from || query.start_to) {
    if (start === null) return false;

    const startFrom = dateTimeValue(query.start_from);
    if (startFrom !== null && start < startFrom) return false;

    const startTo = dateTimeValue(query.start_to);
    if (startTo !== null && start > startTo) return false;
  }

  if (!matchesFilter(query.category_id, schedule.category_id)) return false;
  if (!matchesFilter(query.schedule_type, schedule.schedule_type)) return false;
  if (!matchesFilter(query.priority, schedule.priority)) return false;

  if (
    query.is_completed !== undefined &&
    Boolean(schedule.is_completed) !== query.is_completed
  ) {
    return false;
  }

  if (query.q?.trim()) {
    const keyword = query.q.trim().toLowerCase();
    const haystack = [schedule.title, schedule.description, schedule.location]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!haystack.includes(keyword)) return false;
  }

  if (query.location?.trim()) {
    const locationKeyword = query.location.trim().toLowerCase();
    if (!(schedule.location ?? "").toLowerCase().includes(locationKeyword)) {
      return false;
    }
  }

  return true;
}

function sortSchedulesByStart(first: Schedule, second: Schedule) {
  return (
    (dateTimeValue(first.start_datetime) ?? 0) -
    (dateTimeValue(second.start_datetime) ?? 0)
  );
}

function upsertSchedules(current: Schedule[] | undefined, next: Schedule[]) {
  const schedulesById = new Map<number, Schedule>();

  for (const schedule of current ?? []) {
    schedulesById.set(schedule.schedule_id, schedule);
  }

  for (const schedule of next) {
    schedulesById.set(schedule.schedule_id, schedule);
  }

  return [...schedulesById.values()].sort(sortSchedulesByStart);
}

function syncCreatedSchedulesToListCaches(
  queryClient: QueryClient,
  schedules: Schedule[],
) {
  if (schedules.length === 0) return;

  queryClient
    .getQueryCache()
    .findAll({ queryKey: SCHEDULES_QUERY_KEY })
    .forEach((query) => {
      const listQuery = scheduleListQueryFromKey(query.queryKey);
      if (!listQuery) return;

      const matchingSchedules = schedules.filter((schedule) =>
        scheduleMatchesListQuery(schedule, listQuery),
      );

      if (matchingSchedules.length === 0) return;

      queryClient.setQueryData<Schedule[]>(query.queryKey, (current) =>
        upsertSchedules(current, matchingSchedules),
      );
    });
}

export function useSchedules(query: ScheduleListQuery = {}) {
  return useQuery<Schedule[]>({
    queryKey: schedulesListKey(query),
    queryFn: async () => {
      const res = await listSchedules(query);
      if (!res.success) {
        throw new Error(res.message || "일정을 불러오지 못했습니다.");
      }
      return res.data.schedules ?? [];
    },
    placeholderData: (previousData) => previousData,
  });
}

function useInvalidateSchedules() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
    void qc.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
  };
}

export function useCreateSchedule() {
  const invalidate = useInvalidateSchedules();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateScheduleRequest) => {
      const res = await createSchedule(payload);
      if (!res.success) throw new Error(res.message || "생성에 실패했습니다.");
      return res.data.schedule;
    },
    onSuccess: (schedule) => {
      syncCreatedSchedulesToListCaches(queryClient, [schedule]);
      invalidate();
    },
    meta: {
      successMessage: "일정이 추가되었습니다.",
      errorMessage: "일정 추가에 실패했습니다.",
    },
  });
}

export function useCreateSchedules() {
  const invalidate = useInvalidateSchedules();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payloads: CreateScheduleRequest[]) => {
      const schedules: Schedule[] = [];

      for (const payload of payloads) {
        const res = await createSchedule(payload);
        if (!res.success) {
          throw new Error(res.message || "생성에 실패했습니다.");
        }
        schedules.push(res.data.schedule);
      }

      return schedules;
    },
    onSuccess: (schedules) => {
      syncCreatedSchedulesToListCaches(queryClient, schedules);
      invalidate();
    },
    meta: {
      successMessage: "일정이 추가되었습니다.",
      errorMessage: "일정 추가에 실패했습니다.",
    },
  });
}

export function useCreateRecurringSchedule() {
  const invalidate = useInvalidateSchedules();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateRecurringScheduleRequest) => {
      const res = await createRecurringSchedule(payload);
      if (!res.success) throw new Error(res.message || "생성에 실패했습니다.");
      return res.data;
    },
    onSuccess: (data) => {
      syncCreatedSchedulesToListCaches(queryClient, data.schedules ?? []);
      invalidate();
    },
    meta: {
      successMessage: "반복 일정이 추가되었습니다.",
      errorMessage: "반복 일정 추가에 실패했습니다.",
    },
  });
}

export function useUpdateSchedule() {
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      payload,
    }: {
      scheduleId: number;
      payload: UpdateScheduleRequest;
    }) => {
      const res = await updateSchedule(scheduleId, payload);
      if (!res.success) throw new Error(res.message || "수정에 실패했습니다.");
      return res.data.schedule;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "일정이 수정되었습니다.",
      errorMessage: "일정 수정에 실패했습니다.",
    },
  });
}

export function useDeleteSchedule() {
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async (scheduleId: number) => {
      const res = await deleteSchedule(scheduleId);
      if (!res.success) throw new Error(res.message || "삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "일정이 삭제되었습니다.",
      errorMessage: "일정 삭제에 실패했습니다.",
    },
  });
}

export function useDeleteSchedules() {
  const invalidate = useInvalidateSchedules();
  return useMutation({
    mutationFn: async (scheduleIds: number[]) => {
      const res = await deleteSchedulesBulk(scheduleIds);
      if (!res.success) throw new Error(res.message || "삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      errorMessage: "일정 삭제에 실패했습니다.",
    },
  });
}
