import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  createScheduleFriendShare,
  createScheduleShareLink,
  createRecurringSchedule,
  createSchedule,
  deleteScheduleShareLink,
  deleteScheduleShare,
  deleteSchedule,
  deleteSchedulesBulk,
  getSchedule,
  getScheduleShareLinkPreview,
  joinScheduleShareLink,
  listScheduleShareLinks,
  listScheduleShares,
  listSharedSchedules,
  updateScheduleShareLink,
  updateScheduleShare,
  listSchedules,
  updateSchedule,
} from "@/api/schedules";
import { TODAY_HOME_QUERY_KEY } from "@/hooks/useTodayHome";
import { toOffsetISOString } from "@/utils/dateUtils";
import type {
  CreateRecurringScheduleRequest,
  CreateScheduleFriendShareRequest,
  CreateScheduleRequest,
  CreateScheduleShareLinkRequest,
  JoinScheduleShareLinkResponse,
  Schedule,
  ScheduleShareLinkPreview,
  ScheduleListQuery,
  SharedSchedulesQuery,
  UpdateScheduleShareLinkRequest,
  UpdateScheduleShareRequest,
  UpdateScheduleRequest,
} from "@/types";

export const SCHEDULES_QUERY_KEY = ["schedules"] as const;

export function schedulesListKey(query: ScheduleListQuery = {}) {
  return [...SCHEDULES_QUERY_KEY, "list", query] as const;
}

export function scheduleDetailKey(scheduleId: number) {
  return [...SCHEDULES_QUERY_KEY, "detail", scheduleId] as const;
}

export function scheduleSharesKey(scheduleId: number) {
  return [...SCHEDULES_QUERY_KEY, "shares", scheduleId] as const;
}

export function scheduleShareLinksKey(scheduleId: number) {
  return [...SCHEDULES_QUERY_KEY, "share-links", scheduleId] as const;
}

export function scheduleShareLinkPreviewKey(token: string) {
  return [...SCHEDULES_QUERY_KEY, "share-link-preview", token] as const;
}

export function sharedSchedulesKey(query: SharedSchedulesQuery = {}) {
  return [...SCHEDULES_QUERY_KEY, "shared", query] as const;
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

function removeScheduleFromListCaches(
  queryClient: QueryClient,
  scheduleId: number,
) {
  queryClient
    .getQueryCache()
    .findAll({ queryKey: SCHEDULES_QUERY_KEY })
    .forEach((query) => {
      const listQuery = scheduleListQueryFromKey(query.queryKey);
      if (!listQuery) return;

      queryClient.setQueryData<Schedule[]>(query.queryKey, (current) =>
        current?.filter((schedule) => schedule.schedule_id !== scheduleId),
      );
    });
}

function syncUpdatedScheduleToListCaches(
  queryClient: QueryClient,
  schedule: Schedule,
) {
  queryClient
    .getQueryCache()
    .findAll({ queryKey: SCHEDULES_QUERY_KEY })
    .forEach((query) => {
      const listQuery = scheduleListQueryFromKey(query.queryKey);
      if (!listQuery) return;

      queryClient.setQueryData<Schedule[]>(query.queryKey, (current) => {
        const schedules = current ?? [];
        const hasSchedule = schedules.some(
          (item) => item.schedule_id === schedule.schedule_id,
        );
        const matches = scheduleMatchesListQuery(schedule, listQuery);

        if (!hasSchedule && !matches) return current;
        if (!hasSchedule && matches) return upsertSchedules(schedules, [schedule]);
        if (!matches) {
          return schedules.filter(
            (item) => item.schedule_id !== schedule.schedule_id,
          );
        }

        return schedules.map((item) =>
          item.schedule_id === schedule.schedule_id
            ? { ...item, ...schedule }
            : item,
        );
      });
    });

  queryClient.setQueryData<Schedule>(
    scheduleDetailKey(schedule.schedule_id),
    (current) => (current ? { ...current, ...schedule } : schedule),
  );
}

function updateScheduleCompletionInCaches(
  queryClient: QueryClient,
  scheduleId: number,
  completed: boolean,
) {
  const completedAt = completed ? toOffsetISOString(new Date()) : null;

  queryClient
    .getQueryCache()
    .findAll({ queryKey: SCHEDULES_QUERY_KEY })
    .forEach((query) => {
      const listQuery = scheduleListQueryFromKey(query.queryKey);
      if (!listQuery) return;

      queryClient.setQueryData<Schedule[]>(query.queryKey, (current) => {
        if (!current?.some((schedule) => schedule.schedule_id === scheduleId)) {
          return current;
        }

        return current
          .map((schedule) =>
            schedule.schedule_id === scheduleId
              ? {
                  ...schedule,
                  is_completed: completed,
                  completed_at: completedAt,
                }
              : schedule,
          )
          .filter((schedule) => scheduleMatchesListQuery(schedule, listQuery));
      });
    });

  queryClient.setQueryData<Schedule>(scheduleDetailKey(scheduleId), (current) =>
    current
      ? {
          ...current,
          is_completed: completed,
          completed_at: completedAt,
        }
      : current,
  );
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

export function useSchedule(scheduleId: number | null, enabled = true) {
  return useQuery<Schedule>({
    queryKey: scheduleDetailKey(scheduleId ?? 0),
    enabled: enabled && scheduleId !== null,
    queryFn: async () => {
      const res = await getSchedule(scheduleId as number);
      if (!res.success) {
        throw new Error(res.message || "일정을 불러오지 못했습니다.");
      }
      return res.data.schedule;
    },
  });
}

export function useScheduleShareLinks(
  scheduleId: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: scheduleShareLinksKey(scheduleId ?? 0),
    enabled: enabled && scheduleId !== null,
    queryFn: async () => {
      const res = await listScheduleShareLinks(scheduleId as number);
      if (!res.success)
        throw new Error(res.message || "일정 공유 링크를 불러오지 못했습니다.");
      return res.data.share_links;
    },
  });
}

