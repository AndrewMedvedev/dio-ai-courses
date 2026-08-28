// Страница практического задания курса с навигацией по курсу
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ContentPreviewModal from "../components/ContentPreviewModal";
import CourseNavigationTree from "../components/CourseNavigationTree";
import LessonContentEditor from "../components/LessonContentEditor";
import MermaidDiagram from "../components/MermaidDiagram";
import SectionTop from "../components/SectionTop";
import SyntaxHighlightedCode from "../components/SyntaxHighlightedCode";

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

export default function PracticePage({
  selectedCourse,
  selectedBlock,
  selectedPractice,
  completedLessons,
  completedPractices,
  togglePracticeComplete,
  openBlock,
  openBlockPage,
  openLesson,
  openPractice,
  isCourseEditMode,
  updatePractice,
}) {
  const [preview, setPreview] = useState(null);
  const [activeTab, setActiveTab] = useState("practice");

  const markdownComponents = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const language = match?.[1]?.toLowerCase();
      const code = String(children).replace(/\n$/, "");

      if (language === "mermaid") {
        return (
          <button
            type="button"
            className="content-preview-trigger content-preview-diagram-trigger"
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
          className="content-preview-trigger content-preview-image-trigger"
          onClick={() => setPreview({ type: "image", src, alt })}
          aria-label={`Увеличить изображение${alt ? `: ${alt}` : ""}`}
        >
          <img src={src} alt={alt || ""} />
        </button>
      );
    },
    table({ children }) {
      return (
        <div
          className="content-preview-table-trigger"
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
    <section className="container section practice-view">
      <SectionTop label="Практика" title={selectedPractice.title} />
      <button
        type="button"
        className="btn btn-outline back-btn"
        onClick={() => openBlockPage(selectedBlock.id)}
        aria-label="Назад к блоку"
        title="Назад к блоку"
      >
        &lt;
      </button>
      <div className="practice-view-grid">
        <CourseNavigationTree
          selectedCourse={selectedCourse}
          selectedBlock={selectedBlock}
          selectedLessonId=""
          selectedPracticeId={selectedPractice.id}
          completedLessons={completedLessons}
          completedPractices={completedPractices}
          openBlock={openBlock}
          openLesson={openLesson}
          openPractice={openPractice}
          mode="practice"
        />
        <article className="glass-card practice-main-card">
          <div
            className="lesson-mode-switch"
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
              className={activeTab === "questions" ? "is-active" : ""}
              aria-selected={activeTab === "questions"}
              onClick={() => setActiveTab("questions")}
            >
              Проверочные вопросы
            </button>
            <button
              type="button"
              className={activeTab === "practice" ? "is-active" : ""}
              aria-selected={activeTab === "practice"}
              onClick={() => setActiveTab("practice")}
            >
              Практика
            </button>
          </div>
          {activeTab === "questions" ? (
            <div className="lesson-questions-placeholder">
              <p className="course-category">Проверочные вопросы</p>
              <h2>Проверочные вопросы по модулю «{selectedBlock.title}»</h2>
              <p>
                Вопросы появятся после подготовки контрольных заданий по урокам
                этого модуля.
              </p>
            </div>
          ) : (
            <>
              {!isCourseEditMode && (
                <p className="course-category">{selectedCourse.title}</p>
              )}
              {isCourseEditMode && (
                <div className="course-editor-panel lesson-editor-panel">
                  <div className="course-editor-grid">
                    <label className="course-editor-field">
                      <span>Название практики</span>
                      <input
                        value={selectedPractice.title}
                        onChange={(event) =>
                          updatePractice(selectedPractice.id, {
                            title: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="course-editor-field">
                      <span>Длительность</span>
                      <input
                        value={selectedPractice.duration}
                        onChange={(event) =>
                          updatePractice(selectedPractice.id, {
                            duration: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="course-editor-field course-editor-field-wide">
                      <span>Краткое описание</span>
                      <textarea
                        value={selectedPractice.brief || ""}
                        onChange={(event) =>
                          updatePractice(selectedPractice.id, {
                            brief: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
              )}
              {isCourseEditMode && (
                <LessonContentEditor
                  courseId={selectedCourse.id}
                  lesson={{
                    ...selectedPractice,
                    markdown:
                      selectedPractice.markdown ||
                      selectedPractice.result ||
                      "",
                  }}
                  contentLabel="Контент практики"
                  blocksLabel="Блоки практики"
                  onChange={(changes) =>
                    updatePractice(selectedPractice.id, {
                      markdown: changes.markdown,
                      result: "",
                    })
                  }
                />
              )}
              {!isCourseEditMode && selectedPractice.markdown ? (
                <div className="practice-markdown lesson-markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                    urlTransform={safeMarkdownUrl}
                  >
                    {selectedPractice.markdown}
                  </ReactMarkdown>
                </div>
              ) : !isCourseEditMode ? (
                <p className="lesson-content">
                  Результат: {selectedPractice.result}
                </p>
              ) : null}
              {!isCourseEditMode && (
                <div className="lesson-controls">
                  <span className="lesson-time">
                    {selectedPractice.duration}
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
