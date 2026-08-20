import { useEffect, useRef, useState } from "react";
import MermaidDiagram from "./MermaidDiagram";

export default function ContentPreviewModal({ preview, onClose }) {
  const [imageZoom, setImageZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef(null);

  useEffect(() => {
    setImageZoom(1);
    setPan({ x: 0, y: 0 });
    if (!preview) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, preview]);

  if (!preview) {
    return null;
  }

  const increaseZoom = () => {
    setImageZoom((currentZoom) => (currentZoom >= 3 ? 1 : currentZoom + 0.5));
    setPan({ x: 0, y: 0 });
  };

  const startDragging = (event) => {
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

  const dragPreview = (event) => {
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

  return (
    <div className="content-preview-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="content-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Увеличенный просмотр материала"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="content-preview-close"
          onClick={onClose}
          aria-label="Закрыть просмотр"
          title="Закрыть"
        >
          ×
        </button>
        {(preview.type === "image" || preview.type === "diagram") && (
          <button
            type="button"
            className="content-preview-zoom"
            onClick={increaseZoom}
            aria-label="Увеличить материал"
            title="Увеличить"
          >
            +
          </button>
        )}
        <div className={`content-preview-body is-${preview.type}`}>
          {preview.type === "image" ? (
            <div
              className={`content-preview-pan-layer ${isDragging ? "is-dragging" : ""}`}
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
              className={`content-preview-diagram-scale content-preview-pan-layer ${isDragging ? "is-dragging" : ""}`}
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
              <MermaidDiagram chart={preview.chart} />
            </div>
          ) : (
            <div className="content-preview-table-wrap">
              <table>{preview.children}</table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
