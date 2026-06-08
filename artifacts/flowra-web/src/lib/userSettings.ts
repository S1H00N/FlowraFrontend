import { useEffect, useState } from "react";

export type UserTheme = "light" | "dark" | "system";
export type ResolvedUserTheme = "light" | "dark";
export type WeekStartDay = "sunday" | "monday";
export type DefaultCalendarView = "month" | "week";

export interface UserSettings {
  theme: UserTheme;
  weekStart: WeekStartDay;
  defaultCalendarView: DefaultCalendarView;
  showHolidays: boolean;
  highlightWeekends: boolean;
  showLunarDates: boolean;
  highlightToday: boolean;
  showScheduleCountBadge: boolean;
}

const storageKey = "flowra:user-settings";
const changeEvent = "flowra:user-settings-changed";
const systemDarkQuery = "(prefers-color-scheme: dark)";

export function getDefaultUserSettings(): UserSettings {
  return {
    theme: "light",
    weekStart: "sunday",
    defaultCalendarView: "month",
    showHolidays: true,
    highlightWeekends: true,
    showLunarDates: false,
    highlightToday: true,
    showScheduleCountBadge: true,
  };
}

export function getSystemTheme(): ResolvedUserTheme {
  if (typeof window === "undefined") return "light";

  return window.matchMedia(systemDarkQuery).matches ? "dark" : "light";
}

export function resolveUserTheme(theme: UserTheme): ResolvedUserTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

export function applyUserTheme(theme: UserTheme) {
  if (typeof document === "undefined") return;

  const resolvedTheme = resolveUserTheme(theme);
  const root = document.documentElement;

  root.classList.toggle("dark", resolvedTheme === "dark");
  root.dataset.theme = theme;
  root.dataset.resolvedTheme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

function isUserTheme(value: unknown): value is UserTheme {
  return value === "light" || value === "dark" || value === "system";
}

function isWeekStartDay(value: unknown): value is WeekStartDay {
  return value === "sunday" || value === "monday";
}

function isDefaultCalendarView(value: unknown): value is DefaultCalendarView {
  return value === "month" || value === "week";
}

export function normalizeUserSettings(saved: unknown): UserSettings {
  const defaults = getDefaultUserSettings();

  if (!saved || typeof saved !== "object") return defaults;

  const record = saved as Partial<UserSettings>;
  return {
    theme: isUserTheme(record.theme) ? record.theme : defaults.theme,
    weekStart: isWeekStartDay(record.weekStart)
      ? record.weekStart
      : defaults.weekStart,
    defaultCalendarView: isDefaultCalendarView(record.defaultCalendarView)
      ? record.defaultCalendarView
      : defaults.defaultCalendarView,
    showHolidays:
      typeof record.showHolidays === "boolean"
        ? record.showHolidays
        : defaults.showHolidays,
    highlightWeekends:
      typeof record.highlightWeekends === "boolean"
        ? record.highlightWeekends
        : defaults.highlightWeekends,
    showLunarDates:
      typeof record.showLunarDates === "boolean"
        ? record.showLunarDates
        : defaults.showLunarDates,
    highlightToday:
      typeof record.highlightToday === "boolean"
        ? record.highlightToday
        : defaults.highlightToday,
    showScheduleCountBadge:
      typeof record.showScheduleCountBadge === "boolean"
        ? record.showScheduleCountBadge
        : defaults.showScheduleCountBadge,
  };
}

export function readUserSettings(): UserSettings {
  if (typeof window === "undefined") return getDefaultUserSettings();

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return getDefaultUserSettings();
    return normalizeUserSettings(JSON.parse(raw));
  } catch {
    return getDefaultUserSettings();
  }
}

export function saveUserSettings(settings: UserSettings) {
  if (typeof window === "undefined") return;
  const normalized = normalizeUserSettings(settings);

  window.localStorage.setItem(
    storageKey,
    JSON.stringify(normalized),
  );
  applyUserTheme(normalized.theme);
  window.dispatchEvent(new Event(changeEvent));
}

export function updateUserSettings(patch: Partial<UserSettings>) {
  const next = normalizeUserSettings({
    ...readUserSettings(),
    ...patch,
  });
  saveUserSettings(next);
  return next;
}

export function useUserSettings() {
  const [settings, setSettings] = useState(readUserSettings);

  useEffect(() => {
    const update = () => setSettings(readUserSettings());
    window.addEventListener(changeEvent, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(changeEvent, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return settings;
}

export function useApplyUserTheme() {
  const { theme } = useUserSettings();

  useEffect(() => {
    applyUserTheme(theme);

    if (theme !== "system" || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(systemDarkQuery);
    const updateTheme = () => applyUserTheme("system");

    mediaQuery.addEventListener("change", updateTheme);
    return () => mediaQuery.removeEventListener("change", updateTheme);
  }, [theme]);
}
