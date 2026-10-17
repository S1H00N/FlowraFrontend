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

export function projectActiveAssignees(assignments: CompanyProjectAssignment[]) {
  const seen = new Set<string>();
  return assignments.filter((assignment, index) => {
    if (assignment.status === "cancelled") return false;
    const memberId = assignment.assignee_company_member_id;
    // Masked IDs identify no person. Separate masked assignments must not be
    // collapsed into a single user, or resolved through the company directory.
    const key = typeof memberId === "number" && memberId > 0
      ? `member:${memberId}` : `assignment:${projectAssignmentId(assignment) ?? `unknown:${index}`}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function projectAssigneeSummary(assignments: CompanyProjectAssignment[], directory: CompanyAdminMember[], membership: CompanyMembership, known = true) {
  if (!known) return "담당자 정보 확인 필요";
  const names = projectActiveAssignees(assignments).map((assignment) => {
    const company_member_id = assignment.assignee_company_member_id;
    return typeof company_member_id === "number" && company_member_id >= 0
      ? projectMemberName({ company_member_id }, directory, membership) : "담당자 정보 확인 필요";
  });
  return names.join(", ") || "미배정";
}

export function matchesProjectAssigneeFilter(assignments: CompanyProjectAssignment[], known: boolean, memberId: string, unassigned: boolean) {
  if (!known && (memberId !== "all" || unassigned)) return false;
  const current = projectActiveAssignees(assignments);
  if (unassigned && (!known || current.length > 0)) return false;
  return memberId === "all" || current.some((assignment) =>
    typeof assignment.assignee_company_member_id === "number" && assignment.assignee_company_member_id > 0 &&
    String(assignment.assignee_company_member_id) === memberId);
}
