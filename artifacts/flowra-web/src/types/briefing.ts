import type { TaskPriority, TaskStatus } from "./task";

export type Priority = TaskPriority | "low" | "medium" | "high";

export interface BriefingSchedule {
  schedule_id: number;
  title: string;
  start_datetime: string;
  end_datetime?: string | null;
  location?: string | null;
}

export interface BriefingTask {
  task_id: number;
  title: string;
  priority: TaskPriority;
  status?: TaskStatus;
  due_datetime?: string | null;
}

export interface BriefingSummary {
  schedule_count: number;
  company_schedule_count?: number;
  total_schedule_count?: number;
  task_count: number;
  overdue_task_count: number;
  reminder_count: number;
}

export interface TodayBriefing {
  date: string;
  summary: BriefingSummary;
  schedules: BriefingSchedule[];
  company_schedules?: BriefingSchedule[];
  tasks: BriefingTask[];
  overdue_tasks: BriefingTask[];
  reminders: unknown[];
}

export type BriefingPriorityTask = BriefingTask;
