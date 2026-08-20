import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MermaidDiagram from "../MermaidDiagram";
import SyntaxHighlightedCode from "../SyntaxHighlightedCode";

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

const markdownComponents = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match?.[1]?.toLowerCase();
    const code = String(children).replace(/\n$/, "");

    if (language === "mermaid") {
      return <MermaidDiagram chart={code} />;
    }

    return (
      <SyntaxHighlightedCode className={className} {...props}>
        {children}
      </SyntaxHighlightedCode>
    );
  },
};

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

function TextBlock({ block, index }) {
  const text = getTextContent(block);

  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">Блок {index + 1} · текст</div>
      {block.title && <h3>{block.title}</h3>}
      {text ? (
        <div className="lesson-markdown content-block-markdown">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
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

function QuizBlock({ block, index }) {
  const questions = Array.isArray(block?.questions) ? block.questions : [];

  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">Блок {index + 1} · quiz</div>
      <h3>{block.title || "Проверочные вопросы"}</h3>
      {questions.length > 0 ? (
        <ol className="quiz-question-list">
          {questions.map((question, questionIndex) => {
            const questionParts = Array.isArray(question)
              ? question
              : [question];
            const title = question?.question || questionParts[0];
            const details =
              question?.answer || questionParts.slice(1).join("\n");

            return (
              <li key={`question-${questionIndex}`}>
                <strong>{typeof title === "string" ? title : "Вопрос"}</strong>
                {details && <pre className="content-block-pre">{details}</pre>}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="course-viewer-muted">Вопросы в quiz-блоке отсутствуют.</p>
      )}
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

function ImageBlock({ block, index }) {
  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">
        Блок {index + 1} · изображение
      </div>
      {block.image_url ? (
        <img
          className="content-block-image"
          src={safeMarkdownUrl(block.image_url)}
          alt=""
        />
      ) : (
        <p className="course-viewer-muted">Изображение не указано.</p>
      )}
    </article>
  );
}

function MermaidBlock({ block, index }) {
  return (
    <article className="content-block-card">
      <div className="course-viewer-eyebrow">Блок {index + 1} · mermaid</div>
      {block.title && <h3>{block.title}</h3>}
      {block.md_content ? (
        <MermaidDiagram chart={block.md_content} />
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

function renderContentBlock(block, index) {
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
        />
      );
    case "quiz":
      return (
        <QuizBlock
          key={`content-${index}`}
          block={normalizedBlock}
          index={index}
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

export default function ContentBlocks({ blocks }) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return (
      <article className="course-viewer-card theory-section">
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
      <div className="content-blocks-list">
        {blocks.map((block, index) => renderContentBlock(block, index))}
      </div>
    </section>
  );
}
