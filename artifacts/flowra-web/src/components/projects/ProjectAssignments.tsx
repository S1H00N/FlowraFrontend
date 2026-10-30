import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown, MoreHorizontal, UserRoundMinus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import CustomSelect from "@/components/ui/CustomSelect";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FloatingPanelPortalProvider } from "@/components/ui/FloatingPanelPortal";
import { useCreateCompanyProjectAssignment, useUpdateManagedCompanyProjectAssignment } from "@/hooks/useCompanyProjects";
import { activeProjectMember, projectActiveAssignees, projectAssignmentId, projectMemberDepartment, projectMemberName } from "@/lib/projectMembers";
import { getErrorMessage } from "@/lib/error";
import { WorkAssignees, workStatusLabel } from "./ProjectWorkPresentation";
import type { CompanyAdminMember, CompanyMembership, CompanyProjectAssignment, CompanyProjectAssignmentRole, CompanyProjectMember } from "@/types";

const ASSIGNMENT_ROLES = [
  { value: "owner", label: "책임자" },
  { value: "assignee", label: "담당자" },
  { value: "reviewer", label: "검토자" },
  { value: "watcher", label: "참관자" },
] as const;

function assignmentName(assignment: CompanyProjectAssignment, directory: CompanyAdminMember[], membership: CompanyMembership) {
  const id = assignment.assignee_company_member_id;
  return typeof id === "number" && id >= 0 ? projectMemberName({ company_member_id: id }, directory, membership) : "담당자 정보 확인 필요";
}

