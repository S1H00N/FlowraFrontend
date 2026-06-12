import { NavLink, useLocation } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  CheckCheck,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  PanelLeft,
  Settings,
  CheckSquare2,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyAdminMe } from "@/hooks/useCompanyAdmin";
import { useGravatarProfileImage } from "@/hooks/useGravatarProfileImage";
import { useMe } from "@/hooks/useMe";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationUnreadCount,
  useNotifications,
} from "@/hooks/useNotifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Spinner from "@/components/ui/Spinner";
import { SettingsPanel } from "@/components/SettingsPanel";
import AiChatWidget from "@/components/AiChatWidget";
import { formatCompanyAffiliation } from "@/lib/companyAffiliation";
import type { NotificationRecipient } from "@/types";

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
];

const settingsNavigationItem = {
  to: "/settings",
  label: "설정",
  description: "표시 옵션과 개인 설정을 관리합니다.",
  icon: Settings,
};

const sidebarToggleButtonClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent text-slate-500 shadow-none transition hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300";

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
  onOpenChange,
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
  onOpenChange?: (open: boolean) => void;
}) {
  const isCard = variant === "card";

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="프로필 메뉴"
          title="프로필 메뉴"
          className={
            isCard
              ? "flex w-full min-w-0 items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 text-left transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
              : `inline-flex shrink-0 items-center justify-center rounded-lg bg-transparent transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
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
            <AvatarFallback className="rounded-lg bg-emerald-500 text-sm font-semibold text-white">
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
          className="h-10 cursor-pointer gap-2.5 rounded-lg px-3 text-sm font-medium text-slate-700 focus:bg-emerald-50 focus:text-emerald-700"
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

function formatNotificationTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const notificationsQuery = useNotifications({ page_size: 8 }, open);
  const unreadCountQuery = useNotificationUnreadCount();
  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();
  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = unreadCountQuery.data ?? 0;

  const markRead = (notification: NotificationRecipient) => {
    if (notification.read_at || markReadMutation.isPending) return;
    markReadMutation.mutate(notification.notification_recipient_id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="알림"
          title="알림"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg bg-transparent text-slate-500 transition hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl shadow-slate-900/10"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-950">알림</h2>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              {unreadCount > 0 ? `읽지 않음 ${unreadCount}건` : "모두 읽음"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => markAllReadMutation.mutate()}
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {markAllReadMutation.isPending ? (
              <Spinner size="xs" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            모두 읽음
          </button>
        </div>

        <div className="max-h-[min(420px,70vh)] overflow-y-auto">
          {notificationsQuery.isLoading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm font-medium text-slate-500">
              <Spinner size="xs" />
              알림을 불러오는 중...
            </div>
          ) : notificationsQuery.isError ? (
            <div className="px-4 py-6 text-sm font-medium text-red-600">
              알림을 불러오지 못했습니다.
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm font-medium text-slate-400">
              새 알림이 없습니다.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((notification) => {
                const unread = !notification.read_at;

                return (
                  <li key={notification.notification_recipient_id}>
                    <button
                      type="button"
                      onClick={() => markRead(notification)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
                    >
                      <span
                        className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                          unread ? "bg-emerald-500" : "bg-slate-200"
                        }`}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">
                          {notification.title}
                        </span>
                        {notification.body && (
                          <span className="mt-1 line-clamp-2 block text-xs font-medium leading-5 text-slate-500">
                            {notification.body}
                          </span>
                        )}
                        <span className="mt-1 block text-[11px] font-semibold text-slate-400">
                          {formatNotificationTime(notification.created_at)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function AppShell({
  children,
  fullBleed = false,
  sidebarExtra,
  titleMeta,
  headerActions,
  aiChatButtonOffset,
  headerRightOffset,
  onSidebarCollapsedChange,
  onSidebarPreviewChange,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  sidebarExtra?: ReactNode;
  titleMeta?: ReactNode;
  headerActions?: ReactNode;
  aiChatButtonOffset?: string;
  headerRightOffset?: string;
  onSidebarCollapsedChange?: (collapsed: boolean) => void;
  onSidebarPreviewChange?: (open: boolean) => void;
}) {
  const { user: cachedUser, logout } = useAuth();
  const meQuery = useMe();
  const companyAdminMeQuery = useCompanyAdminMe();
  const location = useLocation();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPreviewOpen, setSidebarPreviewOpen] = useState(false);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const sidebarPreviewCloseTimeoutRef = useRef<number | null>(null);
  const isHoveringSidebarRef = useRef(false);
  const isProfileMenuOpenRef = useRef(false);
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
  const showSidebarPreview = sidebarCollapsed && sidebarPreviewOpen;
  const showSidebarIconRail =
    isDesktop && sidebarCollapsed && !showSidebarPreview;
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
    onSidebarPreviewChange?.(showSidebarPreview);
  }, [onSidebarPreviewChange, showSidebarPreview]);

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

  const clearSidebarPreviewClose = () => {
    if (sidebarPreviewCloseTimeoutRef.current === null) return;
    window.clearTimeout(sidebarPreviewCloseTimeoutRef.current);
    sidebarPreviewCloseTimeoutRef.current = null;
  };

  const openSidebarPreview = () => {
    if (!sidebarCollapsed) return;
    isHoveringSidebarRef.current = true;
    clearSidebarPreviewClose();
    setSidebarPreviewOpen(true);
  };

  const scheduleSidebarPreviewClose = () => {
    if (!sidebarCollapsed) return;
    isHoveringSidebarRef.current = false;
    if (isProfileMenuOpenRef.current) return; // 프로필 메뉴가 열려있으면 닫지 않음

    clearSidebarPreviewClose();
    sidebarPreviewCloseTimeoutRef.current = window.setTimeout(() => {
      setSidebarPreviewOpen(false);
      sidebarPreviewCloseTimeoutRef.current = null;
    }, 420);
  };

  const handleProfileMenuOpenChange = (open: boolean) => {
    isProfileMenuOpenRef.current = open;
    if (!open && !isHoveringSidebarRef.current) {
      scheduleSidebarPreviewClose(); // 메뉴가 닫혔을 때 호버 상태가 아니라면 사이드바도 닫음
    }
  };

  useEffect(
    () => () => {
      clearSidebarPreviewClose();
    },
    [],
  );

  useEffect(() => {
    setSettingsDialogOpen(false);
  }, [location.pathname]);

  const openSettingsDialog = () => {
    window.setTimeout(() => setSettingsDialogOpen(true), 0);
  };

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

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white/95 shadow-xl backdrop-blur transition-[transform,width,border-color] duration-200 ease-out ${
          showSidebarPreview
            ? "min-[600px]:w-64 min-[600px]:translate-x-0 min-[600px]:shadow-2xl"
            : sidebarCollapsed
              ? "min-[600px]:w-16 min-[600px]:translate-x-0 min-[600px]:shadow-none"
              : "min-[600px]:w-64 min-[600px]:translate-x-0 min-[600px]:shadow-none"
        } ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        onMouseEnter={openSidebarPreview}
        onMouseLeave={scheduleSidebarPreviewClose}
      >
        <div
          className={`flex h-16 items-center gap-3 border-b border-slate-200 transition-all ${
            showSidebarIconRail
              ? "px-4 min-[600px]:justify-center min-[600px]:px-0"
              : fullBleed
                ? "px-4 sm:px-5 lg:px-6"
                : "px-4 sm:px-6 lg:px-8"
          }`}
        >
          <button
            type="button"
            aria-label={headerSidebarLabel}
            title={headerSidebarLabel}
            className={sidebarToggleButtonClass}
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
            showSidebarIconRail ? "min-[600px]:px-2" : ""
          }`}
        >
          {sidebarExtra && (
            <div
              className={`mb-4 border-b border-slate-100 pb-4 ${
                showSidebarIconRail ? "min-[600px]:hidden" : ""
              }`}
            >
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
                aria-label={item.label}
                title={item.label}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                    showSidebarIconRail
                      ? "min-[600px]:h-10 min-[600px]:justify-center min-[600px]:gap-0 min-[600px]:px-0"
                      : ""
                  } ${
                    isActive
                      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
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
            showSidebarIconRail ? "min-[600px]:flex min-[600px]:justify-center" : ""
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
            onOpenChange={handleProfileMenuOpenChange}
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
              className="relative z-10 flex min-w-0 flex-1 items-center gap-3 overflow-hidden"
            >
              {(!splitSummaryHeader || !isDesktop || sidebarCollapsed) &&
                !(isDesktop && sidebarCollapsed) && (
                <button
                  type="button"
                  aria-label={headerSidebarLabel}
                  title={headerSidebarLabel}
                  className={`${sidebarToggleButtonClass} ${
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

      <AiChatWidget buttonRightOffset={aiChatButtonOffset} />
    </div>
  );
}
