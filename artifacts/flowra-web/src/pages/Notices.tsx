import { useEffect, useRef, useState } from "react";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Megaphone,
  Pin,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import NoticeBody from "@/components/notices/NoticeBody";
import ErrorState from "@/components/ui/ErrorState";
import Spinner from "@/components/ui/Spinner";
import { useNotice, useNotices } from "@/hooks/useNotices";
import { getErrorMessage } from "@/lib/error";
import "./Notices.css";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatPublishedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

export default function Notices() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const paginationRef = useRef<HTMLElement>(null);
  const restorePageFocus = useRef(false);
  const notices = useNotices({ page, page_size: 20 });
  const detail = useNotice(selectedId);
  const totalPages = Math.max(1, notices.data?.meta.total_pages ?? 1);
  const total = notices.data?.meta.total;

  useEffect(() => {
    if (restorePageFocus.current && notices.isSuccess && !notices.isFetching) {
      restorePageFocus.current = false;
      paginationRef.current?.focus();
    }
  }, [notices.data, notices.isSuccess, notices.isFetching]);

  function changePage(nextPage: number) {
    restorePageFocus.current = true;
    setSelectedId(null);
    setPage(nextPage);
  }

  return (
    <AppShell headerDescriptionMode="tooltip">
      <div className="notices-page">
        <header className="notices-heading">
          <h1>공지사항</h1>
        </header>

        <section className="notices-panel" aria-label="공지 목록">
          <div className="notices-list-heading">
            <div className="notices-list-label">
              <span>전체 공지</span>
              {total !== undefined && (
                <span className="notices-count" aria-label={`총 ${total}개`}>
                  {total}
                </span>
              )}
            </div>
          </div>

          {notices.isLoading ? (
            <div className="notices-state">
              <Spinner label="공지를 불러오는 중" />
              <p>공지를 불러오는 중입니다.</p>
            </div>
          ) : notices.isError ? (
            <div className="notices-error">
              <ErrorState
                message={getErrorMessage(notices.error)}
                onRetry={() => notices.refetch()}
                retrying={notices.isFetching}
              />
            </div>
          ) : notices.data?.notices.length === 0 ? (
            <div className="notices-state notices-empty">
              <span className="notices-empty-icon" aria-hidden="true">
                <Bell size={24} strokeWidth={1.5} />
              </span>
              <p>등록된 공지가 없습니다.</p>
            </div>
          ) : (
            <ul className="notices-list">
              {notices.data?.notices.map((notice) => {
                const isSelected = selectedId === notice.notice_id;
                const published = formatPublishedDate(notice.publish_start_at);
                const titleId = `notice-title-${notice.notice_id}`;
                const bodyId = `notice-body-${notice.notice_id}`;

                return (
                  <li
                    key={notice.notice_id}
                    className={`notices-item${isSelected ? " notices-item--open" : ""}`}
                  >
                    <h2 className="notices-item-heading">
                      <button
                        type="button"
                        className="notices-row"
                        aria-expanded={isSelected}
                        aria-controls={isSelected ? bodyId : undefined}
                        onClick={() =>
                          setSelectedId(isSelected ? null : notice.notice_id)
                        }
                      >
                        <span
                          className={`notices-row-icon${notice.is_pinned ? " notices-row-icon--pinned" : ""}`}
                          aria-hidden="true"
                        >
                          {notice.is_pinned ? (
                            <Megaphone size={21} strokeWidth={1.6} />
                          ) : (
                            <FileText size={21} strokeWidth={1.6} />
                          )}
                        </span>
                        <span className="notices-row-copy">
                          <span className="notices-row-meta">
                            {notice.is_pinned ? (
                              <span className="notices-pinned">
                                <Pin size={11} aria-hidden="true" />
                                고정
                              </span>
                            ) : null}
                            {published && (
                              <time dateTime={notice.publish_start_at}>
                                {published}
                              </time>
                            )}
                          </span>
                          <span className="notices-row-title" id={titleId}>
                            {notice.title}
                          </span>
                        </span>
                        <ChevronDown
                          className="notices-row-chevron"
                          size={18}
                          aria-hidden="true"
                        />
                      </button>
                    </h2>

                    {isSelected && (
                      <article
                        id={bodyId}
                        className="notices-detail"
                        aria-labelledby={titleId}
                        aria-live="polite"
                        aria-busy={detail.isLoading}
                      >
                        {detail.isLoading ? (
                          <div className="notices-detail-loading">
                            <Spinner label="공지 내용을 불러오는 중" />
                          </div>
                        ) : detail.isError ? (
                          <ErrorState
                            message={getErrorMessage(detail.error)}
                            onRetry={() => detail.refetch()}
                            retrying={detail.isFetching}
                          />
                        ) : detail.data ? (
                          <NoticeBody notice={detail.data} />
                        ) : null}
                      </article>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!notices.isLoading &&
            !notices.isError &&
            total !== undefined &&
            total > 0 &&
            totalPages > 1 && (
              <footer className="notices-footer">
                <nav
                  className="notices-pagination"
                  aria-label={`공지 페이지, ${page} / ${totalPages}`}
                  ref={paginationRef}
                  tabIndex={-1}
                >
                  <button
                    type="button"
                    disabled={page <= 1 || notices.isFetching}
                    onClick={() => changePage(page - 1)}
                  >
                    <ChevronLeft size={15} aria-hidden="true" />
                    이전
                  </button>
                  <span className="notices-page-number" aria-current="page">
                    <span className="notices-current-page">{page}</span>{" "}
                    <span className="notices-page-divider">/</span>{" "}
                    <span>{totalPages}</span>
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages || notices.isFetching}
                    onClick={() => changePage(page + 1)}
                  >
                    다음
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                </nav>
              </footer>
            )}
        </section>
      </div>
    </AppShell>
  );
}
