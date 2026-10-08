import { useId, useRef, useState, useEffect, type FormEvent } from "react";
import { CompactDateInput } from "@/components/CompactDateTimeInputs";
import CustomSelect from "@/components/ui/CustomSelect";
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
import { FloatingPanelPortalProvider } from "@/components/ui/FloatingPanelPortal";
import {
  isActiveProjectMembership,
  PROJECT_STATUS_OPTIONS,
  PROJECT_VISIBILITY_OPTIONS,
} from "@/components/projects/ProjectPresentation";
import {
  useCreateCompanyProject,
  useUpdateCompanyProject,
} from "@/hooks/useCompanyProjects";
import { getApiErrorDetails, getErrorCode, getErrorMessage } from "@/lib/error";
import { registerProjectHistoryGuard } from "@/lib/projectNavigationGuard";
import type {
  CompanyMembership,
  CompanyProject,
  CompanyProjectPhaseMode,
  CompanyProjectStatus,
  CompanyProjectVisibility,
  CreateCompanyProjectRequest,
  UpdateCompanyProjectRequest,
} from "@/types";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membership: CompanyMembership;
  project?: CompanyProject;
  onSaved: (project: CompanyProject) => void;
}

interface ProjectDraft {
  name: string;
  description: string;
  status: string;
  visibility: string;
  phaseMode: string;
  startDate: string;
  endDate: string;
}

const PHASE_MODE_OPTIONS = [
  {
    value: "phased",
    label: "단계형",
    description: "프로젝트를 여러 단계로 구분하여 관리합니다.",
  },
  {
    value: "phase_less",
    label: "단계 없음",
    description: "별도 프로젝트 단계 없이 업무를 직접 관리합니다.",
  },
] as const;

const fieldClassName =
  "border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/20";
const selectClassName =
  "h-10 border-input bg-background hover:border-primary/50 focus-visible:border-primary focus-visible:ring-primary/20 data-[state=open]:border-primary data-[state=open]:ring-primary/20";

function dateValue(value?: string | null) {
  return value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? value ?? "";
}

function initialDraft(project?: CompanyProject): ProjectDraft {
  return {
    name: project?.name ?? "",
    description: project?.description ?? "",
    status: project ? project.status : "draft",
    visibility: project ? (project.visibility ?? "") : "department_tree",
    phaseMode: project ? (project.phase_mode ?? "") : "phased",
    startDate: dateValue(project?.planned_start_date),
    endDate: dateValue(project?.planned_end_date),
  };
}

function isValidDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00Z`);
  return (
    year > 0 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function hasDraftChanges(value: ProjectDraft, initial: ProjectDraft) {
  return (
    value.name.trim() !== initial.name.trim() ||
    value.description.trim() !== initial.description.trim() ||
    value.status !== initial.status ||
    value.visibility !== initial.visibility ||
    value.phaseMode !== initial.phaseMode ||
    value.startDate !== initial.startDate ||
    value.endDate !== initial.endDate
  );
}

function historyIndex(state: unknown): number | null {
  if (typeof state !== "object" || state === null || !("idx" in state))
    return null;
  return typeof state.idx === "number" && Number.isSafeInteger(state.idx)
    ? state.idx
    : null;
}

function historySnapshot() {
  return {
    href: window.location.href,
    state: window.history.state as unknown,
    index: historyIndex(window.history.state),
  };
}

function isUncertainCreationError(error: unknown) {
  const status = getApiErrorDetails(error)?.status;
  return (
    getErrorCode(error) === "NON_JSON_RESPONSE" ||
    !status ||
    status >= 500 ||
    status === 408
  );
}

function creationUnavailableReason(membership: CompanyMembership) {
  if (
    !Number.isSafeInteger(membership.company_id) ||
    membership.company_id <= 0
  ) {
    return "소속 회사 정보를 확인한 후 다시 시도해 주세요.";
  }
  if (membership.status !== "active")
    return "활성 회사 구성원만 프로젝트를 생성할 수 있습니다.";
  if (membership.company?.status && membership.company.status !== "active") {
    return "활성 회사에서만 프로젝트를 생성할 수 있습니다.";
  }
  const departmentId =
    membership.department_id ?? membership.department?.department_id;
  if (!Number.isSafeInteger(departmentId) || Number(departmentId) <= 0) {
    return "소속 부서가 있는 구성원만 프로젝트를 생성할 수 있습니다.";
  }
  if (
    membership.department?.status &&
    membership.department.status !== "active"
  ) {
    return "활성 부서에 속한 구성원만 프로젝트를 생성할 수 있습니다.";
  }
  // The membership API does not expose project_create_policy or the department leader.
  // The user API makes the final decision about the department's creation policy.
  return null;
}

export default function ProjectFormDialog(props: ProjectFormDialogProps) {
  if (!props.open) return null;
  return (
    <ProjectFormSession
      key={`${props.membership.company_id}:${props.membership.company_member_id}:${props.project?.company_project_id ?? "new"}`}
      {...props}
    />
  );
}

function ProjectFormSession({
  onOpenChange,
  membership,
  project,
  onSaved,
}: ProjectFormDialogProps) {
  const formId = useId();
  const [initial] = useState(() => initialDraft(project));
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [nameInvalid, setNameInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creationUncertain, setCreationUncertain] = useState(false);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fieldsRef = useRef<HTMLFormElement>(null);
  const submissionLock = useRef(false);
  const saved = useRef(false);
  const create = useCreateCompanyProject();
  const update = useUpdateCompanyProject();
  const pending = submitting || create.isPending || update.isPending;
  const fieldsDisabled = pending || creationUncertain;
  const dirty = hasDraftChanges(draft, initial);
  const navigationGuard = useRef({ dirty, pending, onOpenChange });
  navigationGuard.current = { dirty, pending, onOpenChange };
  const unavailable = project
    ? project.company_id !== membership.company_id ||
      !isActiveProjectMembership(membership)
      ? "프로젝트의 소속 회사와 활성 멤버십을 확인한 후 다시 시도해 주세요."
      : null
    : creationUnavailableReason(membership);
  const statusOptions = project
    ? PROJECT_STATUS_OPTIONS
    : PROJECT_STATUS_OPTIONS.filter(
        ({ value }) => value === "draft" || value === "active",
      );
  const visibilityOptions = project
    ? PROJECT_VISIBILITY_OPTIONS
    : PROJECT_VISIBILITY_OPTIONS.filter(({ value }) => value !== "company");

  useEffect(() => {
    if (!dirty && !pending) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saved.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty, pending]);

  useEffect(() => {
    let snapshot = historySnapshot();
    let restoring: ReturnType<typeof historySnapshot> | null = null;
    function mayLeave() {
      const guard = navigationGuard.current;
      if (saved.current) return true;
      if (guard.pending || submissionLock.current) return false;
      return (
        !guard.dirty ||
        window.confirm(
          "저장하지 않은 변경 내용이 있습니다. 이동하면 변경 내용이 사라집니다. 이동할까요?",
        )
      );
    }
    function protectLink(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      // External document navigation uses beforeunload. Router links use this guard.
      if (
        destination.origin !== window.location.origin ||
        destination.href === window.location.href
      )
        return;
      if (!mayLeave()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      } else if (navigationGuard.current.dirty && !saved.current) {
        navigationGuard.current.onOpenChange(false);
      }
    }
    function restoreHistory(destination: ReturnType<typeof historySnapshot>) {
      if (
        snapshot.index !== null &&
        destination.index !== null &&
        snapshot.index !== destination.index
      ) {
        restoring = snapshot;
        window.history.go(snapshot.index - destination.index);
      } else {
        // A non-router entry may have no index. Preserve that entry and restore the
        // form URL in a new entry rather than overwrite the user's destination.
        window.history.pushState(snapshot.state, "", snapshot.href);
      }
    }
    function protectHistory(event: PopStateEvent) {
      const destination = historySnapshot();
      if (restoring) {
        event.stopImmediatePropagation();
        if (destination.index === restoring.index) {
          snapshot = restoring;
          restoring = null;
        } else if (destination.index !== null && restoring.index !== null) {
          window.history.go(restoring.index - destination.index);
        } else {
          window.history.pushState(restoring.state, "", restoring.href);
          snapshot = restoring;
          restoring = null;
        }
        return;
      }
      if (mayLeave()) {
        snapshot = destination;
        if (navigationGuard.current.dirty && !saved.current)
          navigationGuard.current.onOpenChange(false);
        return;
      }
      // The guard is installed before BrowserRouter, keeping its route and
      // history index unchanged during both the rejected and restore POP.
      event.stopImmediatePropagation();
      restoreHistory(destination);
    }
    document.addEventListener("click", protectLink, true);
    const unregisterHistoryGuard = registerProjectHistoryGuard(protectHistory);
    return () => {
      document.removeEventListener("click", protectLink, true);
      unregisterHistoryGuard();
    };
  }, []);

  function change<K extends keyof ProjectDraft>(
    field: K,
    value: ProjectDraft[K],
  ) {
    if (fieldsDisabled || submissionLock.current) return;
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
    if (field === "name") setNameInvalid(false);
  }

  function requestClose() {
    if (pending || submissionLock.current) return;
    if (
      dirty &&
      !saved.current &&
      !window.confirm(
        "저장하지 않은 변경 내용이 있습니다. 닫으면 변경 내용이 사라집니다. 닫을까요?",
      )
    )
      return;
    onOpenChange(false);
  }

  function validate() {
    if (unavailable) return unavailable;
    if (!draft.name.trim()) {
      setNameInvalid(true);
      nameRef.current?.focus();
      return "프로젝트명을 입력해 주세요.";
    }
    if (!isValidDate(draft.startDate) || !isValidDate(draft.endDate)) {
      return "계획 날짜를 YYYY-MM-DD 형식의 유효한 날짜로 입력해 주세요.";
    }
    if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
      return "계획 종료일이 계획 시작일보다 빠를 수 없습니다.";
    }
    if (
      (!project || draft.status !== initial.status) &&
      !statusOptions.some(({ value }) => value === draft.status)
    ) {
      return "지원하는 프로젝트 상태를 선택해 주세요.";
    }
    if (
      (!project || draft.visibility !== initial.visibility) &&
      !visibilityOptions.some(({ value }) => value === draft.visibility)
    ) {
      return "지원하는 공개 범위를 선택해 주세요.";
    }
    if (
      !project &&
      !PHASE_MODE_OPTIONS.some(({ value }) => value === draft.phaseMode)
    ) {
      return "지원하는 운영 방식을 선택해 주세요.";
    }
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current || pending || creationUncertain) return;
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (project && !dirty) return;
    if (
      project &&
      draft.status !== initial.status &&
      (draft.status === "archived" || draft.status === "cancelled")
    ) {
      const action = draft.status === "archived" ? "보관" : "취소";
      if (!window.confirm(`프로젝트를 ${action} 상태로 변경할까요?`)) return;
    }
    submissionLock.current = true;
    setSubmitting(true);
    setError(null);
    let result: CompanyProject;
    try {
      if (project) {
        const payload: UpdateCompanyProjectRequest = {};
        if (draft.name.trim() !== initial.name.trim())
          payload.name = draft.name.trim();
        if (draft.description.trim() !== initial.description.trim())
          payload.description = draft.description.trim() || null;
        if (draft.status !== initial.status)
          payload.status = draft.status as CompanyProjectStatus;
        if (draft.visibility !== initial.visibility)
          payload.visibility = draft.visibility as CompanyProjectVisibility;
        if (draft.startDate !== initial.startDate)
          payload.planned_start_date = draft.startDate || null;
        if (draft.endDate !== initial.endDate)
          payload.planned_end_date = draft.endDate || null;
        result = await update.mutateAsync({
          companyProjectId: project.company_project_id,
          payload,
        });
      } else {
        const payload: CreateCompanyProjectRequest = {
          company_id: membership.company_id,
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          status: draft.status as "draft" | "active",
          visibility: draft.visibility as "department_tree" | "members",
          phase_mode: draft.phaseMode as CompanyProjectPhaseMode,
          planned_start_date: draft.startDate || null,
          planned_end_date: draft.endDate || null,
        };
        result = await create.mutateAsync(payload);
      }
    } catch (err) {
      const message = getErrorMessage(err, "프로젝트를 저장하지 못했습니다.");
      if (!project && isUncertainCreationError(err)) {
        setCreationUncertain(true);
        setError(
          `${message} 저장되었을 수 있으니 목록에서 먼저 확인해 주세요. 중복 생성을 방지하기 위해 이 창에서는 다시 제출할 수 없습니다.`,
        );
      } else {
        setError(message);
      }
      return;
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
    saved.current = true;
    onOpenChange(false);
    onSaved(result);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogContent
        className="left-4 right-4 top-[5dvh] mx-auto flex max-h-[min(90dvh,760px)] w-auto max-w-[560px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 text-foreground"
        style={{ transform: "none", translate: "none" }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          // Let the nested date/select close before dismissing the entire form.
          if (
            pending ||
            submissionLock.current ||
            titleRef.current
              ?.closest('[role="dialog"]')
              ?.querySelector('[data-project-fields] [aria-expanded="true"]')
          )
            event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending || submissionLock.current) event.preventDefault();
        }}
      >
        <FloatingPanelPortalProvider value={portal}>
          <DialogHeader className="shrink-0 px-5 pb-4 pt-5 text-left sm:px-6">
            <DialogTitle
              ref={titleRef}
              tabIndex={-1}
              className="pr-8 leading-6 outline-none"
            >
              {project ? "프로젝트 수정" : "프로젝트 생성"}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {project
                ? "프로젝트의 기본 정보와 상태를 관리합니다."
                : "소속 부서를 기준으로 새 프로젝트를 만듭니다."}
            </DialogDescription>
          </DialogHeader>
          <form
            ref={fieldsRef}
            id={formId}
            onSubmit={(event) => void submit(event)}
            noValidate
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6"
            data-project-fields
          >
            <fieldset disabled={fieldsDisabled} className="min-w-0 space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-company`}
                  className="block text-sm font-medium"
                >
                  소속 회사
                </label>
                <Input
                  id={`${formId}-company`}
                  value={
                    membership.company?.name || `회사 #${membership.company_id}`
                  }
                  readOnly
                  className={`${fieldClassName} bg-muted text-muted-foreground`}
                />
                {membership.department?.name && (
                  <p className="break-words text-xs text-muted-foreground">
                    소속 부서: {membership.department.name}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-name`}
                  className="block text-sm font-medium"
                >
                  프로젝트명{" "}
                  <span className="text-destructive" aria-hidden>
                    *
                  </span>
                </label>
                <Input
                  ref={nameRef}
                  id={`${formId}-name`}
                  value={draft.name}
                  onChange={(event) => change("name", event.target.value)}
                  required
                  aria-invalid={nameInvalid}
                  aria-describedby={nameInvalid ? `${formId}-error` : undefined}
                  placeholder="프로젝트명을 입력하세요"
                  className={fieldClassName}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor={`${formId}-description`}
                  className="block text-sm font-medium"
                >
                  설명
                </label>
                <Textarea
                  id={`${formId}-description`}
                  value={draft.description}
                  onChange={(event) =>
                    change("description", event.target.value)
                  }
                  placeholder="프로젝트의 목표와 주요 내용을 입력하세요"
                  rows={3}
                  className={`${fieldClassName} min-h-20 resize-y`}
                />
              </div>
              <div
                className="grid gap-4 sm:grid-cols-2"
                role="group"
                aria-label="계획 기간"
              >
                {(["startDate", "endDate"] as const).map((field) => {
                  const label =
                    field === "startDate" ? "계획 시작일" : "계획 종료일";
                  return (
                    <div key={field} className="min-w-0 space-y-1.5">
                      <p className="text-sm font-medium">{label}</p>
                      <CompactDateInput
                        value={draft[field]}
                        onChange={(value) => change(field, value)}
                        emptyPlaceholder="날짜 선택"
                        ariaLabel={label}
                        clearLabel={`${label} 지우기`}
                        disabled={fieldsDisabled}
                        className="h-10 min-w-0 border-input bg-background hover:border-primary/50 hover:bg-background focus-within:border-primary focus-within:bg-background focus-within:ring-primary/20 [&_input]:text-foreground"
                      />
                    </div>
                  );
                })}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-1.5">
                  <p className="text-sm font-medium">공개 범위</p>
                  <CustomSelect
                    value={draft.visibility}
                    options={visibilityOptions}
                    onChange={(value) => change("visibility", value)}
                    ariaLabel="공개 범위"
                    placeholder={
                      draft.visibility
                        ? `현재 범위: ${draft.visibility}`
                        : "공개 범위 선택"
                    }
                    disabled={fieldsDisabled}
                    className={selectClassName}
                    showFallbackMarker={false}
                    matchTriggerWidth
                    collisionBoundaryRef={fieldsRef}
                    wrapDescriptions
                    contentClassName="border-border bg-popover text-popover-foreground"
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <p className="text-sm font-medium">
                    {project ? "상태" : "생성 상태"}
                  </p>
                  <CustomSelect
                    value={draft.status}
                    options={statusOptions}
                    onChange={(value) => change("status", value)}
                    ariaLabel={project ? "프로젝트 상태 변경" : "생성 상태"}
                    placeholder={`현재 상태: ${draft.status}`}
                    disabled={fieldsDisabled}
                    className={selectClassName}
                    showFallbackMarker={false}
                    matchTriggerWidth
                    collisionBoundaryRef={fieldsRef}
                    wrapDescriptions
                    contentClassName="border-border bg-popover text-popover-foreground"
                  />
                </div>
              </div>
              {!project && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">운영 방식</p>
                  <CustomSelect
                    value={draft.phaseMode}
                    options={PHASE_MODE_OPTIONS}
                    onChange={(value) => change("phaseMode", value)}
                    ariaLabel="운영 방식"
                    disabled={fieldsDisabled}
                    className={selectClassName}
                    showFallbackMarker={false}
                    matchTriggerWidth
                    collisionBoundaryRef={fieldsRef}
                    wrapDescriptions
                    contentClassName="border-border bg-popover text-popover-foreground"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    운영 방식은 생성할 때 선택합니다.
                  </p>
                </div>
              )}
            </fieldset>
            {unavailable && (
              <p
                role="alert"
                className="mt-4 break-words text-sm text-destructive"
              >
                {unavailable}
              </p>
            )}
            {error && (
              <p
                id={`${formId}-error`}
                role="alert"
                className="mt-4 whitespace-pre-line break-words text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </form>
          <DialogFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 border-t border-border px-5 py-3 sm:px-6 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={requestClose}
              className="h-10 border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-primary/20"
            >
              취소
            </Button>
            {creationUncertain && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  saved.current = true;
                  onOpenChange(false);
                }}
                className="h-10 border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-primary/20"
              >
                목록에서 확인
              </Button>
            )}
            <Button
              type="submit"
              form={formId}
              disabled={
                fieldsDisabled || !!unavailable || (!!project && !dirty)
              }
              className="h-10 border-primary bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/20"
              aria-busy={pending}
            >
              {pending ? "저장 중..." : project ? "저장" : "생성"}
            </Button>
          </DialogFooter>
          <div ref={setPortal} />
        </FloatingPanelPortalProvider>
      </DialogContent>
    </Dialog>
  );
}
