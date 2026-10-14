import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, Folder, X } from "lucide-react";
import {
  CompactDateInput,
  CompactTimeInput,
} from "@/components/CompactDateTimeInputs";
import CustomSelect from "@/components/ui/CustomSelect";
import { FloatingPanelPortalProvider } from "@/components/ui/FloatingPanelPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import type { useProjectWorkTree } from "@/hooks/useProjectWorkTree";
import ProjectLocationPicker, {
  projectLocationLabel,
  projectLinkedPhaseLabel,
} from "./ProjectLocationPicker";
import { getApiErrorDetails, getErrorMessage } from "@/lib/error";
import { registerProjectHistoryGuard } from "@/lib/projectNavigationGuard";
import { getProjectWorkParentError } from "@/lib/projectWorkTree";
import { applyParentPeriod, isValidProjectDate, parentPeriodOptions, periodWarnings, projectDate } from "@/lib/projectSchedule";
import { ProjectPeriodWarning } from "./ProjectSchedulePresentation";
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
      phase?: CompanyProjectPhase;
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
  "description",
  "status",
  "priority",
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
  tree,
  canManage,
  onClose,
  onSaved,
  onCloseAutoFocus,
  onRetryPermission,
  permissionRetrying = false,
}: {
  target: ProjectWorkEditTarget;
  detail: CompanyProjectDetailData;
  tree: ReturnType<typeof useProjectWorkTree>;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  onRetryPermission?: () => void;
  permissionRetrying?: boolean;
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
  const saved = useRef(false);
  const discardAction = useRef<(() => void) | null>(null);
  const discardOpener = useRef<HTMLElement | null>(null);
  const fieldsRef = useRef<HTMLFormElement | null>(null);
  const formScrollRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const locationRef = useRef<HTMLButtonElement>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancedError, setAdvancedError] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
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
              : target.parent?.company_project_phase_id ?? target.phase?.company_project_phase_id) ?? "none",
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
  type DraftField = keyof typeof initial;
  const [draft, setDraft] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DraftField, string>>>({});
  const [periodWarning, setPeriodWarning] = useState<string[] | null>(null);
  const [periodSourceKey, setPeriodSourceKey] = useState("");
  const periodOptions = parentPeriodOptions(
    target.kind === "work" ? draft.parentId : "none",
    target.kind === "work" ? draft.phaseId : "none",
    tree.graph, detail.phases, detail.project,
  );
  const periodSource = periodOptions.find((option) => option.key === periodSourceKey) ?? periodOptions[0];
  const canApplyPeriod = !!periodSource && Boolean(
    (!draft.plannedStart && projectDate(periodSource.planned_start_date)) ||
    (!draft.plannedEnd && projectDate(periodSource.planned_end_date)),
  );
  const periodHelp = !periodSource || !(
    projectDate(periodSource.planned_start_date) || projectDate(periodSource.planned_end_date)
  ) ? "적용할 상위 기간이 없습니다."
    : canApplyPeriod ? `${periodSource.label}의 비어 있는 날짜만 채웁니다.`
      : "채울 수 있는 빈 날짜가 없습니다. 입력한 날짜는 유지됩니다.";
  const locationLabel = projectLocationLabel(tree, draft);
  const hasAdvancedValues = Boolean(
    draft.description ||
    draft.status !== "todo" ||
    draft.priority !== "medium" ||
    draft.actualStart ||
    draft.actualEnd ||
    draft.dueDate ||
    draft.dueTime ||
    draft.wbs ||
    Number(draft.sortOrder) !== 0 ||
    draft.progressMode === "manual",
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  useLayoutEffect(() => {
    const description = descriptionRef.current;
    if (!description || !advancedOpen || locationOpen) return;
    description.style.height = "auto";
    description.style.height = `${Math.min(160, Math.max(56, description.scrollHeight + 2))}px`;
  }, [draft.description, advancedOpen, locationOpen]);
  function comparableDraft(value: typeof draft) {
    return {
      ...value,
      name: value.name.trim(),
      description: value.description.trim(),
      wbs: value.wbs.trim(),
      sortOrder: value.sortOrder.trim() && Number.isInteger(Number(value.sortOrder))
        ? String(Number(value.sortOrder)) : value.sortOrder,
      progress: value.progressMode === "automatic" ? "" : /^\d+$/.test(value.progress)
        ? String(Number(value.progress)) : value.progress,
    };
  }
  const draftValues = comparableDraft(draft);
  const initialValues = comparableDraft(initial);
  const dirty = (Object.keys(initial) as DraftField[]).some((key) => draftValues[key] !== initialValues[key]);
  const navigationGuard = useRef({ dirty, pending, onClose });
  navigationGuard.current = { dirty, pending, onClose };

  function requestDiscard(action: () => void) {
    if (navigationGuard.current.pending || lock.current) return;
    if (!navigationGuard.current.dirty || saved.current) {
      action();
      return;
    }
    discardOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    discardAction.current = action;
    setDiscardOpen(true);
  }

  useEffect(() => {
    if (!dirty && !pending) return;
    function beforeUnload(event: BeforeUnloadEvent) {
      if (saved.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, pending]);

  useEffect(() => {
    function snapshot() {
      const state: unknown = window.history.state;
      const index = typeof state === "object" && state !== null && "idx" in state &&
        typeof state.idx === "number" && Number.isSafeInteger(state.idx) ? state.idx : null;
      return { href: window.location.href, state, index };
    }
    let current = snapshot();
    let restoring: ReturnType<typeof snapshot> | null = null;
    let resumeAfterRestore: (() => void) | null = null;
    function protectLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href || saved.current) return;
      const guard = navigationGuard.current;
      if (!guard.dirty && !guard.pending && !lock.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      requestDiscard(() => {
        saved.current = true;
        anchor.click();
        guard.onClose();
      });
    }
    function protectHistory(event: PopStateEvent) {
      const destination = snapshot();
      if (restoring) {
        event.stopImmediatePropagation();
        if (destination.index === restoring.index) {
          current = restoring;
          restoring = null;
          const resume = resumeAfterRestore;
          resumeAfterRestore = null;
          resume?.();
        } else if (destination.index !== null && restoring.index !== null) {
          window.history.go(restoring.index - destination.index);
        } else {
          window.history.pushState(restoring.state, "", restoring.href);
          current = restoring;
          restoring = null;
        }
        return;
      }
      const guard = navigationGuard.current;
      if (saved.current || (!guard.dirty && !guard.pending && !lock.current)) {
        current = destination;
        return;
      }
      event.stopImmediatePropagation();
      const previous = current;
      if (previous.index !== null && destination.index !== null && previous.index !== destination.index) {
        restoring = previous;
        window.history.go(previous.index - destination.index);
      } else {
        window.history.pushState(previous.state, "", previous.href);
      }
      requestDiscard(() => {
        const resume = () => {
          saved.current = true;
          if (previous.index !== null && destination.index !== null && previous.index !== destination.index)
            window.history.go(destination.index - previous.index);
          else window.location.assign(destination.href);
          guard.onClose();
        };
        if (restoring) resumeAfterRestore = resume;
        else resume();
      });
    }
    document.addEventListener("click", protectLink, true);
    const unregister = registerProjectHistoryGuard(protectHistory);
    return () => {
      document.removeEventListener("click", protectLink, true);
      unregister();
    };
  }, []);

  useLayoutEffect(() => {
    if (locationOpen) return;
    const fields = fieldsRef.current?.querySelectorAll<HTMLElement>("[data-project-work-field]");
    fields?.forEach((wrapper) => {
      const key = wrapper.dataset.projectWorkField as DraftField;
      const message = fieldErrors[key];
      const controls = wrapper.querySelectorAll<HTMLElement>('input, textarea, button[aria-haspopup="listbox"], button[aria-label="소속 위치 선택"]');
      controls.forEach((control) => {
        if (message) {
          control.setAttribute("aria-invalid", "true");
          control.setAttribute("aria-describedby", `${id}-${key}-error`);
        } else {
          control.removeAttribute("aria-invalid");
          control.removeAttribute("aria-describedby");
        }
      });
    });
    const wrapper = Array.from(fields ?? []).find((element) => fieldErrors[element.dataset.projectWorkField as DraftField]);
    if (wrapper) {
      wrapper.scrollIntoView({ block: "nearest" });
      wrapper.querySelector<HTMLElement>('input, textarea, button[aria-haspopup="listbox"], button')?.focus({ preventScroll: true });
    }
  }, [fieldErrors, advancedOpen, locationOpen, id]);

  function fieldError(key: DraftField) {
    return fieldErrors[key] && <p role="alert" id={`${id}-${key}-error`} className="text-xs text-destructive">{fieldErrors[key]}</p>;
  }
  const itemId =
    target.kind === "work"
      ? target.item?.company_project_work_item_id
      : undefined;
  const parentError =
    target.kind === "work" &&
    draft.parentId !== "none" &&
    (!editing || draft.parentId !== initial.parentId)
      ? getProjectWorkParentError(tree.graph, Number(draft.parentId), itemId)
      : null;
  const parentUnavailable = !!parentError;
  function closeLocation() {
    setLocationOpen(false);
    requestAnimationFrame(() => locationRef.current?.focus({ preventScroll: true }));
  }
  function openLocation() {
    formScrollRef.current = fieldsRef.current?.scrollTop ?? 0;
    setLocationOpen(true);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  const fieldsDisabled = pending || uncertain || !canManage;
  function field<K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) {
    if (fieldsDisabled || lock.current) return;
    setDraft((previous) => ({ ...previous, [key]: value }));
    setFieldErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }
  function close() {
    if (locationOpen) closeLocation();
    else requestDiscard(onClose);
  }
  function handleEscape(event: KeyboardEvent) {
    if (locationOpen) {
      event.preventDefault();
      if (!portal?.querySelector('[role="listbox"]')) closeLocation();
      return;
    }
    if (
      pending ||
      lock.current ||
      fieldsRef.current?.querySelector(
        'button[aria-haspopup="listbox"][aria-expanded="true"], input[aria-expanded="true"]',
      )
    )
      event.preventDefault();
  }
  function handleTooltipEscape(event: KeyboardEvent) {
    handleEscape(event);
    // A tooltip is the top Radix layer while its trigger has focus. Forward
    // Escape to the same guarded close action, then let Radix hide the tooltip.
    if (!event.defaultPrevented) close();
  }
  useLayoutEffect(() => {
    if (!locationOpen && fieldsRef.current) fieldsRef.current.scrollTop = formScrollRef.current;
  }, [locationOpen]);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!locationOpen || !dialog) return;
    const viewport = window.visualViewport;
    function update() {
      const height = viewport?.height ?? window.innerHeight;
      dialog!.style.setProperty("--project-location-dialog-height", `${height * 0.9}px`);
      dialog!.style.setProperty("--project-location-dialog-top", `${(viewport?.offsetTop ?? 0) + height * 0.05}px`);
    }
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      dialog.style.removeProperty("--project-location-dialog-height");
      dialog.style.removeProperty("--project-location-dialog-top");
      dialog.style.removeProperty("--project-location-content-height");
    };
  }, [locationOpen]);
  async function submit(event?: FormEvent, periodConfirmed = false) {
    event?.preventDefault();
    if (locationOpen || lock.current || !canManage || uncertain) return;
    setError(null);
    setAdvancedError(false);
    setFieldErrors({});
    function invalid(key: DraftField, message: string, advanced = false) {
      setFieldErrors({ [key]: message });
      setAdvancedError(advanced);
      if (advanced) setAdvancedOpen(true);
    }
    const name = draft.name.trim();
    if (!name || name.length > (target.kind === "phase" ? 150 : 200)) {
      invalid(
        "name",
        target.kind === "phase"
          ? "단계명은 1~150자로 입력해 주세요."
          : "업무명은 1~200자로 입력해 주세요.",
      );
      return;
    }
    if (
      (draft.plannedStart && !isValidProjectDate(draft.plannedStart)) ||
      (draft.plannedEnd && !isValidProjectDate(draft.plannedEnd))
    ) {
      invalid(draft.plannedStart && !isValidProjectDate(draft.plannedStart) ? "plannedStart" : "plannedEnd", "계획 날짜를 유효한 날짜로 입력해 주세요.");
      return;
    }
    if (
      draft.plannedStart &&
      draft.plannedEnd &&
      draft.plannedEnd < draft.plannedStart
    ) {
      invalid("plannedEnd", "계획 종료일은 시작일과 같거나 이후여야 합니다.");
      return;
    }
    if ((draft.actualStart && !isValidProjectDate(draft.actualStart)) ||
      (draft.actualEnd && !isValidProjectDate(draft.actualEnd))) {
      invalid(draft.actualStart && !isValidProjectDate(draft.actualStart) ? "actualStart" : "actualEnd", "실적 날짜를 유효한 날짜로 입력해 주세요.", true);
      return;
    }
    if (
      draft.actualStart &&
      draft.actualEnd &&
      draft.actualEnd < draft.actualStart
    ) {
      invalid("actualEnd", "실적 종료일은 시작일과 같거나 이후여야 합니다.", true);
      return;
    }
    if (
      !Number.isInteger(Number(draft.sortOrder)) ||
      draft.sortOrder.trim() === ""
    ) {
      invalid("sortOrder", "정렬 순서는 정수로 입력해 주세요.", true);
      return;
    }
    if (
      target.kind === "work" &&
      draft.progressMode === "manual" &&
      (!/^\d+$/.test(draft.progress) || Number(draft.progress) > 100)
    ) {
      invalid("progress", "진행률은 0~100 사이의 정수로 입력해 주세요.", true);
      return;
    }
    if (
      target.kind === "work" &&
      (draft.dueDate || draft.dueTime) &&
      (!draft.dueDate ||
        !draft.dueTime ||
        !isValidProjectDate(draft.dueDate) ||
        !Number.isFinite(
          new Date(`${draft.dueDate}T${draft.dueTime}`).getTime(),
        ))
    ) {
      invalid(!draft.dueDate ? "dueDate" : "dueTime", "마감 날짜와 시간을 모두 입력해 주세요.", true);
      return;
    }
    if (parentError) {
      invalid("parentId", parentError);
      return;
    }
    if (editing && !dirty) {
      onClose();
      return;
    }
    if (!periodConfirmed) {
      const period = { planned_start_date: draft.plannedStart, planned_end_date: draft.plannedEnd };
      const messages = periodOptions.flatMap((parent) =>
        periodWarnings(period, parent).map((message) => `${parent.label} 기준: ${message}`));
      if (editing && (draft.plannedStart !== initial.plannedStart || draft.plannedEnd !== initial.plannedEnd)) {
        const children = target.kind === "phase"
          ? tree.items.filter((item) => item.company_project_phase_id === target.phase?.company_project_phase_id ||
              tree.hierarchy.displayPhaseByWorkId.get(item.company_project_work_item_id)?.company_project_phase_id === target.phase?.company_project_phase_id)
          : (tree.children.get(itemId!) ?? []);
        const outside = children.filter((item) => periodWarnings(item, period).length > 0);
        if (outside.length) messages.push(`조회된 하위 업무 ${outside.length}건이 변경할 기간을 벗어납니다.`);
      }
      if (messages.length) {
        setPeriodWarning(messages);
        return;
      }
    }
    lock.current = true;
    const payload: UpdateCompanyProjectWorkItemRequest &
      UpdateCompanyProjectPhaseRequest = {};
    function changed(key: keyof typeof draft, apiKey: string, value: unknown) {
      if (!editing || draftValues[key] !== initialValues[key])
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
          draftValues.progress !== initialValues.progress
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
      saved.current = true;
      onSaved();
    } catch (caught) {
      const apiError = getApiErrorDetails(caught);
      const status = apiError?.status;
      const uncertainCreation =
        !editing && (apiError?.code === "NON_JSON_RESPONSE" || !status || status >= 500 || status === 408);
      setUncertain(uncertainCreation);
      setError(
        uncertainCreation
          ? "서버의 저장 결과를 확인하지 못했습니다. 중복 추가를 방지하려면 창을 닫고 목록을 새로고침하여 추가 여부를 확인해 주세요."
          : getErrorMessage(
              caught,
              "저장하지 못했습니다. 입력 내용을 확인해 주세요.",
            ),
      );
      const issues = apiError?.details?.issues;
      const apiFields: Record<string, DraftField> = {
        name: "name", title: "name", description: "description", status: "status", priority: "priority",
        planned_start_date: "plannedStart", planned_end_date: "plannedEnd",
        actual_start_date: "actualStart", actual_end_date: "actualEnd",
        due_datetime: "dueDate", progress_percent: "progress", progress_override_percent: "progressMode",
        wbs_code: "wbs", sort_order: "sortOrder", parent_work_item_id: "parentId", company_project_phase_id: "parentId",
      };
      const serverFields: Partial<Record<DraftField, string>> = {};
      if (Array.isArray(issues)) {
        for (const issue of issues) {
          if (typeof issue !== "object" || issue === null || !("path" in issue)) continue;
          const parts: unknown[] = Array.isArray(issue.path) ? issue.path : [issue.path];
          const apiField = parts.find((part): part is string => typeof part === "string" && Object.hasOwn(apiFields, part));
          if (!apiField) continue;
          const message = "message" in issue && typeof issue.message === "string"
            ? issue.message : "입력값을 확인해 주세요.";
          serverFields[apiFields[apiField]] = message;
        }
      }
      const code = apiError?.code;
      const knownErrorField: DraftField | undefined =
        code === "INVALID_PROJECT_PHASE_ACTUAL_DATE_RANGE" || code === "INVALID_WORK_ITEM_ACTUAL_DATE_RANGE"
          ? "actualEnd" : code === "INVALID_PROJECT_PHASE_DATE_RANGE" || code === "INVALID_WORK_ITEM_DATE_RANGE"
            ? "plannedEnd" : code === "INVALID_PROJECT_WORK_ITEM_PARENT" || code === "PROJECT_WORK_ITEM_DEPTH_EXCEEDED"
              ? "parentId" : undefined;
      if (knownErrorField && !serverFields[knownErrorField])
        serverFields[knownErrorField] = getErrorMessage(caught);
      if (serverFields.progress && draft.progressMode === "automatic") {
        serverFields.progressMode = serverFields.progress;
        delete serverFields.progress;
      }
      setFieldErrors(serverFields);
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
        ref={dialogRef}
        className={`left-4 right-4 top-[5dvh] mx-auto flex max-h-[min(90dvh,760px)] w-auto max-w-[560px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 text-foreground [&>button]:text-muted-foreground${locationOpen ? " project-work-location-dialog" : ""}`}
        style={{ transform: "none", translate: "none" }}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onEscapeKeyDown={handleEscape}
        onInteractOutside={(event) => {
          if (locationOpen || pending || lock.current) event.preventDefault();
        }}
      >
        <TooltipProvider delayDuration={300}>
        <FloatingPanelPortalProvider value={portal}>
          <DialogHeader className="shrink-0 px-5 pb-4 pt-5 text-left sm:px-6">
            <DialogTitle
              ref={titleRef}
              tabIndex={-1}
              className="pr-8 leading-6 outline-none"
            >
              {locationOpen
                ? "소속 위치 선택"
                : `${kindLabel} ${editing ? "수정" : "추가"}`}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {target.kind === "work"
                ? "기본 정보를 입력하고, 필요할 때 상세 설정을 펼쳐 주세요."
                : "단계의 상태를 변경해도 소속 업무의 상태는 유지됩니다."}
            </DialogDescription>
          </DialogHeader>
          {!canManage && onRetryPermission && (
            <div className="shrink-0 space-y-2 px-5 pb-4 sm:px-6">
              <p role="status" className="text-sm text-muted-foreground">
                권한을 다시 확인할 때까지 입력 내용이 유지되며 저장할 수 없습니다.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={onRetryPermission} disabled={permissionRetrying} aria-busy={permissionRetrying}>
                권한 다시 확인
              </Button>
            </div>
          )}
          {!locationOpen && (
            <>
              <form
                ref={fieldsRef}
                id={id}
                noValidate
                onSubmit={(event) => void submit(event)}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6"
                data-project-work-fields
              >
                <fieldset
                  disabled={fieldsDisabled}
                  className="min-w-0 space-y-4"
                >
                  <label className="block space-y-1" data-project-work-field="name">
                    <span className="text-sm">{kindLabel}명 <span className="text-primary">*</span></span>
                    <Input
                      aria-label={`${kindLabel}명`}
                      required
                      maxLength={target.kind === "phase" ? 150 : 200}
                      placeholder={`${kindLabel}명을 입력하세요`}
                      className={fieldClass}
                      value={draft.name}
                      onChange={(event) => field("name", event.target.value)}
                    />
                    {fieldError("name")}
                  </label>
                  {target.kind === "work" && <div className="space-y-1" data-project-work-field="parentId">
                    <p className="text-sm">소속 위치</p>
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              ref={locationRef}
                              type="button"
                              aria-label="소속 위치 선택"
                              disabled={fieldsDisabled}
                              onClick={openLocation}
                              title={locationLabel}
                              className="flex w-full items-center gap-2 rounded-xl border border-input bg-background px-3 py-3 text-left text-sm hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
                            >
                              <Folder
                                aria-hidden
                                className="h-4 w-4 shrink-0 text-muted-foreground"
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {locationLabel}
                              </span>
                              <span className="shrink-0 text-xs font-medium text-primary">변경</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent onEscapeKeyDown={handleTooltipEscape} className="max-w-[min(28rem,calc(100vw-2rem))] break-words">{locationLabel}</TooltipContent>
                        </Tooltip>
                        {detail.project.phase_mode === "phased" && draft.parentId !== "none" && (
                          <p className="truncate text-xs leading-5 text-muted-foreground" aria-label="선택한 소속 관계" title={`연결 단계: ${projectLinkedPhaseLabel(tree, draft)}`}>
                            연결 단계: {projectLinkedPhaseLabel(tree, draft)}
                          </p>
                        )}
                        {parentError && (
                          <p className="text-xs text-destructive">
                            {parentError}
                          </p>
                        )}
                        {fieldError("parentId")}
                      </>
                  </div>}
                  <div className="space-y-2" role="group" aria-label="계획 기간">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">계획 기간</p>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span tabIndex={!fieldsDisabled && !canApplyPeriod ? 0 : undefined} aria-describedby={`${id}-period-help`} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20">
                            <Button type="button" variant="outline" size="sm" disabled={fieldsDisabled || !canApplyPeriod}
                              aria-describedby={`${id}-period-help`}
                              title={periodHelp}
                              onClick={() => {
                                if (!periodSource) return;
                                const dates = applyParentPeriod({ planned_start_date: draft.plannedStart, planned_end_date: draft.plannedEnd }, periodSource);
                                setDraft((previous) => ({ ...previous, plannedStart: dates.planned_start_date ?? "", plannedEnd: dates.planned_end_date ?? "" }));
                                setFieldErrors((previous) => {
                                  const next = { ...previous };
                                  delete next.plannedStart;
                                  delete next.plannedEnd;
                                  return next;
                                });
                              }}>{target.kind === "phase" ? "프로젝트 기간 적용" : "상위 기간 적용"}</Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent onEscapeKeyDown={handleTooltipEscape} className="max-w-[min(22rem,calc(100vw-2rem))] break-words">{periodHelp}</TooltipContent>
                      </Tooltip>
                    </div>
                    {periodOptions.length > 1 && <CustomSelect
                      ariaLabel="부모 기간 적용 기준"
                      value={periodSource?.key ?? ""}
                      options={periodOptions.map((option) => ({ value: option.key, label: option.label }))}
                      onChange={(value) => setPeriodSourceKey(String(value))}
                      disabled={fieldsDisabled}
                      className={selectClass}
                      matchTriggerWidth
                      collisionBoundaryRef={fieldsRef}
                    />}
                    <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ["plannedStart", "계획 시작일"],
                        ["plannedEnd", "계획 종료일"],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="min-w-0 space-y-1" data-project-work-field={key}>
                        <p className="text-xs text-muted-foreground">{label === "계획 시작일" ? "시작일" : "종료일"}</p>
                        <CompactDateInput
                          ariaLabel={`${kindLabel} ${label}`}
                          clearLabel={`${kindLabel} ${label} 지우기`}
                          value={draft[key]}
                          onChange={(value) => field(key, value)}
                          emptyPlaceholder="날짜 선택"
                          disabled={fieldsDisabled}
                          className={dateClass}
                        />
                        {fieldError(key)}
                      </div>
                    ))}
                    </div>
                    <p id={`${id}-period-help`} className={canApplyPeriod ? "sr-only" : "text-xs text-muted-foreground"}>
                      {periodHelp}
                    </p>
                  </div>
                  <div>
                    <button
                      type="button"
                      aria-expanded={advancedOpen}
                      aria-controls={`${id}-advanced`}
                      disabled={fieldsDisabled}
                      onClick={() => setAdvancedOpen((open) => !open)}
                      className="flex w-full items-center gap-2 rounded-lg py-2 text-left text-sm font-medium hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
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
                        className="space-y-3 pt-2"
                      >
                        <label className="block space-y-1" data-project-work-field="description">
                          <span className="text-sm">설명</span>
                          <Textarea
                            ref={descriptionRef}
                            aria-label={`${kindLabel} 설명`}
                            rows={1}
                            className={`${fieldClass} min-h-14 max-h-40 resize-y`}
                            maxLength={5000}
                            value={draft.description}
                            onChange={(event) =>
                              field("description", event.target.value)
                            }
                          />
                          {fieldError("description")}
                        </label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="min-w-0 space-y-1" data-project-work-field="status">
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
                              contentClassName="project-work-select-menu border-border bg-background text-foreground overscroll-contain"
                            />
                            {fieldError("status")}
                          </div>
                          {target.kind === "work" && (
                            <div className="min-w-0 space-y-1" data-project-work-field="priority">
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
                                contentClassName="project-work-select-menu border-border bg-background text-foreground overscroll-contain"
                              />
                              {fieldError("priority")}
                            </div>
                          )}
                        </div>
                        <div
                          className="grid grid-cols-2 gap-3"
                          role="group"
                          aria-label="실적 기간"
                        >
                          {(
                            [
                              ["actualStart", "실적 시작일"],
                              ["actualEnd", "실적 종료일"],
                            ] as const
                          ).map(([key, label]) => (
                            <div key={key} className="min-w-0 space-y-1" data-project-work-field={key}>
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
                              {fieldError(key)}
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
                              <div className="min-w-0 space-y-1" data-project-work-field="dueDate">
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
                                {fieldError("dueDate")}
                              </div>
                              <div className="min-w-0 space-y-1" data-project-work-field="dueTime">
                                <p className="text-sm">마감 시간</p>
                                <div className="relative">
                                  <CompactTimeInput
                                    ariaLabel="업무 마감 시간"
                                    value={draft.dueTime}
                                    onChange={(value) =>
                                      field("dueTime", value)
                                    }
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
                                {fieldError("dueTime")}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="min-w-0 space-y-1" data-project-work-field="progressMode">
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
                                    contentClassName="project-work-select-menu border-border bg-background text-foreground overscroll-contain"
                                  />
                                  {fieldError("progressMode")}
                                </div>
                                {draft.progressMode === "manual" && (
                                  <label className="min-w-0 space-y-1" data-project-work-field="progress">
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
                                    {fieldError("progress")}
                                  </label>
                                )}
                              </div>
                              <p className="text-xs leading-5 text-muted-foreground">
                                수동 설정은 0%도 지정할 수 있습니다. 자동
                                계산으로 전환하면 담당자 배정을 기준으로 다시
                                계산하며, 배정이 없으면 기존 진행률이
                                유지됩니다.
                              </p>
                            </div>
                            <label className="block space-y-1" data-project-work-field="wbs">
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
                              {fieldError("wbs")}
                            </label>
                          </>
                        )}
                        <label className="block space-y-1" data-project-work-field="sortOrder">
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
                          {fieldError("sortOrder")}
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
                  취소
                </Button>
                <Button
                  type="submit"
                  form={id}
                  disabled={fieldsDisabled || parentUnavailable}
                  aria-busy={pending}
                >
                  {pending ? "저장 중..." : editing ? "저장" : `${kindLabel} 추가`}
                </Button>
              </DialogFooter>
            </>
          )}
          {locationOpen && (
            <ProjectLocationPicker
              tree={tree}
              value={{ parentId: draft.parentId, phaseId: draft.phaseId }}
              editing={editing}
              itemId={itemId}
              canManage={!fieldsDisabled}
              phased={detail.project.phase_mode === "phased"}
              onCancel={closeLocation}
              onConfirm={(location) => {
                setDraft((previous) => ({ ...previous, ...location }));
                closeLocation();
              }}
            />
          )}
          <div ref={setPortal} />
          <ProjectPeriodWarning messages={periodWarning} onCancel={() => setPeriodWarning(null)}
            onConfirm={() => { setPeriodWarning(null); void submit(undefined, true); }} />
          <Dialog open={discardOpen} onOpenChange={(open) => {
            setDiscardOpen(open);
            if (!open) discardAction.current = null;
          }}>
            <DialogContent
              className="max-h-[85dvh] max-w-[calc(100vw-2rem)] overflow-y-auto border-border bg-background text-foreground sm:max-w-md"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                requestAnimationFrame(() => {
                  if (!titleRef.current?.isConnected) return;
                  const opener = discardOpener.current;
                  if (opener?.isConnected && opener !== document.body && !opener.closest('[inert], [hidden], [aria-hidden="true"]') && !opener.matches(":disabled"))
                    opener.focus({ preventScroll: true });
                  else titleRef.current.focus({ preventScroll: true });
                });
              }}
            >
              <DialogHeader>
                <DialogTitle>저장하지 않은 변경사항이 있습니다.</DialogTitle>
                <DialogDescription className="text-muted-foreground">변경사항을 버리고 나가시겠습니까?</DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:space-x-0">
                <Button variant="outline" onClick={() => { discardAction.current = null; setDiscardOpen(false); }}>계속 편집</Button>
                <Button onClick={() => {
                  const action = discardAction.current;
                  discardAction.current = null;
                  setDiscardOpen(false);
                  action?.();
                }}>변경사항 버리고 나가기</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </FloatingPanelPortalProvider>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
