import { forwardRef, useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ContentPreviewModal from "../ContentPreviewModal";
import MermaidDiagram from "../MermaidDiagram";
import SyntaxHighlightedCode from "../SyntaxHighlightedCode";
import { getMediaUrl, MEDIA_FOLDERS } from "../../utils/media";

const allowedImageDataUrl =
  /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

function safeMarkdownUrl(url) {
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

const createMarkdownComponents = (onPreview, lessonId, blockId) => ({
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match?.[1]?.toLowerCase();
    const code = String(children).replace(/\n$/, "");

    if (language === "mermaid") {
      return (
        <button
          type="button"
          className="content-preview-trigger content-preview-diagram-trigger"
          onClick={() => onPreview({ type: "diagram", chart: code, lessonId, blockId })}
          aria-label="Открыть схему для подробного просмотра"
        >
          <MermaidDiagram chart={code} lessonId={lessonId} blockId={blockId} />
        </button>
      );
    }

    return (
      <SyntaxHighlightedCode className={className} {...props}>
        {children}
      </SyntaxHighlightedCode>
    );
  },
});

const getTextContent = (block) => {
  const candidates = [
    block?.md_content,
    block?.content,
    block?.text,
    block?.markdown,
    block?.code,
    block?.explanation,
  ];

  return (
    candidates.find((value) => typeof value === "string" && value.trim()) ?? ""
  );
};

function TextBlock({ block, index, onPreview, lessonId }) {
  const text = getTextContent(block);

  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">Блок {index + 1} · текст</div>
      {block.title && <h3>{block.title}</h3>}
      {text ? (
        <div className="lesson-markdown content-block-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={createMarkdownComponents(onPreview, lessonId, index)}
            urlTransform={safeMarkdownUrl}
          >
            {text}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="course-viewer-muted">Текстовый блок пуст.</p>
      )}
    </article>
  );
}

const quizPlaceholders = new Set(["question", "answer", "options", "todo", "tbd", "вопрос", "ответ"]);
const quizTypeTags = new Set(["multipart", "multiple_choice", "multiple-choice", "detailed_answer", "quiz_question"]);
const quizText = (value) => {
  if (Array.isArray(value)) value = value.map(quizText).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    value = value.text ?? value.value ?? value.content ?? value.parts ?? "";
    if (Array.isArray(value)) value = value.map(quizText).filter(Boolean).join("\n");
  }
  const text = typeof value === "string" ? value.trim() : "";
  return quizPlaceholders.has(text.toLowerCase()) || quizTypeTags.has(text.toLowerCase()) ? "" : text;
};

const unwrapQuizRecord = (value) => {
  let record = value;
  while (true) {
    if (Array.isArray(record) && record.length === 2 && quizTypeTags.has(String(record[0]).toLowerCase())) {
      record = record[1];
      continue;
    }
    if (record && typeof record === "object" && !Array.isArray(record)) {
      const wrapper = [...quizTypeTags].find((tag) => tag in record);
      if (wrapper) {
        record = record[wrapper];
        continue;
      }
      if (quizTypeTags.has(String(record.type).toLowerCase())) {
        const payload = record.value ?? record.data ?? record.content ?? record.parts;
        if (payload !== undefined) {
          record = payload;
          continue;
        }
      }
    }
    return record;
  }
};

const normalizeQuizOptions = (value) => {
  if (Array.isArray(value)) return value.map(quizText).filter(Boolean);
  if (typeof value === "string") return value.split(/\r?\n/).map(quizText).filter(Boolean);
  return [];
};

