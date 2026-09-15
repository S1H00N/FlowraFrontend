import { useId, useState } from "react";
import { Check, ChevronDown, Clock3, Loader2 } from "lucide-react";
import { useUpdateCompanyProjectWorkAssignment } from "@/hooks/useCompanyProjects";
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
      </div>
    </div>
  );
}

function ProjectWorkItemRow({
  item,
  showProject = false,
}: {
  item: HomeProjectWorkItem;
  showProject?: boolean;
}) {
  const update = useUpdateCompanyProjectWorkAssignment();
  const completed = item.status === "done";
  const dueDate = item.due_datetime ? new Date(item.due_datetime) : null;
  const hasDueDate = dueDate && !Number.isNaN(dueDate.getTime());

  return (
    <li className="flex items-center gap-2 px-3 py-2 sm:gap-4 sm:px-5">
      <div className="min-w-0 flex-1 py-1">
        {showProject && (
          <p className="mb-1 break-words text-xs text-slate-500">
            {item.project_name}
          </p>
        )}
        <p
          className={`break-words text-sm font-medium ${completed ? "text-slate-400 line-through" : "text-slate-800"}`}
        >
          {item.title}
        </p>
        {hasDueDate && (
          <p className="mt-1 text-xs tabular-nums text-slate-500">
            <time
              dateTime={item.due_datetime!}
              title={dueDate.toLocaleString("ko-KR")}
            >
              {dueDate.toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "numeric",
                day: "numeric",
              })}{" "}
              마감
            </time>
          </p>
        )}
      </div>
      <button
        type="button"
        aria-label={`${item.title} ${completed ? "완료 취소" : "완료"}`}
        aria-pressed={completed}
        disabled={update.isPending}
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-violet-600 transition-colors hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
        onClick={() =>
          update.mutate({
            assignmentId: item.assignment_id,
            payload: completed
              ? { status: "todo", progress_percent: 0, completed_at: null }
              : {
                  status: "done",
                  progress_percent: 100,
                  completed_at: toOffsetISOString(new Date()),
                },
          })
        }
      >
        {update.isPending ? (
          <Loader2 aria-hidden="true" className="size-5 animate-spin" />
        ) : (
          <span
            className={`flex size-5 items-center justify-center rounded-full border ${completed ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300"}`}
          >
            {completed && <Check aria-hidden="true" className="size-3.5" />}
          </span>
        )}
      </button>
    </li>
  );
}

function ProjectWorkGroup({
  name,
  items,
  initiallyOpen,
}: {
  name: string;
  items: HomeProjectWorkItem[];
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [showAll, setShowAll] = useState(false);
  const listId = useId();
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <h3 id={headingId}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            setOpen(!open);
            setShowAll(false);
          }}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
        >
          <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-700">
            {name}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-slate-500">
            {items.length}건
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h3>
      <div id={listId} hidden={!open}>
        {open && (
          <>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {(showAll ? items : items.slice(0, 5)).map((item) => (
                <ProjectWorkItemRow key={item.assignment_id} item={item} />
              ))}
            </ul>
            {items.length > 5 && (
              <button
                type="button"
                aria-expanded={showAll}
                onClick={() => setShowAll(!showAll)}
                className="min-h-11 w-full border-t border-slate-100 px-4 py-3 text-sm font-medium text-violet-600 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500"
              >
                {showAll ? "간략히 보기" : `전체 ${items.length}건 보기`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default function ProjectWorkItems({
  items,
  title = "프로젝트 업무",
  overdue = false,
}: {
  items: HomeProjectWorkItem[];
  title?: string;
  overdue?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const headingId = useId();
  if (items.length === 0) return null;

  if (overdue) {
    const groups = new Map<
      string,
      { name: string; items: HomeProjectWorkItem[] }
    >();
    for (const item of items) {
      const projectId = item.company_project_id ?? item.project_id;
      const key =
        projectId != null
          ? `id:${projectId}`
          : item.company_project_public_uid
            ? `uid:${item.company_project_public_uid}`
            : `name:${item.project_name}`;
      const group = groups.get(key) ?? { name: item.project_name, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    return (
      <section
        aria-labelledby={headingId}
        className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        <h2 id={headingId}>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 sm:px-5"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Clock3 aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-800">
                {title}{" "}
                <span className="ml-1 text-amber-700">{items.length}건</span>
              </span>
              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                프로젝트 {groups.size}개
              </span>
            </span>
            <span className="shrink-0 text-xs font-medium text-slate-500">
              {expanded ? "접기" : "확인하기"}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`size-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        </h2>
        <div id={contentId} hidden={!expanded}>
          {expanded && (
            <div className="space-y-2 border-t border-slate-100 bg-slate-50/60 p-3 sm:p-4">
              {Array.from(groups, ([key, group], index) => (
                <ProjectWorkGroup
                  key={key}
                  name={group.name}
                  items={group.items}
                  initiallyOpen={index === 0}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="mb-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-base font-semibold text-slate-800">
          {title}{" "}
          <span className="ml-1 text-sm font-normal text-slate-400">
            {items.length}건
          </span>
        </h2>
        {items.length > 3 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setExpanded(!expanded)}
            className="min-h-11 shrink-0 rounded-lg px-2 text-xs font-medium text-violet-600 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          >
            {expanded ? "접기" : "전체 보기"}
          </button>
        )}
      </div>
      <ul
        id={contentId}
        className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        {(expanded ? items : items.slice(0, 3)).map((item) => (
          <ProjectWorkItemRow
            key={item.assignment_id}
            item={item}
            showProject
          />
        ))}
      </ul>
    </section>
  );
}
