import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchNotifications,
  formatNotificationDate,
  getNotificationInvitationPath,
  markNotificationRead,
  NotificationIcon,
  unreadNotificationClass,
  type UserNotification,
} from '@/entities/notification';

const focusClass =
  'tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-(--contrast)';
const buttonClass = `tw:rounded-full tw:border tw:border-solid tw:border-(--line) tw:bg-transparent tw:px-[14px] tw:py-[8px] tw:text-[13px] tw:font-semibold tw:[font-family:inherit] tw:text-(--text) tw:cursor-pointer tw:hover:bg-(--surface) tw:disabled:opacity-50 tw:disabled:cursor-default ${focusClass}`;

interface NotificationsPageProps {
  demoItems?: readonly UserNotification[];
  previewRevision?: number;
  onRead: (id: string) => void;
  onRefresh: () => void;
}

export function NotificationsPage({
  demoItems,
  previewRevision = 0,
  onRead,
  onRefresh,
}: NotificationsPageProps) {
  const demo = demoItems !== undefined;
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof fetchNotifications>
  > | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [readError, setReadError] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    void fetchNotifications(page, unreadOnly, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setResult(response);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadError(true);
      });
    return () => controller.abort();
  }, [demo, page, reload, unreadOnly, previewRevision]);

  const shownDemoItems = unreadOnly
    ? demoItems?.filter((item) => !item.read)
    : demoItems;
  const items = shownDemoItems ?? result?.items;
  const total = shownDemoItems?.length ?? result?.total;
  const canGoNext = !demo && Boolean(result?.has_next);

  function clearList() {
    setResult(null);
    setLoadError(false);
    setReadError(false);
  }

  function refreshList() {
    clearList();
    setReload((value) => value + 1);
    onRefresh();
  }

  function changePage(next: number) {
    clearList();
    setPage(next);
  }

  function changeFilter(next: boolean) {
    if (next === unreadOnly) return;
    clearList();
    setPage(1);
    setUnreadOnly(next);
  }

  async function markRead(notification: UserNotification) {
    if (notification.read || pendingId) return;
    if (demo) {
      onRead(notification.id);
      return;
    }

    setPendingId(notification.id);
    setReadError(false);
    try {
      const updated = await markNotificationRead(notification.id);
      onRead(notification.id);
      if (unreadOnly) {
        clearList();
        if (page > 1 && result?.items.length === 1) {
          setPage(page - 1);
        }
        setReload((value) => value + 1);
      } else {
        setResult(
          (current) =>
            current && {
              ...current,
              items: current.items.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            },
        );
      }
    } catch {
      setReadError(true);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="tw:w-full tw:text-(--text)">
      <div className="tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-[12px]">
        <div>
          <h1 className="tw:m-0 tw:text-[clamp(1rem,2.5vw,2rem)] tw:leading-[1.3] tw:text-(--heading)">
            Уведомления
          </h1>
          <p className="tw:mt-[8px] tw:mb-0 tw:text-[14px] tw:leading-[1.5] tw:text-(--muted)">
            Приглашения на курсы и в организации
          </p>
        </div>
        {demo && (
          <span className="tw:rounded-full tw:border tw:border-solid tw:border-(--line) tw:px-[12px] tw:py-[6px] tw:text-[12px] tw:text-(--muted)">
            Демо
          </span>
        )}
      </div>
      <div className="tw:mt-[24px] tw:flex tw:flex-wrap tw:items-end tw:justify-between tw:gap-x-[12px] tw:border-0 tw:border-b tw:border-solid tw:border-(--line)">
        <div
          role="group"
          aria-label="Фильтр уведомлений"
          className="tw:flex tw:flex-wrap tw:gap-[6px]"
        >
          {([false, true] as const).map((filter) => (
            <button
              key={String(filter)}
              type="button"
              aria-pressed={unreadOnly === filter}
              disabled={pendingId !== null}
              onClick={() => changeFilter(filter)}
              className={`tw:min-h-[44px] tw:border-0 tw:border-b-2 tw:border-solid tw:border-transparent tw:bg-transparent tw:px-[12px] tw:text-[14px] tw:font-semibold tw:[font-family:inherit] tw:text-(--muted) tw:cursor-pointer tw:hover:text-(--heading) tw:aria-pressed:border-(--contrast) tw:aria-pressed:text-(--heading) ${focusClass}`}
            >
              {filter ? 'Непрочитанные' : 'Все'}
            </button>
          ))}
        </div>
        {!demo && (
          <button
            type="button"
            onClick={refreshList}
            disabled={pendingId !== null || (!loadError && !items)}
            className={`${buttonClass} tw:mb-[6px]`}
          >
            Обновить
          </button>
        )}
      </div>
      <div className="tw:mt-[20px] tw:overflow-hidden tw:rounded-[20px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--panel-bg)">
        {total !== undefined && (
          <div className="tw:border-0 tw:border-b tw:border-solid tw:border-(--line) tw:bg-(--surface) tw:px-[18px] tw:py-[14px] tw:text-[13px] tw:text-(--muted)">
            Всего: {total}
          </div>
        )}
        {loadError ? (
          <div className="tw:px-[18px] tw:py-[24px]">
            <p role="status" className="tw:mt-0 tw:text-[14px]">
              Не удалось загрузить уведомления.
            </p>
            <button type="button" className={buttonClass} onClick={refreshList}>
              Повторить
            </button>
          </div>
        ) : !items ? (
          <p
            role="status"
            className="tw:m-0 tw:px-[18px] tw:py-[24px] tw:text-[14px] tw:text-(--muted)"
          >
            Загрузка…
          </p>
        ) : items.length === 0 ? (
          <div className="tw:grid tw:justify-items-center tw:px-[16px] tw:py-[56px] tw:text-center">
            <span className="tw:mb-[16px] tw:grid tw:size-[52px] tw:place-items-center tw:rounded-[16px] tw:bg-(--surface) tw:text-(--muted)">
              <NotificationIcon size={24} />
            </span>
            <strong className="tw:text-(--heading)">
              {unreadOnly
                ? 'Нет непрочитанных уведомлений'
                : 'Уведомлений пока нет'}
            </strong>
            {!unreadOnly && (
              <p className="tw:mt-[8px] tw:mb-0 tw:text-[14px] tw:text-(--muted)">
                Здесь появятся ваши приглашения.
              </p>
            )}
          </div>
        ) : (
          <ul className="tw:m-0 tw:list-none tw:p-0">
            {items.map((notification) => {
              const actionPath = getNotificationInvitationPath(notification);
              const detailColor = notification.read
                ? 'tw:text-(--muted)'
                : 'tw:text-(--text)';
              return (
                <li
                  key={notification.id}
                  className={`tw:flex tw:flex-wrap tw:items-start tw:justify-between tw:gap-[14px] tw:border-0 tw:border-solid tw:border-(--line) tw:px-[18px] tw:py-[16px] tw:not-first:border-t ${notification.read ? '' : unreadNotificationClass}`}
                >
                  <div className="tw:flex tw:min-w-0 tw:items-start tw:gap-[12px]">
                    <span
                      className={`tw:grid tw:size-[40px] tw:shrink-0 tw:place-items-center tw:rounded-[12px] ${notification.read ? 'tw:bg-(--surface) tw:text-(--muted)' : 'tw:bg-(--contrast) tw:text-(--text-solid)'}`}
                    >
                      <NotificationIcon size={19} type={notification.type} />
                    </span>
                    <div className="tw:min-w-0 tw:[overflow-wrap:anywhere]">
                      <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-x-[8px] tw:gap-y-[4px]">
                        <h2 className="tw:m-0 tw:text-[15px] tw:leading-[1.45] tw:tracking-normal">
                          {notification.title}
                        </h2>
                        {!notification.read && (
                          <span className="tw:rounded-full tw:bg-(--ink-accent) tw:px-[7px] tw:py-[2px] tw:text-[11px] tw:font-semibold tw:text-(--panel-bg)">
                            Новое
                          </span>
                        )}
                      </div>
                      <p
                        className={`tw:my-[4px] tw:text-[14px] tw:leading-[1.5] ${detailColor}`}
                      >
                        {notification.message}
                      </p>
                      <time
                        dateTime={notification.created_at || undefined}
                        className={`tw:text-[12px] ${detailColor}`}
                      >
                        {formatNotificationDate(notification.created_at)}
                      </time>
                    </div>
                  </div>
                  <div className="tw:flex tw:flex-wrap tw:items-center tw:gap-[8px]">
                    {actionPath && (
                      <Link
                        to={actionPath}
                        onClick={() => void markRead(notification)}
                        className={`tw:rounded-full tw:bg-(--contrast) tw:px-[14px] tw:py-[8px] tw:text-[13px] tw:font-semibold tw:text-(--text-solid) tw:no-underline ${focusClass}`}
                      >
                        Открыть приглашение
                      </Link>
                    )}
                    <button
                      type="button"
                      aria-disabled={notification.read || pendingId !== null}
                      className={`${buttonClass} tw:aria-disabled:cursor-default tw:aria-disabled:text-(--muted) tw:aria-disabled:hover:bg-transparent`}
                      onClick={() => void markRead(notification)}
                    >
                      {notification.read
                        ? 'Прочитано'
                        : pendingId === notification.id
                          ? 'Сохраняем…'
                          : 'Отметить прочитанным'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {readError && (
          <p
            role="status"
            className="tw:m-0 tw:px-[18px] tw:pb-[14px] tw:text-[13px] tw:text-(--muted)"
          >
            Не удалось отметить уведомление прочитанным.
          </p>
        )}
        {!loadError && (page > 1 || canGoNext) && (
          <div className="tw:flex tw:flex-wrap tw:justify-between tw:gap-[8px] tw:border-0 tw:border-t tw:border-solid tw:border-(--line) tw:p-[12px]">
            <button
              type="button"
              className={buttonClass}
              disabled={page === 1 || !items || pendingId !== null}
              onClick={() => changePage(page - 1)}
            >
              Новее
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!canGoNext || pendingId !== null}
              onClick={() => changePage(page + 1)}
            >
              Старее
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
