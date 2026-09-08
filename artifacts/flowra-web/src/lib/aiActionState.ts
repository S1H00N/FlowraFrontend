import type { AiActionApplyState, AiSuggestedAction } from "@/types";

type ActionResult = AiActionApplyState & {
  status?: string | null;
  result_status?: string | null;
  action_status?: string | null;
  applied_actions?: Array<{ action_index?: number }>;
};

export function isAiActionApplied(
  result: ActionResult,
  index: number,
): boolean {
  const state = result.action_states?.find(
    (action) => action.action_index === index,
  );
  if (typeof state?.applied === "boolean") return state.applied;
  if (result.remaining_action_indexes?.includes(index)) return false;
  if (Array.isArray(result.applied_action_indexes))
    return result.applied_action_indexes.includes(index);
  if (result.applied_actions?.some((action) => action.action_index === index))
    return true;
  const status = result.result_status ?? result.action_status ?? result.status;
  return status === "approved" || status === "applied";
}

export function canApplyAiAction(
  result: ActionResult,
  action: AiSuggestedAction,
  index: number,
): boolean {
  if (action.type !== "create_schedule" && action.type !== "create_task")
    return false;
  if ((result.result_status ?? result.status) === "rejected") return false;
  if (isAiActionApplied(result, index)) return false;
  const state = result.action_states?.find(
    (entry) => entry.action_index === index,
  );
  if (state?.applicable === false) return false;
  if (Array.isArray(result.remaining_action_indexes))
    return result.remaining_action_indexes.includes(index);
  if (Array.isArray(result.executable_action_indexes))
    return result.executable_action_indexes.includes(index);
  return true;
}
