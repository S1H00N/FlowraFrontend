import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, FileCheck2, Folder, Loader2, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import CustomSelect from "@/components/ui/CustomSelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { listCompanyProjectWorkItemChildren } from "@/api/companyProjects";
import { companyProjectGanttKey, companyProjectWorkItemChildrenKey, useCompanyProjectGantt } from "@/hooks/useCompanyProjects";
import { getApiErrorDetails, getErrorMessage } from "@/lib/error";
import { buildProjectHierarchy, getProjectWorkSearchScope, projectHierarchyTitle, workKey, type ProjectHierarchyKey } from "@/lib/projectHierarchy";
import { buildProjectWorkTree, getWorkItemDepthInfo, MAX_PROJECT_WORK_DEPTH } from "@/lib/projectWorkTree";
import { projectDate, projectSchedule } from "@/lib/projectSchedule";
import {
  addProjectGanttDays, addProjectGanttMonths, createProjectGanttAxis, getProjectGanttHeaders,
  getProjectGanttPeriod, getProjectGanttProgress, getProjectGanttRange, type ProjectGanttZoom,
} from "@/lib/projectGantt";
import { useUserSettings } from "@/lib/userSettings";
import { WORK_PRIORITY_OPTIONS, WORK_STATUS_OPTIONS, WorkAssignees, WorkPriorityBadge, WorkProgress, WorkStatusBadge, formatWorkProgress, workStatusLabel } from "./ProjectWorkPresentation";
import { ProjectScheduleLabel, useProjectToday } from "./ProjectSchedulePresentation";
import { buildProjectGanttDependencies } from "@/lib/projectGanttDependencies";
import { ProjectGanttDependencies, ProjectGanttDependencyDetails } from "./ProjectGanttDependencies";
import { emptyProjectGanttFilters, filterProjectGanttItems } from "@/lib/projectGanttFilters";
import type {
  CompanyAdminMember, CompanyMembership, CompanyProjectAssignment, CompanyProjectDetailData,
  CompanyProjectGanttQuery, CompanyProjectPhase, CompanyProjectWorkItem, CompanyProjectWorkItemChildrenData,
} from "@/types";
import "./ProjectGantt.css";

interface ProjectGanttProps {
  detail: CompanyProjectDetailData;
  detailUpdatedAt: number;
  active: boolean;
  selectedId: number | null;
  onSelect: (item: CompanyProjectWorkItem, items: readonly CompanyProjectWorkItem[], togglePanel?: boolean) => void;
  onItemsChange?: (items: readonly CompanyProjectWorkItem[]) => void;
  onWbsWidthChange?: (width: number) => void;
  assignments: CompanyProjectAssignment[];
  assignmentKnownIds: ReadonlySet<number>;
  assigneeOptions: readonly { value: string; label: string }[];
  directory: CompanyAdminMember[];
  membership: CompanyMembership;
}

type GanttRow = {
  key: ProjectHierarchyKey;
  kind: "phase" | "group";
  phase?: CompanyProjectPhase;
  label: string;
  level: number;
} | {
  key: ProjectHierarchyKey;
  kind: "work";
  item: CompanyProjectWorkItem;
  label: string;
  level: number;
};
interface BranchSnapshot {
  parentId: number;
  data: CompanyProjectWorkItemChildrenData;
  updatedAt: number;
}
const emptyItems: CompanyProjectWorkItem[] = [];

/** Gantt branches have their own snapshots; they never update the detail tree. */
function mergeGanttBranches(base: readonly CompanyProjectWorkItem[], snapshots: BranchSnapshot[], projectId: number) {
  const byId = new Map(base.map((item) => [item.company_project_work_item_id, item]));
  const pending = new Map([...snapshots].sort((a, b) => a.updatedAt - b.updatedAt).map((snapshot) => [snapshot.parentId, snapshot]));
  let progressed = true;
  while (pending.size && progressed) {
    progressed = false;
    for (const [parentId, snapshot] of pending) {
      const parent = byId.get(parentId);
      if (!parent || (parent.parent_work_item_id && pending.has(parent.parent_work_item_id))) continue;
      const incoming = new Set(snapshot.data.items.map((item) => item.company_project_work_item_id));
      const children = new Map<number, number[]>();
      for (const item of byId.values()) {
        if (item.parent_work_item_id == null) continue;
        const siblings = children.get(item.parent_work_item_id) ?? [];
        siblings.push(item.company_project_work_item_id);
        children.set(item.parent_work_item_id, siblings);
      }
      const removed = (children.get(parentId) ?? []).filter((id) => !incoming.has(id));
      const seen = new Set<number>();
      while (removed.length) {
        const id = removed.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        byId.delete(id);
        removed.push(...(children.get(id) ?? []));
      }
      for (const item of snapshot.data.items) {
        if (item.company_project_id === undefined || item.company_project_id === projectId)
          byId.set(item.company_project_work_item_id, item);
      }
      pending.delete(parentId);
      progressed = true;
    }
  }
  return [...byId.values()];
}

export default function ProjectGantt(props: ProjectGanttProps) {
  return <ProjectGanttSession key={props.detail.project.company_project_id} {...props} />;
}

