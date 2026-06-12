import type { ScheduleType } from "./schedule";
import type { TaskPriority, TaskStatus } from "./task";

export interface HomeSummary {
  today_schedule_count: number;
  today_personal_schedule_count: number;
  today_company_schedule_count: number;
  today_deadline_schedule_count: number;
  incomplete_task_count: number;
  current_completion_streak_days: number;
  best_completion_streak_days: number;
}

export interface HomeSlotCounts {
  meeting: number;
  fieldwork: number;
  deadline: number;
  other: number;
}

export type HomeScheduleDensityLevel = "low" | "medium" | "high" | "overloaded";

export interface HomeScheduleDensity {
  percent: number;
  level: HomeScheduleDensityLevel;
  busy_minutes: number;
  available_minutes: number;
  scheduled_hours: number;
  peak_time_label: string | null;
}

export type HomeInsightData = Record<string, unknown>;

export interface HomeAiInsights {
  optimal_focus_time: HomeInsightData;
  weekly_completion_rate: HomeInsightData;
  schedule_density: HomeScheduleDensity;
}

export type HomeCompletionStreakStatus =
  | "completed"
  | "missed"
  | "pending"
  | "empty"
  | "future";

export interface HomeCompletionStreakDay extends Record<string, unknown> {
  date?: string;
  label?: string;
  status: HomeCompletionStreakStatus;
}

export interface HomeCompletionStreak {
  days: number;
  current_days: number;
  best_days: number;
  source: string;
  week: HomeCompletionStreakDay[];
}

export interface HomeSchedule {
  id: number;
  schedule_id?: number;
  title: string;
  description?: string | null;
  schedule_type: ScheduleType;
  start_datetime: string;
  end_datetime?: string | null;
  all_day: boolean;
  location?: string | null;
  category_id?: number | null;
  priority?: TaskPriority;
  is_completed?: boolean;
  completed_at?: string | null;
}

export interface HomeOrganizationSchedule {
  id: number;
  company_id: number;
  company_name: string;
  title: string;
  description?: string | null;
  schedule_type: ScheduleType;
  start_datetime: string;
  end_datetime?: string | null;
  all_day: boolean;
  location?: string | null;
  source_type?: string;
  target_types?: string[];
}

export interface HomeTask {
  id: number;
  task_id?: number;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_datetime?: string | null;
  schedule_id?: number | null;
  category_id?: number | null;
}

export interface HomeFocusItem {
  item_type: "schedule" | "company_schedule" | "task";
  id: number;
}

export interface TodayHome {
  date: string;
  timezone: string;
  briefing_text: string;
  summary: HomeSummary;
  slot_counts: HomeSlotCounts;
  ai_insights: HomeAiInsights;
  completion_streak: HomeCompletionStreak;
  today_schedules: HomeSchedule[];
  organization_schedules: HomeOrganizationSchedule[];
  due_today_tasks: HomeTask[];
  focus_items: HomeFocusItem[];
}

export interface HomeTodayQuery {
  date?: string;
  timezone?: string;
}
