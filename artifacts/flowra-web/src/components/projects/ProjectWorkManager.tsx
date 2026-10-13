import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  ListTree,
  Loader2,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomSelect from "@/components/ui/CustomSelect";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatProjectDate,
  isActiveProjectMembership,
} from "@/components/projects/ProjectPresentation";
import {
  WORK_PRIORITY_OPTIONS,
  WORK_STATUS_OPTIONS,
  WorkPriorityBadge,
  WorkProgress,
  WorkStatusBadge,
} from "@/components/projects/ProjectWorkPresentation";
import {
  useCancelCompanyProjectPhase,
  useCancelCompanyProjectWorkItem,
  useCompanyProjectMembers,
} from "@/hooks/useCompanyProjects";
import { useProjectWorkTree } from "@/hooks/useProjectWorkTree";
import ProjectWorkFormDialog, { type ProjectWorkEditTarget } from "./ProjectWorkFormDialog";
import { getErrorMessage } from "@/lib/error";
import {
  getWorkItemAncestorPath,
  getWorkItemDepthInfo,
  MAX_PROJECT_WORK_DEPTH,
  getWorkItemUiDepth,
} from "@/lib/projectWorkTree";
import type {
  CompanyMembership,
  CompanyProjectDetailData,
  CompanyProjectPhase,
  CompanyProjectWorkItem,
} from "@/types";
import "./ProjectWorkManager.css";

type CancelTarget =
  | { kind: "work"; item: CompanyProjectWorkItem }
  | { kind: "phase"; phase: CompanyProjectPhase };

interface WorkSelection {
  id: number;
  title: string;
  path: string;
  ancestorIds: number[];
}

function WorkPanelPortal({
  mobile,
  children,
}: {
  mobile: boolean;
  children: ReactNode;
}) {
  return mobile ? createPortal(children, document.body) : children;
}

