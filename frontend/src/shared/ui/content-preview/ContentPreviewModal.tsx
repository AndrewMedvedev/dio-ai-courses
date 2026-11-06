import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MermaidDiagram } from "@/shared/ui/mermaid-diagram";
import { DiagramPreviewModal } from "./DiagramPreviewModal";

/** Что открыть в увеличенном просмотре. */
export type ContentPreview =
  | {
      type: "diagram";
      chart: string;
      lessonId?: string | null;
      blockId?: string | number | null;
    }
  | { type: "image"; src: string; alt?: string }
  | { type: "table"; children: ReactNode };

interface ContentPreviewModalProps {
  preview: ContentPreview | null;
  onClose: () => void;
}

export function ContentPreviewModal({ preview, onClose }: ContentPreviewModalProps) {
  if (preview?.type === "diagram") {
    return <DiagramPreviewModal chart={preview.chart} lessonId={preview.lessonId} blockId={preview.blockId} onClose={onClose} />;
  }
  return <OtherContentPreviewModal preview={preview} onClose={onClose} />;
}

function OtherContentPreviewModal({ preview, onClose }: ContentPreviewModalProps) {
  const [imageZoom, setImageZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{
    pointerX: number;
    pointerY: number;
    panX: number;
    panY: number;
  } | null>(null);

  useEffect(() => {
    setImageZoom(1);
    setPan({ x: 0, y: 0 });
    if (!preview) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, preview]);

  if (!preview) {
    return null;
  }

  const increaseZoom = () => {
    setImageZoom((currentZoom) => Math.min(4, currentZoom + 0.25));
  };

  const decreaseZoom = () => {
    setImageZoom((currentZoom) => Math.max(0.5, currentZoom - 0.25));
  };

  const resetZoom = () => {
    setImageZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const startDragging = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setIsDragging(true);
  };

  const dragPreview = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragStart.current) {
      return;
    }
    setPan({
      x: dragStart.current.panX + event.clientX - dragStart.current.pointerX,
      y: dragStart.current.panY + event.clientY - dragStart.current.pointerY,
    });
  };

  const stopDragging = () => {
    dragStart.current = null;
    setIsDragging(false);
  };

  return createPortal(
    <div
      className="content-preview-backdrop tw:fixed tw:z-[1000] tw:inset-[0] tw:grid tw:w-[100vw] tw:h-[100vh] tw:p-[24px] tw:pointer-events-auto tw:[place-items:center] tw:max-600:p-[8px] tw:[background:rgba(16,_18,_24,_0.68)] tw:[backdrop-filter:blur(6px)] tw:[-webkit-backdrop-filter:blur(6px)]"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={`content-preview-modal tw:relative tw:w-[min(1180px,_calc(100vw_-_48px))] tw:max-h-[calc(100vh_-_48px)] tw:overflow-auto tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.5)] tw:rounded-[14px] tw:p-[22px] tw:[&.is-diagram]:w-[95vw] tw:[&.is-diagram]:max-h-[90vh] tw:[&.is-diagram]:overflow-hidden tw:[border-width:1px] tw:[&.is-diagram]:border-[rgba(112,_109,_120,_0.55)] tw:[.content-preview-backdrop.is-dark_&.is-diagram]:border-[#505a67] tw:[background:var(--surface)] tw:[box-shadow:0_22px_64px_rgba(0,_0,_0,_0.36)] tw:[&.is-diagram]:p-[0] tw:[&.is-diagram]:h-[90vh] tw:[&.is-diagram]:flex tw:[&.is-diagram]:flex-col tw:max-600:[&.is-diagram]:w-[calc(100vw_-_16px)] tw:max-600:[&.is-diagram]:max-h-[none] tw:[&.is-diagram]:[background:#f6f1e9] tw:[.content-preview-backdrop.is-dark_&.is-diagram]:[background:#252b34] tw:[&.is-diagram]:[box-shadow:none] tw:max-600:[&.is-diagram]:h-[calc(100dvh_-_16px)] is-${preview.type}`}
        role="dialog"
        aria-modal="true"
        aria-label="Увеличенный просмотр материала"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="content-preview-close tw:absolute tw:z-[2] tw:top-[14px] tw:right-[14px] tw:w-[34px] tw:h-[34px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[50%] tw:text-(--heading) tw:text-[1.45rem] tw:leading-[1] tw:cursor-pointer tw:[.content-preview-modal.is-diagram_&]:static tw:[.content-preview-modal.is-diagram_&]:w-[auto] tw:[.content-preview-modal.is-diagram_&]:h-[44px] tw:[border-width:1px] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:border-[#677486] tw:[.content-preview-modal.is-diagram_&]:rounded-[10px] tw:[background:var(--surface)] tw:[.content-preview-modal.is-diagram_&]:text-[#20202a] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:text-[#f6f1e9] tw:[.content-preview-modal.is-diagram_&]:text-[0.95rem] tw:[.content-preview-modal.is-diagram_&]:inline-flex tw:[.content-preview-modal.is-diagram_&]:items-center tw:[.content-preview-modal.is-diagram_&]:gap-[8px] tw:[.content-preview-modal.is-diagram_&]:flex-[0_0_auto] tw:[.content-preview-modal.is-diagram_&]:min-w-[44px] tw:[.content-preview-modal.is-diagram_&]:p-[0_14px] tw:[.content-preview-modal.is-diagram_&]:whitespace-nowrap tw:[.content-preview-modal.is-diagram_&]:font-[800] tw:[.content-preview-modal.is-diagram_&]:[background:#fff] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:[background:#343c48]"
          onClick={onClose}
          aria-label="Закрыть просмотр"
          title="Закрыть"
        >
          ×
        </button>
        {(preview.type === "image" || preview.type === "diagram") && (
          <div className="content-preview-zoom-controls tw:absolute tw:z-[2] tw:top-[14px] tw:right-[56px] tw:flex tw:items-center tw:gap-[6px] tw:[.content-preview-modal.is-diagram_&]:static tw:max-600:[.content-preview-modal.is-diagram_&]:gap-[2px]" aria-label="Масштаб">
            <button
              type="button"
              className="content-preview-zoom tw:min-w-[34px] tw:h-[34px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[999px] tw:text-(--heading) tw:text-[1.1rem] tw:font-[800] tw:leading-[1] tw:cursor-pointer tw:p-[0_10px] tw:[.content-preview-modal.is-diagram_&]:min-w-[44px] tw:[.content-preview-modal.is-diagram_&]:h-[44px] tw:[border-width:1px] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:border-[#677486] tw:[background:var(--surface)] tw:[.content-preview-modal.is-diagram_&]:text-[#20202a] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:text-[#f6f1e9] tw:[.content-preview-modal.is-diagram_&]:[background:#fff] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:[background:#343c48] tw:max-600:[.content-preview-modal.is-diagram_&]:p-[0_7px]"
              onClick={decreaseZoom}
              aria-label="Уменьшить материал"
              title="Уменьшить"
            >
              −
            </button>
            <button
              type="button"
              className="content-preview-zoom content-preview-zoom-reset tw:min-w-[34px] tw:h-[34px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[999px] tw:text-(--heading) tw:text-[0.78rem] tw:font-[800] tw:leading-[1] tw:cursor-pointer tw:p-[0_10px] tw:[.content-preview-modal.is-diagram_&]:min-w-[44px] tw:[.content-preview-modal.is-diagram_&]:h-[44px] tw:[border-width:1px] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:border-[#677486] tw:[background:var(--surface)] tw:[.content-preview-modal.is-diagram_&]:text-[#20202a] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:text-[#f6f1e9] tw:[.content-preview-modal.is-diagram_&]:[background:#fff] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:[background:#343c48] tw:max-600:[.content-preview-modal.is-diagram_&]:p-[0_7px]"
              onClick={resetZoom}
              aria-label="Сбросить масштаб"
              title="Сбросить масштаб"
            >
              {Math.round(imageZoom * 100)}%
            </button>
            <button
              type="button"
              className="content-preview-zoom tw:min-w-[34px] tw:h-[34px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[999px] tw:text-(--heading) tw:text-[1.1rem] tw:font-[800] tw:leading-[1] tw:cursor-pointer tw:p-[0_10px] tw:[.content-preview-modal.is-diagram_&]:min-w-[44px] tw:[.content-preview-modal.is-diagram_&]:h-[44px] tw:[border-width:1px] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:border-[#677486] tw:[background:var(--surface)] tw:[.content-preview-modal.is-diagram_&]:text-[#20202a] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:text-[#f6f1e9] tw:[.content-preview-modal.is-diagram_&]:[background:#fff] tw:[.content-preview-backdrop.is-dark_.content-preview-modal.is-diagram_&]:[background:#343c48] tw:max-600:[.content-preview-modal.is-diagram_&]:p-[0_7px]"
              onClick={increaseZoom}
              aria-label="Увеличить материал"
              title="Увеличить"
            >
              +
            </button>
          </div>
        )}
        <div className={`content-preview-body tw:min-h-[min(560px,_calc(100vh_-_130px))] tw:grid tw:[&.is-diagram]:min-h-[0] tw:[&.is-diagram]:block tw:[&.is-image]:block tw:[place-items:center] tw:[&.is-diagram]:relative tw:[&.is-diagram]:w-[100%] tw:[&.is-diagram]:flex-[1] tw:[&.is-diagram]:overflow-hidden tw:[&.is-image]:overflow-auto tw:[&.is-diagram]:p-[0] tw:[&.is-diagram]:cursor-grab tw:[&.is-diagram.is-dragging]:cursor-grabbing tw:[&.is-diagram]:[background:#f6f1e9] tw:[&.is-diagram]:[touch-action:none] tw:[&_img]:block tw:[&_img]:w-[100%] tw:[&_img]:max-w-[none] tw:[&_img]:h-[auto] tw:[&_img]:object-contain is-${preview.type}`}>
          {preview.type === "image" ? (
            <div
              className={`content-preview-pan-layer tw:cursor-grab tw:[transform-origin:top_left] tw:[&.is-dragging]:cursor-grabbing tw:[touch-action:none] tw:[transition:width_160ms_ease] tw:[&.is-dragging]:[transition:none] ${isDragging ? "is-dragging" : ""}`}
              style={{
                width: `${imageZoom * 100}%`,
                transform: `translate(${pan.x}px, ${pan.y}px)`,
              }}
              onPointerDown={startDragging}
              onPointerMove={dragPreview}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              onDoubleClick={increaseZoom}
            >
              <img src={preview.src} alt={preview.alt || "Изображение"} />
            </div>
          ) : preview.type === "diagram" ? (
            <div
              className={`content-preview-diagram-scale content-preview-pan-layer tw:cursor-grab tw:[.content-preview-modal.is-diagram_&]:absolute tw:[.content-preview-modal.is-diagram_&]:top-[0] tw:[.content-preview-modal.is-diagram_&]:left-[0] tw:[.content-preview-modal.is-diagram_&]:max-w-[none] tw:[transform-origin:top_left] tw:[&.is-dragging]:cursor-grabbing tw:[touch-action:none] tw:[transition:width_160ms_ease] tw:[&.is-dragging]:[transition:none] ${isDragging ? "is-dragging" : ""}`}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${imageZoom})`,
              }}
              onPointerDown={startDragging}
              onPointerMove={dragPreview}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              onDoubleClick={increaseZoom}
            >
              <MermaidDiagram chart={preview.chart} />
            </div>
          ) : (
            <div className="content-preview-table-wrap tw:w-[100%] tw:overflow-auto tw:[&_table]:w-[100%] tw:[&_table]:[border-collapse:collapse] tw:[&_th]:[border:1px_solid_rgba(var(--accent-rgb),_0.46)] tw:[&_th]:p-[12px_14px] tw:[&_th]:text-left tw:[&_th]:text-(--text) tw:[&_td]:[border:1px_solid_rgba(var(--accent-rgb),_0.46)] tw:[&_td]:p-[12px_14px] tw:[&_td]:text-left tw:[&_td]:text-(--text)">
              <table>{preview.children}</table>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
