import { apiClient } from "./client";
import type {
  ApiListData,
  ApiResponse,
  Category,
  CategoryType,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "@/types";

interface CategoriesData {
  categories: Category[];
}

type CategoryListData = ApiListData<Category> & { categories?: Category[] };
type CategoryData = Category | { category: Category };

function unwrapCategory(data: CategoryData): Category {
  return "category" in data ? data.category : data;
}

export async function listCategories(type?: CategoryType) {
  const res = await apiClient.get<ApiResponse<CategoryListData>>("/categories", {
    params: type ? { type } : undefined,
  });
  return {
    ...res.data,
    data: {
      categories: res.data.data.items ?? res.data.data.categories ?? [],
    } satisfies CategoriesData,
  };
}

export async function createCategory(payload: CreateCategoryRequest) {
  const res = await apiClient.post<ApiResponse<CategoryData>>(
    "/categories",
    payload,
  );
  return { ...res.data, data: { category: unwrapCategory(res.data.data) } };
}

export async function updateCategory(
  categoryId: number,
  payload: UpdateCategoryRequest,
) {
  const res = await apiClient.patch<ApiResponse<CategoryData>>(
    `/categories/${categoryId}`,
    payload,
  );
  return { ...res.data, data: { category: unwrapCategory(res.data.data) } };
}

export async function deleteCategory(categoryId: number) {
  const res = await apiClient.delete<ApiResponse<Record<string, never>>>(
    `/categories/${categoryId}`,
  );
  return res.data;
}
