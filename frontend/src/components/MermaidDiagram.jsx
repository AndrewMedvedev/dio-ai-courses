import { useEffect, useId, useRef, useState } from "react";

let mermaidInstancePromise;

const themeVariables = {
  light: {
    background: "#f6f1e9",
    primaryColor: "#e9dce9",
    primaryTextColor: "#2b2b2b",
    primaryBorderColor: "#8c718c",
    lineColor: "#66778b",
    secondaryColor: "#dce8f7",
    tertiaryColor: "#f1e5d8",
    edgeLabelBackground: "#f6f1e9",
    textColor: "#2b2b2b",
    noteBkgColor: "#f1dfcf",
    noteTextColor: "#654329",
    noteBorderColor: "#c98245",
  },
  dark: {
    background: "#222831",
    primaryColor: "#384554",
    primaryTextColor: "#f2e7d4",
    primaryBorderColor: "#9bb6d1",
    lineColor: "#b7c4d3",
    secondaryColor: "#493f50",
    tertiaryColor: "#2f3944",
    clusterBkg: "#29313b",
    clusterBorder: "#7f8fa3",
    edgeLabelBackground: "#252b34",
    textColor: "#f2e7d4",
    noteBkgColor: "#49382c",
    noteTextColor: "#f2d3b3",
    noteBorderColor: "#d0935f",
  },
};

const getMermaid = async (theme = "default", colorMode = "light") => {
  if (!mermaidInstancePromise) {
    mermaidInstancePromise = import("mermaid").then((module) => module.default);
  }

  const mermaid = await mermaidInstancePromise;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    suppressErrorRendering: true,
    theme,
    themeVariables: themeVariables[colorMode],
    flowchart: { htmlLabels: true, useMaxWidth: false },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
  });
  return mermaid;
};