export function useScheduleShareLinkPreview(
  token: string | null,
  enabled = true,
) {
  return useQuery<ScheduleShareLinkPreview>({
    queryKey: scheduleShareLinkPreviewKey(token ?? ""),
    enabled: enabled && Boolean(token),
    queryFn: async () => {
      const res = await getScheduleShareLinkPreview(token as string);
      if (!res.success)
        throw new Error(res.message || "공유 링크를 불러오지 못했습니다.");
      return res.data;
    },
  });
}

export function useScheduleShares(scheduleId: number | null, enabled = true) {
  return useQuery({
    queryKey: scheduleSharesKey(scheduleId ?? 0),
    enabled: enabled && scheduleId !== null,
    queryFn: async () => {
      const res = await listScheduleShares(scheduleId as number);
      if (!res.success)
        throw new Error(res.message || "일정 공유 목록을 불러오지 못했습니다.");
      return res.data.shares;
    },
  });
}

export function useSharedSchedules(query: SharedSchedulesQuery = {}) {
  return useQuery({
    queryKey: sharedSchedulesKey(query),
    queryFn: async () => {
      const res = await listSharedSchedules(query);
      if (!res.success)
        throw new Error(res.message || "공유받은 일정을 불러오지 못했습니다.");
      return res.data.shared_schedules;
    },
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
  const queryClient = useQueryClient();
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
    onSuccess: (schedule) => {
      syncUpdatedScheduleToListCaches(queryClient, schedule);
      invalidate();
    },
    meta: {
      successMessage: "일정이 수정되었습니다.",
      errorMessage: "일정 수정에 실패했습니다.",
    },
  });
}

export function useSetScheduleCompletion() {
  const invalidate = useInvalidateSchedules();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      completed,
    }: {
      scheduleId: number;
      completed: boolean;
    }) => {
      const res = await updateSchedule(scheduleId, { is_completed: completed });
      if (!res.success) throw new Error(res.message || "수정에 실패했습니다.");
      return res.data.schedule;
    },
    onMutate: ({ scheduleId, completed }) => {
      updateScheduleCompletionInCaches(queryClient, scheduleId, completed);
    },
    onSuccess: (schedule) => {
      syncUpdatedScheduleToListCaches(queryClient, schedule);
      invalidate();
    },
    onError: () => invalidate(),
    meta: {
      successMessage: "일정 상태를 변경했습니다.",
      errorMessage: "일정 상태 변경에 실패했습니다.",
    },
  });
}

