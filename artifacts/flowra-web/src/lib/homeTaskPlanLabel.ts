import {
  taskPlanDateKey,
  type TaskPlanSchedule,
  type TaskPlanStatus,
} from "./homeTasks";

export function taskPlanLabel(
  schedule: TaskPlanSchedule | undefined,
  status: TaskPlanStatus,
  today: string,
  timezone: string,
) {
  if (status === "unknown") return null;
  const date = schedule ? taskPlanDateKey(schedule, timezone) : null;
  if (!date || !schedule?.start_datetime) return null;
  const calendarLabel = new Date(`${date}T00:00:00`).toLocaleDateString(
    "ko-KR",
    {
      ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
      month: "long",
      day: "numeric",
    },
  );
  const dayLabel = status !== "past" && date === today ? "오늘" : calendarLabel;
  const timeLabel = schedule.all_day
    ? "하루 종일"
    : new Date(schedule.start_datetime).toLocaleTimeString("ko-KR", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
  const label = `${dayLabel} ${timeLabel}`;
  if (status === "past") return `지난 일정 · ${label}`;
  if (status === "planned") return `${label} 예정`;
  if (status === "active") return `${label} · 진행 중`;
  return `${label} · 종료 시간 확인 필요`;
}
