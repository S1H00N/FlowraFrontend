import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "@/api/categories";
import type {
  Category,
  CategoryType,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "@/types";

export const CATEGORIES_QUERY_KEY = ["categories"] as const;

export function categoriesKey(type?: CategoryType) {
  return type
    ? ([...CATEGORIES_QUERY_KEY, type] as const)
    : CATEGORIES_QUERY_KEY;
}

export function useCategories(type?: CategoryType) {
  return useQuery<Category[]>({
    queryKey: categoriesKey(type),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const res = await listCategories(type);
      if (!res.success)
        throw new Error(res.message || "카테고리를 불러오지 못했습니다.");
      return res.data.categories ?? [];
    },
  });
}

export function categoryKey(categoryId: number) {
  return [...CATEGORIES_QUERY_KEY, "detail", categoryId] as const;
}

export function useCategory(categoryId: number | null, enabled = true) {
  return useQuery<Category>({
    queryKey: categoryKey(categoryId ?? 0),
    enabled: enabled && categoryId !== null,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const res = await getCategory(categoryId as number);
      if (!res.success)
        throw new Error(res.message || "카테고리를 불러오지 못했습니다.");
      return res.data.category;
    },
  });
}

function useInvalidateCategories() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: CATEGORIES_QUERY_KEY });
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async (payload: CreateCategoryRequest) => {
      const res = await createCategory(payload);
      if (!res.success)
        throw new Error(res.message || "카테고리 생성에 실패했습니다.");
      return res.data.category;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "카테고리를 추가했습니다.",
      errorMessage: "카테고리 추가에 실패했습니다.",
    },
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async ({
      categoryId,
      payload,
    }: {
      categoryId: number;
      payload: UpdateCategoryRequest;
    }) => {
      const res = await updateCategory(categoryId, payload);
      if (!res.success)
        throw new Error(res.message || "카테고리 수정에 실패했습니다.");
      return res.data.category;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "카테고리를 수정했습니다.",
      errorMessage: "카테고리 수정에 실패했습니다.",
    },
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: async (categoryId: number) => {
      const res = await deleteCategory(categoryId);
      if (!res.success)
        throw new Error(res.message || "카테고리 삭제에 실패했습니다.");
      return res.data;
    },
    onSuccess: () => invalidate(),
    meta: {
      successMessage: "카테고리를 삭제했습니다.",
      errorMessage: "카테고리 삭제에 실패했습니다.",
    },
  });
}
