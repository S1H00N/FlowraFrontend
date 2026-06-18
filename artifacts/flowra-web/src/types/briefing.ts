import type { TaskPriority, Task } from "./task";
import type { CompanySchedule } from "./company";
import type { Reminder } from "./reminder";
import type { Schedule } from "./schedule";

export type Priority = TaskPriority | "low" | "medium" | "high";

export type BriefingSchedule = Schedule;

export type BriefingTask = Task;

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
  company_schedules: CompanySchedule[];
  tasks: BriefingTask[];
  overdue_tasks: BriefingTask[];
  reminders: Reminder[];
}

export interface TodayBriefingQuery {
  date?: string;
}

export type BriefingPriorityTask = BriefingTask;
