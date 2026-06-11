export interface CompanyInviteCompany {
  company_id: number;
  public_uid?: string;
  name: string;
  status?: string;
  company_schedule_create_policy?: string | null;
}

export interface CompanyInviteDepartment {
  department_id: number;
  name: string;
  code?: string | null;
  status?: string;
}

export interface CompanyInvite {
  company_invite_id: number;
  email: string;
  name: string;
  expires_at: string;
  company: CompanyInviteCompany;
  department?: CompanyInviteDepartment | null;
}

export interface CompanyMember {
  company_member_id: number;
  company_id: number;
  user_id?: number | null;
  user_public_uid?: string | null;
  department_id?: number | null;
  email: string;
  name: string;
  role: string;
  status: string;
  company?: CompanyInviteCompany;
  department?: CompanyInviteDepartment | null;
}

export interface AcceptCompanyInviteData {
  member: CompanyMember;
  company: CompanyInviteCompany;
  department?: CompanyInviteDepartment | null;
}

export interface CompanyMembership {
  company_member_id: number;
  company_id: number;
  user_public_uid?: string | null;
  department_id?: number | null;
  email: string;
  name: string;
  role: string;
  status: string;
  company?: CompanyInviteCompany;
  department?: CompanyInviteDepartment | null;
}

export interface CompanyScheduleTarget {
  target_type?: "company" | "department" | "member" | string;
  target_id?: number | string | null;
  department_id?: number | string | null;
  company_member_id?: number | string | null;
  name?: string | null;
  status?:
    | "active"
    | "rejected"
    | "removed"
    | string
    | null;
  approval_status?: CompanyScheduleApprovalStatus | string | null;
  department?: CompanyInviteDepartment | null;
  member?: CompanyMember | null;
  [key: string]: unknown;
}

export interface CompanySchedule {
  company_schedule_id: number;
  company: CompanyInviteCompany;
  title: string;
  description?: string | null;
  schedule_type: import("./schedule").ScheduleType;
  start_datetime: string;
  end_datetime?: string | null;
  all_day: boolean;
  location?: string | null;
  source_type?: string | null;
  status?: "active" | "pending_approval" | "cancelled" | string | null;
  origin_department?: CompanyInviteDepartment | null;
  created_by_company_member?: CompanyMember | null;
  updated_by_company_member?: CompanyMember | null;
  is_collaboration?: boolean;
  is_modified?: boolean;
  approval_status?: string | null;
  approval_summary?: Record<string, unknown> | null;
  targets?: CompanyScheduleTarget[];
  approvals?: CompanyScheduleApproval[];
  change_requests?: unknown[];
  created_at?: string;
  updated_at?: string;
}

export interface CompanyScheduleListQuery {
  start_from?: string;
  start_to?: string;
}

export interface UpdateCompanyScheduleRequest {
  title?: string;
  description?: string | null;
  schedule_type?: import("./schedule").ScheduleType;
  start_datetime?: string;
  end_datetime?: string | null;
  all_day?: boolean;
  location?: string | null;
  status?: "active" | "cancelled";
}

export interface CompanyScheduleApprovalStatusData {
  schedule: CompanySchedule;
  approvals: CompanyScheduleApproval[];
}

export type CompanyAdminPermission =
  | string
  | {
      code?: string;
      permission_code?: string;
      name?: string;
    };

export interface CompanyAdminRole {
  company_role_id?: number;
  code?: string;
  name?: string;
  scope_type?: string;
}

export interface CompanyAdminMe {
  company_admin_id: number;
  user_id?: number | null;
  user_public_uid?: string | null;
  email: string;
  name: string;
  status: string;
  company: CompanyInviteCompany;
  department_id?: number | null;
  department?: CompanyInviteDepartment | null;
  role?: CompanyAdminRole | string | null;
  permissions?: CompanyAdminPermission[];
}

export interface CompanyAdminDepartment {
  department_id: number;
  parent_department_id?: number | null;
  leader_company_member_id?: number | null;
  approval_delegate_company_member_id?: number | null;
  approval_delegate_enabled?: boolean;
  leader?: CompanyAdminMember | null;
  name: string;
  code?: string | null;
  depth_level?: number;
  external_department_id?: string | null;
  status?: string;
  schedule_create_policy?: string | null;
  sort_order?: number | null;
  children?: CompanyAdminDepartment[];
  _count?: Record<string, number>;
}

export interface CompanyAdminMember {
  company_member_id: number;
  user_id?: number | null;
  user_public_uid?: string | null;
  department_id?: number | null;
  department?: CompanyInviteDepartment | null;
  name: string;
  email: string;
  job_title?: string | null;
  status?: string;
  joined_at?: string | null;
  external_member_id?: string | null;
}

export type CompanyScheduleCreateTarget =
  | { target_type: "company" }
  | { target_type: "department"; department_id: number }
  | { target_type: "member"; company_member_id: number };

export interface CreateCompanyScheduleRequest {
  title: string;
  description?: string | null;
  schedule_type: import("./schedule").ScheduleType;
  start_datetime: string;
  end_datetime?: string | null;
  all_day?: boolean;
  location?: string | null;
  status?: "active" | "cancelled";
  targets: CompanyScheduleCreateTarget[];
}

export type CompanyScheduleApprovalStatus =
  | "pending"
  | "approved"
  | "rejected";

export type CompanyScheduleApprovalRole = "approver" | "requested";

export type CompanyScheduleApprovalType =
  | "create_collaboration"
  | "update_collaboration"
  | "delete_schedule"
  | "remove_department_target"
  | string;

export interface CompanyScheduleApproval {
  approval_id?: number;
  company_schedule_approval_id?: number;
  approval_type: CompanyScheduleApprovalType;
  status: CompanyScheduleApprovalStatus | string;
  company_schedule_id?: number;
  schedule?: CompanySchedule | null;
  company_schedule?: CompanySchedule | null;
  target_department_id?: number | null;
  target_department?: CompanyInviteDepartment | null;
  department?: CompanyInviteDepartment | null;
  requested_by_company_member?: CompanyMember | null;
  approver_company_member?: CompanyMember | null;
  approved_by_company_member?: CompanyMember | null;
  rejected_by_company_member?: CompanyMember | null;
  reason?: string | null;
  comment?: string | null;
  created_at?: string;
  updated_at?: string;
  decided_at?: string | null;
  [key: string]: unknown;
}

export interface CompanyScheduleApprovalListQuery {
  status?: CompanyScheduleApprovalStatus;
  role?: CompanyScheduleApprovalRole;
}

export interface CompanyScheduleApprovalActionRequest {
  comment?: string;
  reason?: string;
}
