import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { listSchedules } from "@/api/schedules";
import { useCategories } from "@/hooks/useCategories";
import { SCHEDULES_QUERY_KEY, useSchedule } from "@/hooks/useSchedules";
import {
  getClassificationLabel,
  useClassificationSettings,
} from "@/lib/classificationSettings";
import { getErrorMessage } from "@/lib/error";
import {
  formatTaskMoveScheduleDate,
  getTaskMoveScheduleLabel,
} from "@/lib/taskMoveSchedule";
import { toOffsetISOString } from "@/utils/dateUtils";
import type { Schedule, Task } from "@/types";
import "./TaskMovePicker.css";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function TaskMovePicker({
  task,
  currentSchedule,
  initialMonth,
  pending,
  error,
  onClose,
  onMove,
}: {
  task: Task;
  currentSchedule?: Schedule;
  initialMonth: Date;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onMove: (schedule: Schedule) => void;
}) {
  const [month, setMonth] = useState(() => monthKey(initialMonth));
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    bottom: 0,
  }));
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const categoriesQuery = useCategories("schedule");
  const classificationSettings = useClassificationSettings();
  const currentQuery = useSchedule(
    task.schedule_id ?? null,
    task.schedule_id != null && !currentSchedule,
  );
  const current = currentSchedule ?? currentQuery.data;
  useEffect(() => {
    const visualViewport = window.visualViewport;
    const update = () =>
      setViewport({
        height: visualViewport?.height ?? window.innerHeight,
        bottom: Math.max(
          0,
          window.innerHeight -
            (visualViewport
              ? visualViewport.height + visualViewport.offsetTop
              : window.innerHeight),
        ),
      });
    visualViewport?.addEventListener("resize", update);
    visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    update();
    return () => {
      visualViewport?.removeEventListener("resize", update);
      visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const query = useMemo(() => {
    const start = new Date(`${month}-01T00:00:00`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);
    end.setMilliseconds(-1);
    return {
      start_from: toOffsetISOString(start),
      start_to: toOffsetISOString(end),
    };
  }, [month]);
  const schedulesQuery = useQuery<Schedule[]>({
    queryKey: [...SCHEDULES_QUERY_KEY, "task-move", query],
    queryFn: async () => {
      const result = await listSchedules(query);
      if (!result.success)
        throw new Error(result.message || "일정을 불러오지 못했습니다.");
      return result.data.schedules;
    },
    retry: false,
    refetchOnWindowFocus: false,
  });
  const candidates = useMemo(
    () =>
      (schedulesQuery.data ?? [])
        .filter(
          (schedule) =>
            !schedule.is_company_schedule &&
            !schedule.is_shared &&
            schedule.schedule_id !== task.schedule_id,
        )
        .sort(
          (a, b) =>
            new Date(a.start_datetime).getTime() -
              new Date(b.start_datetime).getTime() ||
            a.schedule_id - b.schedule_id,
        ),
    [schedulesQuery.data, task.schedule_id],
  );
  const duplicateKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const schedule of candidates) {
      const key = `${schedule.title.trim().toLocaleLowerCase()}|${formatTaskMoveScheduleDate(schedule)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [candidates]);
  const keyword = search.trim().toLocaleLowerCase();
  const visible = candidates.filter((schedule) =>
    `${schedule.title} ${schedule.description ?? ""}`
      .toLocaleLowerCase()
      .includes(keyword),
  );
  const selected = visible.find(
    (schedule) => schedule.schedule_id === selectedId,
  );
  const loading = schedulesQuery.isFetching;
  const canSubmit =
    !!selected && !pending && !loading && !schedulesQuery.isError;

  const changeMonth = (value: string) => {
    if (
      pending ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
      Number(value.slice(0, 4)) === 0
    )
      return;
    setSelectedId(null);
    setMonth(value);
  };
  const stepMonth = (amount: number) => {
    const next = new Date(`${month}-01T00:00:00`);
    next.setMonth(next.getMonth() + amount);
    changeMonth(monthKey(next));
  };
  const onCandidateKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-schedule-id]",
      ) ?? [],
    );
    const currentIndex = buttons.indexOf(event.currentTarget);
    const index =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : Math.max(
              0,
              Math.min(
                buttons.length - 1,
                currentIndex + (event.key === "ArrowDown" ? 1 : -1),
              ),
            );
    buttons[index]?.focus();
  };

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="task-move-picker-overlay" />
        <DialogPrimitive.Content
          ref={contentRef}
          tabIndex={-1}
          className="task-move-picker"
          data-compact={viewport.height < 540}
          style={
            {
              "--task-move-max-height": `${viewport.height - (window.innerWidth <= 640 ? 24 : 48)}px`,
              "--task-move-keyboard-bottom": `${viewport.bottom}px`,
            } as CSSProperties
          }
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (window.matchMedia("(pointer: coarse)").matches)
              contentRef.current?.focus();
            else searchRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <header className="task-move-picker-header">
            <DialogPrimitive.Title className="task-move-picker-title">
              다른 일정으로 이동
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="task-move-picker-description">
              <span title={task.title}>{task.title}</span>의 소속 일정을
              선택하세요.
            </DialogPrimitive.Description>
            <button
              type="button"
              className="task-move-picker-close"
              aria-label="이동 선택창 닫기"
              onClick={onClose}
              disabled={pending}
            >
              <X aria-hidden="true" />
            </button>
            <div className="task-move-picker-current">
              <span>현재 위치</span>
              <strong>
                {task.schedule_id == null
                  ? "독립 할 일"
                  : current?.title ||
                    (currentQuery.isLoading
                      ? "일정 불러오는 중…"
                      : `일정 #${task.schedule_id}`)}
              </strong>
              {current && <small>{formatTaskMoveScheduleDate(current)}</small>}
            </div>
          </header>
          <div className="task-move-picker-filters">
            <label className="task-move-picker-search">
              <Search aria-hidden="true" />
              <input
                ref={searchRef}
                type="search"
                aria-label="이동할 일정 검색"
                placeholder="일정 이름 또는 설명 검색"
                value={search}
                disabled={pending}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelectedId(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && !loading) {
                    event.preventDefault();
                    listRef.current
                      ?.querySelector<HTMLButtonElement>(
                        "button[data-schedule-id]",
                      )
                      ?.focus();
                  }
                }}
              />
            </label>
            <div className="task-move-picker-period">
              <label>
                <CalendarDays aria-hidden="true" />
                <span>기간</span>
                <input
                  type="month"
                  aria-label="이동할 일정 기간"
                  value={month}
                  disabled={pending}
                  onChange={(event) => changeMonth(event.target.value)}
                />
              </label>
              <button
                type="button"
                aria-label="이동 일정 이전 달"
                disabled={pending}
                onClick={() => stepMonth(-1)}
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="이동 일정 다음 달"
                disabled={pending}
                onClick={() => stepMonth(1)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <p className="task-move-picker-scope">
              선택한 달의 개인 일정 · 제목과 설명으로 검색
            </p>
          </div>
          <div
            className="task-move-picker-list"
            ref={listRef}
            aria-label="이동할 일정 목록"
            aria-busy={loading}
          >
            {loading ? (
              <p className="task-move-picker-state" role="status">
                일정을 불러오는 중…
              </p>
            ) : schedulesQuery.isError ? (
              <div className="task-move-picker-state" role="alert">
                <p>
                  {getErrorMessage(
                    schedulesQuery.error,
                    "일정을 불러오지 못했습니다.",
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => void schedulesQuery.refetch()}
                >
                  다시 불러오기
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="task-move-picker-state" role="status">
                <p>
                  {keyword
                    ? "검색 결과에 맞는 일정이 없습니다."
                    : "이 달에 이동할 수 있는 일정이 없습니다."}
                </p>
                <small>
                  {keyword
                    ? "검색어를 바꾸거나 다른 달을 선택하세요."
                    : "다른 달을 선택해 일정을 찾아보세요."}
                </small>
              </div>
            ) : (
              <>
                <p className="task-move-picker-count" role="status">
                  이동 가능한 일정 {visible.length}개
                </p>
                {visible.map((schedule) => {
                  const category = categoriesQuery.data?.find(
                    (item) => item.category_id === schedule.category_id,
                  );
                  const categoryLabel =
                    category?.name ??
                    getClassificationLabel(
                      classificationSettings,
                      "scheduleTypes",
                      schedule.schedule_type,
                    );
                  const duplicate =
                    (duplicateKeys.get(
                      `${schedule.title.trim().toLocaleLowerCase()}|${formatTaskMoveScheduleDate(schedule)}`,
                    ) ?? 0) > 1;
                  return (
                    <button
                      key={schedule.schedule_id}
                      type="button"
                      className="task-move-picker-option"
                      data-schedule-id={schedule.schedule_id}
                      aria-pressed={selectedId === schedule.schedule_id}
                      disabled={pending}
                      onClick={() => setSelectedId(schedule.schedule_id)}
                      onKeyDown={onCandidateKeyDown}
                    >
                      <span
                        className="task-move-picker-indicator"
                        aria-hidden="true"
                      >
                        {selectedId === schedule.schedule_id && <Check />}
                      </span>
                      <span className="task-move-picker-option-body">
                        <span className="task-move-picker-option-top">
                          <strong title={schedule.title}>
                            {schedule.title || "제목 없음"}
                          </strong>
                          <span
                            className="task-move-picker-category"
                            title={categoryLabel}
                          >
                            {category?.color && (
                              <i
                                aria-hidden="true"
                                style={{ backgroundColor: category.color }}
                              />
                            )}
                            {categoryLabel}
                          </span>
                        </span>
                        <span className="task-move-picker-date">
                          {formatTaskMoveScheduleDate(schedule)}
                        </span>
                        {schedule.location && (
                          <span className="task-move-picker-location">
                            <MapPin aria-hidden="true" />
                            {schedule.location}
                          </span>
                        )}
                        {duplicate && (
                          <span className="task-move-picker-duplicate">
                            {schedule.description && (
                              <span title={schedule.description}>
                                {schedule.description}
                              </span>
                            )}
                            <span>일정 #{schedule.schedule_id}</span>
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
          <footer className="task-move-picker-footer">
            {error && (
              <p className="task-move-picker-error" role="alert">
                {error}
              </p>
            )}
            <p
              className="task-move-picker-selected"
              title={selected ? getTaskMoveScheduleLabel(selected) : undefined}
            >
              {selected
                ? getTaskMoveScheduleLabel(selected)
                : "이동할 일정을 선택하세요."}
            </p>
            <div className="task-move-picker-footer-actions">
              <small>할 일의 마감일은 유지됩니다.</small>
              <button type="button" onClick={onClose} disabled={pending}>
                취소
              </button>
              <button
                type="button"
                className="task-move-picker-submit"
                disabled={!canSubmit}
                onClick={() => {
                  if (canSubmit && selected) onMove(selected);
                }}
              >
                {pending ? "이동 중…" : "이 일정으로 이동"}
              </button>
            </div>
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
