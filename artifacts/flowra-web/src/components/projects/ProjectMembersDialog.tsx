import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import CustomSelect from "@/components/ui/CustomSelect";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import EmptyState from "@/components/ui/EmptyState";
import { FloatingPanelPortalProvider } from "@/components/ui/FloatingPanelPortal";
import { Input } from "@/components/ui/input";
import { FullSpinner } from "@/components/ui/Spinner";
import { isActiveProjectMembership, ProjectError } from "./ProjectPresentation";
import {
  useCompanyProjectDirectory,
  useCompanyProjectMembers,
  useCreateCompanyProjectMember,
  useRemoveCompanyProjectMember,
  useUpdateCompanyProjectMember,
} from "@/hooks/useCompanyProjects";
import { getErrorMessage } from "@/lib/error";
import { activeProjectMember, projectMemberDepartment, projectMemberName } from "@/lib/projectMembers";
import type { CompanyAdminMember, CompanyMembership, CompanyProject, CompanyProjectMember, CompanyProjectMemberRole } from "@/types";

const ROLE_OPTIONS: Array<{ value: CompanyProjectMemberRole; label: string }> = [
  { value: "owner", label: "소유자" },
  { value: "manager", label: "관리자" },
  { value: "member", label: "구성원" },
  { value: "viewer", label: "조회자" },
];
const PAGE_SIZE = 20;

interface ProjectMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: CompanyProject;
  membership: CompanyMembership;
}

function hasMembership(project: CompanyProject, membership: CompanyMembership) {
  return isActiveProjectMembership(membership) && project.company_id === membership.company_id;
}

function memberId(member: CompanyProjectMember) {
  const id = member.project_member_id ?? member.company_project_member_id;
  return Number.isSafeInteger(id) && Number(id) > 0 ? id : undefined;
}

function MemberIdentity({ name, department }: { name: string; department: string }) {
  return <div className="project-member-identity">
    <Avatar className="h-9 w-9" aria-hidden="true"><AvatarFallback className="bg-accent text-sm text-accent-foreground">{name.trim().slice(0, 1) || <Users className="h-4 w-4" />}</AvatarFallback></Avatar>
    <div><strong>{name}</strong><span>{department || "부서 정보 없음"}</span></div>
  </div>;
}

export function ProjectMembersAction({ project, membership, onOpen }: {
  project: CompanyProject;
  membership: CompanyMembership;
  onOpen: () => void;
}) {
  const members = useCompanyProjectMembers(project.company_project_id, { enabled: hasMembership(project, membership) });
  const canView = hasMembership(project, membership) && !members.isError && members.data?.some((member) =>
    member.company_member_id === membership.company_member_id && activeProjectMember(member) && (member.role === "owner" || member.role === "manager"));
  if (!canView) return null;
  return <Button variant="outline" onClick={onOpen}><Users aria-hidden="true" />구성원 관리</Button>;
}

export default function ProjectMembersDialog(props: ProjectMembersDialogProps) {
  if (!props.open) return null;
  return <ProjectMembersDialogContent key={`${props.project.company_project_id}:${props.membership.company_member_id}`} {...props} />;
}

