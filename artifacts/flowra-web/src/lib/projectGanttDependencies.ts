import type { CompanyProjectWorkDependency, CompanyProjectWorkItem } from "../types/companyProject";
import { getProjectGanttPeriod, type ProjectGanttAxis } from "./projectGantt";

export interface ProjectGanttDependencyRow {
  kind: string;
  item?: CompanyProjectWorkItem;
}

export interface ProjectGanttDependencyPoint { x: number; y: number }
export type ProjectGanttDependencyHiddenReason = "outside-query" | "hidden-row" | "missing-date" | "invalid-date" | "unknown-type";
export interface ProjectGanttDependencyRelation {
  dependency: CompanyProjectWorkDependency;
  predecessor?: CompanyProjectWorkItem;
  successor?: CompanyProjectWorkItem;
  typeLabel: string;
  hiddenReason: ProjectGanttDependencyHiddenReason | null;
  geometry: {
    from: ProjectGanttDependencyPoint;
    to: ProjectGanttDependencyPoint;
    path: string;
  } | null;
}

const endpoints: Record<string, { from: "start" | "end"; to: "start" | "end"; label: string }> = {
  finish_to_start: { from: "end", to: "start", label: "FS · 종료 → 시작" },
  start_to_start: { from: "start", to: "start", label: "SS · 시작 → 시작" },
  finish_to_finish: { from: "end", to: "end", label: "FF · 종료 → 종료" },
  start_to_finish: { from: "start", to: "end", label: "SF · 시작 → 종료" },
};

export const projectGanttDependencyHiddenLabel: Record<ProjectGanttDependencyHiddenReason, string> = {
  "outside-query": "연결된 업무가 현재 Gantt 조회 범위에 없습니다.",
  "hidden-row": "접힘 또는 필터로 연결된 업무가 현재 표시되지 않습니다.",
  "missing-date": "연결에 필요한 계획 시작일 또는 종료일이 없습니다.",
  "invalid-date": "계획 날짜를 확인해야 하므로 연결선을 표시하지 않습니다.",
  "unknown-type": "관계 유형을 확인해야 하므로 연결선을 표시하지 않습니다.",
};

export function projectGanttDependencyTypeLabel(value: unknown) {
  const type = typeof value === "string" ? value : "";
  return Object.hasOwn(endpoints, type) ? endpoints[type].label : type.trim() ? type : "관계 유형 확인 필요";
}

export function projectGanttDependencyLagLabel(dependency: Pick<CompanyProjectWorkDependency, "lag_days">) {
  const lag = dependency.lag_days;
  return typeof lag === "number" && Number.isFinite(lag)
    ? `lag_days ${lag > 0 ? "+" : ""}${lag}일` : "lag_days 확인 필요";
}

export function projectGanttDependencyDescription(relation: ProjectGanttDependencyRelation) {
  const { dependency, predecessor, successor, typeLabel, hiddenReason } = relation;
  return `${predecessor?.title ?? `업무 #${dependency.predecessor_work_item_id}`} → ${successor?.title ?? `업무 #${dependency.successor_work_item_id}`} · ${typeLabel} · ${projectGanttDependencyLagLabel(dependency)}${hiddenReason ? ` · ${projectGanttDependencyHiddenLabel[hiddenReason]}` : ""}`;
}

/** Use actual rows, including Phase rows, and the bar's existing DATE axis.
 * No inferred parent endpoints or lag-based schedule changes are introduced.
 */
export function buildProjectGanttDependencies(
  dependencies: readonly CompanyProjectWorkDependency[],
  items: readonly CompanyProjectWorkItem[],
  visibleRows: readonly ProjectGanttDependencyRow[],
  axis: ProjectGanttAxis,
  rowHeight = 46,
): ProjectGanttDependencyRelation[] {
  const itemById = new Map(items.map((item) => [item.company_project_work_item_id, item]));
  const rowById = new Map<number, number>();
  visibleRows.forEach((row, index) => {
    if (row.kind === "work" && row.item && !rowById.has(row.item.company_project_work_item_id))
      rowById.set(row.item.company_project_work_item_id, index);
  });
  const seen = new Set<number>();
  const relations: ProjectGanttDependencyRelation[] = [];
  for (const dependency of dependencies) {
    if (seen.has(dependency.company_project_work_dependency_id)) continue;
    seen.add(dependency.company_project_work_dependency_id);
    const predecessor = itemById.get(dependency.predecessor_work_item_id);
    const successor = itemById.get(dependency.successor_work_item_id);
    // The current API validates relation IDs. Safely describe malformed optional
    // metadata instead of rendering an object or inventing a zero-day lag.
    const type = typeof dependency.dependency_type === "string" ? dependency.dependency_type : "";
    const endpoint = Object.hasOwn(endpoints, type) ? endpoints[type] : undefined;
    const relation: ProjectGanttDependencyRelation = {
      dependency, predecessor, successor, typeLabel: projectGanttDependencyTypeLabel(type),
      hiddenReason: null, geometry: null,
    };
    relations.push(relation);
    if (!endpoint) { relation.hiddenReason = "unknown-type"; continue; }
    if (!predecessor || !successor) { relation.hiddenReason = "outside-query"; continue; }
    const fromRow = rowById.get(dependency.predecessor_work_item_id);
    const toRow = rowById.get(dependency.successor_work_item_id);
    if (fromRow === undefined || toRow === undefined) { relation.hiddenReason = "hidden-row"; continue; }
    const fromPeriod = getProjectGanttPeriod(predecessor, axis);
    const toPeriod = getProjectGanttPeriod(successor, axis);
    if (fromPeriod.kind === "invalid" || toPeriod.kind === "invalid") { relation.hiddenReason = "invalid-date"; continue; }
    const fromDate = endpoint.from === "start" ? fromPeriod.start : fromPeriod.end;
    const toDate = endpoint.to === "start" ? toPeriod.start : toPeriod.end;
    if (!fromDate || !toDate) { relation.hiddenReason = "missing-date"; continue; }
    // Inclusive planned ends use exactly the same exclusive boundary as bars.
    const fromX = endpoint.from === "start" ? axis.dateToX(fromDate) : axis.positionToX({ date: fromDate, fraction: 1 });
    const toX = endpoint.to === "start" ? axis.dateToX(toDate) : axis.positionToX({ date: toDate, fraction: 1 });
    if (fromX === null || toX === null) { relation.hiddenReason = "invalid-date"; continue; }
    const from = { x: fromX, y: (fromRow + 0.5) * rowHeight };
    const to = { x: toX, y: (toRow + 0.5) * rowHeight };
    const fromPort = from.x + (endpoint.from === "end" ? 12 : -12);
    const toPort = to.x + (endpoint.to === "start" ? -12 : 12);
    // Route on the source row's boundary instead of through another row's bar.
    const turnY = from.y + (toRow > fromRow ? rowHeight / 2 : -rowHeight / 2);
    relation.geometry = {
      from, to,
      path: `M ${from.x} ${from.y} H ${fromPort} V ${turnY} H ${toPort} V ${to.y} H ${to.x}`,
    };
  }
  return relations;
}
