export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(items);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function show(type: ToastType, message: string, duration = 3500) {
  const id = nextId++;
  const item: ToastItem = { id, type, message, duration };
  items = [...items, item];
  emit();
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

export const toast = {
  success: (message: string, duration?: number) =>
    show("success", message, duration),
  error: (message: string, duration?: number) =>
    show("error", message, duration ?? 5000),
  info: (message: string, duration?: number) => show("info", message, duration),
  dismiss,
};

export const toastStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ToastItem[] {
    return items;
  },
};
