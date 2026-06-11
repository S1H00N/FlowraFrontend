import apiClient from "./client";
import { compactParams, toCommaParam, toNullableString } from "./normalize";
import type {
  ApiListData,
  ApiResponse,
  CreateScheduleFriendShareRequest,
  CreateScheduleFriendShareResponse,
  CreateRecurringScheduleRequest,
  CreateRecurringScheduleResponse,
  CreateScheduleRequest,
  CreateScheduleShareLinkRequest,
  CreateScheduleShareLinkResponse,
  JoinScheduleShareLinkResponse,
  Schedule,
  ScheduleShare,
  ScheduleShareLink,
  ScheduleShareLinkPreview,
  ScheduleListQuery,
  SharedSchedule,
  SharedSchedulesQuery,
  UpdateScheduleShareLinkRequest,
  UpdateScheduleShareRequest,
  UpdateScheduleRequest,
} from "@/types";

type ScheduleListData = Partial<ApiListData<Schedule>> & {
  schedules?: Schedule[];
};
type ScheduleData = Schedule | { schedule: Schedule };
type ScheduleSharesData = Partial<ApiListData<ScheduleShare>> & {
  shares?: ScheduleShare[];
};
type ScheduleShareLinksData = Partial<ApiListData<ScheduleShareLink>> & {
  share_links?: ScheduleShareLink[];
};
type SharedSchedulesData = Partial<ApiListData<SharedSchedule>> & {
  shared_schedules?: SharedSchedule[];
};
export interface DeleteSchedulesBulkData {
  deleted_count: number;
  failed_ids: number[];
}

function unwrapSchedule(data: ScheduleData): Schedule {
  return "schedule" in data ? data.schedule : data;
}

function normalizeSchedulePayload<
  T extends
    | CreateScheduleRequest
    | UpdateScheduleRequest
    | CreateRecurringScheduleRequest,
>(payload: T) {
  return compactParams({
    ...payload,
    visibility:
      "visibility" in payload && payload.visibility === "private"
        ? payload.visibility
        : undefined,
    category_id:
      "category_id" in payload
        ? toNullableString(payload.category_id)
        : undefined,
  });
}

function normalizeScheduleQuery(query: ScheduleListQuery) {
  return compactParams({
    start_from: query.start_from,
    start_to: query.start_to,
    category_id: toCommaParam(query.category_id),
    schedule_type: toCommaParam(query.schedule_type),
    priority: toCommaParam(query.priority),
    is_completed:
      query.is_completed === undefined ? undefined : String(query.is_completed),
    q: query.q,
    location: query.location,
  });
}

function normalizeSharedSchedulesQuery(query: SharedSchedulesQuery = {}) {
  return compactParams({
    start_from: query.start_from,
    start_to: query.start_to,
  });
}

