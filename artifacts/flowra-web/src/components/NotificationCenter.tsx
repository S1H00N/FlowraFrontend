import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationUnreadCount } from '@/hooks/useNotifications';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import NotificationInbox from '@/components/NotificationInbox';

export default function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const unread = useNotificationUnreadCount();
  const count = unread.data ?? 0;
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) void unread.refetch(); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label="알림" title="알림" className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
          <Bell className="h-4 w-4" />
          {count > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-white">{count > 99 ? '99+' : count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(380px,calc(100vw-2rem))] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl shadow-slate-900/10">
        <NotificationInbox onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
