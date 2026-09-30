import { Check, RotateCcw, Trash2, X } from "lucide-react";

export default function SelectionActionBar({
  count,
  busy,
  canComplete,
  onSelectAll,
  onComplete,
  onDelete,
  onClose,
}: {
  count: number;
  busy: boolean;
  canComplete: boolean;
  onSelectAll: () => void;
  onComplete: (completed: boolean) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="선택한 항목 작업"
      aria-busy={busy}
      className="tasks-selection-actions"
    >
      <div className="tasks-selection-actions__summary">
        <span role="status" className="tasks-selection-actions__count">
          {count}개 선택됨
        </span>
        <p className="tasks-selection-actions__hint">
          전체 선택은 현재 펼쳐진 목록에 적용됩니다. 일정과 할 일은 각각
          선택됩니다.
          {!canComplete && " 회사 일정은 완료 상태를 변경할 수 없습니다."}
        </p>
      </div>
      <div className="tasks-selection-actions__controls">
        <button
          type="button"
          disabled={busy}
          onClick={onSelectAll}
          title="현재 펼쳐진 목록의 항목 전체 선택"
        >
          전체 선택
        </button>
        <button
          type="button"
          disabled={busy || !canComplete}
          onClick={() => onComplete(true)}
        >
          <Check aria-hidden="true" className="size-4" />
          완료 처리
        </button>
        <button
          type="button"
          disabled={busy || !canComplete}
          onClick={() => onComplete(false)}
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          완료 해제
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className="tasks-delete-selection"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          삭제
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="tasks-selection-actions__close"
          aria-label="선택 해제"
          title="선택 해제 (Esc)"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
}
