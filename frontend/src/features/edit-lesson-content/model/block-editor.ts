// Блоки контента урока в редакторе: типы, шаблоны, нормализация и перевод в Markdown.
import { getMediaId } from "@/shared/lib/media";
import type { RawApiRecord } from "@/shared/api";

export const MAX_CONTENT_BLOCKS = 10;

export type EditorBlockType =
  | "text"
  | "video"
  | "image"
  | "program_code"
  | "mermaid"
  | "quiz"
  | "math_formula"
  | "chemical_formula"
  | "musical_notation";

export interface EditorQuestion {
  question: string;
  answer: string;
  options?: string[];
  explanation?: string;
}

/** Блок в редакторе: поля зависят от типа, лишние не заполняются. */
export interface EditorBlock {
  id?: string;
  type: EditorBlockType;
  content_type: EditorBlockType;
  ai_generated: boolean;
  md_content?: string;
  url?: string;
  description?: string;
  image_id?: string;
  language?: string;
  code?: string;
  explanation?: string;
  title?: string;
  questions?: EditorQuestion[];
  formula?: string;
  sources?: string[];
}

/** Блок в состоянии редактора: id есть всегда. */
export type EditorBlockWithId = EditorBlock & { id: string };

/** Блок для отправки на backend: без служебных полей интерфейса. */
export type EditorBlockPayload = Omit<EditorBlock, "id" | "type">;

export type EditorBlockFields = Partial<Omit<EditorBlock, "id" | "type">>;

export interface EditorBlockTypeInfo {
  id: EditorBlockType;
  contentType: EditorBlockType;
  label: string;
  hint: string;
  template: EditorBlockFields;
}

export const blockTypes: EditorBlockTypeInfo[] = [
  {
    id: "text",
    contentType: "text",
    label: "Текст",
    hint: "Markdown-лекция",
    template: { md_content: "Новый текстовый блок." },
  },
  {
    id: "video",
    contentType: "video",
    label: "Видео",
    hint: "Ссылка и описание",
    template: { url: "", description: "" },
  },
  {
    id: "image",
    contentType: "image",
    label: "Изображение",
    hint: "Файл в хранилище",
    template: { image_id: "" },
  },
  {
    id: "program_code",
    contentType: "program_code",
    label: "Код",
    hint: "Язык, код и пояснение",
    template: { language: "python", code: "", explanation: "" },
  },
  {
    id: "mermaid",
    contentType: "mermaid",
    label: "Схема",
    hint: "Mermaid-диаграмма",
    template: {
      title: "Новая диаграмма",
      md_content: "flowchart TD\n  A[Начало] --> B[Шаг]",
      explanation: "",
    },
  },
  {
    id: "quiz",
    contentType: "quiz",
    label: "Quiz",
    hint: "Вопросы и ответы",
    template: { questions: [{ question: "", answer: "" }] },
  },
  {
    id: "math_formula",
    contentType: "math_formula",
    label: "Формула",
    hint: "Математическая формула",
    template: { formula: "", explanation: "" },
  },
  {
    id: "chemical_formula",
    contentType: "chemical_formula",
    label: "Химия",
    hint: "Химическая формула",
    template: { formula: "", explanation: "" },
  },
  {
    id: "musical_notation",
    contentType: "musical_notation",
    label: "Ноты",
    hint: "Нотная запись",
    template: { formula: "", explanation: "" },
  },
];

const blockTypeById = new Map<string, EditorBlockTypeInfo>(
  blockTypes.map((type) => [type.id, type]),
);
const blockTypeByContentType = new Map<string, EditorBlockTypeInfo>(
  blockTypes.map((type) => [type.contentType, type]),
);

export const templates = Object.fromEntries(
  blockTypes.map((type) => [type.id, type.template]),
) as Record<EditorBlockType, EditorBlockFields>;

export const allowedImageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
export const allowedImageExtension = /\.(png|jpe?g|webp|gif)$/i;
export const allowedTextExtension =
  /\.(pdf|docx|pptx|xlsx|md|markdown|html|txt|json|sql|js|jsx|ts|tsx|py|csv)$/i;
