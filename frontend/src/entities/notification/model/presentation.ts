import type { UserNotification } from './types';

export const unreadNotificationClass =
  'tw:shadow-[inset_3px_0_var(--ink-accent)] tw:bg-[color-mix(in_srgb,var(--contrast)_36%,var(--panel-bg))]';

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const relativeDate = new Intl.RelativeTimeFormat('ru-RU', {
  numeric: 'auto',
  style: 'short',
});

export function formatNotificationDate(value: string, relative = false) {
  if (!value) return 'Только что';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (relative && minutes >= 0 && minutes < 2 * 1440) {
    if (minutes === 0) return 'Только что';
    if (minutes < 60) return relativeDate.format(-minutes, 'minute');
    if (minutes < 1440)
      return relativeDate.format(-Math.floor(minutes / 60), 'hour');
    return relativeDate.format(-1, 'day');
  }
  return dateFormat.format(date);
}

export function getNotificationInvitationPath(
  notification: UserNotification,
): string | null {
  const rawUrl = notification.data?.url;
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl, window.location.origin);
    if (
      url.origin === window.location.origin &&
      /^\/(?:courses\/invitations\/accept|organizations\/invitations\/accept|auth\/invite\/accept)\/[\w-]+$/.test(
        url.pathname,
      )
    ) {
      return url.pathname;
    }
  } catch {
    // An invalid URL leaves the notification available as text.
  }
  return null;
}