export async function listSchedules(query: ScheduleListQuery = {}) {
  const res = await apiClient.get<ApiResponse<ScheduleListData>>("/schedules", {
    params: normalizeScheduleQuery(query),
  });
  return {
    ...res.data,
    data: {
      schedules: res.data.data.items ?? res.data.data.schedules ?? [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function getSchedule(scheduleId: number) {
  const res = await apiClient.get<ApiResponse<ScheduleData>>(
    `/schedules/${scheduleId}`,
  );
  return { ...res.data, data: { schedule: unwrapSchedule(res.data.data) } };
}

export async function createSchedule(payload: CreateScheduleRequest) {
  const res = await apiClient.post<ApiResponse<ScheduleData>>(
    "/schedules",
    normalizeSchedulePayload(payload),
  );
  return { ...res.data, data: { schedule: unwrapSchedule(res.data.data) } };
}

export async function createRecurringSchedule(
  payload: CreateRecurringScheduleRequest,
) {
  const res = await apiClient.post<
    ApiResponse<CreateRecurringScheduleResponse>
  >("/schedules/recurring", normalizeSchedulePayload(payload));
  return res.data;
}

export async function updateSchedule(
  scheduleId: number,
  payload: UpdateScheduleRequest,
) {
  const res = await apiClient.patch<ApiResponse<ScheduleData>>(
    `/schedules/${scheduleId}`,
    normalizeSchedulePayload(payload),
  );
  return { ...res.data, data: { schedule: unwrapSchedule(res.data.data) } };
}

export async function deleteSchedule(scheduleId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/schedules/${scheduleId}`,
  );
  return res.data;
}

export async function createScheduleShareLink(
  scheduleId: number,
  payload: CreateScheduleShareLinkRequest,
) {
  const res = await apiClient.post<
    ApiResponse<CreateScheduleShareLinkResponse>
  >(
    `/schedules/${scheduleId}/share-links`,
    compactParams(payload as unknown as Record<string, unknown>),
  );
  return res.data;
}

export async function listScheduleShareLinks(scheduleId: number) {
  const res = await apiClient.get<ApiResponse<ScheduleShareLinksData>>(
    `/schedules/${scheduleId}/share-links`,
  );
  return {
    ...res.data,
    data: {
      share_links: res.data.data.items ?? res.data.data.share_links ?? [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function updateScheduleShareLink(
  scheduleId: number,
  scheduleShareLinkId: number,
  payload: UpdateScheduleShareLinkRequest,
) {
  const res = await apiClient.patch<
    ApiResponse<{ share_link: ScheduleShareLink }>
  >(
    `/schedules/${scheduleId}/share-links/${scheduleShareLinkId}`,
    compactParams(payload as Record<string, unknown>),
  );
  return res.data;
}

export async function deleteScheduleShareLink(
  scheduleId: number,
  scheduleShareLinkId: number,
) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/schedules/${scheduleId}/share-links/${scheduleShareLinkId}`,
  );
  return res.data;
}

export async function getScheduleShareLinkPreview(token: string) {
  const res = await apiClient.get<ApiResponse<ScheduleShareLinkPreview>>(
    `/schedule-share-links/${encodeURIComponent(token)}`,
  );
  return res.data;
}

export async function joinScheduleShareLink(token: string) {
  const res = await apiClient.post<ApiResponse<JoinScheduleShareLinkResponse>>(
    `/schedule-share-links/${encodeURIComponent(token)}/join`,
  );
  return res.data;
}

export async function createScheduleFriendShare(
  scheduleId: number,
  payload: CreateScheduleFriendShareRequest,
) {
  const res = await apiClient.post<
    ApiResponse<CreateScheduleFriendShareResponse>
  >(
    `/schedules/${scheduleId}/friend-shares`,
    compactParams({
      ...payload,
      friend_preset_id:
        payload.friend_preset_id === undefined
          ? undefined
          : String(payload.friend_preset_id),
    }),
  );
  return res.data;
}

export async function listScheduleShares(scheduleId: number) {
  const res = await apiClient.get<ApiResponse<ScheduleSharesData>>(
    `/schedules/${scheduleId}/shares`,
  );
  return {
    ...res.data,
    data: {
      shares: res.data.data.items ?? res.data.data.shares ?? [],
      pagination: res.data.data.pagination,
    },
  };
}

export async function updateScheduleShare(
  scheduleId: number,
  scheduleShareId: number,
  payload: UpdateScheduleShareRequest,
) {
  const res = await apiClient.patch<ApiResponse<{ share: ScheduleShare }>>(
    `/schedules/${scheduleId}/shares/${scheduleShareId}`,
    compactParams(payload as Record<string, unknown>),
  );
  return res.data;
}

export async function deleteScheduleShare(
  scheduleId: number,
  scheduleShareId: number,
) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/schedules/${scheduleId}/shares/${scheduleShareId}`,
  );
  return res.data;
}

export async function listSharedSchedules(query: SharedSchedulesQuery = {}) {
  const res = await apiClient.get<ApiResponse<SharedSchedulesData>>(
    "/shared-schedules",
    {
      params: normalizeSharedSchedulesQuery(query),
    },
  );
  return {
    ...res.data,
    data: {
      shared_schedules:
        res.data.data.items ?? res.data.data.shared_schedules ?? [],
      pagination: res.data.data.pagination,
    },
  };
}

function shouldFallbackBulkDelete(err: unknown) {
  const response = (
    err as {
      response?: {
        status?: number;
        data?: {
          error?: {
            details?: {
              issues?: Array<{ path?: string }>;
            };
          };
        };
      };
    }
  ).response;
  return (
    response?.status === 400 &&
    response.data?.error?.details?.issues?.some(
      (issue) => issue.path === "schedule_id",
    )
  );
}

export async function deleteSchedulesBulk(scheduleIds: Array<number | string>) {
  try {
    const res = await apiClient.delete<ApiResponse<DeleteSchedulesBulkData>>(
      "/schedules/bulk",
      {
        data: {
          schedule_ids: scheduleIds.map((scheduleId) => String(scheduleId)),
        },
      },
    );
    return res.data;
  } catch (err) {
    if (!shouldFallbackBulkDelete(err)) throw err;

    const failedIds: number[] = [];
    let deletedCount = 0;

    for (const scheduleId of scheduleIds) {
      const numericId = Number(scheduleId);
      try {
        const res = await deleteSchedule(numericId);
        if (res.success) deletedCount += 1;
        else failedIds.push(numericId);
      } catch {
        failedIds.push(numericId);
      }
    }

    return {
      success: true,
      message: "일정이 삭제되었습니다.",
      data: {
        deleted_count: deletedCount,
        failed_ids: failedIds,
      },
    };
  }
}
