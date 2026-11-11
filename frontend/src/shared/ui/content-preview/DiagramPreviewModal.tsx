import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { MermaidDiagram } from '@/shared/ui/mermaid-diagram';

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const MIN_LABEL_PX = 14;
const FIT_PADDING = 20;
const clamp = (value: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

interface View {
  scale: number;
  x: number;
  y: number;
}

interface DiagramSize {
  width: number;
  height: number;
  fontSize: number;
}

interface Point {
  x: number;
  y: number;
}

/** Перетаскивание одним пальцем/мышью или масштаб двумя пальцами. */
interface Gesture {
  x?: number;
  y?: number;
  view?: View;
  distance?: number;
  scale?: number;
  contentX?: number;
  contentY?: number;
}

export interface DiagramPreviewModalProps {
  chart: string;
  lessonId?: string | null;
  blockId?: string | number | null;
  onClose: () => void;
}

export function DiagramPreviewModal({
  chart,
  lessonId,
  blockId,
  onClose,
}: DiagramPreviewModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const sizeRef = useRef<DiagramSize | null>(null);
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const fitRef = useRef(1);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);
  const backdropPressed = useRef(false);
  const userAdjusted = useRef(false);
  const [view, setView] = useState(viewRef.current);
  const [size, setSize] = useState<DiagramSize | null>(null);
  const [dragging, setDragging] = useState(false);
  const [isDark, setIsDark] = useState(
    () =>
      typeof document !== 'undefined' &&
      Boolean(document.querySelector('.page[data-theme="dark"]')),
  );
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const changeView = useCallback((next: View, fromFit = false) => {
    userAdjusted.current = !fromFit;
    viewRef.current = next;
    setView(next);
  }, []);

  const fit = useCallback(
    (whole?: unknown) => {
      const viewport = viewportRef.current;
      const diagram = sizeRef.current;
      if (!viewport || !diagram) return;
      const availableWidth = Math.max(
        1,
        viewport.clientWidth - FIT_PADDING * 2,
      );
      const availableHeight = Math.max(
        1,
        viewport.clientHeight - FIT_PADDING * 2,
      );
      const fitScale = Math.min(
        availableWidth / diagram.width,
        availableHeight / diagram.height,
      );
      // Подписи при открытии не мельче 14px: если целиком схема не влезает с читаемым
      // текстом, открываем крупнее и даём панорамировать.
      const readableScale = Math.min(
        2,
        MIN_LABEL_PX / Math.max(1, diagram.fontSize),
      );
      // whole === true (кнопка «Вся схема») показывает схему целиком, даже если текст станет мелким.
      const scale = clamp(
        whole === true ? fitScale : Math.max(fitScale, readableScale),
      );
      fitRef.current = scale;
      const place = (viewportSize: number, contentSize: number) =>
        contentSize <= viewportSize - FIT_PADDING * 2
          ? (viewportSize - contentSize) / 2
          : FIT_PADDING;
      changeView(
        {
          scale,
          x: place(viewport.clientWidth, diagram.width * scale),
          y: place(viewport.clientHeight, diagram.height * scale),
        },
        true,
      );
    },
    [changeView],
  );

  const zoomAt = useCallback(
    (scale: number, clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const pointX = clientX - rect.left;
      const pointY = clientY - rect.top;
      const current = viewRef.current;
      const nextScale = clamp(scale);
      changeView({
        scale: nextScale,
        x: pointX - ((pointX - current.x) / current.scale) * nextScale,
        y: pointY - ((pointY - current.y) / current.scale) * nextScale,
      });
    },
    [changeView],
  );

  const zoomCenter = useCallback(
    (factor: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect)
        zoomAt(
          viewRef.current.scale * factor,
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
    },
    [zoomAt],
  );

  const toggleZoom = useCallback(
    (clientX: number, clientY: number) => {
      if (Math.abs(viewRef.current.scale - fitRef.current) < 0.03) {
        zoomAt(Math.max(2, fitRef.current * 2), clientX, clientY);
      } else {
        fit();
      }
    },
    [fit, zoomAt],
  );

  const onRendered = useCallback(
    (svg: SVGSVGElement | null) => {
      if (!svg) return;
      const box = svg.viewBox?.baseVal;
      const width = box?.width || svg.getBBox().width || 800;
      const height = box?.height || svg.getBBox().height || 600;
      const labels = Array.from(svg.querySelectorAll('text, foreignObject'));
      const fontSizes = labels
        .map((label) => parseFloat(getComputedStyle(label).fontSize))
        .filter((value) => value > 0);
      const fontSize = fontSizes.length ? Math.min(...fontSizes) : 14;
      sizeRef.current = { width, height, fontSize };
      setSize(sizeRef.current);
      requestAnimationFrame(fit);
    },
    [fit],
  );

  useEffect(() => {
    const page = document.querySelector('.page');
    if (!page) return undefined;
    const observer = new MutationObserver(() =>
      setIsDark(page.getAttribute('data-theme') === 'dark'),
    );
    observer.observe(page, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const controls = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])",
          ) || [],
        );
        if (!controls.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === '+' || event.key === '=') zoomCenter(1.25);
      else if (event.key === '-' || event.key === '_') zoomCenter(0.8);
      else if (event.key === '0') fit();
      else if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const current = viewRef.current;
        const step = 48;
        changeView({
          ...current,
          x:
            current.x +
            (event.key === 'ArrowRight'
              ? -step
              : event.key === 'ArrowLeft'
                ? step
                : 0),
          y:
            current.y +
            (event.key === 'ArrowDown'
              ? -step
              : event.key === 'ArrowUp'
                ? step
                : 0),
        });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      window.scrollTo(scrollX, scrollY);
      opener?.focus?.({ preventScroll: true });
    };
  }, [changeView, fit, zoomCenter]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(
        viewRef.current.scale *
          Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002)),
        event.clientX,
        event.clientY,
      );
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    const observer = new ResizeObserver(() => {
      if (!userAdjusted.current) fit();
    });
    observer.observe(viewport);
    return () => {
      viewport.removeEventListener('wheel', handleWheel);
      observer.disconnect();
    };
  }, [fit, zoomAt]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 1) {
      gesture.current = {
        x: event.clientX,
        y: event.clientY,
        view: viewRef.current,
      };
      setDragging(true);
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = (
        viewportRef.current as HTMLDivElement
      ).getBoundingClientRect();
      const centerX = (a.x + b.x) / 2 - rect.left;
      const centerY = (a.y + b.y) / 2 - rect.top;
      gesture.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: viewRef.current.scale,
        contentX: (centerX - viewRef.current.x) / viewRef.current.scale,
        contentY: (centerY - viewRef.current.y) / viewRef.current.scale,
      };
    }
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 1 && gesture.current?.view) {
      const start = gesture.current;
      const startView = start.view as View;
      changeView({
        ...startView,
        x: startView.x + event.clientX - (start.x ?? 0),
        y: startView.y + event.clientY - (start.y ?? 0),
      });
    } else if (pointers.current.size >= 2 && gesture.current?.distance) {
      const [a, b] = [...pointers.current.values()];
      const rect = (
        viewportRef.current as HTMLDivElement
      ).getBoundingClientRect();
      const pinch = gesture.current;
      const scale = clamp(
        ((pinch.scale ?? 1) * Math.hypot(a.x - b.x, a.y - b.y)) /
          Math.max(1, pinch.distance ?? 1),
      );
      changeView({
        scale,
        x: (a.x + b.x) / 2 - rect.left - (pinch.contentX ?? 0) * scale,
        y: (a.y + b.y) / 2 - rect.top - (pinch.contentY ?? 0) * scale,
      });
    }
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Двойной клик и двойной тап определяем здесь сами: из-за pointer capture браузер
    // не всегда присылает dblclick, а на тач-экранах он может прийти вторым срабатыванием.
    const wasSinglePointer =
      pointers.current.size === 1 && pointers.current.has(event.pointerId);
    const tapSlop = event.pointerType === 'mouse' ? 5 : 12;
    const start = gesture.current;
    pointers.current.delete(event.pointerId);
    if (
      wasSinglePointer &&
      event.type === 'pointerup' &&
      start?.view &&
      Math.hypot(
        event.clientX - (start.x ?? 0),
        event.clientY - (start.y ?? 0),
      ) < tapSlop
    ) {
      const now = Date.now();
      if (
        lastTap.current &&
        now - lastTap.current.time < 320 &&
        Math.hypot(
          event.clientX - lastTap.current.x,
          event.clientY - lastTap.current.y,
        ) < 28
      ) {
        toggleZoom(event.clientX, event.clientY);
        lastTap.current = null;
      } else
        lastTap.current = { time: now, x: event.clientX, y: event.clientY };
    }
    if (pointers.current.size === 1) {
      const remaining = [...pointers.current.values()][0];
      gesture.current = { ...remaining, view: viewRef.current };
    } else if (!pointers.current.size) {
      gesture.current = null;
      setDragging(false);
    }
  };

  return createPortal(
    <div
      className={`content-preview-backdrop tw:fixed tw:z-[1000] tw:inset-[0] tw:grid tw:w-[100vw] tw:h-[100vh] tw:p-[24px] tw:pointer-events-auto tw:[place-items:center] tw:max-600:p-[8px] tw:[background:rgba(16,_18,_24,_0.68)] tw:[backdrop-filter:blur(6px)] tw:[-webkit-backdrop-filter:blur(6px)] ${isDark ? 'is-dark' : ''}`}
      onPointerDown={(event) => {
        backdropPressed.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Закрываем по click, а не по pointerdown: иначе браузер после закрытия
        // сбрасывает фокус, и он не возвращается на кнопку, открывшую схему.
        if (backdropPressed.current && event.target === event.currentTarget)
          onCloseRef.current();
        backdropPressed.current = false;
      }}
    >
      <section
        ref={dialogRef}
        className="content-preview-modal is-diagram tw:relative tw:w-[95vw] tw:max-h-[90vh] tw:overflow-hidden tw:border-solid tw:border-[rgba(112,_109,_120,_0.55)] tw:rounded-[14px] tw:p-[0] tw:h-[90vh] tw:flex tw:flex-col tw:max-600:w-[calc(100vw_-_16px)] tw:max-600:max-h-[none] tw:[border-width:1px] tw:[.content-preview-backdrop.is-dark_&]:border-[#505a67] tw:[background:#f6f1e9] tw:[box-shadow:none] tw:max-600:h-[calc(100dvh_-_16px)] tw:[.content-preview-backdrop.is-dark_&]:[background:#252b34]"
        role="dialog"
        aria-modal="true"
        aria-label="Просмотр схемы Mermaid"
      >
        <div className="diagram-preview-toolbar tw:relative tw:z-[2] tw:flex tw:justify-between tw:items-center tw:flex-wrap tw:gap-[8px] tw:min-h-[64px] tw:p-[8px_12px] tw:max-600:p-[6px] tw:[background:#f6f1e9] tw:[border-bottom:1px_solid_rgba(112,_109,_120,_0.35)] tw:[.content-preview-backdrop.is-dark_&]:border-[#505a67] tw:[.content-preview-backdrop.is-dark_&]:[background:#252b34]">
          <div
            className="content-preview-zoom-controls tw:absolute tw:z-[2] tw:top-[14px] tw:right-[56px] tw:flex tw:items-center tw:gap-[6px] tw:[.content-preview-modal.is-diagram_&]:static tw:max-600:[.content-preview-modal.is-diagram_&]:gap-[2px]"
            aria-label="Масштаб схемы"
          >
            <button
              type="button"
              className="content-preview-zoom tw:min-w-[34px] tw:h-[34px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[999px] tw:text-(--heading) tw:text-[1.1rem] tw:font-[800] tw:leading-[1] tw:cursor-pointer tw:p-[0_10px] tw:[.content-preview-modal.is-diagram_&]:min-w-[44px] tw:[.content-preview-modal.is-diagram_&]:h-[44px] tw:[border-width:1px] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:border-[#677486] tw:[background:var(--surface)] tw:[.content-preview-modal.is-diagram_&]:text-[#20202a] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:text-[#f6f1e9] tw:[.content-preview-modal.is-diagram_&]:[background:#fff] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:[background:#343c48] tw:max-600:[.content-preview-modal.is-diagram_&]:p-[0_7px]"
              onClick={() => zoomCenter(0.8)}
              aria-label="Уменьшить"
            >
              −
            </button>
            <output className="diagram-preview-scale tw:min-w-[54px] tw:text-center tw:text-[#20202a] tw:font-[700] tw:[.content-preview-backdrop.is-dark_&]:text-[#f6f1e9]">
              {Math.round(view.scale * 100)}%
            </output>
            <button
              type="button"
              className="content-preview-zoom tw:min-w-[34px] tw:h-[34px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[999px] tw:text-(--heading) tw:text-[1.1rem] tw:font-[800] tw:leading-[1] tw:cursor-pointer tw:p-[0_10px] tw:[.content-preview-modal.is-diagram_&]:min-w-[44px] tw:[.content-preview-modal.is-diagram_&]:h-[44px] tw:[border-width:1px] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:border-[#677486] tw:[background:var(--surface)] tw:[.content-preview-modal.is-diagram_&]:text-[#20202a] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:text-[#f6f1e9] tw:[.content-preview-modal.is-diagram_&]:[background:#fff] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:[background:#343c48] tw:max-600:[.content-preview-modal.is-diagram_&]:p-[0_7px]"
              onClick={() => zoomCenter(1.25)}
              aria-label="Увеличить"
            >
              +
            </button>
            <button
              type="button"
              className="content-preview-zoom diagram-preview-fit tw:min-w-[34px] tw:h-[34px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[999px] tw:text-(--heading) tw:text-[0.85rem] tw:font-[800] tw:leading-[1] tw:cursor-pointer tw:p-[0_10px] tw:[.content-preview-modal.is-diagram_&]:min-w-[44px] tw:[.content-preview-modal.is-diagram_&]:h-[44px] tw:[border-width:1px] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:border-[#677486] tw:[background:var(--surface)] tw:[.content-preview-modal.is-diagram_&]:text-[#20202a] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:text-[#f6f1e9] tw:[.content-preview-modal.is-diagram_&]:[background:#fff] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:[background:#343c48] tw:max-600:[.content-preview-modal.is-diagram_&]:p-[0_7px]"
              onClick={() => fit(true)}
              title="Показать всю схему целиком"
            >
              Вся схема
            </button>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="content-preview-close tw:absolute tw:z-[2] tw:top-[14px] tw:right-[14px] tw:w-[34px] tw:h-[34px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[50%] tw:text-(--heading) tw:text-[1.45rem] tw:leading-[1] tw:cursor-pointer tw:[.content-preview-modal.is-diagram_&]:static tw:[.content-preview-modal.is-diagram_&]:w-[auto] tw:[.content-preview-modal.is-diagram_&]:h-[44px] tw:[border-width:1px] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:border-[#677486] tw:[.content-preview-modal.is-diagram_&]:rounded-[10px] tw:[background:var(--surface)] tw:[.content-preview-modal.is-diagram_&]:text-[#20202a] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:text-[#f6f1e9] tw:[.content-preview-modal.is-diagram_&]:text-[0.95rem] tw:[.content-preview-modal.is-diagram_&]:inline-flex tw:[.content-preview-modal.is-diagram_&]:items-center tw:[.content-preview-modal.is-diagram_&]:gap-[8px] tw:[.content-preview-modal.is-diagram_&]:flex-[0_0_auto] tw:[.content-preview-modal.is-diagram_&]:min-w-[44px] tw:[.content-preview-modal.is-diagram_&]:p-[0_14px] tw:[.content-preview-modal.is-diagram_&]:whitespace-nowrap tw:[.content-preview-modal.is-diagram_&]:font-[800] tw:[.content-preview-modal.is-diagram_&]:[background:#fff] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:[background:#343c48]"
            onClick={() => onCloseRef.current()}
            aria-label="Закрыть просмотр"
            title="Закрыть (Esc)"
          >
            <span aria-hidden="true">✕</span> Закрыть
          </button>
        </div>
        <div
          ref={viewportRef}
          className={`content-preview-body is-diagram tw:min-h-[0] tw:block tw:relative tw:w-[100%] tw:flex-[1] tw:overflow-hidden tw:p-[0] tw:cursor-grab tw:[place-items:center] tw:[background:#f6f1e9] tw:[&.is-dragging]:cursor-grabbing tw:[touch-action:none] tw:[&_img]:block tw:[&_img]:w-[100%] tw:[&_img]:max-w-[none] tw:[&_img]:h-[auto] tw:[&_img]:object-contain ${dragging ? 'is-dragging' : ''}`}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
        >
          <div
            className="content-preview-diagram-scale tw:[.content-preview-modal.is-diagram_&]:absolute tw:[.content-preview-modal.is-diagram_&]:top-[0] tw:[.content-preview-modal.is-diagram_&]:left-[0] tw:[.content-preview-modal.is-diagram_&]:max-w-[none] tw:[.content-preview-modal.is-diagram_&]:[transform-origin:top_left]"
            style={{
              width: size?.width || 800,
              height: size?.height || 600,
              visibility: size ? 'visible' : 'hidden',
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            }}
          >
            <MermaidDiagram
              chart={chart}
              lessonId={lessonId}
              blockId={blockId}
              onRendered={onRendered}
            />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
