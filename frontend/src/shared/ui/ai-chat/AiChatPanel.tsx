import { CHAT_DOCK_EVENT } from './use-chat-dock-space';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { ChatIconButton } from './ChatParts';
import { IconClose, IconCollapse, IconExpand } from './icons';

/*
 * Панель ИИ-чата у правого края экрана — как панель DIOS AI:
 * ширину тянут за левый край (360 px … вся ширина окна, запоминается),
 * «Развернуть» — всё окно, Esc сворачивает или закрывает.
 * Общая раскладка страницы резервирует место для всех панелей.
 * На узком экране (≤ 1024 px) панель занимает всю ширину.
 */
const WIDTH_KEY = 'ai-chat-panel-width';
const MIN_WIDTH = 360;
const DEFAULT_WIDTH = 440;
const HANDLE_WIDTH = 6;
const RESIZE_STEP = 16;
const WIDE_RESIZE_STEP = 48;
const WIDE_QUERY = '(min-width: 1025px)';
const OPEN_EVENT = 'ai-chat-panel:open';

const clampWidth = (value: number) => {
  const max = Math.max(MIN_WIDTH, window.innerWidth - HANDLE_WIDTH);
  return Math.round(Math.min(Math.max(value, MIN_WIDTH), max));
};

function readStoredWidth() {
  try {
    const value = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_WIDTH ? value : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

function storeWidth(value: number) {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(Math.round(value)));
  } catch {
    // localStorage недоступен (приватный режим) — ширина просто не запомнится.
  }
}

const matchesWide = () =>
  typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches;

