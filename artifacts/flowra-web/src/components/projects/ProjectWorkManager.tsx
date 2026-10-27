import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FileCheck2,
  ListTree,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CustomSelect from "@/components/ui/CustomSelect";
import { FloatingPanelPortalProvider } from "@/components/ui/FloatingPanelPortal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  WorkAssignees,
  WorkAssigneeDetails,
  WorkPriorityBadge,
  WorkProgress,
  WorkStatusBadge,
} from "@/components/projects/ProjectWorkPresentation";
import {
  useCancelCompanyProjectPhase,
  useCancelCompanyProjectWorkItem,
  useCompanyProjectMembers,
  useCompanyProjectDirectory,
} from "@/hooks/useCompanyProjects";
import { useProjectWorkTree } from "@/hooks/useProjectWorkTree";
import ProjectWorkFormDialog, { type ProjectWorkEditTarget } from "./ProjectWorkFormDialog";
import ProjectAssignments from "./ProjectAssignments";
import ProjectGantt from "./ProjectGantt";
import { activeProjectMember, matchesProjectAssigneeFilter, projectAssigneeSummary, projectMemberName } from "@/lib/projectMembers";
import { getErrorMessage, isTransientApiReadError } from "@/lib/error";
import { projectHierarchyTitle, workKey, type ProjectHierarchyKey } from "@/lib/projectHierarchy";
import {
  compareWorkItems,
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
import { aggregateProjectDelays } from "@/lib/projectSchedule";
import { ProjectScheduleLabel, useProjectToday } from "./ProjectSchedulePresentation";

type CancelTarget =
  | { kind: "work"; item: CompanyProjectWorkItem }
  | { kind: "phase"; phase: CompanyProjectPhase };

interface WorkSelection {
  id: number;
  title: string;
  path: string;
  ancestorIds: number[];
  source?: "gantt";
}

type WorkPanelMode = "docked" | "overlay" | "fullscreen";
type GanttPanelPreference = "auto" | "docked" | "overlay";
const panelWidth = 380;
const ganttPanelOptions = [
  { value: "auto", label: "자동" },
  { value: "docked", label: "도킹" },
  { value: "overlay", label: "오버레이" },
] as const;

function WorkPanelPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}

function canFocus(element: HTMLElement | null | undefined): element is HTMLElement {
  if (!element?.isConnected || element.closest('[inert], [hidden], [aria-hidden="true"]') ||
    element.matches(':disabled') || !element.getClientRects().length) return false;
  const style = getComputedStyle(element);
  return style.visibility === "visible" && style.display !== "none";
}

