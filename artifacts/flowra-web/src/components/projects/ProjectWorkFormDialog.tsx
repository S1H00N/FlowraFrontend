import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { WORK_PRIORITY_OPTIONS, WORK_STATUS_OPTIONS } from "./ProjectWorkPresentation";
import {
  useCreateCompanyProjectPhase, useCreateCompanyProjectWorkItem,
  useUpdateCompanyProjectPhase, useUpdateCompanyProjectWorkItem,
} from "@/hooks/useCompanyProjects";
import { getApiErrorDetails, getErrorMessage } from "@/lib/error";
import { buildProjectWorkTree, getWorkItemAncestorPath, getWorkItemDepthInfo, MAX_PROJECT_WORK_DEPTH } from "@/lib/projectWorkTree";
import type {
  CompanyProjectDetailData, CompanyProjectPhase, CompanyProjectWorkItem,
  CompanyProjectWorkItemStatus, TaskPriority, UpdateCompanyProjectPhaseRequest,
  UpdateCompanyProjectWorkItemRequest,
} from "@/types";

export type ProjectWorkEditTarget =
  | { kind: "phase"; phase?: CompanyProjectPhase }
  | { kind: "work"; item?: CompanyProjectWorkItem; parent?: CompanyProjectWorkItem };

const fieldClass = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
const dateOnly = (value?: string | null) => value?.slice(0, 10) ?? "";
function localDatetime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default function ProjectWorkFormDialog({ target, detail, items, canManage, onClose, onSaved }: {
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
  const pending = createPhase.isPending || updatePhase.isPending || createWork.isPending || updateWork.isPending;
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [initial] = useState(() => ({
    name: target.kind === "phase" ? target.phase?.name ?? "" : target.item?.title ?? "",
    description: current?.description ?? "",
    status: current?.status ?? "todo",
    priority: target.kind === "work" ? target.item?.priority ?? "medium" : "medium",
    phaseId: target.kind === "work" ? String(target.item?.company_project_phase_id ?? "none") : "none",
    // The server does not inherit a parent's phase or responsibility departments.
    parentId: target.kind === "work" ? String(target.item?.parent_work_item_id ?? target.parent?.company_project_work_item_id ?? "none") : "none",
    plannedStart: dateOnly(current?.planned_start_date), plannedEnd: dateOnly(current?.planned_end_date),
    actualStart: dateOnly(current?.actual_start_date), actualEnd: dateOnly(current?.actual_end_date),
    due: target.kind === "work" ? localDatetime(target.item?.due_datetime) : "",
    progress: target.kind === "work" ? String(target.item?.progress_percent ?? 0) : "0",
    sortOrder: String(current?.sort_order ?? 0),
    wbs: target.kind === "work" ? target.item?.wbs_code ?? "" : "",
  }));
  const [draft, setDraft] = useState(initial);
  const [clearOverride, setClearOverride] = useState(false);
  const graph = buildProjectWorkTree(items, detail.project.company_project_id);
  const itemId = target.kind === "work" ? target.item?.company_project_work_item_id : undefined;
  const possibleParents = items.filter((item) => {
    const depth = getWorkItemDepthInfo(graph, item.company_project_work_item_id);
    const workDepth = depth.workItemDepth ?? depth.backendDepthLevel;
    return workDepth !== null && workDepth < MAX_PROJECT_WORK_DEPTH &&
      (itemId === undefined || !getWorkItemAncestorPath(graph, item.company_project_work_item_id)
        .some((ancestor) => ancestor.company_project_work_item_id === itemId));
  });
  function field<K extends keyof typeof draft>(key: K, value: typeof draft[K]) {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  function close() { if (!pending && !lock.current) onClose(); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !canManage || uncertain) return;
    setError(null);
    const name = draft.name.trim();
    if (!name || name.length > (target.kind === "phase" ? 150 : 200)) {
      setError(target.kind === "phase" ? "단계명은 1~150자로 입력해 주세요." : "업무명은 1~200자로 입력해 주세요.");
      return;
    }
    if ((draft.plannedStart && draft.plannedEnd && draft.plannedEnd < draft.plannedStart) ||
      (draft.actualStart && draft.actualEnd && draft.actualEnd < draft.actualStart)) {
      setError("종료일은 시작일과 같거나 이후여야 합니다.");
      return;
    }
    if (!Number.isInteger(Number(draft.sortOrder)) || draft.sortOrder.trim() === "") {
      setError("정렬 순서는 정수로 입력해 주세요.");
      return;
    }
    if (target.kind === "work" && !clearOverride && (!/^\d+$/.test(draft.progress) || Number(draft.progress) > 100)) {
      setError("진행률은 0~100 사이의 정수로 입력해 주세요.");
      return;
    }
    lock.current = true;
    const payload: UpdateCompanyProjectWorkItemRequest & UpdateCompanyProjectPhaseRequest = {};
    function changed(key: keyof typeof draft, apiKey: string, value: unknown) {
      if (!editing || draft[key] !== initial[key]) Object.assign(payload, { [apiKey]: value });
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
      changed("phaseId", "company_project_phase_id", draft.phaseId === "none" ? null : Number(draft.phaseId));
      changed("parentId", "parent_work_item_id", draft.parentId === "none" ? null : Number(draft.parentId));
      changed("due", "due_datetime", draft.due ? new Date(draft.due).toISOString() : null);
      changed("wbs", "wbs_code", draft.wbs.trim() || null);
      if (clearOverride && editing) payload.progress_override_percent = null;
      else changed("progress", "progress_percent", Number(draft.progress));
    }
    if (editing && Object.keys(payload).length === 0) {
      lock.current = false;
      onClose();
      return;
    }
    try {
      const companyProjectId = detail.project.company_project_id;
      if (target.kind === "phase") {
        if (target.phase) await updatePhase.mutateAsync({ companyProjectId, phaseId: target.phase.company_project_phase_id, payload });
        else await createPhase.mutateAsync({ companyProjectId, payload: { ...payload, name } });
      } else if (target.item) {
        await updateWork.mutateAsync({ companyProjectId, workItemId: target.item.company_project_work_item_id, payload });
      } else await createWork.mutateAsync({ companyProjectId, payload: { ...payload, title: name } });
      onSaved();
    } catch (caught) {
      const status = getApiErrorDetails(caught)?.status;
      const uncertainCreation = !editing && (!status || status >= 500 || status === 408);
      setUncertain(uncertainCreation);
      setError(uncertainCreation
        ? "서버의 저장 결과를 확인하지 못했습니다. 창을 닫고 목록을 새로고침하여 추가 여부를 확인해 주세요."
        : getErrorMessage(caught, "저장하지 못했습니다. 입력 내용을 확인해 주세요."));
    } finally { lock.current = false; }
  }
  const kindLabel = target.kind === "phase" ? "단계" : "업무";
  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-border bg-background text-foreground sm:max-w-xl"
        onEscapeKeyDown={(event) => { if (pending) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (pending) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{kindLabel} {editing ? "수정" : "추가"}</DialogTitle>
          <DialogDescription>
            {target.kind === "work" ? "업무 상태와 진행률은 각각 저장됩니다. 하위 업무의 단계는 직접 선택할 수 있습니다." : "단계의 상태를 변경해도 소속 업무의 상태는 유지됩니다."}
          </DialogDescription>
        </DialogHeader>
        <form id={id} onSubmit={(event) => void submit(event)} className="space-y-4">
          <fieldset disabled={pending || uncertain || !canManage} className="space-y-4">
            <label className="block space-y-1"><span className="text-sm">{kindLabel}명</span>
              <Input aria-label={`${kindLabel}명`} required maxLength={target.kind === "phase" ? 150 : 200}
                value={draft.name} onChange={(event) => field("name", event.target.value)} autoFocus />
            </label>
            <label className="block space-y-1"><span className="text-sm">설명</span>
              <Textarea aria-label={`${kindLabel} 설명`} maxLength={5000} value={draft.description}
                onChange={(event) => field("description", event.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1"><span className="text-sm">상태</span>
                <select aria-label={`${kindLabel} 상태 선택`} className={fieldClass} value={draft.status} onChange={(event) => field("status", event.target.value)}>
                  {WORK_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              {target.kind === "work" && <label className="space-y-1"><span className="text-sm">우선순위</span>
                <select aria-label="업무 우선순위 선택" className={fieldClass} value={draft.priority} onChange={(event) => field("priority", event.target.value)}>
                  {WORK_PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>}
            </div>
            {target.kind === "work" && <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1"><span className="text-sm">상위 업무</span>
                <select aria-label="상위 업무 선택" className={fieldClass} value={draft.parentId} onChange={(event) => field("parentId", event.target.value)}>
                  <option value="none">최상위 업무</option>
                  {!possibleParents.some((item) => String(item.company_project_work_item_id) === draft.parentId) && draft.parentId !== "none" &&
                    <option value={draft.parentId}>현재 상위 업무 {draft.parentId}</option>}
                  {possibleParents.map((item) => <option key={item.company_project_work_item_id} value={item.company_project_work_item_id}>{item.title}</option>)}
                </select>
              </label>
              {detail.project.phase_mode === "phased" && <label className="space-y-1"><span className="text-sm">단계</span>
                <select aria-label="업무 단계 선택" className={fieldClass} value={draft.phaseId} onChange={(event) => field("phaseId", event.target.value)}>
                  <option value="none">단계 미지정</option>
                  {detail.phases.map((phase) => <option key={phase.company_project_phase_id} value={phase.company_project_phase_id}>{phase.name}</option>)}
                </select>
              </label>}
            </div>}
            <div className="grid grid-cols-2 gap-3">
              {([ ["plannedStart", "계획 시작일"], ["plannedEnd", "계획 종료일"], ["actualStart", "실적 시작일"], ["actualEnd", "실적 종료일"] ] as const)
                .map(([key, label]) => <label key={key} className="space-y-1"><span className="text-sm">{label}</span>
                  <Input type="date" aria-label={`${kindLabel} ${label}`} value={draft[key]} onChange={(event) => field(key, event.target.value)} />
                </label>)}
            </div>
            {target.kind === "work" && <>
              <label className="block space-y-1"><span className="text-sm">마감 일시</span>
                <Input type="datetime-local" aria-label="업무 마감 일시" value={draft.due} onChange={(event) => field("due", event.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1"><span className="text-sm">진행률 (%)</span>
                  <Input type="number" min={0} max={100} step={1} aria-label="업무 진행률" disabled={clearOverride}
                    value={draft.progress} onChange={(event) => field("progress", event.target.value)} />
                </label>
                <label className="space-y-1"><span className="text-sm">WBS 코드</span>
                  <Input aria-label="업무 WBS 코드" maxLength={100} value={draft.wbs} onChange={(event) => field("wbs", event.target.value)} />
                </label>
              </div>
              {editing && <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={clearOverride} onChange={(event) => setClearOverride(event.target.checked)} />
                수동 진행률 해제
              </label>}
              <p className="text-xs text-muted-foreground">진행률을 변경하면 수동 설정으로 저장됩니다. 수동 설정을 해제하면 담당자 배정을 기준으로 다시 계산하며, 배정이 없으면 기존 진행률이 유지됩니다.</p>
            </>}
            <label className="block space-y-1"><span className="text-sm">정렬 순서</span>
              <Input type="number" step={1} aria-label={`${kindLabel} 정렬 순서`} value={draft.sortOrder} onChange={(event) => field("sortOrder", event.target.value)} />
            </label>
          </fieldset>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>닫기</Button>
          <Button type="submit" form={id} disabled={pending || uncertain || !canManage}>{pending ? "저장 중..." : "저장"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
