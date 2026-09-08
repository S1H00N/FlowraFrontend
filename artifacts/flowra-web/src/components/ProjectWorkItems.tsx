import { useState } from "react";
import { useUpdateCompanyProjectWorkAssignment } from "@/hooks/useCompanyProjects";
import ReminderControl from "@/components/ReminderControl";
import {
  TASK_STATUS_LABELS,
  type HomeProjectWorkItem,
  type TaskStatus,
} from "@/types";
import { toOffsetISOString } from "@/utils/dateUtils";

export function ProjectWorkItemCard({
  item,
  onCompletionChange,
}: {
  item: HomeProjectWorkItem;
  onCompletionChange?: () => void;
}) {
  const update = useUpdateCompanyProjectWorkAssignment();
  const [progress, setProgress] = useState(String(item.progress_percent ?? 0));
  const completed = item.status === "done";
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-violet-600">{item.project_name}</p>
      <h3 className="font-semibold text-slate-900">{item.title}</h3>
      {item.description && (
        <p className="whitespace-pre-wrap text-sm text-slate-600">
          {item.description}
        </p>
      )}
      <p className="text-xs text-slate-500">
        {item.status &&
          (TASK_STATUS_LABELS[item.status as TaskStatus] ?? item.status)}
        {` · ${item.progress_percent ?? 0}%`}
        {item.due_datetime &&
          ` · 마감 ${new Date(item.due_datetime).toLocaleString("ko-KR")}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={update.isPending}
          className="rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-700 disabled:opacity-50"
          onClick={() =>
            update.mutate(
              {
                assignmentId: item.assignment_id,
                payload: completed
                  ? { status: "todo", progress_percent: 0, completed_at: null }
                  : {
                      status: "done",
                      progress_percent: 100,
                      completed_at: toOffsetISOString(new Date()),
                    },
              },
              { onSuccess: onCompletionChange },
            )
          }
        >
          {completed ? "완료 취소" : "완료"}
        </button>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({
              assignmentId: item.assignment_id,
              payload: { progress_percent: Number(progress) },
            });
          }}
        >
          <label className="text-sm">
            진행률{" "}
            <input
              aria-label={`${item.title} 진행률`}
              type="number"
              min={0}
              max={100}
              required
              value={progress}
              onChange={(event) => setProgress(event.target.value)}
              className="w-16 rounded border p-1"
            />
            %
          </label>
          <button
            disabled={update.isPending}
            className="text-sm text-violet-700"
          >
            저장
          </button>
        </form>
        <ReminderControl
          targetType="project_work_assignment"
          targetId={item.assignment_id}
        />
      </div>
    </div>
  );
}

export default function ProjectWorkItems({
  items,
  title = "프로젝트 업무",
}: {
  items: HomeProjectWorkItem[];
  title?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-5 space-y-3">
      <h2 className="text-base font-semibold">
        {title} <span className="text-slate-400">{items.length}</span>
      </h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <ProjectWorkItemCard
            key={`${item.assignment_id}:${item.progress_percent}:${item.status}`}
            item={item}
          />
        ))}
      </div>
    </section>
  );
}
