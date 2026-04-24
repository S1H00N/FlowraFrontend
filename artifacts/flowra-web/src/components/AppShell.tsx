import { Link, NavLink, useLocation } from "react-router-dom";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  Sparkles,
  Tag,
  CheckSquare2,
  Plus,
} from "lucide-react";
import type { ReactNode } from "react";
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
    label: "카테고리",
    description: "업무 분류 체계를 정돈합니다.",
    icon: Tag,
  },
];

const quickActions = [
  { to: "/tasks", label: "할 일 추가" },
  { to: "/schedules", label: "일정 추가" },
  { to: "/memos", label: "메모 작성" },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const { user: cachedUser, logout } = useAuth();
  const meQuery = useMe();
  const location = useLocation();

  const displayName = meQuery.data?.name ?? cachedUser?.name ?? "사용자";
  const activeItem =
    navigation.find((item) => item.to === location.pathname) ?? navigation[0];
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen bg-zinc-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white md:flex md:flex-col">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <Link
            to="/"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm"
            aria-label="Flowra 홈"
          >
            <Sparkles className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">Flowra</p>
            <p className="truncate text-xs text-slate-500">
              Personal workspace
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700"
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

        <div className="border-t border-slate-200 p-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-500">빠른 실행</p>
            <div className="mt-2 space-y-1">
              {quickActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white hover:text-slate-950"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen md:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-16 flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm md:hidden"
                aria-label="Flowra 홈"
              >
                <Sparkles className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-slate-950">
                  {activeItem.label}
                </h1>
                <p className="truncate text-sm text-slate-500">
                  {activeItem.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 lg:justify-end">
              <div className="hidden items-center gap-2 sm:flex">
                {quickActions.map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {action.label}
                  </Link>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-100 text-sm font-semibold text-emerald-700">
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

        <main className="mx-auto w-full max-w-7xl px-4 py-5 pb-24 sm:px-6 lg:px-8 lg:py-6">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-1 md:hidden">
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
