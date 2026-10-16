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

interface ProjectMembersContentProps {
  project: CompanyProject;
  membership: CompanyMembership;
  embedded?: boolean;
  onOpenChange?: (open: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
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
    <div><strong title={name}>{name}</strong><span title={department || "부서 정보 없음"}>{department || "부서 정보 없음"}</span></div>
  </div>;
}

export default function ProjectMembersDialog(props: ProjectMembersDialogProps) {
  if (!props.open) return null;
  return <ProjectMembersContent key={`${props.project.company_project_id}:${props.membership.company_member_id}`} {...props} />;
}

export function ProjectMembersPanel(props: Pick<ProjectMembersContentProps, "project" | "membership" | "onBusyChange">) {
  return <ProjectMembersContent key={`${props.project.company_project_id}:${props.membership.company_member_id}`} {...props} embedded />;
}

function ProjectMembersContent({ onOpenChange, project, membership, embedded = false, onBusyChange }: ProjectMembersContentProps) {
  const prefix = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const alive = useRef(true);
  const submissionLock = useRef(false);
  const roleControls = useRef(new Map<number, HTMLDivElement>());
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; onBusyChange?.(false); };
  }, [onBusyChange]);
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
  const matches = (member: Pick<CompanyProjectMember, "company_member_id">, source: "project" | "company") => {
    const companyMember = companyMembers.find((entry) => entry.company_member_id === member.company_member_id);
    const own = source === "project" && member.company_member_id === membership.company_member_id;
    const departmentId = own ? membership.department_id ?? membership.department?.department_id : companyMember?.department_id ?? companyMember?.department?.department_id;
    const name = source === "company" ? companyMember?.name || "이름 정보 없음" : projectMemberName(member, companyMembers, membership);
    const departmentName = source === "company" ? companyMember?.department?.name ?? "" : projectMemberDepartment(member, companyMembers, membership);
    return (department === "all" || (department === "none" ? !departmentId : String(departmentId) === department)) &&
      `${name} ${departmentName}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  };
  const filteredProject = projectMembers.filter((member) => matches(member, "project"));
  const filteredCompany = companyMembers.filter((member) => matches(member, "company"));
  const count = tab === "project" ? filteredProject.length : filteredCompany.length;
  const activeCount = projectMembers.filter(activeProjectMember).length;
  const inactiveCount = projectMembers.filter((member) => member.status === "inactive").length;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;

  async function performAction(action: () => Promise<unknown>, onSuccess: () => void) {
    if (submissionLock.current || controlsDisabled) return;
    submissionLock.current = true;
    onBusyChange?.(true);
    setError(null);
    setNotice("");
    try {
      await action();
      if (alive.current) onSuccess();
    } catch (failure) {
      if (alive.current) setError(failure);
    } finally {
      submissionLock.current = false;
      if (alive.current) onBusyChange?.(false);
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

  function clearRoleDraft(id: number) {
    setRoleDrafts((current) => { const next = { ...current }; delete next[id]; return next; });
  }

  function restoreRoleFocus(id: number) {
    requestAnimationFrame(() => {
      if (!alive.current) return;
      const control = roleControls.current.get(id);
      if (document.activeElement === document.body || control?.contains(document.activeElement))
        (control?.querySelector<HTMLButtonElement>("button") ?? titleRef.current)?.focus({ preventScroll: true });
    });
  }

  function rejoin(member: CompanyProjectMember) {
    const id = memberId(member);
    const companyMember = companyMembers.find((entry) => entry.company_member_id === member.company_member_id);
    if (!id || member.status !== "inactive" || !companyMember ||
      (companyMember.status && companyMember.status !== "active") || directory.isFetching || directory.isError) return;
    void performAction(() => update.mutateAsync({ companyProjectId: project.company_project_id, projectMemberId: id, payload: { status: "active" } }),
      () => setNotice("프로젝트에 다시 참여하도록 변경했습니다."));
  }

  function projectRow(member: CompanyProjectMember) {
    const id = memberId(member);
    const name = projectMemberName(member, companyMembers, membership);
    const active = activeProjectMember(member);
    const role = id ? roleDrafts[id] ?? member.role : member.role;
    const roleLabel = ROLE_OPTIONS.find((option) => option.value === member.role)?.label ?? "역할 정보 확인 필요";
    const roleChanged = role !== member.role;
    const savingRole = update.isPending && update.variables?.projectMemberId === id && update.variables.payload.role !== undefined;
    const companyMember = companyMembers.find((entry) => entry.company_member_id === member.company_member_id);
    const canRejoin = companyMember && (!companyMember.status || companyMember.status === "active");
    return <li key={member.company_member_id} className="project-member-row">
      <MemberIdentity name={name} department={projectMemberDepartment(member, companyMembers, membership)} />
      <span className="project-member-department" title={projectMemberDepartment(member, companyMembers, membership) || "부서 정보 없음"}>{projectMemberDepartment(member, companyMembers, membership) || "부서 정보 없음"}</span>
      {canManage && id ? <div className="project-member-role-control" ref={(node) => { if (node) roleControls.current.set(id, node); else roleControls.current.delete(id); }}>
        <CustomSelect value={role} options={ROLE_OPTIONS} ariaLabel={`${name} 프로젝트 역할`} disabled={controlsDisabled} onChange={(value) => {
          const selectedRole = ROLE_OPTIONS.find((option) => option.value === value)?.value;
          if (selectedRole === member.role) clearRoleDraft(id);
          else if (selectedRole) setRoleDrafts((current) => ({ ...current, [id]: selectedRole }));
        }} showFallbackMarker={false} className="project-member-role-select h-9 border-input bg-background" />
        {roleChanged && <>
        <small className="project-member-role-current">현재 역할: {roleLabel}</small>
        <div className="project-member-role-actions">
        <Button size="sm" variant="outline" aria-label={`${name} 역할 변경 취소`} disabled={pending} onClick={() => {
          clearRoleDraft(id);
          setError(null);
          restoreRoleFocus(id);
        }}>취소</Button>
        <Button size="sm" aria-label={`${name} 역할 변경 저장`} disabled={controlsDisabled} onClick={() => {
          const nextRole = ROLE_OPTIONS.find((option) => option.value === role)?.value;
          if (!nextRole) return;
          void performAction(() => update.mutateAsync({ companyProjectId: project.company_project_id, projectMemberId: id, payload: { role: nextRole } }), () => {
            clearRoleDraft(id);
            setNotice("프로젝트 역할을 변경했습니다.");
            restoreRoleFocus(id);
          });
        }}>{savingRole ? "저장 중..." : "변경 저장"}</Button>
        </div>
        </>}
      </div> : <span className="project-member-role">{roleLabel}</span>}
      <div className="project-member-state">
        <span className={`project-status ${active ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>{active ? "참여 중" : member.status === "inactive" ? "참여 종료" : "상태 확인 필요"}</span>
      </div>
      <div className="project-member-management">
        {canManage && id && (active ? <Button size="sm" variant="outline" aria-label={`${name} 프로젝트 참여 종료`} disabled={controlsDisabled} onClick={() => { setRemoving(id); setError(null); }}>참여 종료</Button>
          : member.status === "inactive" && <Button size="sm" variant="outline" aria-label={`${name} 다시 참여`} disabled={controlsDisabled || !canRejoin || directory.isFetching || directory.isError} title={!canRejoin ? "활성 회사 구성원만 다시 참여할 수 있습니다." : undefined} onClick={() => rejoin(member)}>다시 참여</Button>)}
      </div>
      {removing === id && id && <div className="project-member-confirm" role="group" aria-label={`${name} 참여 종료 확인`}>
        <p>{name} 님의 프로젝트 참여를 종료할까요? 참여 기록과 기존 업무 배정은 유지됩니다.</p>
        <div><Button size="sm" variant="outline" disabled={pending} onClick={() => setRemoving(null)}>취소</Button><Button size="sm" variant="destructive" disabled={controlsDisabled} onClick={() => void performAction(() => remove.mutateAsync({ companyProjectId: project.company_project_id, projectMemberId: id }), () => { setRemoving(null); setNotice("프로젝트 참여를 종료했습니다."); })}>참여 종료 확인</Button></div>
      </div>}
    </li>;
  }

  function companyRow(member: CompanyAdminMember) {
    const joined = joinedById.get(member.company_member_id);
    const available = !member.status || member.status === "active";
    const roleLabel = ROLE_OPTIONS.find((option) => option.value === joined?.role)?.label ?? "—";
    const joinedId = joined && memberId(joined);
    return <li key={member.company_member_id} className="project-member-row project-company-member-row">
      <MemberIdentity name={member.name || "이름 정보 없음"} department={member.department?.name ?? ""} />
      <span className="project-member-department" title={member.department?.name || "부서 정보 없음"}>{member.department?.name || "부서 정보 없음"}</span>
      <span className="project-member-role">{roleLabel}</span>
      <div className="project-member-state">
      {joined ? <span className={`project-status ${activeProjectMember(joined) ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>{activeProjectMember(joined) ? "참여 중" : joined.status === "inactive" ? "참여 종료" : "상태 확인 필요"}</span>
        : !available ? <span className="project-status bg-muted text-muted-foreground">비활성 회사 구성원</span>
          : <span className="project-member-role">{canManage ? "—" : "미참여"}</span>}
      </div>
      <div className="project-member-management">
      {canManage && !joined && available && <Button size="sm" variant="outline" disabled={controlsDisabled || directory.isFetching || directory.isError} onClick={() => { setSelected(member.company_member_id); setAddRole("member"); setError(null); setNotice(""); }}>프로젝트에 추가</Button>}
      {canManage && joined?.status === "inactive" && joinedId && <Button size="sm" variant="outline" aria-label={`${member.name || "이름 정보 없음"} 다시 참여`} disabled={controlsDisabled || !available || directory.isFetching || directory.isError} title={!available ? "활성 회사 구성원만 다시 참여할 수 있습니다." : undefined} onClick={() => rejoin(joined)}>다시 참여</Button>}
      </div>
      {selectedMember?.company_member_id === member.company_member_id && canManage && !joined && <div className="project-member-add" role="group" aria-label="프로젝트 구성원 추가 확인"><p><strong>{selectedMember.name}</strong> 님을 프로젝트에 추가합니다. 초대 수락을 기다리지 않고 바로 참여합니다.</p><div><CustomSelect<CompanyProjectMemberRole> value={addRole} options={ROLE_OPTIONS} ariaLabel="추가할 프로젝트 역할" onChange={setAddRole} disabled={controlsDisabled} className="h-9 border-input bg-background" /><Button variant="ghost" size="sm" disabled={pending} onClick={() => setSelected(null)}>취소</Button><Button size="sm" disabled={controlsDisabled || directory.isFetching || directory.isError} onClick={addMember}>추가</Button></div></div>}
    </li>;
  }

  const body = <div ref={embedded ? undefined : setPortal} className="project-members-body" aria-busy={pending}>
          {members.isLoading ? <FullSpinner message="프로젝트 구성원을 불러오는 중..." /> : members.isError ? <ProjectError error={members.error} onRetry={() => void members.refetch()} retrying={members.isFetching} /> : !canView ? <EmptyState title="구성원 조회 권한이 없습니다" description="활성 프로젝트 소유자 또는 관리자만 구성원을 조회할 수 있습니다." /> : <>
            <div className="project-members-summary">
              <p><strong>참여 중 {activeCount}명</strong><span>참여 종료 {inactiveCount}명</span></p>
            </div>
            <div className="projects-detail-tabs" role="tablist" aria-label="구성원 목록 선택">
              {([['project', '프로젝트 구성원'], ['company', '회사 구성원']] as const).map(([value, label]) => <Button key={value} id={`${prefix}-${value}-tab`} role="tab" variant="ghost" disabled={pending} aria-selected={tab === value} aria-controls={`${prefix}-${value}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => changeTab(value)} onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? "project" : event.key === "End" ? "company" : tab === "project" ? "company" : "project";
                changeTab(next);
                document.getElementById(`${prefix}-${next}-tab`)?.focus();
              }}>{label}</Button>)}
            </div>
            {!canManage && <p className="projects-note">구성원 추가와 역할·참여 상태 변경은 프로젝트 소유자만 할 수 있습니다.</p>}
            <div className="project-members-filters">
              <div className="projects-search"><Search size={16} aria-hidden="true" /><Input id={`${prefix}-search`} aria-label="이름 또는 부서 검색" placeholder="이름 또는 부서 검색" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="border-input bg-background" /></div>
              <CustomSelect value={department} options={departments} ariaLabel="부서 필터" onChange={(value) => { setDepartment(value); setPage(1); }} className="h-10 border-input bg-background" />
            </div>
            {directory.isError && <ProjectError error={directory.error} onRetry={() => void directory.refetch()} retrying={directory.isFetching} />}
            {error !== null && <p role="alert" className="project-members-error">{getErrorMessage(error, "구성원 변경을 저장하지 못했습니다. 최신 목록을 확인한 후 다시 시도해 주세요.")}</p>}
            {notice && <p role="status" className="projects-note">{notice}</p>}
            <div id={`${prefix}-${tab}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${tab}-tab`} className="project-members-panel">
              {count > 0 && (tab === "project" || !directory.isError) && <div className="project-members-columns" aria-hidden="true"><span>구성원</span><span>부서</span><span>프로젝트 역할</span><span>참여 상태</span><span>관리</span></div>}
              {tab === "company" && directory.isLoading ? <FullSpinner message="회사 구성원을 불러오는 중..." /> : tab === "company" && directory.isError ? null : count === 0 ? <EmptyState title={search || department !== "all" ? "검색 결과가 없습니다" : "표시할 구성원이 없습니다"} description={search || department !== "all" ? "다른 이름이나 부서를 선택해 주세요." : undefined} /> : <ul className="project-members-list" aria-label={tab === "project" ? "프로젝트 구성원 목록" : "회사 구성원 목록"}>{tab === "project" ? filteredProject.slice(pageStart, pageStart + PAGE_SIZE).map(projectRow) : filteredCompany.slice(pageStart, pageStart + PAGE_SIZE).map(companyRow)}</ul>}
            </div>
            {count > 0 && <div className="project-members-pagination"><span>{count}명 중 {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, count)}명</span><div><Button size="icon" variant="ghost" aria-label="구성원 이전 페이지" disabled={pending || currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button><span>{currentPage} / {pageCount}</span><Button size="icon" variant="ghost" aria-label="구성원 다음 페이지" disabled={pending || currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button></div></div>}
            {tab === "company" && <p className="projects-note">회사 구성원을 프로젝트에 추가할 수 있습니다.</p>}
          </>}
        </div>;

  if (embedded) return <section className="project-members-view flowra-surface" aria-label="프로젝트 구성원 관리">
    <header className="project-members-heading"><h3 ref={titleRef} tabIndex={-1}>프로젝트 구성원</h3></header>
    {body}
  </section>;

  return <Dialog open onOpenChange={(next) => { if (!next && !pending && !submissionLock.current) onOpenChange?.(false); }}>
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
        {body}
        <DialogFooter className="shrink-0 border-t border-border px-5 py-4 sm:px-6"><Button variant="outline" disabled={pending} onClick={() => onOpenChange?.(false)}>닫기</Button></DialogFooter>
      </FloatingPanelPortalProvider>
    </DialogContent>
  </Dialog>;
}
