import {
  SCHEDULE_TYPE_LABELS,
  TASK_PRIORITY_LABELS,
  type AiParseResult,
  type AiSuggestedAction,
  type CategoryType,
  type TaskPriority,
} from "@/types";

export type AiSuggestedActionPriorityTone = "high" | "medium" | "low";

export function formatAiSuggestedActionDateTime(
  value?: string | null,
): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getSuggestedActions(
  result: AiParseResult,
): AiSuggestedAction[] {
  if (result.suggested_actions?.length) return result.suggested_actions;

  const actions: AiSuggestedAction[] = [];
  if (result.suggested_schedule) {
    actions.push({
      type: "create_schedule",
      ...result.suggested_schedule,
    });
  }
  if (result.suggested_task) {
    actions.push({
      type: "create_task",
      ...result.suggested_task,
    });
  }
  return actions;
}

export function getAiSuggestedActionCategoryType(
  action: AiSuggestedAction,
): CategoryType | null {
  if (action.type === "create_schedule") return "schedule";
  if (action.type === "create_task") return "task";
  return null;
}

export function getAiSuggestedActionLabel(action: AiSuggestedAction) {
  if (action.type === "create_schedule") return "일정";
  if (action.type === "create_task") return "할 일";
  return "확인 필요";
}

export function getAiSuggestedActionTitle(action: AiSuggestedAction) {
  if (action.title?.trim()) return action.title.trim();
  if (action.type === "create_schedule") return "새 일정";
  if (action.type === "create_task") return "새 할 일";
  return "확인 필요 항목";
}

export function getAiSuggestedActionDateLabel(action: AiSuggestedAction) {
  return (
    formatAiSuggestedActionDateTime(
      action.start_datetime ?? action.due_datetime,
    ) ?? ""
  );
}

export function getAiSuggestedActionPriorityTone(
  action: AiSuggestedAction,
): AiSuggestedActionPriorityTone {
  const priority = String(action.priority ?? "").toLowerCase();
  if (priority.includes("high") || priority.includes("urgent")) return "high";
  if (priority.includes("medium")) return "medium";
  return "low";
}

export function getAiSuggestedActionSummaryMeta(action: AiSuggestedAction) {
  return [
    action.start_datetime
      ? formatAiSuggestedActionDateTime(action.start_datetime)
      : null,
    action.end_datetime
      ? `종료 ${formatAiSuggestedActionDateTime(action.end_datetime)}`
      : null,
    action.due_datetime
      ? `마감 ${formatAiSuggestedActionDateTime(action.due_datetime)}`
      : null,
    action.location,
    action.related_schedule_title
      ? `연결 일정 ${action.related_schedule_title}`
      : null,
  ].filter((item): item is string => Boolean(item));
}

export function getAiSuggestedActionChatMeta(action: AiSuggestedAction) {
  const meta: string[] = [];

  if (action.type === "create_schedule") {
    const start = formatAiSuggestedActionDateTime(action.start_datetime);
    const end = formatAiSuggestedActionDateTime(action.end_datetime);
    if (start) meta.push(end ? `${start} - ${end}` : start);
    if (action.all_day) meta.push("하루 종일");
    if (action.schedule_type && action.schedule_type in SCHEDULE_TYPE_LABELS) {
      meta.push(SCHEDULE_TYPE_LABELS[action.schedule_type]);
    }
  } else if (action.type === "create_task") {
    const due = formatAiSuggestedActionDateTime(action.due_datetime);
    if (due) meta.push(`마감 ${due}`);
    if (action.priority && action.priority in TASK_PRIORITY_LABELS) {
      meta.push(TASK_PRIORITY_LABELS[action.priority as TaskPriority]);
    }
  }

  if (action.location) meta.push(action.location);
  if (action.related_schedule_title) {
    meta.push(`연결 일정 ${action.related_schedule_title}`);
  }
  if (action.recurrence?.repeat_interval_days) {
    meta.push(`${action.recurrence.repeat_interval_days}일마다 반복`);
  }
  if (action.reminders?.length) {
    meta.push(`알림 ${action.reminders.length}개`);
  }

  return meta;
}

export function getAiSuggestedActionReviewMeta(
  action: AiSuggestedAction,
  options: { includeRelatedActionIndex?: boolean } = {},
) {
  return [
    action.needs_review ? "확인 필요" : null,
    action.date_uncertain ? "날짜 확인" : null,
    action.time_uncertain ? "시간 확인" : null,
    action.auto_filled ? "AI 보정" : null,
    options.includeRelatedActionIndex &&
    typeof action.related_action_index === "number"
      ? `연결 액션 #${action.related_action_index + 1}`
      : null,
    action.confidence ? `확신도 ${action.confidence}` : null,
  ].filter((item): item is string => Boolean(item));
}
