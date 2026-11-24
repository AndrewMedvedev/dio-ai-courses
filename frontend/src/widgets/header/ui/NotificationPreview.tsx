import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  fetchNotifications,
  formatNotificationDate,
  getNotificationInvitationPath,
  markNotificationRead,
  NotificationIcon,
  unreadNotificationClass,
  type UserNotification,
} from '@/entities/notification';

interface NotificationPreviewProps {
  href: string;
  count: number | null;
  demoItems?: readonly UserNotification[];
  onRead?: (id: string) => void;
  buttonClass: string;
}

const focusClass =
  'tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-(--contrast)';

export function NotificationPreview({
  href,
  count,
  demoItems,
  onRead,
  buttonClass,
}: NotificationPreviewProps) {
  const id = useId();
  const { key: locationKey } = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const previousCount = useRef<number | null>(null);
  const [ring, setRing] = useState(0);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [items, setItems] = useState<UserNotification[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const open = openedAt === locationKey;
  const demo = demoItems !== undefined;
  const notifications = demoItems ?? items;
  const badge = (count ?? 0) > 99 ? '99+' : count;

  useEffect(() => {
    setOpenedAt(null);
  }, [locationKey]);

  useEffect(() => {
    if (
      count !== null &&
      previousCount.current !== null &&
      count > previousCount.current
    ) {
      setRing((value) => value + 1);
    }
    previousCount.current = count;
  }, [count]);

  useEffect(() => {
    if (!open || demo) return;
    const controller = new AbortController();
    void fetchNotifications(1, false, controller.signal, 3)
      .then((result) => {
        if (!controller.signal.aborted) {
          setItems(result.items);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [open, count, demo, retry]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent | FocusEvent) {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        setOpenedAt(null);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpenedAt(null);
      trigger.current?.focus();
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  async function read(notification: UserNotification) {
    if (notification.read || pending) return;
    if (demo) {
      onRead?.(notification.id);
      return;
    }
    setPending(notification.id);
    setReadError(false);
    try {
      const updated = await markNotificationRead(notification.id);
      setItems(
        (current) =>
          current?.map((item) => (item.id === updated.id ? updated : item)) ??
          null,
      );
      onRead?.(notification.id);
    } catch {
      setReadError(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <div ref={root} className="tw:relative tw:shrink-0">
      <button
        ref={trigger}
        type="button"
        title="Уведомления"
        aria-label={
          badge ? `Уведомления, непрочитанных: ${badge}` : 'Уведомления'
        }
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={`${buttonClass} tw:aria-expanded:bg-(--surface) ${badge ? 'tw:text-(--ink-accent)' : ''}`}
        onClick={() => {
          setLoadError(false);
          setReadError(false);
          setOpenedAt(open ? null : locationKey);
        }}
      >
        <span
          key={ring}
          className={`tw:grid tw:origin-top tw:place-items-center ${ring ? 'tw:animate-notification-ring tw:motion-reduce:animate-none' : ''}`}
        >
          <NotificationIcon />
        </span>
        {badge ? (
          <span
            className="tw:absolute tw:-top-[2px] tw:-right-[3px] tw:grid tw:h-[18px] tw:min-w-[18px] tw:place-items-center tw:rounded-full tw:border-2 tw:border-solid tw:border-(--navigation-bg) tw:bg-(--contrast) tw:px-[3px] tw:text-[10px] tw:font-bold tw:leading-none tw:text-(--text-solid)"
            aria-hidden="true"
          >
            {badge}
          </span>
        ) : null}
      </button>
      {open && (
        <section
          id={id}
          aria-labelledby={`${id}-title`}
          className="tw:absolute tw:top-[calc(100%+12px)] tw:-right-[4px] tw:flex tw:max-h-[calc(100dvh-84px)] tw:w-[420px] tw:flex-col tw:rounded-[18px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--panel-bg) tw:shadow-[0_12px_28px_#0005] tw:max-760:fixed tw:max-760:top-[60px] tw:max-760:right-[12px] tw:max-760:left-[88px] tw:max-760:w-auto"
        >
          <span
            aria-hidden="true"
            className="tw:absolute tw:-top-[5px] tw:right-[16px] tw:size-[8px] tw:rotate-45 tw:border-0 tw:border-t tw:border-l tw:border-solid tw:border-(--line) tw:bg-(--panel-bg) tw:max-760:hidden"
          />
          <div className="tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[6px] tw:px-[16px] tw:py-[13px]">
            <h2
              id={`${id}-title`}
              className="tw:m-0 tw:text-[18px] tw:leading-[1.3]"
            >
              Уведомления
            </h2>
            {badge ? (
              <span className="tw:rounded-full tw:bg-(--surface) tw:px-[8px] tw:py-[4px] tw:text-[12px] tw:text-(--ink-accent)">
                {badge} {count === 1 ? 'новое' : 'новых'}
              </span>
            ) : null}
          </div>
          <div className="tw:min-h-0 tw:overflow-y-auto tw:border-0 tw:border-y tw:border-solid tw:border-(--line)">
            {loadError ? (
              <div className="tw:px-[16px] tw:py-[12px]">
                <p
                  role="status"
                  className="tw:m-0 tw:text-[14px] tw:text-(--muted)"
                >
                  Не удалось загрузить уведомления.
                </p>
                <button
                  type="button"
                  className={`tw:mt-[8px] tw:rounded-[6px] tw:border-0 tw:bg-transparent tw:p-[3px] tw:text-(--ink-accent) tw:cursor-pointer ${focusClass}`}
                  onClick={() => {
                    setLoadError(false);
                    setRetry((value) => value + 1);
                  }}
                >
                  Повторить
                </button>
              </div>
            ) : !notifications?.length ? (
              <p
                role="status"
                className="tw:m-0 tw:px-[16px] tw:py-[16px] tw:text-[14px] tw:text-(--muted)"
              >
                {notifications ? 'Уведомлений пока нет.' : 'Загрузка…'}
              </p>
            ) : (
              <ul className="tw:m-0 tw:list-none tw:p-0">
                {notifications.map((notification) => {
                  const path = getNotificationInvitationPath(notification);
                  const date = formatNotificationDate(
                    notification.created_at,
                    true,
                  );
                  const rowClass = `tw:flex tw:min-h-[78px] tw:w-full tw:items-start tw:gap-[11px] tw:border-0 tw:px-[14px] tw:py-[11px] tw:text-left tw:no-underline tw:[font:inherit] tw:text-(--text) ${notification.read ? 'tw:bg-transparent' : unreadNotificationClass} tw:hover:bg-(--surface) ${focusClass}`;
                  const detailColor = notification.read
                    ? 'tw:text-(--muted)'
                    : 'tw:text-(--text)';
                  const content = (
                    <>
                      <span
                        className={`tw:grid tw:size-[36px] tw:shrink-0 tw:place-items-center tw:rounded-[10px] ${notification.read ? 'tw:bg-(--surface) tw:text-(--muted)' : 'tw:bg-(--contrast) tw:text-(--text-solid)'}`}
                      >
                        <NotificationIcon size={18} type={notification.type} />
                      </span>
                      <span className="tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:gap-[3px] tw:[overflow-wrap:anywhere]">
                        <strong className="tw:text-[14px] tw:leading-[1.3]">
                          {notification.title}
                        </strong>
                        <span
                          className={`tw:line-clamp-2 tw:text-[13px] tw:leading-[1.35] ${detailColor}`}
                        >
                          {notification.message}
                        </span>
                        {date && (
                          <time
                            dateTime={notification.created_at || undefined}
                            className={`tw:text-[11px] ${detailColor}`}
                          >
                            {date}
                          </time>
                        )}
                      </span>
                      {!notification.read && (
                        <span className="tw:mt-[5px] tw:size-[7px] tw:shrink-0 tw:rounded-full tw:bg-(--ink-accent)">
                          <span className="tw:sr-only">Непрочитанное</span>
                        </span>
                      )}
                    </>
                  );
                  return (
                    <li
                      key={notification.id}
                      className="tw:border-0 tw:border-solid tw:border-(--line) tw:not-first:border-t"
                    >
                      {path ? (
                        <Link
                          to={path}
                          className={rowClass}
                          onClick={() => {
                            void read(notification);
                            setOpenedAt(null);
                          }}
                        >
                          {content}
                        </Link>
                      ) : notification.read ? (
                        <div className={rowClass}>{content}</div>
                      ) : (
                        <button
                          type="button"
                          className={`${rowClass} tw:cursor-pointer`}
                          disabled={pending !== null}
                          onClick={() => void read(notification)}
                        >
                          {content}
                          <span className="tw:sr-only">
                            Отметить прочитанным
                          </span>
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {readError && (
              <p
                role="status"
                className="tw:px-[16px] tw:text-[13px] tw:text-(--muted)"
              >
                Не удалось отметить уведомление прочитанным.
              </p>
            )}
          </div>
          <div className="tw:p-[8px]">
            <Link
              to={href}
              onClick={() => setOpenedAt(null)}
              className={`tw:flex tw:min-h-[40px] tw:items-center tw:justify-center tw:gap-[8px] tw:rounded-[10px] tw:bg-(--surface) tw:px-[8px] tw:text-center tw:text-[14px] tw:font-semibold tw:text-(--ink-accent) tw:no-underline tw:hover:underline ${focusClass}`}
            >
              Посмотреть все <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
