import { useEffect, useState } from 'react';
import { fetchUnreadCount } from '../api/notification-api';

export function useUnreadCount(
  enabled: boolean,
  revision: number,
): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const next = await fetchUnreadCount(controller.signal);
        if (!controller.signal.aborted) setCount(next);
      } catch {
        // Keep the last known count until the next refresh.
      } finally {
        pending = false;
      }
    }
    const requestCount = () => void refresh();
    requestCount();
    const timer = window.setInterval(requestCount, 30_000);
    document.addEventListener('visibilitychange', requestCount);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', requestCount);
    };
  }, [enabled, revision]);

  return enabled ? count : null;
}
