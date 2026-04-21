export type Priority = "low" | "medium" | "high";

export interface BriefingSchedule {
  schedule_id: number;
  title: string;
  start_datetime: string;
}

export interface BriefingPriorityTask {
  task_id: number;
  title: string;
  priority: Priority;
}

export interface TodayBriefing {
  date: string;
  today_schedules: BriefingSchedule[];
  priority_tasks: BriefingPriorityTask[];
  unfinished_tasks: number;
  ai_summary: string;
}
