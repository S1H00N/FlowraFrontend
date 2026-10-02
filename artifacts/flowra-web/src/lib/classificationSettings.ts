import { useEffect, useState } from "react";
import {
  SCHEDULE_TYPE_LABELS,
  SCHEDULE_TYPES,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type ScheduleType,
  type TaskPriority,
  type TaskStatus,
} from "@/types";

export type ClassificationGroup =
  | "scheduleTypes"
  | "taskPriorities"
  | "taskStatuses";

export type ClassificationValue<G extends ClassificationGroup> =
  G extends "scheduleTypes"
    ? ScheduleType
    : G extends "taskPriorities"
      ? TaskPriority
      : TaskStatus;

export interface ClassificationOption<T extends string = string> {
  key: string;
  value: T;
  label: string;
  enabled: boolean;
  order: number;
  isDefault: boolean;
}

export type ClassificationSettings = {
  scheduleTypes: Record<string, ClassificationOption<ScheduleType>>;
  taskPriorities: Record<string, ClassificationOption<TaskPriority>>;
  taskStatuses: Record<string, ClassificationOption<TaskStatus>>;
};

const storageKey = "flowra:classification-settings";
const changeEvent = "flowra:classification-settings-changed";

function makeOptions<T extends string>(
  keys: readonly T[],
  labels: Record<T, string>,
): Record<string, ClassificationOption<T>> {
  return keys.reduce(
    (acc, key, index) => {
      acc[key] = {
        key,
        value: key,
        label: labels[key],
        enabled: true,
        order: index + 1,
        isDefault: true,
      };
      return acc;
    },
    {} as Record<string, ClassificationOption<T>>,
  );
}

export function getDefaultClassificationSettings(): ClassificationSettings {
  return {
    scheduleTypes: makeOptions(SCHEDULE_TYPES, SCHEDULE_TYPE_LABELS),
    taskPriorities: makeOptions(TASK_PRIORITIES, TASK_PRIORITY_LABELS),
    taskStatuses: makeOptions(TASK_STATUSES, TASK_STATUS_LABELS),
  };
}

function isAllowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function normalizeSavedRecord(saved: unknown) {
  return saved && typeof saved === "object"
    ? (saved as Record<string, Partial<ClassificationOption>>)
    : {};
}

function mergeGroup<T extends string>(
  defaults: Record<string, ClassificationOption<T>>,
  saved: unknown,
  allowed: readonly T[],
): Record<string, ClassificationOption<T>> {
  const savedRecord = normalizeSavedRecord(saved);
  const fallbackValue = allowed[0];
  const next: Record<string, ClassificationOption<T>> = {};

  Object.values(defaults).forEach((defaultOption) => {
    const savedOption = savedRecord[defaultOption.key];
    next[defaultOption.key] = {
      ...defaultOption,
      label:
        typeof savedOption?.label === "string" &&
        savedOption.label.trim().length > 0
          ? savedOption.label.trim()
          : defaultOption.label,
      enabled:
        typeof savedOption?.enabled === "boolean"
          ? savedOption.enabled
          : defaultOption.enabled,
      order:
        typeof savedOption?.order === "number" &&
        Number.isFinite(savedOption.order)
          ? savedOption.order
          : defaultOption.order,
      isDefault: true,
      value: defaultOption.value,
    };
  });

  Object.entries(savedRecord).forEach(([key, savedOption]) => {
    if (key in defaults) return;
    if (typeof savedOption?.label !== "string") return;

    const label = savedOption.label.trim();
    if (!label) return;

    const value = isAllowedValue(savedOption.value, allowed)
      ? savedOption.value
      : fallbackValue;
    next[key] = {
      key,
      value,
      label,
      enabled:
        typeof savedOption.enabled === "boolean" ? savedOption.enabled : true,
      order:
        typeof savedOption.order === "number" &&
        Number.isFinite(savedOption.order)
          ? savedOption.order
          : Object.keys(next).length + 1,
      isDefault: false,
    };
  });

  return normalizeOrder(next);
}

function normalizeOrder<T extends string>(
  group: Record<string, ClassificationOption<T>>,
) {
  return Object.values(group)
    .sort((a, b) => a.order - b.order)
    .reduce(
      (acc, option, index) => {
        acc[option.key] = { ...option, order: index + 1 };
        return acc;
      },
      {} as Record<string, ClassificationOption<T>>,
    );
}

export function normalizeClassificationSettings(
  saved?: Partial<ClassificationSettings> | null,
): ClassificationSettings {
  const defaults = getDefaultClassificationSettings();
  return {
    scheduleTypes: mergeGroup(
      defaults.scheduleTypes,
      saved?.scheduleTypes,
      SCHEDULE_TYPES,
    ),
    taskPriorities: mergeGroup(
      defaults.taskPriorities,
      saved?.taskPriorities,
      TASK_PRIORITIES,
    ),
    taskStatuses: mergeGroup(
      defaults.taskStatuses,
      saved?.taskStatuses,
      TASK_STATUSES,
    ),
  };
}

export function readClassificationSettings(): ClassificationSettings {
  if (typeof window === "undefined") return getDefaultClassificationSettings();

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return getDefaultClassificationSettings();
    return normalizeClassificationSettings(JSON.parse(raw));
  } catch {
    return getDefaultClassificationSettings();
  }
}

export function useClassificationSettings() {
  const [settings, setSettings] = useState(readClassificationSettings);

  useEffect(() => {
    const update = () => setSettings(readClassificationSettings());
    window.addEventListener(changeEvent, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(changeEvent, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return settings;
}

export function getClassificationOptions<G extends ClassificationGroup>(
  settings: ClassificationSettings,
  group: G,
  options?: {
    enabledOnly?: boolean;
    include?: ClassificationValue<G>;
    defaultOnly?: boolean;
  },
): ClassificationOption<ClassificationValue<G>>[] {
  const values = Object.values(settings[group]) as ClassificationOption<
    ClassificationValue<G>
  >[];
  const include = options?.include;
  return values
    .filter((option) => {
      if (options?.defaultOnly && !option.isDefault) return false;
      if (option.value === include || option.key === include) return true;
      return options?.enabledOnly ? option.enabled : true;
    })
    .sort((a, b) => a.order - b.order);
}

export function getClassificationLabel<G extends ClassificationGroup>(
  settings: ClassificationSettings,
  group: G,
  key?: ClassificationValue<G> | null,
) {
  if (!key) return "";
  const option = Object.values(settings[group]).find(
    (item) => item.isDefault && item.value === key,
  ) as ClassificationOption<ClassificationValue<G>> | undefined;
  return option?.label ?? String(key);
}
