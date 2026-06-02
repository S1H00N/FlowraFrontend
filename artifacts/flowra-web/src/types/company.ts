export interface CompanyInviteCompany {
  company_id: number;
  public_uid?: string;
  name: string;
  status?: string;
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
  user_id: number;
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

export interface CompanyScheduleTarget {
  target_type?: string;
  target_id?: number | string | null;
  name?: string | null;
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
  targets?: CompanyScheduleTarget[];
  created_at?: string;
  updated_at?: string;
}

export interface CompanyScheduleListQuery {
  start_from?: string;
  start_to?: string;
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
  email: string;
  name: string;
  status: string;
  company: CompanyInviteCompany;
  role?: CompanyAdminRole | string | null;
  permissions?: CompanyAdminPermission[];
}

export interface CompanyAdminDepartment {
  department_id: number;
  parent_department_id?: number | null;
  leader_company_member_id?: number | null;
  leader?: CompanyAdminMember | null;
  name: string;
  code?: string | null;
  depth_level?: number;
  external_department_id?: string | null;
  status?: string;
  sort_order?: number | null;
  children?: CompanyAdminDepartment[];
}

export interface CompanyAdminMember {
  company_member_id: number;
  user_id?: number | null;
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
