import type { CompanyProjectAssignment } from "@/types";
import type { buildProjectHierarchy } from "./projectHierarchy";
import { matchesProjectAssigneeFilter, projectActiveAssignees } from "./projectMembers";
import type { ProjectWorkTree } from "./projectWorkTree";

export interface ProjectGanttFilters {
  search: string;
  status: string;
  priority: string;
  phase: string;
  assignee: string;
  unassignedOnly: boolean;
}

export const emptyProjectGanttFilters: ProjectGanttFilters = {
  search: "", status: "all", priority: "all", phase: "all", assignee: "all", unassignedOnly: false,
};

/** Relationship coverage is independent from whether the work item was loaded. */
export function getProjectGanttAssignmentState(assignments: CompanyProjectAssignment[], known: boolean) {
  const active = projectActiveAssignees(assignments);
  const privateCount = active.filter((assignment) => assignment.assignee_company_member_id === 0).length;
  const identifiedCount = active.filter((assignment) =>
    typeof assignment.assignee_company_member_id === "number" && assignment.assignee_company_member_id > 0).length;
  const coverage = known ? "complete" : assignments.length ? "partial" : "unqueried";
  const kind = known && active.length === 0 ? "unassigned"
    : identifiedCount > 0 ? "active" : privateCount > 0 ? "private" : "unknown";
  return { coverage, kind, activeCount: active.length, privateCount, identifiedCount } as const;
}

/** Filter the original graph; returned ancestor IDs never become direct matches. */
export function filterProjectGanttItems(
  graph: ProjectWorkTree,
  hierarchy: Pick<ReturnType<typeof buildProjectHierarchy>, "displayPhaseByWorkId">,
  filters: ProjectGanttFilters,
  assignmentsByWorkId: ReadonlyMap<number, CompanyProjectAssignment[]>,
  assignmentKnownIds: ReadonlySet<number>,
  phased: boolean,
) {
  const query = filters.search.trim().toLocaleLowerCase();
  const filtering = Boolean(query) || filters.status !== "all" || filters.priority !== "all" ||
    (phased && filters.phase !== "all") || filters.assignee !== "all" || filters.unassignedOnly;
  const matchingIds = new Set<number>();
  const includedIds = filtering ? new Set<number>() : null;
  let knownCount = 0;
  let partialCount = 0;
  let unqueriedCount = 0;

  for (const [id, node] of graph.nodes) {
    const assignments = assignmentsByWorkId.get(id) ?? [];
    const known = assignmentKnownIds.has(id);
    if (known) knownCount += 1;
    else if (assignments.length) partialCount += 1;
    else unqueriedCount += 1;
    const item = node.item;
    if (query && !item.title.toLocaleLowerCase().includes(query)) continue;
    if (filters.status !== "all" && item.status !== filters.status) continue;
    if (filters.priority !== "all" && item.priority !== filters.priority) continue;
    // A descendant stays under its existing WBS Phase group, even when its own
    // Phase relationship differs. No source Phase or parent relationship moves.
    const phase = hierarchy.displayPhaseByWorkId.get(id);
    if (phased && filters.phase !== "all" && String(phase?.company_project_phase_id ?? "none") !== filters.phase) continue;
    if (!matchesProjectAssigneeFilter(assignments, known, filters.assignee, filters.unassignedOnly)) continue;
    matchingIds.add(id);
    if (!includedIds) continue;
    let cursor: number | null = id;
    // Previously included ancestors already have their full displayed path.
    while (cursor !== null && !includedIds.has(cursor)) {
      const ancestor = graph.nodes.get(cursor);
      if (!ancestor) break;
      includedIds.add(cursor);
      cursor = ancestor.parentId;
    }
  }

  return {
    filtering, matchingIds, includedIds,
    assignmentCoverage: {
      knownCount, partialCount, unqueriedCount, totalCount: graph.nodes.size,
      complete: knownCount === graph.nodes.size,
    },
  };
}