function ProjectGanttSession({ detail, detailUpdatedAt, active, selectedId, onSelect, onItemsChange, onWbsWidthChange,
  assignments, assignmentKnownIds, assigneeOptions, directory, membership }: ProjectGanttProps) {
  const projectId = detail.project.company_project_id;
  const queryClient = useQueryClient();
  const [entryQuery, setQuery] = useState<CompanyProjectGanttQuery | null>(null);
  const query: CompanyProjectGanttQuery = entryQuery ?? (detail.detail_policy?.mode === "full"
    ? { mode: "full", max_depth: 5 } : { mode: "auto", max_depth: 2 });
  // Capture the latest detail policy on first entry, rather than when the
  // hidden view mounts. Subsequent detail refreshes preserve the user's scope.
  useEffect(() => { if (active && entryQuery === null) setQuery(query); }, [active, entryQuery, query]);
  const gantt = useCompanyProjectGantt(projectId, query, { enabled: active });
  const queryState = queryClient.getQueryState(companyProjectGanttKey(projectId, query));
  const data = gantt.isError || queryState?.isInvalidated ? undefined : gantt.data;
  const revision = queryState?.dataUpdateCount ?? 0;
  const [requested, setRequested] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ProjectHierarchyKey>>(() => new Set());
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(emptyProjectGanttFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [filterElement, setFilterElement] = useState<HTMLDivElement | null>(null);
  const [optionsElement, setOptionsElement] = useState<HTMLDivElement | null>(null);
  useEffect(() => { if (!active) { setFilterOpen(false); setOptionsOpen(false); } }, [active]);
  const filterDoneRef = useRef<HTMLButtonElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const optionsTriggerRef = useRef<HTMLButtonElement>(null);
  const dateActionsRef = useRef<HTMLDivElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dependencyChoice, setShowDependencies] = useState<boolean | null>(null);
  const [display, setDisplay] = useState({ assignees: false, status: false, priority: false, undated: true, progress: false });
  const [zoom, setZoom] = useState<ProjectGanttZoom>("week");
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const [viewport, setViewport] = useState({ width: 1000, left: 0 });
  const [compact, setCompact] = useState(false);
  const [chartHeight, setChartHeight] = useState<number>();
  const [preferredWbsWidth, setPreferredWbsWidth] = useState(340);
  const [resizing, setResizing] = useState(false);
  const resizeDrag = useRef<{ x: number; width: number; pointerId: number; scale: number } | null>(null);
  const wbsMin = viewport.width < 800 ? 220 : 300;
  const wbsMax = Math.max(wbsMin, Math.min(480, viewport.width - 320));
  const wbsWidth = Math.max(wbsMin, Math.min(wbsMax, preferredWbsWidth));
  // Report the user's width, not a temporary dock-induced clamp; this avoids
  // docking/undocking feedback when the host reserves panel space.
  useEffect(() => { onWbsWidthChange?.(preferredWbsWidth); }, [preferredWbsWidth, onWbsWidthChange]);
  const scroller = useRef<HTMLDivElement>(null);
  const mobileScroller = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const pendingPosition = useRef<{ date: string; fraction: number; screenOffset: number } | null>(null);
  const initialized = useRef(false);
  const savedScroll = useRef({ top: 0, left: 0 });
  const savedMobileScroll = useRef(0);
  const today = useProjectToday();
  const { weekStart } = useUserSettings();
  const snapshotKey = (id: number) => [...companyProjectWorkItemChildrenKey(projectId, id, { depth: 1 }),
    "gantt-snapshot", query.mode, query.max_depth, revision, detailUpdatedAt] as const;

  // A late branch can only merge when its parent still exists in the current base.
  const cachedSnapshots = requested.flatMap((parentId) => {
    const state = queryClient.getQueryState<CompanyProjectWorkItemChildrenData>(snapshotKey(parentId));
    return state?.status === "success" && state.data
      ? [{ parentId, data: state.data, updatedAt: state.dataUpdatedAt }] : [];
  });
  const anchoredIds = new Set(mergeGanttBranches(data?.items ?? emptyItems, cachedSnapshots, projectId)
    .map((item) => item.company_project_work_item_id));
  const activeRequested = requested.filter((id) => anchoredIds.has(id));
  const branches = useQueries({ queries: activeRequested.map((id) => ({
    queryKey: snapshotKey(id),
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const response = await listCompanyProjectWorkItemChildren(projectId, id, { depth: 1 }, { signal });
      if (!response.success) throw new Error(response.message || "세부 업무를 불러오지 못했습니다.");
      return response.data;
    },
    enabled: active && Boolean(data), retry: false, staleTime: 30_000, structuralSharing: false,
  })) });
  // Query result objects change on each render; use their revisions for a stable graph.
  const branchVersion = activeRequested.map((id, index) =>
    `${id}:${queryClient.getQueryState(snapshotKey(id))?.dataUpdateCount ?? 0}:${branches[index].isError}`).join("|");
  const items = useMemo(() => data ? mergeGanttBranches(data.items, branches.flatMap((branch, index) =>
    branch.data && !branch.isError
      ? [{ parentId: activeRequested[index], data: branch.data, updatedAt: branch.dataUpdatedAt }] : []), projectId) : emptyItems,
  [data, branchVersion, projectId, revision, detailUpdatedAt]);
  const graph = useMemo(() => buildProjectWorkTree(items, projectId), [items, projectId]);
  const baseGraph = useMemo(() => buildProjectWorkTree(data?.items ?? emptyItems, projectId), [data, projectId]);
  const overDepthIds = useMemo(() => new Set([...graph.nodes.keys()].filter((id) =>
    (getWorkItemDepthInfo(graph, id).workItemDepth ?? 0) > MAX_PROJECT_WORK_DEPTH)), [graph]);
  const branchById = new Map(activeRequested.map((id, index) => [id, branches[index]]));
  const completeSets = useMemo(() => {
    const complete = new Set<number | null>(activeRequested.filter((id, index) => branches[index].isSuccess));
    const policy = data?.gantt_policy;
    const full = policy?.mode === "full" && policy.max_depth === 5;
    const summary = policy?.mode === "summary" && policy.max_depth === 2;
    if ((full || summary) && !baseGraph.warnings.length && !graph.warnings.length) {
      complete.add(null);
      // The base policy proves coverage only for base rows. Newly fetched
      // children need their own successful direct-children snapshot.
      for (const id of baseGraph.nodes.keys()) {
        if (full || getWorkItemDepthInfo(baseGraph, id).workItemDepth === 1) complete.add(id);
      }
    }
    return complete;
  }, [graph, baseGraph, data, branchVersion]);
  const hierarchy = useMemo(() => buildProjectHierarchy(graph, data?.phases ?? [],
    detail.project.phase_mode === "phased", completeSets), [graph, data, detail.project.phase_mode, completeSets]);
  const verifiedFullRequest = query.mode === "full" && query.max_depth === 5 &&
    query.phase_id === undefined && query.from === undefined && query.to === undefined &&
    data?.gantt_policy.mode === "full" && data.gantt_policy.max_depth === 5;
  const graphScope = getProjectWorkSearchScope(graph, completeSets, detail.summary?.work_item_count);
  const scope = overDepthIds.size > 0 || graphScope === "invalid" ? "invalid"
    : verifiedFullRequest && graphScope === "complete" && !branches.some((branch) => branch.isError || branch.isFetching)
      ? "complete" : "loaded";
  const assignmentsById = useMemo(() => {
    const result = new Map<number, CompanyProjectAssignment[]>();
    for (const assignment of assignments) {
      if (typeof assignment.company_project_work_item_id !== "number") continue;
      const current = result.get(assignment.company_project_work_item_id) ?? [];
      current.push(assignment);
      result.set(assignment.company_project_work_item_id, current);
    }
    return result;
  }, [assignments]);
  const filtered = useMemo(() => filterProjectGanttItems(graph, hierarchy, { ...filters, search },
    assignmentsById, assignmentKnownIds, detail.project.phase_mode === "phased"),
  [graph, hierarchy, filters, search, assignmentsById, assignmentKnownIds, detail.project.phase_mode]);
  const matchingIds = filtered.includedIds;
  const filterCount = Number(filters.status !== "all") + Number(filters.priority !== "all") +
    Number(filters.phase !== "all") + Number(filters.assignee !== "all") + Number(filters.unassignedOnly);
  function updateFilter<K extends keyof typeof filters>(key: K, value: typeof filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  function restoreFilterFocus() {
    requestAnimationFrame(() => (filterOpen ? filterDoneRef.current : searchRef.current)?.focus({ preventScroll: true }));
  }
  function resetFilters() { setFilters(emptyProjectGanttFilters); setSearch(""); restoreFilterFocus(); }
  const visibleRows = useMemo(() => {
    const rows: GanttRow[] = [];
    const seen = new Set<number>();
    function visit(id: number, level: number) {
      if (seen.has(id) || overDepthIds.has(id) || (matchingIds && !matchingIds.has(id))) return;
      const item = graph.nodes.get(id)?.item;
      if (!item) return;
      seen.add(id);
      rows.push({ key: workKey(id), kind: "work", item, label: item.title, level });
      if (expanded.has(id) || matchingIds) for (const child of graph.childrenByParent.get(id) ?? []) visit(child, level + 1);
    }
    for (const group of hierarchy.groups) {
      const showGroup = Boolean(group.phase) || (detail.project.phase_mode === "phased" && group.rootIds.length > 0);
      if (matchingIds && !group.rootIds.some((id) => matchingIds.has(id))) continue;
      if (showGroup) rows.push({ key: group.key, kind: group.phase ? "phase" : "group", phase: group.phase,
        label: group.phase?.name ?? "단계 미지정", level: 0 });
      if (!showGroup || !collapsedGroups.has(group.key) || matchingIds)
        for (const id of group.rootIds) visit(id, showGroup ? 1 : 0);
    }
    return rows;
  }, [graph, hierarchy, expanded, collapsedGroups, matchingIds, detail.project.phase_mode, overDepthIds]);
  const displayedWorkCount = visibleRows.filter((row) => row.kind === "work").length;
  const matchingWorkCount = visibleRows.filter((row) => row.kind === "work" && filtered.matchingIds.has(row.item.company_project_work_item_id)).length;
  const loadedParentIds = items.filter((item) => !overDepthIds.has(item.company_project_work_item_id) &&
    graph.childrenByParent.get(item.company_project_work_item_id)?.some((id) => !overDepthIds.has(id)))
    .map((item) => item.company_project_work_item_id);
  const expandableGroups = hierarchy.groups.filter((group) =>
    (group.phase || detail.project.phase_mode === "phased") && group.rootIds.some((id) => !overDepthIds.has(id)));
  const treeActionsBusy = !data || gantt.isFetching || branches.some((branch) => branch.isFetching) || Boolean(matchingIds);
  const canExpandLoaded = loadedParentIds.some((id) => !expanded.has(id)) || expandableGroups.some((group) => collapsedGroups.has(group.key));
  const canCollapseLoaded = visibleRows.some((row) => row.kind === "work"
    ? hasBranch(row.item) && expanded.has(row.item.company_project_work_item_id)
    : expandableGroups.some((group) => group.key === row.key) && !collapsedGroups.has(row.key));
  useEffect(() => { onItemsChange?.(items); }, [items, onItemsChange]);

  const fitRange = useMemo(() => getProjectGanttRange(detail.project, items, today), [detail.project, items, today]);
  const initialRange = useMemo(() => ({ start: addProjectGanttDays(fitRange.start, -7) || fitRange.start,
    end: addProjectGanttDays(fitRange.end, 14) || fitRange.end }), [fitRange]);
  const axis = useMemo(() => createProjectGanttAxis((range ?? initialRange).start, (range ?? initialRange).end, zoom, weekStart),
    [range, initialRange, zoom, weekStart]);
  const timelineViewport = Math.max(120, viewport.width - wbsWidth);
  const headers = useMemo(() => getProjectGanttHeaders(axis, viewport.left, timelineViewport), [axis, viewport.left, timelineViewport]);
  const todayX = axis.dateToX(today);
  const dependencies = useMemo(() => {
    const merged = new Map((data?.dependencies ?? []).map((dependency) =>
      [dependency.company_project_work_dependency_id, dependency]));
    const snapshots = branches.filter((branch) => branch.data && !branch.isError)
      .sort((left, right) => left.dataUpdatedAt - right.dataUpdatedAt);
    for (const snapshot of snapshots) {
      const returnedIds = new Set(snapshot.data!.items.map((item) => item.company_project_work_item_id));
      // A successful branch replaces relationships for its returned children.
      // Keep external endpoints so the text list can explain the query limit.
      for (const [id, dependency] of merged)
        if (returnedIds.has(dependency.predecessor_work_item_id) || returnedIds.has(dependency.successor_work_item_id)) merged.delete(id);
      for (const dependency of snapshot.data!.dependencies)
        merged.set(dependency.company_project_work_dependency_id, dependency);
    }
    return [...merged.values()];
  }, [data, branchVersion, detailUpdatedAt]);
  const dependencyRelations = useMemo(() => buildProjectGanttDependencies(dependencies, items, visibleRows, axis),
    [dependencies, items, visibleRows, axis]);
  const drawableDependencyCount = dependencyRelations.filter((relation) => relation.geometry).length;
  const showDependencies = dependencyChoice ?? drawableDependencyCount <= 100;
  const relatedWorkIds = useMemo(() => {
    const related = new Set<number>();
    if (selectedId !== null) for (const { dependency } of dependencyRelations) {
      if (dependency.predecessor_work_item_id === selectedId) related.add(dependency.successor_work_item_id);
      if (dependency.successor_work_item_id === selectedId) related.add(dependency.predecessor_work_item_id);
    }
    return related;
  }, [dependencyRelations, selectedId]);
  const shownStart = axis.xToDate(viewport.left);
  const shownEnd = axis.xToDate(Math.min(axis.width - 1, viewport.left + timelineViewport));

  useLayoutEffect(() => {
    if (!active || !rootRef.current) return;
    const element = rootRef.current;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!element.clientWidth) return;
      setCompact(element.clientWidth <= 600);
      const scroll = scroller.current;
      const width = scroll?.clientWidth || element.clientWidth;
      const left = scroll?.clientWidth ? scroll.scrollLeft : savedScroll.current.left;
      setViewport((current) => current.width === width && current.left === left ? current : { width, left });
      if (!scroll?.clientWidth) return;
      const bounds = scroll.getBoundingClientRect();
      const scale = bounds.width / scroll.offsetWidth || 1;
      const visual = window.visualViewport;
      const bottom = ((visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight)) / scale;
      const border = Number.parseFloat(getComputedStyle(scroll).borderTopWidth) + Number.parseFloat(getComputedStyle(scroll).borderBottomWidth);
      const scrollbar = Math.max(0, scroll.offsetHeight - scroll.clientHeight - border);
      const footer = element.querySelector<HTMLElement>(".gantt-footer")?.offsetHeight ?? 0;
      const relations = element.querySelector<HTMLElement>(".gantt-dependency-details")?.offsetHeight ?? 0;
      const contentHeight = 58 + visibleRows.length * 46 + border + scrollbar;
      const availableHeight = Math.max(58 + 46 + border + scrollbar, bottom - bounds.top / scale - footer - relations - 36);
      setChartHeight(Math.ceil(Math.min(contentHeight, availableHeight)));
    };
    const scheduleMeasure = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(element);
    if (scroller.current) observer.observe(scroller.current);
    const details = element.querySelector(".gantt-dependency-details");
    details?.addEventListener("toggle", scheduleMeasure);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    window.visualViewport?.addEventListener("resize", scheduleMeasure);
    window.visualViewport?.addEventListener("scroll", scheduleMeasure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      details?.removeEventListener("toggle", scheduleMeasure);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.visualViewport?.removeEventListener("resize", scheduleMeasure);
      window.visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, [active, Boolean(data), visibleRows.length, filterCount, search, display.assignees, dependencyRelations.length]);
  useLayoutEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setRange(initialRange);
    pendingPosition.current = { date: fitRange.start, fraction: 0, screenOffset: 24 };
  }, [data, initialRange, fitRange]);
  useLayoutEffect(() => {
    if (!active || !scroller.current || !pendingPosition.current) return;
    const position = pendingPosition.current;
    const x = axis.positionToX({ date: position.date, fraction: position.fraction });
    if (x !== null) {
      scroller.current.scrollLeft = Math.max(0, x - position.screenOffset);
      savedScroll.current.left = scroller.current.scrollLeft;
      setViewport((previous) => ({ ...previous, left: scroller.current!.scrollLeft }));
    }
    pendingPosition.current = null;
  }, [axis, active, data]);
  useLayoutEffect(() => {
    if (!active || compact || !scroller.current) return;
    scroller.current.scrollTop = savedScroll.current.top;
    scroller.current.scrollLeft = savedScroll.current.left;
    setViewport((previous) => ({ ...previous, left: savedScroll.current.left }));
  }, [active, compact, Boolean(data), Boolean(visibleRows.length)]);
  useLayoutEffect(() => {
    if (active && compact && mobileScroller.current) mobileScroller.current.scrollTop = savedMobileScroll.current;
  }, [active, compact, Boolean(data), Boolean(visibleRows.length)]);
  useLayoutEffect(() => {
    if (!active) return;
    const focused = document.activeElement === document.body ? lastFocusedRef.current : document.activeElement;
    if (!(focused instanceof HTMLElement) || focused.getClientRects().length) return;
    if (dateActionsRef.current?.contains(focused) || focused.closest(".gantt-desktop-options")) {
      setOptionsOpen(false);
      optionsTriggerRef.current?.focus({ preventScroll: true });
    } else if (rootRef.current?.contains(focused)) {
      const id = focused.closest<HTMLElement>("[data-work-id]")?.dataset.workId;
      if (id) focusWork(Number(id));
      else searchRef.current?.focus({ preventScroll: true });
    }
  }, [active, compact]);
  useLayoutEffect(() => {
    const content = optionsOpen ? optionsElement : filterOpen ? filterElement : null;
    const trigger = optionsOpen ? optionsTriggerRef.current : filterTriggerRef.current;
    const root = rootRef.current;
    if (!content || !trigger || !root) return;
    let frame = 0;
    let translation = { x: 0, y: 0 };
    // Radix's portal coordinates are viewport pixels; root CSS zoom scales
    // them again. Correct only this Gantt popover, keeping its zoomed size.
    const measure = () => {
      frame = 0;
      const scale = root.offsetWidth ? root.getBoundingClientRect().width / root.offsetWidth : 1;
      if (Math.abs(scale - 1) < 0.001) {
        content.style.removeProperty("translate");
        content.style.removeProperty("max-height");
        content.style.removeProperty("max-width");
        translation = { x: 0, y: 0 };
        return;
      }
      const visual = window.visualViewport;
      const left = (visual?.offsetLeft ?? 0) + 12;
      const top = (visual?.offsetTop ?? 0) + 12;
      const right = left + (visual?.width ?? window.innerWidth) - 24;
      const bottom = top + (visual?.height ?? window.innerHeight) - 24;
      content.style.maxHeight = `${(bottom - top) / scale}px`;
      content.style.maxWidth = `${(right - left) / scale}px`;
      const bounds = content.getBoundingClientRect();
      const anchor = trigger.getBoundingClientRect();
      const x = Math.max(left, Math.min(right - bounds.width, optionsOpen ? anchor.right - bounds.width : anchor.left));
      const below = anchor.bottom + 4;
      const above = anchor.top - bounds.height - 4;
      const y = below + bounds.height <= bottom ? below : above >= top ? above
        : Math.max(top, bottom - bounds.height);
      translation = { x: translation.x + (x - bounds.left) / scale, y: translation.y + (y - bounds.top) / scale };
      content.style.translate = `${translation.x}px ${translation.y}px`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule);
    observer.observe(root);
    observer.observe(content);
    // Floating UI updates the portal's transform after scroll and layout changes.
    const positionObserver = new MutationObserver(schedule);
    if (content.parentElement) positionObserver.observe(content.parentElement, { attributes: true, attributeFilter: ["style"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    content.addEventListener("animationend", schedule);
    measure();
    return () => {
      observer.disconnect(); positionObserver.disconnect(); cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);
      content.removeEventListener("animationend", schedule);
      content.style.removeProperty("translate"); content.style.removeProperty("max-height"); content.style.removeProperty("max-width");
    };
  }, [optionsOpen, filterOpen, optionsElement, filterElement]);

  function canExpand(item: CompanyProjectWorkItem) {
    const info = getWorkItemDepthInfo(graph, item.company_project_work_item_id);
    const depth = info.workItemDepth ?? info.backendDepthLevel;
    return depth !== null && depth < MAX_PROJECT_WORK_DEPTH;
  }
  function hasBranch(item: CompanyProjectWorkItem) {
    const id = item.company_project_work_item_id;
    return Boolean(graph.childrenByParent.get(id)?.some((childId) => !overDepthIds.has(childId))) ||
      (canExpand(item) && !completeSets.has(id)) || branchById.get(id)?.isError;
  }
  function toggleWork(item: CompanyProjectWorkItem) {
    if (matchingIds) return;
    const id = item.company_project_work_item_id;
    const branch = branchById.get(id);
    if (branch?.isError) { void branch.refetch(); setExpanded((current) => new Set(current).add(id)); return; }
    const opening = !expanded.has(id);
    setExpanded((current) => { const next = new Set(current); if (opening) next.add(id); else next.delete(id); return next; });
    if (opening && canExpand(item) && !completeSets.has(id)) setRequested((current) => current.includes(id) ? current : [...current, id]);
  }
  function toggleGroup(key: ProjectHierarchyKey) {
    if (matchingIds) return;
    setCollapsedGroups((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }
  function focusWork(id: number) {
    const target = [...(rootRef.current?.querySelectorAll<HTMLElement>(`[data-work-id="${id}"] .work-title-button`) ?? [])]
      .find((element) => element.getClientRects().length > 0);
    target?.focus({ preventScroll: true });
    const scroll = target?.closest<HTMLElement>(".gantt-scroll, .gantt-mobile");
    if (target && scroll) {
      const bounds = scroll.getBoundingClientRect();
      const rowBounds = target.getBoundingClientRect();
      const scale = bounds.width / scroll.offsetWidth || 1;
      const top = bounds.top + (scroll.classList.contains("gantt-scroll") ? 58 * scale : 0);
      const bottom = bounds.top + scroll.clientHeight * scale;
      if (rowBounds.top < top) scroll.scrollTop += (rowBounds.top - top) / scale;
      else if (rowBounds.bottom > bottom) scroll.scrollTop += (rowBounds.bottom - bottom) / scale;
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
  function rowKeyboard(event: KeyboardEvent, row: GanttRow) {
    if (row.kind !== "work") return;
    const id = row.item.company_project_work_item_id;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const workRows = visibleRows.filter((candidate) => candidate.kind === "work");
      const index = workRows.findIndex((candidate) => candidate.kind === "work" && candidate.item.company_project_work_item_id === id);
      const next = workRows[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (next?.kind === "work") focusWork(next.item.company_project_work_item_id);
    } else if (event.key === "ArrowRight" && hasBranch(row.item)) {
      event.preventDefault();
      if (!matchingIds && !expanded.has(id)) toggleWork(row.item); else {
        const child = graph.childrenByParent.get(id)?.find((childId) => !overDepthIds.has(childId) && (!matchingIds || matchingIds.has(childId)));
        if (child !== undefined) focusWork(child);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (!matchingIds && expanded.has(id)) toggleWork(row.item); else {
        const parent = graph.nodes.get(id)?.parentId;
        if (parent != null) focusWork(parent);
      }
    }
  }
  function changeZoom(next: ProjectGanttZoom) {
    if (next === zoom) return;
    const offset = timelineViewport / 2;
    const position = axis.xToPosition((scroller.current?.scrollLeft ?? viewport.left) + offset);
    if (position) pendingPosition.current = { ...position, screenOffset: offset };
    setZoom(next);
  }
  function navigateTo(date: string, offset = timelineViewport / 2) {
    if (!projectDate(date)) return;
    const margin = zoom === "day" ? 45 : zoom === "week" ? 150 : 400;
    const start = addProjectGanttDays(date, -margin) || "0001-01-01";
    const end = addProjectGanttDays(date, margin) || "9999-12-31";
    pendingPosition.current = { date, fraction: 0, screenOffset: offset };
    setRange((current) => ({ start: start < (current ?? initialRange).start ? start : (current ?? initialRange).start,
      end: end > (current ?? initialRange).end ? end : (current ?? initialRange).end }));
  }
  function movePeriod(direction: number) {
    const center = axis.xToDate(viewport.left + timelineViewport / 2) || today;
    const next = zoom === "month" ? addProjectGanttMonths(center, direction * Math.max(1, Math.floor(timelineViewport / 176)))
      : addProjectGanttDays(center, direction * Math.max(1, Math.floor(timelineViewport / (zoom === "day" ? 43 : 143 / 7))));
    navigateTo(next);
  }
  function fitPeriod() {
    const candidates: ProjectGanttZoom[] = ["day", "week", "month"];
    const next = candidates.find((candidate) => createProjectGanttAxis(initialRange.start, initialRange.end, candidate, weekStart).width <= timelineViewport) ?? "month";
    pendingPosition.current = { date: fitRange.start, fraction: 0, screenOffset: 20 };
    setZoom(next);
    setRange({ ...initialRange });
  }
  function rowExpandable(row: GanttRow) {
    return row.kind === "work" ? Boolean(hasBranch(row.item)) : Boolean(hierarchy.groups.find((group) => group.key === row.key)?.rootIds.length);
  }
  function rowExpanded(row: GanttRow) {
    return rowExpandable(row) ? Boolean(matchingIds) || (row.kind === "work"
      ? expanded.has(row.item.company_project_work_item_id) : !collapsedGroups.has(row.key)) : undefined;
  }
  function expandControl(row: GanttRow) {
    const work = row.kind === "work" ? row.item : null;
    const id = work?.company_project_work_item_id;
    const branch = id === undefined ? undefined : branchById.get(id);
    const expandable = rowExpandable(row);
    const open = rowExpanded(row);
    return expandable ? <Button variant="ghost" size="icon" className="gantt-expand" disabled={Boolean(matchingIds) || branch?.isFetching}
      aria-expanded={open} aria-label={`${row.label} ${branch?.isError ? "세부 업무 다시 조회" : open ? "접기" : "펼치기"}`}
      onClick={() => work ? toggleWork(work) : toggleGroup(row.key)}>
      {branch?.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : branch?.isError ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        : open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </Button> : <span className="gantt-expand-spacer" aria-hidden="true" />;
  }
  function rowName(row: GanttRow, showMetadata = true) {
    const number = hierarchy.wbsByKey.get(row.key);
    const addNumber = number && projectHierarchyTitle(row.label, number) !== row.label;
    const metadata = showMetadata && row.kind === "work" && (display.assignees || display.status || display.priority);
    return <div className={`gantt-work-label${metadata ? " has-metadata" : ""}`}><div className="gantt-name" style={{ "--gantt-depth": row.level } as CSSProperties}>
      {expandControl(row)}
      {row.kind === "work" ? <FileCheck2 className="gantt-kind-icon" aria-hidden="true" /> : <Folder className="gantt-kind-icon" aria-hidden="true" />}
      {row.kind === "work" ? <button className="work-title-button gantt-title" onKeyDown={(event) => rowKeyboard(event, row)}
        onClick={() => onSelect(row.item, items)} aria-label={row.label}
        title={`${projectHierarchyTitle(row.label, number)}${row.item.wbs_code ? ` · 서버 WBS: ${row.item.wbs_code}` : ""}`}>
        {addNumber && <span className="gantt-wbs-number" aria-label="화면 계층 번호">{number}.</span>}{row.label}
      </button> : <span className="gantt-title">{addNumber && <span className="gantt-wbs-number">{number}.</span>}{row.label}</span>}
    </div>{row.kind === "work" && metadata && <div className="gantt-work-metadata" style={{ "--gantt-depth": row.level } as CSSProperties}>
      {display.status && <WorkStatusBadge status={row.item.status} />}
      {display.priority && <WorkPriorityBadge priority={row.item.priority} />}
      {display.assignees && <WorkAssignees assignments={assignmentsById.get(row.item.company_project_work_item_id) ?? []}
        known={assignmentKnownIds.has(row.item.company_project_work_item_id)} directory={directory} membership={membership} compact />}
    </div>}</div>;
  }
  function timeline(row: GanttRow) {
    const source = row.kind === "work" ? row.item : row.phase;
    if (!source) return null;
    const period = getProjectGanttPeriod(source, axis);
    const progress = row.kind === "work" ? getProjectGanttProgress(row.item) : null;
    const schedule = projectSchedule(source, today);
    const description = `${row.label}${row.kind === "phase" ? " · Phase 일정" : ""} · ${period.kind === "period" ? `${period.start} ~ ${period.end}` : period.kind === "start" ? `${period.start} 시작 · 종료일 미설정`
      : period.kind === "end" ? `${period.end} 종료 · 시작일 미설정` : period.kind === "invalid" ? "계획 날짜 확인 필요" : "기간 미설정"}${row.kind === "work"
      ? ` · ${workStatusLabel(row.item.status)} · 진행률 ${formatWorkProgress(row.item.progress_percent)}` : ""} · ${schedule.label}`;
    const tone = `${row.kind === "phase" ? " gantt-phase-bar" : ""}${schedule.kind === "completed" ? " gantt-complete" : ""}${schedule.kind === "cancelled" ? " gantt-cancelled" : ""}`;
    if (period.kind === "unset" && !display.undated) return null;
    if (period.kind === "unset") return <Tooltip><TooltipTrigger asChild>
      {row.kind === "work" ? <button type="button" className="gantt-period-label gantt-period-unset"
        aria-label={`${row.label} 예정 기간 미설정`} onClick={() => onSelect(row.item, items)}>—</button>
        : <span tabIndex={0} className="gantt-period-label gantt-period-unset" aria-label={`${row.label} 예정 기간 미설정`}>—</span>}
    </TooltipTrigger><TooltipContent className="gantt-tooltip">예정 기간이 설정되지 않았습니다.</TooltipContent></Tooltip>;
    if (period.kind === "invalid") return <span className="gantt-period-label text-destructive">
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />계획 날짜 확인 필요</span>;
    const marker = period.kind !== "period";
    const style = { left: period.x, width: marker ? 10 : period.width };
    const contents = <>{!marker && progress !== null && <span className="gantt-progress-fill" style={{ width: `${progress}%` }} />}
      {display.progress && !marker && row.kind === "work" && <span className="gantt-progress-text">{formatWorkProgress(row.item.progress_percent)}</span>}
      {schedule.kind === "delayed" && <span className="gantt-delay-mark" aria-hidden="true">!</span>}</>;
    return row.kind === "work" ? <button type="button" data-testid={`gantt-bar-${row.item.company_project_work_item_id}`}
      className={`${marker ? "gantt-marker" : "gantt-bar"}${tone}`} style={style} title={description} aria-label={description}
      onClick={() => onSelect(row.item, items)}>{contents}</button>
      : <span className={`gantt-bar${tone}${marker ? " gantt-marker" : ""}`} style={style} role="img" title={description} aria-label={description}>{contents}</span>;
  }
  function mobilePeriod(item: CompanyProjectWorkItem) {
    const period = getProjectGanttPeriod(item, axis);
    if (period.kind === "invalid") return "계획 날짜 확인 필요";
    if (period.kind === "unset") return "기간 미설정";
    return `${period.start || "시작일 미설정"} ~ ${period.end || "종료일 미설정"}`;
  }
  const statusCode = getApiErrorDetails(gantt.error)?.status;
  const errorMessage = statusCode === 401 ? "로그인이 만료되었습니다. 다시 로그인해 주세요." : statusCode === 403 ? "이 프로젝트의 간트를 조회할 권한이 없습니다."
    : statusCode === 404 ? "프로젝트를 찾을 수 없거나 접근할 수 없습니다." : getErrorMessage(gantt.error, "간트 일정을 불러오지 못했습니다.");
  const legend = { plan: false, progress: false, phase: false, delayed: false, partial: false };
  for (const row of visibleRows) {
    const source = row.kind === "work" ? row.item : row.phase;
    if (!source) continue;
    const period = getProjectGanttPeriod(source, axis);
    if (period.kind === "unset" || period.kind === "invalid") continue;
    if (row.kind === "phase") legend.phase = true;
    else legend.plan = true;
    if (period.kind !== "period") legend.partial = true;
    if (row.kind === "work" && period.kind === "period" && getProjectGanttProgress(row.item) !== null) legend.progress = true;
    if (projectSchedule(source, today).kind === "delayed") legend.delayed = true;
  }

  return <TooltipProvider delayDuration={200}><section className={`project-gantt${resizing ? " gantt-resizing" : ""}`} ref={rootRef} data-testid="project-gantt" aria-label="프로젝트 간트 차트"
    onFocusCapture={(event) => { if (event.target instanceof HTMLElement) lastFocusedRef.current = event.target; }}
    onBlurCapture={(event) => {
      if (event.relatedTarget instanceof HTMLElement && !rootRef.current?.contains(event.relatedTarget) &&
        !event.relatedTarget.closest(".gantt-display-options, .gantt-filter-content")) lastFocusedRef.current = null;
    }}>
    <div className="gantt-heading"><h3>간트 차트</h3>
      {gantt.isFetching && <span className="gantt-updating" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />일정 조회 중</span>}
    </div>
    <div className="gantt-toolbar">
      <div className="gantt-find-actions">
      <label className="gantt-search"><Search className="h-4 w-4" aria-hidden="true" /><Input ref={searchRef} data-gantt-search aria-label="간트 업무 검색"
        placeholder="업무 찾기" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <Popover open={filterOpen} onOpenChange={setFilterOpen}>
        <PopoverTrigger asChild><Button ref={filterTriggerRef} variant="outline" size="sm" aria-label="간트 업무 필터"
          aria-description={filterCount ? `${filterCount}개 조건 적용 중` : "적용된 조건 없음"}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />필터{filterCount > 0 && <span className="work-filter-count">{filterCount}</span>}
        </Button></PopoverTrigger>
        <PopoverContent ref={setFilterElement} className="work-filter-content gantt-filter-content" align="start" collisionPadding={12} aria-label="간트 필터 조건"
          onInteractOutside={(event) => {
            const target = event.detail.originalEvent.target;
            if (target instanceof Element && target.closest(".gantt-filter-menu")) event.preventDefault();
          }} onEscapeKeyDown={(event) => {
            if (document.querySelector(".gantt-filter-menu[role='listbox']")) event.preventDefault();
          }}>
          <h4>간트 필터</h4>
          <CustomSelect fieldLabel="상태" ariaLabel="간트 상태" value={filters.status} onChange={(value) => updateFilter("status", String(value))}
            options={[{ value: "all", label: "전체 상태" }, ...WORK_STATUS_OPTIONS]} contentClassName="project-work-select-menu gantt-filter-menu" />
          <CustomSelect fieldLabel="우선순위" ariaLabel="간트 우선순위" value={filters.priority} onChange={(value) => updateFilter("priority", String(value))}
            options={[{ value: "all", label: "전체 우선순위" }, ...WORK_PRIORITY_OPTIONS]} contentClassName="project-work-select-menu gantt-filter-menu" />
          {detail.project.phase_mode === "phased" && <CustomSelect fieldLabel="표시 단계" ariaLabel="간트 표시 단계" value={filters.phase}
            onChange={(value) => updateFilter("phase", String(value))} options={[{ value: "all", label: "전체 단계" },
              ...(data?.phases ?? []).map((phase) => ({ value: String(phase.company_project_phase_id), label: phase.name })),
              { value: "none", label: "단계 미지정" }]} contentClassName="project-work-select-menu gantt-filter-menu" />}
          <CustomSelect fieldLabel="담당자" ariaLabel="간트 담당자 필터" value={filters.assignee} onChange={(value) => updateFilter("assignee", String(value))}
            options={[{ value: "all", label: "전체 담당자" }, ...assigneeOptions]} contentClassName="project-work-select-menu gantt-filter-menu" />
          <label className="gantt-option"><Checkbox checked={filters.unassignedOnly}
            onCheckedChange={(checked) => updateFilter("unassignedOnly", checked === true)} /><span>미배정 업무만 보기</span></label>
          <p className="projects-note">담당자 정보가 확인된 업무 기준</p>
          {filters.assignee !== "all" && filters.unassignedOnly && <p className="projects-note" role="status">담당자와 미배정 조건을 함께 선택하면 일치하는 업무가 없습니다.</p>}
          <div className="work-filter-footer"><Button variant="ghost" size="sm" disabled={!filtered.filtering} onClick={resetFilters}>초기화</Button>
            <Button ref={filterDoneRef} size="sm" onClick={() => setFilterOpen(false)}>완료</Button></div>
        </PopoverContent>
      </Popover>
      </div>
      <div className="gantt-view-actions">
      <div className="gantt-date-actions" ref={dateActionsRef}>
        <Button size="sm" variant="outline" onClick={() => navigateTo(today)}><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />오늘</Button>
        <Button size="icon" variant="ghost" aria-label="이전 기간" onClick={() => movePeriod(-1)}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
        <Button size="icon" variant="ghost" aria-label="다음 기간" onClick={() => movePeriod(1)}><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
        <div className="gantt-zoom" role="group" aria-label="간트 날짜 확대 수준">{([['day', '일'], ['week', '주'], ['month', '월']] as const).map(([value, label]) =>
          <Button key={value} size="sm" variant={zoom === value ? "secondary" : "ghost"} aria-pressed={zoom === value} onClick={() => changeZoom(value)}>{label}</Button>)}</div>
      </div>
      <Popover open={optionsOpen} onOpenChange={setOptionsOpen}><PopoverTrigger asChild><Button ref={optionsTriggerRef} size="sm" variant="outline" aria-label="간트 보기 설정">보기 설정</Button></PopoverTrigger>
        <PopoverContent ref={setOptionsElement} className="work-filter-content gantt-display-options" data-compact={compact} align="end" collisionPadding={12} aria-label="간트 보기 설정 메뉴">
          <h4>보기 설정</h4>
          <div className="gantt-desktop-options">
          <h5>표시 항목</h5>
          <label className="gantt-option"><Checkbox checked={showDependencies} disabled={!dependencyRelations.length}
            onCheckedChange={(checked) => setShowDependencies(checked === true)} /><span>업무 연결선</span></label>
          {!dependencyRelations.length && <p className="projects-note">현재 조회된 업무 연결이 없습니다.</p>}
          {dependencyChoice === null && drawableDependencyCount > 100 && <p className="projects-note">연결선이 많아 숨겼습니다. 업무 연결 목록에서 확인할 수 있습니다.</p>}
          {([['assignees', '담당자'], ['status', '상태'], ['priority', '우선순위'], ['undated', '기간 미설정 표시'], ['progress', '진행률 숫자']] as const).map(([key, label]) =>
            <label className="gantt-option" key={key}><Checkbox checked={display[key]}
              onCheckedChange={(checked) => setDisplay((current) => ({ ...current, [key]: checked === true }))} /><span>{label}</span></label>)}
          </div>
          <div className="gantt-settings-section gantt-desktop-options"><h5>화면 조정</h5>
            <Button size="sm" variant="ghost" onClick={() => { fitPeriod(); setOptionsOpen(false); }}>전체 기간 보기</Button>
          </div>
          <div className="gantt-settings-section"><h5>업무 펼침</h5>
            <p className="projects-note">불러온 업무만 펼칩니다.</p>
            <Button size="sm" variant="ghost" disabled={treeActionsBusy || !canExpandLoaded} onClick={() => {
              setExpanded(new Set(loadedParentIds)); setCollapsedGroups(new Set()); setOptionsOpen(false);
            }}>모두 펼치기</Button>
            <Button size="sm" variant="ghost" disabled={treeActionsBusy || !canCollapseLoaded} onClick={() => {
              setExpanded(new Set()); setCollapsedGroups(new Set(hierarchy.groups.map((group) => group.key))); setOptionsOpen(false);
            }}>모두 접기</Button>
          </div>
        </PopoverContent>
      </Popover>
      </div>
    </div>
    {filtered.filtering && <div className="work-active-filters gantt-active-filters" aria-label="간트 적용된 검색 및 필터">
      {search.trim() && <Button variant="ghost" size="sm" aria-label="간트 검색 해제" onClick={() => { setSearch(""); restoreFilterFocus(); }}>
        <span>검색: {search.trim()}</span><X aria-hidden="true" /></Button>}
      {([
        ["status", "상태", WORK_STATUS_OPTIONS.find((option) => option.value === filters.status)?.label],
        ["priority", "우선순위", WORK_PRIORITY_OPTIONS.find((option) => option.value === filters.priority)?.label],
        ["phase", "표시 단계", data?.phases.find((phase) => String(phase.company_project_phase_id) === filters.phase)?.name ?? "단계 미지정"],
        ["assignee", "담당자", assigneeOptions.find((option) => option.value === filters.assignee)?.label ?? "담당자 정보 확인 필요"],
      ] as const).map(([key, label, value]) => filters[key] !== "all" && <Button key={key} variant="ghost" size="sm"
        aria-label={`간트 ${label} 필터 해제`} onClick={() => { updateFilter(key, "all"); restoreFilterFocus(); }}><span>{label}: {value}</span><X aria-hidden="true" /></Button>)}
      {filters.unassignedOnly && <Button variant="ghost" size="sm" aria-label="간트 미배정 필터 해제"
        onClick={() => { updateFilter("unassignedOnly", false); restoreFilterFocus(); }}><span>미배정 업무</span><X aria-hidden="true" /></Button>}
      <Button className="work-filter-reset" variant="ghost" size="sm" aria-label="간트 필터 초기화" onClick={resetFilters}>초기화</Button>
    </div>}
    {data && <div className="gantt-scope" role="status"><span>{filtered.filtering
      ? `일치 업무 ${matchingWorkCount}개 · 상위 경로 ${displayedWorkCount - matchingWorkCount}개 · ${scope === "complete" ? "전체" : "불러온"} 업무 ${items.length}개`
      : `${scope === "complete" ? "전체" : "불러온"} 업무 ${items.length}개`}</span>
      {scope !== "complete" && query.mode !== "full" && <Button size="sm" variant="outline"
        onClick={() => setQuery({ mode: "full", max_depth: 5 })}>5단계 조회 요청</Button>}
    </div>}
    {data && !filtered.assignmentCoverage.complete && (filters.assignee !== "all" || filters.unassignedOnly || display.assignees) && <p className="gantt-warning" role="status">
      담당자 정보가 확인된 업무 기준 · 확인 {filtered.assignmentCoverage.knownCount}/{filtered.assignmentCoverage.totalCount}개
      {filtered.assignmentCoverage.partialCount > 0 && ` · 일부 조회 ${filtered.assignmentCoverage.partialCount}개`} · 미조회 {filtered.assignmentCoverage.unqueriedCount}개
    </p>}
    {graph.warnings.length > 0 && <p className="gantt-warning" role="status"><AlertTriangle className="h-3.5 w-3.5" />상위 경로 일부를 확인할 수 없습니다. 조회된 관계만 표시합니다.</p>}
    {overDepthIds.size > 0 && <p className="gantt-warning" role="status"><AlertTriangle className="h-3.5 w-3.5" />최대 5단계를 초과한 계층은 표시할 수 없습니다. 원본 관계를 확인해 주세요.</p>}
    {branches.some((branch) => branch.isError) && <p className="gantt-warning" role="status">세부 업무 조회에 실패했습니다. 경고가 표시된 펼치기 버튼으로 다시 조회해 주세요.</p>}
    {gantt.isError ? <div className="gantt-state" role="alert"><AlertTriangle className="h-5 w-5" /><p>{errorMessage}</p>
      <Button size="sm" variant="outline" onClick={() => void gantt.refetch()}>다시 조회</Button></div>
      : !data ? <div className="gantt-state" role="status"><Loader2 className="h-5 w-5 animate-spin" />간트 일정을 불러오는 중입니다.</div>
        : !items.length ? <div className="gantt-state">{scope === "complete" ? "등록된 업무가 없습니다." : "현재 조회 범위에 업무가 없습니다. 조회 정책을 확인해 주세요."}</div>
          : !visibleRows.length ? <div className="gantt-state">현재 조회한 업무에서 검색 결과가 없습니다. 검색·필터 및 조회 범위를 확인해 주세요.
            {filtered.filtering && <Button size="sm" variant="outline" onClick={resetFilters}>검색 및 필터 초기화</Button>}</div>
            : <>
              <div className="gantt-desktop"><p className="gantt-visible-period" aria-live="polite">{shownStart} ~ {shownEnd}</p>
                <div className="gantt-scroll" ref={scroller} data-testid="gantt-scroll" aria-label="WBS 및 일정 타임라인" tabIndex={0}
                  style={{ height: chartHeight, "--gantt-wbs-width": `${wbsWidth}px`, "--gantt-axis-width": `${axis.width}px` } as CSSProperties}
                  onScroll={(event) => { const element = event.currentTarget; if (!element.clientWidth) return;
                    savedScroll.current = { top: element.scrollTop, left: element.scrollLeft };
                    setViewport((previous) => previous.left === element.scrollLeft ? previous : { ...previous, left: element.scrollLeft }); }}>
                  <div className="gantt-canvas" role="treegrid" aria-label="업무 계획 일정">
                    <div className="gantt-grid-header" role="row"><div className="gantt-wbs-head" role="columnheader">WBS / 업무명
                      <div role="separator" tabIndex={0} aria-label="WBS 너비 조절" aria-orientation="vertical"
                        aria-valuemin={wbsMin} aria-valuemax={wbsMax} aria-valuenow={wbsWidth} aria-valuetext={`${Math.round(wbsWidth)}픽셀`}
                        title="드래그 또는 방향키로 너비 조절 · 두 번 클릭하거나 Enter로 기본 폭 복원" className="gantt-resize-handle"
                        onDoubleClick={() => setPreferredWbsWidth(340)} onKeyDown={(event) => {
                          let next = wbsWidth;
                          if (event.key === "ArrowLeft") next -= event.shiftKey ? 50 : 10;
                          else if (event.key === "ArrowRight") next += event.shiftKey ? 50 : 10;
                          else if (event.key === "Home") next = wbsMin;
                          else if (event.key === "End") next = wbsMax;
                          else if (event.key === "Enter") next = 340;
                          else return;
                          event.preventDefault(); setPreferredWbsWidth(event.key === "Enter" ? 340 : Math.max(wbsMin, Math.min(wbsMax, next)));
                        }} onPointerDown={(event) => {
                          if (!event.isPrimary || event.button !== 0) return;
                          event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
                          const root = rootRef.current;
                          const measuredScale = root?.offsetWidth ? root.getBoundingClientRect().width / root.offsetWidth : 1;
                          const scale = Number.isFinite(measuredScale) && measuredScale > 0 && Math.abs(measuredScale - 1) >= 0.001 ? measuredScale : 1;
                          resizeDrag.current = { x: event.clientX, width: wbsWidth, pointerId: event.pointerId, scale };
                          event.currentTarget.setPointerCapture(event.pointerId); setResizing(true);
                        }} onPointerMove={(event) => {
                          const drag = resizeDrag.current;
                          if (!drag || event.pointerId !== drag.pointerId) return;
                          setPreferredWbsWidth(Math.max(wbsMin, Math.min(wbsMax, Math.round(drag.width + (event.clientX - drag.x) / drag.scale))));
                        }} onPointerUp={(event) => {
                          if (resizeDrag.current?.pointerId !== event.pointerId) return;
                          resizeDrag.current = null; setResizing(false); event.currentTarget.releasePointerCapture(event.pointerId);
                        }} onPointerCancel={() => { resizeDrag.current = null; setResizing(false); }}
                        onLostPointerCapture={() => { resizeDrag.current = null; setResizing(false); }} />
                    </div>
                      <div className="gantt-date-head" role="columnheader" aria-label="계획 날짜">
                        <div className="gantt-major-header">{headers.major.map((tick) => {
                          const visibleStart = Math.max(tick.x, viewport.left);
                          const visibleEnd = Math.min(tick.x + tick.width, viewport.left + timelineViewport, axis.width);
                          return <span key={tick.key} style={{ left: tick.x, width: tick.width }}><span className="gantt-major-label"
                            style={{ left: visibleStart - tick.x, width: Math.max(0, visibleEnd - visibleStart) }}>{tick.label}</span></span>;
                        })}</div>
                        <div className="gantt-minor-header">{headers.minor.map((tick) => <span key={tick.key} className={tick.weekend ? "gantt-weekend" : ""}
                          style={{ left: tick.x, width: tick.width }}>{tick.label}</span>)}</div>
                      </div>
                    </div>
                    <div className="gantt-rows">
                      {showDependencies && <ProjectGanttDependencies relations={dependencyRelations} width={axis.width}
                        height={visibleRows.length * 46} wbsWidth={wbsWidth} selectedId={selectedId}
                        onSelectRelation={(relation) => { const item = relation.successor ?? relation.predecessor; if (item) onSelect(item, items, false); }} />}
                      <div className="gantt-grid-lines" aria-hidden="true" style={{ left: wbsWidth, width: axis.width }}>
                        {headers.minor.map((tick) => <span key={tick.key} className={tick.weekend ? "gantt-weekend" : ""} style={{ left: tick.x, width: tick.width }} />)}
                        {todayX !== null && todayX >= 0 && todayX <= axis.width && <div className="gantt-today-line" data-testid="gantt-today-line" style={{ left: todayX }}><span>오늘</span></div>}
                      </div>
                      {visibleRows.map((row) => <div className={`gantt-row${row.kind !== "work" ? " gantt-phase-row" : ""}${row.kind === "work" && selectedId === row.item.company_project_work_item_id ? " gantt-selected" : ""}`}
                        key={row.key} role="row" data-work-id={row.kind === "work" ? row.item.company_project_work_item_id : undefined}
                        data-testid={row.kind === "work" ? `gantt-wbs-row-${row.item.company_project_work_item_id}` : row.key}
                        aria-level={row.level + 1} aria-expanded={rowExpanded(row)}
                        data-related={showDependencies && row.kind === "work" && relatedWorkIds.has(row.item.company_project_work_item_id) || undefined}
                        aria-selected={row.kind === "work" ? selectedId === row.item.company_project_work_item_id : undefined}>
                        <div className="gantt-wbs-cell" role="gridcell">{rowName(row)}</div><div className="gantt-timeline-cell" role="gridcell">{timeline(row)}</div>
                      </div>)}
                    </div>
                  </div>
                </div>
              </div>
              <div className="gantt-mobile" ref={mobileScroller} aria-label="간트 축약 일정 목록" data-testid="gantt-mobile-list"
                onScroll={(event) => { if (event.currentTarget.clientWidth) savedMobileScroll.current = event.currentTarget.scrollTop; }}>{visibleRows.map((row) =>
                <div className={`gantt-mobile-row${row.kind !== "work" ? " gantt-mobile-phase" : ""}${row.kind === "work" && selectedId === row.item.company_project_work_item_id ? " gantt-selected" : ""}`}
                  key={row.key} data-work-id={row.kind === "work" ? row.item.company_project_work_item_id : undefined}>
                  {rowName(row, false)}{row.kind === "work" && <div className="gantt-mobile-details">
                    <WorkStatusBadge status={row.item.status} /><WorkAssignees assignments={assignmentsById.get(row.item.company_project_work_item_id) ?? []}
                      known={assignmentKnownIds.has(row.item.company_project_work_item_id)} directory={directory} membership={membership} compact />
                    <span className="gantt-mobile-period">{mobilePeriod(row.item)}</span>
                    <WorkProgress item={row.item} compact /><ProjectScheduleLabel source={row.item} today={today} />
                  </div>}
                </div>)}</div>
            </>}
    <ProjectGanttDependencyDetails relations={dependencyRelations} selectedId={selectedId} onSelectWork={(item) => onSelect(item, items, false)} />
    {data && !gantt.isError && Object.values(legend).some(Boolean) && <div className="gantt-footer"><div className="gantt-legend" aria-label="일정 범례">
      {legend.plan && <span><i className="gantt-legend-plan" />계획</span>}
      {legend.progress && <span><i className="gantt-legend-progress" />진행률</span>}
      {legend.phase && <span><i className="gantt-legend-phase" />단계 일정</span>}
      {legend.partial && <span>↥ 시작일·종료일 중 일부만 설정</span>}
      {legend.delayed && <span>! 일정 지연</span>}
    </div></div>}
  </section></TooltipProvider>;
}