const normalizeQuizQuestions = (block, lessonId) => {
  const raw = Array.isArray(block?.questions) ? block.questions : [];
  const valid = [];
  let pendingQuestion = "";
  let pendingOptions = "";
  let pendingAnswer = "";
  let pendingExplanation = "";
  const commitPending = (index) => {
    if (!pendingQuestion) return;
    const options = normalizeQuizOptions(pendingOptions);
    const answerText = typeof pendingAnswer === "number" ? String(pendingAnswer) : quizText(pendingAnswer);
    const answerIndex = Number.parseInt(answerText, 10);
    const answer = Number.isInteger(answerIndex) && options[answerIndex]
      ? options[answerIndex]
      : options.find((option) => option.startsWith(`${answerText}.`) || option.startsWith(`${answerText})`)) || answerText;
    if (answer || options.length) {
      valid.push({ question: pendingQuestion, answer, options, explanation: quizText(pendingExplanation) });
    } else {
      console.error("Некорректная пара Quiz", { lessonId, index });
    }
    pendingQuestion = "";
    pendingOptions = "";
    pendingAnswer = "";
    pendingExplanation = "";
  };
  raw.forEach((entry, index) => {
    const normalizedEntry = unwrapQuizRecord(entry);
    const field = Array.isArray(normalizedEntry) ? normalizedEntry[0] : null;
    if (field === "question") {
      commitPending(index - 1);
      pendingQuestion = quizText(normalizedEntry[1]);
      if (!pendingQuestion) console.error("Некорректный Quiz question", { lessonId, index });
      return;
    }
    if (field === "options") {
      pendingOptions = normalizedEntry[1];
      return;
    }
    if (field === "explanation" || field === "rationale") {
      pendingExplanation = normalizedEntry[1];
      return;
    }
    if (field === "answer") {
      pendingAnswer = normalizedEntry[1];
      return;
    }
    if (field === "type" || field === "question_type") return;
    if (pendingQuestion) commitPending(index - 1);
    const record = normalizedEntry;
    const legacyPair = Array.isArray(record) ? record : null;
    const questionValue = unwrapQuizRecord(record?.question ?? record?.text ?? record?.prompt);
    const rawAnswer = legacyPair ? legacyPair[1] : record?.answer ?? record?.correct_answer ?? record?.expected_answer;
    const answerValue = unwrapQuizRecord(rawAnswer);
    const question = quizText(typeof questionValue === "string" ? questionValue : questionValue?.text ?? questionValue?.value);
    const options = normalizeQuizOptions(record?.options ?? record?.choices ?? answerValue?.options);
    const answer = typeof answerValue === "number"
      ? options[answerValue] ?? ""
      : quizText(typeof answerValue === "string" ? answerValue : answerValue?.answer ?? answerValue?.correct_answer ?? answerValue?.expected_answer ?? answerValue?.text ?? answerValue?.value);
    const explanation = quizText(record?.explanation ?? record?.rationale ?? answerValue?.explanation ?? answerValue?.rationale);
    if (question && (answer || options.length)) valid.push({ question, answer, options, explanation });
    else console.error("Некорректная пара Quiz", { lessonId, index });
  });
  commitPending(raw.length - 1);
  return valid;
};

