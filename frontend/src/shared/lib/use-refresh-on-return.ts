import { useEffect, useState } from 'react';

/** Обновление по возвращению пользователя, без фонового опроса. */
export function useRefreshOnReturn(enabled = true): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let lastRefresh = 0;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      // focus и visibilitychange могут приходить вместе при одном возвращении.
      if (now - lastRefresh < 250) return;
      lastRefresh = now;
      setRevision((current) => current + 1);
    };
    const onOnline = () => {
      lastRefresh = 0;
      refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled]);
  return revision;
}
