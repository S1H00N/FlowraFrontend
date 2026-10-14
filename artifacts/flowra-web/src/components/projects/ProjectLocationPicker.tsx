import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronRight,
  FileCheck2,
  Folder,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CustomSelect from "@/components/ui/CustomSelect";
import { DialogFooter } from "@/components/ui/dialog";
import type { useProjectWorkTree } from "@/hooks/useProjectWorkTree";
import {
  phaseKey,
  workKey,
  projectHierarchyTitle,
  type ProjectHierarchyKey,
} from "@/lib/projectHierarchy";
import { getProjectWorkParentError } from "@/lib/projectWorkTree";
import { getErrorMessage } from "@/lib/error";

export type ProjectLocation = { parentId: string; phaseId: string };
type ProjectTree = ReturnType<typeof useProjectWorkTree>;
type LocationKey = ProjectHierarchyKey | null;

function locationKey(value: ProjectLocation): LocationKey {
  return value.parentId !== "none"
    ? workKey(Number(value.parentId))
    : value.phaseId !== "none"
      ? phaseKey(Number(value.phaseId))
      : null;
}

function locationTitle(tree: ProjectTree, key: LocationKey): string {
  if (key === null) return "프로젝트 최상위";
  if (key === "group:unassigned") return "단계 미지정";
  const id = Number(key.split(":")[1]);
  const title = key.startsWith("phase:")
    ? (tree.hierarchy.phases.find(
        (phase) => phase.company_project_phase_id === id,
      )?.name ?? `현재 단계 ${id}`)
    : (tree.byId.get(id)?.title ?? `현재 상위 업무 ${id}`);
  return projectHierarchyTitle(title, tree.hierarchy.wbsByKey.get(key));
}

function locationPath(tree: ProjectTree, key: LocationKey): LocationKey[] {
  const path: LocationKey[] = [];
  const seen = new Set<LocationKey>();
  while (key !== null && !seen.has(key)) {
    seen.add(key);
    if (key !== "group:unassigned") path.unshift(key);
    key = tree.hierarchy.parentByKey.get(key) ?? null;
  }
  return [null, ...path];
}

export function projectLocationLabel(
  tree: ProjectTree,
  value: ProjectLocation,
) {
  return locationPath(tree, locationKey(value))
    .map((key) => locationTitle(tree, key))
    .join(" › ");
}

export function projectLinkedPhaseLabel(tree: ProjectTree, value: ProjectLocation) {
  return value.phaseId === "none"
    ? "단계 미지정"
    : locationTitle(tree, phaseKey(Number(value.phaseId)));
}

