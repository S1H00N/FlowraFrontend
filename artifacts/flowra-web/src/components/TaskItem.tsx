import { useState } from "react";
import {
  useCompleteTask,
  useDeleteTask,
  useUpdateTask,
} from "@/hooks/useTasks";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/types";
import { getErrorMessage } from "@/lib/error";

const priorityBadge: Record<TaskPriority, string> = {
  urgent: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

const statusBadge: Record<TaskStatus, string> = {
  todo: "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-indigo-100 text-indigo-700 border-indigo-200",
  done: "bg-green-100 text-green-700 border-green-200",
  postponed: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function TaskItem({ task }: { task: Task }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const completeMutation = useCompleteTask();

  const isDone = task.status === "done";

  const handleSave = async () => {
    setError(null);
    try {
      await updateMutation.mutateAsync({
        taskId: task.task_id,
        payload: { title: title.trim(), priority, status },
      });
      setIsEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, "수정에 실패했습니다."));
    }
  };

  const handleCancel = () => {
    setTitle(task.title);
    setPriority(task.priority);
    setStatus(task.status);
    setIsEditing(false);
    setError(null);
  };

  const handleDelete = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    setError(null);
    try {
      await deleteMutation.mutateAsync(task.task_id);
    } catch (err) {
      setError(getErrorMessage(err, "삭제에 실패했습니다."));
    }
  };

  const handleComplete = async () => {
    setError(null);
    try {
      await completeMutation.mutateAsync(task.task_id);
    } catch (err) {
      setError(getErrorMessage(err, "완료 처리에 실패했습니다."));
    }
  };

  if (isEditing) {
    return (
      <li className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            저장
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </li>
    );
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleComplete}
          disabled={isDone || completeMutation.isPending}
          aria-label="완료"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
            isDone
              ? "border-green-500 bg-green-500 text-white"
              : "border-slate-300 bg-white hover:border-slate-500"
          }`}
        >
          {isDone ? "✓" : null}
        </button>

        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-sm font-medium ${
              isDone ? "text-slate-400 line-through" : "text-slate-900"
            }`}
          >
            {task.title}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${priorityBadge[task.priority]}`}
            >
              {TASK_PRIORITY_LABELS[task.priority]}
            </span>
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${statusBadge[task.status]}`}
            >
              {TASK_STATUS_LABELS[task.status]}
            </span>
            {task.due_datetime && (
              <span className="text-[11px] text-slate-500">
                마감 {new Date(task.due_datetime).toLocaleString("ko-KR")}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            수정
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            삭제
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </li>
  );
}
