import type { Pagination } from "./api";
import type { TaskPriority, TaskStatus } from "./task";

export type CompanyProjectStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "archived";

export type CompanyProjectPhaseMode = "phase_less" | "phased";
export type CompanyProjectWorkItemStatus = TaskStatus | "cancelled";
export type CompanyProjectMemberRole = "owner" | "manager" | "member" | "viewer";
export type CompanyProjectAssignmentRole = "owner" | "assignee" | "reviewer" | "watcher";
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
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface CompanyProjectPhase {
  company_project_phase_id: number;
  company_project_id?: number;
  name: string;
  description?: string | null;
  status?: string;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  progress_percent?: number;
  sort_order?: number | null;
  [key: string]: unknown;
}

export interface CompanyProjectWorkItemRollup {
  child_count?: number;
  descendant_count?: number;
  done_count?: number;
  delayed_count?: number;
  progress_percent?: number;
  rollup_progress_percent?: number;
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
  status: CompanyProjectWorkItemStatus | string;
  priority?: TaskPriority | string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  planned_minutes?: number | null;
  due_datetime?: string | null;
  progress_percent?: number;
  progress_override_percent?: number | null;
  progress_weight?: number;
  is_milestone?: boolean;
  completed_at?: string | null;
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
  department_id?: number | null;
  assigned_by_company_member_id?: number | null;
  role?: CompanyProjectAssignmentRole;
  allocation_percent?: number | null;
  planned_minutes?: number | null;
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
  company_id?: string | number;
  name: string;
  description?: string | null;
  status?: Extract<CompanyProjectStatus, "draft" | "active">;
  phase_mode?: CompanyProjectPhaseMode;
  visibility?: Extract<
    CompanyProjectVisibility,
    "department_tree" | "members"
  >;
  origin_department_id?: string | number | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
}

export interface CompanyProjectSummary {
  phase_count: number;
  work_item_count: number;
  assignment_count: number;
}

export interface CompanyProjectDetailPolicy {
  scale: CompanyProjectScale;
  mode: "full" | "summary";
  max_depth: number;
  full_load_allowed: boolean;
  returned_work_item_count: number;
}

export interface CreateCompanyProjectPhaseRequest {
  name: string;
  description?: string | null;
  status?: CompanyProjectWorkItemStatus;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  sort_order?: number;
  external_phase_id?: string | null;
}

export type UpdateCompanyProjectPhaseRequest = Partial<CreateCompanyProjectPhaseRequest>;

export interface CreateCompanyProjectWorkItemRequest {
  title: string;
  company_project_phase_id?: number | null;
  parent_work_item_id?: number | null;
  description?: string | null;
  status?: CompanyProjectWorkItemStatus;
  priority?: TaskPriority;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  planned_minutes?: number | null;
  due_datetime?: string | null;
  progress_percent?: number;
  progress_weight?: number;
  is_milestone?: boolean;
  sort_order?: number;
  wbs_code?: string | null;
  external_work_item_id?: string | null;
  department_ids?: number[];
}

export interface UpdateCompanyProjectWorkItemRequest extends Partial<Omit<CreateCompanyProjectWorkItemRequest, "external_work_item_id">> {
  completed_at?: string | null;
  progress_override_percent?: number | null;
}

export interface CreateCompanyProjectAssignmentRequest {
  assignee_company_member_id: number;
  department_id?: number | null;
  assigned_by_company_member_id?: number | null;
  role?: CompanyProjectAssignmentRole;
  allocation_percent?: number | null;
  planned_minutes?: number | null;
  status?: CompanyProjectWorkItemStatus;
  progress_percent?: number;
  starts_at?: string | null;
  ends_at?: string | null;
  external_assignment_id?: string | null;
}

export interface UpdateManagedCompanyProjectAssignmentRequest extends Partial<Omit<CreateCompanyProjectAssignmentRequest, "external_assignment_id">> {
  completed_at?: string | null;
}

export interface CreateCompanyProjectDependencyRequest {
  predecessor_work_item_id: number;
  successor_work_item_id: number;
  dependency_type?: CompanyProjectDependencyType;
  lag_days?: number;
  external_dependency_id?: string | null;
}

export interface CompanyProjectDetailData {
  project: CompanyProject;
  phases: CompanyProjectPhase[];
  work_items: CompanyProjectWorkItem[];
  departments: Array<Record<string, unknown>>;
  assignments: CompanyProjectAssignment[];
  dependencies: CompanyProjectWorkDependency[];
  summary?: CompanyProjectSummary;
  detail_policy?: CompanyProjectDetailPolicy;
}

export interface UpdateCompanyProjectRequest {
  name?: string;
  description?: string | null;
  status?: CompanyProjectStatus;
  visibility?: CompanyProjectVisibility;
  origin_department_id?: string | number | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  completed_at?: string | null;
}

export interface CompanyProjectMember {
  project_member_id?: number;
  company_project_member_id?: number;
  company_member_id: number;
  role: CompanyProjectMemberRole | string;
  status?: string;
  [key: string]: unknown;
}

export interface CreateCompanyProjectMemberRequest {
  company_member_id: string | number;
  role?: CompanyProjectMemberRole;
}

export interface UpdateCompanyProjectMemberRequest {
  role?: CompanyProjectMemberRole;
  status?: "active" | "inactive";
}

export interface CompanyProjectGanttQuery {
  mode?: CompanyProjectGanttMode;
  max_depth?: number;
  phase_id?: string | number;
  from?: string;
  to?: string;
}

export interface CompanyProjectGanttData {
  gantt_policy: CompanyProjectGanttPolicy;
  phases: CompanyProjectPhase[];
  items: CompanyProjectWorkItem[];
  dependencies: CompanyProjectWorkDependency[];
}

export interface CompanyProjectWorkItemChildrenQuery {
  depth?: number;
}

export interface CompanyProjectWorkItemChildrenData {
  parent?: CompanyProjectWorkItem;
  items: CompanyProjectWorkItem[];
  departments: Array<Record<string, unknown>>;
  assignments: CompanyProjectAssignment[];
  dependencies: CompanyProjectWorkDependency[];
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
  | "custom"
  | "before_start"
  | "before_due";

export interface CreateCompanyProjectWorkReminderRequest {
  remind_at: string;
  reminder_type?: CompanyProjectWorkReminderType;
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
