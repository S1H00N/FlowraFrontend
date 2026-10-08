import { useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FloatingPanelPortalProvider } from "@/components/ui/FloatingPanelPortal";
import { getErrorMessage } from "@/lib/error";
import { taskDueLabel } from "@/lib/homeTasks";
import type { Schedule, Task } from "@/types";
import {
  createRescheduleDraft,
  getRescheduleStart,
  hasOpenRescheduleControl,
  isRescheduleDraftValid,
  isRescheduleStartPast,
  rescheduleDraftSummary,
  RescheduleFields,
  RescheduleRecoveryNotice,
  type RescheduleDraft,
} from "./RescheduleFields";

export default function BulkRescheduleModal({
  tasks,
  today,
  timezone,
  pending,
  unlinked,
  onClose,
  onSave,
  onRestoreFocus,
}: {
  tasks: Task[];
  today: string;
  timezone: string;
  pending: boolean;
  unlinked: Readonly<Record<number, Schedule>>;
  onClose: () => void;
  onSave: (
    task: Task,
    start: Date,
    duration: number,
  ) => Promise<Schedule | null>;
  onRestoreFocus: () => void;
}) {
  // A save can refresh the home list before the batch finishes. Keep this
  // dialog's rows and drafts stable while the hook rechecks each task at save.
  const [tasksAtOpen] = useState(tasks);
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(tasks.map((task) => task.task_id)),
  );
  const [drafts, setDrafts] = useState<Record<number, RescheduleDraft>>(() =>
    Object.fromEntries(
      tasks.map((task) => [
        task.task_id,
        createRescheduleDraft(today, unlinked[task.task_id]),
      ]),
    ),
  );
  const [quickDraft, setQuickDraft] = useState(() =>
    createRescheduleDraft(today),
  );
  const [appliedCount, setAppliedCount] = useState(0);
  const [expandedTasks, setExpandedTasks] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [saved, setSaved] = useState<ReadonlySet<number>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{
    taskId: number;
    message: string;
  } | null>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const submitting = useRef(false);
  const savedIds = useRef(new Set<number>());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selectionId = useId();
  const quickSettingsId = useId();
  const taskSettingsId = useId();
  const selection = tasksAtOpen.filter((task) => selected.has(task.task_id));
  const editableSelection = selection.filter(
    (task) => !saved.has(task.task_id) && !unlinked[task.task_id],
  );
  const busy = pending || saving;
  const quickDisabled = busy || editableSelection.length === 0;
  const quickValid = isRescheduleDraftValid(quickDraft, today);
  const valid =
    selection.length > 0 &&
    selection.every(
      (task) =>
        saved.has(task.task_id) ||
        !!unlinked[task.task_id] ||
        isRescheduleDraftValid(drafts[task.task_id], today),
    );

  function close() {
    if (!submitting.current && !busy) onClose();
  }

  function moveTo(nextStep: 1 | 2) {
    setStep(nextStep);
    requestAnimationFrame(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = 0;
      titleRef.current?.focus();
    });
  }

  function showError(taskId: number, message: string) {
    setExpandedTasks((current) => new Set(current).add(taskId));
    setError({ taskId, message });
    requestAnimationFrame(() => {
      errorRef.current?.scrollIntoView({ block: "nearest" });
      errorRef.current?.focus({ preventScroll: true });
    });
  }

  function applyQuickSettings() {
    if (submitting.current || quickDisabled || !quickValid) return;
    setDrafts((current) => {
      const next = { ...current };
      for (const task of editableSelection) {
        next[task.task_id] = { ...quickDraft };
      }
      return next;
    });
    setAppliedCount(editableSelection.length);
    if (
      error &&
      editableSelection.some((task) => task.task_id === error.taskId)
    )
      setError(null);
  }

  async function submit() {
    if (submitting.current || busy || !valid) return;
    // Validate the entire batch before writing any rows. Time may have passed
    // since the controls were rendered; recovery only retries an existing link.
    const expired = selection.find(
      (task) =>
        !savedIds.current.has(task.task_id) &&
        !unlinked[task.task_id] &&
        isRescheduleStartPast(getRescheduleStart(drafts[task.task_id])),
    );
    if (expired) {
      showError(expired.task_id, "현재 이후의 시작 시간을 선택해 주세요.");
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      for (const task of selection) {
        if (savedIds.current.has(task.task_id)) continue;
        const existing = unlinked[task.task_id];
        const draft = existing
          ? createRescheduleDraft(today, existing)
          : drafts[task.task_id];
        try {
          const start = getRescheduleStart(draft);
          // The batch was validated at submission. Crossing a minute while
          // earlier rows save must not invalidate the remaining current-time plans.
          const schedule = await onSave(task, start, draft.duration);
          if (!schedule)
            throw new Error("저장을 완료하지 못했어요. 다시 시도해 주세요.");
          savedIds.current.add(task.task_id);
          setSaved(new Set(savedIds.current));
        } catch (cause) {
          showError(
            task.task_id,
            getErrorMessage(cause, "재계획하지 못했어요. 다시 시도해 주세요."),
          );
          return;
        }
      }
      onClose();
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className={`left-4 right-4 top-[8dvh] mx-auto flex max-h-[84dvh] w-auto max-w-[560px] translate-x-0 translate-y-0 flex-col gap-0 rounded-2xl p-0 ${busy ? "[&>button]:pointer-events-none [&>button]:opacity-40" : ""}`}
        style={{ transform: "none", translate: "none" }}
        aria-busy={busy}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (
            submitting.current ||
            busy ||
            hasOpenRescheduleControl(titleRef.current)
          )
            event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (submitting.current || busy) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <FloatingPanelPortalProvider value={portal}>
          <DialogHeader
            className="shrink-0 space-y-2 px-5 pb-5 pt-6 text-left sm:px-6"
            data-testid="bulk-reschedule-header"
          >
            <DialogTitle
              ref={titleRef}
              tabIndex={-1}
              className="pr-8 outline-none"
            >
              밀린 작업 재계획
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              {step === 1
                ? "일정에 배치할 작업을 선택해 주세요."
                : "빠른 설정을 적용하거나 작업별로 일정을 정해 주세요."}
            </DialogDescription>
          </DialogHeader>
          <ol
            aria-label="재계획 단계"
            className="grid shrink-0 grid-cols-2 gap-2 px-5 pb-4 text-sm sm:px-6"
          >
            {[
              { value: 1, label: "작업 선택" },
              { value: 2, label: "일정 설정" },
            ].map(({ value, label }) => (
              <li
                key={value}
                aria-current={step === value ? "step" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 ${step === value ? "bg-violet-50 font-medium text-violet-700" : "text-slate-500"}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${step === value ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500"}`}
                >
                  {value}
                </span>
                {label}
              </li>
            ))}
          </ol>
          <div
            ref={bodyRef}
            data-testid="bulk-reschedule-body"
            className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6"
          >
            {step === 1 ? (
              <div className="space-y-2">
                {tasksAtOpen.map((task) => {
                  const checked = selected.has(task.task_id);
                  const checkboxId = `${selectionId}-${task.task_id}`;
                  const recovering = !!unlinked[task.task_id];
                  return (
                    <label
                      key={task.task_id}
                      htmlFor={checkboxId}
                      className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-violet-200 bg-violet-50/60" : "border-slate-200 hover:bg-slate-50"} ${busy ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <Checkbox
                        id={checkboxId}
                        aria-label={`${task.title} 선택`}
                        checked={checked}
                        disabled={busy}
                        onCheckedChange={(checked) => {
                          setAppliedCount(0);
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked === true) next.add(task.task_id);
                            else next.delete(task.task_id);
                            return next;
                          });
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium text-slate-800">
                          {task.title}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {taskDueLabel(task, today, timezone)}
                        </span>
                        {recovering && (
                          <span className="mt-1 block text-xs text-amber-700">
                            생성한 일정에 연결이 필요해요.
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-5">
                <section
                  aria-labelledby={quickSettingsId}
                  className="space-y-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4"
                >
                  <div className="space-y-1">
                    <h3
                      id={quickSettingsId}
                      className="text-sm font-semibold text-slate-800"
                    >
                      빠른 설정
                    </h3>
                    <p className="text-xs leading-5 text-slate-500">
                      선택한 작업에 공통 설정을 적용할 수 있어요.
                    </p>
                  </div>
                  <RescheduleFields
                    value={quickDraft}
                    onChange={(value) => {
                      setQuickDraft(value);
                      setAppliedCount(0);
                    }}
                    today={today}
                    disabled={quickDisabled}
                    variant="quick"
                  />
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    <p
                      role="status"
                      className="mr-auto text-xs leading-5 text-violet-700"
                    >
                      {appliedCount > 0
                        ? `${appliedCount}개 작업에 적용했어요. 작업별로 수정할 수 있어요.`
                        : ""}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 border-violet-200 bg-white text-violet-700 hover:bg-violet-50 hover:text-violet-700"
                      disabled={quickDisabled || !quickValid}
                      onClick={applyQuickSettings}
                    >
                      전체 적용
                    </Button>
                  </div>
                </section>
                <div className="space-y-2">
                  {selection.map((task) => {
                    const existing = unlinked[task.task_id];
                    const complete = saved.has(task.task_id);
                    const expanded =
                      !complete && expandedTasks.has(task.task_id);
                    const fieldsId = `${taskSettingsId}-${task.task_id}`;
                    const draft = existing
                      ? createRescheduleDraft(today, existing)
                      : drafts[task.task_id];
                    return (
                      <fieldset
                        key={task.task_id}
                        aria-label={task.title}
                        className="min-w-0 overflow-hidden rounded-xl border border-slate-200"
                      >
                        <button
                          type="button"
                          aria-label={`${task.title} 일정 설정`}
                          aria-expanded={expanded}
                          aria-controls={fieldsId}
                          disabled={busy || complete}
                          className="flex w-full items-center gap-3 bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400 disabled:cursor-default disabled:hover:bg-slate-50"
                          onClick={() => {
                            setExpandedTasks((current) => {
                              const next = new Set(current);
                              if (next.has(task.task_id))
                                next.delete(task.task_id);
                              else next.add(task.task_id);
                              return next;
                            });
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block break-words text-sm font-semibold leading-5 text-slate-800">
                              {task.title}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500">
                              {taskDueLabel(task, today, timezone)}
                            </span>
                            {complete ? (
                              <span
                                role="status"
                                className="mt-1 flex items-center gap-1.5 text-xs text-violet-700"
                              >
                                <Check
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                재계획 완료
                              </span>
                            ) : (
                              <span className="mt-1 block text-xs leading-5 text-violet-700">
                                {rescheduleDraftSummary(draft, today)}
                                {existing ? " · 연결 확인 필요" : ""}
                              </span>
                            )}
                          </span>
                          {!complete && (
                            <ChevronDown
                              aria-hidden="true"
                              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          )}
                        </button>
                        <div id={fieldsId} hidden={!expanded}>
                          {!complete && (
                            <div className="space-y-4 border-t border-slate-100 p-4">
                              {existing && (
                                <RescheduleRecoveryNotice existing={existing} />
                              )}
                              <RescheduleFields
                                value={draft}
                                today={today}
                                disabled={busy || !!existing}
                                onChange={(value) => {
                                  setDrafts((current) => ({
                                    ...current,
                                    [task.task_id]: value,
                                  }));
                                  if (error?.taskId === task.task_id)
                                    setError(null);
                                }}
                              />
                              {error?.taskId === task.task_id && (
                                <p
                                  ref={errorRef}
                                  role="alert"
                                  tabIndex={-1}
                                  className="text-sm text-rose-600 outline-none"
                                >
                                  {task.title}: {error.message}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <DialogFooter
            className="shrink-0 flex-row flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4 sm:space-x-0 sm:px-6"
            data-testid="bulk-reschedule-footer"
          >
            {error && saved.size > 0 && (
              <p className="w-full text-xs leading-5 text-slate-500">
                완료된 작업은 유지돼요. 남은 작업을 다시 시도해 주세요.
              </p>
            )}
            <p className="mr-auto text-sm text-slate-500" aria-live="polite">
              {step === 1
                ? `${selection.length}개 선택`
                : saved.size
                  ? `${saved.size} / ${selection.length}개 완료`
                  : `${selection.length}개 작업`}
            </p>
            <div className="flex gap-2">
              {step === 1 ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={busy}
                    onClick={close}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    className="h-10"
                    disabled={busy || !selection.length}
                    onClick={() => moveTo(2)}
                  >
                    다음 <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={busy || saved.size > 0}
                    onClick={() => moveTo(1)}
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 이전
                  </Button>
                  <Button
                    type="button"
                    className="h-10"
                    disabled={busy || !valid}
                    onClick={() => void submit()}
                  >
                    {busy ? "재계획 중…" : "재계획하기"}
                  </Button>
                </>
              )}
            </div>
          </DialogFooter>
          <div ref={setPortal} />
        </FloatingPanelPortalProvider>
      </DialogContent>
    </Dialog>
  );
}