export interface AiChatPanelProps {
  open: boolean;
  onClose: () => void;
  /** Метка контекста: «Урок 1.2», «Редактирование», «Новый модуль». */
  tag?: string;
  /** О чём диалог — вместо имени агента. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Кнопки шапки перед «Развернуть» и «Закрыть» (например, «Новый диалог»). */
  headerActions?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
  /** Куда поставить фокус при открытии (обычно поле ввода). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  closeLabel?: string;
}

/** Выдвижная панель ИИ-чата справа: одна на экран, ресайз, развернуть, Esc. */
export function AiChatPanel({
  open,
  onClose,
  tag,
  title,
  subtitle,
  headerActions,
  children,
  id,
  className = '',
  initialFocusRef,
  closeLabel = 'Закрыть чат',
}: AiChatPanelProps) {
  const reactId = useId();
  const panelId = id || `ai-chat-panel-${reactId.replace(/:/g, '')}`;
  const titleId = `${panelId}-title`;
  const [expanded, setExpanded] = useState(false);
  const [isWide, setIsWide] = useState(matchesWide);
  const [width, setWidth] = useState(readStoredWidth);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const widthRef = useRef(width);
  widthRef.current = width;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const docked = open && isWide && !expanded;
  const currentWidth =
    typeof window === 'undefined' ? width : clampWidth(width);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(CHAT_DOCK_EVENT, {
        detail: {
          id: panelId,
          width: docked ? currentWidth + HANDLE_WIDTH + 16 : 0,
        },
      }),
    );
  }, [currentWidth, docked, panelId]);

  useEffect(
    () => () => {
      window.dispatchEvent(
        new CustomEvent(CHAT_DOCK_EVENT, {
          detail: { id: panelId, width: 0 },
        }),
      );
    },
    [panelId],
  );

  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const handleChange = (event: MediaQueryListEvent) =>
      setIsWide(event.matches);
    setIsWide(media.matches);
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  // Одна панель на экран: открытие новой закрывает остальные.
  useEffect(() => {
    if (!open) return undefined;
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: panelId }));
    const handleOtherOpen = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== panelId)
        onCloseRef.current();
    };
    window.addEventListener(OPEN_EVENT, handleOtherOpen);
    return () => window.removeEventListener(OPEN_EVENT, handleOtherOpen);
  }, [open, panelId]);

  useEffect(() => {
    if (!open) return undefined;
    const handleResize = () => setWidth((value) => clampWidth(value));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [open]);

  // Фокус: в поле ввода при открытии, обратно на кнопку открытия при закрытии.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const frame = window.requestAnimationFrame(() => {
      const target = initialFocusRef?.current || panelRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (
        previous &&
        document.contains(previous) &&
        panel?.contains(document.activeElement)
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [initialFocusRef, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Поверх панели открыт модальный диалог — Esc закрывает его, а не чат.
      const modal = Array.from(
        document.querySelectorAll('[aria-modal="true"]'),
      ).some((element) => !panelRef.current?.contains(element));
      if (modal) return;
      if (expandedRef.current) setExpanded(false);
      else onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!isResizing) return undefined;
    const { body } = document;
    const previousCursor = body.style.cursor;
    const previousSelect = body.style.userSelect;
    body.style.cursor = 'col-resize';
    body.style.userSelect = 'none';
    const handleMove = (event: PointerEvent) => {
      event.preventDefault();
      setWidth(
        clampWidth(window.innerWidth - event.clientX - HANDLE_WIDTH / 2),
      );
    };
    const stop = () => setIsResizing(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => {
      body.style.cursor = previousCursor;
      body.style.userSelect = previousSelect;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('blur', stop);
      storeWidth(widthRef.current);
    };
  }, [isResizing]);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      setIsResizing(true);
    },
    [],
  );

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.shiftKey ? WIDE_RESIZE_STEP : RESIZE_STEP;
    const next = clampWidth(
      widthRef.current + (event.key === 'ArrowLeft' ? step : -step),
    );
    setWidth(next);
    storeWidth(next);
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      {expanded ? (
        <div
          className="ai-chat-backdrop tw:fixed tw:inset-0 tw:z-[55] tw:bg-[rgba(20,16,12,0.55)] tw:backdrop-blur-[2px] tw:animate-app-modal-fade"
          onClick={() => setExpanded(false)}
          aria-hidden="true"
        />
      ) : null}
      <div
        className={`ai-chat-dock tw:fixed tw:top-0 tw:right-0 tw:bottom-0 tw:z-[56] tw:flex tw:pointer-events-none ${expanded ? 'tw:w-full' : 'tw:max-1024:w-full'}`}
      >
        {docked ? (
          <div
            className="ai-chat-resizer tw:relative tw:flex tw:w-[6px] tw:shrink-0 tw:cursor-col-resize tw:pointer-events-auto tw:bg-transparent tw:outline-none tw:focus-visible:bg-[rgba(203,170,203,0.6)] tw:[&:hover>span]:bg-(--cta) tw:[&.is-active>span]:bg-(--cta)"
            role="separator"
            tabIndex={0}
            aria-label="Изменить ширину чата"
            aria-orientation="vertical"
            aria-controls={panelId}
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={Math.max(
              MIN_WIDTH,
              window.innerWidth - HANDLE_WIDTH,
            )}
            aria-valuenow={currentWidth}
            title="Потяните, чтобы изменить ширину"
            onPointerDown={startResize}
            onKeyDown={resizeWithKeyboard}
            data-active={isResizing || undefined}
          >
            <span
              className={`tw:absolute tw:top-1/2 tw:left-1/2 tw:-translate-x-1/2 tw:-translate-y-1/2 tw:h-[44px] tw:w-[4px] tw:rounded-full tw:transition-colors ${isResizing ? 'tw:bg-(--cta)' : 'tw:bg-(--line)'}`}
              aria-hidden="true"
            />
            <span
              className="tw:absolute tw:inset-y-0 tw:-left-[6px] tw:-right-[6px]"
              aria-hidden="true"
            />
          </div>
        ) : null}
        <section
          ref={panelRef}
          id={panelId}
          className={`ai-chat-panel tw:relative tw:flex tw:flex-col tw:h-full tw:min-w-0 tw:pointer-events-auto tw:outline-none tw:bg-[#f8f5ef] tw:dark:bg-[#333333] tw:text-(--text) tw:[border-left:1px_solid_var(--line)] tw:shadow-[-18px_0_48px_rgba(43,32,20,0.14)] tw:dark:shadow-[-18px_0_48px_rgba(0,0,0,0.42)] tw:animate-ai-panel-in tw:motion-reduce:animate-none ${expanded || !isWide ? 'tw:w-full' : ''} ${className}`}
          style={docked ? { width: currentWidth } : undefined}
          role="dialog"
          aria-modal={expanded || !isWide ? 'true' : undefined}
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <header className="ai-chat-head tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:shrink-0 tw:min-h-[56px] tw:py-[10px] tw:pr-[10px] tw:pl-[16px] tw:[border-bottom:1px_solid_var(--line)]">
            <div className="tw:flex tw:items-center tw:gap-[8px] tw:min-w-0">
              {tag ? (
                <span className="ai-chat-tag tw:shrink-0 tw:rounded-[7px] tw:px-[7px] tw:py-[3px] tw:text-[11px] tw:font-semibold tw:leading-[1.3] tw:bg-[#ecdfe8] tw:text-[#5e4d5e] tw:dark:bg-[#4a424a] tw:dark:text-[#ead9ea]">
                  {tag}
                </span>
              ) : null}
              <div className="tw:min-w-0">
                <h2
                  id={titleId}
                  className="ai-chat-title tw:m-0 tw:text-[13.5px] tw:leading-[1.35] tw:font-semibold tw:text-(--heading) tw:truncate"
                >
                  {title || 'ИИ-чат'}
                </h2>
                {subtitle ? (
                  <p className="tw:m-0! tw:text-[12px]! tw:leading-[1.4]! tw:text-(--muted) tw:truncate">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="tw:flex tw:items-center tw:gap-[2px] tw:shrink-0">
              {headerActions}
              {isWide ? (
                <ChatIconButton
                  label={expanded ? 'Свернуть' : 'Развернуть на весь экран'}
                  onClick={() => setExpanded((value) => !value)}
                  aria-pressed={expanded}
                >
                  {expanded ? <IconCollapse /> : <IconExpand />}
                </ChatIconButton>
              ) : null}
              <ChatIconButton
                label={closeLabel}
                className="ai-chat-close"
                onClick={onClose}
              >
                <IconClose />
              </ChatIconButton>
            </div>
          </header>
          <div className="ai-chat-body tw:relative tw:flex tw:flex-col tw:flex-1 tw:min-h-0">
            {children}
            {isResizing ? (
              <div
                className="tw:absolute tw:inset-0 tw:z-10 tw:cursor-col-resize"
                aria-hidden="true"
              />
            ) : null}
          </div>
        </section>
      </div>
    </>,
    document.querySelector('.page') || document.body,
  );
}
