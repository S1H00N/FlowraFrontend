import type { CompanyAdminMember, CompanyMembership, CompanyProjectAssignment, CompanyProjectMember } from "@/types";

export function activeProjectMember(member: CompanyProjectMember) {
  return !member.status || member.status === "active";
}

export function projectMemberName(
  member: Pick<CompanyProjectMember, "company_member_id">,
  directory: CompanyAdminMember[],
  membership?: CompanyMembership,
) {
  // Never recover a privacy-masked assignment through a company directory.
  if (member.company_member_id === 0) return "담당자 정보 비공개";
  if (member.company_member_id === membership?.company_member_id) return membership.name;
  return directory.find((entry) => entry.company_member_id === member.company_member_id)?.name || "이름 정보 없음";
}

export function projectMemberDepartment(
  member: Pick<CompanyProjectMember, "company_member_id">,
  directory: CompanyAdminMember[],
  membership?: CompanyMembership,
) {
  if (member.company_member_id <= 0) return "";
  if (member.company_member_id === membership?.company_member_id) return membership.department?.name ?? "";
  return directory.find((entry) => entry.company_member_id === member.company_member_id)?.department?.name ?? "";
}

export function projectAssignmentId(assignment: CompanyProjectAssignment) {
  return assignment.company_project_work_assignment_id ?? assignment.assignment_id;
}

export function projectAssigneeSummary(assignments: CompanyProjectAssignment[], directory: CompanyAdminMember[], membership: CompanyMembership) {
  const memberIds = new Set(assignments.filter((assignment) => assignment.status !== "cancelled")
    .map((assignment) => assignment.assignee_company_member_id).filter((id): id is number => typeof id === "number"));
  return [...memberIds].map((company_member_id) => projectMemberName({ company_member_id }, directory, membership)).join(", ") || "미배정";
}