function QuizBlock({ block, index, lessonId }) {
  const questions = normalizeQuizQuestions(block, lessonId);
  const reactId = useId();
  const quizId = String(reactId).replace(/[^a-zA-Z0-9_-]/g, "");
  const [expandedQuestions, setExpandedQuestions] = useState({});

  const toggleQuestion = (questionIndex) => {
    setExpandedQuestions((current) => ({
      ...current,
      [questionIndex]: !current[questionIndex],
    }));
  };

  if (!questions.length) return null;

  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">Блок {index + 1} · quiz</div>
      <h3>{block.title || "Проверочные вопросы"}</h3>
        <ol className="quiz-question-list">
          {questions.map((question, questionIndex) => {
            const title = question.question;
            const hasAnswerDetails = Boolean(question.answer || question.explanation);
            const isExpanded = Boolean(expandedQuestions[questionIndex]);
            const answerId = `quiz-answer-${quizId}-${index}-${questionIndex}`;

            return (
              <li key={`question-${questionIndex}`}>
                <button
                  type="button"
                  className="quiz-question-toggle"
                  aria-expanded={isExpanded}
                  aria-controls={hasAnswerDetails ? answerId : undefined}
                  onClick={() => toggleQuestion(questionIndex)}
                >
                  <strong>{title}</strong>
                  <span aria-hidden="true">
                    {isExpanded ? "Скрыть ответ" : "Показать ответ"}
                  </span>
                </button>
                {question.options.length > 0 && (
                  <ul className="quiz-answer-options">
                    {question.options.map((option, optionIndex) => (
                      <li key={`option-${optionIndex}`}>{option}</li>
                    ))}
                  </ul>
                )}
                {hasAnswerDetails && isExpanded && (
                  <div id={answerId} className="quiz-answer-details">
                    {question.answer && <p><strong>Ответ:</strong> {question.answer}</p>}
                    {question.explanation && <p><strong>Пояснение:</strong> {question.explanation}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
    </article>
  );
}

function VideoBlock({ block, index }) {
  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">Блок {index + 1} · видео</div>
      {block.url ? (
        <a href={safeMarkdownUrl(block.url)} target="_blank" rel="noreferrer">
          Открыть видео
        </a>
      ) : (
        <p className="course-viewer-muted">Ссылка на видео не указана.</p>
      )}
      {block.description && (
        <p className="course-viewer-muted">{block.description}</p>
      )}
    </article>
  );
}

function ImageBlock({ block, index, ownerUserId }) {
  const imageUrl = block.image_id
    ? getMediaUrl(ownerUserId, MEDIA_FOLDERS.COURSE_IMAGES, block.image_id)
    : block.image_url;
  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">
        Блок {index + 1} · изображение
      </div>
      {imageUrl ? (
        <img
          className="content-block-image"
          src={safeMarkdownUrl(imageUrl)}
          alt=""
        />
      ) : (
        <p className="course-viewer-muted">Изображение не указано.</p>
      )}
    </article>
  );
}

function MermaidBlock({ block, index, onPreview, lessonId }) {
  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">Блок {index + 1} · mermaid</div>
      {block.title && <h3>{block.title}</h3>}
      {block.md_content ? (
        <button
          type="button"
          className="content-preview-trigger content-preview-diagram-trigger"
          onClick={() =>
            onPreview({
              type: "diagram",
              chart: block.md_content,
              lessonId,
              blockId: index,
            })
          }
          aria-label={`Открыть схему${block.title ? `: ${block.title}` : ""}`}
        >
          <MermaidDiagram chart={block.md_content} lessonId={lessonId} blockId={index} />
        </button>
      ) : (
        <p className="course-viewer-muted">Код диаграммы отсутствует.</p>
      )}
      {block.explanation && (
        <p className="course-viewer-muted">{block.explanation}</p>
      )}
    </article>
  );
}

function FormulaBlock({ block, index, label }) {
  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">
        Блок {index + 1} · {label}
      </div>
      {block.formula ? (
        <pre className="content-block-pre">{block.formula}</pre>
      ) : (
        <p className="course-viewer-muted">Формула не указана.</p>
      )}
      {block.explanation && (
        <p className="course-viewer-muted">{block.explanation}</p>
      )}
    </article>
  );
}

function CodeBlock({ block, index }) {
  const code = typeof block?.code === "string" ? block.code : "";

  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">
        Блок {index + 1} · код{block.language ? ` · ${block.language}` : ""}
      </div>
      {block.title && <h3>{block.title}</h3>}
      {code ? (
        <pre className="content-block-code">{code}</pre>
      ) : (
        <p className="course-viewer-muted">Код в блоке отсутствует.</p>
      )}
      {typeof block.explanation === "string" && block.explanation && (
        <p className="course-viewer-muted">{block.explanation}</p>
      )}
    </article>
  );
}

function UnsupportedBlock({ block, index }) {
  return (
    <article className="content-block-card content-block-unsupported">
      <div className="course-viewer-eyebrow">Блок {index + 1}</div>
      <h3>Тип блока не поддерживается</h3>
      <p className="course-viewer-muted">
        Не удалось безопасно отобразить блок типа "
        {block?.content_type || "unknown"}".
      </p>
    </article>
  );
}

function getBlockContentType(block) {
  const rawType = String(
    block?.content_type ||
      block?.contentType ||
      block?.block_type ||
      block?.type ||
      "text",
  ).toLowerCase();
  const aliases = {
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

function renderContentBlock(block, index, onPreview, ownerUserId, lessonId) {
  const normalizedBlock = {
    ...block,
    content_type: getBlockContentType(block),
  };

  switch (normalizedBlock.content_type) {
    case "text":
      return (
        <TextBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
          onPreview={onPreview}
          lessonId={lessonId}
        />
      );
    case "video":
      return (
        <VideoBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
        />
      );
    case "image":
      return (
        <ImageBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
          ownerUserId={ownerUserId}
        />
      );
    case "quiz":
      return (
        <QuizBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
          lessonId={lessonId}
        />
      );
    case "program_code":
      return (
        <CodeBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
        />
      );
    case "mermaid":
      return (
        <MermaidBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
          onPreview={onPreview}
          lessonId={lessonId}
        />
      );
    case "math_formula":
      return (
        <FormulaBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
          label="формула"
        />
      );
    case "chemical_formula":
      return (
        <FormulaBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
          label="химия"
        />
      );
    case "musical_notation":
      return (
        <FormulaBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
          label="ноты"
        />
      );
    default:
      return (
        <UnsupportedBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
        />
      );
  }
}

const ContentBlocks = forwardRef(function ContentBlocks(
  { blocks, ownerUserId, lessonId },
  ref,
) {
  const [preview, setPreview] = useState(null);

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return (
      <article ref={ref} className="course-viewer-card theory-section">
        <h2>Теория урока</h2>
        <p className="course-viewer-muted">
          В уроке пока нет теоретических блоков.
        </p>
      </article>
    );
  }

  return (
    <section
      className="course-viewer-card theory-section"
      aria-labelledby="theory-title"
    >
      <h2 id="theory-title">Теория урока</h2>
      <div ref={ref} className="content-blocks-list">
        {blocks.map((block, index) =>
          renderContentBlock(block, index, setPreview, ownerUserId, lessonId),
        )}
      </div>
      <ContentPreviewModal preview={preview} onClose={() => setPreview(null)} />
    </section>
  );
});

export default ContentBlocks;
