import type { CompanyProjectWorkItem } from "@/types";

export const MAX_PROJECT_WORK_DEPTH = 5;
export const MAX_PROJECT_UI_DEPTH = MAX_PROJECT_WORK_DEPTH + 1;

export interface ProjectWorkTreeNode {
  item: CompanyProjectWorkItem;
  /** Display parent. A missing parent or one edge of a cycle is detached. */
  parentId: number | null;
  /** Original server parent, retained to avoid inventing a complete hierarchy. */
  sourceParentId: number | null;
  ancestryIncomplete: boolean;
}

export interface ProjectWorkTreeWarning {
  type: "invalid-id" | "foreign-project" | "duplicate-id" | "invalid-parent" | "missing-parent" | "cycle";
  itemId: number | null;
  message: string;
}

export interface ProjectWorkTree {
  nodes: Map<number, ProjectWorkTreeNode>;
  rootIds: number[];
  childrenByParent: Map<number | null, number[]>;
  warnings: ProjectWorkTreeWarning[];
}

function isPositiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function belongsToProject(item: CompanyProjectWorkItem, projectId?: number) {
  // The detail and children routes scope items to their project even when the
  // response omits company_project_id. An explicit conflicting ID is rejected.
  return projectId === undefined || item.company_project_id === undefined || item.company_project_id === projectId;
}

/** Display-only fallback, shared by Phase and Work. Never persisted. */
export function compareProjectOrder(leftOrder: unknown, leftId: number, rightOrder: unknown, rightId: number) {
  const left = typeof leftOrder === "number" && Number.isFinite(leftOrder) ? leftOrder : 0;
  const right = typeof rightOrder === "number" && Number.isFinite(rightOrder) ? rightOrder : 0;
  return left - right || leftId - rightId;
}

export function compareWorkItems(left: CompanyProjectWorkItem, right: CompanyProjectWorkItem) {
  return compareProjectOrder(left.sort_order, left.company_project_work_item_id, right.sort_order, right.company_project_work_item_id);
}

/** Merge route-scoped responses by resource ID without duplicating a row. */
export function mergeProjectWorkItems(
  existing: readonly CompanyProjectWorkItem[],
  incoming: readonly CompanyProjectWorkItem[],
  projectId?: number,
) {
  const items = new Map<number, CompanyProjectWorkItem>();
  for (const item of [...existing, ...incoming]) {
    if (item && isPositiveId(item.company_project_work_item_id) && belongsToProject(item, projectId)) {
      items.set(item.company_project_work_item_id, item);
    }
  }
  return [...items.values()];
}

/** Phase remains a grouping resource and never becomes a work item's parent. */
export function buildProjectWorkTree(
  items: readonly CompanyProjectWorkItem[],
  projectId?: number,
): ProjectWorkTree {
  const nodes = new Map<number, ProjectWorkTreeNode>();
  const warnings: ProjectWorkTreeWarning[] = [];
  for (const item of items) {
    const itemId = item?.company_project_work_item_id;
    if (!item || !isPositiveId(itemId)) {
      warnings.push({ type: "invalid-id", itemId: null, message: "식별 정보를 확인할 수 없는 업무가 있습니다." });
      continue;
    }
    if (!belongsToProject(item, projectId)) {
      warnings.push({ type: "foreign-project", itemId, message: "다른 프로젝트에 속한 업무가 응답에 포함되어 있습니다." });
      continue;
    }
    if (nodes.has(itemId)) {
      warnings.push({ type: "duplicate-id", itemId, message: "중복된 업무 응답을 하나의 행으로 표시합니다." });
    }
    const rawParent = item.parent_work_item_id;
    const invalidParent = rawParent !== undefined && rawParent !== null && !isPositiveId(rawParent);
    const parentId = isPositiveId(rawParent) ? rawParent : null;
    nodes.set(itemId, { item, parentId, sourceParentId: parentId, ancestryIncomplete: invalidParent });
    if (invalidParent) {
      warnings.push({ type: "invalid-parent", itemId, message: "상위 업무 식별 정보를 확인할 수 없습니다." });
    }
  }

  for (const [itemId, node] of nodes) {
    if (node.parentId !== null && !nodes.has(node.parentId)) {
      node.parentId = null;
      node.ancestryIncomplete = true;
      warnings.push({ type: "missing-parent", itemId, message: "상위 업무가 아직 조회되지 않은 업무가 있습니다." });
    }
  }

  // Walk each parent chain once. Detaching one stable edge makes a malformed
  // cycle reviewable in the table without silently treating its depth as valid.
  const resolved = new Set<number>();
  for (const itemId of nodes.keys()) {
    if (resolved.has(itemId)) continue;
    const path: number[] = [];
    const positions = new Map<number, number>();
    let cursor: number | null = itemId;
    while (cursor !== null && !resolved.has(cursor)) {
      const cycleStart = positions.get(cursor);
      if (cycleStart !== undefined) {
        const cycle = path.slice(cycleStart);
        const rootId = cycle.reduce((smallest, id) => Math.min(smallest, id), cycle[0]);
        const root = nodes.get(rootId)!;
        root.parentId = null;
        for (const cycleId of cycle) nodes.get(cycleId)!.ancestryIncomplete = true;
        warnings.push({ type: "cycle", itemId: rootId, message: "업무의 상위 관계가 순환하여 계층 일부를 확인할 수 없습니다." });
        break;
      }
      positions.set(cursor, path.length);
      path.push(cursor);
      cursor = nodes.get(cursor)?.parentId ?? null;
    }
    for (const resolvedId of path) resolved.add(resolvedId);
  }

  const childrenByParent = new Map<number | null, number[]>();
  for (const [itemId, node] of nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(itemId);
    childrenByParent.set(node.parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) => compareWorkItems(nodes.get(left)!.item, nodes.get(right)!.item));
  }
  return { nodes, rootIds: childrenByParent.get(null) ?? [], childrenByParent, warnings };
}

