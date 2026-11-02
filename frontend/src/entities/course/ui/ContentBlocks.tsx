import {
  forwardRef,
  useId,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RawApiRecord } from "@/shared/api";
import { getMediaUrl, MEDIA_FOLDERS } from "@/shared/lib/media";
import {
  ContentPreviewModal,
  type ContentPreview,
} from "@/shared/ui/content-preview";
import { MermaidDiagram } from "@/shared/ui/mermaid-diagram";
import { SyntaxHighlightedCode } from "@/shared/ui/syntax-highlighted-code";
import { normalizeQuizQuestions } from "../lib/quiz";
import { ContentBlockSources, hasSources } from "./ContentBlockSources";

/** Блок урока в любом из форматов бэкенда. */
type BlockData = RawApiRecord;
type OnPreview = (preview: ContentPreview) => void;

interface BlockProps {
  block: BlockData;
  index: number;
}

export interface ContentBlocksProps {
  blocks: BlockData[] | null | undefined;
  /** Владелец картинок курса: из его папки в хранилище берутся изображения. */
  ownerUserId?: string | null;
  lessonId?: string | null;
}

const allowedImageDataUrl =
  /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

function safeMarkdownUrl(url: unknown): string {
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

const createMarkdownComponents = (
  onPreview: OnPreview,
  lessonId: string | null | undefined,
  blockId: number,
): Components => ({
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match?.[1]?.toLowerCase();
    const code = String(children).replace(/\n$/, "");

    if (language === "mermaid") {
      return (
        <button
          type="button"
          className="content-preview-trigger content-preview-diagram-trigger tw:block tw:w-[100%] tw:m-[12px_0] tw:p-[0] tw:text-left tw:text-[0.96rem] tw:leading-[1.45] tw:[border:0] tw:[background:transparent] tw:[cursor:zoom-in] tw:focus-visible:[outline:2px_solid_rgba(var(--accent-rgb),_0.84)] tw:focus-visible:[outline-offset:3px]"
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

const getTextContent = (block: BlockData): string => {
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

function TextBlock({
  block,
  index,
  onPreview,
  lessonId,
}: BlockProps & { onPreview: OnPreview; lessonId?: string | null }) {
  const text = getTextContent(block);

  return (
    <article className="content-block-card tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[14px] tw:p-[14px] tw:w-[100%] tw:min-w-[0] tw:max-w-[100%] tw:overflow-hidden tw:text-(--text) tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[box-shadow:none] tw:[-webkit-backdrop-filter:none] tw:[backdrop-filter:none] tw:dark:text-[#f4ead8] tw:dark:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:text-[#f7dca8]">Блок {index + 1} · текст</div>
      {block.title && <h3>{block.title}</h3>}
      {text ? (
        <div className="lesson-markdown content-block-markdown tw:border-none tw:border-[rgba(var(--accent-rgb),_0.38)] tw:p-[clamp(20px,_2.6vw,_32px)] tw:mt-[18px] tw:rounded-[18px] tw:w-[100%] tw:min-w-[0] tw:max-w-[100%] tw:overflow-x-clip tw:overflow-y-visible tw:[border-width:0] tw:[background:linear-gradient(145deg,_rgba(255,_255,_255,_0.35),_rgba(255,_255,_255,_0.12))] tw:dark:[box-shadow:none] tw:dark:[&&&&]:[background:linear-gradient(145deg,_rgba(255,_255,_255,_0.07),_rgba(255,_255,_255,_0.025))] tw:[.lesson-editor-block-select_&_>_:first-child]:mt-[0] tw:[.lesson-editor-block-select_&_>_:last-child]:mb-[0] tw:[&_>_:first-child]:mt-[0] tw:[&_>_:last-child]:mb-[0] tw:[&_p]:max-w-[100%] tw:[&_p]:text-(--muted) tw:[&_p]:leading-[1.5] tw:[&_p]:wrap-anywhere tw:dark:[.page_&_p]:text-[#e9decb] tw:[.page.is-inner-page_&_p]:text-(--text) tw:[.page.is-inner-page_&_p]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_p]:leading-[1.82] tw:[.page.is-inner-page_&_p]:tracking-[0.014em] tw:[.page.is-inner-page_&_p]:m-[0_0_18px] tw:[.generated-course-learning-grid_&_pre]:[border:1px_solid_rgba(255,_255,_255,_0.14)] tw:[.generated-course-learning-grid_&_pre]:[background:#0b1020] tw:[.generated-course-learning-grid_&_pre]:text-[#f8fafc] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:border-[rgba(247,_220,_168,_0.28)] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:[background:#050816] tw:dark:[.page_.generated-course-learning-grid_&&&_pre]:text-[#f8fafc] tw:[&_pre]:m-[10px_0] tw:[&_pre]:p-[12px] tw:[&_pre]:rounded-[12px] tw:[&_pre]:[background:rgba(0,_0,_0,_0.08)] tw:[&_pre]:overflow-x-auto tw:dark:[.page_&_pre]:[background:rgba(10,_10,_10,_0.72)] tw:dark:[.page_&_pre]:[border:1px_solid_rgba(var(--accent-rgb),_0.32)] tw:dark:[.page_&_pre]:text-[#f2e7d4] tw:[.page.is-inner-page_&_pre]:w-[100%] tw:[.page.is-inner-page_&_pre]:max-w-[100%] tw:[.page.is-inner-page_&_pre]:m-[24px_0] tw:[.page.is-inner-page_&_pre]:p-[20px] tw:[.page.is-inner-page_&_pre]:[border:1px_solid_rgba(91,_111,_138,_0.44)] tw:[.page.is-inner-page_&_pre]:rounded-[14px] tw:[.page.is-inner-page_&_pre]:[background:#202631] tw:[.page.is-inner-page_&_pre]:text-[#d8dee9] tw:[.page.is-inner-page_&_pre]:[box-shadow:0_14px_32px_rgba(31,_38,_49,_0.16),_inset_0_1px_0_rgba(255,_255,_255,_0.05)] tw:[.page.is-inner-page_&_pre]:overflow-x-auto tw:[.page.is-inner-page_&_pre]:overflow-y-hidden tw:[.page.is-inner-page_&_pre]:[overscroll-behavior-inline:contain] tw:[.page.is-inner-page_&_pre]:[tab-size:4] tw:[&_h2]:m-[0_0_10px] tw:[&_h2]:[font-family:'Unbounded',_sans-serif] tw:[&_h2]:text-[0.98rem] tw:[&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h2]:m-[34px_0_16px] tw:[.page.is-inner-page_&_h2]:text-(--heading) tw:[.page.is-inner-page_&_h2]:text-[clamp(1.3rem,_2vw,_1.65rem)] tw:[.page.is-inner-page_&_h2]:leading-[1.38] tw:[.page.is-inner-page_&_ul]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ul]:pl-[28px] tw:[&_li]:max-w-[100%] tw:[&_li]:text-(--muted) tw:[&_li]:leading-[1.5] tw:[&_li]:wrap-anywhere tw:dark:[.page_&_li]:text-[#e9decb] tw:[.page.is-inner-page_&_li]:text-(--text) tw:[.page.is-inner-page_&_li]:text-[clamp(1rem,_1.15vw,_1.08rem)] tw:[.page.is-inner-page_&_li]:leading-[1.82] tw:[.page.is-inner-page_&_li]:tracking-[0.014em] tw:[.page.is-inner-page_&_li]:pl-[5px] tw:[.page.is-inner-page_&_li::marker]:text-(--info-text) tw:[.page.is-inner-page_&_li::marker]:font-[800] tw:[&_h3]:m-[0_0_10px] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[0.98rem] tw:[&_h3]:text-(--heading) tw:[&_:not(pre)_>_code]:rounded-[7px] tw:[&_:not(pre)_>_code]:[background:rgba(var(--accent-rgb),_0.14)] tw:[&_:not(pre)_>_code]:p-[2px_5px] tw:[&_:not(pre)_>_code]:text-(--ink-accent) tw:[&_:not(pre)_>_code]:whitespace-normal tw:[&_:not(pre)_>_code]:wrap-anywhere tw:dark:[.page_&_td]:text-[#e9decb] tw:dark:[.page_&_:not(pre)_>_code]:[background:rgba(255,_255,_255,_0.09)] tw:dark:[.page_&_:not(pre)_>_code]:text-[#f7dca8] tw:[&_table]:w-[100%] tw:[&_table]:[border-collapse:collapse] tw:[&_table]:m-[12px_0] tw:[&_th]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_th]:p-[8px_10px] tw:[&_th]:text-left tw:[&_th]:text-[0.86rem] tw:[&_th]:text-(--text) tw:[&_td]:[border:1px_solid_rgba(var(--accent-rgb),_0.36)] tw:[&_td]:p-[8px_10px] tw:[&_td]:text-left tw:[&_td]:text-[0.86rem] tw:[&_td]:text-(--text) tw:[&_th]:[background:rgba(var(--accent-rgb),_0.12)] tw:dark:[.page_&_table]:[background:rgba(12,_12,_12,_0.42)] tw:dark:[.page_&_th]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_td]:border-[rgba(var(--accent-rgb),_0.5)] tw:dark:[.page_&_th]:[background:rgba(var(--accent-rgb),_0.22)] tw:dark:[.page_&_th]:text-[#fff2df] tw:[&_a]:text-(--ink-accent) tw:[&_a]:font-[700] tw:[&_img]:block tw:[&_img]:max-w-[100%] tw:[&_img]:h-[auto] tw:[&_img]:m-[12px_0] tw:[&_img]:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[&_img]:rounded-[12px] tw:[&_img]:[background:rgba(255,_255,_255,_0.34)] tw:[.content-preview-image-trigger_&_img]:m-[0] tw:dark:[.page_&_img]:border-[rgba(var(--accent-rgb),_0.46)] tw:dark:[.page_&_img]:[background:rgba(255,_255,_255,_0.08)] tw:[.page.is-inner-page_&_h3]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h4]:[font-family:'Unbounded',_sans-serif] tw:[.page.is-inner-page_&_h3]:m-[28px_0_13px] tw:[.page.is-inner-page_&_h3]:text-(--ink-accent) tw:[.page.is-inner-page_&_h3]:text-[clamp(1.08rem,_1.5vw,_1.28rem)] tw:[.page.is-inner-page_&_h3]:leading-[1.45] tw:[.page.is-inner-page_&_h4]:m-[24px_0_11px] tw:[.page.is-inner-page_&_h4]:text-(--info-text) tw:[.page.is-inner-page_&_h4]:text-[1.04rem] tw:[.page.is-inner-page_&_h4]:leading-[1.48] tw:[.page.is-inner-page_&_ol]:m-[14px_0_22px] tw:[.page.is-inner-page_&_ol]:pl-[28px] tw:[.page.is-inner-page_&_li_+_li]:mt-[8px] tw:[.page.is-inner-page_&_em]:text-(--info-text) tw:[.page.is-inner-page_&_a]:text-[#456fa8] tw:[.page.is-inner-page_&_a]:[text-decoration-thickness:1.5px] tw:[.page.is-inner-page_&_a]:[text-underline-offset:3px] tw:[.page.is-inner-page_&_blockquote]:m-[22px_0] tw:[.page.is-inner-page_&_blockquote]:[border-left:4px_solid_#c98245] tw:[.page.is-inner-page_&_blockquote]:rounded-[0_12px_12px_0] tw:[.page.is-inner-page_&_blockquote]:[background:rgba(201,_130,_69,_0.11)] tw:[.page.is-inner-page_&_blockquote]:p-[14px_18px] tw:[.page.is-inner-page_&_blockquote_p]:m-[0] tw:[.page.is-inner-page_&_blockquote_p]:text-[#79502f] tw:[.page.is-inner-page_&_blockquote_strong]:text-[#9a5f2d] tw:[.page.is-inner-page_&_hr]:h-[1px] tw:[.page.is-inner-page_&_hr]:m-[30px_0] tw:[.page.is-inner-page_&_hr]:[border:0] tw:[.page.is-inner-page_&_hr]:[background:linear-gradient(_90deg,_transparent,_rgba(var(--accent-rgb),_0.7),_transparent_)] tw:[.page.is-inner-page_&_table]:w-[100%] tw:[.page.is-inner-page_&_table]:max-w-[100%] tw:[.page.is-inner-page_&_table]:m-[22px_0] tw:[.page.is-inner-page_&_table]:[border-collapse:separate] tw:[.page.is-inner-page_&_table]:[border-spacing:0] tw:[.page.is-inner-page_&_table]:[table-layout:fixed] tw:[.page.is-inner-page_&_th]:p-[12px_14px] tw:[.page.is-inner-page_&_th]:text-[0.96rem] tw:[.page.is-inner-page_&_th]:leading-[1.58] tw:[.page.is-inner-page_&_th]:wrap-anywhere tw:[.page.is-inner-page_&_th]:[word-break:normal] tw:[.page.is-inner-page_&_td]:p-[12px_14px] tw:[.page.is-inner-page_&_td]:text-[0.96rem] tw:[.page.is-inner-page_&_td]:leading-[1.58] tw:[.page.is-inner-page_&_td]:wrap-anywhere tw:[.page.is-inner-page_&_td]:[word-break:normal] tw:[.page.is-inner-page_&_th]:text-(--ink-accent) tw:[.page.is-inner-page_&_th]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page.is-inner-page_&_h3]:text-[#e5c07b] tw:dark:[.page.is-inner-page_&_h4]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_em]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_a]:text-[#8fc7ff] tw:dark:[.page.is-inner-page_&_blockquote_p]:text-[#e5c5a7] tw:dark:[.page.is-inner-page_&_blockquote]:[border-left-color:#d0935f] tw:dark:[.page.is-inner-page_&_blockquote]:[background:rgba(208,_147,_95,_0.12)] tw:dark:[.page.is-inner-page_&_blockquote_strong]:text-[#e0a66c] tw:dark:[.page.is-inner-page_&_pre]:border-[rgba(143,_155,_170,_0.3)] tw:dark:[.page.is-inner-page_&_pre]:[background:#171c24]">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={createMarkdownComponents(onPreview, lessonId, index)}
            urlTransform={safeMarkdownUrl}
          >
            {text}
          </ReactMarkdown>
        </div>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">Текстовый блок пуст.</p>
      )}
    </article>
  );
}

// В текстах квиза встречается markdown-выделение **так**: показываем его жирным,
// а не звёздочками. Полный markdown здесь не нужен.
const renderQuizInline = (text: unknown): ReactNode[] =>
  String(text ?? "")
    .split(/\*\*(.+?)\*\*/g)
    .map((part, partIndex) =>
      partIndex % 2 === 1 ? <strong key={partIndex}>{part}</strong> : part,
    );

const stripQuizMarkup = (text: unknown) => String(text ?? "").replace(/\*\*(.+?)\*\*/g, "$1");

function QuizBlock({
  block,
  index,
  lessonId,
}: BlockProps & { lessonId?: string | null }) {
  const questions = normalizeQuizQuestions(block, lessonId);
  const reactId = useId();
  const quizId = String(reactId).replace(/[^a-zA-Z0-9_-]/g, "");
  const [expandedQuestions, setExpandedQuestions] = useState<
    Record<number, boolean>
  >({});

  const toggleQuestion = (questionIndex: number) => {
    setExpandedQuestions((current) => ({
      ...current,
      [questionIndex]: !current[questionIndex],
    }));
  };

  const answerableIndexes = questions
    .map((question, questionIndex) => (question.answer || question.explanation ? questionIndex : -1))
    .filter((questionIndex) => questionIndex >= 0);
  const allExpanded =
    answerableIndexes.length > 0 &&
    answerableIndexes.every((questionIndex) => expandedQuestions[questionIndex]);
  const toggleAll = () => {
    setExpandedQuestions(
      allExpanded ? {} : Object.fromEntries(answerableIndexes.map((questionIndex) => [questionIndex, true])),
    );
  };

  if (!questions.length) return null;

  return (
    <article className="content-block-card tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[14px] tw:p-[14px] tw:w-[100%] tw:min-w-[0] tw:max-w-[100%] tw:overflow-hidden tw:text-(--text) tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[box-shadow:none] tw:[-webkit-backdrop-filter:none] tw:[backdrop-filter:none] tw:dark:text-[#f4ead8] tw:dark:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:text-[#f7dca8]">Блок {index + 1} · quiz</div>
      <div className="quiz-block-head tw:flex tw:items-center tw:justify-between tw:flex-wrap tw:gap-[8px_16px]">
        <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em] tw:dark:text-[#fff4df]">{block.title || "Проверочные вопросы"}</h3>
        {answerableIndexes.length > 1 && (
          <button type="button" className="quiz-toggle-all tw:min-h-[36px] tw:p-[6px_14px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.42)] tw:rounded-[999px] tw:text-(--ink-accent) tw:cursor-pointer tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.7)] tw:focus-visible:border-[rgba(var(--accent-rgb),_0.7)] tw:[background:var(--glass-bg-strong)] tw:[font:inherit] tw:[&&]:font-[800] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45]" onClick={toggleAll} aria-pressed={allExpanded}>
            {allExpanded ? "Скрыть все ответы" : "Показать все ответы"}
          </button>
        )}
      </div>
        <ol className="quiz-question-list tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:gap-[14px] tw:m-[14px_0_0] tw:pl-[20px]">
          {questions.map((question, questionIndex) => {
            const title = question.question;
            const hasAnswerDetails = Boolean(question.answer || question.explanation);
            const isExpanded = Boolean(expandedQuestions[questionIndex]);
            const answerId = `quiz-answer-${quizId}-${index}-${questionIndex}`;

            return (
              <li className="tw:min-w-[0]" key={`question-${questionIndex}`}>
                <button
                  type="button"
                  className="quiz-question-toggle tw:w-[100%] tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.26)] tw:rounded-[12px] tw:text-[inherit] tw:cursor-pointer tw:p-[10px_12px] tw:text-left tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.48)] tw:focus-visible:border-[rgba(var(--accent-rgb),_0.48)] tw:[background:linear-gradient(rgba(var(--accent-rgb),_0.06),_rgba(var(--accent-rgb),_0.06)),_var(--glass-bg-strong)] tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:hover:[background:rgba(var(--accent-rgb),_0.1)] tw:focus-visible:[background:rgba(var(--accent-rgb),_0.1)]"
                  aria-expanded={isExpanded}
                  aria-controls={hasAnswerDetails ? answerId : undefined}
                  onClick={() => toggleQuestion(questionIndex)}
                >
                  <strong className="tw:min-w-[0] tw:wrap-anywhere tw:whitespace-pre-line tw:dark:text-[#fff4df]">{stripQuizMarkup(title)}</strong>
                  <span className="tw:text-(--muted) tw:flex-[0_0_auto] tw:text-[0.82rem] tw:font-[800]" aria-hidden="true">
                    {isExpanded ? "Скрыть ответ" : "Показать ответ"}
                  </span>
                </button>
                {question.options.length > 0 && (
                  <ul className="quiz-answer-options tw:m-[10px_0_0] tw:p-[12px_14px] tw:pl-[34px] tw:rounded-[10px] tw:grid tw:gap-[6px] tw:[border:1px_solid_var(--glass-border)] tw:[background:var(--glass-bg-strong)]">
                    {question.options.map((option, optionIndex) => (
                      <li className="tw:min-w-[0] tw:wrap-anywhere tw:whitespace-pre-line" key={`option-${optionIndex}`}>{renderQuizInline(option)}</li>
                    ))}
                  </ul>
                )}
                {hasAnswerDetails && isExpanded && (
                  <div id={answerId} className="quiz-answer-details tw:m-[10px_0_0] tw:p-[12px_14px] tw:rounded-[10px] tw:[border:1px_solid_var(--glass-border)] tw:[background:var(--glass-bg-strong)]">
                    {question.answer && <p className="tw:min-w-[0] tw:wrap-anywhere tw:whitespace-pre-wrap tw:m-[0] tw:[.quiz-answer-details_p_+_&]:mt-[10px]"><strong className="tw:dark:text-[#fff4df]">Ответ:</strong> {renderQuizInline(question.answer)}</p>}
                    {question.explanation && <p className="tw:min-w-[0] tw:wrap-anywhere tw:whitespace-pre-wrap tw:m-[0] tw:[.quiz-answer-details_p_+_&]:mt-[10px]"><strong className="tw:dark:text-[#fff4df]">Пояснение:</strong> {renderQuizInline(question.explanation)}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
    </article>
  );
}

function VideoBlock({ block, index }: BlockProps) {
  return (
    <article className="content-block-card tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.34)] tw:[.generated-course-learning-grid_&]:rounded-[14px] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:none] tw:[.generated-course-learning-grid_&]:p-[14px] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[.generated-course-learning-grid_&]:w-[100%] tw:[.generated-course-learning-grid_&]:min-w-[0] tw:[.generated-course-learning-grid_&]:max-w-[100%] tw:[.generated-course-learning-grid_&]:overflow-hidden tw:[.generated-course-learning-grid_&]:text-(--text) tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[.page_.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:[.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[.generated-course-learning-grid_&]:[-webkit-backdrop-filter:none] tw:[.generated-course-learning-grid_&]:[backdrop-filter:none] tw:dark:[.page_.generated-course-learning-grid_&]:text-[#f4ead8] tw:dark:[*_&]:[background:rgba(19,_24,_42,_0.72)] tw:dark:[.page_.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:[.page_.generated-course-learning-grid_.content-block-card_&]:text-[#f7dca8]">Блок {index + 1} · видео</div>
      {block.url ? (
        <a href={safeMarkdownUrl(block.url)} target="_blank" rel="noreferrer">
          Открыть видео
        </a>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">Ссылка на видео не указана.</p>
      )}
      {block.description && (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">{block.description}</p>
      )}
    </article>
  );
}

function ImageBlock({
  block,
  index,
  ownerUserId,
}: BlockProps & { ownerUserId?: string | null }) {
  const imageUrl = block.image_id
    ? getMediaUrl(ownerUserId, MEDIA_FOLDERS.COURSE_IMAGES, block.image_id)
    : block.image_url;
  return (
    <article className="content-block-card tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.34)] tw:[.generated-course-learning-grid_&]:rounded-[14px] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:none] tw:[.generated-course-learning-grid_&]:p-[14px] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[.generated-course-learning-grid_&]:w-[100%] tw:[.generated-course-learning-grid_&]:min-w-[0] tw:[.generated-course-learning-grid_&]:max-w-[100%] tw:[.generated-course-learning-grid_&]:overflow-hidden tw:[.generated-course-learning-grid_&]:text-(--text) tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[.page_.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:[.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[.generated-course-learning-grid_&]:[-webkit-backdrop-filter:none] tw:[.generated-course-learning-grid_&]:[backdrop-filter:none] tw:dark:[.page_.generated-course-learning-grid_&]:text-[#f4ead8] tw:dark:[*_&]:[background:rgba(19,_24,_42,_0.72)] tw:dark:[.page_.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:[.page_.generated-course-learning-grid_.content-block-card_&]:text-[#f7dca8]">
        Блок {index + 1} · изображение
      </div>
      {imageUrl ? (
        <img
          className="content-block-image tw:rounded-[16px] tw:block tw:mt-[14px] tw:max-h-[520px] tw:max-w-[100%] tw:object-contain"
          src={safeMarkdownUrl(imageUrl)}
          alt=""
        />
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">Изображение не указано.</p>
      )}
    </article>
  );
}

function MermaidBlock({
  block,
  index,
  onPreview,
  lessonId,
}: BlockProps & { onPreview: OnPreview; lessonId?: string | null }) {
  return (
    <article className="content-block-card tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.34)] tw:[.generated-course-learning-grid_&]:rounded-[14px] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:none] tw:[.generated-course-learning-grid_&]:p-[14px] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[.generated-course-learning-grid_&]:w-[100%] tw:[.generated-course-learning-grid_&]:min-w-[0] tw:[.generated-course-learning-grid_&]:max-w-[100%] tw:[.generated-course-learning-grid_&]:overflow-hidden tw:[.generated-course-learning-grid_&]:text-(--text) tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[.page_.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:[.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[.generated-course-learning-grid_&]:[-webkit-backdrop-filter:none] tw:[.generated-course-learning-grid_&]:[backdrop-filter:none] tw:dark:[.page_.generated-course-learning-grid_&]:text-[#f4ead8] tw:dark:[*_&]:[background:rgba(19,_24,_42,_0.72)] tw:dark:[.page_.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:[.page_.generated-course-learning-grid_.content-block-card_&]:text-[#f7dca8]">Блок {index + 1} · mermaid</div>
      {block.title && <h3>{block.title}</h3>}
      {block.md_content ? (
        <button
          type="button"
          className="content-preview-trigger content-preview-diagram-trigger tw:block tw:w-[100%] tw:m-[12px_0] tw:p-[0] tw:text-left tw:[border:0] tw:[background:transparent] tw:[cursor:zoom-in] tw:focus-visible:[outline:2px_solid_rgba(var(--accent-rgb),_0.84)] tw:focus-visible:[outline-offset:3px]"
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
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">Код диаграммы отсутствует.</p>
      )}
      {block.explanation && (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">{block.explanation}</p>
      )}
    </article>
  );
}

function FormulaBlock({ block, index, label }: BlockProps & { label: string }) {
  return (
    <article className="content-block-card tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.34)] tw:[.generated-course-learning-grid_&]:rounded-[14px] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:none] tw:[.generated-course-learning-grid_&]:p-[14px] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[.generated-course-learning-grid_&]:w-[100%] tw:[.generated-course-learning-grid_&]:min-w-[0] tw:[.generated-course-learning-grid_&]:max-w-[100%] tw:[.generated-course-learning-grid_&]:overflow-hidden tw:[.generated-course-learning-grid_&]:text-(--text) tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[.page_.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:[.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[.generated-course-learning-grid_&]:[-webkit-backdrop-filter:none] tw:[.generated-course-learning-grid_&]:[backdrop-filter:none] tw:dark:[.page_.generated-course-learning-grid_&]:text-[#f4ead8] tw:dark:[*_&]:[background:rgba(19,_24,_42,_0.72)] tw:dark:[.page_.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:[.page_.generated-course-learning-grid_.content-block-card_&]:text-[#f7dca8]">
        Блок {index + 1} · {label}
      </div>
      {block.formula ? (
        <pre className="content-block-pre tw:rounded-[16px] tw:block tw:leading-[1.65] tw:m-[14px_0_0] tw:max-h-[520px] tw:overflow-auto tw:p-[16px] tw:whitespace-pre-wrap tw:text-[inherit] tw:[word-break:break-word] tw:[background:rgba(111,_119,_255,_0.07)] tw:[font-family:inherit] tw:dark:[.page_.generated-course-learning-grid_&]:text-[#f4ead8] tw:dark:[.page_.generated-course-learning-grid_&]:[background:rgba(0,_0,_0,_0.28)] tw:dark:[.page_.generated-course-learning-grid_&]:[border:1px_solid_rgba(247,_220,_168,_0.24)]">{block.formula}</pre>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">Формула не указана.</p>
      )}
      {block.explanation && (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">{block.explanation}</p>
      )}
    </article>
  );
}

function CodeBlock({ block, index }: BlockProps) {
  const code = typeof block?.code === "string" ? block.code : "";

  return (
    <article className="content-block-card tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.34)] tw:[.generated-course-learning-grid_&]:rounded-[14px] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:none] tw:[.generated-course-learning-grid_&]:p-[14px] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[.generated-course-learning-grid_&]:w-[100%] tw:[.generated-course-learning-grid_&]:min-w-[0] tw:[.generated-course-learning-grid_&]:max-w-[100%] tw:[.generated-course-learning-grid_&]:overflow-hidden tw:[.generated-course-learning-grid_&]:text-(--text) tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[.page_.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:[.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[.generated-course-learning-grid_&]:[-webkit-backdrop-filter:none] tw:[.generated-course-learning-grid_&]:[backdrop-filter:none] tw:dark:[.page_.generated-course-learning-grid_&]:text-[#f4ead8] tw:dark:[*_&]:[background:rgba(19,_24,_42,_0.72)] tw:dark:[.page_.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:[.page_.generated-course-learning-grid_.content-block-card_&]:text-[#f7dca8]">
        Блок {index + 1} · код{block.language ? ` · ${block.language}` : ""}
      </div>
      {block.title && <h3>{block.title}</h3>}
      {code ? (
        <pre className="content-block-code tw:rounded-[16px] tw:block tw:leading-[1.65] tw:m-[14px_0_0] tw:max-h-[520px] tw:overflow-auto tw:p-[16px] tw:whitespace-pre-wrap tw:text-[#e5e7eb] tw:text-[0.92rem] tw:[word-break:break-word] tw:[background:#111827] tw:[.generated-course-learning-grid_&]:text-[#f8fafc] tw:[font-family:'SFMono-Regular',_Consolas,_'Liberation_Mono',_monospace] tw:[.generated-course-learning-grid_&]:border-solid tw:[.generated-course-learning-grid_&]:border-[rgba(255,_255,_255,_0.14)] tw:[.generated-course-learning-grid_&]:[background:#0b1020] tw:dark:[.page_.generated-course-learning-grid_&]:text-[#f8fafc] tw:[.generated-course-learning-grid_&]:[border-width:1px] tw:dark:[.page_.generated-course-learning-grid_&]:border-[rgba(247,_220,_168,_0.28)] tw:dark:[.page_.generated-course-learning-grid_&]:[background:#050816] tw:[.generated-course-learning-grid_&_code]:text-[inherit]">{code}</pre>
      ) : (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">Код в блоке отсутствует.</p>
      )}
      {typeof block.explanation === "string" && block.explanation && (
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">{block.explanation}</p>
      )}
    </article>
  );
}

function UnsupportedBlock({ block, index }: BlockProps) {
  return (
    <article className="content-block-card content-block-unsupported tw:border-solid tw:border-[rgba(255,_160,_64,_0.42)] tw:rounded-[24px] tw:p-[24px] tw:[border-width:1px] tw:[.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.34)] tw:[.generated-course-learning-grid_&]:rounded-[14px] tw:[background:rgba(255,_246,_230,_0.82)] tw:[box-shadow:none] tw:[.generated-course-learning-grid_&]:p-[14px] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[.generated-course-learning-grid_&]:w-[100%] tw:[.generated-course-learning-grid_&]:min-w-[0] tw:[.generated-course-learning-grid_&]:max-w-[100%] tw:[.generated-course-learning-grid_&]:overflow-hidden tw:[.generated-course-learning-grid_&]:text-(--text) tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:dark:[.page_.generated-course-learning-grid_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:[.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.08),_rgba(var(--accent-rgb),_0.08)),_var(--glass-bg-strong)] tw:[.generated-course-learning-grid_&]:[-webkit-backdrop-filter:none] tw:[.generated-course-learning-grid_&]:[backdrop-filter:none] tw:dark:[.page_.generated-course-learning-grid_&]:text-[#f4ead8] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:dark:[.page_.generated-course-learning-grid_&]:[background:linear-gradient(rgba(var(--accent-rgb),_0.12),_rgba(var(--accent-rgb),_0.12)),_var(--glass-bg-strong)]">
      <div className="course-viewer-eyebrow tw:text-(--ink-accent) tw:text-[0.78rem] tw:font-[700] tw:tracking-[0.08em] tw:uppercase tw:dark:[.page_.generated-course-learning-grid_.content-block-card_&]:text-[#f7dca8]">Блок {index + 1}</div>
      <h3>Тип блока не поддерживается</h3>
      <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
        Не удалось безопасно отобразить блок типа "
        {block?.content_type || "unknown"}".
      </p>
    </article>
  );
}

function getBlockContentType(block: BlockData): string {
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

function renderContentBlock(
  block: BlockData,
  index: number,
  onPreview: OnPreview,
  ownerUserId: string | null | undefined,
  lessonId: string | null | undefined,
) {
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

/** Теория урока: контент-блоки всех типов (текст, код, Mermaid, квиз…). */
export const ContentBlocks = forwardRef<HTMLElement, ContentBlocksProps>(function ContentBlocks(
  { blocks, ownerUserId, lessonId },
  ref,
) {
  const [preview, setPreview] = useState<ContentPreview | null>(null);

  if (!Array.isArray(blocks) || blocks.length === 0) {
    return (
      <article ref={ref} className="course-viewer-card theory-section tw:border-solid tw:border-[rgba(114,_121,_156,_0.22)] tw:rounded-[24px] tw:p-[24px] tw:grid tw:gap-[16px] tw:[border-width:1px] tw:[.generated-course-learning-grid_&]:border-none tw:[.generated-course-learning-grid_&]:border-[currentcolor] tw:[.generated-course-learning-grid_&]:rounded-[0] tw:[background:rgba(255,_255,_255,_0.72)] tw:[box-shadow:0_20px_60px_rgba(27,_35,_68,_0.08)] tw:[.generated-course-learning-grid_&]:p-[0] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:var(--glass-backdrop)] tw:[.generated-course-learning-grid_&]:[border-width:0] tw:dark:[*_&]:border-[rgba(255,_255,_255,_0.12)] tw:[.generated-course-learning-grid_&]:[background:transparent] tw:[.generated-course-learning-grid_&]:[box-shadow:none] tw:[.generated-course-learning-grid_&]:[backdrop-filter:none] tw:dark:[*_&]:[background:rgba(19,_24,_42,_0.72)] tw:[&_h1]:m-[0]">
        <h2>Теория урока</h2>
        <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
          В уроке пока нет теоретических блоков.
        </p>
      </article>
    );
  }

  return (
    <section
      className="course-viewer-card theory-section tw:border-none tw:border-[currentcolor] tw:rounded-[0] tw:p-[0] tw:grid tw:gap-[16px] tw:w-[100%] tw:[border-width:0] tw:[background:transparent] tw:[box-shadow:none] tw:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[backdrop-filter:none] tw:[&_h1]:m-[0]"
      aria-labelledby="theory-title"
    >
      <h2 id="theory-title">Теория урока</h2>
      <div
        ref={ref as Ref<HTMLDivElement>}
        className="content-blocks-list tw:grid tw:gap-[16px] tw:w-[100%] tw:min-w-[0] tw:max-w-[100%]"
      >
        {blocks.map((block, index) =>
          hasSources(block?.sources) ? (
            <div key={`content-${index}`} className="content-block-with-sources tw:grid tw:gap-[8px]">
              {renderContentBlock(
                block,
                index,
                setPreview,
                ownerUserId,
                lessonId,
              )}
              <ContentBlockSources sources={block.sources} />
            </div>
          ) : (
            renderContentBlock(block, index, setPreview, ownerUserId, lessonId)
          ),
        )}
      </div>
      <ContentPreviewModal preview={preview} onClose={() => setPreview(null)} />
    </section>
  );
});
