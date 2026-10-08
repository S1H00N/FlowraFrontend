import { useRef, useState } from "react";
import {
  createRescheduleDraft,
  getRescheduleStart,
  hasOpenRescheduleControl,
  isRescheduleDraftValid,
  isRescheduleStartPast,
  RescheduleFields,
  RescheduleRecoveryNotice,
  RescheduleTaskSummary,
} from "@/components/home/RescheduleFields";
import { Button } from "@/components/ui/button";
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
import type { Schedule, Task } from "@/types";

export default function RescheduleModal({
  task,
  today,
  timezone,
  pending,
  existing,
  onSave,
  onClose,
  onRestoreFocus,
}: {
  task: Task;
  today: string;
  timezone: string;
  pending: boolean;
  existing?: Schedule;
  onSave: (start: Date, duration: number) => Promise<void>;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  const [draft, setDraft] = useState(() =>
    createRescheduleDraft(today, existing),
  );
  const [error, setError] = useState<string | null>(null);
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const submitting = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const start = getRescheduleStart(draft);
  const valid = isRescheduleDraftValid(draft, today);

  async function submit() {
    if (submitting.current || pending || (!existing && !valid)) return;
    if (!existing && isRescheduleStartPast(start)) {
      setError("현재 시각 이후의 시작 시간을 선택해 주세요.");
      return;
    }
    submitting.current = true;
    setError(null);
    try {
      await onSave(start, draft.duration);
    } catch (err) {
      setError(
        getErrorMessage(err, "일정을 저장하지 못했어요. 다시 시도해 주세요."),
      );
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending && !submitting.current) onClose();
      }}
    >
      <DialogContent
        className="left-4 right-4 top-[8dvh] mx-auto flex max-h-[84dvh] w-auto max-w-[560px] translate-x-0 translate-y-0 flex-col gap-0 rounded-2xl p-0"
        style={{ transform: "none", translate: "none" }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (
            pending ||
            submitting.current ||
            hasOpenRescheduleControl(titleRef.current)
          )
            event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <FloatingPanelPortalProvider value={portal}>
          <DialogHeader className="shrink-0 space-y-2 px-5 pb-5 pt-6 text-left sm:px-6">
            <DialogTitle
              ref={titleRef}
              tabIndex={-1}
              className="pr-8 outline-none"
            >
              작업 재계획
            </DialogTitle>
            <DialogDescription className="text-slate-500">
              밀린 작업을 다시 일정에 배치해요.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 pb-5 sm:px-6">
            <RescheduleTaskSummary
              task={task}
              today={today}
              timezone={timezone}
            />
            {existing ? <RescheduleRecoveryNotice existing={existing} /> : null}
            <RescheduleFields
              value={draft}
              onChange={(next) => {
                setDraft(next);
                setError(null);
              }}
              today={today}
              disabled={pending || !!existing}
            />
            {error && (
              <p role="alert" className="text-sm text-rose-600">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-slate-100 px-5 py-4 sm:px-6 sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={pending}
              onClick={onClose}
            >
              취소
            </Button>
            <Button
              type="button"
              className="h-10"
              disabled={pending || (!existing && !valid)}
              onClick={() => void submit()}
            >
              {pending
                ? "저장 중..."
                : existing
                  ? "연결 다시 시도"
                  : "재계획하기"}
            </Button>
          </DialogFooter>
          <div ref={setPortal} />
        </FloatingPanelPortalProvider>
      </DialogContent>
    </Dialog>
  );
}