export function useDeleteSchedule() {
  const invalidate = useInvalidateSchedules();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId: number) => {
      const res = await deleteSchedule(scheduleId);
      if (!res.success) throw new Error(res.message || "삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: (_data, scheduleId) => {
      removeScheduleFromListCaches(queryClient, scheduleId);
      queryClient.removeQueries({ queryKey: scheduleDetailKey(scheduleId) });
      invalidate();
    },
    meta: {
      successMessage: "일정이 삭제되었습니다.",
      errorMessage: "일정 삭제에 실패했습니다.",
    },
  });
}

export function useCreateScheduleShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      payload,
    }: {
      scheduleId: number;
      payload: CreateScheduleShareLinkRequest;
    }) => {
      const res = await createScheduleShareLink(scheduleId, payload);
      if (!res.success)
        throw new Error(res.message || "일정 공유 링크 생성에 실패했습니다.");
      return res.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: scheduleShareLinksKey(vars.scheduleId),
      });
      void qc.invalidateQueries({ queryKey: scheduleDetailKey(vars.scheduleId) });
      void qc.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
    },
  });
}

export function useUpdateScheduleShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      scheduleShareLinkId,
      payload,
    }: {
      scheduleId: number;
      scheduleShareLinkId: number;
      payload: UpdateScheduleShareLinkRequest;
    }) => {
      const res = await updateScheduleShareLink(
        scheduleId,
        scheduleShareLinkId,
        payload,
      );
      if (!res.success)
        throw new Error(res.message || "일정 공유 링크 수정에 실패했습니다.");
      return res.data.share_link;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: scheduleShareLinksKey(vars.scheduleId),
      });
      void qc.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
    },
  });
}

export function useDeleteScheduleShareLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      scheduleShareLinkId,
    }: {
      scheduleId: number;
      scheduleShareLinkId: number;
    }) => {
      const res = await deleteScheduleShareLink(
        scheduleId,
        scheduleShareLinkId,
      );
      if (!res.success)
        throw new Error(res.message || "일정 공유 링크 삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({
        queryKey: scheduleShareLinksKey(vars.scheduleId),
      });
      void qc.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
    },
  });
}

export function useJoinScheduleShareLink() {
  const qc = useQueryClient();
  return useMutation<JoinScheduleShareLinkResponse, Error, string>({
    mutationFn: async (token: string) => {
      const res = await joinScheduleShareLink(token);
      if (!res.success)
        throw new Error(res.message || "공유 일정 참가에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SCHEDULES_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: TODAY_HOME_QUERY_KEY });
    },
  });
}

export function useCreateScheduleFriendShare() {
  const invalidate = useInvalidateSchedules();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      payload,
    }: {
      scheduleId: number;
      payload: CreateScheduleFriendShareRequest;
    }) => {
      const res = await createScheduleFriendShare(scheduleId, payload);
      if (!res.success)
        throw new Error(res.message || "친구 일정 공유에 실패했습니다.");
      return res.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: scheduleSharesKey(vars.scheduleId) });
      invalidate();
    },
    meta: {
      successMessage: "친구에게 일정을 공유했습니다.",
      errorMessage: "친구 일정 공유에 실패했습니다.",
    },
  });
}

export function useUpdateScheduleShare() {
  const invalidate = useInvalidateSchedules();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      scheduleShareId,
      payload,
    }: {
      scheduleId: number;
      scheduleShareId: number;
      payload: UpdateScheduleShareRequest;
    }) => {
      const res = await updateScheduleShare(scheduleId, scheduleShareId, payload);
      if (!res.success)
        throw new Error(res.message || "일정 공유 수정에 실패했습니다.");
      return res.data.share;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: scheduleSharesKey(vars.scheduleId) });
      invalidate();
    },
  });
}

export function useDeleteScheduleShare() {
  const invalidate = useInvalidateSchedules();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      scheduleId,
      scheduleShareId,
    }: {
      scheduleId: number;
      scheduleShareId: number;
    }) => {
      const res = await deleteScheduleShare(scheduleId, scheduleShareId);
      if (!res.success)
        throw new Error(res.message || "일정 공유 해제에 실패했습니다.");
      return res.data;
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: scheduleSharesKey(vars.scheduleId) });
      invalidate();
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
