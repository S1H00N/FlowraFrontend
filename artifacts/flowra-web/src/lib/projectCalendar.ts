import type { ProjectCalendarItem, Schedule, TaskPriority } from "@/types";

// These IDs are only used by calendar rendering. Mutations use assignment_id.
export function projectWorkItemToSchedule(
  item: ProjectCalendarItem,
): Schedule | null {
  if (!item.start_datetime) return null;
  return {
    schedule_id: -(2_000_000_000_000 + item.assignment_id),
    project_work_item: item,
    title: `[${item.project_name}] ${item.title}`,
    description: item.description,
    schedule_type: "other",
    priority: item.priority as TaskPriority | undefined,
    start_datetime: item.start_datetime,
    end_datetime: item.end_datetime,
    all_day: item.all_day ?? false,
    is_completed: item.status === "done",
    completed_at: item.completed_at,
    visibility: "private",
    created_at: item.start_datetime,
  };
}
