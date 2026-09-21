import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  PanelLeft,
  Settings,
  CheckSquare2,
} from "lucide-react";
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyAdminMe } from "@/hooks/useCompanyAdmin";
import { useGravatarProfileImage } from "@/hooks/useGravatarProfileImage";
import { useMe } from "@/hooks/useMe";
import NotificationCenter from "@/components/NotificationCenter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SettingsPanel } from "@/components/SettingsPanel";
import AiChatWidget from "@/components/AiChatWidget";
import SidebarMiniCalendar from "@/components/SidebarMiniCalendar";
import { formatCompanyAffiliation } from "@/lib/companyAffiliation";


const navigation = [
  { to: "/notices", label: "공지사항", description: "서비스 공지를 확인합니다.", icon: Bell },
  {
    to: "/",
    label: "홈",
    description: "오늘 해야 할 일을 한눈에 봅니다.",
    icon: LayoutDashboard,
  },
  {
    to: "/tasks",
    label: "할일",
    description: "작업의 우선순위와 상태를 관리합니다.",
    icon: CheckSquare2,
  },
  {
    to: "/schedules",
    label: "캘린더",
    description: "시간표와 약속을 정리합니다.",
    icon: CalendarDays,
  },
  {
    to: "/memos",
    label: "메모",
    description: "메모를 남기고 AI 분석을 확인합니다.",
    icon: NotebookPen,
  },
];

const settingsNavigationItem = {
  to: "/settings",
  label: "설정",
  description: "표시 옵션과 개인 설정을 관리합니다.",
  icon: Settings,
};

const sidebarToggleButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent text-slate-500 shadow-none transition hover:bg-slate-100 hover:text-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300";

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "flowra-sidebar-collapsed";