const normalizeNodeLabels = (source) =>
  source.replace(
    /(\b[A-Za-z_][\w-]*)\[([^\]\r\n]*"[^\]\r\n]*)\]/g,
    (_match, id, label) => {
      const escapedLabel = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return `${id}["${escapedLabel}"]`;
    },
  );

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeMermaidText = (value) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "'")
    .replace(/[\[\]{}|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractMermaidConfig = (source) => {
  const match = source.match(/%%\{init:\s*([\s\S]*?)\}%%/);
  if (!match) {
    return { chart: source, theme: "default" };
  }

  try {
    const config = JSON.parse(match[1]);
    return {
      chart: source.replace(match[0], "").trim(),
      theme: config.theme || "default",
    };
  } catch {
    return {
      chart: source.replace(match[0], "").trim(),
      theme: "default",
    };
  }
};

const stripCodeFence = (source) => {
  const value = String(source || "").trim();
  const fenceMatch = /^```[\w-]*\s*\n([\s\S]*?)\n```$/i.exec(value);
  return fenceMatch ? fenceMatch[1].trim() : value;
};

const stripMermaidDirectives = (source) =>
  source
    .replace(/^\s*%%\s*\{+[\s\S]*?\}+\s*%%\s*/g, "")
    .replace(/^\s*%%\s*\{+[\s\S]*?\}+\s*%%\s*/gm, "");

const normalizeMermaidSource = (source) => {
  const normalizedDirectives = stripCodeFence(source)
    .replace(/%%\{\{init:\s*\{\{([\s\S]*?)\}\}\s*\}\}%%/g, "%%{init: {$1}}%%")
    .replace(/%%\{\{init:\s*([\s\S]*?)\}\}%%/g, "%%{init: $1}%%")
    .replace(/%%\{\{([\s\S]*?)\}\}%%/g, "%%{$1}%%")
    .replace(/%%\{init:\s*([\s\S]*?)\}%%/, (_match, initConfig) => {
      const jsonLikeConfig = initConfig
        .replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":')
        .replace(/:\s*'([^']*)'/g, ': "$1"');

      return `%%{init: ${jsonLikeConfig}}%%`;
    });

  return extractMermaidConfig(normalizeNodeLabels(normalizedDirectives));
};

const createFallbackFlowchart = (source) => {
  const meaningfulLines = stripMermaidDirectives(source)
    .split("\n")
    .map((line) => line.replace(/^\s*%%\s?/, "").trim())
    .filter(Boolean)
    .slice(0, 8);

  const nodes = meaningfulLines.length
    ? meaningfulLines
    : ["Mermaid diagram", "Нет данных для отображения"];

  return [
    "flowchart TD",
    ...nodes.map(
      (line, index) =>
        `  n${index}["${escapeMermaidText(line).slice(0, 90) || `Шаг ${index + 1}`}"]`,
    ),
    ...nodes.slice(1).map((_, index) => `  n${index} --> n${index + 1}`),
  ].join("\n");
};

const createSourceSvg = (source, colorMode) => {
  const lines = String(source || "Mermaid diagram")
    .split("\n")
    .slice(0, 18)
    .map((line) => line.slice(0, 110));
  const width = 900;
  const height = Math.max(180, 78 + lines.length * 22);
  const background = colorMode === "dark" ? "#222831" : "#f6f1e9";
  const border = colorMode === "dark" ? "#9bb6d1" : "#8c718c";
  const text = colorMode === "dark" ? "#f2e7d4" : "#2b2b2b";
  const muted = colorMode === "dark" ? "#b7c4d3" : "#66778b";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Mermaid diagram source fallback">
    <rect width="100%" height="100%" rx="16" fill="${background}" stroke="${border}" stroke-width="2"/>
    <text x="28" y="38" fill="${text}" font-family="Arial, sans-serif" font-size="20" font-weight="700">Mermaid diagram</text>
    <text x="28" y="62" fill="${muted}" font-family="Arial, sans-serif" font-size="14">Исходный Mermaid-код отрисован как fallback, потому что библиотека не смогла разобрать синтаксис.</text>
    ${lines
      .map(
        (line, index) =>
          `<text x="28" y="${96 + index * 22}" fill="${text}" font-family="Menlo, Consolas, monospace" font-size="14">${escapeHtml(line)}</text>`,
      )
      .join("")}
  </svg>`;
};

const getRenderCandidates = (source) => {
  const withoutDirectives = stripMermaidDirectives(source).trim();
  const fallbackFlowchart = createFallbackFlowchart(source);
  return [
    ...new Set(
      [source.trim(), withoutDirectives, fallbackFlowchart].filter(Boolean),
    ),
  ];
};

const isMermaidErrorSvg = (svg) =>
  /(?:error-icon|syntax error|parse error|mermaid version)/i.test(
    String(svg || ""),
  );

export default function MermaidDiagram({ chart }) {
  const reactId = useId();
  const diagramId = `mermaid-${reactId.replace(/:/g, "")}`;
  const containerRef = useRef(null);
  const [svg, setSvg] = useState("");
  const [status, setStatus] = useState("idle");
  const [colorMode, setColorMode] = useState("light");
  const { chart: normalizedChart, theme } = normalizeMermaidSource(chart);
  const resolvedTheme = colorMode === "dark" ? "dark" : theme;

  useEffect(() => {
    const page = containerRef.current?.closest(".page");
    if (!page) {
      return undefined;
    }

    const syncTheme = () => {
      setColorMode(page.dataset.theme === "dark" ? "dark" : "light");
    };
    syncTheme();

    const observer = new MutationObserver(syncTheme);
    observer.observe(page, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      if (isMounted) {
        setSvg("");
        setStatus("loading");
      }

      try {
        const mermaid = await getMermaid(resolvedTheme, colorMode);
        const candidates = getRenderCandidates(normalizedChart);

        for (const [index, candidate] of candidates.entries()) {
          try {
            const { svg: renderedSvg } = await mermaid.render(
              `${diagramId}-${index}`,
              candidate,
            );
            if (isMermaidErrorSvg(renderedSvg)) {
              continue;
            }

            if (isMounted) {
              setSvg(renderedSvg);
              setStatus(index === 0 ? "ready" : "recovered");
            }
            return;
          } catch {
            // Try the next, more defensive candidate.
          }
        }

        if (isMounted) {
          setSvg(createSourceSvg(normalizedChart, colorMode));
          setStatus("recovered");
        }
      } catch {
        if (isMounted) {
          setSvg(createSourceSvg(normalizedChart, colorMode));
          setStatus("recovered");
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [colorMode, diagramId, normalizedChart, resolvedTheme]);

  const isReady =
    Boolean(svg) && (status === "ready" || status === "recovered");

  return (
    <div
      ref={containerRef}
      className={`mermaid-diagram is-${colorMode} is-${status}`}
    >
      {isReady ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="mermaid-diagram-placeholder" role="status">
          <strong>
            {status === "loading"
              ? "Схема Mermaid загружается"
              : "Схема Mermaid недоступна"}
          </strong>
          <span>
            {status === "loading"
              ? "Подготавливаем визуализацию."
              : "Не удалось безопасно отрисовать схему, но блок сохранён."}
          </span>
        </div>
      )}
    </div>
  );
}
