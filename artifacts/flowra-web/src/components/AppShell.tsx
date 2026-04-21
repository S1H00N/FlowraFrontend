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
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.16),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.12),_transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef5fb_42%,#f6f8fb_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.02)_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.9),transparent_92%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <header className="sticky top-4 z-30 rounded-[28px] border border-white/70 bg-white/75 px-4 py-3 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Link
                to="/"
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-900/20"
                aria-label="Flowra 홈"
              >
                <Sparkles className="h-5 w-5" />
              </Link>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                  Flowra workspace
                </p>
                <p className="text-sm text-slate-500">
                  {activeItem.label} 화면을 다듬는 중입니다.
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
                      `inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                        isActive
                          ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20"
                          : "border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white"
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
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-slate-900 to-slate-600 text-sm font-semibold text-white">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {displayName}
                  </p>
                  <p className="text-xs text-slate-500">로그인됨</p>
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" />
                로그아웃
              </button>
            </div>
          </div>
        </header>

        <main className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="min-w-0 space-y-6">{children}</section>

          <aside className="hidden lg:flex lg:flex-col lg:gap-4">
            <div className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                Current view
              </p>
              <h2 className="mt-3 text-xl font-semibold text-slate-900">
                {activeItem.label}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                오늘의 업무와 메모를 한 화면에서 관리하도록 재구성한 인터페이스입니다.
              </p>
            </div>

            <div className="rounded-[28px] border border-slate-200/80 bg-slate-950 p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                Quick links
              </p>
              <div className="mt-4 space-y-2">
                {navigation.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10"
                  >
                    <span>{item.label}</span>
                    <span className="text-slate-400">→</span>
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