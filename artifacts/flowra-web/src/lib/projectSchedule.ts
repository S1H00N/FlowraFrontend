import type { CompanyProjectPhase } from "@/types";
import type { ProjectWorkTree } from "./projectWorkTree";

export interface PlannedPeriod {
  planned_start_date?: string | null;
  planned_end_date?: string | null;
}

export interface ScheduleSource extends PlannedPeriod {
  status?: string;
  completed_at?: string | null;
}

export function isValidProjectDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number(value.slice(0, 4)) > 0 && Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}

export function projectDate(value?: string | null) {
  const key = value?.slice(0, 10) ?? "";
  return isValidProjectDate(key) ? key : "";
}

function dayDifference(later: string, earlier: string) {
  // UTC is used only as a calendar-day ordinal, never to convert date-only inputs.
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

export function projectSchedule(source: ScheduleSource, today: string) {
  const start = projectDate(source.planned_start_date);
  const end = projectDate(source.planned_end_date);
  if (source.status === "cancelled") return { kind: "cancelled", label: "취소", delayedDays: 0 } as const;
  if (source.status === "archived") return { kind: "archived", label: "보관", delayedDays: 0 } as const;
  // completed_at is independent of status in this API. Never infer completion from it.
  if (source.status === "done" || source.status === "completed") {
    return { kind: "completed", label: "완료", delayedDays: 0 } as const;
  }
  if ((start && end && start > end) ||
      (source.planned_start_date && !start) || (source.planned_end_date && !end)) {
    return { kind: "invalid", label: "일정 확인 필요", delayedDays: 0 } as const;
  }
  if (!start && !end) return { kind: "unset", label: "일정 미정", delayedDays: 0 } as const;
  if (end && end < today) {
    const delayedDays = dayDifference(today, end);
    return { kind: "delayed", label: `${delayedDays}일 지연`, delayedDays } as const;
  }
  if (end === today) return { kind: "due", label: "오늘 종료 예정", delayedDays: 0 } as const;
  if (start > today) return { kind: "upcoming", label: "시작 예정", delayedDays: 0 } as const;
  if (start === today) return { kind: "starting", label: "시작 예정일 도달", delayedDays: 0 } as const;
  return { kind: "normal", label: "일정 정상", delayedDays: 0 } as const;
}

/** Fill only empty dates; an explicit click never discards a user's input. */
export function applyParentPeriod(child: PlannedPeriod, parent: PlannedPeriod): PlannedPeriod {
  return {
    planned_start_date: child.planned_start_date || projectDate(parent.planned_start_date) || null,
    planned_end_date: child.planned_end_date || projectDate(parent.planned_end_date) || null,
  };
}

export function periodWarnings(child: PlannedPeriod, parent: PlannedPeriod) {
  const start = projectDate(child.planned_start_date);
  const end = projectDate(child.planned_end_date);
  const parentStart = projectDate(parent.planned_start_date);
  const parentEnd = projectDate(parent.planned_end_date);
  const warnings: string[] = [];
  if (start && parentStart && start < parentStart)
    warnings.push(`시작일이 ${dayDifference(parentStart, start)}일 빠릅니다.`);
  if (end && parentEnd && end > parentEnd)
    warnings.push(`종료일이 ${dayDifference(end, parentEnd)}일 늦습니다.`);
  return warnings;
}

/** Each delayed ID contributes once to the project and once to each related ancestor. */
export function aggregateProjectDelays(graph: ProjectWorkTree, today: string) {
  const project = new Set<number>();
  const phases = new Map<number, Set<number>>();
  const work = new Map<number, Set<number>>();
  function add(map: Map<number, Set<number>>, key: number, id: number) {
    const ids = map.get(key) ?? new Set<number>();
    ids.add(id);
    map.set(key, ids);
  }
  for (const [id, node] of graph.nodes) {
    if (projectSchedule(node.item, today).kind !== "delayed") continue;
    project.add(id);
    const visited = new Set<number>();
    let cursor: number | null = id;
    while (cursor !== null && !visited.has(cursor)) {
      visited.add(cursor);
      const ancestor = graph.nodes.get(cursor);
      if (!ancestor) break;
      if (cursor !== id) add(work, cursor, id);
      const phaseId = ancestor.item.company_project_phase_id;
      if (phaseId != null) add(phases, phaseId, id);
      cursor = ancestor.sourceParentId;
    }
  }
  return { project, phases, work };
}

export interface ParentPeriodOption extends PlannedPeriod {
  key: string;
  label: string;
}

export function parentPeriodOptions(
  parentId: string, phaseId: string, graph: ProjectWorkTree,
  phases: readonly CompanyProjectPhase[], project: PlannedPeriod,
): ParentPeriodOption[] {
  const options: ParentPeriodOption[] = [];
  if (parentId !== "none") {
    const parent = graph.nodes.get(Number(parentId))?.item;
    if (parent) options.push({ ...parent, key: `work:${parentId}`, label: `상위 업무: ${parent.title}` });
  }
  if (phaseId !== "none") {
    const phase = phases.find((item) => item.company_project_phase_id === Number(phaseId));
    if (phase) options.push({ ...phase, key: `phase:${phaseId}`, label: `연결 단계: ${phase.name}` });
  }
  // Do not silently substitute project dates for a parent that has not been loaded.
  if (parentId === "none" && phaseId === "none")
    options.push({ ...project, key: "project", label: "상위 프로젝트" });
  return options;
}
