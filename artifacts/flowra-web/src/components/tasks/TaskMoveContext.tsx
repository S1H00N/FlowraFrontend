import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  useMoveTask,
  useTaskMovePending,
  type TaskMove,
} from "@/hooks/useTaskBoard";
import { getErrorMessage } from "@/lib/error";
import { toast } from "@/lib/toast";
import type { TaskReorderProps } from "@/hooks/useLinkedTaskDrag";
import type { Schedule, Task } from "@/types";
import TaskMovePicker from "./TaskMovePicker";

type Target = { scheduleId: number | null; anchorId?: number; after?: boolean };
interface MoveContext {
  disabled: boolean;
  dragged: Task | null;
  lastMoved: TaskMove | null;
  schedules: Schedule[];
  openPicker: (task: Task) => void;
  move: (input: TaskMove) => void;
  row: (task: Task, tasks: Task[]) => TaskReorderProps | undefined;
  container: (
    scheduleId: number | null,
    allowed?: boolean,
  ) => {
    "data-task-drop-active": boolean;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
}
const Context = createContext<MoveContext | null>(null);
export const useTaskMoveContext = () => useContext(Context);

function autoScroll(event: DragEvent<HTMLElement>) {
  let el: HTMLElement | null = event.currentTarget;
  while (
    el &&
    !(
      el.scrollHeight > el.clientHeight &&
      /auto|scroll/.test(getComputedStyle(el).overflowY)
    )
  )
    el = el.parentElement;
  const rect = el?.getBoundingClientRect() ?? {
    top: 0,
    bottom: window.innerHeight,
  };
  const amount =
    event.clientY < rect.top + 55
      ? -18
      : event.clientY > rect.bottom - 55
        ? 18
        : 0;
  if (amount) {
    if (el) el.scrollBy(0, amount);
    else window.scrollBy(0, amount);
  }
}

export function TaskMoveProvider({
  children,
  schedules,
  initialMonth,
  disabled,
  onReveal,
}: {
  children: ReactNode;
  schedules: Schedule[];
  initialMonth: Date;
  disabled: boolean;
  onReveal: (move: TaskMove) => void;
}) {
  const mutation = useMoveTask();
  const pending = useTaskMovePending();
  const lock = useRef(false);
  const [dragged, setDragged] = useState<Task | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [lastMoved, setLastMoved] = useState<TaskMove | null>(null);
  const [pickerTask, setPickerTask] = useState<Task | null>(null);
  const [pickerError, setPickerError] = useState<string | undefined>();
  const pickerOpener = useRef<HTMLElement | null>(null);
  const pickerFrame = useRef<number | null>(null);
  const available = schedules.filter(
    (s) => !s.is_company_schedule && !s.is_shared,
  );
  const unavailable = disabled || pending;
  const clear = () => {
    setDragged(null);
    setTarget(null);
  };
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("keydown", cancel);
      if (pickerFrame.current !== null) cancelAnimationFrame(pickerFrame.current);
    };
  }, []);
  const restorePickerFocus = () => {
    requestAnimationFrame(() => {
      const taskMenu = pickerTask
        ? document.getElementById(`task-${pickerTask.task_id}`)
          ?.querySelector<HTMLElement>('[aria-label$=" 이동 메뉴"]')
        : null;
      const candidates = [
        pickerOpener.current,
        taskMenu,
        ...document.querySelectorAll<HTMLElement>(
          'input[aria-label="일정 또는 할 일 검색"], .tasks-board-search input',
        ),
      ];
      candidates.find((element) =>
        element?.isConnected && element.getClientRects().length &&
        !element.closest("[inert]") && !element.hasAttribute("disabled"),
      )?.focus();
    });
  };
  const closePicker = () => {
    if (pending || lock.current) return;
    setPickerTask(null);
    restorePickerFocus();
  };
  const openPicker = (task: Task) => {
    if (unavailable || lock.current) return;
    pickerOpener.current = document
      .getElementById(`task-${task.task_id}`)
      ?.querySelector<HTMLElement>('[aria-label$=" 이동 메뉴"]') ?? null;
    // Let the dropdown release its focus trap before opening the dialog.
    pickerFrame.current = requestAnimationFrame(() => {
      pickerFrame.current = null;
      setPickerError(undefined);
      setPickerTask(task);
    });
  };
  const move = (input: TaskMove) => {
    if (unavailable || lock.current) return;
    const destination = input.scheduleId === null
      ? undefined
      : input.destinationSchedule ?? available.find((s) => s.schedule_id === input.scheduleId);
    if (
      input.scheduleId !== null &&
      (!destination ||
        destination.schedule_id !== input.scheduleId ||
        destination.is_company_schedule ||
        destination.is_shared)
    )
      return;
    const savedMove = { ...input, destinationSchedule: destination };
    setPickerError(undefined);
    lock.current = true;
    clear();
    mutation.mutate(
      savedMove,
      {
        onSuccess: () => {
          setLastMoved(savedMove);
          setPickerTask(null);
          onReveal(savedMove);
          if (pickerTask) restorePickerFocus();
        },
        onError: (error) => {
          const message = getErrorMessage(
            error,
            "이동을 저장하지 못해 원래 위치로 되돌렸습니다. 다시 시도해 주세요.",
          );
          if (pickerTask) setPickerError(message);
          else toast.error(message);
        },
        onSettled: () => {
          lock.current = false;
        },
      },
    );
  };
  const container: MoveContext["container"] = (scheduleId, allowed = true) => ({
    "data-task-drop-active":
      !!dragged &&
      allowed &&
      target?.scheduleId === scheduleId &&
      target.anchorId === undefined,
    onDragOver: (event) => {
      if (!dragged || unavailable || !allowed) return;
      event.preventDefault();
      event.stopPropagation();
      autoScroll(event);
      event.dataTransfer.dropEffect = "move";
      setTarget((current) =>
        current?.scheduleId === scheduleId && current.anchorId === undefined
          ? current
          : { scheduleId },
      );
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setTarget(null);
    },
    onDrop: (event) => {
      if (!dragged || unavailable || !allowed) return;
      event.preventDefault();
      event.stopPropagation();
      move({ task: dragged, scheduleId });
      clear();
    },
  });
  const row: MoveContext["row"] = (task, tasks) =>
    unavailable
      ? undefined
      : {
          moveUp: () => {
            const group = tasks.filter(
              (t) => (t.status === "done") === (task.status === "done"),
            );
            const adjacent =
              group[group.findIndex((t) => t.task_id === task.task_id) - 1];
            if (adjacent)
              move({
                task,
                scheduleId: task.schedule_id ?? null,
                anchorId: adjacent.task_id,
                after: false,
              });
          },
          moveDown: () => {
            const group = tasks.filter(
              (t) => (t.status === "done") === (task.status === "done"),
            );
            const adjacent =
              group[group.findIndex((t) => t.task_id === task.task_id) + 1];
            if (adjacent)
              move({
                task,
                scheduleId: task.schedule_id ?? null,
                anchorId: adjacent.task_id,
                after: true,
              });
          },
          dragging: dragged?.task_id === task.task_id,
          dropPosition:
            target?.anchorId === task.task_id
              ? target.after
                ? "after"
                : "before"
              : null,
          onDragStart: (event) => {
            if (
              (event.target as HTMLElement).closest(
                '[data-task-drag-exclude], input, textarea, select, [role="checkbox"]',
              )
            ) {
              event.preventDefault();
              return;
            }
            event.stopPropagation();
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "application/x-flowra-task",
              String(task.task_id),
            );
            setDragged(task);
            setTarget(null);
          },
          onDragEnd: clear,
          onDragOver: (event) => {
            if (!dragged) return;
            event.stopPropagation();
            if (
              dragged.task_id === task.task_id ||
              (dragged.status === "done") !== (task.status === "done")
            ) {
              setTarget(null);
              return;
            }
            event.preventDefault();
            autoScroll(event);
            const rect = event.currentTarget.getBoundingClientRect();
            const after = event.clientY >= rect.top + rect.height / 2;
            setTarget((current) =>
              current?.anchorId === task.task_id && current.after === after
                ? current
                : {
                    scheduleId: task.schedule_id ?? null,
                    anchorId: task.task_id,
                    after,
                  },
            );
          },
          onDrop: (event) => {
            event.stopPropagation();
            event.preventDefault();
            if (
              !dragged ||
              dragged.task_id === task.task_id ||
              (dragged.status === "done") !== (task.status === "done")
            ) {
              clear();
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            move({
              task: dragged,
              scheduleId: task.schedule_id ?? null,
              anchorId: task.task_id,
              after: event.clientY >= rect.top + rect.height / 2,
            });
          },
          onKeyDown: (event) => {
            if (
              event.target !== event.currentTarget ||
              !["ArrowUp", "ArrowDown"].includes(event.key)
            )
              return;
            event.preventDefault();
            const group = tasks.filter(
              (t) => (t.status === "done") === (task.status === "done"),
            );
            const adjacent =
              group[
                group.findIndex((t) => t.task_id === task.task_id) +
                  (event.key === "ArrowUp" ? -1 : 1)
              ];
            if (adjacent)
              move({
                task,
                scheduleId: task.schedule_id ?? null,
                anchorId: adjacent.task_id,
                after: event.key === "ArrowDown",
              });
          },
        };
  return (
    <Context.Provider
      value={{
        disabled: unavailable,
        dragged,
        lastMoved,
        schedules: available,
        openPicker,
        move,
        row,
        container,
      }}
    >
      {children}
      {pickerTask && (
        <TaskMovePicker
          task={pickerTask}
          currentSchedule={available.find((s) => s.schedule_id === pickerTask.schedule_id)}
          initialMonth={initialMonth}
          pending={unavailable}
          error={pickerError}
          onClose={closePicker}
          onMove={(schedule) => move({
            task: pickerTask,
            scheduleId: schedule.schedule_id,
            destinationSchedule: schedule,
          })}
        />
      )}
      {dragged?.schedule_id != null && (
        <div className="task-unlink-drop" {...container(null)}>
          여기에 놓아 독립 할 일로 이동
        </div>
      )}
    </Context.Provider>
  );
}

