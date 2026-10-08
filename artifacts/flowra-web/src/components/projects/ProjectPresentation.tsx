import { Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ErrorState from "@/components/ui/ErrorState";
import { useCompanyProjectMembers } from "@/hooks/useCompanyProjects";
import { getApiErrorDetails, getErrorMessage } from "@/lib/error";
import type {
  CompanyMembership,
  CompanyProject,
  CompanyProjectStatus,
  CompanyProjectVisibility,
} from "@/types";

export const PROJECT_STATUS_OPTIONS: Array<{
  value: CompanyProjectStatus;
  label: string;
}> = [
  { value: "draft", label: "초안" },
  { value: "active", label: "진행 중" },
  { value: "paused", label: "일시중지" },
  { value: "completed", label: "완료" },
  { value: "cancelled", label: "취소" },
  { value: "archived", label: "보관" },
];

export const PROJECT_VISIBILITY_OPTIONS: Array<{
  value: CompanyProjectVisibility;
  label: string;
}> = [
  { value: "company", label: "회사 전체" },
  { value: "department_tree", label: "부서 및 하위 부서" },
  { value: "members", label: "프로젝트 멤버" },
];

export function isActiveProjectMembership(membership: CompanyMembership) {
  return (
    membership.status === "active" &&
    (!membership.company?.status || membership.company.status === "active")
  );
}

export function canCreateProject(membership: CompanyMembership) {
  const departmentId =
    membership.department_id ?? membership.department?.department_id;
  return (
    isActiveProjectMembership(membership) &&
    Number.isSafeInteger(departmentId) &&
    Number(departmentId) > 0 &&
    (!membership.department?.status ||
      membership.department.status === "active")
  );
}

export function formatProjectDate(value?: string | null) {
  if (!value) return "미정";
  // These are calendar dates, so do not convert them through UTC or local time.
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return date ? `${date[1]}.${date[2]}.${date[3]}` : value;
}

export function ProjectStatusBadge({ status }: { status: string }) {
  const knownStatus = PROJECT_STATUS_OPTIONS.find(
    (option) => option.value === status,
  );
  const tone =
    status === "completed"
      ? "bg-muted text-muted-foreground"
      : status === "paused"
        ? "bg-amber-50 text-amber-700"
        : status === "cancelled"
          ? "bg-rose-50 text-rose-700"
          : status === "active"
            ? "bg-accent text-accent-foreground"
            : "bg-muted text-muted-foreground";
  return (
    <span className={`project-status ${tone}`}>
      {knownStatus?.label ?? status}
    </span>
  );
}

export function ProjectError({
  error,
  onRetry,
  retrying,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const details = getApiErrorDetails(error);
  const title =
    details?.status === 403
      ? "접근 권한이 없습니다"
      : details?.status === 404
        ? "프로젝트를 찾을 수 없습니다"
        : details?.status === 401
          ? "로그인이 필요합니다"
          : details?.status === 400
            ? "요청 내용을 확인해 주세요"
            : "프로젝트를 불러오지 못했습니다";
  return (
    <div role="alert">
      <ErrorState
        title={title}
        message={getErrorMessage(error, "연결을 확인한 뒤 다시 시도해 주세요.")}
        onRetry={onRetry}
        retrying={retrying}
      />
    </div>
  );
}

export function ProjectEditAction({
  project,
  membership,
  onEdit,
  compact = false,
}: {
  project: CompanyProject;
  membership: CompanyMembership;
  onEdit: () => void;
  compact?: boolean;
}) {
  const permission = useCompanyProjectMembers(project.company_project_id, {
    enabled:
      isActiveProjectMembership(membership) &&
      membership.company_id === project.company_id,
  });
  // F01 gates this GET on active owner/manager. Do not infer this from company roles.
  // Member status is optional in the existing API type; an explicit inactive status denies access.
  const canEdit =
    !permission.isError &&
    isActiveProjectMembership(membership) &&
    membership.company_id === project.company_id &&
    permission.data?.some(
      (member) =>
        member.company_member_id === membership.company_member_id &&
        (member.role === "owner" || member.role === "manager") &&
        (!member.status || member.status === "active"),
    );
  const failure = getApiErrorDetails(permission.error);
  if (
    permission.isError &&
    failure?.status !== 403 &&
    failure?.status !== 404
  ) {
    return (
      <Button
        type="button"
        variant="ghost"
        size={compact ? "icon" : "sm"}
        disabled={permission.isFetching}
        onClick={() => void permission.refetch()}
        aria-label={`${project.name} 권한 다시 확인`}
      >
        <RefreshCw aria-hidden="true" />
        {!compact && "권한 다시 확인"}
      </Button>
    );
  }
  if (!canEdit) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size={compact ? "icon" : "default"}
      onClick={onEdit}
      aria-label={compact ? `${project.name} 수정` : "프로젝트 수정"}
    >
      <Pencil aria-hidden="true" />
      {!compact && "프로젝트 수정"}
    </Button>
  );
}