const allowedImageDataUrl =
  /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

export function safeMarkdownUrl(url: string): string {
  const value = String(url || "").trim();
  if (allowedImageDataUrl.test(value)) {
    return value;
  }
  if (/^(https?:|mailto:|tel:)/i.test(value)) {
    return value;
  }
  if (/^(\/|\.{1,2}\/|#)/.test(value)) {
    return value;
  }
  return value.includes(":") ? "" : value;
}

const nextId = () =>
  `content-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const isFenceStart = (line: string) => /^\s*(```|~~~)/.test(line);
const isTableSeparator = (line: string) =>
  /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const isTableRow = (line: string) =>
  line.trim().includes("|") && !isFenceStart(line);
const isStandaloneSeparator = (value: string) => /^\s*-{2,}\s*$/.test(value);

export function detectType(content: string): EditorBlockType {
  const trimmed = content.trim();
  if (/^```mermaid/i.test(trimmed)) {
    return "mermaid";
  }
  if (/^```/i.test(trimmed) || /^~~~/i.test(trimmed)) {
    return "program_code";
  }
  const lines = trimmed.split("\n");
  if (lines.length > 1 && isTableRow(lines[0]) && isTableSeparator(lines[1])) {
    return "text";
  }
  return "text";
}

function parseCodeFence(
  content: string,
): { language: string; code: string } | null {
  const match = /^```([^\n`]*)\n([\s\S]*?)\n```\s*$/m.exec(content.trim());
  if (!match) {
    return null;
  }
  return {
    language: match[1]?.trim() || "text",
    code: match[2] || "",
  };
}

function normalizeQuestion(rawQuestion: unknown): EditorQuestion {
  const question = rawQuestion as RawApiRecord | unknown[] | string | null;
  if (Array.isArray(question)) {
    if (["multipart", "multiple_choice", "detailed_answer"].includes(String(question[0]).toLowerCase())) {
      return normalizeQuestion(question[1]);
    }
    return {
      question: typeof question[0] === "string" ? question[0] : "",
      answer: question.slice(1).filter(Boolean).join("\n"),
      options: [],
      explanation: "",
    };
  }
  if (question && typeof question === "object") {
    const wrapper = question.multipart ?? question.multiple_choice ?? question.detailed_answer;
    if (wrapper) return normalizeQuestion(wrapper);
    const options = Array.isArray(question.options)
      ? question.options
      : typeof question.options === "string"
        ? question.options.split(/\r?\n/).filter(Boolean)
        : [];
    const rawAnswer = question.answer ?? question.correct_answer ?? question.expected_answer ?? "";
    return {
      question: question.question || question.text || question.prompt || "",
      answer: typeof rawAnswer === "number" ? options[rawAnswer] || "" : rawAnswer,
      options,
      explanation: question.explanation || question.rationale || "",
    };
  }
  return { question: typeof question === "string" ? question : "", answer: "", options: [], explanation: "" };
}

export function createBlock(
  templateOrContent: string | EditorBlockFields | null | undefined,
  type: string = "text",
): EditorBlockWithId {
  const blockType = blockTypeById.get(type) || blockTypes[0];
  const initialData =
    typeof templateOrContent === "string"
      ? markdownToTypedData(templateOrContent, blockType.id)
      : { ...clone(blockType.template), ...(templateOrContent || {}) };

  return normalizeContentBlock(
    {
      content_type: blockType.contentType,
      ai_generated: false,
      ...initialData,
    },
    true,
  );
}

function markdownToTypedData(
  content: string,
  type: string = detectType(content),
): EditorBlockFields {
  if (type === "program_code") {
    const parsedFence = parseCodeFence(content);
    return parsedFence
      ? { ...parsedFence, explanation: "" }
      : { language: "text", code: content.trim(), explanation: "" };
  }

  if (type === "mermaid") {
    const parsedFence = parseCodeFence(content);
    return {
      title: "Диаграмма",
      md_content: parsedFence?.code || content.trim(),
      explanation: "",
    };
  }

  return { md_content: content.trim() };
}

export function normalizeContentBlock(
  block: unknown,
  ensureId: true,
): EditorBlockWithId;
export function normalizeContentBlock(
  block: unknown,
  ensureId?: boolean,
): EditorBlock;
export function normalizeContentBlock(
  block: unknown,
  ensureId = false,
): EditorBlock {
  const source: RawApiRecord =
    block && typeof block === "object" ? (block as RawApiRecord) : {};
  const contentType: string = blockTypeByContentType.has(source.content_type)
    ? source.content_type
    : (blockTypeById.get(source.type)?.contentType ?? "text");
  const blockType = blockTypeByContentType.get(contentType) || blockTypes[0];
  const normalized: EditorBlock = {
    id: source.id || (ensureId ? nextId() : undefined),
    type: blockType.id,
    content_type: blockType.contentType,
    ai_generated:
      typeof source.ai_generated === "boolean" ? source.ai_generated : false,
    ...clone(blockType.template),
  };

  if (contentType === "text") {
    normalized.md_content = String(
      source.md_content ??
        source.content ??
        source.text ??
        source.markdown ??
        "",
    );
  } else if (contentType === "video") {
    normalized.url = String(source.url ?? "");
    normalized.description = String(source.description ?? "");
  } else if (contentType === "image") {
    normalized.image_id = getMediaId(
      source.image_id ?? source.imageId ?? source.image_url ?? source.url ?? "",
    );
  } else if (contentType === "program_code") {
    normalized.language = String(source.language ?? "text");
    normalized.code = String(source.code ?? "");
    normalized.explanation = String(source.explanation ?? "");
  } else if (contentType === "mermaid") {
    normalized.title = String(source.title ?? "Диаграмма");
    normalized.md_content = String(source.md_content ?? source.content ?? "");
    normalized.explanation = String(source.explanation ?? "");
  } else if (contentType === "quiz") {
    const questions: unknown[] = Array.isArray(source.questions)
      ? source.questions
      : source.questions && typeof source.questions === "object"
        ? [source.questions]
        : [];
    normalized.questions = questions.length
      ? questions.map(normalizeQuestion)
      : [{ question: "", answer: "" }];
  } else {
    normalized.formula = String(source.formula ?? "");
    normalized.explanation = String(source.explanation ?? "");
  }

  // Источники блока не редактируются в форме, но не должны теряться при сохранении.
  const sources = normalizeBlockSources(source.sources);
  if (sources) normalized.sources = sources;

  return normalized;
}

function normalizeBlockSources(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) =>
      item && typeof item === "object"
        ? String(item.url || item.href || item.title || "").trim()
        : String(item ?? "").trim(),
    )
    .filter(Boolean);
}

export function normalizeContentBlocks(
  blocks: unknown,
  fallbackMarkdown = "",
): EditorBlockWithId[] {
  if (Array.isArray(blocks) && blocks.length > 0) {
    return blocks.map((block) => normalizeContentBlock(block, true));
  }
  return splitMarkdown(fallbackMarkdown);
}

export function stripUiFields(block: unknown): EditorBlockPayload {
  const normalized = normalizeContentBlock(block);
  const payload: EditorBlockPayload = {
    content_type: normalized.content_type,
    ai_generated: false,
  };

  if (normalized.content_type === "text") {
    payload.md_content = normalized.md_content;
  } else if (normalized.content_type === "video") {
    payload.url = normalized.url;
    payload.description = normalized.description;
  } else if (normalized.content_type === "image") {
    payload.image_id = normalized.image_id;
  } else if (normalized.content_type === "program_code") {
    payload.language = normalized.language;
    payload.code = normalized.code;
    payload.explanation = normalized.explanation;
  } else if (normalized.content_type === "mermaid") {
    payload.title = normalized.title;
    payload.md_content = normalized.md_content;
    payload.explanation = normalized.explanation;
  } else if (normalized.content_type === "quiz") {
    payload.questions = (normalized.questions || []).map(normalizeQuestion);
  } else {
    payload.formula = normalized.formula;
    payload.explanation = normalized.explanation;
  }

  if (Array.isArray(normalized.sources)) {
    payload.sources = normalized.sources;
  }

  return payload;
}

export function splitMarkdown(
  markdown: string | null | undefined,
): EditorBlockWithId[] {
  const source = (markdown || "").trim();
  if (!source) {
    return [createBlock(templates.text, "text")];
  }

  const lines = source.split("\n");
  const blocks: EditorBlockWithId[] = [];
  let buffer: string[] = [];

  const flushText = () => {
    const content = buffer.join("\n").trim();
    if (content && !isStandaloneSeparator(content)) {
      blocks.push(createBlock(content, detectType(content)));
    }
    buffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isFenceStart(line)) {
      flushText();
      const fence = line.trim().slice(0, 3);
      const fenceLines = [line];
      index += 1;
      while (index < lines.length) {
        fenceLines.push(lines[index]);
        if (lines[index].trim().startsWith(fence)) {
          break;
        }
        index += 1;
      }
      const content = fenceLines.join("\n");
      blocks.push(createBlock(content, detectType(content)));
      continue;
    }

    if (!line.trim() || isStandaloneSeparator(line)) {
      flushText();
      continue;
    }

    buffer.push(line);
  }

  flushText();
  return blocks.length > 0 ? blocks : [createBlock(templates.text, "text")];
}

export function blockToMarkdown(block: unknown): string {
  const normalized = normalizeContentBlock(block);

  if (normalized.content_type === "text") {
    return (normalized.md_content ?? "").trim();
  }
  if (normalized.content_type === "video") {
    return [
      normalized.url ? `[Видео](${normalized.url})` : "Видео без ссылки",
      normalized.description,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (normalized.content_type === "image") {
    return normalized.image_id ? `Изображение: ${normalized.image_id}` : "";
  }
  if (normalized.content_type === "program_code") {
    return [
      `\`\`\`${normalized.language || "text"}\n${normalized.code}\n\`\`\``,
      normalized.explanation,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (normalized.content_type === "mermaid") {
    return [
      normalized.title ? `### ${normalized.title}` : "",
      `\`\`\`mermaid\n${normalized.md_content}\n\`\`\``,
      normalized.explanation,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (normalized.content_type === "quiz") {
    return (normalized.questions || [])
      .map((question, index) =>
        [`${index + 1}. **${question.question || "Вопрос"}**`, question.answer]
          .filter(Boolean)
          .join("\n\n"),
      )
      .join("\n\n");
  }

  return [normalized.formula, normalized.explanation]
    .filter(Boolean)
    .join("\n\n");
}

export function joinBlocks(blocks: unknown[]): string {
  return blocks
    .map(blockToMarkdown)
    .map((content) => content.trim())
    .filter((content) => content && !isStandaloneSeparator(content))
    .join("\n\n");
}

export function getBlockTitle(block: unknown): string {
  const normalized = normalizeContentBlock(block);
  const blockType = blockTypeByContentType.get(normalized.content_type);
  const prefix = blockType?.label || "Блок";

  if (normalized.content_type === "text") {
    return (
      (normalized.md_content ?? "")
        .split("\n")
        .find((line) => line.trim())
        ?.replace(/^#{1,6}\s*/, "")
        .slice(0, 52) || prefix
    );
  }
  if (normalized.content_type === "mermaid") {
    return normalized.title || prefix;
  }
  if (normalized.content_type === "program_code") {
    return `${prefix}${normalized.language ? ` · ${normalized.language}` : ""}`;
  }
  if (normalized.content_type === "quiz") {
    return `${prefix} · ${(normalized.questions || []).length} вопрос(ов)`;
  }
  if (normalized.content_type === "video") {
    return normalized.url || prefix;
  }
  if (normalized.content_type === "image") {
    return normalized.image_id || prefix;
  }
  return normalized.formula || prefix;
}
