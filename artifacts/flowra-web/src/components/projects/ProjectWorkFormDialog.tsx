import { useId, useRef, useState, type FormEvent } from "react";
import { ChevronDown, X } from "lucide-react";
import {
  CompactDateInput,
  CompactTimeInput,
} from "@/components/CompactDateTimeInputs";
import CustomSelect from "@/components/ui/CustomSelect";
import { FloatingPanelPortalProvider } from "@/components/ui/FloatingPanelPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  WORK_PRIORITY_OPTIONS,
  WORK_STATUS_OPTIONS,
} from "./ProjectWorkPresentation";
import {
  useCreateCompanyProjectPhase,
  useCreateCompanyProjectWorkItem,
  useUpdateCompanyProjectPhase,
  useUpdateCompanyProjectWorkItem,
} from "@/hooks/useCompanyProjects";
import { getApiErrorDetails, getErrorMessage } from "@/lib/error";
import {
  buildProjectWorkTree,
  getWorkItemAncestorPath,
  getWorkItemDepthInfo,
  MAX_PROJECT_WORK_DEPTH,
} from "@/lib/projectWorkTree";
import type {
  CompanyProjectDetailData,
  CompanyProjectPhase,
  CompanyProjectWorkItem,
  CompanyProjectWorkItemStatus,
  TaskPriority,
  UpdateCompanyProjectPhaseRequest,
  UpdateCompanyProjectWorkItemRequest,
} from "@/types";

export type ProjectWorkEditTarget =
  | { kind: "phase"; phase?: CompanyProjectPhase }
  | {
      kind: "work";
      item?: CompanyProjectWorkItem;
      parent?: CompanyProjectWorkItem;
    };

const fieldClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20";
const selectClass =
  "h-10 border-input bg-background text-foreground hover:border-primary/50 hover:shadow-none focus-visible:border-primary focus-visible:ring-primary/20 data-[state=open]:border-primary data-[state=open]:ring-primary/20";
const dateClass =
  "h-10 min-w-0 border-input bg-background hover:border-primary/50 hover:bg-background focus-within:border-primary focus-within:bg-background focus-within:ring-primary/20 [&_input]:text-foreground";
