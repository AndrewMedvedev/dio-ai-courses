import { withoutEmptyValues } from "@/shared/lib/object";
import { getMediaId } from "@/shared/lib/media";
import type { ContentBlock, QuizQuestion, RawApiRecord } from "../model/types";

/** Теория урока: массив блоков, объект с блоками/markdown или просто строка. */
type TheorySource = RawApiRecord | string | null | undefined;

export function contentBlockToMarkdown(
  block: RawApiRecord | null | undefined,
): string {
  if (!block || typeof block !== "object") return "";

  if (block.content_type === "text") return block.md_content || "";
  if (block.content_type === "video") {
    return [block.url ? `[Видео](${block.url})` : "", block.description]
      .filter(Boolean)
      .join("\n\n");
  }
  if (block.content_type === "image")
    return block.image_id ? `Изображение: ${block.image_id}` : "";
  if (block.content_type === "program_code") {
    return [
      `\`\`\`${block.language || "text"}\n${block.code || ""}\n\`\`\``,
      block.explanation,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (block.content_type === "mermaid") {
    return [
      block.title ? `### ${block.title}` : "",
      `\`\`\`mermaid\n${block.md_content || ""}\n\`\`\``,
      block.explanation,
    ]
      .filter(Boolean)
      .join("\n\n");
  }
  if (block.content_type === "quiz") {
    return (block.questions || [])
      .map((question: RawApiRecord, index: number) => {
        const title = question?.question || `Вопрос ${index + 1}`;
        return [`${index + 1}. **${title}**`, question?.answer]
          .filter(Boolean)
          .join("\n\n");
      })
      .join("\n\n");
  }
  return [block.formula, block.explanation].filter(Boolean).join("\n\n");
}

export function lessonMarkdownFromBlocks(
  contentBlocks: RawApiRecord[] | null | undefined,
): string {
  return (contentBlocks || [])
    .map(contentBlockToMarkdown)
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export const SUPPORTED_CONTENT_TYPES = new Set<string>([
  "text",
  "video",
  "image",
  "program_code",
  "mermaid",
  "quiz",
  "math_formula",
  "chemical_formula",
  "musical_notation",
]);

function normalizeQuizQuestionPayload(question: unknown): QuizQuestion {
  let record = question as RawApiRecord;
  if (Array.isArray(record)) {
    if (
      ["multipart", "multiple_choice", "detailed_answer"].includes(
        String(record[0]).toLowerCase(),
      )
    ) {
      return normalizeQuizQuestionPayload(record[1]);
    }
    return {
      question: record[0] ?? "",
      answer: record[1] ?? "",
    };
  }
  if (!record || typeof record !== "object")
    return { question: "", answer: "" };
  for (const tag of ["multipart", "multiple_choice", "detailed_answer"]) {
    if (tag in record) {
      record = record[tag];
      break;
    }
  }
  const answerValue =
    record.answer ?? record.correct_answer ?? record.expected_answer ?? "";
  const answerRecord =
    answerValue && typeof answerValue === "object" ? answerValue : null;
  const options =
    record.options ?? record.choices ?? answerRecord?.options ?? [];
  const correctAnswer =
    typeof answerValue === "number"
      ? (options[answerValue] ?? "")
      : typeof answerValue === "string"
        ? answerValue
        : (answerRecord?.answer ??
          answerRecord?.correct_answer ??
          answerRecord?.expected_answer ??
          answerRecord?.text ??
          "");
  return {
    question: record.question ?? record.text ?? record.prompt ?? "",
    options,
    answer: correctAnswer,
    explanation:
      record.explanation ??
      record.rationale ??
      answerRecord?.explanation ??
      answerRecord?.rationale ??
      "",
  };
}

/** Готовит контент-блок к отправке на бэкенд: только поддерживаемые типы и поля. */
export function sanitizeContentBlock(block: unknown): ContentBlock {
  const source: RawApiRecord =
    block && typeof block === "object" ? block : { content: block };
  const contentType = normalizeContentType(source);
  if (!SUPPORTED_CONTENT_TYPES.has(contentType)) {
    return {
      content_type: "text",
      ai_generated:
        typeof source.ai_generated === "boolean" ? source.ai_generated : false,
      md_content: String(source.md_content ?? source.content ?? block ?? ""),
      ...(Array.isArray(source.sources) ? { sources: source.sources } : {}),
    };
  }

  const payload = withoutEmptyValues({
    ...source,
    id: undefined,
    type: undefined,
    contentType: undefined,
    block_type: undefined,
    content_type: contentType,
    ai_generated:
      typeof source.ai_generated === "boolean" ? source.ai_generated : false,
  }) as ContentBlock;

  if (contentType === "text") {
    payload.md_content =
      source.md_content ??
      source.mdContent ??
      source.markdown ??
      source.text ??
      source.content ??
      "";
  } else if (contentType === "image") {
    payload.image_id = getMediaId(
      source.image_id ??
        source.imageId ??
        source.image_url ??
        source.imageUrl ??
        source.url ??
        "",
    );
    delete payload.image_url;
    delete payload.imageUrl;
  } else if (contentType === "video") {
    payload.url = source.url ?? "";
    payload.description = source.description ?? "";
  } else if (contentType === "program_code") {
    payload.language = source.language ?? "text";
    payload.code = source.code ?? "";
    payload.explanation = source.explanation ?? "";
  } else if (contentType === "mermaid") {
    payload.title = source.title ?? "";
    payload.md_content =
      source.md_content ?? source.mdContent ?? source.content ?? "";
    payload.explanation = source.explanation ?? "";
  } else if (contentType === "quiz") {
    const questions = Array.isArray(source.questions) ? source.questions : [];
    const questionFields = new Set([
      "question",
      "answer",
      "options",
      "explanation",
      "rationale",
    ]);
    const isFieldPairs =
      questions.length > 0 &&
      questions.every(
        (entry) =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          questionFields.has(entry[0]),
      );
    payload.questions = isFieldPairs
      ? [normalizeQuizQuestionPayload(Object.fromEntries(questions))]
      : questions.map(normalizeQuizQuestionPayload);
  } else {
    payload.formula = source.formula ?? "";
    payload.explanation = source.explanation ?? "";
  }

  return payload;
}

export function normalizeContentType(
  block: RawApiRecord | null | undefined,
): string {
  const rawType = String(
    block?.content_type ||
      block?.contentType ||
      block?.block_type ||
      block?.type ||
      "text",
  ).toLowerCase();
  const aliases: Record<string, string> = {
    markdown: "text",
    md: "text",
    theory: "text",
    lecture: "text",
    code: "program_code",
    program: "program_code",
    diagram: "mermaid",
    question: "quiz",
    questions: "quiz",
    test: "quiz",
  };

  return aliases[rawType] || rawType;
}

/** Приводит контент-блок с бэкенда к одному формату (типы-синонимы, camelCase). */
export function normalizeContentBlock(block: unknown): ContentBlock {
  const source: RawApiRecord =
    block && typeof block === "object" ? block : { content: block };
  const contentType = normalizeContentType(source);
  const normalized: ContentBlock = {
    ...source,
    content_type: contentType,
    ai_generated:
      typeof source.ai_generated === "boolean" ? source.ai_generated : false,
  };

  if (contentType === "text") {
    normalized.md_content = String(
      source.md_content ??
        source.mdContent ??
        source.markdown ??
        source.text ??
        source.content ??
        source.theory ??
        "",
    );
  } else if (contentType === "image") {
    normalized.image_id = getMediaId(
      source.image_id ??
        source.imageId ??
        source.image_url ??
        source.imageUrl ??
        source.url ??
        source.src ??
        "",
    );
  } else if (contentType === "program_code") {
    normalized.language = String(source.language ?? source.lang ?? "text");
    normalized.code = String(source.code ?? source.content ?? "");
    normalized.explanation = String(
      source.explanation ?? source.description ?? "",
    );
  } else if (contentType === "mermaid") {
    normalized.md_content = String(
      source.md_content ??
        source.mdContent ??
        source.code ??
        source.content ??
        "",
    );
    normalized.explanation = String(
      source.explanation ?? source.description ?? "",
    );
  } else if (contentType === "quiz") {
    normalized.questions = Array.isArray(source.questions)
      ? source.questions
      : Array.isArray(source.items)
        ? source.items
        : [];
  }

  return normalized;
}

function readTheoryContentBlocks(data: TheorySource): unknown[] | null {
  if (Array.isArray(data)) {
    return data;
  }
  if (!data || typeof data !== "object") {
    return null;
  }

  const directBlocks =
    data.content_blocks ||
    data.contentBlocks ||
    data.theory_blocks ||
    data.theoryBlocks ||
    data.blocks ||
    data.items ||
    data.results ||
    null;

  if (Array.isArray(directBlocks)) {
    return directBlocks;
  }

  const nestedSources = [
    data.data,
    data.lesson,
    data.lesson_theory,
    data.lessonTheory,
    data.theory,
    data.content,
  ];

  for (const source of nestedSources) {
    const nestedBlocks = readTheoryContentBlocks(source);
    if (Array.isArray(nestedBlocks)) {
      return nestedBlocks;
    }
  }

  return null;
}

function readTheoryMarkdown(data: TheorySource): string {
  if (typeof data === "string") {
    return data;
  }
  if (!data || typeof data !== "object") {
    return "";
  }

  const markdown =
    data.markdown || data.md_content || data.mdContent || data.text || null;

  if (typeof markdown === "string") {
    return markdown;
  }
  if (typeof data.content === "string") {
    return data.content;
  }
  if (typeof data.theory === "string") {
    return data.theory;
  }

  const nestedSources = [
    data.data,
    data.lesson,
    data.lesson_theory,
    data.lessonTheory,
    data.theory,
    data.content,
  ];

  for (const source of nestedSources) {
    const nestedMarkdown = readTheoryMarkdown(source);
    if (nestedMarkdown) {
      return nestedMarkdown;
    }
  }

  return "";
}

export function normalizeTheoryContentBlocks(
  data: TheorySource,
): ContentBlock[] {
  const rawBlocks = readTheoryContentBlocks(data);

  if (Array.isArray(rawBlocks)) {
    return rawBlocks.map(normalizeContentBlock).filter(Boolean);
  }

  const markdown = readTheoryMarkdown(data);

  return markdown
    ? [
        normalizeContentBlock({
          content_type: "text",
          ai_generated: false,
          md_content: markdown,
        }),
      ]
    : [];
}
