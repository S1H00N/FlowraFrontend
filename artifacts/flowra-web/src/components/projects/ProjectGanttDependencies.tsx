import { useId, useState } from "react";
import {
  projectGanttDependencyDescription, projectGanttDependencyHiddenLabel, projectGanttDependencyLagLabel,
  type ProjectGanttDependencyRelation,
} from "@/lib/projectGanttDependencies";
import type { CompanyProjectWorkItem } from "@/types";

interface ProjectGanttDependenciesProps {
  relations: readonly ProjectGanttDependencyRelation[];
  width: number;
  height: number;
  wbsWidth: number;
  selectedId: number | null;
  onSelectRelation?: (relation: ProjectGanttDependencyRelation) => void;
}

export function ProjectGanttDependencies({ relations, width, height, wbsWidth, selectedId, onSelectRelation }: ProjectGanttDependenciesProps) {
  const uniqueId = useId().replace(/:/g, "");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const markerId = `gantt-dependency-arrow-${uniqueId}`;
  const clipId = `gantt-dependency-clip-${uniqueId}`;
  return <svg className="gantt-dependencies" data-testid="gantt-dependencies" aria-hidden="true"
    width={width} height={height} style={{ position: "absolute", top: 0, left: wbsWidth, overflow: "hidden", pointerEvents: "none", zIndex: 1 }}>
    <defs>
      <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse" markerUnits="strokeWidth">
        <path d="M 0 0 L 8 4 L 0 8 Z" fill="context-stroke" />
      </marker>
      <clipPath id={clipId}><rect width={width} height={height} /></clipPath>
    </defs>
    <g clipPath={`url(#${clipId})`}>{relations.map((relation) => {
      if (!relation.geometry) return null;
      const { dependency, geometry } = relation;
      const id = dependency.company_project_work_dependency_id;
      const selected = selectedId !== null && (dependency.predecessor_work_item_id === selectedId || dependency.successor_work_item_id === selectedId);
      const highlighted = selected || hoveredId === id;
      return <g key={id} data-dependency-id={id} data-selected={selected || undefined}
        onMouseEnter={() => setHoveredId(id)} onMouseLeave={() => setHoveredId(null)}>
        <title>{projectGanttDependencyDescription(relation)}</title>
        <path d={geometry.path} fill="none" stroke={highlighted ? "var(--flowra-primary)" : "var(--flowra-text-subtle)"}
          strokeWidth={highlighted ? 2 : 1.25} opacity={highlighted ? 1 : 0.55} markerEnd={`url(#${markerId})`} />
        <path d={geometry.path} fill="none" stroke="transparent" strokeWidth={10} style={{ pointerEvents: "stroke", cursor: "pointer" }}
          onClick={() => onSelectRelation?.(relation)} />
      </g>;
    })}</g>
  </svg>;
}

interface ProjectGanttDependencyDetailsProps {
  relations: readonly ProjectGanttDependencyRelation[];
  selectedId: number | null;
  onSelectWork?: (item: CompanyProjectWorkItem) => void;
}

/** The same relation information remains readable without SVG or color, including on mobile. */
export function ProjectGanttDependencyDetails({ relations, selectedId, onSelectWork }: ProjectGanttDependencyDetailsProps) {
  if (!relations.length) return null;
  const related = selectedId === null ? relations : relations.filter(({ dependency }) =>
    dependency.predecessor_work_item_id === selectedId || dependency.successor_work_item_id === selectedId);
  const incoming = related.filter(({ dependency }) => dependency.successor_work_item_id === selectedId).length;
  const outgoing = related.filter(({ dependency }) => dependency.predecessor_work_item_id === selectedId).length;
  function work(item: CompanyProjectWorkItem | undefined, id: number) {
    return item && onSelectWork ? <button type="button" className="gantt-relation-work" onClick={() => onSelectWork(item)}>{item.title}</button>
      : <span>{item?.title ?? `업무 #${id}`}</span>;
  }
  return <details className="gantt-dependency-details" data-testid="gantt-dependency-details">
    <summary>{selectedId === null ? `조회된 업무 연결 ${related.length}개` : `선택 업무 연결 ${related.length}개 · 선행 ${incoming} · 후행 ${outgoing}`}</summary>
    <p>불러온 업무 연결 기준 · 조회 범위 밖의 연결은 포함되지 않을 수 있습니다.</p>
    {!related.length ? <p>선택 업무와 연결된 관계가 현재 조회 범위에 없습니다.</p>
      : <ul>{related.map(({ dependency, predecessor, successor, typeLabel, hiddenReason }) => <li key={dependency.company_project_work_dependency_id}>
        <span className="gantt-relation-direction">{selectedId === null ? "관계" : dependency.successor_work_item_id === selectedId ? "선행" : "후행"}</span>{" "}
        {work(predecessor, dependency.predecessor_work_item_id)}{" → "}{work(successor, dependency.successor_work_item_id)}
        <span className="gantt-relation-meta">{` · ${typeLabel} · ${projectGanttDependencyLagLabel(dependency)}`}</span>
        {hiddenReason && <span className="gantt-relation-hidden">{projectGanttDependencyHiddenLabel[hiddenReason]}</span>}
      </li>)}</ul>}
  </details>;
}