export default function ProjectAssignments({
  companyProjectId, workItemId, assignments, assignmentsKnown = true, members, directory, membership,
  canManage, canManageMembers, directoryError, directoryLoading, onRetryDirectory, onRetryAssignments, onManageMembers, onMutationStart,
  dialogOnly = false, onClose, onCloseAutoFocus,
}: {
  companyProjectId: number;
  workItemId: number;
  assignments: CompanyProjectAssignment[];
  assignmentsKnown?: boolean;
  members: CompanyProjectMember[];
  directory: CompanyAdminMember[];
  membership: CompanyMembership;
  canManage: boolean;
  canManageMembers: boolean;
  directoryError?: unknown;
  directoryLoading: boolean;
  onRetryDirectory: () => void;
  onRetryAssignments?: () => Promise<unknown>;
  onManageMembers?: () => void;
  onMutationStart?: () => () => void;
  dialogOnly?: boolean;
  onClose?: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const create = useCreateCompanyProjectAssignment();
  const update = useUpdateManagedCompanyProjectAssignment();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyProjectAssignment | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<CompanyProjectAssignmentRole>("assignee");
  const [addExpanded, setAddExpanded] = useState<boolean | null>(null);
  const [changingAddRole, setChangingAddRole] = useState(false);
  const [limit, setLimit] = useState(25);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CompanyProjectAssignment | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const manageButton = useRef<HTMLButtonElement>(null);
  const summarySection = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const addRoleField = useRef<HTMLDivElement>(null);
  const roleFields = useRef(new Map<number, HTMLDivElement>());
  const rowActions = useRef(new Map<number, HTMLDivElement>());
  const scope = `${companyProjectId}:${workItemId}:${membership.company_id}:${membership.company_member_id}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const permission = useRef(canManage);
  permission.current = canManage;
  const pending = create.isPending || update.isPending;
  const blocked = pending || refreshing || reviewRequired || !assignmentsKnown || !canManage;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    setOpen(dialogOnly); setEditing(null); setCancelTarget(null);
    setSearch(""); setSelectedMember(null); setSelectedRole("assignee"); setError(null); setNotice(null); setReviewRequired(false);
    setAddExpanded(null); setChangingAddRole(false);
  }, [scope, dialogOnly]);
  useEffect(() => { if (!canManage) { setOpen(false); setEditing(null); setCancelTarget(null); } }, [canManage]);
  const current = assignments.filter((assignment) => assignment.status !== "cancelled");
  const people = projectActiveAssignees(assignments);
  const identitiesVisible = people.every((assignment) => typeof assignment.assignee_company_member_id === "number" && assignment.assignee_company_member_id > 0);
  const addOpen = addExpanded ?? (assignmentsKnown && current.length === 0);
  const editingId = editing ? projectAssignmentId(editing) : undefined;
  const usedIds = new Set(current.filter((assignment) => !editingId || projectAssignmentId(assignment) !== editingId)
    .map((assignment) => assignment.assignee_company_member_id));
  const available = members.filter(activeProjectMember).filter((member) => member.company_member_id > 0 && (
    directory.some((entry) => entry.company_member_id === member.company_member_id && (!entry.status || entry.status === "active")) ||
    member.company_member_id === membership.company_member_id));
  const candidates = available.filter((member) => [projectMemberName(member, directory, membership), projectMemberDepartment(member, directory, membership)]
    .some((value) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const isSelectableMember = (member: CompanyProjectMember) => !usedIds.has(member.company_member_id) && member.company_member_id !== editing?.assignee_company_member_id;
  const noSelectableMembers = assignmentsKnown && !directoryLoading && !directoryError && !available.some(isSelectableMember);
  const onlyAssignedMatches = !noSelectableMembers && Boolean(search.trim()) && candidates.length > 0 && !candidates.some(isSelectableMember);
  const selected = available.find((member) => member.company_member_id === selectedMember);
  const canSelect = selected && isSelectableMember(selected);

  function changeOpen(next: boolean) {
    if (pending || refreshing || lock.current) return;
    setOpen(next);
    if (!next) onClose?.();
  }

  function focusSearch() {
    requestAnimationFrame(() => { if (alive.current && currentScope.current === scope) searchInput.current?.focus({ preventScroll: true }); });
  }

  function begin(assignment: CompanyProjectAssignment) {
    setEditing(assignment); setCancelTarget(null);
    setSelectedMember(null); setSelectedRole("assignee"); setSearch(""); setLimit(25); setError(null); setNotice(null);
    focusSearch();
  }

  function focusAfterChange(target: HTMLDivElement | null | undefined) {
    requestAnimationFrame(() => {
      if (!alive.current || currentScope.current !== scope) return;
      const button = target?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      (button ?? addButton.current ?? title.current)?.focus({ preventScroll: true });
    });
  }

  async function perform(action: () => Promise<unknown>, success: string, afterSuccess?: () => void, resetSelection = true) {
    if (blocked || lock.current) return;
    lock.current = true;
    const requestScope = scope;
    const finishRefresh = onMutationStart?.();
    setError(null); setNotice(null);
    try {
      await action();
      if (alive.current && currentScope.current === requestScope && permission.current) {
        setCancelTarget(null);
        if (resetSelection) { setEditing(null); setSelectedMember(null); setSelectedRole("assignee"); setChangingAddRole(false); }
        setNotice(success);
        afterSuccess?.();
      }
    } catch (failure) {
      if (alive.current && currentScope.current === requestScope) {
        setError(getErrorMessage(failure, "배정 변경 결과를 확인하지 못했습니다."));
        // A lost response can follow a committed write. Require a successful read before resubmitting.
        setReviewRequired(true);
      }
    } finally { lock.current = false; finishRefresh?.(); }
  }

  function save() {
    if (!canSelect || !selected || directoryLoading || directoryError) return;
    const payload = { assignee_company_member_id: selected.company_member_id };
    if (editing) {
      if (!editingId || !current.some((assignment) => projectAssignmentId(assignment) === editingId)) return;
      void perform(() => update.mutateAsync({ companyProjectId, workItemId, assignmentId: editingId, payload }), "담당자를 교체했습니다.", () => focusAfterChange(rowActions.current.get(editingId)));
    } else void perform(() => create.mutateAsync({ companyProjectId, workItemId, payload: { ...payload, role: selectedRole } }), "담당자 배정을 반영했습니다.", () => { setAddExpanded(true); focusSearch(); });
  }

  function cancelAssignment() {
    const assignmentId = cancelTarget && projectAssignmentId(cancelTarget);
    if (!assignmentId || !current.some((assignment) => projectAssignmentId(assignment) === assignmentId)) return;
    void perform(() => update.mutateAsync({ companyProjectId, workItemId, assignmentId, payload: { status: "cancelled" } }), "담당자 배정을 취소했습니다. 배정 기록은 유지됩니다.", () => focusAfterChange(null), false);
  }

  async function refreshAssignments() {
    if (!onRetryAssignments || pending || lock.current || refreshing) return;
    const requestScope = scope;
    setRefreshing(true);
    try {
      await onRetryAssignments();
      if (alive.current && currentScope.current === requestScope) {
        setReviewRequired(false); setError(null); setEditing(null); setCancelTarget(null); setSelectedMember(null);
        setNotice("최신 배정 상태를 확인했습니다. 현재 담당자를 확인해 주세요.");
      }
    } catch (failure) {
      if (alive.current && currentScope.current === requestScope) setError(getErrorMessage(failure, "최신 배정 상태를 불러오지 못했습니다. 다시 확인해 주세요."));
    } finally { if (alive.current && currentScope.current === requestScope) setRefreshing(false); }
  }

  function changeRole(assignment: CompanyProjectAssignment, value: string) {
    const assignmentId = projectAssignmentId(assignment);
    const role = ASSIGNMENT_ROLES.find((option) => option.value === value)?.value;
    if (!assignmentId || !current.some((assignment) => projectAssignmentId(assignment) === assignmentId)) return;
    if (!role || role === assignment.role) return;
    void perform(() => update.mutateAsync({ companyProjectId, workItemId, assignmentId, payload: { role } }), "배정 역할을 변경했습니다.", () => focusAfterChange(roleFields.current.get(assignmentId)), false);
  }

  const feedback = <>
    {notice && <p role="status" className="projects-note">{notice}</p>}
    {error && <p role="alert" className="work-panel-error">{error}</p>}
    {(reviewRequired || !assignmentsKnown) && <div className="work-assignment-refresh">
      <p className="projects-note">{reviewRequired ? "변경 결과가 불명확할 수 있습니다. 최신 담당자를 확인한 후 다시 작업해 주세요." : "담당자 정보를 확인하지 못했습니다."}</p>
      {onRetryAssignments && <Button variant="outline" size="sm" disabled={pending || refreshing} onClick={() => void refreshAssignments()}>{refreshing ? "확인 중..." : "최신 배정 다시 확인"}</Button>}
    </div>}
  </>;

  return <Dialog open={open && canManage} onOpenChange={changeOpen}>
    {!dialogOnly && <section ref={summarySection} aria-label="업무 담당자" aria-busy={pending || refreshing} tabIndex={-1}>
      <div className="work-panel-section-heading">
        <h4>담당자</h4>
        {canManage && <DialogTrigger asChild><Button ref={manageButton} aria-label="담당자 관리" variant="ghost" size="sm" disabled={pending || !assignmentsKnown}>관리</Button></DialogTrigger>}
      </div>
      <WorkAssignees assignments={assignments} directory={directory} membership={membership} known={assignmentsKnown} compact />
      {assignmentsKnown && people.length > 1 && <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground">담당자 전체 보기</summary>
        <ul className="work-assignment-list max-h-56 overflow-y-auto" aria-label="전체 업무 담당자">
          {people.map((assignment, index) => {
            const name = assignmentName(assignment, directory, membership);
            const role = ASSIGNMENT_ROLES.find((option) => option.value === assignment.role)?.label ?? "역할 미설정";
            return <li key={projectAssignmentId(assignment) ?? index}><div className="work-assignment-person min-w-0">
              <Avatar className="h-7 w-7 shrink-0" aria-hidden="true"><AvatarFallback className="bg-accent text-accent-foreground">{assignment.assignee_company_member_id ? name.slice(0, 1) : "·"}</AvatarFallback></Avatar>
              <div className="min-w-0"><span className="block truncate" title={name}>{name}</span><small>{role} · {assignment.status ? workStatusLabel(assignment.status) : "상태 확인 필요"}</small></div>
            </div></li>;
          })}
        </ul>
      </details>}
      {!open && feedback}
    </section>}
      <DialogContent className="work-assignment-dialog flowra-surface left-3 right-3 top-[5dvh] mx-auto flex max-h-[90dvh] w-auto max-w-[600px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 text-foreground" style={{ transform: "none", translate: "none" }}
        onOpenAutoFocus={(event) => { event.preventDefault(); title.current?.focus(); }}
        onCloseAutoFocus={(event) => {
          if (onCloseAutoFocus) { onCloseAutoFocus(event); return; }
          event.preventDefault();
          if (alive.current) (manageButton.current?.isConnected ? manageButton.current : summarySection.current)?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => { if (pending || refreshing || lock.current || portal?.querySelector('[aria-haspopup][aria-expanded="true"]')) event.preventDefault(); }}
        onInteractOutside={(event) => { if (pending || refreshing || lock.current) event.preventDefault(); }}>
        <FloatingPanelPortalProvider value={portal}>
          <DialogHeader className="shrink-0 px-5 pb-4 pt-5 text-left sm:px-6">
            <DialogTitle ref={title} tabIndex={-1} className="pr-7 leading-6 outline-none">담당자 관리</DialogTitle>
            <DialogDescription>업무 담당자를 추가하거나 변경합니다.</DialogDescription>
          </DialogHeader>
          <div ref={setPortal} className="work-assignment-dialog-body min-h-0 overflow-y-auto px-5 pb-4 sm:px-6" aria-busy={pending || refreshing}>
            {feedback}
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">현재 담당자</h4>
              {assignmentsKnown && <span className="text-xs text-muted-foreground">{identitiesVisible ? `${people.length}명` : "인원 확인 필요"}</span>}
            </div>
            {Boolean(directoryError) && <p role="alert" className="work-panel-error">회사 구성원 정보를 불러오지 못했습니다. 이름과 부서가 일부 표시되지 않을 수 있습니다.</p>}
            {assignmentsKnown && current.some((assignment) => assignment.assignee_company_member_id !== 0 && assignmentName(assignment, directory, membership) === "이름 정보 없음") && <p className="projects-note">일부 담당자의 이름과 부서를 확인하지 못했습니다.</p>}
            {assignmentsKnown && current.length > 0 && <p className="projects-note">담당 역할은 선택 즉시 저장됩니다.</p>}
            <TooltipProvider delayDuration={200}>
            {assignmentsKnown && current.length > 0 ? <ul className="work-assignment-list">
              {current.map((assignment, index) => {
                const assignmentId = projectAssignmentId(assignment);
                const name = assignmentName(assignment, directory, membership);
                const privateIdentity = !(typeof assignment.assignee_company_member_id === "number" && assignment.assignee_company_member_id > 0);
                const role = ASSIGNMENT_ROLES.find((option) => option.value === assignment.role)?.label ?? "역할 미설정";
                const status = assignment.status ? workStatusLabel(assignment.status) : "상태 확인 필요";
                const department = !privateIdentity ? projectMemberDepartment({ company_member_id: assignment.assignee_company_member_id! }, directory, membership) : "";
                return <li key={assignmentId ?? index} className="work-assignment-current">
                  <div className="work-assignment-person">
                    <Avatar className="work-assignment-avatar h-7 w-7 shrink-0" aria-hidden="true"><AvatarFallback className="bg-accent text-accent-foreground">{privateIdentity ? "·" : name.slice(0, 1)}</AvatarFallback></Avatar>
                    <div className="min-w-0"><span className="work-assignment-current-name block" title={name}>{name}</span>
                      {department && <small className="work-assignment-department">{department}</small>}
                      <small className="truncate" aria-label={`배정 상태: ${status}`} title={`배정 상태: ${status}`}><span className="hidden sm:inline" aria-hidden="true">배정 상태: </span><span className="sm:hidden" aria-hidden="true">배정: </span>{status}</small>
                    </div>
                  </div>
                  <div className="work-assignment-role" ref={(element) => { if (assignmentId) { if (element) roleFields.current.set(assignmentId, element); else roleFields.current.delete(assignmentId); } }}>
                    <span className="mb-1 block text-[11px] text-muted-foreground">담당 역할</span>
                    {assignmentId && !privateIdentity ? <CustomSelect value={assignment.role ?? ""} options={ASSIGNMENT_ROLES} placeholder="역할 미설정" ariaLabel={`${name} 배정 역할`} disabled={blocked} showFallbackMarker={false} onChange={(value) => changeRole(assignment, value)} className="h-8 gap-1 border-input bg-background px-2 text-xs" />
                      : <span className="text-xs text-muted-foreground">{role}</span>}
                  </div>
                  {assignmentId && !privateIdentity && <div className="work-assignment-row-actions" ref={(element) => { if (element) rowActions.current.set(assignmentId, element); else rowActions.current.delete(assignmentId); }}>
                    <Tooltip>
                      <TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${name} 담당자 교체`} disabled={blocked} onClick={() => begin(assignment)}><ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" /></Button></TooltipTrigger>
                      <TooltipContent className="z-[140]">담당자 교체</TooltipContent>
                    </Tooltip>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${name} 배정 더 보기`} disabled={blocked}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent className="flowra-surface z-[140]" align="end" collisionPadding={12}>
                        <DropdownMenuItem aria-label={`${name} 담당 배정 취소`} disabled={blocked} onSelect={() => { setCancelTarget(assignment); setEditing(null); setError(null); setNotice(null); }}><UserRoundMinus aria-hidden="true" />담당 배정 취소</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>}
                </li>;
              })}
            </ul> : <p className="work-panel-empty">{assignmentsKnown ? "미배정" : "담당자 정보 확인 필요"}</p>}
            </TooltipProvider>
            {cancelTarget && <div className="work-assignment-form" role="group" aria-label="담당 배정 취소 확인">
              <h4 className="text-sm font-semibold">담당 배정 취소</h4>
              <p className="projects-note">{assignmentName(cancelTarget, directory, membership)} 님의 담당 배정을 취소할까요? 업무 상태와 다른 담당자의 배정은 유지되며, 이 배정의 기록도 보존됩니다.</p>
              <div className="work-assignment-actions"><Button size="sm" variant="outline" disabled={pending || refreshing} onClick={() => { const target = cancelTarget; setCancelTarget(null); setError(null); focusAfterChange(rowActions.current.get(projectAssignmentId(target)!)); }}>돌아가기</Button><Button size="sm" disabled={blocked} onClick={cancelAssignment}>담당 배정 취소 확인</Button></div>
            </div>}
            {!editing && <Button ref={addButton} variant="ghost" className="mt-3 w-full justify-start gap-2" aria-label="담당자 추가" aria-expanded={addOpen} aria-controls={`assignment-add-${workItemId}`} disabled={pending || refreshing} onClick={() => { setAddExpanded(!addOpen); if (!addOpen) focusSearch(); }}><ChevronDown className={`h-4 w-4 transition-transform ${addOpen ? "" : "-rotate-90"}`} aria-hidden="true" />담당자 추가</Button>}
            {(editing || addOpen) && <div id={`assignment-add-${workItemId}`} className="work-assignment-form" role="group" aria-label="담당자 선택">
              <h4 className="text-sm font-semibold">{editing ? `${assignmentName(editing, directory, membership)} 담당자 교체` : "담당자 추가"}</h4>
              {editing && <p className="projects-note">기존 담당자: {assignmentName(editing, directory, membership)}</p>}
              <Input ref={searchInput} aria-label="프로젝트 구성원 검색" placeholder="이름 또는 부서 검색" value={search} disabled={pending || refreshing}
                onChange={(event) => { setSearch(event.target.value); setLimit(25); }} className="border-input bg-background" />
              {directoryLoading && <p role="status" className="projects-note">구성원을 불러오는 중...</p>}
              {Boolean(directoryError) && <Button size="sm" variant="outline" disabled={pending || refreshing} onClick={onRetryDirectory}>구성원 정보 다시 시도</Button>}
              {!noSelectableMembers && <ul className="work-assignment-candidates" aria-label="프로젝트 구성원 선택">
                {candidates.slice(0, limit).map((member) => <li key={member.company_member_id}>
                  <Button variant="ghost" className="work-assignment-candidate" aria-pressed={selectedMember === member.company_member_id}
                    disabled={blocked || Boolean(directoryError) || directoryLoading || !isSelectableMember(member)} onClick={() => setSelectedMember(member.company_member_id)}>
                    <span className="work-assignment-candidate-identity" title={projectMemberName(member, directory, membership)}>{projectMemberName(member, directory, membership)}</span>
                    <small>{usedIds.has(member.company_member_id) ? "이미 배정됨" : member.company_member_id === editing?.assignee_company_member_id ? "현재 담당자" : projectMemberDepartment(member, directory, membership) || "부서 미지정"}</small>
                  </Button>
                </li>)}
              </ul>}
              {noSelectableMembers ? <div className="work-assignment-empty">
                <UsersRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">{editing ? "교체 가능한 구성원이 없습니다." : "추가 가능한 구성원이 없습니다."}</p>
                <p className="projects-note">다른 직원을 배정하려면 프로젝트 구성원을 먼저 추가해 주세요.</p>
              </div> : !directoryLoading && !directoryError && !candidates.length && <p className="work-panel-empty">검색 결과가 없습니다.</p>}
              {onlyAssignedMatches && <div className="grid gap-1"><p className="work-panel-empty">{editing ? "검색한 구성원은 현재 담당자이거나 이미 배정되어 있습니다." : "검색한 구성원은 이미 배정되어 있습니다."}</p><p className="projects-note">다른 이름이나 부서로 검색해 주세요.</p></div>}
              {!noSelectableMembers && candidates.length > limit && <Button size="sm" variant="ghost" disabled={pending || refreshing} onClick={() => setLimit((value) => value + 25)}>더 보기 ({candidates.length - limit}명)</Button>}
              {selected && <p aria-live="polite" className="projects-note">선택한 구성원: {projectMemberName(selected, directory, membership)}{projectMemberDepartment(selected, directory, membership) ? ` · ${projectMemberDepartment(selected, directory, membership)}` : ""}</p>}
              {!editing && !noSelectableMembers && (selected || changingAddRole || selectedRole !== "assignee") && <div ref={addRoleField} className="grid min-w-0 gap-1 text-xs">
                {changingAddRole ? <label className="grid gap-1">담당 역할
                  <CustomSelect<CompanyProjectAssignmentRole> value={selectedRole} options={ASSIGNMENT_ROLES} ariaLabel="추가 담당자 배정 역할" disabled={blocked} onChange={setSelectedRole} className="h-9 border-input bg-background" />
                </label> : <div className="flex items-center justify-between gap-2"><span>담당 역할: {ASSIGNMENT_ROLES.find((option) => option.value === selectedRole)?.label}</span><Button size="sm" variant="ghost" aria-label="추가 담당자 역할 변경" disabled={blocked} onClick={() => { setChangingAddRole(true); focusAfterChange(addRoleField.current); }}>변경</Button></div>}
              </div>}
              {canManageMembers && onManageMembers ? <Button variant="link" size="sm" disabled={pending || refreshing} onClick={onManageMembers}>프로젝트 구성원 관리에서 직원 추가</Button>
                : <p className="projects-note">찾는 직원이 없다면 프로젝트 소유자에게 구성원 추가를 요청해 주세요.</p>}
              {editing && <p className="projects-note">기존 담당 역할과 배정 정보는 유지됩니다.</p>}
              {(!noSelectableMembers || editing) && <div className="work-assignment-actions">
                {editing && <Button size="sm" variant="outline" disabled={pending || refreshing} onClick={() => { const target = editingId; setEditing(null); setSelectedMember(null); setError(null); focusAfterChange(target ? rowActions.current.get(target) : null); }}>교체 취소</Button>}
                <Button size="sm" disabled={blocked || !canSelect || directoryLoading || Boolean(directoryError)} onClick={save}>{pending ? "반영 중..." : editing ? "교체 저장" : "담당자 배정"}</Button>
              </div>}
            </div>}
          </div>
          <DialogFooter className="shrink-0 border-t border-border px-5 py-4 sm:px-6"><Button variant="outline" disabled={pending || refreshing} onClick={() => changeOpen(false)}>닫기</Button></DialogFooter>
        </FloatingPanelPortalProvider>
      </DialogContent>
  </Dialog>;
}
