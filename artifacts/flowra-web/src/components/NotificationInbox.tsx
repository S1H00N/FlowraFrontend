import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, CalendarDays, CheckCheck, CheckSquare2, FolderKanban, ListTodo, Megaphone, MoreHorizontal, Trash2 } from 'lucide-react';
import { useDeleteNotifications, useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/useNotifications';
import { NOTIFICATION_CATEGORIES, notificationContext, notificationKey, notificationKind, notificationTime, type NotificationCategory, type NotificationKind } from '@/lib/notificationPresentation';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Spinner from '@/components/ui/Spinner';
import type { NotificationRecipient } from '@/types';

const kinds = {
  schedule: { label: '일정', icon: CalendarDays, color: 'text-blue-600' },
  task: { label: '할 일', icon: ListTodo, color: 'text-emerald-600' },
  project: { label: '프로젝트', icon: FolderKanban, color: 'text-violet-600' },
  notice: { label: '공지', icon: Megaphone, color: 'text-amber-600' },
  general: { label: '알림', icon: Bell, color: 'text-slate-500' },
} satisfies Record<NotificationKind, { label: string; icon: typeof Bell; color: string }>;

export default function NotificationInbox({ full = false, onNavigate }: { full?: boolean; onNavigate?: () => void }) {
  const id = useId();
  const query = useNotifications({ all_pages: true });
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const remove = useDeleteNotifications();
  const [category, setCategory] = useState<NotificationCategory>('all');
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(full ? 50 : 100);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const notifications = query.data?.notifications ?? [];
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  const filtered = notifications.filter((item) => category === 'all' || notificationKind(item) === category);
  const visible = filtered.slice(0, visibleCount);
  const selectedItems = visible.filter((item) => selected.has(notificationKey(item)));
  const busy = markRead.isPending || markAllRead.isPending || remove.isPending;
  const allSelected = visible.length > 0 && selectedItems.length === visible.length;
  const hasSelectedUnread = selectedItems.some((item) => !item.read_at);

  const changeCategory = (next: NotificationCategory) => {
    setCategory(next);
    setSelected(new Set());
    setVisibleCount(full ? 50 : 100);
  };
  const toggleItem = (item: NotificationRecipient) => {
    setSelected((previous) => {
      const next = new Set(previous);
      const key = notificationKey(item);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const deleteAll = () => {
    const description = query.data?.server_unavailable
      ? '서버에 연결되지 않아 현재 확인 가능한 알림만 삭제합니다.'
      : '이 브라우저의 수신함에 있는 알림을 모두 삭제합니다.';
    if (window.confirm(`${description}\n다른 기기의 알림에는 영향을 주지 않습니다. 계속할까요?`)) {
      remove.mutate(undefined, { onSuccess: () => setSelected(new Set()) });
    }
  };
  const Heading = full ? 'h1' : 'h2';

  return (
    <section aria-label={full ? '전체 알림 수신함' : '알림 수신함'} className="bg-white text-slate-900">
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <Heading className={`${full ? 'text-xl' : 'text-base'} font-bold tracking-tight text-slate-950`}>알림</Heading>
          <button type="button" onClick={() => markAllRead.mutate()} disabled={unreadCount === 0 || busy}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-40">
            {markAllRead.isPending ? <Spinner size="xs" /> : <CheckCheck className="h-3.5 w-3.5" />}
            모두 읽음
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500" aria-live="polite">읽지 않은 알림 <span className="font-semibold text-violet-600">{unreadCount}개</span></p>
        <div role="tablist" aria-label="알림 종류" className="mt-4 flex gap-1 pb-3">
          {NOTIFICATION_CATEGORIES.map((tab, index) => (
            <button key={tab.id} type="button" role="tab" id={`${id}-${tab.id}`} aria-controls={`${id}-list`}
              aria-selected={category === tab.id} tabIndex={category === tab.id ? 0 : -1}
              onClick={() => changeCategory(tab.id)}
              onKeyDown={(event) => {
                const next = event.key === 'ArrowRight' ? (index + 1) % 5 : event.key === 'ArrowLeft' ? (index + 4) % 5
                  : event.key === 'Home' ? 0 : event.key === 'End' ? 4 : null;
                if (next === null) return;
                event.preventDefault();
                changeCategory(NOTIFICATION_CATEGORIES[next].id);
                document.getElementById(`${id}-${NOTIFICATION_CATEGORIES[next].id}`)?.focus();
              }}
              className={`flex h-8 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md px-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${category === tab.id ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-y border-slate-100 px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-pressed={managing} disabled={busy || (!managing && visible.length === 0)}
            onClick={() => { setManaging(!managing); setSelected(new Set()); }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            <CheckSquare2 className="h-3.5 w-3.5" />{managing ? '선택 취소' : '선택 관리'}
          </button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="알림 더보기" disabled={busy}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem disabled={notifications.length === 0} onSelect={() => remove.mutate('read')}>
                <CheckCheck className="h-4 w-4" />읽은 알림 삭제
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={notifications.length === 0} onSelect={deleteAll} className="text-red-600 focus:text-red-600">
                <Trash2 className="h-4 w-4" />전체 삭제
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {managing && (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 pb-1 text-xs">
            <label className="flex min-h-8 cursor-pointer items-center gap-2 text-slate-600">
              <Checkbox aria-label="표시된 알림 전체 선택" disabled={busy || visible.length === 0}
                checked={allSelected ? true : selectedItems.length > 0 ? 'indeterminate' : false}
                onCheckedChange={(checked) => setSelected(checked === true ? new Set(visible.map(notificationKey)) : new Set())} />
              {selectedItems.length}개 선택
            </label>
            <div className="flex gap-1">
              <button type="button" disabled={busy || !hasSelectedUnread} onClick={() => markRead.mutate(selectedItems)}
                className="h-8 rounded-md px-2 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">선택 읽음</button>
              <button type="button" disabled={busy || selectedItems.length === 0}
                onClick={() => remove.mutate(selectedItems, { onSuccess: () => setSelected(new Set()) })}
                title="선택한 알림을 이 브라우저에서 삭제"
                className="h-8 rounded-md px-2 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40">선택 삭제</button>
            </div>
          </div>
        )}
      </div>

      {query.data?.server_unavailable && <p role="status" className="border-b border-slate-100 px-4 py-2 text-xs text-amber-700">일부 알림을 불러오지 못했습니다. 저장된 알림을 표시합니다.</p>}
      <div role="tabpanel" id={`${id}-list`} aria-labelledby={`${id}-${category}`} className={full ? '' : 'max-h-[min(420px,50vh)] overflow-y-auto overscroll-contain'}>
        {query.isLoading ? <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500"><Spinner size="xs" />알림을 불러오는 중...</div>
          : query.isError ? <div className="px-4 py-8 text-sm text-red-600">알림을 불러오지 못했습니다.<button type="button" onClick={() => void query.refetch()} className="ml-2 underline">다시 시도</button></div>
          : visible.length === 0 ? <p className="px-4 py-10 text-center text-sm text-slate-400">{category === 'all' ? '새 알림이 없습니다.' : `${NOTIFICATION_CATEGORIES.find((tab) => tab.id === category)?.label} 알림이 없습니다.`}</p>
          : <ul className="divide-y divide-slate-100/80">
            {visible.map((item) => {
              const kind = kinds[notificationKind(item)];
              const Icon = kind.icon;
              const context = notificationContext(item);
              const unread = !item.read_at;
              return (
                <li key={notificationKey(item)} className={`flex items-start ${unread ? 'bg-violet-50/30' : ''}`}>
                  {managing && <div className="pl-4 pt-4"><Checkbox aria-label={`알림 선택: ${item.title}`} checked={selected.has(notificationKey(item))} disabled={busy} onCheckedChange={() => toggleItem(item)} /></div>}
                  <button type="button" aria-label={`${managing ? '선택 전환' : '알림 읽기'}: ${item.title}`} disabled={busy}
                    onClick={() => managing ? toggleItem(item) : !item.read_at && markRead.mutate(item)}
                    className={`flex min-w-0 flex-1 items-start gap-2.5 py-3.5 text-left transition hover:bg-slate-100/60 ${managing ? 'pl-3 pr-1' : 'pl-4 pr-1'}`}>
                    {!managing && <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${unread ? 'bg-violet-500' : 'bg-transparent'}`} />}
                    <span className="min-w-0 flex-1">
                      <span className={`mb-1 flex items-center gap-1.5 text-[11px] font-semibold ${kind.color}`}><Icon className="h-3.5 w-3.5" />{kind.label}</span>
                      <span className={`block break-words text-sm leading-5 ${unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-600'}`}>{item.title}</span>
                      {item.body && item.body !== item.title && <span className="mt-1 line-clamp-2 block break-words text-xs leading-5 text-slate-500">{item.body}</span>}
                      {context && <span className="mt-1 block truncate text-xs text-slate-500">{context}</span>}
                      <time dateTime={item.created_at} title={item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : undefined} className="mt-1.5 block text-[11px] text-slate-400">{notificationTime(item.created_at, now)}</time>
                    </span>
                  </button>
                  <button type="button" aria-label={`알림 삭제: ${item.title}`} title="이 브라우저에서 삭제" disabled={busy} onClick={() => remove.mutate(item)}
                    className="mr-2 mt-7 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-40">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>}
      </div>
      {full && visible.length < filtered.length && <div className="border-t border-slate-100 p-4 text-center"><button type="button" onClick={() => setVisibleCount((count) => count + 50)} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">알림 더 보기 ({filtered.length - visible.length}개)</button></div>}
      {!full && <Link to="/notifications" onClick={onNavigate} className="flex h-12 items-center justify-center gap-1.5 border-t border-slate-100 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-violet-600">전체 알림 보기 <ArrowRight className="h-3.5 w-3.5" /></Link>}
    </section>
  );
}
