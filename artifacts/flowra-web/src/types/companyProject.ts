import type { Pagination } from "./api";
import type { ReminderType } from "./reminder";
import type { TaskPriority, TaskStatus } from "./task";

export type CompanyProjectStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "archived";

export type CompanyProjectPhaseMode = "phase_less" | "phased";
export type CompanyProjectVisibility =
  | "company"
  | "department_tree"
  | "members";

export type CompanyProjectGanttMode = "auto" | "summary" | "full";
export type CompanyProjectScale = "small" | "medium" | "large";

export type CompanyProjectDependencyType =
  | "finish_to_start"
  | "start_to_start"
  | "finish_to_finish"
  | "start_to_finish";

export type ProjectCalendarItemDateSource =
  | "assignment"
  | "due_datetime"
  | "planned_date"
  | "assigned_at";

export interface ProjectCalendarItem {
  item_type: "project_work_item";
  id: number;
  assignment_id: number;
  company_project_id?: number;
  project_id?: number;
  company_project_public_uid?: string | null;
  project_name: string;
  title: string;
  description?: string | null;
  priority?: TaskPriority | string | null;
  status?: TaskStatus | "cancelled" | string;
  work_item_status?: TaskStatus | "cancelled" | string | null;
  progress_percent?: number | null;
  work_item_progress_percent?: number | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  all_day?: boolean;
  date_source?: ProjectCalendarItemDateSource | string;
  due_datetime?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  assignment_starts_at?: string | null;
  assignment_ends_at?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  completed_at?: string | null;
}

export interface CompanyProject {
  company_project_id: number;
  company_project_public_uid?: string | null;
  public_uid?: string | null;
  company_id: number;
  name: string;
  description?: string | null;
  status: CompanyProjectStatus | string;
  phase_mode?: CompanyProjectPhaseMode | string;
  visibility?: CompanyProjectVisibility | string;
  origin_department_id?: number | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  created_at?: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface CompanyProjectPhase {
  company_project_phase_id: number;
  company_project_id?: number;
  name: string;
  description?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  sort_order?: number | null;
  [key: string]: unknown;
}

export interface CompanyProjectWorkItemRollup {
  child_count?: number;
  descendant_count?: number;
  done_count?: number;
  delayed_count?: number;
  progress_percent?: number;
  [key: string]: unknown;
}

export interface CompanyProjectWorkItem {
  company_project_work_item_id: number;
  company_project_id?: number;
  company_project_phase_id?: number | null;
  parent_work_item_id?: number | null;
  depth_level?: number;
  title: string;
  description?: string | null;
  status: TaskStatus | "cancelled" | string;
  priority?: TaskPriority | string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  due_datetime?: string | null;
  progress_percent?: number;
  progress_override_percent?: number | null;
  sort_order?: number;
  wbs_code?: string | null;
  rollup?: CompanyProjectWorkItemRollup | null;
  [key: string]: unknown;
}

export interface CompanyProjectAssignment {
  assignment_id?: number;
  company_project_work_assignment_id?: number;
  company_project_work_item_id?: number;
  assignee_company_member_id?: number | null;
  status?: TaskStatus | "cancelled" | string;
  progress_percent?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
  assigned_at?: string | null;
  completed_at?: string | null;
  [key: string]: unknown;
}

export interface CompanyProjectWorkDependency {
  company_project_work_dependency_id: number;
  predecessor_work_item_id: number;
  successor_work_item_id: number;
  dependency_type: CompanyProjectDependencyType | string;
  lag_days: number;
  [key: string]: unknown;
}

export interface CompanyProjectGanttPolicy {
  scale: CompanyProjectScale | string;
  mode: CompanyProjectGanttMode | string;
  max_depth: number;
  full_load_allowed: boolean;
  [key: string]: unknown;
}

export interface CompanyProjectsQuery {
  company_id?: string | number;
  status?: CompanyProjectStatus;
  q?: string;
  from?: string;
  to?: string;
  assigned_only?: boolean;
}

export interface CreateCompanyProjectRequest {
  company_id: string | number;
  name: string;
  description?: string | null;
  status?: Extract<CompanyProjectStatus, "draft" | "active">;
  phase_mode?: CompanyProjectPhaseMode;
  visibility?: Extract<
    CompanyProjectVisibility,
    "department_tree" | "members"
  >;
  origin_department_id?: string | number;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
}

export interface CompanyProjectDetailData {
  project: CompanyProject;
  phases: CompanyProjectPhase[];
  work_items: CompanyProjectWorkItem[];
  departments: Array<Record<string, unknown>>;
  assignments: CompanyProjectAssignment[];
  dependencies: CompanyProjectWorkDependency[];
  summary?: Record<string, unknown>;
  detail_policy?: Record<string, unknown>;
}

export interface CompanyProjectGanttQuery {
  mode?: CompanyProjectGanttMode;
  max_depth?: number;
  phase_id?: string | number;
  from?: string;
  to?: string;
}

export interface CompanyProjectGanttData {
  project: CompanyProject;
  gantt_policy: CompanyProjectGanttPolicy;
  phases: CompanyProjectPhase[];
  items: CompanyProjectWorkItem[];
  dependencies: CompanyProjectWorkDependency[];
}

export interface CompanyProjectWorkItemChildrenQuery {
  depth?: number;
}

export interface CompanyProjectWorkItemChildrenData {
  items: CompanyProjectWorkItem[];
}

export interface MyCompanyProjectWorkItemsQuery {
  status?: TaskStatus | TaskStatus[] | string | string[];
  project_id?: string | number;
}

export interface UpdateCompanyProjectWorkAssignmentRequest {
  status?: TaskStatus | "cancelled";
  progress_percent?: number;
  completed_at?: string | null;
}

export interface CompanyProjectCalendarItemsQuery {
  start_from?: string;
  start_to?: string;
  include_done?: boolean;
  project_id?: string | number;
  limit?: number;
}

export type CompanyProjectWorkReminderStatus =
  | "scheduled"
  | "sent"
  | "cancelled"
  | "failed";

export type CompanyProjectWorkReminderType =
  | ReminderType
  | "custom"
  | string;

export interface CreateCompanyProjectWorkReminderRequest {
  remind_at: string;
  reminder_type: CompanyProjectWorkReminderType;
  message?: string | null;
}

export interface CompanyProjectWorkReminder {
  reminder_id: number;
  company_project_work_reminder_id?: number;
  assignment_id?: number;
  company_project_work_assignment_id?: number;
  remind_at: string;
  reminder_type: CompanyProjectWorkReminderType;
  message?: string | null;
  status?: CompanyProjectWorkReminderStatus | string;
  created_at?: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface CompanyProjectWorkRemindersQuery {
  status?: CompanyProjectWorkReminderStatus;
  assignment_id?: string | number;
}

export interface CompanyProjectListData {
  projects: CompanyProject[];
  pagination?: Pagination;
}

export interface MyCompanyProjectWorkItemsData {
  items: CompanyProjectWorkItem[];
  pagination?: Pagination;
}

export interface CompanyProjectCalendarItemsData {
  items: ProjectCalendarItem[];
  pagination?: Pagination;
}

export interface CompanyProjectWorkRemindersData {
  reminders: CompanyProjectWorkReminder[];
  pagination?: Pagination;
}
