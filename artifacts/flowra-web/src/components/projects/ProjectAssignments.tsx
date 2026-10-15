import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useCreateCompanyProjectAssignment, useUpdateManagedCompanyProjectAssignment } from "@/hooks/useCompanyProjects";
import { activeProjectMember, projectAssignmentId, projectMemberDepartment, projectMemberName } from "@/lib/projectMembers";
import { getErrorMessage } from "@/lib/error";
import type { CompanyAdminMember, CompanyMembership, CompanyProjectAssignment, CompanyProjectMember } from "@/types";

export default function ProjectAssignments({
  companyProjectId, workItemId, assignments, members, directory, membership,
  canManage, canManageMembers, directoryError, directoryLoading, onRetryDirectory, onManageMembers, onMutationStart,
}: {
  companyProjectId: number;
  workItemId: number;
  assignments: CompanyProjectAssignment[];
  members: CompanyProjectMember[];
  directory: CompanyAdminMember[];
  membership: CompanyMembership;
  canManage: boolean;
  canManageMembers: boolean;
  directoryError?: unknown;
  directoryLoading: boolean;
  onRetryDirectory: () => void;
  onManageMembers?: () => void;
  onMutationStart?: () => () => void;
}) {
  const create = useCreateCompanyProjectAssignment();
  const update = useUpdateManagedCompanyProjectAssignment();
  const [editing, setEditing] = useState<"new" | CompanyProjectAssignment | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [limit, setLimit] = useState(25);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CompanyProjectAssignment | null>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const section = useRef<HTMLElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const pending = create.isPending || update.isPending;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (!canManage) { setEditing(null); setCancelTarget(null); } }, [canManage]);
  const current = assignments.filter((assignment) => assignment.status !== "cancelled");
  const editingId = editing && editing !== "new" ? projectAssignmentId(editing) : undefined;
  const usedIds = new Set(current.filter((assignment) => projectAssignmentId(assignment) !== editingId || editing === "new")
    .map((assignment) => assignment.assignee_company_member_id));
  const candidates = members.filter(activeProjectMember).filter((member) =>
    directory.some((entry) => entry.company_member_id === member.company_member_id && (!entry.status || entry.status === "active")) ||
    member.company_member_id === membership.company_member_id,
  ).filter((member) => [projectMemberName(member, directory, membership), projectMemberDepartment(member, directory, membership)]
    .some((value) => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const selected = members.find((member) => member.company_member_id === selectedMember && activeProjectMember(member));
  const canSelect = selected && !usedIds.has(selected.company_member_id) && candidates.some((member) => member.company_member_id === selected.company_member_id);

  function begin(assignment: "new" | CompanyProjectAssignment) {
    setEditing(assignment);
    setCancelTarget(null);
    setSelectedMember(null);
    setSearch("");
    setLimit(25);
    setError(null);
    setNotice(null);
    requestAnimationFrame(() => searchInput.current?.focus({ preventScroll: true }));
  }

  function restoreFocus() {
    requestAnimationFrame(() => {
      // A late result must not take focus from another task or a dialog.
      if (alive.current && (document.activeElement === document.body || section.current?.contains(document.activeElement)))
        addButton.current?.focus({ preventScroll: true });
    });
  }

  async function save() {
    if (!canManage || !canSelect || pending || lock.current || !editing) return;
    lock.current = true;
    const finishRefresh = onMutationStart?.();
    setError(null);
    setNotice(null);
    try {
      const payload = { assignee_company_member_id: selected.company_member_id, department_id: null };
      if (editing === "new") await create.mutateAsync({ companyProjectId, workItemId, payload });
      else if (editingId) await update.mutateAsync({ companyProjectId, workItemId, assignmentId: editingId, payload });
      else throw new Error("배정 정보를 새로고침해 주세요.");
      if (alive.current) {
        setEditing(null);
        setNotice("담당자 배정을 반영했습니다.");
        restoreFocus();
      }
    } catch (failure) {
      if (alive.current) setError(getErrorMessage(failure, "담당자를 배정하지 못했습니다."));
    } finally { lock.current = false; finishRefresh?.(); }
  }

  async function cancelAssignment() {
    const assignmentId = cancelTarget && projectAssignmentId(cancelTarget);
    if (!canManage || !assignmentId || pending || lock.current) return;
    lock.current = true;
    const finishRefresh = onMutationStart?.();
    setError(null);
    setNotice(null);
    try {
      await update.mutateAsync({ companyProjectId, workItemId, assignmentId, payload: { status: "cancelled" } });
      if (alive.current) {
        setCancelTarget(null);
        setNotice("담당자 배정을 해제했습니다.");
        restoreFocus();
      }
    } catch (failure) {
      if (alive.current) setError(getErrorMessage(failure, "배정을 해제하지 못했습니다."));
    } finally { lock.current = false; finishRefresh?.(); }
  }

  return <section aria-label="업무 담당자" ref={section} aria-busy={pending}>
    <div className="work-panel-section-heading">
      <h4>담당자</h4>
      {canManage && <Button ref={addButton} variant="ghost" size="sm" disabled={pending} onClick={() => begin("new")}>담당자 추가</Button>}
    </div>
    {current.length ? <ul className="work-assignment-list">
      {current.map((assignment, index) => {
        const company_member_id = assignment.assignee_company_member_id;
        const name = typeof company_member_id === "number" ? projectMemberName({ company_member_id }, directory, membership) : "담당자 정보 없음";
        const role = { owner: "책임자", assignee: "담당자", reviewer: "검토자", watcher: "참관자" }[assignment.role ?? "assignee"];
        return <li key={projectAssignmentId(assignment) ?? index}>
          <div className="work-assignment-person">
            <Avatar className="h-8 w-8" aria-hidden="true"><AvatarFallback>{company_member_id === 0 ? "·" : name.slice(0, 1)}</AvatarFallback></Avatar>
            <div><span>{name}</span><small>{role}</small></div>
          </div>
          {canManage && projectAssignmentId(assignment) && <div className="work-assignment-actions">
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => begin(assignment)}>담당자 변경</Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setCancelTarget(assignment); setEditing(null); setError(null); }}>배정 해제</Button>
          </div>}
        </li>;
      })}
    </ul> : <p className="work-panel-empty">미배정</p>}
    {notice && <p role="status" className="projects-note">{notice}</p>}
    {error && <p role="alert" className="work-panel-error">{error}</p>}
    {canManage && cancelTarget && <div className="work-assignment-form" role="group" aria-label="배정 해제 확인">
      <p className="projects-note">이 담당자의 배정을 해제할까요? 배정 기록은 유지됩니다.</p>
      <div className="work-assignment-actions">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => { setCancelTarget(null); setError(null); restoreFocus(); }}>취소</Button>
        <Button size="sm" disabled={pending} onClick={() => void cancelAssignment()}>해제 확인</Button>
      </div>
    </div>}
    {canManage && editing && <div className="work-assignment-form" role="group" aria-label="담당자 선택">
      <Input ref={searchInput} aria-label="프로젝트 구성원 검색" placeholder="이름 또는 부서 검색" value={search} disabled={pending}
        onChange={(event) => { setSearch(event.target.value); setLimit(25); }} />
      {directoryLoading && <p role="status" className="projects-note">구성원을 불러오는 중...</p>}
      {Boolean(directoryError) && <div role="alert"><p className="projects-note">회사 구성원 정보를 불러오지 못했습니다.</p>
        <Button size="sm" variant="outline" onClick={onRetryDirectory}>구성원 정보 다시 시도</Button></div>}
      <ul className="work-assignment-candidates" aria-label="프로젝트 구성원 선택">
        {candidates.slice(0, limit).map((member) => <li key={member.company_member_id}>
          <Button variant="ghost" className="work-assignment-candidate" aria-pressed={selectedMember === member.company_member_id}
            disabled={pending || usedIds.has(member.company_member_id)}
            onClick={() => setSelectedMember(member.company_member_id)}>
            <span>{projectMemberName(member, directory, membership)}</span>
            <small>{usedIds.has(member.company_member_id) ? "이미 배정됨" : projectMemberDepartment(member, directory, membership)}</small>
          </Button>
        </li>)}
      </ul>
      {!directoryLoading && !candidates.length && <p className="work-panel-empty">선택할 프로젝트 구성원이 없습니다.</p>}
      {candidates.length > limit && <Button size="sm" variant="ghost" disabled={pending} onClick={() => setLimit((value) => value + 25)}>더 보기</Button>}
      <p className="projects-note">현재 프로젝트의 활성 구성원 중 선택합니다.</p>
      {canManageMembers && onManageMembers ? <Button variant="link" size="sm" disabled={pending} onClick={onManageMembers}>프로젝트 구성원 관리에서 직원 추가</Button>
        : <p className="projects-note">찾는 직원이 없다면 프로젝트 owner에게 구성원 추가를 요청해 주세요.</p>}
      {editing !== "new" && <p className="projects-note">담당자를 변경해도 배정 상태·진행률·일정은 유지됩니다.</p>}
      <div className="work-assignment-actions">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => { setEditing(null); setError(null); restoreFocus(); }}>취소</Button>
        <Button size="sm" disabled={pending || !canSelect} onClick={() => void save()}>{pending ? "반영 중..." : editing === "new" ? "배정" : "변경 저장"}</Button>
      </div>
    </div>}
  </section>;
}
