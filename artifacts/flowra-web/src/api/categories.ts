import { apiClient } from "./client";
import type {
  ApiResponse,
  Category,
  CategoryType,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "@/types";

interface CategoriesData {
  categories?: Category[];
  items?: Category[];
}

export async function listCategories(type?: CategoryType) {
  const res = await apiClient.get<ApiResponse<CategoriesData>>("/categories", {
    params: type ? { type } : undefined,
  });
  return res.data;
}

export async function createCategory(payload: CreateCategoryRequest) {
  const res = await apiClient.post<ApiResponse<Category>>(
    "/categories",
    payload,
  );
  return res.data;
}

export async function updateCategory(
  categoryId: number,
  payload: UpdateCategoryRequest,
) {
  const res = await apiClient.patch<ApiResponse<Category>>(
    `/categories/${categoryId}`,
    payload,
  );
  return res.data;
}

export async function deleteCategory(categoryId: number) {
  const res = await apiClient.delete<ApiResponse<unknown>>(
    `/categories/${categoryId}`,
  );
  return res.data;
}
