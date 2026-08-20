// Страница отдельного урока с навигацией по курсу и блочным редактором контента
import { useEffect, useState } from "react";
import CourseNavigationTree from "../components/CourseNavigationTree";
import ContentBlocks from "../components/course/ContentBlocks";
import LessonAiChat from "../components/LessonAiChat";
import LessonContentEditor from "../components/LessonContentEditor";
import SectionTop from "../components/SectionTop";
import { getLessonContentBlocks } from "../services/courseService";
import { printLessonSummary } from "../utils/printLessonSummary";

export default function LessonPage({
  selectedCourse,
  selectedBlock,
  selectedLesson,
  completedLessons,
  completedPractices,
  openBlock,
  openBlockPage,
  openLesson,
  openPractice,
  isCourseEditMode,
  updateLesson,
}) {
  const hasContent = Boolean(selectedLesson.markdown || selectedLesson.content);
  const [activeTab, setActiveTab] = useState("theory");
  const [contentBlocks, setContentBlocks] = useState([]);
  const [isLoadingTheory, setIsLoadingTheory] = useState(false);
  const [theoryError, setTheoryError] = useState("");
  const showLessonAiChat = !isCourseEditMode && activeTab === "theory";

  useEffect(() => {
    setActiveTab("theory");
  }, [selectedLesson.id]);

  useEffect(() => {
    if (isCourseEditMode || !selectedLesson.id) {
      setContentBlocks([]);
      setTheoryError("");
      return;
    }

    let isMounted = true;
    setIsLoadingTheory(true);
    setTheoryError("");

    getLessonContentBlocks(selectedLesson.id)
      .then((blocks) => {
        if (isMounted) {
          setContentBlocks(blocks);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setTheoryError(
            error.userMessage ||
              error.message ||
              "Не удалось загрузить теорию урока.",
          );
          setContentBlocks([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingTheory(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isCourseEditMode, selectedLesson.id]);

  return (
    <section
      className={`container section lesson-view ${
        isCourseEditMode
          ? "is-course-edit-layout"
          : `is-learning-layout ${showLessonAiChat ? "has-lesson-chat" : ""}`
      }`}
    >
      <SectionTop label="Урок" title={selectedLesson.title} />
      <button
        type="button"
        className="btn btn-outline back-btn"
        onClick={() => openBlockPage(selectedBlock.id)}
        aria-label="Назад к блоку"
        title="Назад к блоку"
      >
        &lt;
      </button>
      <div
        className={`lesson-view-grid ${
          isCourseEditMode
            ? "is-course-edit-layout"
            : `is-learning-layout ${showLessonAiChat ? "has-lesson-chat" : ""}`
        }`}
      >
        <CourseNavigationTree
          selectedCourse={selectedCourse}
          selectedBlock={selectedBlock}
          selectedLessonId={selectedLesson.id}
          selectedPracticeId=""
          completedLessons={completedLessons}
          completedPractices={completedPractices}
          openBlock={openBlock}
          openLesson={openLesson}
          openPractice={openPractice}
          mode="theory"
        />
        <article
          className={`glass-card lesson-main-card ${isCourseEditMode ? "is-editing" : ""}`}
          onScroll={(event) => {
            event.currentTarget.classList.toggle(
              "is-scrolled",
              event.currentTarget.scrollTop > 8,
            );
          }}
        >
          <div className="lesson-scroll-frame">
            <div
              className="lesson-mode-switch"
              role="tablist"
              aria-label="Тип материала"
            >
              <button
                type="button"
                className={activeTab === "theory" ? "is-active" : ""}
                aria-selected={activeTab === "theory"}
                onClick={() => setActiveTab("theory")}
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
                aria-selected="false"
                onClick={() => {
                  setActiveTab("practice");
                  openPractice(selectedBlock.practice[0]?.id);
                }}
                disabled={!selectedBlock.practice[0]}
              >
                Практика
              </button>
            </div>
            {activeTab === "questions" ? (
              <div className="lesson-questions-placeholder">
                <p className="course-category">Проверочные вопросы</p>
                <h2>Проверочные вопросы по модулю «{selectedBlock.title}»</h2>
                <p>
                  Вопросы появятся после подготовки контрольных заданий по
                  урокам этого модуля.
                </p>
              </div>
            ) : (
              <>
                {!isCourseEditMode && (
                  <>
                    <p className="course-category">{selectedCourse.title}</p>
                    <p className="lesson-summary">{selectedLesson.summary}</p>
                  </>
                )}

                {isCourseEditMode && (
                  <div className="course-editor-panel lesson-editor-panel">
                    <div className="course-editor-grid">
                      <label className="course-editor-field">
                        <span>Название урока</span>
                        <input
                          value={selectedLesson.title}
                          onChange={(event) =>
                            updateLesson(selectedLesson.id, {
                              title: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="course-editor-field">
                        <span>Длительность</span>
                        <input
                          value={selectedLesson.duration}
                          onChange={(event) =>
                            updateLesson(selectedLesson.id, {
                              duration: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="course-editor-field course-editor-field-wide">
                        <span>Краткое описание</span>
                        <textarea
                          value={selectedLesson.summary || ""}
                          onChange={(event) =>
                            updateLesson(selectedLesson.id, {
                              summary: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    <LessonContentEditor
                      lesson={selectedLesson}
                      onChange={(changes) =>
                        updateLesson(selectedLesson.id, changes)
                      }
                    />
                  </div>
                )}

                {!isCourseEditMode && isLoadingTheory ? (
                  <p className="course-viewer-muted">
                    Загружаем теорию урока...
                  </p>
                ) : !isCourseEditMode && theoryError ? (
                  <article
                    className="glass-card course-viewer-error"
                    role="alert"
                  >
                    {theoryError}
                  </article>
                ) : !isCourseEditMode ? (
                  <ContentBlocks
                    blocks={
                      contentBlocks.length
                        ? contentBlocks
                        : hasContent
                          ? [
                              {
                                content_type: "text",
                                ai_generated: false,
                                md_content:
                                  selectedLesson.markdown ||
                                  selectedLesson.content,
                              },
                            ]
                          : []
                    }
                  />
                ) : null}
              </>
            )}
          </div>
        </article>
        {showLessonAiChat && (
          <LessonAiChat
            key={selectedLesson.id}
            onDownloadSummary={() =>
              printLessonSummary({
                course: selectedCourse,
                block: selectedBlock,
                lesson: selectedLesson,
              })
            }
          />
        )}
      </div>
    </section>
  );
}
