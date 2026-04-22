import { Link, NavLink, useLocation } from "react-router-dom";
import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  Sparkles,
  Tag,
  CheckSquare2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMe } from "@/hooks/useMe";

const navigation = [
  { to: "/", label: "대시보드", icon: LayoutDashboard },
  { to: "/tasks", label: "할 일", icon: CheckSquare2 },
  { to: "/schedules", label: "일정", icon: CalendarDays },
  { to: "/memos", label: "메모", icon: NotebookPen },
  { to: "/categories", label: "카테고리", icon: Tag },
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
    <div className="relative min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="sticky top-4 z-30 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md transition-transform hover:scale-105"
                aria-label="Flowra 홈"
              >
                <Sparkles className="h-5 w-5" />
              </Link>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Flowra workspace
                </p>
                <p className="text-sm text-slate-500">
                  {activeItem.label} 화면입니다.
                </p>
              </div>
            </div>

            <nav className="flex gap-2 overflow-x-auto pb-1 lg:justify-center">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-slate-100 text-indigo-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 self-start lg:self-auto">
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-1.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-sm font-semibold text-indigo-700">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {displayName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 space-y-6">{children}</section>

          <aside className="hidden lg:flex lg:flex-col lg:gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                Current view
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">
                {activeItem.label}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                업무와 일정을 깔끔하게 관리할 수 있는 스튜디오입니다.
              </p>
            </div>

            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-indigo-900">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                Quick links
              </p>
              <div className="mt-4 space-y-2">
                {navigation.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center justify-between rounded-xl bg-white/60 px-4 py-3 text-sm font-medium text-indigo-900 transition hover:bg-white"
                  >
                    <span>{item.label}</span>
                    <span className="text-indigo-300">→</span>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}