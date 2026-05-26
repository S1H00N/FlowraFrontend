import { Link, NavLink, useLocation } from "react-router-dom";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  PanelLeft,
  Tag,
  CheckSquare2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMe } from "@/hooks/useMe";

const navigation = [
  {
    to: "/",
    label: "대시보드",
    description: "오늘 해야 할 일을 한눈에 봅니다.",
    icon: LayoutDashboard,
  },
  {
    to: "/tasks",
    label: "할 일",
    description: "작업의 우선순위와 상태를 관리합니다.",
    icon: CheckSquare2,
  },
  {
    to: "/schedules",
    label: "일정",
    description: "시간표와 약속을 정리합니다.",
    icon: CalendarDays,
  },
  {
    to: "/memos",
    label: "메모",
    description: "메모를 남기고 AI 분석을 확인합니다.",
    icon: NotebookPen,
  },
  {
    to: "/categories",
    label: "분류 관리",
    description: "카테고리와 기본 분류값을 관리합니다.",
    icon: Tag,
  },
];

const quickActions = [
  { to: "/tasks", label: "할 일 추가", icon: CheckSquare2 },
  { to: "/schedules", label: "일정 추가", icon: CalendarDays },
  { to: "/memos", label: "메모 작성", icon: NotebookPen },
];

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "flowra-sidebar-collapsed";

