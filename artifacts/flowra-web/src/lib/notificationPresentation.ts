import type { NotificationRecipient } from '@/types';

export const NOTIFICATION_CATEGORIES = [
  { id: 'all', label: '전체' },
  { id: 'schedule', label: '일정' },
  { id: 'task', label: '할 일' },
  { id: 'project', label: '프로젝트' },
  { id: 'notice', label: '공지' },
] as const;
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number]['id'];
export type NotificationKind = Exclude<NotificationCategory, 'all'> | 'general';

export function notificationKey(item: NotificationRecipient) {
  return item.local_only ? `local:${item.local_push_ids?.[0]}` : `server:${item.notification_recipient_id}`;
}

export function notificationKind(item: NotificationRecipient): NotificationKind {
  const data = item.data ?? {};
  for (const value of [data.target_type, data.resource_type, data.entity_type, data.category, item.type]) {
    if (typeof value !== 'string') continue;
    const type = value.toLowerCase();
    if (/project|work_item|work_assignment/.test(type)) return 'project';
    if (/schedule|calendar/.test(type)) return 'schedule';
    if (/task|todo|to_do/.test(type)) return 'task';
    if (/notice|announcement/.test(type)) return 'notice';
  }
  if (data.project_id || data.project_work_item_id) return 'project';
  if (data.task_id) return 'task';
  if (data.schedule_id) return 'schedule';
  if (data.notice_id) return 'notice';
  return 'general';
}

export function notificationContext(item: NotificationRecipient) {
  const data = item.data ?? {};
  const value = (...keys: string[]) => keys.map((key) => data[key])
    .find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
  const kind = notificationKind(item);
  const context = kind === 'project'
    ? [value('project_name', 'project_title'), value('work_item_title', 'task_title', 'target_title')]
    : kind === 'schedule' ? [value('schedule_title', 'target_title')]
    : kind === 'task' ? [value('task_title', 'target_title')]
    : kind === 'notice' ? [value('notice_title', 'target_title')] : [];
  if (kind === 'schedule') {
    const raw = value('start_datetime', 'schedule_start_datetime');
    const date = raw ? new Date(raw) : null;
    if (date && !Number.isNaN(date.getTime())) {
      context.push(date.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' }));
    }
  }
  return [...new Set(context.filter((entry) => entry && entry !== item.title && entry !== item.body))].join(' · ');
}

export function notificationTime(value: string | undefined, now = Date.now()) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor(Math.max(0, now - date.getTime()) / 60_000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const today = new Date(now);
  const dayDifference = Math.round((
    new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  ) / 86_400_000);
  if (dayDifference === 0) return `${Math.floor(minutes / 60)}시간 전`;
  if (dayDifference === 1) return '어제';
  if (dayDifference < 7) return `${dayDifference}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}