function ProfileMenu({
  variant,
  displayName,
  displayEmail,
  affiliationLabel,
  profileImageUrl,
  initials,
  compact,
  onOpenSettings,
  onLogout,
}: {
  variant: "icon" | "card";
  displayName: string;
  displayEmail: string;
  affiliationLabel?: string;
  profileImageUrl: string | null;
  initials: string;
  compact?: boolean;
  onOpenSettings: () => void;
  onLogout: () => void;
}) {
  const isCard = variant === "card";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="프로필 메뉴"
          title="프로필 메뉴"
          className={
            isCard
              ? "flex w-full min-w-0 items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              : `inline-flex shrink-0 items-center justify-center rounded-lg bg-transparent transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
                  compact ? "h-9 w-9" : "h-10 w-10"
                }`
          }
        >
          <Avatar
            className={`rounded-lg ${
              isCard ? "h-8 w-8" : compact ? "h-7 w-7" : "h-8 w-8"
            }`}
          >
            {profileImageUrl && (
              <AvatarImage src={profileImageUrl} alt={displayName} />
            )}
            <AvatarFallback className="rounded-lg bg-violet-500 text-sm font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          {isCard && (
            <span className="min-w-0 flex-1 overflow-hidden">
              <span className="block truncate text-xs font-semibold text-slate-950">
                {displayName}
              </span>
              {affiliationLabel && (
                <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-400">
                  {affiliationLabel}
                </span>
              )}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isCard ? "top" : "right"}
        align={isCard ? "start" : "end"}
        sideOffset={8}
        className="w-44 rounded-lg border-slate-200 bg-white p-2 text-slate-900 shadow-xl shadow-slate-900/10"
      >
        <DropdownMenuItem
          onSelect={() => {
            onOpenSettings();
          }}
          className="h-10 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-medium text-slate-700 focus:bg-violet-50 focus:text-violet-700"
        >
          <Settings className="h-4 w-4 text-slate-500" />
          설정
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onLogout}
          className="h-10 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-medium text-red-500 focus:bg-red-50 focus:text-red-600"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </DropdownMenuItem>
        {!isCard && displayEmail && (
          <div className="mt-1 border-t border-slate-100 px-3 pt-2">
            <p className="truncate text-[11px] font-medium text-slate-400">
              {displayEmail}
            </p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppShell({
  children,
  fullBleed = false,
  wide = false,
  sidebarExtra,
  titleMeta,
  greeting,
  headerActions,
  aiChatButtonOffset,
  headerRightOffset,
  onSidebarCollapsedChange,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  wide?: boolean;
  sidebarExtra?: ReactNode;
  titleMeta?: ReactNode;
  greeting?: ReactNode;
  headerActions?: ReactNode;
  aiChatButtonOffset?: string;
  headerRightOffset?: string;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
}) {
  const { user: cachedUser, logout } = useAuth();
  const meQuery = useMe();
  const companyAdminMeQuery = useCompanyAdminMe();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
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
  const displayEmail = meQuery.data?.email ?? cachedUser?.email ?? "";
  const storedProfileImageUrl =
    (
      meQuery.data?.profile_image_url ??
      cachedUser?.profile_image_url ??
      ""
    ).trim() || null;
  const gravatarProfileImageUrl = useGravatarProfileImage(displayEmail, 160);
  const profileImageUrl = storedProfileImageUrl ?? gravatarProfileImageUrl;
  const affiliationLabel = formatCompanyAffiliation(companyAdminMeQuery.data);
  const activeItem =
    location.pathname === settingsNavigationItem.to
      ? settingsNavigationItem
      : (navigation.find((item) => item.to === location.pathname) ??
        navigation[0]);
  const initials = displayName.slice(0, 1).toUpperCase();
  const headerSidebarLabel = isDesktop
    ? sidebarCollapsed
      ? "사이드바 펼치기"
      : "사이드바 접기"
    : sidebarOpen
      ? "사이드바 닫기"
      : "사이드바 열기";
  const showSidebarIconRail = isDesktop && sidebarCollapsed;
  const headerRightOffsetStyle = {
    "--flowra-header-right-offset": headerRightOffset ?? "0px",
  } as CSSProperties;
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
    const mediaQuery = window.matchMedia("(min-width: 600px)");
    const handleChange = () => setIsDesktop(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  const closeSidebarOnMobile = () => {
    if (window.matchMedia("(max-width: 599px)").matches) {
      setSidebarOpen(false);
    }
  };

  useEffect(() => {
    setSettingsDialogOpen(false);
  }, [location.pathname]);

  const openSettingsDialog = () => {
    window.setTimeout(() => setSettingsDialogOpen(true), 0);
  };

  const handleHeaderSidebarToggle = () => {
    if (isDesktop) {
      setSidebarCollapsed((collapsed) => !collapsed);
      return;
    }

    setSidebarOpen((open) => !open);
  };

  return (
    <div className="flowra-app-shell min-h-screen">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="사이드바 닫기"
          className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[1px] min-[600px]:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white/95 shadow-xl backdrop-blur transition-[transform,width,border-color] duration-200 ease-out ${
          sidebarCollapsed
            ? "min-[600px]:w-16 min-[600px]:translate-x-0 min-[600px]:shadow-none"
            : "min-[600px]:w-64 min-[600px]:translate-x-0 min-[600px]:shadow-none"
        } ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div
          className={`flex h-14 shrink-0 items-center border-b border-slate-200 transition-all min-[600px]:h-16 ${
            showSidebarIconRail
              ? "justify-center px-0"
              : "justify-start gap-3 px-5"
          }`}
        >
          <button
            type="button"
            aria-label={headerSidebarLabel}
            title={headerSidebarLabel}
            className={`${sidebarToggleButtonClass} ${
              showSidebarIconRail ? "min-[600px]:h-10 min-[600px]:w-10" : ""
            }`}
            onClick={() => {
              if (isDesktop) {
                setSidebarCollapsed((collapsed) => !collapsed);
                return;
              }

              setSidebarOpen(false);
            }}
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          {!showSidebarIconRail && (
            <Link to="/" className="flex min-w-0 items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">
                F
              </span>
              <span className="truncate text-sm font-bold text-slate-700">
                Flowra
              </span>
            </Link>
          )}
        </div>

        <nav
          className={`min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 transition-all ${
            showSidebarIconRail ? "min-[600px]:px-2" : ""
          }`}
        >
          {!showSidebarIconRail && (
            <div className="mb-4 border-b border-slate-100 pb-4">
              {sidebarExtra ?? <SidebarMiniCalendar />}
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
                aria-label={item.label}
                title={item.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    showSidebarIconRail
                      ? "min-[600px]:h-10 min-[600px]:justify-center min-[600px]:gap-0 min-[600px]:px-0"
                      : ""
                  } ${
                    isActive
                      ? "bg-violet-50 text-violet-700"
                      : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                <span
                  className={
                    showSidebarIconRail ? "min-[600px]:hidden" : undefined
                  }
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <div
          className={`border-t border-slate-100 p-3 transition-all ${
            showSidebarIconRail
              ? "min-[600px]:flex min-[600px]:justify-center"
              : ""
          }`}
        >
          <ProfileMenu
            variant={showSidebarIconRail ? "icon" : "card"}
            displayName={displayName}
            displayEmail={displayEmail}
            affiliationLabel={affiliationLabel}
            profileImageUrl={profileImageUrl}
            initials={initials}
            onOpenSettings={openSettingsDialog}
            onLogout={handleLogout}
          />
        </div>
      </aside>

      <div
        className={
          fullBleed
            ? `h-dvh overflow-hidden ${
                sidebarCollapsed ? "min-[600px]:pl-16" : "min-[600px]:pl-64"
              }`
            : `min-h-screen ${
                sidebarCollapsed ? "min-[600px]:pl-16" : "min-[600px]:pl-64"
              }`
        }
      >
        <header
          className={`sticky top-0 z-30 border-b border-slate-200/80 bg-slate-50/90 backdrop-blur ${
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
            <div className="relative z-10 flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
              {(!splitSummaryHeader || !isDesktop || sidebarCollapsed) &&
                !(isDesktop && sidebarCollapsed) && (
                  <button
                    type="button"
                    aria-label={headerSidebarLabel}
                    title={headerSidebarLabel}
                    className={`${sidebarToggleButtonClass} ${
                      sidebarCollapsed ? "" : "min-[600px]:hidden"
                    }`}
                    onClick={handleHeaderSidebarToggle}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </button>
                )}
              {splitSummaryHeader ? (
                <div className="min-w-0 max-w-full overflow-hidden">
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
              ) : greeting ? (
                <div className="min-w-0 max-w-full overflow-hidden">
                  {greeting}
                </div>
              ) : (
                <div className="min-w-0 max-w-full overflow-hidden">
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

            <div
              className="relative z-20 ml-auto flex min-w-0 shrink-0 items-center justify-end gap-2 transition-[margin] duration-200 min-[600px]:mr-[var(--flowra-header-right-offset)]"
              style={headerRightOffsetStyle}
            >
              <Dialog
                open={settingsDialogOpen}
                onOpenChange={setSettingsDialogOpen}
              >
                <DialogContent className="h-[min(92dvh,580px)] w-[min(96vw,820px)] max-w-none gap-0 overflow-hidden rounded-[22px] border-0 p-0 shadow-2xl shadow-slate-900/20">
                  <DialogTitle className="sr-only">설정</DialogTitle>
                  <SettingsPanel compact />
                </DialogContent>
              </Dialog>

              <NotificationCenter />
              {headerActions && (
                <div className="hidden items-center gap-1 min-[600px]:flex">
                  {headerActions}
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          className={
            fullBleed
              ? "h-[calc(100dvh-3rem-var(--flowra-mobile-nav-height))] w-full overflow-hidden min-[600px]:h-[calc(100dvh-4rem)]"
              : wide
                ? "w-full px-4 py-5 pb-[calc(var(--flowra-mobile-nav-height)+2rem)] min-[600px]:pb-6 sm:px-6 lg:px-8 lg:py-6"
                : "mx-auto w-full max-w-7xl px-4 py-5 pb-[calc(var(--flowra-mobile-nav-height)+2rem)] min-[600px]:pb-6 sm:px-6 lg:px-8 lg:py-6"
          }
        >
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid h-[var(--flowra-mobile-nav-height)] border-t border-slate-200 bg-white/95 px-2 pb-[calc(0.25rem+env(safe-area-inset-bottom))] pt-1 backdrop-blur min-[600px]:hidden"
        style={{ gridTemplateColumns: `repeat(${navigation.length}, minmax(0, 1fr))` }}
      >
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium ${
                  isActive ? "text-violet-700" : "text-slate-500"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <AiChatWidget buttonRightOffset={aiChatButtonOffset} />
    </div>
  );
}