function ProjectMembersDialogContent({ onOpenChange, project, membership }: ProjectMembersDialogProps) {
  const prefix = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const alive = useRef(true);
  const submissionLock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<"project" | "company">("project");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [addRole, setAddRole] = useState<CompanyProjectMemberRole>("member");
  const [roleDrafts, setRoleDrafts] = useState<Record<number, CompanyProjectMemberRole>>({});
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState("");
  const members = useCompanyProjectMembers(project.company_project_id, { enabled: hasMembership(project, membership) });
  const ownMember = !members.isError && hasMembership(project, membership)
    ? members.data?.find((member) => member.company_member_id === membership.company_member_id && activeProjectMember(member))
    : undefined;
  const canView = ownMember?.role === "owner" || ownMember?.role === "manager";
  const canManage = ownMember?.role === "owner";
  const directory = useCompanyProjectDirectory(project.company_id, { enabled: canView });
  // A denied refresh must not retain names from a previously permitted directory read.
  const companyMembers = !canView || directory.isError ? [] : directory.data ?? [];
  const projectMembers = members.isError ? [] : members.data ?? [];
  const create = useCreateCompanyProjectMember();
  const update = useUpdateCompanyProjectMember();
  const remove = useRemoveCompanyProjectMember();
  const pending = create.isPending || update.isPending || remove.isPending;
  const controlsDisabled = pending || members.isFetching || !canManage;
  const joinedById = new Map(projectMembers.map((member) => [member.company_member_id, member]));
  const selectedMember = companyMembers.find((member) => member.company_member_id === selected);
  const departments = useMemo(() => {
    const values = new Map<string, string>();
    for (const member of companyMembers) {
      const id = member.department_id ?? member.department?.department_id;
      if (id && member.department?.name) values.set(String(id), member.department.name);
    }
    if (membership.department?.name) values.set(String(membership.department.department_id), membership.department.name);
    return [{ value: "all", label: "모든 부서" }, ...[...values].sort((a, b) => a[1].localeCompare(b[1], "ko")).map(([value, label]) => ({ value, label })), { value: "none", label: "부서 미지정" }];
  }, [companyMembers, membership.department]);
  const matches = (member: Pick<CompanyProjectMember, "company_member_id">) => {
    const companyMember = companyMembers.find((entry) => entry.company_member_id === member.company_member_id);
    const own = member.company_member_id === membership.company_member_id;
    const departmentId = own ? membership.department_id ?? membership.department?.department_id : companyMember?.department_id ?? companyMember?.department?.department_id;
    return (department === "all" || (department === "none" ? !departmentId : String(departmentId) === department)) &&
      `${projectMemberName(member, companyMembers, membership)} ${projectMemberDepartment(member, companyMembers, membership)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  };
  const filteredProject = projectMembers.filter(matches);
  const filteredCompany = companyMembers.filter(matches);
  const count = tab === "project" ? filteredProject.length : filteredCompany.length;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;

  async function performAction(action: () => Promise<unknown>, onSuccess: () => void) {
    if (submissionLock.current || controlsDisabled) return;
    submissionLock.current = true;
    setError(null);
    setNotice("");
    try {
      await action();
      if (alive.current) onSuccess();
    } catch (failure) {
      if (alive.current) setError(failure);
    } finally {
      submissionLock.current = false;
    }
  }

  function changeTab(next: "project" | "company") {
    setTab(next);
    setPage(1);
    setSelected(null);
    setRemoving(null);
  }

  function addMember() {
    if (!selectedMember || directory.isFetching || directory.isError || joinedById.has(selectedMember.company_member_id) || (selectedMember.status && selectedMember.status !== "active")) return;
    void performAction(() => create.mutateAsync({ companyProjectId: project.company_project_id, payload: { company_member_id: selectedMember.company_member_id, role: addRole } }), () => {
      setSelected(null);
      setNotice("프로젝트 구성원을 추가했습니다.");
    });
  }

  function projectRow(member: CompanyProjectMember) {
    const id = memberId(member);
    const name = projectMemberName(member, companyMembers, membership);
    const active = activeProjectMember(member);
    const role = id ? roleDrafts[id] ?? member.role : member.role;
    const roleLabel = ROLE_OPTIONS.find((option) => option.value === member.role)?.label ?? "역할 정보 확인 필요";
    const companyMember = companyMembers.find((entry) => entry.company_member_id === member.company_member_id);
    const canRejoin = companyMember && (!companyMember.status || companyMember.status === "active");
    return <li key={member.company_member_id} className="project-member-row">
      <MemberIdentity name={name} department={projectMemberDepartment(member, companyMembers, membership)} />
      <div className="project-member-state"><span className={`project-status ${active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>{active ? "참여 중" : member.status === "inactive" ? "참여 종료" : "상태 확인 필요"}</span></div>
      {canManage && id ? <div className="project-member-actions">
        <CustomSelect value={role} options={ROLE_OPTIONS} ariaLabel={`${name} 프로젝트 역할`} disabled={controlsDisabled} onChange={(value) => {
          const selectedRole = ROLE_OPTIONS.find((option) => option.value === value)?.value;
          if (selectedRole) setRoleDrafts((current) => ({ ...current, [id]: selectedRole }));
        }} className="h-9 min-w-[104px] border-input bg-background" />
        <Button size="sm" variant="ghost" aria-label={`${name} 역할 저장`} disabled={controlsDisabled || role === member.role} onClick={() => {
          const nextRole = ROLE_OPTIONS.find((option) => option.value === role)?.value;
          if (!nextRole) return;
          void performAction(() => update.mutateAsync({ companyProjectId: project.company_project_id, projectMemberId: id, payload: { role: nextRole } }), () => {
            setRoleDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
            setNotice("프로젝트 역할을 변경했습니다.");
          });
        }}>저장</Button>
        {active ? <Button size="sm" variant="ghost" aria-label={`${name} 프로젝트에서 제외`} disabled={controlsDisabled} onClick={() => { setRemoving(id); setError(null); }}>제외</Button>
          : <Button size="sm" variant="outline" disabled={controlsDisabled || !canRejoin || directory.isFetching || directory.isError} onClick={() => void performAction(() => update.mutateAsync({ companyProjectId: project.company_project_id, projectMemberId: id, payload: { status: "active" } }), () => setNotice("프로젝트에 다시 참여하도록 변경했습니다."))}>다시 참여</Button>}
      </div> : <span className="project-member-role">{roleLabel}</span>}
      {removing === id && id && <div className="project-member-confirm" role="group" aria-label={`${name} 제외 확인`}>
        <p>{name} 님의 프로젝트 참여를 종료할까요? 이 화면에서 업무 배정을 별도로 변경하지 않습니다. 제외 후 담당자를 확인해 주세요.</p>
        <div><Button size="sm" variant="outline" disabled={pending} onClick={() => setRemoving(null)}>취소</Button><Button size="sm" variant="destructive" disabled={controlsDisabled} onClick={() => void performAction(() => remove.mutateAsync({ companyProjectId: project.company_project_id, projectMemberId: id }), () => { setRemoving(null); setNotice("프로젝트 참여를 종료했습니다."); })}>제외 확인</Button></div>
      </div>}
    </li>;
  }

  function companyRow(member: CompanyAdminMember) {
    const joined = joinedById.get(member.company_member_id);
    const available = !member.status || member.status === "active";
    return <li key={member.company_member_id} className="project-member-row project-company-member-row">
      <MemberIdentity name={member.name || "이름 정보 없음"} department={member.department?.name ?? ""} />
      {joined ? <span className="project-status bg-muted text-muted-foreground">{activeProjectMember(joined) ? "프로젝트 참여 중" : available ? "참여 종료 · 재참여 가능" : "참여 종료 · 회사 비활성"}</span>
        : !available ? <span className="project-status bg-muted text-muted-foreground">비활성 회사 구성원</span>
          : <span className="project-member-role">추가 가능</span>}
      {canManage && <Button size="sm" variant="outline" disabled={controlsDisabled || !!joined || !available || directory.isFetching} onClick={() => { setSelected(member.company_member_id); setAddRole("member"); setError(null); setNotice(""); }}>프로젝트에 추가</Button>}
      {selectedMember?.company_member_id === member.company_member_id && canManage && !joined && <div className="project-member-add" role="group" aria-label="프로젝트 구성원 추가 확인"><p><strong>{selectedMember.name}</strong> 님을 프로젝트에 추가합니다. 초대 수락을 기다리지 않고 바로 참여합니다.</p><div><CustomSelect<CompanyProjectMemberRole> value={addRole} options={ROLE_OPTIONS} ariaLabel="추가할 프로젝트 역할" onChange={setAddRole} disabled={controlsDisabled} className="h-9 border-input bg-background" /><Button variant="ghost" size="sm" disabled={pending} onClick={() => setSelected(null)}>취소</Button><Button size="sm" disabled={controlsDisabled || directory.isFetching || directory.isError} onClick={addMember}>추가</Button></div></div>}
    </li>;
  }

  return <Dialog open onOpenChange={(next) => { if (!next && !pending && !submissionLock.current) onOpenChange(false); }}>
    <DialogContent className="project-members-dialog left-3 right-3 top-[5dvh] mx-auto flex max-h-[90dvh] w-auto max-w-[760px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 text-foreground" style={{ transform: "none", translate: "none" }}
      onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
      onCloseAutoFocus={(event) => { event.preventDefault(); if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true }); }}
      onEscapeKeyDown={(event) => { if (pending || submissionLock.current || portal?.querySelector('[aria-expanded="true"]')) event.preventDefault(); }}
      onInteractOutside={(event) => { if (pending || submissionLock.current) event.preventDefault(); }}>
      <FloatingPanelPortalProvider value={portal}>
        <DialogHeader className="shrink-0 px-5 pb-4 pt-5 text-left sm:px-6">
          <DialogTitle ref={titleRef} tabIndex={-1} className="pr-7 leading-6 outline-none">프로젝트 구성원 관리</DialogTitle>
          <DialogDescription className="text-muted-foreground">{project.name} · 회사 구성원과 프로젝트 참여를 구분하여 관리합니다.</DialogDescription>
        </DialogHeader>
        <div ref={setPortal} className="project-members-body" aria-busy={pending}>
          {members.isLoading ? <FullSpinner message="프로젝트 구성원을 불러오는 중..." /> : members.isError ? <ProjectError error={members.error} onRetry={() => void members.refetch()} retrying={members.isFetching} /> : !canView ? <EmptyState title="구성원 조회 권한이 없습니다" description="활성 프로젝트 소유자 또는 관리자만 구성원을 조회할 수 있습니다." /> : <>
            <div className="projects-detail-tabs" role="tablist" aria-label="구성원 목록 선택">
              {([['project', '프로젝트 구성원'], ['company', '회사 구성원']] as const).map(([value, label]) => <Button key={value} id={`${prefix}-${value}-tab`} role="tab" variant="ghost" aria-selected={tab === value} aria-controls={`${prefix}-${value}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => changeTab(value)} onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "project" : event.key === "End" ? "company" : tab === "project" ? "company" : "project";
                changeTab(next);
                document.getElementById(`${prefix}-${next}-tab`)?.focus();
              }}>{label}</Button>)}
            </div>
            {!canManage && <p className="projects-note">구성원 추가와 역할·참여 상태 변경은 프로젝트 소유자만 할 수 있습니다.</p>}
            <div className="project-members-filters">
              <div className="projects-search"><Search size={16} aria-hidden="true" /><Input aria-label="이름 또는 부서 검색" placeholder="이름 또는 부서 검색" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="border-input bg-background" /></div>
              <CustomSelect value={department} options={departments} ariaLabel="부서 필터" onChange={(value) => { setDepartment(value); setPage(1); }} className="h-10 border-input bg-background" />
            </div>
            <p className="projects-note">현재 불러온 회사 구성원 범위에서 이름과 부서를 검색합니다. 한 페이지에 최대 {PAGE_SIZE}명씩 표시합니다.</p>
            {directory.isError && <ProjectError error={directory.error} onRetry={() => void directory.refetch()} retrying={directory.isFetching} />}
            {error !== null && <p role="alert" className="project-members-error">{getErrorMessage(error, "구성원 변경을 저장하지 못했습니다. 최신 목록을 확인한 후 다시 시도해 주세요.")}</p>}
            {notice && <p role="status" className="projects-note">{notice}</p>}
            <div id={`${prefix}-${tab}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${tab}-tab`} className="project-members-panel">
              {tab === "company" && directory.isLoading ? <FullSpinner message="회사 구성원을 불러오는 중..." /> : tab === "company" && directory.isError ? null : count === 0 ? <EmptyState title={search || department !== "all" ? "검색 결과가 없습니다" : "표시할 구성원이 없습니다"} description={search || department !== "all" ? "다른 이름이나 부서를 선택해 주세요." : undefined} /> : <ul className="project-members-list" aria-label={tab === "project" ? "프로젝트 구성원 목록" : "회사 구성원 목록"}>{tab === "project" ? filteredProject.slice(pageStart, pageStart + PAGE_SIZE).map(projectRow) : filteredCompany.slice(pageStart, pageStart + PAGE_SIZE).map(companyRow)}</ul>}
            </div>
            {count > 0 && <div className="project-members-pagination"><span>{count}명 중 {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, count)}명</span><div><Button size="icon" variant="ghost" aria-label="구성원 이전 페이지" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button><span>{currentPage} / {pageCount}</span><Button size="icon" variant="ghost" aria-label="구성원 다음 페이지" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button></div></div>}
            <p className="projects-note">이메일·외부 사용자 직접 초대는 지원하지 않습니다. 회사 소속이 아닌 사용자는 회사 관리자의 기존 회사 초대 절차를 먼저 진행해 주세요. 참여 종료된 구성원은 프로젝트 구성원 탭에서 다시 참여하도록 변경할 수 있습니다.</p>
          </>}
        </div>
        <DialogFooter className="shrink-0 border-t border-border px-5 py-4 sm:px-6"><Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>닫기</Button></DialogFooter>
      </FloatingPanelPortalProvider>
    </DialogContent>
  </Dialog>;
}