/** Available ancestors ordered from the displayed root through the item itself. */
export function getWorkItemAncestorPath(tree: ProjectWorkTree, itemId: number): CompanyProjectWorkItem[] {
  const path: CompanyProjectWorkItem[] = [];
  const seen = new Set<number>();
  let cursor: number | null = itemId;
  while (cursor !== null && !seen.has(cursor)) {
    const node = tree.nodes.get(cursor);
    if (!node) break;
    seen.add(cursor);
    path.push(node.item);
    cursor = node.parentId;
  }
  return path.reverse();
}

export function getWorkItemDepthInfo(tree: ProjectWorkTree, itemId: number) {
  const path = getWorkItemAncestorPath(tree, itemId);
  const item = tree.nodes.get(itemId)?.item;
  const ancestryComplete = !!item && path.every((ancestor) => !tree.nodes.get(ancestor.company_project_work_item_id)!.ancestryIncomplete);
  const backendDepthLevel = typeof item?.depth_level === "number" && Number.isSafeInteger(item.depth_level) &&
    item.depth_level >= 1 && item.depth_level <= MAX_PROJECT_WORK_DEPTH
    ? item.depth_level
    : null;
  return {
    // Project is D1; a root work item is D2. Phase adds no depth. This conversion
    // uses verified parent links. The backend also counts root work items as 1.
    uiDepth: ancestryComplete ? path.length + 1 : null,
    workItemDepth: ancestryComplete ? path.length : null,
    backendDepthLevel,
    ancestryComplete,
  };
}

/** Null means ancestry is incomplete and creation needs further verification. */
export function getWorkItemUiDepth(tree: ProjectWorkTree, itemId: number): number | null {
  return getWorkItemDepthInfo(tree, itemId).uiDepth;
}

/** Validate known relationships; the server also validates unloaded descendants. */
export function getProjectWorkParentError(tree: ProjectWorkTree, parentId: number, itemId?: number): string | null {
  if (!tree.nodes.has(parentId)) return "상위 업무를 아직 확인할 수 없습니다.";
  const path = getWorkItemAncestorPath(tree, parentId);
  if (itemId !== undefined && path.some((item) => item.company_project_work_item_id === itemId)) {
    return "자기 자신이나 하위 업무를 상위 업무로 지정할 수 없습니다.";
  }
  const info = getWorkItemDepthInfo(tree, parentId);
  const depth = info.workItemDepth ?? info.backendDepthLevel;
  if (depth === null) return "상위 업무의 깊이를 확인할 수 없습니다.";
  let height = 1;
  if (itemId !== undefined) {
    for (const id of tree.nodes.keys()) {
      const descendants = getWorkItemAncestorPath(tree, id);
      const index = descendants.findIndex((item) => item.company_project_work_item_id === itemId);
      if (index !== -1) height = Math.max(height, descendants.length - index);
    }
  }
  return depth + height > MAX_PROJECT_WORK_DEPTH
    ? "업무 계층은 최대 5단계입니다. 다른 위치를 선택해 주세요."
    : null;
}