export default function AppShell({
  children,
  fullBleed = false,
  sidebarExtra,
  titleMeta,
  onSidebarCollapsedChange,
  onSidebarPreviewChange,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  sidebarExtra?: ReactNode;
  titleMeta?: ReactNode;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  onSidebarPreviewChange?: (open: boolean) => void;
}) {
  const { user: cachedUser, logout } = useAuth();
  const meQuery = useMe();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPreviewOpen, setSidebarPreviewOpen] = useState(false);
  const sidebarPreviewCloseTimeoutRef = useRef<number | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return false;

    return window.matchMedia("(min-width: 600px)").matches;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;

    return (
      window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true"
    );
  });

  const displayName = meQuery.data?.name ?? cachedUser?.name ?? "사용자";
  const activeItem =
    navigation.find((item) => item.to === location.pathname) ?? navigation[0];
  const initials = displayName.slice(0, 1).toUpperCase();
  const headerSidebarLabel = isDesktop
    ? sidebarCollapsed
      ? "사이드바 펼치기"
      : "사이드바 접기"
    : sidebarOpen
      ? "사이드바 닫기"
      : "사이드바 열기";
  const showHeaderQuickActions = sidebarCollapsed;
  const showSidebarPreview = sidebarCollapsed && sidebarPreviewOpen;
  const splitSummaryHeader = fullBleed && titleMeta;
  const summaryParts =
    typeof titleMeta === "string" ? titleMeta.split(" · ") : null;

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(sidebarCollapsed),
    );
    onSidebarCollapsedChange?.(sidebarCollapsed);
  }, [onSidebarCollapsedChange, sidebarCollapsed]);

  useEffect(() => {
    onSidebarPreviewChange?.(showSidebarPreview);
  }, [onSidebarPreviewChange, showSidebarPreview]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 600px)");
    const handleChange = () => setIsDesktop(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const closeSidebarOnMobile = () => {
    if (window.matchMedia("(max-width: 599px)").matches) {
      setSidebarOpen(false);
    }
  };

  const clearSidebarPreviewClose = () => {
    if (sidebarPreviewCloseTimeoutRef.current === null) return;
    window.clearTimeout(sidebarPreviewCloseTimeoutRef.current);
    sidebarPreviewCloseTimeoutRef.current = null;
  };

  const openSidebarPreview = () => {
    if (!sidebarCollapsed) return;
    clearSidebarPreviewClose();
    setSidebarPreviewOpen(true);
  };

  const scheduleSidebarPreviewClose = () => {
    if (!sidebarCollapsed) return;
    clearSidebarPreviewClose();
    sidebarPreviewCloseTimeoutRef.current = window.setTimeout(() => {
      setSidebarPreviewOpen(false);
      sidebarPreviewCloseTimeoutRef.current = null;
    }, 420);
  };

  useEffect(
    () => () => {
      clearSidebarPreviewClose();
    },
    [],
  );

  const handleHeaderSidebarToggle = () => {
    if (isDesktop) {
      setSidebarCollapsed((collapsed) => !collapsed);
      clearSidebarPreviewClose();
      setSidebarPreviewOpen(false);
      return;
    }

    setSidebarOpen((open) => !open);
  };

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-slate-900">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="사이드바 닫기"
          className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px] min-[600px]:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {sidebarCollapsed && (
        <div
          className="fixed bottom-4 left-0 top-16 z-40 hidden w-2 min-[600px]:block"
          onMouseEnter={openSidebarPreview}
          onMouseLeave={scheduleSidebarPreviewClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white/95 shadow-xl backdrop-blur transition-[transform,width,border-color] duration-200 ease-out ${
          showSidebarPreview
            ? "bottom-0 top-16"
            : "inset-y-0"
        } ${
          showSidebarPreview
            ? "min-[600px]:w-64 min-[600px]:translate-x-0 min-[600px]:shadow-2xl"
            : sidebarCollapsed
              ? "min-[600px]:w-0 min-[600px]:-translate-x-full min-[600px]:overflow-hidden min-[600px]:border-transparent min-[600px]:shadow-none"
              : "min-[600px]:w-64 min-[600px]:translate-x-0 min-[600px]:shadow-none"
        } ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        onMouseEnter={openSidebarPreview}
        onMouseLeave={scheduleSidebarPreviewClose}
      >
        <div
          className={`flex h-16 items-center gap-3 border-b border-slate-200 transition-all ${
            fullBleed ? "px-4 sm:px-5 lg:px-6" : "px-4 sm:px-6 lg:px-8"
          } ${
            sidebarCollapsed ? "min-[600px]:hidden" : ""
          }`}
        >
          <button
            type="button"
            aria-label={headerSidebarLabel}
            title={headerSidebarLabel}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            onClick={() => {
              if (isDesktop) {
                setSidebarCollapsed((collapsed) => !collapsed);
                setSidebarPreviewOpen(false);
                return;
              }

              setSidebarOpen(false);
            }}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>

        <nav
          className={`flex-1 space-y-1 px-3 py-4 transition-all ${
            sidebarCollapsed && !showSidebarPreview ? "min-[600px]:hidden" : ""
          }`}
        >
          {sidebarExtra && (
            <div className="mb-4 border-b border-slate-100 pb-4">
              {sidebarExtra}
            </div>
          )}

          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={closeSidebarOnMobile}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                </NavLink>
            );
          })}
        </nav>
      </aside>

      <div
        className={
          fullBleed
            ? `h-dvh overflow-hidden ${
                sidebarCollapsed ? "min-[600px]:pl-0" : "min-[600px]:pl-64"
              }`
            : `min-h-screen ${
                sidebarCollapsed ? "min-[600px]:pl-0" : "min-[600px]:pl-64"
              }`
        }
      >
        <header
          className={`sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur ${
            fullBleed ? "h-12 min-[600px]:h-16" : "h-14 min-[600px]:h-16"
          }`}
        >
          <div
            className={`relative flex h-full items-center justify-between gap-3 ${
              fullBleed
                ? "px-4 py-1.5 sm:px-5 lg:px-6"
                : "px-4 py-2 sm:px-6 lg:px-8"
            }`}
          >
            <div
              className="relative z-10 flex min-w-0 items-center gap-3"
            >
              {(!splitSummaryHeader || !isDesktop || sidebarCollapsed) && (
                <button
                  type="button"
                  aria-label={headerSidebarLabel}
                  title={headerSidebarLabel}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700 ${
                    sidebarCollapsed ? "" : "min-[600px]:hidden"
                  }`}
                  onMouseEnter={openSidebarPreview}
                  onMouseLeave={scheduleSidebarPreviewClose}
                  onClick={handleHeaderSidebarToggle}
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              )}
              {splitSummaryHeader ? (
                <div className="min-w-0">
                  {summaryParts ? (
                    <>
                      <p className="truncate text-sm font-semibold text-slate-800 sm:text-base">
                        {summaryParts[0]}
                      </p>
                      <p className="truncate text-xs font-medium text-slate-500">
                        {summaryParts.slice(1).join(" · ")}
                      </p>
                    </>
                  ) : (
                    <span className="block truncate text-sm font-semibold text-slate-700 sm:text-base">
                      {titleMeta}
                    </span>
                  )}
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="flex min-w-0 items-baseline gap-2">
                    <h1
                      className={`shrink-0 font-semibold text-slate-950 ${
                        fullBleed ? "text-base" : "text-lg"
                      }`}
                    >
                      {activeItem.label}
                    </h1>
                    {titleMeta && (
                      <span className="hidden min-w-0 truncate text-xs font-medium text-slate-500 sm:block">
                        {titleMeta}
                      </span>
                    )}
                  </div>
                  {!fullBleed && (
                    <p className="truncate text-sm text-slate-500">
                      {activeItem.description}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="ml-auto flex min-w-0 items-center justify-end gap-3">
              {showHeaderQuickActions && (
                <div className="hidden items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 md:flex">
                  <span className="mr-1 text-[11px] font-semibold text-slate-500">
                    빠른 실행
                  </span>
                  {quickActions.map((action) => {
                    const ActionIcon = action.icon;

                    return (
                      <Link
                        key={action.to}
                        to={action.to}
                        title={action.label}
                        aria-label={action.label}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white hover:text-emerald-700 hover:shadow-sm"
                      >
                        <ActionIcon className="h-4 w-4" />
                      </Link>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-50 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="max-w-28 truncate text-sm font-semibold text-slate-900">
                      {displayName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  aria-label="로그아웃"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        <main
          className={
            fullBleed
              ? "h-[calc(100dvh-7rem)] w-full overflow-hidden min-[600px]:h-[calc(100dvh-4rem)]"
              : "mx-auto w-full max-w-7xl px-4 py-5 pb-24 min-[600px]:pb-6 sm:px-6 lg:px-8 lg:py-6"
          }
        >
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur min-[600px]:hidden">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium ${
                  isActive ? "text-emerald-700" : "text-slate-500"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
