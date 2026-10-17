import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { projectActiveAssignees, projectAssigneeSummary, projectAssignmentId, projectMemberName } from "@/lib/projectMembers";
import type { CompanyAdminMember, CompanyMembership, CompanyProjectAssignment, CompanyProjectWorkItem } from "@/types";

interface WorkAssigneesProps {
  assignments: CompanyProjectAssignment[];
  directory: CompanyAdminMember[];
  membership: CompanyMembership;
  known?: boolean;
  compact?: boolean;
}

function WorkAssigneeIdentity({ assignment, directory, membership }: Pick<WorkAssigneesProps, "directory" | "membership"> & {
  assignment: CompanyProjectAssignment;
}) {
  const id = assignment.assignee_company_member_id;
  const name = typeof id === "number" && id >= 0
    ? projectMemberName({ company_member_id: id }, directory, membership) : "담당자 정보 확인 필요";
  return <span className="work-assignee-identity">
    <Avatar className="h-6 w-6 shrink-0" aria-hidden="true"><AvatarFallback className="bg-accent text-[10px] text-accent-foreground">
      {typeof id === "number" && id > 0 ? name.slice(0, 1) : "·"}
    </AvatarFallback></Avatar>
    <span className="work-assignee-name">{name}</span>
  </span>;
}

export function WorkAssignees({ assignments, directory, membership, known = true, compact = false }: WorkAssigneesProps) {
  const current = projectActiveAssignees(assignments);
  const identitiesVisible = current.every((assignment) => typeof assignment.assignee_company_member_id === "number" && assignment.assignee_company_member_id > 0);
  const summary = projectAssigneeSummary(assignments, directory, membership, known);
  if (!known || !current.length) return <span className="work-assignee-empty">{summary}</span>;
  const displayed = compact ? current.slice(0, 1) : current.slice(0, 3);
  return <span className={`work-assignee-summary${compact ? " work-assignee-compact" : ""}`} title={compact ? undefined : summary}>
    {displayed.map((assignment, index) => <WorkAssigneeIdentity key={projectAssignmentId(assignment) ?? index}
      assignment={assignment} directory={directory} membership={membership} />)}
    {current.length > displayed.length && <span className="work-assignee-count">{identitiesVisible
      ? `+${current.length - displayed.length}`
      : "추가 배정"}</span>}
  </span>;
}

export function WorkAssigneeDetails({ assignments, directory, membership, known = true, canManage = false }: WorkAssigneesProps & { canManage?: boolean }) {
  const current = projectActiveAssignees(assignments);
  const identitiesVisible = current.every((assignment) => typeof assignment.assignee_company_member_id === "number" && assignment.assignee_company_member_id > 0);
  return <>
    <p className="work-assignee-tooltip-heading">{known && identitiesVisible ? `담당자 ${current.length}명` : "담당자 정보 확인 필요"}</p>
    {known && current.length > 0 ? <ul className="work-assignee-tooltip-list">
      {current.map((assignment, index) => <li key={projectAssignmentId(assignment) ?? index}>
        <WorkAssigneeIdentity assignment={assignment} directory={directory} membership={membership} />
      </li>)}
    </ul> : <p>{known ? "미배정" : "담당자 정보를 아직 확인하지 못했습니다."}</p>}
    {known && !identitiesVisible && <p>비공개·미확인 배정은 인원 수를 확인할 수 없습니다.</p>}
    <p className="work-assignee-tooltip-hint">{canManage ? "클릭하여 담당자 관리" : "클릭하여 업무 상세에서 담당자 확인"}</p>
  </>;
}

export const WORK_STATUS_OPTIONS = [
  { value: "todo", label: "대기" },
  { value: "in_progress", label: "진행 중" },
  { value: "done", label: "완료" },
  { value: "postponed", label: "보류" },
  { value: "cancelled", label: "취소" },
] as const;

export const WORK_PRIORITY_OPTIONS = [
  { value: "low", label: "낮음" },
  { value: "medium", label: "보통" },
  { value: "high", label: "높음" },
  { value: "urgent", label: "긴급" },
] as const;

export function workStatusLabel(status: string) {
  return WORK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

export function workPriorityLabel(priority?: string | null) {
  if (!priority) return "미정";
  return WORK_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority;
}

export function WorkStatusBadge({ status }: { status: string }) {
  const tone = status === "in_progress"
    ? "bg-accent text-accent-foreground"
    : status === "postponed"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      : status === "cancelled"
        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
        : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex max-w-full shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium ${tone}`}>
      {workStatusLabel(status)}
    </span>
  );
}

export function WorkPriorityBadge({ priority }: { priority?: string | null }) {
  const tone = priority === "urgent"
    ? "text-rose-700 dark:text-rose-300"
    : priority === "high"
      ? "text-amber-700 dark:text-amber-300"
      : "text-muted-foreground";
  return <span className={`whitespace-nowrap text-xs font-medium ${tone}`}>{workPriorityLabel(priority)}</span>;
}

export function formatWorkProgress(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "미정";
  // Display the server value; neither override nor child rollup is recalculated here.
  return `${new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function WorkProgress({ item, compact = false, label }: {
  item: CompanyProjectWorkItem;
  compact?: boolean;
  label?: string;
}) {
  const value = item.progress_percent;
  const validValue = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
  const manualOverride = typeof item.progress_override_percent === "number" && Number.isFinite(item.progress_override_percent);
  return (
    <div className={compact ? "min-w-20" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-2">
        {label && <span aria-hidden className="mr-auto text-xs text-muted-foreground">{label}</span>}
        <span className={`${compact ? "text-xs" : "text-sm"} tabular-nums`}>{formatWorkProgress(value)}</span>
        {manualOverride && (
          <span
            className="whitespace-nowrap text-[11px] text-muted-foreground"
            title={`수동 진행률 설정: ${formatWorkProgress(item.progress_override_percent)}`}
          >
            수동 설정
          </span>
        )}
      </div>
      {!compact && validValue && (
        <div
          role="progressbar"
          aria-label="업무 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={value}
          aria-valuetext={formatWorkProgress(value)}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
        </div>
      )}
    </div>
  );
}
