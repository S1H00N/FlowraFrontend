import type { CompanyProjectDetailData, CompanyProjectDetailPolicy, CompanyProjectPhase } from "@/types";
import { compareProjectOrder, getWorkItemDepthInfo, type ProjectWorkTree } from "./projectWorkTree";

export type ProjectHierarchyKey = `phase:${number}` | `work:${number}` | "group:unassigned";
export const phaseKey = (id: number): ProjectHierarchyKey => `phase:${id}`;
export const workKey = (id: number): ProjectHierarchyKey => `work:${id}`;
export type ProjectWorkSearchScope = "complete" | "loaded" | "invalid";

export interface ProjectHierarchyGroup {
  key: ProjectHierarchyKey;
  phase?: CompanyProjectPhase;
  rootIds: number[];
}

/** null identifies the complete project root sibling set. Counts are not evidence. */
export function getCompleteProjectSiblingSets(
  graph: ProjectWorkTree,
  policy: CompanyProjectDetailPolicy | undefined,
  successfulParentIds: Iterable<number>,
) {
  const complete = new Set<number | null>(successfulParentIds);
  const full = policy?.mode === "full" && policy.max_depth === 5;
  const summary = policy?.mode === "summary" && policy.max_depth === 2;
  // Malformed source rows can hide a sibling or detach one into a fake root.
  // Successful direct responses still establish their own sibling sets.
  if ((full || summary) && graph.warnings.length === 0) {
    complete.add(null);
    for (const id of graph.nodes.keys()) {
      const depth = getWorkItemDepthInfo(graph, id).workItemDepth;
      if (depth !== null && (full || depth === 1)) complete.add(id);
    }
  }
  return complete;
}

/** Root and every direct branch must be authoritative before search is global. */
export function getProjectWorkSearchScope(
  graph: ProjectWorkTree,
  completeSiblingSets: ReadonlySet<number | null>,
  totalWorkItemCount?: number,
  detailSnapshot?: Pick<CompanyProjectDetailData, "work_items" | "detail_policy">,
): ProjectWorkSearchScope {
  if (graph.warnings.length > 0) return "invalid";
  if (!completeSiblingSets.has(null)) return "loaded";
  for (const id of graph.nodes.keys()) {
    if (!completeSiblingSets.has(id)) return "loaded";
  }
  // A total can disprove completeness, but cannot prove an unloaded branch empty.
  if (totalWorkItemCount !== undefined &&
      (!Number.isSafeInteger(totalWorkItemCount) || totalWorkItemCount < 0 ||
       graph.nodes.size !== totalWorkItemCount)) return "loaded";
  if (detailSnapshot) {
    const returnedCount = detailSnapshot.detail_policy?.returned_work_item_count;
    // This count describes the original detail payload, before lazy branches merge.
    if (typeof returnedCount !== "number" || !Number.isSafeInteger(returnedCount) ||
        returnedCount < 0 || returnedCount !== detailSnapshot.work_items.length) return "loaded";
  }
  return "complete";
}

/** Build once from the unfiltered graph; visibility never participates in WBS. */
export function buildProjectHierarchy(
  graph: ProjectWorkTree,
  sourcePhases: readonly CompanyProjectPhase[],
  phased: boolean,
  completeSiblingSets: ReadonlySet<number | null>,
) {
  const phases = [...sourcePhases].sort((a, b) => compareProjectOrder(
    a.sort_order, a.company_project_phase_id, b.sort_order, b.company_project_phase_id,
  ));
  const groups: ProjectHierarchyGroup[] = phased
    ? phases.map((phase) => ({ key: phaseKey(phase.company_project_phase_id), phase, rootIds: [] }))
    : [];
  const unassigned: ProjectHierarchyGroup = { key: "group:unassigned", rootIds: [] };
  const groupByPhase = new Map(groups.map((group) => [group.phase!.company_project_phase_id, group]));
  for (const id of graph.rootIds) {
    const node = graph.nodes.get(id)!;
    (groupByPhase.get(node.item.company_project_phase_id ?? -1) ?? unassigned).rootIds.push(id);
  }
  groups.push(unassigned);

  const wbsByKey = new Map<ProjectHierarchyKey, string>();
  const parentByKey = new Map<ProjectHierarchyKey, ProjectHierarchyKey | null>();
  const displayPhaseByWorkId = new Map<number, CompanyProjectPhase | undefined>();
  const visited = new Set<number>();
  function visit(id: number, parent: ProjectHierarchyKey | null, candidate: string | undefined, phase?: CompanyProjectPhase) {
    if (visited.has(id)) return;
    visited.add(id);
    const key = workKey(id);
    const node = graph.nodes.get(id)!;
    const number = node.ancestryIncomplete ? undefined : candidate;
    parentByKey.set(key, parent);
    displayPhaseByWorkId.set(id, phase);
    if (number !== undefined) wbsByKey.set(key, number);
    const children = graph.childrenByParent.get(id) ?? [];
    children.forEach((childId, index) => visit(childId, key,
      number !== undefined && completeSiblingSets.has(id) ? `${number}.${index + 1}` : undefined, phase));
  }
  groups.forEach((group, index) => {
    parentByKey.set(group.key, null);
    if (group.phase) wbsByKey.set(group.key, String(index + 1));
    group.rootIds.forEach((id, rootIndex) => {
      const root = graph.nodes.get(id)!;
      const unknownPhase = phased && root.item.company_project_phase_id != null && !groupByPhase.has(root.item.company_project_phase_id);
      const number = !unknownPhase && completeSiblingSets.has(null)
        ? group.phase ? `${index + 1}.${rootIndex + 1}` : String((phased ? phases.length : 0) + rootIndex + 1)
        : undefined;
      visit(id, phased ? group.key : null, number, group.phase);
    });
  });
  return { phases, groups, wbsByKey, parentByKey, displayPhaseByWorkId };
}

export function projectHierarchyTitle(title: string, number: string | undefined) {
  if (number === undefined) return title;
  // Preserve the stored name, including intentional numbers, without repeating
  // an identical hierarchy prefix already present in a legacy title.
  const suffix = title.startsWith(number) ? title.slice(number.length) : "";
  return /^(?:\.\s|\s)/.test(suffix) ? title : `${number}. ${title}`;
}
