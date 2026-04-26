import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AppShell from "@/components/AppShell";
import TaskForm from "@/components/TaskForm";
import TaskItem from "@/components/TaskItem";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import { FullSpinner } from "@/components/ui/Spinner";
import { useCategories } from "@/hooks/useCategories";
import { useSchedules } from "@/hooks/useSchedules";
import { useTasks } from "@/hooks/useTasks";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type Schedule,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/types";
import {
  getClassificationLabel,
  getClassificationOptions,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { toOffsetISOString } from "@/utils/dateUtils";

type ScheduleFilter = "all" | "linked" | "unlinked" | number;

interface TaskFilters {
  statuses: TaskStatus[];
  priorities: TaskPriority[];
  schedule: ScheduleFilter;
  categories: number[];
  q: string;
  dueFrom: string;
  dueTo: string;
}

const defaultFilters: TaskFilters = {
  statuses: [],
  priorities: [],
  schedule: "all",
  categories: [],
  q: "",
  dueFrom: "",
  dueTo: "",
};

function dateToRangeStart(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : toOffsetISOString(date);
}

function dateToRangeEnd(value: string) {
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? undefined : toOffsetISOString(date);
}

function parseNumberFilters(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function parseTaskStatusFilters(value: string | null): TaskStatus[] {
  if (!value) return [];
  const allowed = new Set<string>(TASK_STATUSES);
  return value
    .split(",")
    .filter((item): item is TaskStatus => allowed.has(item));
}

function parseTaskPriorityFilters(value: string | null): TaskPriority[] {
  if (!value) return [];
  const allowed = new Set<string>(TASK_PRIORITIES);
  return value
    .split(",")
    .filter((item): item is TaskPriority => allowed.has(item));
}

function parseScheduleFilter(value: string | null): ScheduleFilter {
  if (!value) return "all";
  if (value === "linked" || value === "unlinked") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "all";
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

function compareDue(a: Task, b: Task) {
  const aTime = a.due_datetime ? new Date(a.due_datetime).getTime() : Infinity;
  const bTime = b.due_datetime ? new Date(b.due_datetime).getTime() : Infinity;
  return aTime - bTime;
}

function groupTasks(items: Task[]) {
  const todayStart = startOfToday().getTime();
  const todayEnd = endOfToday().getTime();
  const groups = {
    overdue: [] as Task[],
    today: [] as Task[],
    upcoming: [] as Task[],
    done: [] as Task[],
  };

  for (const task of items) {
    if (task.status === "done") {
      groups.done.push(task);
      continue;
    }

    const dueTime = task.due_datetime
      ? new Date(task.due_datetime).getTime()
      : Infinity;

    if (dueTime < todayStart) {
      groups.overdue.push(task);
    } else if (dueTime >= todayStart && dueTime < todayEnd) {
      groups.today.push(task);
    } else {
      groups.upcoming.push(task);
    }
  }

  groups.overdue.sort(compareDue);
  groups.today.sort(compareDue);
  groups.upcoming.sort(compareDue);
  groups.done.sort((a, b) => {
    const aTime = a.completed_at
      ? new Date(a.completed_at).getTime()
      : new Date(a.created_at).getTime();
    const bTime = b.completed_at
      ? new Date(b.completed_at).getTime()
      : new Date(b.created_at).getTime();
    return bTime - aTime;
  });

  return groups;
}

function TaskGroup({
  title,
  description,
  items,
  deepLinkedTaskId,
  empty,
  schedulesById,
}: {
  title: string;
  description: string;
  items: Task[];
  deepLinkedTaskId: number;
  empty: string;
  schedulesById: Map<number, Schedule>;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {items.length}건
        </span>
      </div>
      <div className="p-3">
        {items.length > 0 ? (
          <ul className="space-y-2">
            {items.map((task) => (
              <TaskItem
                key={task.task_id}
                task={task}
                highlighted={task.task_id === deepLinkedTaskId}
                schedule={
                  task.schedule_id ? schedulesById.get(task.schedule_id) : undefined
                }
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {empty}
          </p>
        )}
      </div>
    </section>
  );
}

export default function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const classificationSettings = useClassificationSettings();
  const [filters, setFilters] = useState<TaskFilters>(() => {
    return {
      statuses: parseTaskStatusFilters(searchParams.get("status")),
      priorities: parseTaskPriorityFilters(searchParams.get("priority")),
      schedule: parseScheduleFilter(searchParams.get("schedule")),
      categories: parseNumberFilters(searchParams.get("category")),
      q: searchParams.get("q") ?? "",
      dueFrom: searchParams.get("due_from") ?? "",
      dueTo: searchParams.get("due_to") ?? "",
    };
  });
  const deepLinkedTaskId = Number(searchParams.get("task_id"));
  const updateFilters = useCallback(
    (patch: Partial<TaskFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...patch };
        const params = new URLSearchParams(searchParams);
        params.delete("task_id");

        if (next.statuses.length === 0) params.delete("status");
        else params.set("status", next.statuses.join(","));

        if (next.priorities.length === 0) params.delete("priority");
        else params.set("priority", next.priorities.join(","));

        if (next.schedule === "all") params.delete("schedule");
        else params.set("schedule", String(next.schedule));

        if (next.categories.length === 0) params.delete("category");
        else params.set("category", next.categories.join(","));

        if (next.q.trim()) params.set("q", next.q.trim());
        else params.delete("q");

        if (next.dueFrom) params.set("due_from", next.dueFrom);
        else params.delete("due_from");

        if (next.dueTo) params.set("due_to", next.dueTo);
        else params.delete("due_to");

        setSearchParams(params, { replace: true });
        return next;
      });
    },
    [searchParams, setSearchParams],
  );
  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const query = {
    ...(filters.statuses.length > 0 ? { status: filters.statuses } : {}),
    ...(filters.priorities.length > 0
      ? { priority: filters.priorities }
      : {}),
    ...(filters.categories.length > 0
      ? { category_id: filters.categories }
      : {}),
    ...(typeof filters.schedule === "number"
      ? { schedule_id: filters.schedule }
      : {}),
    ...(filters.schedule === "linked" || filters.schedule === "unlinked"
      ? { schedule_filter: filters.schedule }
      : {}),
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.dueFrom ? { due_from: dateToRangeStart(filters.dueFrom) } : {}),
    ...(filters.dueTo ? { due_to: dateToRangeEnd(filters.dueTo) } : {}),
  };
  const { data, isLoading, isError, error, isFetching, refetch } =
    useTasks(query);
  const schedulesQuery = useSchedules();
  const categoriesQuery = useCategories("task");

  const schedules = schedulesQuery.data ?? [];
  const schedulesById = useMemo(
    () =>
      new Map(
        schedules.map((schedule) => [schedule.schedule_id, schedule] as const),
      ),
    [schedules],
  );
  const statusFilterOptions = getClassificationOptions(
    classificationSettings,
    "taskStatuses",
    { enabledOnly: true, defaultOnly: true },
  );
  const priorityFilterOptions = getClassificationOptions(
    classificationSettings,
    "taskPriorities",
    { enabledOnly: true, defaultOnly: true },
  );
  const scheduleOptions = useMemo(() => {
    const linkedIds = new Set((data ?? []).flatMap((task) =>
      task.schedule_id ? [task.schedule_id] : [],
    ));
    return schedules
      .filter((schedule) => linkedIds.has(schedule.schedule_id))
      .sort(
        (a, b) =>
          new Date(a.start_datetime).getTime() -
          new Date(b.start_datetime).getTime(),
      );
  }, [data, schedules]);
  const items = useMemo(() => {
    const source = data ?? [];
    const keyword = filters.q.trim().toLowerCase();
    return source.filter((task) => {
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(task.status)
      ) {
        return false;
      }
      if (
        filters.priorities.length > 0 &&
        !filters.priorities.includes(task.priority)
      ) {
        return false;
      }
      if (
        filters.categories.length > 0 &&
        (!task.category_id || !filters.categories.includes(task.category_id))
      ) {
        return false;
      }
      if (filters.schedule === "linked" && !task.schedule_id) return false;
      if (filters.schedule === "unlinked" && task.schedule_id) return false;
      if (keyword) {
        const haystack = `${task.title} ${task.description ?? ""} ${task.location ?? ""}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });
  }, [
    data,
    filters.categories,
    filters.priorities,
    filters.q,
    filters.schedule,
    filters.statuses,
  ]);
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.statuses.length > 0) count += 1;
    if (filters.priorities.length > 0) count += 1;
    if (filters.schedule !== "all") count += 1;
    if (filters.categories.length > 0) count += 1;
    if (filters.q.trim()) count += 1;
    if (filters.dueFrom) count += 1;
    if (filters.dueTo) count += 1;
    return count;
  }, [filters]);
  const taskFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; reset: Partial<TaskFilters> }> = [];
    filters.statuses.forEach((status) => {
      chips.push({
        key: `status-${status}`,
        label: getClassificationLabel(
          classificationSettings,
          "taskStatuses",
          status,
        ),
        reset: {
          statuses: filters.statuses.filter((item) => item !== status),
        },
      });
    });
    filters.priorities.forEach((priority) => {
      chips.push({
        key: `priority-${priority}`,
        label: getClassificationLabel(
          classificationSettings,
          "taskPriorities",
          priority,
        ),
        reset: {
          priorities: filters.priorities.filter((item) => item !== priority),
        },
      });
    });
    filters.categories.forEach((categoryId) => {
      const category = categoriesQuery.data?.find(
        (item) => item.category_id === categoryId,
      );
      chips.push({
        key: `category-${categoryId}`,
        label: category?.name ?? `카테고리 ${categoryId}`,
        reset: {
          categories: filters.categories.filter((item) => item !== categoryId),
        },
      });
    });
    if (filters.schedule === "linked") {
      chips.push({
        key: "schedule",
        label: "일정 연결",
        reset: { schedule: "all" },
      });
    }
    if (filters.schedule === "unlinked") {
      chips.push({
        key: "schedule",
        label: "미연결",
        reset: { schedule: "all" },
      });
    }
    if (typeof filters.schedule === "number") {
      const schedule = schedulesById.get(filters.schedule);
      chips.push({
        key: "schedule",
        label: schedule?.title ?? `일정 ${filters.schedule}`,
        reset: { schedule: "all" },
      });
    }
    if (filters.q.trim()) {
      chips.push({
        key: "q",
        label: `검색: ${filters.q.trim()}`,
        reset: { q: "" },
      });
    }
    if (filters.dueFrom) {
      chips.push({
        key: "dueFrom",
        label: `${filters.dueFrom} 이후`,
        reset: { dueFrom: "" },
      });
    }
    if (filters.dueTo) {
      chips.push({
        key: "dueTo",
        label: `${filters.dueTo} 이전`,
        reset: { dueTo: "" },
      });
    }
    return chips;
  }, [categoriesQuery.data, classificationSettings, filters, schedulesById]);
  const grouped = useMemo(() => groupTasks(items), [items]);
  const selectedSchedule =
    typeof filters.schedule === "number"
      ? schedulesById.get(filters.schedule)
      : undefined;

  useEffect(() => {
    if (!deepLinkedTaskId || Number.isNaN(deepLinkedTaskId)) return;
    const el = document.getElementById(`task-${deepLinkedTaskId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [deepLinkedTaskId, items.length]);

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Task board
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                할 일
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                빠르게 추가하고, 마감 기준으로 오늘 실행할 일을 정리하세요.
              </p>
            </div>
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              홈으로
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-950">빠른 추가</h2>
            <p className="mt-1 text-xs text-slate-500">
              입력하면 기본 상태는 할 일(todo)로 저장됩니다.
            </p>
          </div>
          <TaskForm
            defaultScheduleId={
              typeof filters.schedule === "number" ? filters.schedule : undefined
            }
          />
          {selectedSchedule && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
              빠른 추가 항목은 일정{" "}
              <Link
                to={`/schedules?${new URLSearchParams({
                  schedule_id: String(selectedSchedule.schedule_id),
                  date: selectedSchedule.start_datetime.slice(0, 10),
                })}`}
                className="font-semibold underline"
              >
                {selectedSchedule.title}
              </Link>
              에 연결됩니다.
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                필터
                {activeFilterCount > 0 && (
                  <span className="ml-2 rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                    {activeFilterCount}
                  </span>
                )}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                선택한 조건을 모두 만족하는 할 일만 보여줍니다.
              </p>
            </div>
            <button
              type="button"
              onClick={resetFilters}
              disabled={activeFilterCount === 0}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              초기화
            </button>
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr]">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">검색</span>
              <input
                type="search"
                value={filters.q}
                onChange={(event) => updateFilters({ q: event.target.value })}
                placeholder="제목, 설명, 장소"
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <div>
              <span className="text-xs font-medium text-slate-600">상태</span>
              <div className="mt-1 flex min-h-10 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => updateFilters({ statuses: [] })}
                  className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                    filters.statuses.length === 0
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  전체
                </button>
                {statusFilterOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      const selected = filters.statuses.includes(option.value);
                      updateFilters({
                        statuses: selected
                          ? filters.statuses.filter(
                              (item) => item !== option.value,
                            )
                          : [...filters.statuses, option.value],
                      });
                    }}
                    className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                      filters.statuses.includes(option.value)
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-xs font-medium text-slate-600">
                우선순위
              </span>
              <div className="mt-1 flex min-h-10 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => updateFilters({ priorities: [] })}
                  className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                    filters.priorities.length === 0
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  전체
                </button>
                {priorityFilterOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => {
                      const selected = filters.priorities.includes(option.value);
                      updateFilters({
                        priorities: selected
                          ? filters.priorities.filter(
                              (item) => item !== option.value,
                            )
                          : [...filters.priorities, option.value],
                      });
                    }}
                    className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                      filters.priorities.includes(option.value)
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_1fr_1fr_1fr]">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                마감 시작
              </span>
              <input
                type="date"
                value={filters.dueFrom}
                onChange={(event) =>
                  updateFilters({ dueFrom: event.target.value })
                }
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                마감 종료
              </span>
              <input
                type="date"
                value={filters.dueTo}
                onChange={(event) =>
                  updateFilters({ dueTo: event.target.value })
                }
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <div>
              <span className="text-xs font-medium text-slate-600">
                카테고리
              </span>
              <div className="mt-1 flex min-h-10 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => updateFilters({ categories: [] })}
                  className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                    filters.categories.length === 0
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  전체
                </button>
                {(categoriesQuery.data ?? []).map((category) => (
                  <button
                    key={category.category_id}
                    type="button"
                    onClick={() => {
                      const selected = filters.categories.includes(
                        category.category_id,
                      );
                      updateFilters({
                        categories: selected
                          ? filters.categories.filter(
                              (item) => item !== category.category_id,
                            )
                          : [...filters.categories, category.category_id],
                      });
                    }}
                    className={`h-8 rounded-md px-2 text-xs font-medium transition ${
                      filters.categories.includes(category.category_id)
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">
                일정
              </span>
              <select
                value={
                  typeof filters.schedule === "number"
                    ? String(filters.schedule)
                    : filters.schedule
                }
                onChange={(event) => {
                  const value = event.target.value;
                  updateFilters({
                    schedule:
                      value === "linked" || value === "unlinked"
                        ? value
                        : value
                          ? Number(value)
                          : "all",
                  });
                }}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                aria-label="일정별 필터"
              >
                <option value="all">모든 연결</option>
                <option value="linked">일정 연결</option>
                <option value="unlinked">미연결</option>
                {scheduleOptions.map((schedule) => (
                  <option key={schedule.schedule_id} value={schedule.schedule_id}>
                    {schedule.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {taskFilterChips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {taskFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => updateFilters(chip.reset)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  aria-label={`${chip.label} 필터 제거`}
                >
                  <span>{chip.label}</span>
                  <span aria-hidden className="text-emerald-500">
                    ×
                  </span>
                </button>
              ))}
            </div>
          )}

          {isFetching && (
            <p className="mt-3 text-xs text-slate-500">새로고침 중...</p>
          )}
        </section>

        <div>
          {isLoading ? (
            <FullSpinner message="할 일을 불러오는 중..." />
          ) : isError ? (
            <ErrorState
              title="할 일을 불러오지 못했습니다"
              message={(error as Error).message}
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title={
                activeFilterCount === 0
                  ? "할 일이 없습니다"
                  : "조건에 맞는 할 일이 없습니다"
              }
              description="위 입력창에서 새로운 할 일을 추가해 보세요."
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <TaskGroup
                title="지연"
                description="오늘 이전에 마감된 미완료 항목"
                items={grouped.overdue}
                deepLinkedTaskId={deepLinkedTaskId}
                empty="지연된 할 일이 없습니다."
                schedulesById={schedulesById}
              />
              <TaskGroup
                title="오늘"
                description="오늘 안에 처리할 항목"
                items={grouped.today}
                deepLinkedTaskId={deepLinkedTaskId}
                empty="오늘 마감인 할 일이 없습니다."
                schedulesById={schedulesById}
              />
              <TaskGroup
                title="예정"
                description="이후 마감 또는 마감 미지정 항목"
                items={grouped.upcoming}
                deepLinkedTaskId={deepLinkedTaskId}
                empty="예정된 할 일이 없습니다."
                schedulesById={schedulesById}
              />
              <TaskGroup
                title="완료"
                description="이미 완료 처리한 항목"
                items={grouped.done}
                deepLinkedTaskId={deepLinkedTaskId}
                empty="완료된 할 일이 없습니다."
                schedulesById={schedulesById}
              />
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="text-right text-xs text-slate-500">
            총 {items.length}건
          </div>
        )}
      </div>
    </AppShell>
  );
}
