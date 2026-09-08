import { useState } from "react";
import AppShell from "@/components/AppShell";
import ErrorState from "@/components/ui/ErrorState";
import Spinner from "@/components/ui/Spinner";
import { useNotice, useNotices } from "@/hooks/useNotices";

export default function Notices() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const notices = useNotices({ page, page_size: 20 });
  const detail = useNotice(selectedId);
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 p-4">
        <h1 className="text-xl font-semibold">공지사항</h1>
        {notices.isLoading ? (
          <Spinner />
        ) : notices.isError ? (
          <ErrorState
            message={notices.error.message}
            onRetry={() => notices.refetch()}
          />
        ) : (
          <>
            <ul className="divide-y rounded-xl border bg-white">
              {notices.data?.notices.map((notice) => (
                <li key={notice.notice_id}>
                  <button
                    className="w-full p-4 text-left hover:bg-slate-50"
                    onClick={() => setSelectedId(notice.notice_id)}
                  >
                    {notice.is_pinned && (
                      <span className="mr-2 text-xs text-violet-600">고정</span>
                    )}
                    {notice.title}
                  </button>
                </li>
              ))}
            </ul>
            {notices.data?.notices.length === 0 && (
              <p>등록된 공지가 없습니다.</p>
            )}
            <div className="flex justify-between">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                이전
              </button>
              <span>
                {page} / {Math.max(1, notices.data?.meta.total_pages ?? 1)}
              </span>
              <button
                disabled={page >= (notices.data?.meta.total_pages ?? 1)}
                onClick={() => setPage(page + 1)}
              >
                다음
              </button>
            </div>
          </>
        )}
        {selectedId !== null && (
          <article
            className="space-y-3 rounded-xl border bg-white p-5"
            aria-live="polite"
          >
            <button
              className="text-sm text-slate-500"
              onClick={() => setSelectedId(null)}
            >
              닫기
            </button>
            {detail.isLoading ? (
              <Spinner />
            ) : detail.isError ? (
              <ErrorState
                message={detail.error.message}
                onRetry={() => detail.refetch()}
              />
            ) : (
              detail.data && (
                <>
                  <h2 className="text-lg font-semibold">{detail.data.title}</h2>
                  {detail.data.body_format === "html" ? (
                    <iframe
                      title={detail.data.title}
                      sandbox=""
                      referrerPolicy="no-referrer"
                      className="h-96 w-full border-0"
                      srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:16px/1.6 sans-serif;overflow-wrap:anywhere}</style>${detail.data.body}`}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">
                      {detail.data.body}
                    </p>
                  )}
                </>
              )
            )}
          </article>
        )}
      </div>
    </AppShell>
  );
}
