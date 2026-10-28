import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

function locationName(tree: ProjectTree, key: LocationKey): string {
  if (key === null) return "프로젝트 최상위";
  if (key === "group:unassigned") return "단계 미지정";
  const id = Number(key.split(":")[1]);
  return key.startsWith("phase:")
    ? (tree.hierarchy.phases.find(
        (phase) => phase.company_project_phase_id === id,
      )?.name ?? `현재 단계 ${id}`)
    : (tree.byId.get(id)?.title ?? `현재 상위 업무 ${id}`);
}

function locationTitle(tree: ProjectTree, key: LocationKey): string {
  return projectHierarchyTitle(
    locationName(tree, key),
    key === null ? undefined : tree.hierarchy.wbsByKey.get(key),
  );
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

export function projectLinkedPhaseLabel(
  tree: ProjectTree,
  value: ProjectLocation,
) {
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
  const [browseKey, setBrowseKey] = useState(() => locationKey(value));
  const [explicitPhase, setExplicitPhase] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const childrenRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const candidateRef = useRef<HTMLDivElement>(null);
  const [scrollMode, setScrollMode] = useState<"body" | "list">("body");
  const scrollPositions = useRef(
    new Map<LocationKey, { body: number; children: number }>(),
  );
  const key = browseKey;
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
    const previous = scrollPositions.current.get(key);
    scrollPositions.current.set(key, {
      body:
        scrollMode === "body"
          ? (bodyRef.current?.scrollTop ?? 0)
          : (previous?.body ?? 0),
      children:
        scrollMode === "list"
          ? (childrenRef.current?.scrollTop ?? 0)
          : (previous?.children ?? 0),
    });
    setBrowseKey(next);
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
      setCandidate((previous) => ({
        parentId: "none",
        phaseId: explicitPhase
          ? previous.phaseId
          : next?.startsWith("phase:")
            ? next.slice(6)
            : "none",
      }));
    }
    requestAnimationFrame(() => {
      bodyRef.current
        ?.querySelector<HTMLButtonElement>('[aria-current="location"]')
        ?.focus({ preventScroll: true });
    });
  }

  const children: LocationKey[] = key?.startsWith("work:")
    ? (tree.graph.childrenByParent.get(Number(key.slice(5))) ?? []).map(workKey)
    : key?.startsWith("phase:")
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
  const candidateParentLabel =
    candidate.parentId === "none"
      ? "프로젝트 최상위"
      : locationTitle(tree, workKey(Number(candidate.parentId)));
  const browsePathLabel = path
    .map((part) => locationTitle(tree, part))
    .join(" › ");
  const candidateChanged =
    candidate.parentId !== value.parentId ||
    candidate.phaseId !== value.phaseId;
  const clearsBoth =
    editing &&
    candidate.parentId === "none" &&
    candidate.phaseId === "none" &&
    (value.parentId !== "none" || value.phaseId !== "none");
  const listState = parentMissing
    ? "missing"
    : query?.isError
      ? "error"
      : loading
        ? "loading"
        : children.length === 0
          ? "empty"
          : "items";
  const breadcrumbIndexes =
    path.length >= 4
      ? [0, path.length - 2, path.length - 1]
      : path.map((_, index) => index);
  // Describe only the origin known in this picker. Reopened values are applied
  // form values, even if a prior visit originally suggested or selected them.
  const phaseHint = explicitPhase
    ? "직접 선택한 연결 단계입니다. 위치를 탐색해도 유지됩니다."
    : candidate.phaseId === value.phaseId
      ? "현재 적용된 연결 단계를 유지합니다."
      : !editing &&
          parent &&
          candidate.phaseId === String(parent.company_project_phase_id ?? "none")
        ? "상위 업무 기준 추천 · 새 업무의 기본 후보입니다."
        : candidate.phaseId === "none"
          ? "연결 단계를 해제할 후보입니다."
          : "탐색한 단계가 연결 단계 후보입니다.";

  useLayoutEffect(() => {
    if (bodyRef.current)
      bodyRef.current.scrollTop = scrollPositions.current.get(key)?.body ?? 0;
  }, [key]);

  useLayoutEffect(() => {
    if (childrenRef.current)
      childrenRef.current.scrollTop =
        scrollPositions.current.get(key)?.children ?? 0;
  }, [key, children.length]);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    const fixed = [
      currentRef.current,
      controlsRef.current,
      candidateRef.current,
    ];
    if (!body || fixed.some((element) => !element)) return;
    function update() {
      const style = getComputedStyle(body!);
      const fixedHeight =
        fixed.reduce((height, element) => height + element!.offsetHeight, 0) +
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) +
        2 * parseFloat(style.rowGap) +
        8;
      const dialog = body!.closest<HTMLElement>('[role="dialog"]');
      const list = childrenRef.current;
      if (dialog && list) {
        const rowsHeight = Array.from(list.children).reduce(
          (height, row) =>
            height + (row instanceof HTMLElement ? row.offsetHeight : 0),
          0,
        );
        const contentHeight =
          fixedHeight +
          Math.max(44, rowsHeight) +
          2 +
          dialog.offsetHeight -
          body!.clientHeight;
        dialog.style.setProperty(
          "--project-location-content-height",
          `${Math.ceil(contentHeight)}px`,
        );
      }
      setScrollMode(
        listState === "items" &&
          body!.clientWidth >= 440 &&
          body!.clientHeight >= 520 &&
          body!.clientHeight - fixedHeight >= 96
          ? "list"
          : "body",
      );
    }
    update();
    const observer = new ResizeObserver(update);
    observer.observe(body);
    fixed.forEach((element) => observer.observe(element!));
    Array.from(childrenRef.current?.children ?? []).forEach((row) =>
      observer.observe(row),
    );
    return () => observer.disconnect();
  }, [key, children.length, listState]);

  useLayoutEffect(() => {
    // Preserve the active scroller when a resize switches the scroll policy.
    const saved = scrollPositions.current.get(key);
    if (bodyRef.current)
      bodyRef.current.scrollTop =
        scrollMode === "body" ? (saved?.body ?? 0) : 0;
    if (childrenRef.current)
      childrenRef.current.scrollTop =
        scrollMode === "list" ? (saved?.children ?? 0) : 0;
  }, [scrollMode]);

  return (
    <>
      <div
        ref={bodyRef}
        className="project-location-picker"
        data-project-location-picker
        data-scroll-mode={scrollMode}
        onScroll={(event) => {
          if (scrollMode !== "body") return;
          const previous = scrollPositions.current.get(key);
          scrollPositions.current.set(key, {
            body: event.currentTarget.scrollTop,
            children: previous?.children ?? 0,
          });
        }}
      >
        <div
          ref={currentRef}
          className="space-y-1 border-b border-border pb-3 text-sm"
          aria-label="현재 선택한 소속 관계"
          data-project-location-current
        >
          <p className="text-xs font-medium text-muted-foreground">
            현재 위치
          </p>
          <p
            className="truncate font-medium"
            title={projectLocationLabel(tree, value)}
          >
            {value.parentId === "none"
              ? "프로젝트 최상위"
              : locationTitle(tree, workKey(Number(value.parentId)))}
          </p>
          {phased && (
            <p
              className="truncate text-xs text-muted-foreground"
              title={projectLinkedPhaseLabel(tree, value)}
            >
              연결 단계: {projectLinkedPhaseLabel(tree, value)}
            </p>
          )}
        </div>
        <div className="project-location-explorer">
          <div ref={controlsRef} className="min-w-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium">위치 탐색</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={key === null}
                onClick={() => navigate(path.at(-2) ?? null)}
              >
                <ArrowUp aria-hidden className="h-3 w-3" />
                상위 위치로
              </Button>
            </div>
            <nav
              aria-label="소속 위치 경로"
              title={browsePathLabel}
              data-breadcrumb-mode={path.length >= 4 ? "compact" : "full"}
              className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground"
            >
              {breadcrumbIndexes.map((index, visibleIndex) => (
                <span
                  key={path[index] ?? "root"}
                  className={`flex items-center gap-1 ${index === 0 ? "shrink-0" : "min-w-0 max-w-full flex-auto"}`}
                >
                  {visibleIndex > 0 && (
                    <ChevronRight
                      aria-hidden
                      className="h-3 w-3 shrink-0 text-muted-foreground"
                    />
                  )}
                  {visibleIndex > 0 &&
                    index > breadcrumbIndexes[visibleIndex - 1] + 1 && (
                      <>
                        <span aria-hidden className="shrink-0">…</span>
                        <ChevronRight
                          aria-hidden
                          className="h-3 w-3 shrink-0 text-muted-foreground"
                        />
                      </>
                    )}
                  <button
                    type="button"
                    title={locationTitle(tree, path[index])}
                    aria-label={locationTitle(tree, path[index])}
                    aria-current={
                      index === path.length - 1 ? "location" : undefined
                    }
                    className="min-w-0 max-w-full whitespace-normal rounded px-2 py-1.5 text-left [overflow-wrap:anywhere] hover:bg-accent aria-[current=location]:bg-accent aria-[current=location]:font-medium aria-[current=location]:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                    onClick={() => navigate(path[index])}
                  >
                    {index === 0 && path.length > 1
                      ? "프로젝트"
                      : locationName(tree, path[index])}
                  </button>
                </span>
              ))}
            </nav>
            {path.length >= 4 && <details className="text-xs text-muted-foreground">
              <summary className="w-fit cursor-pointer rounded py-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
                전체 경로 보기
              </summary>
              <ol
                aria-label="전체 소속 위치 경로"
                className="space-y-1 pt-1 text-foreground"
              >
                {path.map((part, index) => (
                  <li key={part ?? "root"} className="flex min-w-0 items-start gap-1">
                    <ChevronRight aria-hidden className="mt-3 h-3 w-3 shrink-0 text-muted-foreground" />
                    <button
                      type="button"
                      aria-current={index === path.length - 1 ? "location" : undefined}
                      className="min-h-10 min-w-0 flex-1 rounded px-2 py-2 text-left leading-relaxed [overflow-wrap:anywhere] hover:bg-accent aria-[current=location]:bg-accent aria-[current=location]:font-medium aria-[current=location]:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                      onClick={() => navigate(part)}
                    >
                      {locationTitle(tree, part)}
                    </button>
                  </li>
                ))}
              </ol>
            </details>}
          </div>
          <div
            ref={childrenRef}
            className="project-location-children rounded-xl border border-border"
            aria-label="하위 위치"
            aria-busy={loading}
            data-project-location-children
            data-list-state={listState}
            onScroll={(event) => {
              if (scrollMode !== "list") return;
              const previous = scrollPositions.current.get(key);
              scrollPositions.current.set(key, {
                body: previous?.body ?? 0,
                children: event.currentTarget.scrollTop,
              });
            }}
          >
            {loading && (
              <p
                role="status"
                className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
              >
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                세부 업무를 불러오는 중...
              </p>
            )}
            {query?.isError && (
              <div role="alert" className="space-y-2 p-4 text-sm">
                <p className="text-destructive">
                  {getErrorMessage(
                    query.error,
                    "세부 업무를 불러오지 못했습니다.",
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
                <div className="flex items-start gap-2 px-3 py-3 text-sm text-muted-foreground">
                  <Folder aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 space-y-1">
                    <p>하위 항목이 없습니다.</p>
                    {canManage && parent && !parentError && (
                      <p className="text-xs">
                        현재 위치를 상위 업무로 선택할 수 있습니다.
                      </p>
                    )}
                  </div>
                </div>
              )}
            {children.map((child) => {
              const isPhase = child?.startsWith("phase:");
              const Icon = isPhase ? Folder : FileCheck2;
              const selected = child === locationKey(value);
              const action = isPhase
                ? explicitPhase
                  ? "단계 내 업무를 탐색합니다. 직접 선택한 연결 단계는 유지됩니다."
                  : "단계 내 업무를 탐색하고 연결 단계 후보로 선택합니다."
                : "세부 업무를 탐색하고 상위 업무 후보로 선택합니다.";
              const restriction =
                isPhase ||
                (editing && child === workKey(Number(value.parentId)))
                  ? null
                  : getProjectWorkParentError(
                      tree.graph,
                      Number(child?.slice(5)),
                      itemId,
                    );
              return (
                <button
                  key={child}
                  type="button"
                  aria-label={locationTitle(tree, child)}
                  aria-description={`${action}${selected ? " 현재 적용된 위치입니다." : ""}${restriction ? ` 상위 지정 불가: ${restriction}` : ""}`}
                  onClick={() => navigate(child)}
                  className={`flex min-h-11 w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 ${selected ? "bg-accent/50" : ""}`}
                >
                  <Icon aria-hidden className="h-4 w-4 shrink-0 text-primary" />
                  <span
                    className="min-w-0 flex-1"
                    title={locationTitle(tree, child)}
                  >
                    <span className="block truncate">
                      {locationTitle(tree, child)}
                    </span>
                    {restriction && (
                      <span
                        className="block truncate text-xs text-destructive"
                        title={restriction}
                      >
                        {restriction}
                      </span>
                    )}
                  </span>
                  {selected && (
                    <span aria-hidden className="shrink-0 text-xs text-primary">
                      현재 위치
                    </span>
                  )}
                  <ChevronRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                </button>
              );
            })}
          </div>
        </div>
        <div
          ref={candidateRef}
          className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-sm"
          aria-label="선택할 소속 관계"
          data-project-location-candidate
          data-modified={candidateChanged}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <p className="font-medium">적용할 위치</p>
            <span
              className={
                candidateChanged ? "text-primary" : "text-muted-foreground"
              }
            >
              {candidateChanged ? "변경됨 · 적용 전" : "현재 위치와 같음"}
            </span>
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            <dt className="text-muted-foreground">상위 업무: </dt>
            <dd
              className="truncate"
              title={projectLocationLabel(tree, candidate)}
            >
              {candidateParentLabel}
            </dd>
            {phased && (
              <>
                <dt className="text-muted-foreground">연결 단계: </dt>
                <dd className="min-w-0">
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
                    className="h-10 w-full min-w-0 border-input bg-background text-foreground hover:border-primary/50 hover:shadow-none focus-visible:border-primary focus-visible:ring-primary/20"
                    contentClassName="project-work-select-menu border-border bg-background text-foreground overscroll-contain"
                  />
                </dd>
              </>
            )}
          </dl>
          {phased && (
            <p data-project-location-phase-hint className="text-xs text-muted-foreground">
              {phaseHint}
            </p>
          )}
          <span role="status" className="sr-only">
            적용 전 후보: 상위 업무 {candidateParentLabel}
            {phased && `, 연결 단계 ${phaseLabel}`}
          </span>
          {clearsBoth && (
            <p className="text-sm text-primary">
              상위 업무와 연결 단계를 모두 해제합니다.
            </p>
          )}
          {parentError && (
            <p role="alert" className="text-sm text-destructive">
              {parentError}
            </p>
          )}
          {editing &&
            candidate.parentId !== value.parentId &&
            tree.mayBePartial && (
              <p className="text-xs text-muted-foreground">
                아직 조회하지 않은 세부 업무의 깊이와 이동 가능 여부는 저장 시
                서버에서 확인합니다.
              </p>
            )}
        </div>
      </div>
      <DialogFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 border-t border-border px-5 py-3 sm:px-6 sm:space-x-0">
        <Button type="button" variant="outline" onClick={onCancel}>
          돌아가기
        </Button>
        <Button
          type="button"
          disabled={!canManage || !!parentError}
          onClick={() => onConfirm(candidate)}
        >
          이 위치 적용
        </Button>
      </DialogFooter>
    </>
  );
}
