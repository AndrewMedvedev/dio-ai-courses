"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

/* -------------------------------------------------------------------------- */
/* Global Mermaid */
/* -------------------------------------------------------------------------- */
let mermaidPromise = null;
let mermaidInitialized = false;
let globalRenderCounter = 0;

let renderQueue = Promise.resolve();
const enqueueRender = (task) => {
  const result = renderQueue.then(task, task);
  renderQueue = result.catch(() => undefined);
  return result;
};

/* -------------------------------------------------------------------------- */
/* Theme */
/* -------------------------------------------------------------------------- */
const themeVariables = {
  background: "#f6f1e9",
  primaryColor: "#e9dce9",
  primaryTextColor: "#2b2b2b",
  primaryBorderColor: "#8c718c",
  secondaryColor: "#dce8f7",
  tertiaryColor: "#f1e5d8",
  lineColor: "#66778b",
  textColor: "#2b2b2b",
  edgeLabelBackground: "#f6f1e9",
  noteBkgColor: "#f1dfcf",
  noteTextColor: "#654329",
  noteBorderColor: "#c98245",
};

/* -------------------------------------------------------------------------- */
/* Ultimate fallback — всегда валидный SVG, не зависит от Mermaid */
/* -------------------------------------------------------------------------- */
const ULTIMATE_FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 80" width="100%" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;max-width:100%;display:block;background:#f6f1e9"><rect x="10" y="18" width="120" height="44" rx="8" fill="#e9dce9" stroke="#8c718c" stroke-width="1.5"/><text x="70" y="45" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="#2b2b2b">Диаграмма</text><path d="M140 40 H180" stroke="#66778b" stroke-width="1.5" fill="none" marker-end="url(#m-arrow)"/><rect x="190" y="18" width="120" height="44" rx="8" fill="#dce8f7" stroke="#8c718c" stroke-width="1.5"/><text x="250" y="45" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#2b2b2b">не распознана</text><defs><marker id="m-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#66778b"/></marker></defs></svg>`;

/* -------------------------------------------------------------------------- */
/* Mermaid loader */
/* -------------------------------------------------------------------------- */
const getMermaid = async () => {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(
      (module) => module.default ?? module,
    );
  }
  const mermaid = await mermaidPromise;
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: "base",
      themeVariables,
      flowchart: {
        htmlLabels: false,
        useMaxWidth: true,
        nodeSpacing: 30,
        rankSpacing: 35,
        curve: "linear",
      },
      sequence: {
        useMaxWidth: true,
        diagramMarginX: 20,
        diagramMarginY: 20,
        actorMargin: 40,
        width: 120,
        height: 50,
        boxMargin: 8,
        messageMargin: 25,
      },
      gantt: {
        useMaxWidth: true,
      },
    });
    mermaidInitialized = true;
  }
  return mermaid;
};

/* -------------------------------------------------------------------------- */
/* Source helpers */
/* -------------------------------------------------------------------------- */
const normalizeTypography = (source) =>
  String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .trim();