const PROGRESS_MODE_OPTIONS = [
  { value: "automatic", label: "자동 계산" },
  { value: "manual", label: "수동 설정" },
] as const;
const advancedApiFields = [
  "actual_start_date",
  "actual_end_date",
  "due_datetime",
  "progress_percent",
  "progress_override_percent",
  "wbs_code",
  "sort_order",
];
const dateOnly = (value?: string | null) => value?.slice(0, 10) ?? "";
function localDatetime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export default function ProjectWorkFormDialog({
  target,
  detail,
  items,
  canManage,
  onClose,
  onSaved,
}: {
  target: ProjectWorkEditTarget;
  detail: CompanyProjectDetailData;
  items: CompanyProjectWorkItem[];
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const current = target.kind === "phase" ? target.phase : target.item;
  const editing = Boolean(current);
  const createPhase = useCreateCompanyProjectPhase();
  const updatePhase = useUpdateCompanyProjectPhase();
  const createWork = useCreateCompanyProjectWorkItem();
  const updateWork = useUpdateCompanyProjectWorkItem();
  const pending =
    createPhase.isPending ||
    updatePhase.isPending ||
    createWork.isPending ||
    updateWork.isPending;
  const lock = useRef(false);
  const fieldsRef = useRef<HTMLFormElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancedError, setAdvancedError] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [initial] = useState(() => ({
    name:
      target.kind === "phase"
        ? (target.phase?.name ?? "")
        : (target.item?.title ?? ""),
    description: current?.description ?? "",
    status: current?.status ?? "todo",
    priority:
      target.kind === "work" ? (target.item?.priority ?? "medium") : "medium",
    // Parent and phase are independent API relations. Only new children default
    // to their parent's phase; editing must preserve even a different phase.
    phaseId:
      target.kind === "work"
        ? String(
            (target.item
              ? target.item.company_project_phase_id
              : target.parent?.company_project_phase_id) ?? "none",
          )
        : "none",
    parentId:
      target.kind === "work"
        ? String(
            (target.item
              ? target.item.parent_work_item_id
              : target.parent?.company_project_work_item_id) ?? "none",
          )
        : "none",
    plannedStart: dateOnly(current?.planned_start_date),
    plannedEnd: dateOnly(current?.planned_end_date),
    actualStart: dateOnly(current?.actual_start_date),
    actualEnd: dateOnly(current?.actual_end_date),
    dueDate:
      target.kind === "work"
        ? localDatetime(target.item?.due_datetime).slice(0, 10)
        : "",
    dueTime:
      target.kind === "work"
        ? localDatetime(target.item?.due_datetime).slice(11, 16)
        : "",
    progressMode:
      target.kind === "work" && target.item?.progress_override_percent != null
        ? "manual"
        : "automatic",
    progress:
      target.kind === "work"
        ? String(
            target.item?.progress_override_percent ??
              target.item?.progress_percent ??
              0,
          )
        : "0",
    sortOrder: String(current?.sort_order ?? 0),
    wbs: target.kind === "work" ? (target.item?.wbs_code ?? "") : "",
  }));
  const [draft, setDraft] = useState(initial);
  const hasAdvancedValues = Boolean(
    draft.actualStart ||
    draft.actualEnd ||
    draft.dueDate ||
    draft.dueTime ||
    draft.wbs ||
    Number(draft.sortOrder) !== 0 ||
    draft.progressMode === "manual",
  );
  const [advancedOpen, setAdvancedOpen] = useState(
    editing && hasAdvancedValues,
  );
  const graph = buildProjectWorkTree(items, detail.project.company_project_id);
  const itemId =
    target.kind === "work"
      ? target.item?.company_project_work_item_id
      : undefined;
  const possibleParents = items.filter((item) => {
    const depth = getWorkItemDepthInfo(
      graph,
      item.company_project_work_item_id,
    );
    const workDepth = depth.workItemDepth ?? depth.backendDepthLevel;
    return (
      workDepth !== null &&
      workDepth < MAX_PROJECT_WORK_DEPTH &&
      (itemId === undefined ||
        !getWorkItemAncestorPath(graph, item.company_project_work_item_id).some(
          (ancestor) => ancestor.company_project_work_item_id === itemId,
        ))
    );
  });
  const parentUnavailable =
    target.kind === "work" &&
    !editing &&
    draft.parentId !== "none" &&
    !possibleParents.some(
      (item) => String(item.company_project_work_item_id) === draft.parentId,
    );
  const fieldsDisabled = pending || uncertain || !canManage;
  function field<K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  function close() {
    if (!pending && !lock.current) onClose();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !canManage || uncertain) return;
    setError(null);
    setAdvancedError(false);
    function invalid(message: string, advanced = false) {
      setError(message);
      setAdvancedError(advanced);
      if (advanced) setAdvancedOpen(true);
    }
    const name = draft.name.trim();
    if (!name || name.length > (target.kind === "phase" ? 150 : 200)) {
      invalid(
        target.kind === "phase"
          ? "단계명은 1~150자로 입력해 주세요."
          : "업무명은 1~200자로 입력해 주세요.",
      );
      return;
    }
    if (
      draft.plannedStart &&
      draft.plannedEnd &&
      draft.plannedEnd < draft.plannedStart
    ) {
      invalid("계획 종료일은 시작일과 같거나 이후여야 합니다.");
      return;
    }
    if (
      draft.actualStart &&
      draft.actualEnd &&
      draft.actualEnd < draft.actualStart
    ) {
      invalid("실적 종료일은 시작일과 같거나 이후여야 합니다.", true);
      return;
    }
    if (
      !Number.isInteger(Number(draft.sortOrder)) ||
      draft.sortOrder.trim() === ""
    ) {
      invalid("정렬 순서는 정수로 입력해 주세요.", true);
      return;
    }
    if (
      target.kind === "work" &&
      draft.progressMode === "manual" &&
      (!/^\d+$/.test(draft.progress) || Number(draft.progress) > 100)
    ) {
      invalid("진행률은 0~100 사이의 정수로 입력해 주세요.", true);
      return;
    }
    if (
      target.kind === "work" &&
      (draft.dueDate || draft.dueTime) &&
      (!draft.dueDate ||
        !draft.dueTime ||
        !Number.isFinite(
          new Date(`${draft.dueDate}T${draft.dueTime}`).getTime(),
        ))
    ) {
      invalid("마감 날짜와 시간을 모두 입력해 주세요.", true);
      return;
    }
    if (parentUnavailable) {
      invalid(
        "선택한 상위 업무의 깊이를 확인할 수 없거나 최대 5단계에 도달했습니다. 다른 상위 업무를 선택해 주세요.",
      );
      return;
    }
    lock.current = true;
    const payload: UpdateCompanyProjectWorkItemRequest &
      UpdateCompanyProjectPhaseRequest = {};
    function changed(key: keyof typeof draft, apiKey: string, value: unknown) {
      if (!editing || draft[key] !== initial[key])
        Object.assign(payload, { [apiKey]: value });
    }
    changed("name", target.kind === "phase" ? "name" : "title", name);
    changed("description", "description", draft.description.trim() || null);
    changed("status", "status", draft.status as CompanyProjectWorkItemStatus);
    changed("plannedStart", "planned_start_date", draft.plannedStart || null);
    changed("plannedEnd", "planned_end_date", draft.plannedEnd || null);
    changed("actualStart", "actual_start_date", draft.actualStart || null);
    changed("actualEnd", "actual_end_date", draft.actualEnd || null);
    changed("sortOrder", "sort_order", Number(draft.sortOrder));
    if (target.kind === "work") {
      changed("priority", "priority", draft.priority as TaskPriority);
      changed(
        "phaseId",
        "company_project_phase_id",
        draft.phaseId === "none" ? null : Number(draft.phaseId),
      );
      changed(
        "parentId",
        "parent_work_item_id",
        draft.parentId === "none" ? null : Number(draft.parentId),
      );
      // Do not reserialize an untouched deadline: its seconds and offset may
      // contain precision that the local minute-level controls do not display.
      if (
        !editing ||
        draft.dueDate !== initial.dueDate ||
        draft.dueTime !== initial.dueTime
      ) {
        payload.due_datetime = draft.dueDate
          ? new Date(`${draft.dueDate}T${draft.dueTime}`).toISOString()
          : null;
      }
      changed("wbs", "wbs_code", draft.wbs.trim() || null);
      if (draft.progressMode === "manual") {
        // A mode change is meaningful even when the requested number is 0.
        if (
          !editing ||
          initial.progressMode !== "manual" ||
          draft.progress !== initial.progress
        ) {
          payload.progress_percent = Number(draft.progress);
        }
      } else if (editing && initial.progressMode === "manual") {
        payload.progress_override_percent = null;
      }
    }
    if (editing && Object.keys(payload).length === 0) {
      lock.current = false;
      onClose();
      return;
    }
    try {
      const companyProjectId = detail.project.company_project_id;
      if (target.kind === "phase") {
        if (target.phase)
          await updatePhase.mutateAsync({
            companyProjectId,
            phaseId: target.phase.company_project_phase_id,
            payload,
          });
        else
          await createPhase.mutateAsync({
            companyProjectId,
            payload: { ...payload, name },
          });
      } else if (target.item) {
        await updateWork.mutateAsync({
          companyProjectId,
          workItemId: target.item.company_project_work_item_id,
          payload,
        });
      } else
        await createWork.mutateAsync({
          companyProjectId,
          payload: { ...payload, title: name },
        });
      onSaved();
    } catch (caught) {
      const apiError = getApiErrorDetails(caught);
      const status = apiError?.status;
      const uncertainCreation =
        !editing && (!status || status >= 500 || status === 408);
      setUncertain(uncertainCreation);
      setError(
        uncertainCreation
          ? "서버의 저장 결과를 확인하지 못했습니다. 창을 닫고 목록을 새로고침하여 추가 여부를 확인해 주세요."
          : getErrorMessage(
              caught,
              "저장하지 못했습니다. 입력 내용을 확인해 주세요.",
            ),
      );
      const issues = apiError?.details?.issues;
      const advancedIssue =
        apiError?.code?.includes("ACTUAL_DATE") ||
        (Array.isArray(issues) &&
          issues.some((issue) => {
            const path =
              typeof issue === "object" && issue !== null && "path" in issue
                ? issue.path
                : null;
            const parts = Array.isArray(path) ? path : [path];
            return parts.some(
              (part) =>
                typeof part === "string" && advancedApiFields.includes(part),
            );
          }));
      if (advancedIssue) {
        setAdvancedError(true);
        setAdvancedOpen(true);
      }
    } finally {
      lock.current = false;
    }
  }
  const kindLabel = target.kind === "phase" ? "단계" : "업무";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="left-4 right-4 top-[5dvh] mx-auto flex max-h-[min(90dvh,760px)] w-auto max-w-[560px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 text-foreground [&>button]:text-muted-foreground"
        style={{ transform: "none", translate: "none" }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (
            pending ||
            lock.current ||
            fieldsRef.current?.querySelector(
              'button[aria-haspopup="listbox"][aria-expanded="true"], input[aria-expanded="true"]',
            )
          )
            event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending || lock.current) event.preventDefault();
        }}
      >
        <FloatingPanelPortalProvider value={portal}>
          <DialogHeader className="shrink-0 px-5 pb-4 pt-5 text-left sm:px-6">
            <DialogTitle
              ref={titleRef}
              tabIndex={-1}
              className="pr-8 leading-6 outline-none"
            >
              {kindLabel} {editing ? "수정" : "추가"}
            </DialogTitle>
            <DialogDescription>
              {target.kind === "work"
                ? "기본 정보를 입력하고, 필요할 때 상세 설정을 펼쳐 주세요."
                : "단계의 상태를 변경해도 소속 업무의 상태는 유지됩니다."}
            </DialogDescription>
          </DialogHeader>
          <form
            ref={fieldsRef}
            id={id}
            noValidate
            onSubmit={(event) => void submit(event)}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6"
            data-project-work-fields
          >
            <fieldset disabled={fieldsDisabled} className="min-w-0 space-y-4">
              <label className="block space-y-1">
                <span className="text-sm">{kindLabel}명</span>
                <Input
                  aria-label={`${kindLabel}명`}
                  required
                  maxLength={target.kind === "phase" ? 150 : 200}
                  className={fieldClass}
                  value={draft.name}
                  onChange={(event) => field("name", event.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm">설명</span>
                <Textarea
                  aria-label={`${kindLabel} 설명`}
                  rows={2}
                  className={`${fieldClass} min-h-16 resize-y`}
                  maxLength={5000}
                  value={draft.description}
                  onChange={(event) => field("description", event.target.value)}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm">상태</p>
                  <CustomSelect
                    ariaLabel={`${kindLabel} 상태 선택`}
                    value={draft.status}
                    options={WORK_STATUS_OPTIONS}
                    onChange={(value) => field("status", value)}
                    disabled={fieldsDisabled}
                    className={selectClass}
                    showFallbackMarker={false}
                    matchTriggerWidth
                    collisionBoundaryRef={fieldsRef}
                    contentClassName="border-border bg-popover text-popover-foreground"
                  />
                </div>
                {target.kind === "work" && (
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm">우선순위</p>
                    <CustomSelect
                      ariaLabel="업무 우선순위 선택"
                      value={draft.priority}
                      options={WORK_PRIORITY_OPTIONS}
                      onChange={(value) => field("priority", value)}
                      disabled={fieldsDisabled}
                      className={selectClass}
                      showFallbackMarker={false}
                      matchTriggerWidth
                      collisionBoundaryRef={fieldsRef}
                      contentClassName="border-border bg-popover text-popover-foreground"
                    />
                  </div>
                )}
              </div>
              {target.kind === "work" && (
                <div className="space-y-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm">상위 업무</p>
                      <CustomSelect
                        ariaLabel="상위 업무 선택"
                        value={draft.parentId}
                        options={[
                          { value: "none", label: "최상위 업무" },
                          ...(!possibleParents.some(
                            (item) =>
                              String(item.company_project_work_item_id) ===
                              draft.parentId,
                          ) && draft.parentId !== "none"
                            ? [
                                {
                                  value: draft.parentId,
                                  label:
                                    items.find(
                                      (item) =>
                                        String(
                                          item.company_project_work_item_id,
                                        ) === draft.parentId,
                                    )?.title ??
                                    `현재 상위 업무 ${draft.parentId}`,
                                },
                              ]
                            : []),
                          ...possibleParents.map((item) => ({
                            value: String(item.company_project_work_item_id),
                            label: item.title,
                          })),
                        ]}
                        onChange={(value) => field("parentId", value)}
                        disabled={fieldsDisabled}
                        className={selectClass}
                        showFallbackMarker={false}
                        matchTriggerWidth
                        collisionBoundaryRef={fieldsRef}
                        contentClassName="border-border bg-popover text-popover-foreground"
                      />
                    </div>
                    {detail.project.phase_mode === "phased" && (
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm">단계</p>
                        <CustomSelect
                          ariaLabel="업무 단계 선택"
                          value={draft.phaseId}
                          options={[
                            { value: "none", label: "단계 미지정" },
                            ...(!detail.phases.some(
                              (phase) =>
                                String(phase.company_project_phase_id) ===
                                draft.phaseId,
                            ) && draft.phaseId !== "none"
                              ? [
                                  {
                                    value: draft.phaseId,
                                    label: `현재 단계 ${draft.phaseId}`,
                                  },
                                ]
                              : []),
                            ...detail.phases.map((phase) => ({
                              value: String(phase.company_project_phase_id),
                              label: phase.name,
                            })),
                          ]}
                          onChange={(value) => field("phaseId", value)}
                          disabled={fieldsDisabled}
                          className={selectClass}
                          showFallbackMarker={false}
                          matchTriggerWidth
                          collisionBoundaryRef={fieldsRef}
                          contentClassName="border-border bg-popover text-popover-foreground"
                        />
                      </div>
                    )}
                  </div>
                  {draft.parentId !== "none" &&
                    detail.project.phase_mode === "phased" && (
                      <p className="text-xs text-muted-foreground">
                        상위 업무와 단계는 각각 선택할 수 있습니다. 상위 업무를
                        바꿔도 선택한 단계는 유지됩니다.
                      </p>
                    )}
                  {parentUnavailable && (
                    <p className="text-xs text-destructive">
                      상위 업무의 깊이를 확인할 수 없거나 최대 5단계에
                      도달했습니다.
                    </p>
                  )}
                </div>
              )}
              <div
                className="grid gap-3 sm:grid-cols-2"
                role="group"
                aria-label="계획 기간"
              >
                {(
                  [
                    ["plannedStart", "계획 시작일"],
                    ["plannedEnd", "계획 종료일"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="min-w-0 space-y-1">
                    <p className="text-sm">{label}</p>
                    <CompactDateInput
                      ariaLabel={`${kindLabel} ${label}`}
                      clearLabel={`${kindLabel} ${label} 지우기`}
                      value={draft[key]}
                      onChange={(value) => field(key, value)}
                      emptyPlaceholder="날짜 선택"
                      disabled={fieldsDisabled}
                      className={dateClass}
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-border">
                <button
                  type="button"
                  aria-expanded={advancedOpen}
                  aria-controls={`${id}-advanced`}
                  disabled={fieldsDisabled}
                  onClick={() => setAdvancedOpen((open) => !open)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
                >
                  <ChevronDown
                    aria-hidden
                    className={`h-4 w-4 shrink-0 transition-transform ${advancedOpen ? "" : "-rotate-90"}`}
                  />
                  <span>상세 설정 (선택)</span>
                  {advancedError ? (
                    <span className="ml-auto text-xs text-destructive">
                      오류 확인
                    </span>
                  ) : (
                    hasAdvancedValues && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        설정됨
                      </span>
                    )
                  )}
                </button>
                {advancedOpen && (
                  <div
                    id={`${id}-advanced`}
                    className="space-y-4 border-t border-border p-3"
                  >
                    <div
                      className="grid gap-3 sm:grid-cols-2"
                      role="group"
                      aria-label="실적 기간"
                    >
                      {(
                        [
                          ["actualStart", "실적 시작일"],
                          ["actualEnd", "실적 종료일"],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="min-w-0 space-y-1">
                          <p className="text-sm">{label}</p>
                          <CompactDateInput
                            ariaLabel={`${kindLabel} ${label}`}
                            clearLabel={`${kindLabel} ${label} 지우기`}
                            value={draft[key]}
                            onChange={(value) => field(key, value)}
                            emptyPlaceholder="날짜 선택"
                            disabled={fieldsDisabled}
                            className={dateClass}
                          />
                        </div>
                      ))}
                    </div>
                    {target.kind === "work" && (
                      <>
                        <div
                          className="grid gap-3 sm:grid-cols-2"
                          role="group"
                          aria-label="마감 일시"
                        >
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm">마감 날짜</p>
                            <CompactDateInput
                              ariaLabel="업무 마감 날짜"
                              clearLabel="업무 마감 날짜 지우기"
                              value={draft.dueDate}
                              onChange={(value) => field("dueDate", value)}
                              emptyPlaceholder="날짜 선택"
                              disabled={fieldsDisabled}
                              className={dateClass}
                            />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm">마감 시간</p>
                            <div className="relative">
                              <CompactTimeInput
                                ariaLabel="업무 마감 시간"
                                value={draft.dueTime}
                                onChange={(value) => field("dueTime", value)}
                                disabled={fieldsDisabled}
                                className={`${dateClass} pr-10`}
                                emptyPlaceholder="시간 선택"
                              />
                              {draft.dueTime && (
                                <button
                                  type="button"
                                  aria-label="업무 마감 시간 지우기"
                                  disabled={fieldsDisabled}
                                  onPointerDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                  }}
                                  onClick={() => field("dueTime", "")}
                                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/20 disabled:opacity-50"
                                >
                                  <X aria-hidden className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="min-w-0 space-y-1">
                              <p className="text-sm">진행률 설정</p>
                              <CustomSelect
                                ariaLabel="업무 진행률 설정"
                                value={draft.progressMode}
                                options={PROGRESS_MODE_OPTIONS}
                                onChange={(value) =>
                                  field("progressMode", value)
                                }
                                disabled={fieldsDisabled}
                                className={selectClass}
                                showFallbackMarker={false}
                                matchTriggerWidth
                                collisionBoundaryRef={fieldsRef}
                                contentClassName="border-border bg-popover text-popover-foreground"
                              />
                            </div>
                            {draft.progressMode === "manual" && (
                              <label className="min-w-0 space-y-1">
                                <span className="text-sm">
                                  진행률 수동 설정 (%)
                                </span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={1}
                                  aria-label="업무 진행률"
                                  className={fieldClass}
                                  value={draft.progress}
                                  onChange={(event) =>
                                    field("progress", event.target.value)
                                  }
                                />
                              </label>
                            )}
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            수동 설정은 0%도 지정할 수 있습니다. 자동 계산으로
                            전환하면 담당자 배정을 기준으로 다시 계산하며,
                            배정이 없으면 기존 진행률이 유지됩니다.
                          </p>
                        </div>
                        <label className="block space-y-1">
                          <span className="text-sm">WBS 코드</span>
                          <Input
                            aria-label="업무 WBS 코드"
                            maxLength={100}
                            className={fieldClass}
                            value={draft.wbs}
                            onChange={(event) =>
                              field("wbs", event.target.value)
                            }
                          />
                        </label>
                      </>
                    )}
                    <label className="block space-y-1">
                      <span className="text-sm">정렬 순서</span>
                      <Input
                        type="number"
                        step={1}
                        aria-label={`${kindLabel} 정렬 순서`}
                        className={fieldClass}
                        value={draft.sortOrder}
                        onChange={(event) =>
                          field("sortOrder", event.target.value)
                        }
                      />
                    </label>
                  </div>
                )}
              </div>
            </fieldset>
          </form>
          {error && (
            <p
              role="alert"
              className="shrink-0 break-words px-5 pb-3 text-sm text-destructive sm:px-6"
            >
              {error}
            </p>
          )}
          <DialogFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 border-t border-border px-5 py-3 sm:px-6 sm:space-x-0">
            <Button variant="outline" onClick={close} disabled={pending}>
              닫기
            </Button>
            <Button
              type="submit"
              form={id}
              disabled={fieldsDisabled || parentUnavailable}
              aria-busy={pending}
            >
              {pending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
          <div ref={setPortal} />
        </FloatingPanelPortalProvider>
      </DialogContent>
    </Dialog>
  );
}
