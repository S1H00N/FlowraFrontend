import AppShell from '@/components/AppShell';
import NotificationInbox from '@/components/NotificationInbox';

export default function Notifications() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <NotificationInbox full />
        </div>
      </div>
    </AppShell>
  );
}
