export interface Notice {
  notice_id: number;
  category: "system";
  title: string;
  body: string;
  body_format: "markdown" | "plain" | "html";
  is_pinned: boolean;
  publish_start_at: string;
  publish_end_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoticesQuery {
  page?: number;
  page_size?: number;
}

export interface NoticesData {
  notices: Notice[];
  meta: { page: number; page_size: number; total: number; total_pages: number };
}