export default function ProjectWorkManager({
  detail,
  detailUpdatedAt,
  membership,
  active,
  view = "work",
  onPanelLayoutChange,
  onManageMembers,
}: {
  detail: CompanyProjectDetailData;
  detailUpdatedAt: number;
  membership: CompanyMembership;
  active: boolean;
  view?: "work" | "gantt";
  onPanelLayoutChange?: (layout: { overlay: boolean; docked: boolean; width: number; right: number }) => void;
  onManageMembers?: () => void;
}) {
  const project = detail.project;
  const tree = useProjectWorkTree(detail, detailUpdatedAt);
  const today = useProjectToday();
  const delays = aggregateProjectDelays(tree.graph, today);
  const delaysPartial = tree.searchScope !== "complete";
  const permission = useCompanyProjectMembers(project.company_project_id);
  const transientPermissionError = permission.isError && isTransientApiReadError(permission.error);
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
  const canManageMembers = canManage && Boolean(permission.data?.some((member) =>
    member.company_member_id === membership.company_member_id && member.role === "owner" && activeProjectMember(member)));
  const directoryQuery = useCompanyProjectDirectory(project.company_id, { enabled: canManage });
  const directory = directoryQuery.isError || !canManage ? [] : directoryQuery.data ?? [];
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [collapsedPhases, setCollapsedPhases] = useState<Set<ProjectHierarchyKey>>(() => new Set());
  // Retain navigation context through a refresh, never the old item fields.
  const [selection, setSelection] = useState<WorkSelection | null>(null);
  const [ganttItems, setGanttItems] = useState<readonly CompanyProjectWorkItem[]>([]);
  const [selectionRetryError, setSelectionRetryError] = useState<string | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [assigneeFocusRequest, setAssigneeFocusRequest] = useState<number | null>(null);
  const [assignmentWorkId, setAssignmentWorkId] = useState<number | null>(null);
  const assignmentReturnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<ProjectHierarchyKey | null>(null);
  const selectedId = selection?.id ?? null;
  const panelOpen = active && panelVisible && selection !== null;
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
  const preview = selected ?? (selection?.source === "gantt"
    ? ganttItems.find((item) => item.company_project_work_item_id === selectedId) : undefined);
  const selectionReady = Boolean(selected && (selection?.source !== "gantt" ||
    (tree.assignmentKnownIds.has(selectedId!) && !selectionLoading &&
      getWorkItemDepthInfo(tree.graph, selectedId!).ancestryComplete)));
  const selectedChildrenLoading = Boolean(selectedId !== null && tree.queryById.get(selectedId)?.isFetching);
  const panelRef = useRef<HTMLElement>(null);
  const [panelElement, setPanelElement] = useState<HTMLElement | null>(null);
  const registerPanel = useCallback((element: HTMLElement | null) => {
    panelRef.current = element;
    setPanelElement(element);
  }, []);
  const panelTitleRef = useRef<HTMLHeadingElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const [assignmentRefresh, setAssignmentRefresh] = useState<{ id: number; scroll: number; restoreFocus: boolean; complete: boolean } | null>(null);
  function beginAssignmentRefresh() {
    const snapshot = { id: selectedId!, scroll: panelContentRef.current?.scrollTop ?? 0,
      restoreFocus: Boolean(panelRef.current?.contains(document.activeElement)), complete: false };
    setAssignmentRefresh(snapshot);
    return () => {
      if (panelRef.current?.isConnected)
        setAssignmentRefresh((current) => current === snapshot ? { ...snapshot, complete: true } : current);
    };
  }
  useLayoutEffect(() => {
    if (!assignmentRefresh) return;
    if (assignmentRefresh.id !== selectedId || !active) { setAssignmentRefresh(null); return; }
    if (!assignmentRefresh.complete || !selected || selectionLoading || selectedChildrenLoading) return;
    if (panelContentRef.current) panelContentRef.current.scrollTop = assignmentRefresh.scroll;
    if (assignmentRefresh.restoreFocus && (document.activeElement === document.body || panelRef.current?.contains(document.activeElement)))
      (panelRef.current?.querySelector<HTMLButtonElement>('[aria-label="업무 담당자"] button') ?? panelTitleRef.current)?.focus({ preventScroll: true });
    setAssignmentRefresh(null);
  }, [assignmentRefresh, selectedId, selected, selectionLoading, selectedChildrenLoading, active]);
  const editorReturnFocusRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listScrollPosition = useRef({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (active && view === "work" && listScrollRef.current) {
      listScrollRef.current.scrollTop = listScrollPosition.current.top;
      listScrollRef.current.scrollLeft = listScrollPosition.current.left;
    }
  }, [active, view]);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterDoneRef = useRef<HTMLButtonElement>(null);
  const [panelMode, setPanelMode] = useState<WorkPanelMode>("fullscreen");
  const [ganttPanelPreference, setGanttPanelPreference] = useState<GanttPanelPreference>("auto");
  const [ganttWbsWidth, setGanttWbsWidth] = useState(340);
  const [overlayPosition, setOverlayPosition] = useState({ top: 80, right: 16 });
  const [ganttViewport, setGanttViewport] = useState({ width: window.innerWidth, height: window.innerHeight, top: 0, left: 0 });
  const fullscreenPanel = panelMode === "fullscreen";
  const panelDocked = panelMode === "docked";
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 700px)").matches,
  );
  const pending = cancelWork.isPending || cancelPhase.isPending;
  const phased = project.phase_mode === "phased";
  const filtering =
    Boolean(search.trim()) ||
    status !== "all" ||
    priority !== "all" ||
    phaseFilter !== "all" || assigneeFilter !== "all" || unassignedOnly;
  const phases = tree.hierarchy.phases;
  const filterCount = Number(status !== "all") + Number(priority !== "all") +
    Number(phased && phaseFilter !== "all") + Number(assigneeFilter !== "all") + Number(unassignedOnly);
  function restoreFilterFocus() {
    requestAnimationFrame(() => {
      const target = [filterOpen ? filterDoneRef.current : searchRef.current, filterButtonRef.current]
        .find((element) => canFocus(element));
      if (canFocus(target)) target.focus({ preventScroll: true });
    });
  }
  function clearFilter(clear: () => void) {
    clear();
    restoreFilterFocus();
  }
  function resetFilters() {
    setSearch("");
    setStatus("all");
    setPriority("all");
    setPhaseFilter("all");
    setAssigneeFilter("all");
    setUnassignedOnly(false);
    restoreFilterFocus();
  }
  function togglePhase(key: ProjectHierarchyKey) {
    if (filtering) return;
    setCollapsedPhases((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  const assigneesByWorkId = useMemo(() => {
    const grouped = new Map<number, typeof tree.assignments>();
    for (const assignment of tree.assignments) {
      const workId = assignment.company_project_work_item_id;
      if (typeof workId !== "number") continue;
      const assignments = grouped.get(workId) ?? [];
      assignments.push(assignment);
      grouped.set(workId, assignments);
    }
    return grouped;
  }, [tree.assignments]);
  const assigneeOptions = useMemo(() => {
    const ids = new Set([
      ...(permission.isError ? [] : permission.data ?? []).filter(activeProjectMember).map((member) => member.company_member_id),
      ...tree.assignments.filter((assignment) => assignment.status !== "cancelled").map((assignment) => assignment.assignee_company_member_id),
    ].filter((id): id is number => typeof id === "number" && id > 0));
    return [...ids].filter((id) => id === membership.company_member_id || directory.some((member) => member.company_member_id === id))
      .map((id) => ({ value: String(id), label: projectMemberName({ company_member_id: id }, directory, membership) }))
      .sort((a, b) => a.label.localeCompare(b.label, "ko"));
  }, [permission.data, permission.isError, tree.assignments, directory, membership]);
  function displayedPhaseId(item: CompanyProjectWorkItem) {
    return item.company_project_phase_id ?? null;
  }
  function canAddChild(item: CompanyProjectWorkItem) {
    const depth = getWorkItemDepthInfo(tree.graph, item.company_project_work_item_id);
    const workDepth = depth.workItemDepth ?? depth.backendDepthLevel;
    return workDepth !== null && workDepth < MAX_PROJECT_WORK_DEPTH;
  }

  function select(item: CompanyProjectWorkItem, focusAssignees = false) {
    setSelectionRetryError(null);
    // A newly created child may not be included in a summary detail response.
    // Load its parent branch and keep that request in the panel's loading path.
    const unloadedParent = !tree.byId.has(item.company_project_work_item_id) && item.parent_work_item_id
      ? tree.byId.get(item.parent_work_item_id) : undefined;
    const ancestorIds = unloadedParent
      ? getWorkItemAncestorPath(tree.graph, unloadedParent.company_project_work_item_id)
        .map((ancestor) => ancestor.company_project_work_item_id)
      : getWorkItemAncestorPath(tree.graph, item.company_project_work_item_id)
        .slice(0, -1).map((ancestor) => ancestor.company_project_work_item_id);
    if (unloadedParent) tree.loadChildren(unloadedParent);
    setAssigneeFocusRequest(focusAssignees ? item.company_project_work_item_id : null);
    setFilterOpen(false);
    setSelectedPhase(null);
    setPanelVisible(true);
    setSelection({
      id: item.company_project_work_item_id,
      title: item.title,
      path: workPath(item),
      ancestorIds,
    });
    tree.loadChildren(item);
  }
  function selectGantt(item: CompanyProjectWorkItem, sourceItems: readonly CompanyProjectWorkItem[]) {
    setSelectionRetryError(null);
    const byId = new Map(sourceItems.map((source) => [source.company_project_work_item_id, source]));
    const path = [item];
    const seen = new Set([item.company_project_work_item_id]);
    let parentId = item.parent_work_item_id;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = tree.byId.get(parentId) ?? byId.get(parentId);
      if (!parent) break;
      path.unshift(parent);
      parentId = parent.parent_work_item_id;
    }
    setGanttItems(sourceItems);
    setFilterOpen(false);
    setSelectedPhase(null);
    setAssigneeFocusRequest(null);
    setPanelVisible(true);
    setSelection({ id: item.company_project_work_item_id, title: item.title,
      path: [project.name, ...path.slice(0, -1).map((ancestor) => ancestor.title)].join(" / "),
      ancestorIds: path.slice(0, -1).map((ancestor) => ancestor.company_project_work_item_id), source: "gantt" });
  }
  // A Gantt row is only a preview. Hydrate its path from authoritative detail
  // branches, starting with an ancestor already present in the current tree.
  useEffect(() => {
    if (!panelOpen || selection?.source !== "gantt") return;
    const path = [...selection.ancestorIds, selection.id];
    for (let index = 0; index < path.length; index++) {
      const item = tree.byId.get(path[index]);
      if (!item) {
        const parent = index > 0 ? tree.byId.get(path[index - 1]) : undefined;
        if (parent && getWorkItemDepthInfo(tree.graph, path[index - 1]).ancestryComplete &&
          !tree.queryById.has(path[index - 1])) tree.loadChildren(parent, true);
        return;
      }
      if (index === path.length - 1) {
        if (!tree.assignmentKnownIds.has(item.company_project_work_item_id) && item.parent_work_item_id) {
          const parent = tree.byId.get(item.parent_work_item_id);
          if (parent && getWorkItemDepthInfo(tree.graph, parent.company_project_work_item_id).ancestryComplete &&
            !tree.queryById.has(parent.company_project_work_item_id)) tree.loadChildren(parent, true);
        }
        if (getWorkItemDepthInfo(tree.graph, item.company_project_work_item_id).ancestryComplete &&
          tree.needsChildren(item) && !tree.queryById.has(item.company_project_work_item_id)) tree.loadChildren(item);
      }
    }
  });
  function closePanel() {
    const path = selection
      ? [...selection.ancestorIds, selection.id].reverse()
      : [];
    setPanelVisible(false);
    requestAnimationFrame(() => {
      const currentView = workspaceRef.current?.querySelector<HTMLElement>(view === "gantt" ? '#project-gantt-panel' : '#project-work-panel');
      const target = path
        .flatMap((id) => [...(currentView?.querySelectorAll<HTMLButtonElement>(
          `[data-work-id="${id}"] .work-title-button`,
        ) ?? [])])
        .find((button) => canFocus(button ?? null));
      const currentSearch = view === "gantt" ? currentView?.querySelector<HTMLInputElement>('[data-gantt-search]') : searchRef.current;
      const fallback = canFocus(currentSearch) ? currentSearch : null;
      (target ?? fallback)?.focus({ preventScroll: true });
    });
  }
  function focusGantt() {
    const search = workspaceRef.current?.querySelector<HTMLInputElement>('[data-gantt-search]');
    if (canFocus(search)) search.focus({ preventScroll: true });
  }
  function openEditor(target: ProjectWorkEditTarget) {
    const focused = document.activeElement;
    // Menu items are removed when the menu closes; retain their trigger instead.
    if (focused instanceof HTMLElement && !focused.closest('[role="menu"]'))
      editorReturnFocusRef.current = focused;
    setEditTarget(target);
  }
  function restoreEditorFocus(event: Event) {
    event.preventDefault();
    requestAnimationFrame(() => {
      const target = [editorReturnFocusRef.current, panelOpen ? panelTitleRef.current : null, searchRef.current]
        .find((element) => canFocus(element));
      target?.focus({ preventScroll: true });
    });
  }
  useEffect(() => {
    if (!active) {
      setSelection(null);
      setPanelVisible(false);
      setEditTarget(null);
      setFilterOpen(false);
      setAssignmentWorkId(null);
    }
  }, [active]);
  useEffect(() => {
    // An explicit permission denial closes the editor and releases the panel.
    if (!canManage && !transientPermissionError) setEditTarget(null);
    if (!canManage) setAssignmentWorkId(null);
  }, [canManage, transientPermissionError]);
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace || !active) return;
    // Measure before the parent reserves sidebar space to avoid docking oscillation.
    const boundary = workspace.closest<HTMLElement>(".projects-detail-workspace") ?? workspace;
    let frame = 0;
    function measure() {
      frame = 0;
      const bounds = boundary.getBoundingClientRect();
      if (!bounds.width) return;
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      if (view === "gantt") {
        // DOMRects include CSS zoom; the portal's fixed offsets and WBS widths
        // use layout CSS pixels. Measure their common ancestor's effective scale.
        const measuredScale = boundary.offsetWidth ? bounds.width / boundary.offsetWidth : 1;
        const scale = Math.abs(measuredScale - 1) < 0.001 ? 1 : measuredScale;
        const workBounds = workspaceRef.current?.getBoundingClientRect() ?? bounds;
        const viewportTop = (viewport?.offsetTop ?? 0) / scale;
        const viewportLeft = (viewport?.offsetLeft ?? 0) / scale;
        const viewportWidth = (viewport?.width ?? window.innerWidth) / scale;
        const viewportHeight = height / scale;
        const viewportRight = viewportLeft + viewportWidth;
        const top = Math.max(viewportTop + 16, workBounds.top / scale);
        const right = Math.max(16, window.innerWidth / scale - Math.min(workBounds.right / scale, viewportRight));
        const availableHeight = viewportTop + viewportHeight - top - 16;
        const minimumWidth = ganttWbsWidth + 320 + panelWidth + 16;
        const fullscreen = boundary.clientWidth < 700 || availableHeight < 18 * rem;
        setPanelMode(fullscreen ? "fullscreen" :
          ganttPanelPreference === "overlay" || boundary.clientWidth < minimumWidth ? "overlay" : "docked");
        setOverlayPosition((current) => current.top === top && current.right === right ? current : { top, right });
        setGanttViewport((current) => current.width === viewportWidth && current.height === viewportHeight &&
          current.top === viewportTop && current.left === viewportLeft ? current :
          { width: viewportWidth, height: viewportHeight, top: viewportTop, left: viewportLeft });
      } else {
        const minimumWidth = 20 * rem + panelWidth + 16;
        setPanelMode(bounds.width < minimumWidth || height < 18 * rem ? "fullscreen" : "docked");
      }
    }
    function scheduleMeasure() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(boundary);
    observer.observe(workspace);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("scroll", scheduleMeasure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, [active, view, ganttWbsWidth, ganttPanelPreference]);
  useEffect(() => {
    onPanelLayoutChange?.({ overlay: panelOpen && !fullscreenPanel, docked: panelOpen && panelDocked,
      width: panelWidth, right: panelMode === "overlay" ? overlayPosition.right : 0 });
  }, [panelOpen, fullscreenPanel, panelDocked, panelMode, overlayPosition.right, onPanelLayoutChange]);
  useEffect(() => () => {
    onPanelLayoutChange?.({ overlay: false, docked: false, width: 0, right: 0 });
  }, [onPanelLayoutChange]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!panelOpen || editTarget || cancelTarget) return;
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && canFocus(focused) && panelRef.current?.contains(focused)) return;
    panelTitleRef.current?.focus({ preventScroll: true });
  }, [selectedId, panelOpen, fullscreenPanel, editTarget, cancelTarget]);
  useEffect(() => {
    if (panelOpen && panelContentRef.current) panelContentRef.current.scrollTop = 0;
  }, [selectedId, panelOpen]);
  useEffect(() => {
    if (assigneeFocusRequest === null) return;
    if (panelOpen && selectedId === assigneeFocusRequest) {
      const target = panelRef.current?.querySelector<HTMLElement>('[aria-label="업무 담당자"]');
      const content = panelContentRef.current;
      target?.focus({ preventScroll: true });
      if (target && content) content.scrollTop += target.getBoundingClientRect().top - content.getBoundingClientRect().top;
    }
    setAssigneeFocusRequest(null);
  }, [assigneeFocusRequest, panelOpen, selectedId]);
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
  }, [selection, panelOpen, cancelTarget, view]);
  useLayoutEffect(() => {
    if (!panelOpen || !fullscreenPanel) return;
    setFilterOpen(false);
    const previous = document.body.style.overflow;
    const previousPadding = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const paddingRight = Number.parseFloat(getComputedStyle(document.body).paddingRight) || 0;
    const appRoot = document.getElementById("root");
    const previouslyInert = appRoot?.inert;
    document.body.style.overflow = "hidden";
    // Preserve available width while locking scroll on browsers with classic scrollbars.
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${paddingRight + scrollbarWidth}px`;
    if (appRoot) appRoot.inert = true;
    return () => {
      document.body.style.overflow = previous;
      document.body.style.paddingRight = previousPadding;
      if (appRoot) appRoot.inert = previouslyInert ?? false;
    };
  }, [panelOpen, fullscreenPanel]);

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
      const workId = item.company_project_work_item_id;
      if (!matchesProjectAssigneeFilter(assigneesByWorkId.get(workId) ?? [], tree.assignmentKnownIds.has(workId), assigneeFilter, unassignedOnly)) continue;
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
  }, [tree.items, tree.byId, tree.assignmentKnownIds, assigneesByWorkId, search, status, priority, phaseFilter, phased, assigneeFilter, unassignedOnly]);

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
    const id = item.company_project_work_item_id;
    return projectAssigneeSummary(assigneesByWorkId.get(id) ?? [], directory, membership, tree.assignmentKnownIds.has(id));
  }
  function assigneeDisplay(item: CompanyProjectWorkItem) {
    const id = item.company_project_work_item_id;
    const assignments = assigneesByWorkId.get(id) ?? [];
    const known = tree.assignmentKnownIds.has(id);
    const canManageAssignments = canManage && known;
    return <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="work-assignee-button" aria-label={`${item.title} 담당자 ${canManageAssignments ? "관리" : "확인"}`}
            aria-description={assignees(item)} onClick={(event) => {
              event.stopPropagation();
              if (canManageAssignments) {
                assignmentReturnFocusRef.current = event.currentTarget;
                setAssignmentWorkId(id);
              } else select(item, true);
            }}>
            <WorkAssignees assignments={assignments} directory={directory} membership={membership} known={known} compact />
          </button>
        </TooltipTrigger>
        <TooltipContent className="work-assignee-tooltip" side="bottom" align="start" collisionPadding={12}>
          <WorkAssigneeDetails assignments={assignments} directory={directory} membership={membership} known={known} canManage={canManageAssignments} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>;
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
            onPointerDown={(event) => { editorReturnFocusRef.current = event.currentTarget; }}
            onKeyDown={(event) => { editorReturnFocusRef.current = event.currentTarget; }}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" collisionPadding={12}>
          <DropdownMenuItem disabled={pending || !canAddChild(item)}
            onSelect={() => openEditor({ kind: "work", parent: item })}>
            세부 업무 추가
          </DropdownMenuItem>
          <DropdownMenuItem disabled={pending} onSelect={() => openEditor({ kind: "work", item })}>
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
      !filtering &&
      event.key === "ArrowRight" &&
      tree.hasChildren(item) &&
      !tree.expanded.has(id)
    ) {
      event.preventDefault();
      tree.toggle(item);
    } else if (!filtering && event.key === "ArrowLeft" && tree.expanded.has(id)) {
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
    const number = tree.hierarchy.wbsByKey.get(workKey(id));
    const title = projectHierarchyTitle(item.title, number);
    const prefixLength = number === undefined ? 0 : number.length +
      (title[number.length] === "." ? 2 : 1);
    const directChildrenComplete = tree.completeSiblingSets.has(id);
    const serverChildCount = item.rollup?.child_count;
    const hasServerChildCount = typeof serverChildCount === "number" &&
      Number.isSafeInteger(serverChildCount) && serverChildCount >= 0;
    // A complete direct branch is authoritative even when the rollup cache is stale.
    const childCount = directChildrenComplete
      ? tree.children.get(id)?.length ?? 0
      : hasServerChildCount ? serverChildCount : tree.children.get(id)?.length ?? 0;
    const childCountPartial = !directChildrenComplete && !hasServerChildCount;
    const childCountDescription = childCountPartial
      ? `현재 불러온 직계 세부 업무 ${childCount}개 · 전체 개수는 확인되지 않았습니다.`
      : `직계 세부 업무 ${childCount}개 · ${directChildrenComplete ? "조회 완료" : "서버 집계"} 기준 · 취소 포함`;
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
            style={{ paddingLeft: `calc(${level} * var(--work-indent-step, 22px))` }}
          >
            {level > 0 && <span aria-hidden className="work-tree-connector" style={{ left: `calc((${level} - 0.5) * var(--work-indent-step, 22px))` }} />}
            {branch ? (
              <Button
                variant="ghost"
                size="icon"
                className="work-expand"
                aria-label={`${item.title} 세부 업무 ${open ? "접기" : "펼치기"}`}
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
            <FileCheck2 className="work-kind-icon" aria-hidden="true" />
            <div className="work-name-content">
            <button
              className={`work-title-button${branch ? " work-parent-title" : ""}`}
              aria-label={title}
              title={number === undefined ? `${item.title} (번호 확인 필요)` : title}
              aria-description={number === undefined ? "계층 조회 정보가 부족하여 번호 확인이 필요합니다." : undefined}
              onClick={(event) => {
                event.stopPropagation();
                select(item);
              }}
            >
              {number !== undefined && <span className="work-wbs-number">{title.slice(0, prefixLength)}</span>}
              <span className="work-title-text">{title.slice(prefixLength)}</span>
            </button>
            <div className="work-mobile-status">
              {mobile && <WorkStatusBadge status={item.status} />}
              {assigneeDisplay(item)}
              <ProjectScheduleLabel source={item} today={today} compact />
            </div>
            </div>
            {childCount > 0 && (
              <span className="work-child-count" title={childCountDescription} aria-description={childCountDescription}>
                {childCountPartial ? "조회 " : ""}세부 {childCount}개
              </span>
            )}
          </div>
        </td>
        <td>
          {!mobile && <WorkStatusBadge status={item.status} />}
        </td>
        <td className="work-priority">
          <WorkPriorityBadge priority={item.priority} />
        </td>
        <td className="work-assignees">
          {assigneeDisplay(item)}
        </td>
        <td className="work-dates">
          <span>{item.planned_start_date || item.planned_end_date
            ? `${formatProjectDate(item.planned_start_date)} ~ ${formatProjectDate(item.planned_end_date)}`
            : "미정"}</span>
          <ProjectScheduleLabel source={item} today={today} compact />
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
          <td colSpan={mobile ? 2 : 7}>
            <div role="alert" className="work-child-feedback">
              {getErrorMessage(query.error, "세부 업무를 불러오지 못했습니다.")}{" "}
              <Button
                variant="outline"
                size="sm"
                disabled={query.isFetching}
                onClick={() => tree.loadChildren(item)}
              >
                세부 업무 다시 시도
              </Button>
            </div>
          </td>
        </tr>,
      );
    if (open && query?.isFetching && !query.data)
      rows.push(
        <tr key={`loading:${id}`}>
          <td colSpan={mobile ? 2 : 7}>
            <p role="status" className="work-child-feedback">
              세부 업무를 불러오는 중...
            </p>
          </td>
        </tr>,
      );
    if (open)
      for (const child of tree.children.get(id) ?? [])
        rows.push(...renderRows(child, level + 1));
    return rows;
  }
  const tableRows: React.ReactNode[] = [];
  for (const group of tree.hierarchy.groups) {
    if (
      filtering &&
      !group.rootIds.some((id) => visibleIds.has(id))
    )
      continue;
    const open = !phased || filtering || !collapsedPhases.has(group.key);
    const groupName = group.phase?.name ?? "단계 미지정";
    const groupTitle = projectHierarchyTitle(groupName, tree.hierarchy.wbsByKey.get(group.key));
    const groupNumber = tree.hierarchy.wbsByKey.get(group.key);
    const groupPrefixLength = groupNumber === undefined ? 0 : groupNumber.length +
      (groupTitle[groupNumber.length] === "." ? 2 : 1);
    const descendants = new Set<number>();
    const remaining = [...group.rootIds];
    let complete = !tree.mayBePartial && tree.completeSiblingSets.has(null);
    while (remaining.length) {
      const id = remaining.pop()!;
      if (descendants.has(id)) continue;
      descendants.add(id);
      if (!tree.completeSiblingSets.has(id)) complete = false;
      remaining.push(...(tree.graph.childrenByParent.get(id) ?? []));
    }
    const selectPhase = () => { setSelection(null); setPanelVisible(false); setSelectedPhase(group.key); };
    if (phased && (group.phase || group.rootIds.length))
      tableRows.push(
        <tr
          className={`work-phase-row${selectedPhase === group.key ? " work-row-selected" : ""}`}
          key={group.key}
          data-hierarchy-key={group.key}
          aria-level={1}
          tabIndex={0}
          aria-selected={selectedPhase === group.key}
          aria-expanded={group.rootIds.length ? open : undefined}
          onClick={selectPhase}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectPhase();
            } else if (group.rootIds.length && ((event.key === "ArrowLeft" && open) || (event.key === "ArrowRight" && !open))) {
              event.preventDefault();
              togglePhase(group.key);
            }
          }}
        >
          <td>
            <div className="work-name">
              {group.rootIds.length ? <Button
                variant="ghost"
                size="icon"
                className="work-expand"
                aria-label={`${groupName} ${open ? "접기" : "펼치기"}`}
                aria-expanded={open}
                disabled={filtering}
                onClick={(event) => { event.stopPropagation(); togglePhase(group.key); }}
                onKeyDown={(event) => {
                  if ((event.key === "ArrowLeft" && open) || (event.key === "ArrowRight" && !open)) {
                    event.preventDefault();
                    event.stopPropagation();
                    togglePhase(group.key);
                  }
                }}
              >
                {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
              </Button> : <span className="work-expand-spacer" />}
              <Folder className="work-kind-icon" aria-hidden="true" />
              <div className="work-name-content">
              <button className="work-phase-title" aria-label={groupTitle} title={groupTitle} onClick={(event) => { event.stopPropagation(); selectPhase(); }}>
                {groupNumber !== undefined && <span className="work-wbs-number">{groupTitle.slice(0, groupPrefixLength)}</span>}
                <span className="work-title-text">{groupTitle.slice(groupPrefixLength)}</span>
              </button>
              {group.phase && <div className="work-mobile-status">
                {mobile && typeof group.phase.status === "string" && <WorkStatusBadge status={group.phase.status} />}
                <ProjectScheduleLabel source={group.phase} today={today} compact />
              </div>}
              </div>
              <span className="work-phase-count"
                title={`표시 그룹의 모든 깊이 업무 ${descendants.size}개 · ${complete ? "전체 조회" : "현재 불러온 업무"} 기준 · 취소 포함`}
                aria-description={`표시 그룹의 모든 깊이 업무 ${descendants.size}개 · ${complete ? "전체 조회" : "현재 불러온 업무"} 기준 · 취소 포함`}>
                {complete ? "업무" : "조회"} {descendants.size}개
              </span>
            </div>
          </td>
          <td>
              {!mobile && group.phase && typeof group.phase.status === "string" ? (
                <WorkStatusBadge status={group.phase.status} />
              ) : "—"}
          </td>
          <td className="text-muted-foreground">—</td>
          <td className="text-muted-foreground">—</td>
          <td className="work-dates">
            <span>{group.phase?.planned_start_date || group.phase?.planned_end_date
              ? `${formatProjectDate(group.phase.planned_start_date)} ~ ${formatProjectDate(group.phase.planned_end_date)}`
              : "—"}</span>
            {group.phase && <>
              <ProjectScheduleLabel source={group.phase} today={today} compact />
              {(delays.phases.get(group.phase.company_project_phase_id)?.size ?? 0) > 0 && <span className="project-schedule-label block text-xs text-destructive">
                업무 지연 {delays.phases.get(group.phase.company_project_phase_id)?.size ?? 0}건{delaysPartial ? " (조회 기준)" : ""}
              </span>}
            </>}
          </td>
          <td className="text-muted-foreground">—</td>
          <td onClick={(event) => event.stopPropagation()}>
              {group.phase && canManage && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${group.phase.name} 더 보기`}
                      onPointerDown={(event) => { editorReturnFocusRef.current = event.currentTarget; }}
                      onKeyDown={(event) => { editorReturnFocusRef.current = event.currentTarget; }}
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" collisionPadding={12}>
                    <DropdownMenuItem
                      disabled={pending}
                      onSelect={() => openEditor({ kind: "work", phase: group.phase! })}
                    >
                      업무 추가
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={pending}
                      onSelect={() => openEditor({ kind: "phase", phase: group.phase! })}
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
          </td>
        </tr>,
      );
    if (open)
      for (const id of group.rootIds) tableRows.push(...renderRows(tree.byId.get(id)!, phased ? 1 : 0));
  }

  function panelFocusControls() {
    return [
      ...panelRef.current!.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex='0']",
      ),
    ].filter((control) => canFocus(control) &&
      (!control.closest("details:not([open])") || control.tagName === "SUMMARY"));
  }
  function ganttPreferenceKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!fullscreenPanel || event.key !== "Tab" || !(event.target instanceof Element) ||
      !event.target.closest('[role="listbox"][aria-label="간트 상세 표시 방식"]')) return;
    const trigger = event.currentTarget.querySelector<HTMLButtonElement>('[aria-label="간트 상세 표시 방식"]');
    const controls = panelFocusControls();
    const index = trigger ? controls.indexOf(trigger) : -1;
    const next = index < 0 ? undefined : controls[index + (event.shiftKey ? -1 : 1)];
    // CustomSelect closes its menu on Tab. Continue from its trigger instead of
    // letting the removed portal option reset the dialog's tab order.
    if (next) { event.preventDefault(); next.focus(); }
  }
  function trapPanelFocus(event: KeyboardEvent<HTMLElement>) {
    if (!fullscreenPanel || editTarget || cancelTarget || event.key !== "Tab" || event.defaultPrevented) return;
    const controls = panelFocusControls();
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
    <div ref={workspaceRef} className={`project-work-layout ${panelOpen ? "has-work-panel" : ""}`}>
      <div id="project-work-panel" role="tabpanel" aria-labelledby="project-work-tab" hidden={view !== "work"}>
      <section
        className="project-work-list flowra-surface"
        aria-label="프로젝트 업무 목록"
      >
        <div className="work-heading">
          <div className="work-heading-summary">
            <h3>업무 목록</h3>
            <span className="work-loaded-count">
              {tree.items.length > 0
                ? `불러온 업무 ${tree.items.length}개`
                : "표시할 업무가 없습니다."}
            </span>
            {delays.project.size > 0 && <span aria-label="프로젝트 지연 현황" className="work-delay-summary text-destructive">
              업무 지연 {delays.project.size}건{delaysPartial ? " · 조회된 업무 기준" : " · 전체 업무 기준"}
            </span>}
          </div>
          {canManage && (
            <div className="work-add-actions">
              {phased && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => openEditor({ kind: "phase" })}
                >
                  단계 추가
                </Button>
              )}
              <Button
                disabled={pending}
                onClick={() => openEditor({ kind: "work" })}
              >
                업무 추가
              </Button>
            </div>
          )}
        </div>
        <div className="work-toolbar">
          <div className="work-toolbar-controls">
          <div className="projects-search work-search">
            <Search size={16} aria-hidden="true" />
            <Input
              ref={searchRef}
              aria-label="업무 검색"
              placeholder="업무명 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button ref={filterButtonRef} variant="outline" aria-label="업무 필터"
                aria-description={filterCount > 0 ? `${filterCount}개 조건 적용 중` : "적용된 조건 없음"}>
                <SlidersHorizontal aria-hidden="true" />
                필터{filterCount > 0 && <span className="work-filter-count">{filterCount}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" collisionPadding={12}
              className="work-filter-content" aria-label="업무 필터 조건"
              onInteractOutside={(event) => {
                // CustomSelect uses viewport coordinates in a body portal.
                // Treat its menu as part of this popover's interaction scope.
                const target = event.detail.originalEvent.target;
                if (target instanceof Element && target.closest(".project-work-filter-menu"))
                  event.preventDefault();
              }}
              onEscapeKeyDown={(event) => {
                if (document.querySelector(".project-work-filter-menu[role='listbox']"))
                  event.preventDefault();
              }}>
                <h4>업무 필터</h4>
                <CustomSelect
                  fieldLabel="상태"
                  ariaLabel="업무 상태"
                  value={status}
                  onChange={(value) => setStatus(String(value))}
                  options={[
                    { value: "all", label: "전체 상태" },
                    ...WORK_STATUS_OPTIONS,
                  ]}
                  contentClassName="project-work-select-menu project-work-filter-menu"
                />
                <CustomSelect
                  fieldLabel="우선순위"
                  ariaLabel="업무 우선순위"
                  value={priority}
                  onChange={(value) => setPriority(String(value))}
                  options={[
                    { value: "all", label: "전체 우선순위" },
                    ...WORK_PRIORITY_OPTIONS,
                  ]}
                  contentClassName="project-work-select-menu project-work-filter-menu"
                />
                {phased && (
                  <CustomSelect
                    fieldLabel="연결 단계"
                    ariaLabel="업무 연결 단계"
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
                    contentClassName="project-work-select-menu project-work-filter-menu"
                  />
                )}
                <CustomSelect fieldLabel="담당자" ariaLabel="업무 담당자 필터" value={assigneeFilter}
                  onChange={(value) => setAssigneeFilter(String(value))}
                  options={[{ value: "all", label: "전체 담당자" }, ...assigneeOptions]}
                  contentClassName="project-work-select-menu project-work-filter-menu" />
                <label className="work-unassigned-filter">
                  <input type="checkbox" checked={unassignedOnly} onChange={(event) => setUnassignedOnly(event.target.checked)} />
                  <span>미배정 업무만 보기</span>
                </label>
                <p className="projects-note">담당자 필터는 담당자 정보가 확인된 업무 기준입니다.</p>
                <div className="work-filter-footer">
                  <Button variant="ghost" size="sm" onClick={() => resetFilters()} disabled={!filtering}>
                    초기화
                  </Button>
                  <Button ref={filterDoneRef} size="sm" onClick={() => setFilterOpen(false)}>완료</Button>
                </div>
            </PopoverContent>
          </Popover>
          <div className="work-tree-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setCollapsedPhases(new Set()); tree.expandLoaded(); }}
              disabled={filtering}
            >
              {tree.mayBePartial ? "불러온 업무 펼치기" : "전체 펼치기"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCollapsedPhases(new Set(tree.hierarchy.groups.map((group) => group.key)));
                tree.collapseAll();
              }}
              disabled={filtering}
            >
              전체 접기
            </Button>
          </div>
          </div>
          {filtering && <div className="work-active-filters" aria-label="적용된 검색 및 필터">
            {search.trim() && <Button variant="ghost" size="sm" aria-label="검색 해제" onClick={() => clearFilter(() => setSearch(""))} title={search.trim()}>
              <span>검색: {search.trim()}</span><X aria-hidden="true" />
            </Button>}
            {status !== "all" && <Button variant="ghost" size="sm" aria-label="상태 필터 해제" onClick={() => clearFilter(() => setStatus("all"))}>
              <span>상태: {WORK_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status}</span><X aria-hidden="true" />
            </Button>}
            {priority !== "all" && <Button variant="ghost" size="sm" aria-label="우선순위 필터 해제" onClick={() => clearFilter(() => setPriority("all"))}>
              <span>우선순위: {WORK_PRIORITY_OPTIONS.find((option) => option.value === priority)?.label ?? priority}</span><X aria-hidden="true" />
            </Button>}
            {phased && phaseFilter !== "all" && <Button variant="ghost" size="sm" aria-label="연결 단계 필터 해제" onClick={() => clearFilter(() => setPhaseFilter("all"))}>
              <span>연결 단계: {phases.find((phase) => String(phase.company_project_phase_id) === phaseFilter)?.name ?? "단계 미지정"}</span><X aria-hidden="true" />
            </Button>}
            {assigneeFilter !== "all" && <Button variant="ghost" size="sm" aria-label="담당자 필터 해제" onClick={() => clearFilter(() => setAssigneeFilter("all"))}>
              <span>담당자: {assigneeOptions.find((option) => option.value === assigneeFilter)?.label ?? "담당자 정보 확인 필요"}</span><X aria-hidden="true" />
            </Button>}
            {unassignedOnly && <Button variant="ghost" size="sm" aria-label="미배정 필터 해제" onClick={() => clearFilter(() => setUnassignedOnly(false))}>
              <span>미배정 업무만</span><X aria-hidden="true" />
            </Button>}
            <Button className="work-filter-reset" variant="ghost" size="sm" aria-label="업무 필터 초기화" onClick={() => resetFilters()}>초기화</Button>
          </div>}
        </div>
        <div className="work-tree-toolbar">
          <p>
            {tree.searchScope === "complete" ? "전체 업무 기준" : "불러온 업무 기준"}
            {tree.searchScope === "loaded" && (tree.items.some((item) => tree.needsChildren(item))
              ? " · 일부 업무만 조회됨 · 세부 업무를 펼치면 추가로 불러옵니다."
              : " · 조회 정보가 완전하지 않습니다. 새로고침으로 확인해 주세요.")}
            {tree.searchScope === "invalid" && <span className="text-destructive" role="status">
              {" "}계층 정보에 오류가 있어 상위 경로가 완전하지 않을 수 있습니다.
            </span>}
            {filtering && " · 상위 경로 함께 표시"}
          </p>
        </div>
        <div className="work-table-scroll" ref={listScrollRef} onScroll={(event) => {
          if (active && view === "work") listScrollPosition.current = { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft };
        }}>
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
                <th>예정 기간</th>
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
            <p>{tree.searchScope === "complete" ? "등록된 업무가 없습니다." : "현재 불러온 업무가 없습니다."}</p>
          </div>
        ) : (
          visibleIds.size === 0 && (
            <div className="work-empty">
              <p>{tree.mayBePartial ? "현재 불러온 업무 중 검색 조건에 맞는 업무가 없습니다." : "검색 조건에 맞는 업무가 없습니다."}</p>
              <Button variant="outline" size="sm" onClick={() => resetFilters()}>검색 및 필터 초기화</Button>
            </div>
          )
        )}
      </section>
      </div>
      <div id="project-gantt-panel" role="tabpanel" aria-labelledby="project-gantt-tab" hidden={view !== "gantt"}>
        <ProjectGantt detail={detail} detailUpdatedAt={detailUpdatedAt} active={active && view === "gantt"}
          selectedId={selectedId} onSelect={selectGantt} onItemsChange={setGanttItems}
          onWbsWidthChange={setGanttWbsWidth}
          assignments={tree.assignments} assignmentKnownIds={tree.assignmentKnownIds}
          assigneeOptions={assigneeOptions}
          directory={directory} membership={membership} />
      </div>
      {panelOpen && (
        <WorkPanelPortal>
          <aside
            ref={registerPanel}
            className="project-work-panel flowra-surface"
            data-panel-mode={panelMode}
            style={fullscreenPanel ? view === "gantt" ? {
              top: ganttViewport.top, left: ganttViewport.left, right: "auto", bottom: "auto",
              width: ganttViewport.width, height: ganttViewport.height,
              maxWidth: ganttViewport.width, maxHeight: ganttViewport.height,
            } : undefined : {
              "--work-panel-width": `${panelWidth}px`,
              ...(panelMode === "overlay" ? {
                "--work-panel-top": `${overlayPosition.top}px`,
                "--work-panel-right": `${overlayPosition.right}px`,
              } : {}),
            } as CSSProperties}
            aria-label="업무 상세"
            role={fullscreenPanel ? "dialog" : "complementary"}
            aria-modal={fullscreenPanel ? true : undefined}
            inert={editTarget !== null || cancelTarget !== null}
            onKeyDown={trapPanelFocus}
          >
            <div className="work-panel-header">
              <details className="work-panel-path" key={selectedId}>
                <summary aria-label="업무 전체 경로" title={selected ? workPath(selected) : selection?.path}>
                  <span>{selected ? workPath(selected) : selection?.path}</span>
                  <ChevronDown aria-hidden className="h-3 w-3 shrink-0" />
                </summary>
                <p>{selected ? workPath(selected) : selection?.path}</p>
              </details>
              <div className="work-panel-heading">
                <h3 ref={panelTitleRef} tabIndex={-1} title={preview?.title ?? selection?.title}>
                  {preview?.title ?? selection?.title}
                </h3>
              </div>
              <div className="work-panel-header-actions">
                {selected && selectionReady && canManage && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="업무 수정"
                          title="업무 수정"
                          disabled={pending}
                          onClick={() => openEditor({ kind: "work", item: selected })}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent onEscapeKeyDown={closePanel}>업무 수정</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {selected && selectionReady && menu(selected)}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="업무 상세 닫기"
                  onClick={closePanel}
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
              {view === "gantt" && <div className="work-panel-display-options" onKeyDown={ganttPreferenceKeyDown}>
                <span>표시 방식</span>
                <FloatingPanelPortalProvider value={fullscreenPanel ? panelElement : null}>
                <CustomSelect<GanttPanelPreference>
                  key={fullscreenPanel ? "fullscreen" : "floating"}
                  ariaLabel="간트 상세 표시 방식"
                  value={ganttPanelPreference}
                  options={ganttPanelOptions}
                  onChange={setGanttPanelPreference}
                  className="work-panel-mode-select"
                />
                </FloatingPanelPortalProvider>
                {!fullscreenPanel && <Button variant="ghost" size="sm" aria-label="간트로 이동" onClick={focusGantt}>간트로 이동</Button>}
                <p>{panelMode === "overlay" ? "오버레이 · 배경 간트도 사용할 수 있습니다." :
                  panelMode === "fullscreen" ? "전체 화면 · 공간이 넓어지면 선택한 방식으로 돌아갑니다." : "도킹 · 간트와 상세를 함께 봅니다."}</p>
              </div>}
            </div>
            <div className="work-panel-content" ref={panelContentRef}>
              {preview ? (
                <>
                  <div className="work-panel-badges">
                    <WorkStatusBadge status={preview.status} />
                    <WorkPriorityBadge priority={preview.priority} />
                  </div>
                  <section aria-label="업무 기본 정보">
                    <h4>기본 정보</h4>
                    <dl className="work-panel-fields">
                      <div className="work-panel-field-wide">
                        <dt>예정 기간</dt>
                        <dd>
                          {preview.planned_start_date || preview.planned_end_date
                            ? `${preview.planned_start_date ? formatProjectDate(preview.planned_start_date) : "시작일 미정"} ~ ${preview.planned_end_date ? formatProjectDate(preview.planned_end_date) : "종료일 미정"}`
                            : "미정"}
                        </dd>
                      </div>
                      {phased && <div><dt>단계</dt><dd>{phases.find((phase) => phase.company_project_phase_id === preview.company_project_phase_id)?.name ?? "단계 미지정"}</dd></div>}
                      {(preview.planned_start_date || preview.planned_end_date) && <div><dt>일정 상태</dt><dd><ProjectScheduleLabel source={preview} today={today} /></dd></div>}
                      {Boolean(delays.work.get(preview.company_project_work_item_id)?.size) && <div className="work-panel-delay"><dt>세부 업무 지연</dt><dd>{delays.work.get(preview.company_project_work_item_id)!.size}건{delaysPartial ? " (조회된 업무 기준)" : ""}</dd></div>}
                      <div className="work-panel-field-wide work-panel-progress">
                        <dt className="sr-only">진행률</dt>
                        <dd>
                          <WorkProgress item={preview} label="진행률" />
                        </dd>
                      </div>
                    </dl>
                  </section>
                </>
              ) : null}
              {selection?.source === "gantt" && !selectionReady && <div className="work-panel-error" role="status">
                <p>{selectionLoading ? "상위 경로와 관계 정보를 불러오는 중입니다. 담당자 미조회 · 수정·배정은 확인 후 사용할 수 있습니다."
                  : "관계 정보 미조회: 현재 상세 조회에서 업무와 담당자를 확인하지 못했습니다. 조회 가능한 상위 경로가 필요합니다."}</p>
                {selectionRetryError && <p role="alert">{selectionRetryError}</p>}
                {!selectionLoading && <Button variant="outline" size="sm" onClick={() => {
                  setSelectionRetryError(null);
                  const retry = selectionError ? selectionError.refetch().then((result) => {
                    if (result.isError) throw result.error;
                  }) : tree.refreshAssignments();
                  void retry.catch((error: unknown) => setSelectionRetryError(getErrorMessage(error, "관계 정보를 다시 불러오지 못했습니다.")));
                }}>관계 정보 다시 조회</Button>}
              </div>}
              <ProjectAssignments key={`assignments:${selectedId}`}
                companyProjectId={project.company_project_id} workItemId={selectedId!}
                assignments={tree.assignments.filter((assignment) => assignment.company_project_work_item_id === selectedId)}
                assignmentsKnown={tree.assignmentKnownIds.has(selectedId!) && (selection?.source !== "gantt" || selectionReady)}
                onRetryAssignments={tree.refreshAssignments}
                members={permission.isError ? [] : permission.data ?? []} directory={directory} membership={membership}
                canManage={canManage} canManageMembers={canManageMembers} onManageMembers={onManageMembers}
                onMutationStart={beginAssignmentRefresh}
                directoryError={directoryQuery.error} directoryLoading={directoryQuery.isLoading}
                onRetryDirectory={() => void directoryQuery.refetch()} />
              {selected ? (
                <>
                  <section aria-label="업무 설명">
                    <h4>설명</h4>
                    <p className={selected.description ? "work-description" : "work-panel-empty"}>
                      {selected.description || "설명 없음"}
                    </p>
                  </section>
                  <section aria-label="세부 업무">
                    <div className="work-panel-section-heading">
                      <h4>세부 업무</h4>
                      {canManage && selectionReady && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pending || !canAddChild(selected)}
                          title={!canAddChild(selected) ? "업무는 최대 5단계까지 추가할 수 있습니다." : undefined}
                          onClick={() => openEditor({ kind: "work", parent: selected })}
                        >
                          세부 업무 추가
                        </Button>
                      )}
                    </div>
                    {tree.queryById.get(selectedId!)?.isFetching && (
                      <p role="status" className="projects-note">
                        세부 업무를 불러오는 중...
                      </p>
                    )}
                    {tree.queryById.get(selectedId!)?.isError && (
                      <div role="alert" className="work-panel-error">
                        <p>
                          {getErrorMessage(
                            tree.queryById.get(selectedId!)!.error,
                            "세부 업무를 불러오지 못했습니다.",
                          )}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => tree.loadChildren(selected)}
                        >
                          세부 업무 다시 시도
                        </Button>
                      </div>
                    )}
                    <ul className="work-panel-children">
                      {[...(tree.children.get(selectedId!) ?? [])]
                        .sort(compareWorkItems)
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
                        <p className="work-panel-empty">세부 업무 없음</p>
                      )}
                    {tree.needsChildren(selected) &&
                      !tree.queryById.get(selectedId!)?.isFetching &&
                      !tree.queryById.get(selectedId!)?.isError && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => tree.loadChildren(selected)}
                        >
                          세부 업무 불러오기
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
                  <details className="work-panel-additional" key={selectedId}>
                    <summary>자세히 보기</summary>
                    <dl className="work-panel-fields">
                      {getWorkItemUiDepth(tree.graph, selected.company_project_work_item_id) !== null && <div>
                        <dt>업무 계층</dt>
                        <dd title="프로젝트를 포함한 업무 계층이며, 단계는 깊이에 포함하지 않습니다.">
                          D{getWorkItemUiDepth(tree.graph, selected.company_project_work_item_id)}
                        </dd>
                      </div>}
                      <div><dt>WBS 코드</dt><dd>{selected.wbs_code || "—"}</dd></div>
                      <div><dt>실제 시작일</dt><dd>{formatProjectDate(selected.actual_start_date)}</dd></div>
                      <div><dt>실제 종료일</dt><dd>{formatProjectDate(selected.actual_end_date)}</dd></div>
                      {typeof selected.sort_order === "number" && <div><dt>정렬 순서</dt><dd>{selected.sort_order}</dd></div>}
                    </dl>
                  </details>
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
                      : "세부 업무 다시 시도"}
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
      {assignmentWorkId !== null && active && canManage && <ProjectAssignments
        key={`assignment-dialog:${assignmentWorkId}`} dialogOnly
        companyProjectId={project.company_project_id} workItemId={assignmentWorkId}
        assignments={assigneesByWorkId.get(assignmentWorkId) ?? []}
        assignmentsKnown={tree.assignmentKnownIds.has(assignmentWorkId)} onRetryAssignments={tree.refreshAssignments}
        members={permission.data ?? []} directory={directory} membership={membership}
        canManage={canManage} canManageMembers={canManageMembers} onManageMembers={onManageMembers}
        directoryError={directoryQuery.error} directoryLoading={directoryQuery.isLoading}
        onRetryDirectory={() => void directoryQuery.refetch()}
        onClose={() => setAssignmentWorkId(null)}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() => {
            const target = [assignmentReturnFocusRef.current, panelOpen ? panelTitleRef.current : null, searchRef.current]
              .find((element) => canFocus(element));
            target?.focus({ preventScroll: true });
          });
        }} />}
      {editTarget && active && (canManage || transientPermissionError) && <ProjectWorkFormDialog
        key={editTarget.kind === "phase" ? `phase:${editTarget.phase?.company_project_phase_id ?? "new"}` : `work:${editTarget.item?.company_project_work_item_id ?? `new:${editTarget.parent?.company_project_work_item_id ?? "root"}`}`}
        target={editTarget} detail={detail} tree={tree} canManage={canManage}
        members={permission.isError ? [] : permission.data ?? []} directory={directory} membership={membership}
        directoryLoading={directoryQuery.isLoading} directoryError={directoryQuery.error}
        onRetryDirectory={() => void directoryQuery.refetch()}
        onRetryPermission={transientPermissionError ? () => void permission.refetch() : undefined}
        permissionRetrying={permission.isFetching}
        onCloseAutoFocus={restoreEditorFocus}
        onClose={() => setEditTarget(null)} onSaved={(createdWork) => { setEditTarget(null); if (createdWork) select(createdWork, true); }} />}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !pending && !cancelLock.current) setCancelTarget(null);
        }}
      >
        <DialogContent
          className="work-cancel-dialog border-border bg-background text-foreground [&>button]:text-muted-foreground"
          onCloseAutoFocus={restoreEditorFocus}
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
                : " 모든 세부 업무와 담당자 배정, 예약 알림도 취소하고 연결된 업무 의존성을 해제합니다."}
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
