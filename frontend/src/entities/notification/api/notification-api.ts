import { requestJson } from '@/shared/api';
import type { UserNotification } from '../model/types';

const backgroundRequest = { clearOnUnauthorized: false };

export function fetchNotifications(
  page: number,
  unreadOnly: boolean,
  signal: AbortSignal,
  size = 10,
) {
  return requestJson<{
    items: UserNotification[];
    total: number;
    has_next: boolean;
  }>(
    `/notifications?page=${page}&size=${size}&unread_only=${unreadOnly}`,
    { signal },
    backgroundRequest,
  );
}

export async function fetchUnreadCount(signal: AbortSignal) {
  const { unread_count } = await requestJson<{ unread_count: number | null }>(
    '/notifications/unread-count',
    { signal },
    backgroundRequest,
  );
  return unread_count ?? 0;
}

export function markNotificationRead(id: string) {
  return requestJson<UserNotification>(
    `/notifications/${encodeURIComponent(id)}/read`,
    { method: 'PATCH' },
    backgroundRequest,
  );
}
