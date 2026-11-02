// Страница практического задания курса с навигацией по курсу
import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ContentPreviewModal,
  type ContentPreview,
} from "@/shared/ui/content-preview";
import {
  CourseNavigationTree,
  type BlockNode,
  type CourseNode,
  type PracticeNode,
} from "@/entities/course";
import {
  LessonPracticeAgent,
  LessonTestAgent,
} from "@/features/lesson-assessment";

import { MermaidDiagram } from "@/shared/ui/mermaid-diagram";
import { SectionTop } from "@/shared/ui/section-top";
import { SyntaxHighlightedCode } from "@/shared/ui/syntax-highlighted-code";
import { useGoBack } from "@/shared/lib/ui-layout";

const allowedImageDataUrl =
  /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;

function safeMarkdownUrl(url: string): string {
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

type CompletedMap = Record<string, boolean | undefined>;

export interface PracticePageProps {
  selectedCourse: CourseNode;
  selectedBlock: BlockNode;
  /** Практики в модуле может не быть: тогда страница показывает пустые поля. */
  selectedPractice: PracticeNode | null;
  completedLessons: CompletedMap;
  completedPractices: CompletedMap;
  togglePracticeComplete?: (practiceId: string) => void;
  openBlock: (blockId: string) => void;
  openLesson: (lessonId: string) => void;
  openPractice: (practiceId: string) => void;
  isCourseEditMode: boolean;
}

/** Практическое задание модуля с навигацией по курсу. */
export function PracticePage({
  selectedCourse,
  selectedBlock,
  selectedPractice,
  completedLessons,
  completedPractices,
  togglePracticeComplete,
  openBlock,
  openLesson,
  openPractice,
  isCourseEditMode,
}: PracticePageProps) {
  const [preview, setPreview] = useState<ContentPreview | null>(null);
  const [activeTab, setActiveTab] = useState("practice");
  const goBack = useGoBack({
    fallbackPath: isCourseEditMode
      ? `/course/${selectedCourse.id}/edit/block/${selectedBlock.id}`
      : `/course/${selectedCourse.id}/block/${selectedBlock.id}`,
  });

  const markdownComponents: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const language = match?.[1]?.toLowerCase();
      const code = String(children).replace(/\n$/, "");

      if (language === "mermaid") {
        return (
          <button
            type="button"
            className="content-preview-trigger content-preview-diagram-trigger tw:block tw:w-[100%] tw:m-[12px_0] tw:p-[0] tw:text-left tw:[border:0] tw:[background:transparent] tw:[cursor:zoom-in] tw:focus-visible:[outline:2px_solid_rgba(var(--accent-rgb),_0.84)] tw:focus-visible:[outline-offset:3px]"
            onClick={() => setPreview({ type: "diagram", chart: code })}
            aria-label="Увеличить схему"
          >
            <MermaidDiagram chart={code} />
          </button>
        );
      }

      return (
        <SyntaxHighlightedCode className={className} {...props}>
          {children}
        </SyntaxHighlightedCode>
      );
    },
    img({ src, alt }) {
      return (
        <button
          type="button"
          className="content-preview-trigger content-preview-image-trigger tw:block tw:w-[fit-content] tw:m-[12px_0] tw:p-[0] tw:text-left tw:max-w-[100%] tw:[border:0] tw:[background:transparent] tw:[cursor:zoom-in] tw:focus-visible:[outline:2px_solid_rgba(var(--accent-rgb),_0.84)] tw:focus-visible:[outline-offset:3px]"
          onClick={() => setPreview({ type: "image", src: src ?? "", alt })}
          aria-label={`Увеличить изображение${alt ? `: ${alt}` : ""}`}
        >
          <img src={src} alt={alt || ""} />
        </button>
      );
    },
    table({ children }) {
      return (
        <div
          className="content-preview-table-trigger tw:m-[12px_0] tw:[cursor:zoom-in] tw:focus-visible:[outline:2px_solid_rgba(var(--accent-rgb),_0.84)] tw:focus-visible:[outline-offset:3px]"
          role="button"
          tabIndex={0}
          onClick={() => setPreview({ type: "table", children })}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setPreview({ type: "table", children });
            }
          }}
          aria-label="Увеличить таблицу"
        >
          <table>{children}</table>
        </div>
      );
    },
  };

  return (
    <section className="container section practice-view tw:relative tw:z-[1] tw:w-[min(1600px,_98vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:dark:[.page_&]:[--muted:#c4b9a7] tw:dark:[.page_&]:[--eyebrow:#a0c4ff] tw:dark:[.page_&]:[--ink-accent:#dfd2bf] tw:dark:[.page_&]:[--info-text:#b7ab99] tw:dark:[.page_&]:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:dark:[.page_&]:[--glass-bg-strong:rgba(44,_44,_44,_0.92)]">
      <SectionTop label="Практика" title={selectedPractice?.title} />
      <button
        type="button"
        className="btn btn-outline back-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[0] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:mt-[18px] tw:w-[44px] tw:h-[44px] tw:text-[1.15rem] tw:leading-[1] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
        onClick={goBack}
        aria-label="Назад к блоку"
        title="Назад к блоку"
      >
        &lt;
      </button>
      <div className="practice-view-grid tw:mt-[16px] tw:grid tw:grid-cols-[320px_minmax(0,_1fr)] tw:gap-[14px] tw:max-1100:grid-cols-[1fr] tw:[align-items:start]">
        <CourseNavigationTree
          selectedCourse={selectedCourse}
          selectedBlock={selectedBlock}
          selectedLessonId=""
          selectedPracticeId={selectedPractice?.id}
          completedLessons={completedLessons}
          completedPractices={completedPractices}
          openBlock={openBlock}
          openLesson={openLesson}
          openPractice={openPractice}
          mode={isCourseEditMode ? "theory" : "practice"}
        />
        <article className="glass-card practice-main-card tw:border-none tw:border-[currentcolor] tw:rounded-[0] tw:sticky tw:overflow-hidden tw:overflow-y-auto tw:isolate tw:top-[16px] tw:max-h-[calc(100vh_-_32px)] tw:p-[22px] tw:[border-width:0] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:none] tw:max-1100:static tw:max-1100:overflow-y-visible tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-1100:max-h-[none] tw:[overscroll-behavior-y:contain] tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.55)_transparent] tw:max-760:p-[18px] tw:[.page.is-inner-page_&]:p-[28px] tw:max-1100:min-h-[auto] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none]">
          {!isCourseEditMode && (
            <div
              className="lesson-mode-switch tw:inline-flex tw:items-center tw:gap-[4px] tw:mb-[14px] tw:p-[4px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[10px] tw:[border-width:1px] tw:[background:var(--glass-bg-strong)] tw:dark:[.page_&]:border-[rgba(var(--accent-rgb),_0.42)]"
              role="tablist"
              aria-label="Тип материала"
            >
              <button
                type="button"
                aria-selected="false"
                onClick={() => openLesson(selectedBlock.lessons[0]?.id)}
                disabled={!selectedBlock.lessons[0]}
              >
                Теория
              </button>
              <button
                type="button"
                className={`tw:[.lesson-mode-switch_&.is-active]:text-(--heading) tw:[.lesson-mode-switch_&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page_.lesson-mode-switch_&.is-active]:text-[#ffffff] tw:dark:[.page_.lesson-mode-switch_&.is-active]:[background:rgba(255,_255,_255,_0.09)] ${activeTab === "questions" ? "is-active" : ""}`}
                aria-selected={activeTab === "questions"}
                onClick={() => setActiveTab("questions")}
              >
                Проверочные вопросы
              </button>
              <button
                type="button"
                className={`tw:[.lesson-mode-switch_&.is-active]:text-(--heading) tw:[.lesson-mode-switch_&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page_.lesson-mode-switch_&.is-active]:text-[#ffffff] tw:dark:[.page_.lesson-mode-switch_&.is-active]:[background:rgba(255,_255,_255,_0.09)] ${activeTab === "practice" ? "is-active" : ""}`}
                aria-selected={activeTab === "practice"}
                onClick={() => setActiveTab("practice")}
              >
                Практика
              </button>
            </div>
          )}
          {!isCourseEditMode && activeTab === "questions" ? (
            <LessonTestAgent
              key={`${selectedBlock.id}:${selectedBlock.lessons[0]?.id}:test`}
              moduleId={selectedBlock.id}
              lessonId={selectedBlock.lessons[0]?.id}
            />
          ) : !isCourseEditMode && activeTab === "practice" ? (
            <LessonPracticeAgent
              key={`${selectedBlock.id}:${selectedBlock.lessons[0]?.id}:practice`}
              moduleId={selectedBlock.id}
              lessonId={selectedBlock.lessons[0]?.id}
            />
          ) : (
            <>
              {!isCourseEditMode && (
                <p className="course-category tw:m-[0] tw:text-[0.8rem] tw:uppercase tw:tracking-[0.08em] tw:text-(--accent) tw:font-[700]">
                  {selectedCourse.title}
                </p>
              )}
              {isCourseEditMode && (
                <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
                  Редактирование практики в конструкторе отключено.
                </p>
              )}
              {!isCourseEditMode && selectedPractice?.markdown ? (
                <div className="practice-markdown lesson-markdown tw:mt-[12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.3)] tw:rounded-[14px] tw:p-[14px] tw:w-[100%] tw:min-w-[0] tw:max-w-[100%] tw:overflow-x-clip tw:overflow-y-visible tw:[border-width:1px] tw:[background:rgba(255,_255,_255,_0.2)] tw:dark:[.page_&]:border-[rgba(var(--accent-rgb),_0.42)] tw:dark:[.page_&]:[background:rgba(255,_255,_255,_0.045)] tw:dark:[.page_&]:[box-shadow:none]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                    urlTransform={safeMarkdownUrl}
                  >
                    {selectedPractice?.markdown}
                  </ReactMarkdown>
                </div>
              ) : !isCourseEditMode ? (
                <p className="lesson-content tw:m-[10px_0_0] tw:text-(--muted) tw:leading-[1.5] tw:[.practice-main-card_&]:mt-[12px]">
                  Результат: {selectedPractice?.result}
                </p>
              ) : null}
              {!isCourseEditMode && (
                <div className="lesson-controls tw:mt-[16px] tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:[.practice-main-card_&]:mt-[20px]">
                  <span className="lesson-time tw:inline-flex tw:p-[5px_10px] tw:rounded-[999px] tw:text-(--info-text) tw:text-[0.82rem] tw:[background:linear-gradient(rgba(var(--accent-soft-rgb),_0.2),_rgba(var(--accent-soft-rgb),_0.2)),_var(--glass-bg-strong)] tw:[border:1px_solid_rgba(var(--accent-soft-rgb),_0.45)]">
                    {selectedPractice?.duration}
                  </span>
                </div>
              )}
            </>
          )}
        </article>
      </div>
      <ContentPreviewModal preview={preview} onClose={() => setPreview(null)} />
    </section>
  );
}
