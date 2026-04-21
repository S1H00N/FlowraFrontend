export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: {
    code: string;
    details?: Record<string, unknown>;
  };
}

export interface Pagination {
  page: number;
  size: number;
  total_items: number;
  total_pages: number;
  has_next: boolean;
}

export interface PaginatedData<T> {
  items: T[];
  pagination: Pagination;
}
