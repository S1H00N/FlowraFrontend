import { Link, NavLink, useLocation } from "react-router-dom";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Tag,
  CheckSquare2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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

const SIDEBAR_OPEN_STORAGE_KEY = "flowra-sidebar-open";

export default function AppShell({
  children,
  fullBleed = false,
  titleMeta,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  titleMeta?: ReactNode;
}) {
  const { user: cachedUser, logout } = useAuth();
  const meQuery = useMe();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return false;

    const saved = window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
    if (saved !== null) return saved === "true";

    return false;
  });

  const displayName = meQuery.data?.name ?? cachedUser?.name ?? "사용자";
  const activeItem =
    navigation.find((item) => item.to === location.pathname) ?? navigation[0];
  const initials = displayName.slice(0, 1).toUpperCase();
  const SidebarToggleIcon = sidebarOpen ? PanelLeftClose : PanelLeftOpen;
  const showHeaderQuickActions = !sidebarOpen;

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, String(sidebarOpen));
  }, [sidebarOpen]);

  const closeSidebarOnMobile = () => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setSidebarOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8f5] text-slate-900">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="사이드바 닫기"
          className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px]"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white/95 shadow-xl backdrop-blur transition-transform duration-200 ease-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <Link
            to="/"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm"
            aria-label="Flowra 홈"
            onClick={closeSidebarOnMobile}
          >
            <Sparkles className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">Flowra</p>
            <p className="truncate text-xs text-slate-500">
              Personal workspace
            </p>
          </div>
          <button
            type="button"
            aria-label="사이드바 닫기"
            title="사이드바 닫기"
            className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
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
        className={fullBleed ? "h-dvh overflow-hidden" : "min-h-screen"}
      >
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div
            className={`flex items-center justify-between gap-3 ${
              fullBleed
                ? "min-h-12 px-4 py-1.5 sm:px-5 lg:px-6"
                : "min-h-14 px-4 py-2 sm:px-6 lg:px-8"
            }`}
          >
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label={sidebarOpen ? "사이드바 닫기" : "사이드바 열기"}
                title={sidebarOpen ? "사이드바 닫기" : "사이드바 열기"}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                onClick={() => setSidebarOpen((open) => !open)}
              >
                <SidebarToggleIcon className="h-4 w-4" />
              </button>
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
              ? "h-[calc(100dvh-7rem)] w-full overflow-hidden md:h-[calc(100dvh-3rem)]"
              : "mx-auto w-full max-w-7xl px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-6"
          }
        >
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
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
