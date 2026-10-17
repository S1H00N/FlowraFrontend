import { useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { getCompanyProject, hasCompanyProjectAssignmentCoverage, listCompanyProjectWorkItemChildren } from "@/api/companyProjects";
import { companyProjectDetailKey, companyProjectWorkItemChildrenKey } from "@/hooks/useCompanyProjects";
import { buildProjectWorkTree } from "@/lib/projectWorkTree";
import { buildProjectHierarchy, getCompleteProjectSiblingSets, getProjectWorkSearchScope } from "@/lib/projectHierarchy";
import type {
  CompanyProjectDetailData,
  CompanyProjectWorkItem,
  CompanyProjectWorkItemChildrenData,
} from "@/types";

interface ChildrenSnapshot {
  parentId: number;
  items: CompanyProjectWorkItem[];
  parent?: CompanyProjectWorkItem;
  data?: CompanyProjectWorkItemChildrenData;
  updatedAt: number;
}

/** A successful depth=1 response replaces that parent's complete direct branch. */
function mergeChildrenSnapshots(
  detail: CompanyProjectDetailData,
  snapshots: ChildrenSnapshot[],
) {
  const projectId = detail.project.company_project_id;
  const byId = new Map(detail.work_items.map((item) => [item.company_project_work_item_id, item]));
  const pending = new Map(snapshots.sort((a, b) => a.updatedAt - b.updatedAt)
    .map((snapshot) => [snapshot.parentId, snapshot]));
  let progressed = true;
  while (pending.size && progressed) {
    progressed = false;
    for (const [parentId, snapshot] of pending) {
      const parent = byId.get(parentId);
      // Load the ancestor's authoritative branch first. Cached descendants must
      // never recreate a parent missing from the current project response.
      if (!parent || (parent.parent_work_item_id && pending.has(parent.parent_work_item_id))) continue;
      if (snapshot.parent) byId.set(parentId, snapshot.parent);
      const incomingIds = new Set(snapshot.items.map((item) => item.company_project_work_item_id));
      const childrenByParent = new Map<number, number[]>();
      for (const item of byId.values()) {
        if (!item.parent_work_item_id) continue;
        const list = childrenByParent.get(item.parent_work_item_id) ?? [];
        list.push(item.company_project_work_item_id);
        childrenByParent.set(item.parent_work_item_id, list);
      }
      const removed = (childrenByParent.get(parentId) ?? []).filter((id) => !incomingIds.has(id));
      const visited = new Set<number>();
      while (removed.length) {
        const id = removed.pop()!;
        if (visited.has(id)) continue;
        visited.add(id);
        byId.delete(id);
        removed.push(...(childrenByParent.get(id) ?? []));
      }
      for (const item of snapshot.items) {
        if (item.company_project_id !== undefined && item.company_project_id !== projectId) continue;
        byId.set(item.company_project_work_item_id, item);
      }
      pending.delete(parentId);
      progressed = true;
    }
  }
  return [...byId.values()];
}

export function mergeProjectWorkRelationships(
  detail: CompanyProjectDetailData,
  snapshots: CompanyProjectWorkItemChildrenData[],
  items: CompanyProjectWorkItem[],
  assignmentsCurrent = true,
) {
  const loadedIds = new Set(items.map((item) => item.company_project_work_item_id));
  const assignmentKnownIds = new Set<number>();
  const assignments = new Map<string, CompanyProjectDetailData["assignments"][number]>();
  const dependencies = new Map<number, CompanyProjectDetailData["dependencies"][number]>();
  const departments = new Map<string, Record<string, unknown>>();
  for (const source of [detail, ...snapshots]) {
    const returnedIds = new Set(("work_items" in source ? source.work_items : source.items)
      .map((item) => item.company_project_work_item_id).filter((id) => loadedIds.has(id)));
    // Only returned items have complete relationships. The children response's
    // parent is a navigation anchor, not another complete assignment snapshot.
    for (const id of returnedIds) {
      assignmentKnownIds.delete(id);
      if (hasCompanyProjectAssignmentCoverage(source)) assignmentKnownIds.add(id);
    }
    for (const [key, assignment] of assignments)
      if (returnedIds.has(assignment.company_project_work_item_id ?? 0)) assignments.delete(key);
    if (source !== detail) {
      for (const [key, department] of departments)
        if (returnedIds.has(Number(department.company_project_work_item_id))) departments.delete(key);
      for (const [key, dependency] of dependencies)
        if (returnedIds.has(dependency.predecessor_work_item_id) || returnedIds.has(dependency.successor_work_item_id)) dependencies.delete(key);
    }
    for (const assignment of source.assignments) {
      if (!returnedIds.has(assignment.company_project_work_item_id ?? 0)) continue;
      const id = assignment.company_project_work_assignment_id ?? assignment.assignment_id;
      const key = id === undefined
        ? `${assignment.company_project_work_item_id}:${assignment.assignee_company_member_id}:${assignment.role}`
        : String(id);
      assignments.set(key, assignment);
    }
    for (const dependency of source.dependencies) {
      if (loadedIds.has(dependency.predecessor_work_item_id) || loadedIds.has(dependency.successor_work_item_id))
        dependencies.set(dependency.company_project_work_dependency_id, dependency);
    }
    for (const department of source.departments) {
      if (!loadedIds.has(Number(department.company_project_work_item_id))) continue;
      const key = String(department.company_project_work_department_id ??
        `${department.company_project_work_item_id}:${department.department_id}:${department.role}`);
      departments.set(key, department);
    }
  }
  return { assignments: assignmentsCurrent ? [...assignments.values()] : [],
    assignmentKnownIds: assignmentsCurrent ? assignmentKnownIds : new Set<number>(),
    dependencies: [...dependencies.values()], departments: [...departments.values()] };
}

/** Mount a fresh session per project; each detail refresh starts a new snapshot. */
export function useProjectWorkTree(
  detail: CompanyProjectDetailData,
  detailUpdatedAt: number,
) {
  const projectId = detail.project.company_project_id;
  const queryClient = useQueryClient();
  // A timestamp can repeat for fast responses (or a fixed browser clock).
  // Query state counts every successful detail refresh, including shared data.
  const detailState = queryClient.getQueryState(companyProjectDetailKey(projectId));
  const detailRevision = detailState?.dataUpdateCount ?? detailUpdatedAt;
  const assignmentsCurrent = detailState?.status !== "error";
  const [requested, setRequested] = useState<number[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const snapshotKey = (parentId: number) => [
    ...companyProjectWorkItemChildrenKey(projectId, parentId, { depth: 1 }),
    "tree-snapshot", detailRevision,
  ] as const;

  // A successful current ancestor snapshot must anchor each descendant query.
  // Removing an observer also aborts its obsolete request through AbortSignal.
  const cachedSnapshots: ChildrenSnapshot[] = [];
  for (const parentId of requested) {
    const state = queryClient.getQueryState<CompanyProjectWorkItemChildrenData>(snapshotKey(parentId));
    if (state?.status === "success" && state.data) {
      cachedSnapshots.push({ parentId, items: state.data.items, parent: state.data.parent, data: state.data, updatedAt: state.dataUpdatedAt });
    }
  }
  const anchoredIds = new Set(mergeChildrenSnapshots(detail, cachedSnapshots)
    .map((item) => item.company_project_work_item_id));
  const activeRequested = requested.filter((id) => anchoredIds.has(id));
  const queries = useQueries({
    queries: activeRequested.map((workItemId) => ({
      queryKey: snapshotKey(workItemId),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const response = await listCompanyProjectWorkItemChildren(
          projectId, workItemId, { depth: 1 }, { signal },
        );
        if (!response.success) throw new Error(response.message || "하위 업무를 불러오지 못했습니다.");
        return response.data;
      },
      retry: false,
      staleTime: 30_000,
      structuralSharing: false,
    })),
  });
  const queryById = new Map(activeRequested.map((id, index) => [id, queries[index]]));
  const items = useMemo(() => mergeChildrenSnapshots(detail, queries.flatMap((query, index) =>
    query.data && !query.isError
      ? [{ parentId: activeRequested[index], items: query.data.items, parent: query.data.parent, data: query.data, updatedAt: query.dataUpdatedAt }]
      : [],
  )), [detail, queries, activeRequested]);
  const byId = new Map(items.map((item) => [item.company_project_work_item_id, item]));
  const graph = buildProjectWorkTree(items, projectId);
  const children = new Map<number, CompanyProjectWorkItem[]>();
  for (const [parentId, ids] of graph.childrenByParent) {
    if (parentId !== null) children.set(parentId, ids.map((id) => byId.get(id)!));
  }
  const completeSiblingSets = getCompleteProjectSiblingSets(graph, detail.detail_policy,
    activeRequested.filter((id) => queryById.get(id)?.isSuccess));
  const hierarchy = buildProjectHierarchy(graph, detail.phases, detail.project.phase_mode === "phased", completeSiblingSets);
  const searchScope = getProjectWorkSearchScope(graph, completeSiblingSets, detail.summary?.work_item_count, detail);
  const mayBePartial = searchScope !== "complete";
  const relationships = useMemo(() => {
    const snapshots = queries.filter((query) => query.data && !query.isError)
      .sort((left, right) => left.dataUpdatedAt - right.dataUpdatedAt)
      .map((query) => query.data!);
    // A failed refresh can retain old detail data. It must not permit another
    // assignment write against the pre-mutation assignee list or progress.
    return mergeProjectWorkRelationships(detail, snapshots, items, assignmentsCurrent);
  }, [detail, queries, items, assignmentsCurrent]);

  async function refreshAssignments() {
    const detailKey = companyProjectDetailKey(projectId);
    const childrenPrefix = [...companyProjectWorkItemChildrenKey(projectId, null).slice(0, 3)];
    await Promise.all([
      queryClient.cancelQueries({ queryKey: detailKey, exact: true }),
      queryClient.cancelQueries({ queryKey: childrenPrefix }),
    ]);
    const refreshed = await queryClient.fetchQuery({
      queryKey: detailKey,
      queryFn: async ({ signal }) => {
        const response = await getCompanyProject(projectId, { signal });
        if (!response.success) throw new Error(response.message || "담당자 정보를 다시 불러오지 못했습니다.");
        return response.data;
      },
      structuralSharing: false, retry: false, staleTime: 0,
    });
    const revision = queryClient.getQueryState(detailKey)?.dataUpdateCount;
    const snapshots: ChildrenSnapshot[] = [];
    const pending = new Set(requested);
    while (pending.size) {
      const anchored = new Set(mergeChildrenSnapshots(refreshed, snapshots).map((item) => item.company_project_work_item_id));
      const parents = [...pending].filter((id) => anchored.has(id));
      if (!parents.length) break;
      for (const parentId of parents) {
        pending.delete(parentId);
        const key = [...companyProjectWorkItemChildrenKey(projectId, parentId, { depth: 1 }), "tree-snapshot", revision] as const;
        const data = await queryClient.fetchQuery({
          queryKey: key,
          queryFn: async ({ signal }) => {
            const response = await listCompanyProjectWorkItemChildren(projectId, parentId, { depth: 1 }, { signal });
            if (!response.success) throw new Error(response.message || "담당자 정보를 다시 불러오지 못했습니다.");
            return response.data;
          },
          structuralSharing: false, retry: false, staleTime: 0,
        });
        snapshots.push({ parentId, items: data.items, parent: data.parent, data, updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt ?? 0 });
      }
    }
    if (queryClient.getQueryState(detailKey)?.dataUpdateCount !== revision ||
      !hasCompanyProjectAssignmentCoverage(refreshed) || snapshots.some((snapshot) => !hasCompanyProjectAssignmentCoverage(snapshot.data!)))
      throw new Error("최신 담당자 정보를 확인할 수 없습니다. 다시 조회해 주세요.");
  }

  function needsChildren(item: CompanyProjectWorkItem) {
    const id = item.company_project_work_item_id;
    // A successful empty branch is complete, even if a rollup disagrees.
    // Conversely, child_count=0 must not block explicit exploration.
    return !completeSiblingSets.has(id);
  }
  function hasChildren(item: CompanyProjectWorkItem) {
    return Boolean(children.get(item.company_project_work_item_id)?.length) || needsChildren(item) ||
      Boolean(queryById.get(item.company_project_work_item_id)?.isError);
  }
  function loadChildren(item: CompanyProjectWorkItem) {
    const id = item.company_project_work_item_id;
    const query = queryById.get(id);
    if (query?.isError && !query.isFetching) {
      void query.refetch();
    } else if (needsChildren(item)) {
      if (query && !query.isFetching) void query.refetch();
      else setRequested((previous) => previous.includes(id) ? previous : [...previous, id]);
    }
  }
  function toggle(item: CompanyProjectWorkItem) {
    const id = item.company_project_work_item_id;
    if (!expanded.has(id)) loadChildren(item);
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function expandLoaded() {
    // Expand the loaded graph without recursively fetching a large project.
    setExpanded(new Set(items.filter((item) => children.get(item.company_project_work_item_id)?.length)
      .map((item) => item.company_project_work_item_id)));
  }
  return {
    items, byId, graph, hierarchy, completeSiblingSets, children, expanded, queryById, needsChildren, hasChildren,
    loadChildren, toggle, expandLoaded, collapseAll: () => setExpanded(new Set<number>()), searchScope, mayBePartial, refreshAssignments,
    ...relationships,
  };
}