const stripCodeFence = (source) => {
  const value = String(source ?? "").trim();
  const normalFence = value.match(
    /^```(?:mermaid)?[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```$/i,
  );
  if (normalFence) return normalFence[1].trim();
  return value
    .replace(/^```(?:mermaid)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
};

/* Удаляем init-директивы ПО ВСЕМУ ТЕКСТУ */
const stripInitDirectives = (source) =>
  String(source ?? "")
    .replace(/\s*%%\{\{?\s*(?:init|initialize)\s*:[\s\S]*?\}\}?\s*%%\s*/gim, "")
    .trim();

const normalizeMermaidSource = (source) => {
  const normalized = normalizeTypography(source);
  const withoutFence = stripCodeFence(normalized);
  return stripInitDirectives(withoutFence).trim();
};

/* -------------------------------------------------------------------------- */
/* Diagram detection */
/* -------------------------------------------------------------------------- */
const DIAGRAM_TYPE_PATTERN =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|sankey-beta|block-beta|xychart-beta|zenuml|architecture-beta|packet-beta|kanban)\b/i;

const hasDiagramType = (source) =>
  DIAGRAM_TYPE_PATTERN.test(String(source ?? "").trim());

/* -------------------------------------------------------------------------- */
/* УЛУЧШЕННЫЙ ремонт — удаляем все обратные слеши, вставляем пробелы между узлами */
/* -------------------------------------------------------------------------- */
const repairCommonErrors = (source) => {
  let result = String(source ?? "").trim();
  if (!result) return "";

  // 1. Удаляем init-директивы
  result = stripInitDirectives(result);

  // 2. Убираем все обратные слеши перед кавычками (любое количество)
  result = result.replace(/\\(?:\\\\)*(["'])/g, "$1");

  // 3. Вставляем пробел между закрывающей скобкой и следующим идентификатором, если нет пробела
  //    Например: ]D2 -> ] D2, ))D3 -> )) D3
  result = result.replace(/([\]\)])([A-Za-z])/g, "$1 $2");

  // 4. Оборачиваем subgraph в кавычки, если их нет (используем двойные)
  result = result.replace(
    /subgraph\s+([^\s"'\n][^\n]*?)(\s*\n)/g,
    (match, title, rest) => {
      if (/^["']/.test(title)) return match;
      return `subgraph "${title}"${rest}`;
    },
  );

  // 5. Удаляем лишние пустые строки и пробелы в начале строк
  result = result.replace(/\n\s*\n/g, "\n");
  result = result.replace(/^[ \t]+/gm, "");

  return result.trim();
};

/* -------------------------------------------------------------------------- */
/* Render candidates — ТОЛЬКО исправленная версия */
/* -------------------------------------------------------------------------- */
const createRenderCandidates = (source) => {
  const normalized = normalizeMermaidSource(source);
  const repaired = repairCommonErrors(normalized);
  const candidates = [];

  if (repaired) candidates.push(repaired);
  if (repaired && !hasDiagramType(repaired)) {
    candidates.push(`flowchart TD\n${repaired}`);
  }

  return [...new Set(candidates.filter(Boolean))];
};

/* -------------------------------------------------------------------------- */
/* SVG normalization */
/* -------------------------------------------------------------------------- */
const normalizeRenderedSvg = (svg) => {
  if (!svg) return "";
  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svg, "image/svg+xml");
    const svgElement = parsed.documentElement;
    if (!svgElement || svgElement.nodeName.toLowerCase() !== "svg") {
      return svg;
    }

    svgElement.removeAttribute("width");
    svgElement.removeAttribute("height");
    svgElement.setAttribute("width", "100%");
    svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const currentStyle = svgElement.getAttribute("style") ?? "";
    const cleanStyle = currentStyle
      .replace(/(?:^|;)\s*max-width\s*:[^;]*/gi, "")
      .replace(/(?:^|;)\s*width\s*:[^;]*/gi, "")
      .replace(/(?:^|;)\s*height\s*:[^;]*/gi, "");

    svgElement.setAttribute(
      "style",
      [
        cleanStyle,
        "width:100%",
        "height:auto",
        "max-width:100%",
        "display:block",
      ]
        .filter(Boolean)
        .join(";"),
    );

    return new XMLSerializer().serializeToString(svgElement);
  } catch (error) {
    console.warn("[MermaidDiagram] SVG normalization failed", error);
    return svg;
  }
};

/* -------------------------------------------------------------------------- */
/* Проверка на ошибки — только явные индикаторы */
/* -------------------------------------------------------------------------- */
const isErrorSvg = (svg) => {
  if (!svg) return true;
  return /syntax error|parse error|error-icon|mermaid version/i.test(svg);
};

/* -------------------------------------------------------------------------- */
/* DOM cleanup */
/* -------------------------------------------------------------------------- */
const cleanupMermaidDom = (id) => {
  if (typeof document === "undefined") return;
  document.getElementById(id)?.remove();
  document.getElementById(`d${id}`)?.remove();
};

/* -------------------------------------------------------------------------- */
/* Render single candidate */
/* -------------------------------------------------------------------------- */
const renderCandidate = async (mermaid, source, id) => {
  try {
    const result = await mermaid.render(id, source);
    if (!result?.svg) {
      console.warn("[MermaidDiagram] render returned no SVG", { source });
      return null;
    }
    if (isErrorSvg(result.svg)) {
      console.warn("[MermaidDiagram] rendered SVG contains error", {
        source,
        svg: result.svg.substring(0, 300),
      });
      return null;
    }
    return normalizeRenderedSvg(result.svg);
  } catch (error) {
    console.warn("[MermaidDiagram] renderCandidate error:", error.message, {
      source,
    });
    return null;
  } finally {
    cleanupMermaidDom(id);
  }
};

/* -------------------------------------------------------------------------- */
/* Complete Mermaid render — если не удалось, возвращаем ultimate fallback */
/* -------------------------------------------------------------------------- */
const renderMermaid = async ({ chart, componentId }) => {
  try {
    const mermaid = await getMermaid();
    const candidates = createRenderCandidates(chart);

    for (let index = 0; index < candidates.length; index += 1) {
      const source = candidates[index];
      const id = `m-${componentId}-${Date.now()}-${globalRenderCounter++}-${index}`;
      const safeId = id.replace(/^[^a-zA-Z]+/, "m");

      const svg = await renderCandidate(mermaid, source, safeId);
      if (svg) {
        return {
          svg,
          recovered: index > 0,
          fallback: false,
        };
      }
    }
  } catch (error) {
    console.warn("[MermaidDiagram] renderMermaid failed:", error);
  }

  return {
    svg: ULTIMATE_FALLBACK_SVG,
    recovered: true,
    fallback: true,
  };
};

/* -------------------------------------------------------------------------- */
/* Component */
/* -------------------------------------------------------------------------- */
export default function MermaidDiagram({ chart }) {
  const reactId = useId();
  const containerRef = useRef(null);
  const renderVersionRef = useRef(0);
  const [svg, setSvg] = useState("");
  const [status, setStatus] = useState("loading");

  const normalizedChart = useMemo(() => normalizeMermaidSource(chart), [chart]);

  const componentId = useMemo(() => {
    const safeId = String(reactId)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .toLowerCase();
    const base = safeId || `diagram-${globalRenderCounter++}`;
    return base.replace(/^[^a-zA-Z]+/, "m");
  }, [reactId]);

  useEffect(() => {
    const chartToRender =
      normalizedChart || "flowchart TD\n  A[Пустая диаграмма]";
    const currentVersion = ++renderVersionRef.current;
    let cancelled = false;

    setStatus("loading");

    const execute = async () => {
      const result = await enqueueRender(() =>
        renderMermaid({
          chart: chartToRender,
          componentId,
        }),
      );

      if (cancelled || currentVersion !== renderVersionRef.current) return;

      setSvg(result.svg);
      if (result.fallback) {
        setStatus("fallback");
      } else if (result.recovered) {
        setStatus("recovered");
      } else {
        setStatus("ready");
      }
    };

    execute().catch((error) => {
      console.warn("[MermaidDiagram] unexpected error", error);
      if (cancelled || currentVersion !== renderVersionRef.current) return;
      setSvg(ULTIMATE_FALLBACK_SVG);
      setStatus("fallback");
    });

    return () => {
      cancelled = true;
    };
  }, [normalizedChart, componentId]);

  return (
    <div
      ref={containerRef}
      className={["mermaid-diagram", `is-${status}`].join(" ")}
    >
      {svg ? (
        <div
          className="mermaid-diagram-svg"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div
          className="mermaid-diagram-placeholder"
          role="status"
          aria-live="polite"
        >
          <strong>Схема Mermaid загружается</strong>
          <span>Подготавливаем визуализацию.</span>
        </div>
      )}
    </div>
  );
}
