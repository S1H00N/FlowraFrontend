import {
  useCallback,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";

/** IDs are namespaced because schedules and tasks may have the same numeric ID. */
export type SelectionKey = `schedule:${number}` | `task:${number}`;

export function useListSelection(root: RefObject<HTMLElement | null>) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(
    new Set(),
  );
  const [selectedScheduleIds, setSelectedScheduleIds] = useState<Set<number>>(
    new Set(),
  );
  const anchor = useRef<SelectionKey | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const count = selectedTaskIds.size + selectedScheduleIds.size;

  const visibleKeys = () =>
    [
      ...(root.current?.querySelectorAll<HTMLElement>("[data-selection-key]") ??
        []),
    ]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => element.dataset.selectionKey as SelectionKey);

  const addKeys = (keys: SelectionKey[]) => {
    setSelectedTaskIds(
      (current) =>
        new Set([
          ...current,
          ...keys
            .filter((key) => key.startsWith("task:"))
            .map((key) => Number(key.split(":")[1])),
        ]),
    );
    setSelectedScheduleIds(
      (current) =>
        new Set([
          ...current,
          ...keys
            .filter((key) => key.startsWith("schedule:"))
            .map((key) => Number(key.split(":")[1])),
        ]),
    );
  };

  const toggle = (key: SelectionKey) => {
    if (!count) opener.current = document.activeElement as HTMLElement;
    anchor.current = key;
    const [kind, value] = key.split(":");
    const setter =
      kind === "task" ? setSelectedTaskIds : setSelectedScheduleIds;
    setter((current) => {
      const next = new Set(current);
      if (!next.delete(Number(value))) next.add(Number(value));
      return next;
    });
  };

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
    setSelectedScheduleIds(new Set());
    anchor.current = null;
    const target = opener.current;
    requestAnimationFrame(() => {
      if (target?.isConnected && target.getClientRects().length) target.focus();
      else
        root.current
          ?.querySelector<HTMLElement>(
            "[data-selection-key] .tasks-card-open, [data-selection-key] .tasks-subtask-open",
          )
          ?.focus();
    });
  }, [root]);

  const onSelectionClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (!(event.shiftKey || event.ctrlKey || event.metaKey)) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-task-editor]")) return;
    const row = target.closest<HTMLElement>("[data-selection-key]");
    if (!row || !root.current?.contains(row)) return;
    // Completion, editing, menus and links retain their own interactions.
    const control = target.closest(
      "button, input, a, textarea, select, label, [role='checkbox']",
    );
    if (
      control &&
      !control.matches(
        ".tasks-card-open, .tasks-subtask-open",
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const key = row.dataset.selectionKey as SelectionKey;
    const keys = visibleKeys();
    const start = anchor.current ? keys.indexOf(anchor.current) : -1;
    const end = keys.indexOf(key);
    if (event.shiftKey && start >= 0 && end >= 0) {
      addKeys(keys.slice(Math.min(start, end), Math.max(start, end) + 1));
    } else toggle(key);
  };

  return {
    selectedTaskIds,
    setSelectedTaskIds,
    selectedScheduleIds,
    setSelectedScheduleIds,
    selectionMode: count > 0,
    count,
    clearSelection,
    onSelectionClickCapture,
    selectAllVisible: () => addKeys(visibleKeys()),
    toggleTaskSelection: (id: number) => toggle(`task:${id}`),
    toggleScheduleSelection: (id: number) => toggle(`schedule:${id}`),
  };
}