/** A transactional sub-screen of the existing dialog, never a nested dialog. */
export default function ProjectLocationPicker({
  tree,
  value,
  editing,
  itemId,
  canManage,
  phased,
  onCancel,
  onConfirm,
}: {
  tree: ProjectTree;
  value: ProjectLocation;
  editing: boolean;
  itemId?: number;
  canManage: boolean;
  phased: boolean;
  onCancel: () => void;
  onConfirm: (value: ProjectLocation) => void;
}) {
  const [candidate, setCandidate] = useState(value);
  const [explicitPhase, setExplicitPhase] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const key = locationKey(candidate);
  const parent = tree.byId.get(Number(candidate.parentId));
  const parentMissing = candidate.parentId !== "none" && !parent;
  const query = tree.queryById.get(Number(candidate.parentId));
  const path = locationPath(tree, key);
  const unchangedParent = editing && candidate.parentId === value.parentId;
  const parentError =
    candidate.parentId === "none" || unchangedParent
      ? null
      : getProjectWorkParentError(
          tree.graph,
          Number(candidate.parentId),
          itemId,
        );
  const loading = !!parent && tree.needsChildren(parent) && !query?.isError;
  // Only request the branch entered by the user. Sharing the tree keeps WBS and
  // current snapshot completeness identical to the unfiltered manager list.
  useEffect(() => {
    const item = tree.byId.get(Number(candidate.parentId));
    if (
      item &&
      tree.needsChildren(item) &&
      !tree.queryById.has(item.company_project_work_item_id)
    )
      tree.loadChildren(item);
  }, [candidate.parentId, tree]);

  function navigate(next: LocationKey) {
    if (next === locationKey(value) && !explicitPhase) {
      setCandidate(value);
    } else if (next?.startsWith("work:")) {
      const parentId = next.slice(5);
      setCandidate((previous) => ({
        parentId,
        phaseId: explicitPhase
          ? previous.phaseId
          : editing
            ? value.phaseId
            : String(
                tree.byId.get(Number(parentId))?.company_project_phase_id ??
                  "none",
              ),
      }));
    } else {
      setCandidate({
        parentId: "none",
        phaseId: next?.startsWith("phase:") ? next.slice(6) : "none",
      });
      setExplicitPhase(false);
    }
    bodyRef.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() => {
      bodyRef.current
        ?.querySelector<HTMLButtonElement>('[aria-current="location"]')
        ?.focus();
    });
  }

  const children: LocationKey[] =
    candidate.parentId !== "none"
      ? (tree.graph.childrenByParent.get(Number(candidate.parentId)) ?? []).map(
          workKey,
        )
      : candidate.phaseId !== "none"
        ? (
            tree.hierarchy.groups.find((group) => group.key === key)?.rootIds ??
            []
          ).map(workKey)
        : tree.hierarchy.groups.flatMap((group) =>
            group.phase ? [group.key] : group.rootIds.map(workKey),
          );
  const phaseLabel =
    candidate.phaseId === "none"
      ? "단계 미지정"
      : locationTitle(tree, phaseKey(Number(candidate.phaseId)));
  const clearsBoth =
    editing &&
    candidate.parentId === "none" &&
    candidate.phaseId === "none" &&
    (value.parentId !== "none" || value.phaseId !== "none");

  return (
    <>
      <div
        ref={bodyRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6"
        data-project-location-picker
      >
        <p className="text-xs text-muted-foreground">
          항목을 눌러 하위 위치를 탐색한 뒤 현재 위치를 선택해 주세요.
        </p>
        <nav
          aria-label="소속 위치 경로"
          title={projectLocationLabel(tree, candidate)}
          className="flex flex-wrap items-center gap-1 text-sm"
        >
          {path.map((part, index) => (
            <span
              key={part ?? "root"}
              className="flex min-w-0 max-w-full items-center gap-1"
            >
              {index > 0 && (
                <ChevronRight
                  aria-hidden
                  className="h-3 w-3 shrink-0 text-muted-foreground"
                />
              )}
              <button
                type="button"
                title={locationTitle(tree, part)}
                aria-current={
                  index === path.length - 1 ? "location" : undefined
                }
                className="min-w-0 max-w-full truncate rounded px-2 py-1.5 text-left hover:bg-accent aria-[current=location]:bg-accent aria-[current=location]:font-medium aria-[current=location]:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                onClick={() => navigate(part)}
              >
                {locationTitle(tree, part)}
              </button>
            </span>
          ))}
        </nav>
        <Button
          type="button"
          variant="outline"
          disabled={key === null}
          onClick={() => navigate(path.at(-2) ?? null)}
        >
          <ArrowUp aria-hidden className="mr-2 h-4 w-4" />
          상위 위치로
        </Button>
        <div
          className="overflow-hidden rounded-xl border border-border"
          aria-label="하위 위치"
          aria-busy={loading}
        >
          {loading && (
            <p
              role="status"
              className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
            >
              <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              하위 업무를 불러오는 중...
            </p>
          )}
          {query?.isError && (
            <div role="alert" className="space-y-2 p-4 text-sm">
              <p className="text-destructive">
                {getErrorMessage(
                  query.error,
                  "하위 업무를 불러오지 못했습니다.",
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={query.isFetching}
                onClick={() => parent && tree.loadChildren(parent)}
              >
                다시 시도
              </Button>
            </div>
          )}
          {parentMissing && (
            <p className="p-4 text-sm text-muted-foreground">
              현재 상위 업무가 조회되지 않았습니다. 기존 연결은 유지됩니다.
            </p>
          )}
          {!parentMissing &&
            !loading &&
            !query?.isError &&
            children.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                하위 항목이 없습니다.
              </p>
            )}
          {children.map((child) => {
            const Icon = child?.startsWith("phase:") ? Folder : FileCheck2;
            const selected = child === locationKey(value);
            return (
              <button
                key={child}
                type="button"
                aria-description={selected ? "현재 선택된 위치" : undefined}
                onClick={() => navigate(child)}
                className={`flex min-h-12 w-full items-center gap-2 border-b border-border px-3 py-3 text-left text-sm last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 ${selected ? "bg-accent/50" : ""}`}
              >
                <Icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                <span
                  className="min-w-0 flex-1 truncate"
                  title={locationTitle(tree, child)}
                >
                  {locationTitle(tree, child)}
                </span>
                {selected && <span aria-hidden className="shrink-0 text-xs text-primary">선택됨</span>}
                <ChevronRight
                  aria-hidden
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                />
              </button>
            );
          })}
        </div>
        <div
          className="space-y-2 rounded-xl border border-border p-3 text-sm"
          aria-label="선택할 소속 관계"
        >
          <p className="text-xs font-medium text-muted-foreground">선택할 위치</p>
          <p className="break-words">
            상위 업무:{" "}
            {candidate.parentId === "none"
              ? "없음"
              : locationTitle(tree, workKey(Number(candidate.parentId)))}
          </p>
          <p className="break-words">연결 단계: {phaseLabel}</p>
          {phased && (
            <CustomSelect
              ariaLabel="연결 단계 변경"
              value={candidate.phaseId}
              options={[
                { value: "none", label: "단계 미지정" },
                ...(!tree.hierarchy.phases.some(
                  (phase) =>
                    String(phase.company_project_phase_id) ===
                    candidate.phaseId,
                ) && candidate.phaseId !== "none"
                  ? [{ value: candidate.phaseId, label: phaseLabel }]
                  : []),
                ...tree.hierarchy.phases.map((phase) => ({
                  value: String(phase.company_project_phase_id),
                  label: locationTitle(
                    tree,
                    phaseKey(phase.company_project_phase_id),
                  ),
                })),
              ]}
              onChange={(phaseId) => {
                setExplicitPhase(true);
                setCandidate((previous) => ({ ...previous, phaseId }));
              }}
              disabled={!canManage}
              showFallbackMarker={false}
              matchTriggerWidth
              collisionBoundaryRef={bodyRef}
              className="h-10 border-input bg-background text-foreground hover:border-primary/50 hover:shadow-none focus-visible:border-primary focus-visible:ring-primary/20"
              contentClassName="project-work-select-menu border-border bg-background text-foreground overscroll-contain"
            />
          )}
          {candidate.parentId !== "none" && (
            <p className="text-xs text-muted-foreground">
              상위 업무는 목록의 계층을 정합니다. 연결 단계는 상위 업무와 별도로 지정할 수 있습니다.
            </p>
          )}
          {clearsBoth && (
            <p className="text-sm text-primary">
              상위 업무와 연결 단계를 모두 해제합니다.
            </p>
          )}
        </div>
        {parentError && (
          <p role="alert" className="text-sm text-destructive">
            {parentError}
          </p>
        )}
        {editing &&
          candidate.parentId !== value.parentId &&
          tree.mayBePartial && (
            <p className="text-xs text-muted-foreground">
              아직 조회하지 않은 하위 업무의 깊이와 이동 가능 여부는 저장 시
              서버에서 확인합니다.
            </p>
          )}
      </div>
      <DialogFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 border-t border-border px-5 py-3 sm:px-6 sm:space-x-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button
          type="button"
          disabled={!canManage || !!parentError}
          onClick={() => onConfirm(candidate)}
        >
          현재 위치 선택
        </Button>
      </DialogFooter>
    </>
  );
}
