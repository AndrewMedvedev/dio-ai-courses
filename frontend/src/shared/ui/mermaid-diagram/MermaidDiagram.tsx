import { useEffect, useId, useMemo, useRef, useState } from 'react';

import type { DiagramStatus } from './mermaid-renderer';
import {
  nextDiagramId,
  enqueueRender,
  formatMermaidError,
  normalizeMermaidSource,
  renderMermaid,
} from './mermaid-renderer';

export interface MermaidDiagramProps {
  chart: unknown;
  onRendered?: (svg: SVGSVGElement | null) => void;
  /** Для отчёта об ошибке отрисовки. */
  lessonId?: string | null;
  /** Для отчёта об ошибке отрисовки. */
  blockId?: string | number | null;
}

export function MermaidDiagram({
  chart,
  onRendered,
  lessonId,
  blockId,
}: MermaidDiagramProps) {
  const reactId = useId();
  const svgHostRef = useRef<HTMLDivElement>(null);
  const renderVersionRef = useRef(0);
  const [svg, setSvg] = useState('');
  const [status, setStatus] = useState<DiagramStatus>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [showSource, setShowSource] = useState(false);

  const normalizedChart = useMemo(() => normalizeMermaidSource(chart), [chart]);

  useEffect(() => {
    if (svg && onRendered)
      onRendered(svgHostRef.current?.querySelector('svg') ?? null);
  }, [svg, onRendered]);

  const componentId = useMemo(() => {
    const safeId = String(reactId)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .toLowerCase();
    const base = safeId || `diagram-${nextDiagramId()}`;
    return base.replace(/^[^a-zA-Z]+/, 'm');
  }, [reactId]);

  useEffect(() => {
    const chartToRender =
      normalizedChart || 'flowchart TD\n  A[Пустая диаграмма]';
    const currentVersion = ++renderVersionRef.current;
    let cancelled = false;

    setStatus('loading');
    setSvg('');
    setErrorMessage('');

    const execute = async () => {
      const result = await enqueueRender(() =>
        cancelled ? null : renderMermaid({ chart: chartToRender, componentId }),
      );

      if (!result || cancelled || currentVersion !== renderVersionRef.current)
        return;

      setSvg(result.svg);
      setErrorMessage(result.error || '');
      if (result.error) {
        const detail = {
          lessonId,
          blockId,
          source: normalizedChart,
          error: result.error,
        };
        console.error('Mermaid render failed', detail);
        window.dispatchEvent(
          new CustomEvent('mermaid:render-error', { detail }),
        );
      }
      if (result.error) {
        setStatus('error');
      } else if (result.fallback) {
        setStatus('fallback');
      } else if (result.recovered) {
        setStatus('recovered');
      } else {
        setStatus('ready');
      }
    };

    execute().catch((error) => {
      if (cancelled || currentVersion !== renderVersionRef.current) return;
      setSvg('');
      setErrorMessage(formatMermaidError(error));
      const detail = {
        lessonId,
        blockId,
        source: normalizedChart,
        error: formatMermaidError(error),
      };
      console.error('Mermaid render failed', detail);
      window.dispatchEvent(new CustomEvent('mermaid:render-error', { detail }));
      setStatus('error');
    });

    return () => {
      cancelled = true;
      renderVersionRef.current += 1;
    };
  }, [normalizedChart, componentId, retryCount, lessonId, blockId]);

  return (
    <div
      className={[
        'mermaid-diagram tw:m-[12px_0] tw:w-[100%] tw:overflow-x-auto tw:border-solid tw:border-[rgba(140,_113,_140,_0.38)] tw:rounded-[12px] tw:p-[12px] tw:[.content-preview-diagram-trigger_&]:m-[0] tw:[.content-preview-body_&]:m-[0] tw:[.content-block-card_&]:overflow-auto tw:[.content-preview-diagram-scale_&]:overflow-visible tw:[border-width:1px] tw:[.content-preview-modal.is-diagram_&]:border-none tw:dark:border-[rgba(183,_151,_183,_0.5)] tw:[.content-preview-modal.is-diagram_&]:border-[currentcolor] tw:[background:#f6f1e9] tw:[.content-preview-modal.is-diagram_&]:p-[0] tw:[.content-preview-modal.is-diagram_&]:[border-width:0] tw:dark:[.content-preview-modal.is-diagram_&]:border-[rgba(183,_151,_183,_0.5)] tw:dark:[background:#222831] tw:[.content-preview-modal.is-diagram_&]:[background:transparent] tw:[.content-preview-modal.is-diagram_&]:[box-shadow:none] tw:dark:[.content-preview-modal.is-diagram_&]:[background:#222831] tw:[&_svg]:block tw:[&_svg]:w-[auto] tw:[&_svg]:min-w-[min(100%,_640px)] tw:[&_svg]:max-w-[none] tw:[&_svg]:h-[auto] tw:[&_svg]:overflow-visible tw:[&_svg]:m-[0_auto] tw:dark:[.page_&_marker_path]:fill-[#b7c4d3]! tw:dark:[.page_&_marker_path]:stroke-[#b7c4d3]! tw:dark:[.page_&_.flowchart-link]:stroke-[#b7c4d3]! tw:dark:[.page_&_.edgeLabel]:[background:#252b34]! tw:dark:[.page_&_.edgeLabel]:text-[#f2e7d4]! tw:dark:[.page_&_.label]:fill-[#f2e7d4]! tw:dark:[.page_&_.label]:text-[#f2e7d4]! tw:dark:[.page_&_text]:fill-[#f2e7d4]! tw:dark:[.page_&_text]:text-[#f2e7d4]! tw:dark:[.page_&_tspan]:fill-[#f2e7d4]! tw:dark:[.page_&_tspan]:text-[#f2e7d4]! tw:dark:[.page_&_.edgeLabel_rect]:fill-[#252b34]! tw:dark:[.page_&_.edgeLabel_rect]:opacity-[0.96]! tw:dark:[.page_&_.node_rect]:fill-[#384554]! tw:dark:[.page_&_.node_rect]:stroke-[#9bb6d1]! tw:dark:[.page_&_.nodeLabel]:fill-[#f2e7d4]! tw:dark:[.page_&_.nodeLabel]:text-[#f2e7d4]! tw:dark:[.page_&_.node_polygon]:fill-[#384554]! tw:dark:[.page_&_.node_polygon]:stroke-[#9bb6d1]! tw:[.content-preview-diagram-scale_&_svg]:min-w-[100%] tw:[.content-preview-diagram-scale_&_svg]:ml-[0] tw:[.content-preview-diagram-scale_&_svg]:mr-[0] tw:[.content-preview-modal.is-diagram_&_svg]:w-[100%] tw:[.content-preview-modal.is-diagram_&_svg]:min-w-[0] tw:[.content-preview-modal.is-diagram_&_svg]:max-w-[none]',
        `is-${status}`,
      ].join(' ')}
    >
      {svg ? (
        <div
          ref={svgHostRef}
          className="mermaid-diagram-svg tw:[.content-block-card_&]:w-[100%] tw:[.content-preview-modal.is-diagram_&]:w-[100%] tw:[.content-block-card_&]:min-w-[0] tw:[.content-preview-modal.is-diagram_&]:min-w-[0] tw:[.content-block-card_&_svg]:w-[100%] tw:[.content-block-card_&_svg]:min-w-[0] tw:[.content-block-card_&_svg]:max-w-[100%]"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : status === 'error' ? (
        <div
          className="mermaid-diagram-error tw:min-w-[280px] tw:min-h-[120px] tw:grid tw:gap-[8px] tw:text-center tw:text-(--muted) tw:border-dashed tw:border-[rgba(196,_89,_89,_0.42)] tw:rounded-[10px] tw:p-[16px] tw:overflow-auto tw:[place-content:center] tw:[border-width:1px] tw:[background:rgba(196,_89,_89,_0.08)] tw:dark:[.page_&]:border-[rgba(255,_135,_135,_0.34)] tw:dark:[.page_&]:[background:rgba(255,_135,_135,_0.08)] tw:[&_strong]:text-(--ink) tw:[&_strong]:font-[800] tw:[&_span]:max-w-[420px] tw:[&_span]:text-[0.86rem] tw:[&_span]:leading-[1.45]"
          role="alert"
        >
          <strong>Схему пока не удалось показать</strong>
          <span>{errorMessage}</span>
          <div className="mermaid-diagram-error-actions tw:flex tw:flex-wrap tw:justify-center tw:gap-[8px] tw:[&_button]:min-h-[44px] tw:[&_button]:p-[8px_12px] tw:[&_button]:[border:1px_solid_rgba(var(--accent-rgb),_0.55)] tw:[&_button]:rounded-[8px] tw:[&_button]:[background:var(--surface)] tw:[&_button]:text-(--ink) tw:[&_button]:cursor-pointer">
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
            >
              Повторить отрисовку
            </button>
            <button
              type="button"
              onClick={() => setShowSource((shown) => !shown)}
              aria-expanded={showSource}
            >
              {showSource ? 'Скрыть исходный код' : 'Показать исходный код'}
            </button>
          </div>
          {showSource && (
            <pre className="mermaid-diagram-source tw:max-w-[100%] tw:max-h-[240px] tw:overflow-auto tw:m-[0] tw:p-[10px] tw:text-left tw:whitespace-pre tw:text-(--ink) tw:[background:var(--glass-bg-strong)]">
              {normalizedChart}
            </pre>
          )}
        </div>
      ) : (
        <div
          className="mermaid-diagram-placeholder tw:min-w-[280px] tw:min-h-[120px] tw:grid tw:gap-[8px] tw:text-center tw:text-(--muted) tw:border-dashed tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[10px] tw:[place-content:center] tw:[border-width:1px] tw:dark:border-[rgba(155,_182,_209,_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:dark:[background:rgba(155,_182,_209,_0.08)]"
          role="status"
          aria-live="polite"
        >
          <strong className="tw:text-(--ink) tw:font-[800] tw:[.page.is-inner-page_.lesson-markdown_&]:text-(--ink-accent) tw:dark:[.page_.generated-course-learning-grid_.content-block-card_&]:text-[#fff4df] tw:dark:[.page_.generated-course-learning-grid_.content-block-card_&]:[.page.is-inner-page_.lesson-markdown_&]:text-[#fff4df]">
            Схема Mermaid загружается
          </strong>
          <span className="tw:max-w-[420px] tw:text-[0.86rem] tw:leading-[1.45]">
            Подготавливаем визуализацию.
          </span>
        </div>
      )}
    </div>
  );
}