export default function ProjectWorkManager({
  detail,
  detailUpdatedAt,
  membership,
  active,
}: {
  detail: CompanyProjectDetailData;
  detailUpdatedAt: number;
  membership: CompanyMembership;
  active: boolean;
}) {
  const project = detail.project;
  const tree = useProjectWorkTree(detail, detailUpdatedAt);
  const permission = useCompanyProjectMembers(project.company_project_id);
  const canManage =
    !permission.isError &&
    isActiveProjectMembership(membership) &&
    membership.company_id === project.company_id &&
    Boolean(
      permission.data?.some(
        (member) =>
          member.company_member_id === membership.company_member_id &&
          (member.role === "owner" || member.role === "manager") &&
          (!member.status || member.status === "active"),
      ),
    );
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  // Retain navigation context through a refresh, never the old item fields.
  const [selection, setSelection] = useState<WorkSelection | null>(null);
  const selectedId = selection?.id ?? null;
  const panelOpen = active && selection !== null;
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectWorkEditTarget | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancelWork = useCancelCompanyProjectWorkItem();
  const cancelPhase = useCancelCompanyProjectPhase();
  const cancelLock = useRef(false);
  const selected =
    !active || selectedId === null ? undefined : tree.byId.get(selectedId);
  const selectionQueries = (selection?.ancestorIds ?? [])
    .map((id) => tree.queryById.get(id))
    .filter((query) => query !== undefined);
  const selectionError = selectionQueries.find((query) => query.isError);
  const selectionLoading = selectionQueries.some((query) => query.isFetching);
  const panelRef = useRef<HTMLElement>(null);
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 700px)").matches,
  );
  const pending = cancelWork.isPending || cancelPhase.isPending;
  const phased = project.phase_mode === "phased";
  const filtering =
    Boolean(search.trim()) ||
    status !== "all" ||
    priority !== "all" ||
    phaseFilter !== "all";
  const sorter = (a: CompanyProjectWorkItem, b: CompanyProjectWorkItem) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
    a.company_project_work_item_id - b.company_project_work_item_id;
  const phases = [...detail.phases].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      a.company_project_phase_id - b.company_project_phase_id,
  );
  const assigneesByWorkId = useMemo(() => {
    const grouped = new Map<number, Set<number>>();
    for (const assignment of tree.assignments) {
      const workId = assignment.company_project_work_item_id;
      const memberId = assignment.assignee_company_member_id;
      if (typeof workId !== "number" || typeof memberId !== "number") continue;
      const members = grouped.get(workId) ?? new Set<number>();
      members.add(memberId);
      grouped.set(workId, members);
    }
    return new Map(
      [...grouped].map(([id, members]) => [
        id,
        [...members].map((memberId) => memberId === 0 ? "담당자 정보 비공개" : `구성원 ${memberId}`).join(", "),
      ]),
    );
  }, [tree.assignments]);
  function displayedPhaseId(item: CompanyProjectWorkItem) {
    return item.company_project_phase_id ?? null;
  }
  function canAddChild(item: CompanyProjectWorkItem) {
    const depth = getWorkItemDepthInfo(tree.graph, item.company_project_work_item_id);
    const workDepth = depth.workItemDepth ?? depth.backendDepthLevel;
    return workDepth !== null && workDepth < MAX_PROJECT_WORK_DEPTH;
  }

  function select(item: CompanyProjectWorkItem) {
    setSelection({
      id: item.company_project_work_item_id,
      title: item.title,
      path: workPath(item),
      ancestorIds: getWorkItemAncestorPath(
        tree.graph,
        item.company_project_work_item_id,
      )
        .slice(0, -1)
        .map((ancestor) => ancestor.company_project_work_item_id),
    });
    tree.loadChildren(item);
  }
  function closePanel() {
    const path = selection
      ? [...selection.ancestorIds, selection.id].reverse()
      : [];
    setSelection(null);
    requestAnimationFrame(() => {
      const target = path
        .map((id) =>
          document.querySelector<HTMLButtonElement>(
            `[data-work-id="${id}"] .work-title-button`,
          ),
        )
        .find((button) => button !== null);
      (
        target ??
        document.querySelector<HTMLInputElement>(
          'input[aria-label="업무 검색"]',
        )
      )?.focus();
    });
  }
  useEffect(() => {
    if (!active) { setSelection(null); setEditTarget(null); }
  }, [active]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!panelOpen) return;
    panelTitleRef.current?.focus();
  }, [selectedId, panelOpen, mobile]);
  useEffect(() => {
    if (!panelOpen) return;
    function escape(event: globalThis.KeyboardEvent) {
      // Nested menus and dialogs consume Escape before the underlying panel.
      const floatingLayer = [
        ...document.querySelectorAll<HTMLElement>(
          "[role='dialog'], [role='menu'], [role='listbox']",
        ),
      ].some(
        (element) =>
          element !== panelRef.current &&
          element.dataset.state !== "closed" &&
          getComputedStyle(element).display !== "none",
      );
      if (floatingLayer) return;
      if (event.key === "Escape" && !event.defaultPrevented && !cancelTarget)
        closePanel();
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [selection, panelOpen, cancelTarget]);
  useEffect(() => {
    if (!panelOpen || !mobile) return;
    const previous = document.body.style.overflow;
    const appRoot = document.getElementById("root");
    const previouslyInert = appRoot?.inert;
    document.body.style.overflow = "hidden";
    if (appRoot) appRoot.inert = true;
    return () => {
      document.body.style.overflow = previous;
      if (appRoot) appRoot.inert = previouslyInert ?? false;
    };
  }, [panelOpen, mobile]);

  const visibleIds = useMemo(() => {
    const included = new Set<number>();
    for (const item of tree.items) {
      if (
        search.trim() &&
        !item.title
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase())
      )
        continue;
      if (status !== "all" && item.status !== status) continue;
      if (priority !== "all" && item.priority !== priority) continue;
      if (
        phased &&
        phaseFilter !== "all" &&
        String(displayedPhaseId(item) ?? "none") !== phaseFilter
      )
        continue;
      let cursor: CompanyProjectWorkItem | undefined = item;
      const visited = new Set<number>();
      while (cursor && !visited.has(cursor.company_project_work_item_id)) {
        visited.add(cursor.company_project_work_item_id);
        included.add(cursor.company_project_work_item_id);
        cursor = cursor.parent_work_item_id
          ? tree.byId.get(cursor.parent_work_item_id)
          : undefined;
      }
    }
    return included;
  }, [tree.items, tree.byId, search, status, priority, phaseFilter, phased]);

  function workPath(item: CompanyProjectWorkItem) {
    const path: string[] = [];
    const visited = new Set<number>([item.company_project_work_item_id]);
    let cursor = item.parent_work_item_id
      ? tree.byId.get(item.parent_work_item_id)
      : undefined;
    while (cursor && !visited.has(cursor.company_project_work_item_id)) {
      visited.add(cursor.company_project_work_item_id);
      path.unshift(cursor.title);
      cursor = cursor.parent_work_item_id
        ? tree.byId.get(cursor.parent_work_item_id)
        : undefined;
    }
    const phase = detail.phases.find(
      (candidate) =>
        candidate.company_project_phase_id === displayedPhaseId(item),
    );
    return [
      project.name,
      ...(phased && phase ? [phase.name] : []),
      ...path,
    ].join(" / ");
  }
  function assignees(item: CompanyProjectWorkItem) {
    // Display only identifiers explicitly returned by the authorized detail API.
    return assigneesByWorkId.get(item.company_project_work_item_id) ?? "—";
  }
  function beginCancel(target: CancelTarget) {
    setCancelError(null);
    setCancelTarget(target);
  }
  async function confirmCancel() {
    if (!cancelTarget || !canManage || cancelLock.current) return;
    cancelLock.current = true;
    setCancelError(null);
    try {
      if (cancelTarget.kind === "work")
        await cancelWork.mutateAsync({
          companyProjectId: project.company_project_id,
          workItemId: cancelTarget.item.company_project_work_item_id,
        });
      else
        await cancelPhase.mutateAsync({
          companyProjectId: project.company_project_id,
          phaseId: cancelTarget.phase.company_project_phase_id,
        });
      setCancelTarget(null);
    } catch (error) {
      setCancelError(
        getErrorMessage(error, "취소 처리하지 못했습니다. 다시 시도해 주세요."),
      );
    } finally {
      cancelLock.current = false;
    }
  }
  function menu(item: CompanyProjectWorkItem) {
    if (!canManage) return null;
    return (
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${item.title} 더 보기`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={12}>
          <DropdownMenuItem disabled={pending || !canAddChild(item)}
            onSelect={() => setEditTarget({ kind: "work", parent: item })}>
            하위 업무 추가
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={() => setEditTarget({ kind: "work", item })}>
            업무 수정
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={pending || item.status === "cancelled"}
            onSelect={() => beginCancel({ kind: "work", item })}
          >
            업무 취소
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  function rowKeyboard(
    event: KeyboardEvent<HTMLTableRowElement>,
    item: CompanyProjectWorkItem,
  ) {
    if (event.target !== event.currentTarget) return;
    const id = item.company_project_work_item_id;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(item);
    } else if (
      event.key === "ArrowRight" &&
      tree.hasChildren(item) &&
      !tree.expanded.has(id)
    ) {
      event.preventDefault();
      tree.toggle(item);
    } else if (event.key === "ArrowLeft" && tree.expanded.has(id)) {
      event.preventDefault();
      tree.toggle(item);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const rows = [
        ...event.currentTarget
          .closest("table")!
          .querySelectorAll<HTMLTableRowElement>("tr[data-work-id]"),
      ];
      rows[
        rows.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)
      ]?.focus();
    }
  }
  const visited = new Set<number>();
  function renderRows(
    item: CompanyProjectWorkItem,
    level: number,
  ): React.ReactNode[] {
    const id = item.company_project_work_item_id;
    if (visited.has(id) || !visibleIds.has(id)) return [];
    visited.add(id);
    const branch = tree.hasChildren(item);
    const open = tree.expanded.has(id) || filtering;
    const query = tree.queryById.get(id);
    const rows: React.ReactNode[] = [
      <tr
        key={`work:${id}`}
        data-work-id={id}
        tabIndex={0}
        aria-selected={selectedId === id}
        aria-level={level + 1}
        aria-expanded={branch ? open : undefined}
        onClick={() => select(item)}
        onKeyDown={(event) => rowKeyboard(event, item)}
        className={selectedId === id ? "work-row-selected" : ""}
      >
        <td>
          <div
            className="work-name"
            style={{ paddingLeft: Math.min(level, 8) * 18 }}
          >
            {branch ? (
              <Button
                variant="ghost"
                size="icon"
                className="work-expand"
                aria-label={`${item.title} 하위 업무 ${open ? "접기" : "펼치기"}`}
                aria-expanded={open}
                disabled={filtering}
                onClick={(event) => {
                  event.stopPropagation();
                  tree.toggle(item);
                }}
              >
                {query?.isFetching ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : open ? (
                  <ChevronDown aria-hidden="true" />
                ) : (
                  <ChevronRight aria-hidden="true" />
                )}
              </Button>
            ) : (
              <span className="work-expand-spacer" />
            )}
            <button
              className="work-title-button"
              title={item.title}
              onClick={(event) => {
                event.stopPropagation();
                select(item);
              }}
            >
              {item.title}
            </button>
          </div>
        </td>
        <td>
          <WorkStatusBadge status={item.status} />
        </td>
        <td>
          <WorkPriorityBadge priority={item.priority} />
        </td>
        <td className="work-assignees" title={assignees(item)}>
          {assignees(item)}
        </td>
        <td className="work-dates">
          {formatProjectDate(item.planned_start_date)}
          <br />
          <span>~ {formatProjectDate(item.planned_end_date)}</span>
        </td>
        <td>
          <WorkProgress item={item} compact />
        </td>
        <td onClick={(event) => event.stopPropagation()}>{menu(item)}</td>
      </tr>,
    ];
    if (open && query?.isError)
      rows.push(
        <tr key={`error:${id}`}>
          <td colSpan={7}>
            <div role="alert" className="work-child-feedback">
              {getErrorMessage(query.error, "하위 업무를 불러오지 못했습니다.")}{" "}
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching}
                onClick={() => tree.loadChildren(item)}
              >
                하위 업무 다시 시도
              </Button>
            </div>
          </td>
        </tr>,
      );
    if (open && query?.isFetching && !query.data)
      rows.push(
        <tr key={`loading:${id}`}>
          <td colSpan={7}>
            <p role="status" className="work-child-feedback">
              하위 업무를 불러오는 중...
            </p>
          </td>
        </tr>,
      );
    if (open)
      for (const child of [...(tree.children.get(id) ?? [])].sort(sorter))
        rows.push(...renderRows(child, level + 1));
    return rows;
  }
  const roots = tree.graph.rootIds.map((id) => tree.byId.get(id)!).sort(sorter);
  const tableRows: React.ReactNode[] = [];
  const groups: Array<{
    phase?: CompanyProjectPhase;
    roots: CompanyProjectWorkItem[];
  }> = phased
    ? [
        ...phases.map((phase) => ({
          phase,
          roots: roots.filter(
            (item) =>
              item.company_project_phase_id === phase.company_project_phase_id,
          ),
        })),
        {
          roots: roots.filter(
            (item) =>
              !phases.some(
                (phase) =>
                  phase.company_project_phase_id ===
                  item.company_project_phase_id,
              ),
          ),
        },
      ]
    : [{ roots }];
  for (const group of groups) {
    if (
      filtering &&
      !group.roots.some((item) =>
        visibleIds.has(item.company_project_work_item_id),
      )
    )
      continue;
    if (phased && (group.phase || group.roots.length))
      tableRows.push(
        <tr
          className="work-phase-row"
          key={`phase:${group.phase?.company_project_phase_id ?? "none"}`}
        >
          <td colSpan={7}>
            <div>
              <span>{group.phase?.name ?? "단계 미지정"}</span>
              {group.phase && typeof group.phase.status === "string" && (
                <WorkStatusBadge status={group.phase.status} />
              )}
              {group.phase && canManage && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${group.phase.name} 더 보기`}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" collisionPadding={12}>
                    <DropdownMenuItem
                      disabled={pending}
                      onSelect={() => setEditTarget({ kind: "phase", phase: group.phase! })}
                    >
                      단계 수정
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={pending || group.phase.status === "cancelled"}
                      onSelect={() =>
                        beginCancel({ kind: "phase", phase: group.phase! })
                      }
                    >
                      단계 취소
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </td>
        </tr>,
      );
    for (const root of group.roots) tableRows.push(...renderRows(root, 0));
  }

  function trapMobileFocus(event: KeyboardEvent<HTMLElement>) {
    if (!mobile || event.key !== "Tab" || event.defaultPrevented) return;
    const controls = [
      ...panelRef.current!.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), [tabindex='0']",
      ),
    ];
    const first = controls[0],
      last = controls.at(-1);
    if (!first || !last) return;
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === panelTitleRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <div className={`project-work-layout ${panelOpen ? "has-work-panel" : ""}`}>
      <section
        className="project-work-list flowra-surface"
        aria-label="프로젝트 업무 목록"
      >
        <div className="work-heading">
          <div>
            <h3>업무 목록</h3>
            <p>
              {tree.items.length > 0
                ? `불러온 업무 ${tree.items.length}개`
                : "표시할 업무가 없습니다."}
            </p>
          </div>
          {canManage && (
            <div className="work-add-actions">
              {phased && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => setEditTarget({ kind: "phase" })}
                >
                  단계 추가
                </Button>
              )}
              <Button
                disabled={pending}
                onClick={() => setEditTarget({ kind: "work" })}
              >
                업무 추가
              </Button>
            </div>
          )}
        </div>
        <div className="work-filters">
          <div className="projects-search">
            <Search size={16} aria-hidden="true" />
            <Input
              aria-label="업무 검색"
              placeholder="업무명 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <CustomSelect
            ariaLabel="업무 상태"
            value={status}
            onChange={(value) => setStatus(String(value))}
            options={[
              { value: "all", label: "전체 상태" },
              ...WORK_STATUS_OPTIONS,
            ]}
          />
          <CustomSelect
            ariaLabel="업무 우선순위"
            value={priority}
            onChange={(value) => setPriority(String(value))}
            options={[
              { value: "all", label: "전체 우선순위" },
              ...WORK_PRIORITY_OPTIONS,
            ]}
          />
          {phased && (
            <CustomSelect
              ariaLabel="Phase 선택"
              value={phaseFilter}
              onChange={(value) => setPhaseFilter(String(value))}
              options={[
                { value: "all", label: "전체 단계" },
                ...phases.map((phase) => ({
                  value: String(phase.company_project_phase_id),
                  label: phase.name,
                })),
                { value: "none", label: "단계 미지정" },
              ]}
            />
          )}
        </div>
        <div className="work-tree-toolbar">
          <p>
            {tree.mayBePartial ? "현재 불러온 업무에서 검색합니다. 하위 업무는 펼칠 때 불러옵니다." : "전체 업무에서 검색합니다."}
            {filtering && " 검색 결과의 상위 업무도 함께 표시합니다."}
          </p>
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={tree.expandLoaded}
              disabled={filtering}
            >
              전체 펼치기
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={tree.collapseAll}
              disabled={filtering}
            >
              전체 접기
            </Button>
          </div>
        </div>
        <div className="work-table-scroll">
          <table
            className="work-tree-table"
            role="treegrid"
            aria-label="계층형 업무"
            aria-multiselectable="false"
          >
            <thead>
              <tr>
                <th>업무명</th>
                <th>상태</th>
                <th>우선순위</th>
                <th>담당자</th>
                <th>계획 기간</th>
                <th>진행률</th>
                <th>
                  <span className="sr-only">더 보기</span>
                </th>
              </tr>
            </thead>
            <tbody>{tableRows}</tbody>
          </table>
        </div>
        {tree.items.length === 0 ? (
          <div className="work-empty">
            <ListTree aria-hidden="true" />
            <p>등록된 업무가 없습니다.</p>
          </div>
        ) : (
          visited.size === 0 && (
            <div className="work-empty">
              <p>검색 조건에 맞는 업무가 없습니다.</p>
            </div>
          )
        )}
      </section>
      {panelOpen && (
        <WorkPanelPortal mobile={mobile}>
          <aside
            ref={panelRef}
            className="project-work-panel flowra-surface"
            aria-label="업무 상세"
            role={mobile ? "dialog" : "complementary"}
            aria-modal={mobile ? true : undefined}
            onKeyDown={trapMobileFocus}
          >
            <div className="work-panel-header">
              <p title={selected ? workPath(selected) : selection?.path}>
                {selected ? workPath(selected) : selection?.path}
              </p>
              <Button
                variant="ghost"
                size="icon"
                aria-label="업무 상세 닫기"
                onClick={closePanel}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
            <div className="work-panel-content">
              <h3 ref={panelTitleRef} tabIndex={-1}>
                {selected?.title ?? selection?.title}
              </h3>
              {selected ? (
                <>
                  <div className="work-panel-badges">
                    <WorkStatusBadge status={selected.status} />
                    <WorkPriorityBadge priority={selected.priority} />
                    {getWorkItemUiDepth(
                      tree.graph,
                      selected.company_project_work_item_id,
                    ) !== null && (
                      <span
                        className="projects-note"
                        title="프로젝트를 포함한 업무 계층이며, Phase는 깊이에 포함하지 않습니다."
                      >
                        D
                        {getWorkItemUiDepth(
                          tree.graph,
                          selected.company_project_work_item_id,
                        )}
                      </span>
                    )}
                    {menu(selected)}
                  </div>
                  <section aria-label="업무 기본 정보">
                    <h4>기본 정보</h4>
                    <p className="work-description">
                      {selected.description || "등록된 설명이 없습니다."}
                    </p>
                    <dl className="work-panel-fields">
                      <div>
                        <dt>계획 시작일</dt>
                        <dd>
                          {formatProjectDate(selected.planned_start_date)}
                        </dd>
                      </div>
                      <div>
                        <dt>계획 종료일</dt>
                        <dd>{formatProjectDate(selected.planned_end_date)}</dd>
                      </div>
                      {phased && <div><dt>단계</dt><dd>{phases.find((phase) => phase.company_project_phase_id === selected.company_project_phase_id)?.name ?? "단계 미지정"}</dd></div>}
                      <div>
                        <dt>진행률</dt>
                        <dd>
                          <WorkProgress item={selected} />
                        </dd>
                      </div>
                      {assignees(selected) !== "—" && (
                        <div>
                          <dt>담당자</dt>
                          <dd>{assignees(selected)}</dd>
                        </div>
                      )}
                      {selected.wbs_code && (
                        <div>
                          <dt>WBS 코드</dt>
                          <dd>{selected.wbs_code}</dd>
                        </div>
                      )}
                    </dl>
                  </section>
                  <section aria-label="하위 업무">
                    <div className="work-panel-section-heading">
                      <h4>하위 업무</h4>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending || !canAddChild(selected)}
                          title={!canAddChild(selected) ? "업무는 최대 5단계까지 추가할 수 있습니다." : undefined}
                          onClick={() => setEditTarget({ kind: "work", parent: selected })}
                        >
                          하위 업무 추가
                        </Button>
                      )}
                    </div>
                    {tree.queryById.get(selectedId!)?.isFetching && (
                      <p role="status" className="projects-note">
                        하위 업무를 불러오는 중...
                      </p>
                    )}
                    {tree.queryById.get(selectedId!)?.isError && (
                      <div role="alert" className="work-panel-error">
                        <p>
                          {getErrorMessage(
                            tree.queryById.get(selectedId!)!.error,
                            "하위 업무를 불러오지 못했습니다.",
                          )}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => tree.loadChildren(selected)}
                        >
                          하위 업무 다시 시도
                        </Button>
                      </div>
                    )}
                    <ul className="work-panel-children">
                      {[...(tree.children.get(selectedId!) ?? [])]
                        .sort(sorter)
                        .map((child) => (
                          <li key={child.company_project_work_item_id}>
                            <button
                              title={child.title}
                              onClick={() => select(child)}
                            >
                              <span>{child.title}</span>
                              <WorkStatusBadge status={child.status} />
                            </button>
                          </li>
                        ))}
                    </ul>
                    {!tree.children.get(selectedId!)?.length &&
                      !tree.hasChildren(selected) && (
                        <p className="projects-note">하위 업무가 없습니다.</p>
                      )}
                    {tree.needsChildren(selected) &&
                      !tree.queryById.get(selectedId!)?.isFetching &&
                      !tree.queryById.get(selectedId!)?.isError && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => tree.loadChildren(selected)}
                        >
                          하위 업무 불러오기
                        </Button>
                      )}
                  </section>
                  {tree.dependencies.some(
                    (dependency) =>
                      dependency.predecessor_work_item_id === selectedId ||
                      dependency.successor_work_item_id === selectedId,
                  ) && (
                    <section>
                      <h4>연결된 업무</h4>
                      <ul className="work-dependencies">
                        {tree.dependencies
                          .filter(
                            (dependency) =>
                              dependency.predecessor_work_item_id ===
                                selectedId ||
                              dependency.successor_work_item_id === selectedId,
                          )
                          .map((dependency) => {
                            const predecessor =
                              dependency.successor_work_item_id === selectedId;
                            const otherId = predecessor
                              ? dependency.predecessor_work_item_id
                              : dependency.successor_work_item_id;
                            return (
                              <li
                                key={
                                  dependency.company_project_work_dependency_id
                                }
                              >
                                {predecessor ? "선행" : "후행"}:{" "}
                                {tree.byId.get(otherId)?.title ??
                                  `업무 ${otherId}`}
                              </li>
                            );
                          })}
                      </ul>
                    </section>
                  )}
                </>
              ) : selectionError ? (
                <div role="alert" className="work-panel-error">
                  <p>
                    {getErrorMessage(
                      selectionError.error,
                      "선택한 업무를 다시 불러오지 못했습니다.",
                    )}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectionLoading}
                    onClick={() => {
                      void selectionError.refetch().then((result) => {
                        if (!result.isSuccess) return;
                        requestAnimationFrame(() => {
                          // The retry control disappears after recovery. Keep
                          // keyboard focus in the panel if it fell back to body.
                          if (document.activeElement === document.body)
                            panelTitleRef.current?.focus();
                        });
                      });
                    }}
                  >
                    {selectionLoading
                      ? "불러오는 중..."
                      : "하위 업무 다시 시도"}
                  </Button>
                </div>
              ) : (
                <p role="status" className="projects-note">
                  {selectionLoading
                    ? "선택한 업무를 다시 불러오는 중..."
                    : "선택한 업무를 현재 조회 결과에서 찾을 수 없습니다."}
                </p>
              )}
            </div>
          </aside>
        </WorkPanelPortal>
      )}
      {editTarget && active && canManage && <ProjectWorkFormDialog
        key={editTarget.kind === "phase" ? `phase:${editTarget.phase?.company_project_phase_id ?? "new"}` : `work:${editTarget.item?.company_project_work_item_id ?? `new:${editTarget.parent?.company_project_work_item_id ?? "root"}`}`}
        target={editTarget} detail={detail} items={tree.items} canManage={canManage}
        onClose={() => setEditTarget(null)} onSaved={() => setEditTarget(null)} />}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending && !cancelLock.current) setCancelTarget(null);
        }}
      >
        <DialogContent
          className="work-cancel-dialog border-border bg-background text-foreground [&>button]:text-muted-foreground"
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {cancelTarget?.kind === "phase" ? "단계 취소" : "업무 취소"}
            </DialogTitle>
            <DialogDescription>
              “
              {cancelTarget?.kind === "phase"
                ? cancelTarget.phase.name
                : cancelTarget?.item.title}
              ”을 취소 상태로 변경합니다. 데이터는 영구 삭제되지 않습니다.
              {cancelTarget?.kind === "phase"
                ? " 소속 업무와 담당자 배정은 유지됩니다."
                : " 모든 하위 업무와 담당자 배정, 예약 알림도 취소하고 연결된 업무 의존성을 해제합니다."}
            </DialogDescription>
          </DialogHeader>
          {cancelError && (
            <p role="alert" className="work-panel-error">
              {cancelError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setCancelTarget(null)}
            >
              돌아가기
            </Button>
            <Button
              disabled={pending || !canManage}
              onClick={() => void confirmCancel()}
            >
              {pending ? "처리 중..." : "취소 처리"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
