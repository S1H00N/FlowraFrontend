export type CategoryType = "task" | "schedule" | "memo";

export const CATEGORY_TYPES: CategoryType[] = ["task", "schedule", "memo"];

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  task: "할 일",
  schedule: "일정",
  memo: "메모",
};

export const DEFAULT_CATEGORY_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#64748B",
];

export interface Category {
  category_id: number;
  name: string;
  color: string;
  type: CategoryType;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string | null;
}

export interface CreateCategoryRequest {
  name: string;
  color: string;
  type: CategoryType;
}

export type UpdateCategoryRequest = Partial<
  Pick<CreateCategoryRequest, "name" | "color">
>;
