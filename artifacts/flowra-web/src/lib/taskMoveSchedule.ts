import type { Schedule } from "@/types";

function dateLabel(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function timeLabel(date: Date) {
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatTaskMoveScheduleDate(schedule: Schedule): string {
  const start = new Date(schedule.start_datetime);
  if (Number.isNaN(start.getTime())) return "날짜 확인 필요";
  const rawEnd = schedule.end_datetime ? new Date(schedule.end_datetime) : null;
  const end =
    rawEnd && !Number.isNaN(rawEnd.getTime()) && rawEnd >= start
      ? rawEnd
      : null;
  const multipleDays = end && dateLabel(start) !== dateLabel(end);
  if (schedule.all_day) {
    return `${dateLabel(start)}${multipleDays ? `–${dateLabel(end)}` : ""} · 종일`;
  }
  if (multipleDays) {
    return `${dateLabel(start)} ${timeLabel(start)}–${dateLabel(end)} ${timeLabel(end)}`;
  }
  return `${dateLabel(start)} · ${timeLabel(start)}${end ? `–${timeLabel(end)}` : ""}`;
}

export function getTaskMoveScheduleLabel(schedule: Schedule): string {
  return `${schedule.title || "제목 없음"} (${formatTaskMoveScheduleDate(schedule)})`;
}
