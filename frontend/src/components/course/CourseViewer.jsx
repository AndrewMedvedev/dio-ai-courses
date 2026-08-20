import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import LessonAiChat from "../LessonAiChat";
import SectionTop from "../SectionTop";
import {
  enrollUserToCourse,
  getCourseBasicInfo,
  getLessonById,
  getLessonContentBlocks,
  getModuleById,
  isUserEnrolled,
} from "../../services/courseService";
import ContentBlocks from "./ContentBlocks";
import CourseBasicInfo from "./CourseBasicInfo";
import LessonBasicInfo from "./LessonBasicInfo";
import LessonList from "./LessonList";
import ModuleBasicInfo from "./ModuleBasicInfo";
import {
  COURSE_PERMISSIONS,
  usePermissionStore,
} from "../../stores/permissionStore";
import ModuleList from "./ModuleList";
import "./course-viewer.css";

function findBlockByLesson(course, lessonId) {
  return (
    course?.blocks?.find((block) =>
      block.lessons.some((lesson) => lesson.id === lessonId),
    ) ?? null
  );
}

function toModuleBasicInfoFromLearningBlock(block) {
  if (!block) {
    return null;
  }

  const learningObjectives = Array.isArray(block.learningObjectives)
    ? block.learningObjectives
    : Array.isArray(block.learning_objectives)
      ? block.learning_objectives
      : [];

  return {
    id: block.id,
    title: block.title,
    description: block.description || "",
    order: Number.isFinite(block.order) ? block.order : 0,
    learning_objectives: learningObjectives,
    learningObjectives,
    lessons: (block.lessons || []).map((lesson, lessonIndex) => ({
      id: lesson.id,
      title: lesson.title,
      order: Number.isFinite(lesson.order) ? lesson.order : lessonIndex,
    })),
  };
}

function toLessonBasicInfoFromLearningLesson(lesson) {
  if (!lesson) {
    return null;
  }

  const estimatedTimeMatch = /^([0-9]+)\s*мин\.?$/i.exec(lesson.duration || "");
  const learningObjectives = Array.isArray(lesson.learningObjectives)
    ? lesson.learningObjectives
    : Array.isArray(lesson.learning_objectives)
      ? lesson.learning_objectives
      : [];

  return {
    id: lesson.id,
    title: lesson.title,
    description: lesson.summary || lesson.description || lesson.content || "",
    order: Number.isFinite(lesson.order) ? lesson.order : 0,
    learning_objectives: learningObjectives,
    learningObjectives,
    estimated_time_minutes: estimatedTimeMatch
      ? Number(estimatedTimeMatch[1])
      : null,
  };
}

export default function CourseViewer() {
  const { courseId, blockId, lessonId } = useParams();
  const navigate = useNavigate();
  const canReadCourse = usePermissionStore((state) =>
    state.hasAnyPermission([
      COURSE_PERMISSIONS.COURSE_READ,
      COURSE_PERMISSIONS.READ,
    ]),
  );
  const canUpdateCourse = usePermissionStore((state) =>
    state.hasPermission(COURSE_PERMISSIONS.UPDATE),
  );
  const [course, setCourse] = useState(null);
  const [selectedModuleId, setSelectedModuleId] = useState(blockId ?? null);
  const [selectedLessonId, setSelectedLessonId] = useState(lessonId ?? null);
  const [isLearningStarted, setIsLearningStarted] = useState(
    Boolean(blockId || lessonId),
  );
  const [contentBlocks, setContentBlocks] = useState([]);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [isLoadingCourse, setIsLoadingCourse] = useState(true);
  const [isLoadingLesson, setIsLoadingLesson] = useState(false);
  const [isSubmittingEnrollment, setIsSubmittingEnrollment] = useState(false);
  const [activeTab, setActiveTab] = useState("theory");
  const [error, setError] = useState(null);
  const effectiveCourseId = courseId || "";

  const selectedBlock = useMemo(() => {
    if (!course) {
      return null;
    }

    return (
      course.blocks.find((block) => block.id === selectedModuleId) ??
      findBlockByLesson(course, selectedLessonId) ??
      null
    );
  }, [course, selectedLessonId, selectedModuleId]);

  const selectedLesson = useMemo(() => {
    if (!selectedBlock || !selectedLessonId) {
      return null;
    }

    return (
      selectedBlock.lessons.find((lesson) => lesson.id === selectedLessonId) ??
      null
    );
  }, [selectedBlock, selectedLessonId]);

  const moduleBasicInfo = useMemo(
    () => toModuleBasicInfoFromLearningBlock(selectedBlock),
    [selectedBlock],
  );

  const lessonBasicInfo = useMemo(
    () => toLessonBasicInfoFromLearningLesson(selectedLesson),
    [selectedLesson],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadCourse() {
      setIsLoadingCourse(true);
      setError(null);

      try {
        if (!effectiveCourseId) {
          throw new Error("Идентификатор курса не указан");
        }

        const basicCourse = await getCourseBasicInfo(effectiveCourseId);
        const enrolled = await isUserEnrolled(basicCourse.id);

        if (!isMounted) {
          return;
        }

        setCourse(basicCourse);
        setIsEnrolled(enrolled);
        setSelectedModuleId(blockId ?? null);
        setSelectedLessonId(lessonId ?? null);
        setIsLearningStarted(Boolean(blockId || lessonId));
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || "Не удалось загрузить курс");
        }
      } finally {
        if (isMounted) {
          setIsLoadingCourse(false);
        }
      }
    }

    loadCourse();

    return () => {
      isMounted = false;
    };
  }, [blockId, effectiveCourseId, lessonId]);

  useEffect(() => {
    if (!selectedLesson?.id) {
      setContentBlocks([]);
      return;
    }

    let isMounted = true;

    async function loadLessonContent() {
      setIsLoadingLesson(true);
      setError(null);

      try {
        const lessonBlocks = await getLessonContentBlocks(selectedLesson.id);

        if (isMounted) {
          setContentBlocks(lessonBlocks);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message || "Не удалось загрузить теорию урока");
        }
      } finally {
        if (isMounted) {
          setIsLoadingLesson(false);
        }
      }
    }

    loadLessonContent();

    return () => {
      isMounted = false;
    };
  }, [selectedLesson?.id]);

  useEffect(() => {
    setActiveTab("theory");
  }, [selectedLesson?.id]);

  const openCourseOverview = () => {
    setIsLearningStarted(true);
    setSelectedModuleId(null);
    setSelectedLessonId(null);
  };

  const startLearning = () => {
    setIsLearningStarted(true);
    setSelectedModuleId(null);
    setSelectedLessonId(null);
  };

  const openBlock = async (blockId) => {
    const fallbackBlock = course?.blocks.find((block) => block.id === blockId);
    setSelectedModuleId(blockId);
    setSelectedLessonId(null);
    setContentBlocks([]);
    setError(null);

    try {
      const nextBlock = await getModuleById(blockId);
      setCourse((currentCourse) => {
        if (!currentCourse) return currentCourse;
        return {
          ...currentCourse,
          blocks: currentCourse.blocks.map((block) =>
            block.id === nextBlock.id ? { ...block, ...nextBlock } : block,
          ),
        };
      });
    } catch (loadError) {
      setSelectedModuleId(fallbackBlock?.id ?? null);
      setError(loadError.message || "Не удалось загрузить модуль");
    }
  };

  const openLesson = async (nextLessonId) => {
    const fallbackBlock = findBlockByLesson(course, nextLessonId);
    setActiveTab("theory");
    setSelectedModuleId(fallbackBlock?.id ?? selectedModuleId);
    setSelectedLessonId(nextLessonId);
    setContentBlocks([]);
    setError(null);

    try {
      const nextLesson = await getLessonById(nextLessonId);
      setCourse((currentCourse) => {
        if (!currentCourse) return currentCourse;
        return {
          ...currentCourse,
          blocks: currentCourse.blocks.map((block) => ({
            ...block,
            lessons: block.lessons.map((lesson) =>
              lesson.id === nextLesson.id
                ? { ...lesson, ...nextLesson }
                : lesson,
            ),
          })),
        };
      });
    } catch (loadError) {
      setError(loadError.message || "Не удалось загрузить урок");
    }
  };

  const openCourseEditor = () => {
    if (course?.id && canUpdateCourse) {
      navigate(`/course/${course.id}/edit`);
    }
  };

  const handleEnroll = async () => {
    if (!course?.id) {
      return;
    }

    setIsSubmittingEnrollment(true);
    setError(null);

    try {
      await enrollUserToCourse(course.id);
      setIsEnrolled(true);
      setIsLearningStarted(true);
      setSelectedModuleId(null);
      setSelectedLessonId(null);
    } catch (enrollError) {
      setError(enrollError.message || "Не удалось записаться на курс");
    } finally {
      setIsSubmittingEnrollment(false);
    }
  };

  if (!canReadCourse) {
    return (
      <section className="container section course-viewer">
        <SectionTop label="Курс" title="Доступ ограничен" />
        <article className="glass-card course-viewer-error">
          Курс недоступен для вашей роли. Обратитесь к администратору
          организации, чтобы получить доступ.
        </article>
      </section>
    );
  }

  if (isLoadingCourse) {
    return (
      <section className="container section course-viewer">
        <article className="glass-card course-viewer-loading-card">
          <p className="course-viewer-muted">Загружаем курс...</p>
        </article>
      </section>
    );
  }

  if (error && !course) {
    return (
      <section className="container section course-viewer">
        <article className="glass-card course-viewer-error">
          <h1>Не удалось открыть курс</h1>
          <p>{error}</p>
        </article>
      </section>
    );
  }

  if (!isEnrolled) {
    return (
      <section className="container section course-viewer course-enrollment-view">
        <SectionTop label="Курс" title={course?.title || "Просмотр курса"} />
        {error && (
          <article className="glass-card course-viewer-error" role="alert">
            {error}
          </article>
        )}
        <CourseBasicInfo course={course} />
        <article className="glass-card locked-course-card generated-course-enroll-card">
          <div>
            <h2>Содержимое курса закрыто</h2>
            <p>
              Запишитесь на курс, чтобы открыть модули, уроки, теорию и
              ИИ-ментора.
            </p>
          </div>
          <div className="generated-course-actions">
            <button
              type="button"
              className="btn btn-solid"
              onClick={handleEnroll}
              disabled={isSubmittingEnrollment}
            >
              {isSubmittingEnrollment
                ? "Записываем..."
                : "Записаться и перейти к обучению"}
            </button>
            {canUpdateCourse && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={openCourseEditor}
              >
                Редактировать курс
              </button>
            )}
          </div>
        </article>
      </section>
    );
  }

  if (!isLearningStarted) {
    return (
      <section className="container section course-viewer course-enrollment-view">
        <SectionTop label="Курс" title={course?.title || "Просмотр курса"} />
        {error && (
          <article className="glass-card course-viewer-error" role="alert">
            {error}
          </article>
        )}
        <CourseBasicInfo course={course} />
        <article className="glass-card generated-course-enroll-card">
          <div>
            <h2>Курс доступен для прохождения</h2>
            <p>
              Нажмите кнопку, чтобы открыть структуру курса и начать обучение.
            </p>
          </div>
          <div className="generated-course-actions">
            <button
              type="button"
              className="btn btn-solid"
              onClick={startLearning}
            >
              Перейти к обучению
            </button>
            {canUpdateCourse && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={openCourseEditor}
              >
                Редактировать курс
              </button>
            )}
          </div>
        </article>
      </section>
    );
  }

  const sectionLabel = selectedLesson
    ? "Урок"
    : selectedBlock
      ? "Модуль"
      : "Курс";
  const sectionTitle =
    selectedLesson?.title || selectedBlock?.title || course.title;
  const showLessonAiChat = Boolean(selectedLesson) && activeTab === "theory";

  return (
    <section
      className={`container section lesson-view generated-course-learning-view ${
        showLessonAiChat ? "has-lesson-chat" : ""
      }`}
    >
      <SectionTop label={sectionLabel} title={sectionTitle} />
      {error && (
        <article className="glass-card course-viewer-error" role="alert">
          {error}
        </article>
      )}
      <div
        className={`lesson-view-grid generated-course-learning-grid ${
          showLessonAiChat ? "has-lesson-chat" : ""
        }`}
      >
        <aside
          className="course-nav-tree generated-course-navigation-shell"
          aria-label="Навигация по курсу"
        >
          <button
            type="button"
            className={`generated-course-nav-course ${!selectedBlock ? "is-active" : ""}`}
            onClick={openCourseOverview}
          >
            <strong>{course.title}</strong>
            <span>Курс</span>
          </button>

          {course.blocks.length > 0 ? (
            <ul className="course-nav-block-list">
              {course.blocks.map((block, blockIndex) => (
                <li
                  key={block.id}
                  className={`course-nav-block ${selectedBlock?.id === block.id ? "is-active" : ""}`}
                >
                  <button
                    type="button"
                    className="course-nav-block-btn"
                    onClick={() => openBlock(block.id)}
                  >
                    <span>{blockIndex + 1}</span>
                    <strong>{block.title}</strong>
                  </button>
                  <ul className="course-nav-item-list">
                    {block.lessons.map((lesson, lessonIndex) => (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          className={`course-nav-item-btn ${selectedLesson?.id === lesson.id ? "is-active" : ""}`}
                          onClick={() => openLesson(lesson.id)}
                        >
                          <span className="course-nav-item-number">
                            {blockIndex + 1}.{lessonIndex + 1}
                          </span>
                          <span className="course-nav-item-title">
                            {lesson.title}
                          </span>
                          <span className="course-nav-item-status" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="course-viewer-muted">В курсе пока нет модулей.</p>
          )}
        </aside>

        <article
          className="glass-card lesson-main-card generated-course-main-card"
          onScroll={(event) => {
            event.currentTarget.classList.toggle(
              "is-scrolled",
              event.currentTarget.scrollTop > 8,
            );
          }}
        >
          <div className="lesson-scroll-frame generated-course-scroll-frame">
            {!selectedBlock ? (
              <>
                <CourseBasicInfo course={course} />
                <ModuleList
                  modules={course.blocks}
                  selectedModuleId=""
                  disabled={false}
                  onSelectModule={openBlock}
                />
              </>
            ) : !selectedLesson ? (
              <>
                <ModuleBasicInfo module={moduleBasicInfo} />
                <LessonList
                  lessons={moduleBasicInfo?.lessons || []}
                  selectedLessonId=""
                  onSelectLesson={openLesson}
                />
              </>
            ) : (
              <>
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
                  <button type="button" aria-selected="false" disabled>
                    Практика
                  </button>
                </div>

                {activeTab === "questions" ? (
                  <div className="lesson-questions-placeholder">
                    <p className="course-category">Проверочные вопросы</p>
                    <h2>
                      Проверочные вопросы по модулю «
                      {selectedBlock?.title || "Модуль"}»
                    </h2>
                    <p>
                      Проверочные вопросы отображаются внутри теоретических
                      content blocks типа quiz.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="course-category">{course.title}</p>
                    <LessonBasicInfo lesson={lessonBasicInfo} />
                    {isLoadingLesson ? (
                      <p className="course-viewer-muted">
                        Загружаем теорию урока...
                      </p>
                    ) : (
                      <ContentBlocks blocks={contentBlocks} />
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </article>

        {showLessonAiChat && (
          <LessonAiChat key={selectedLesson.id} onDownloadSummary={() => {}} />
        )}
      </div>
    </section>
  );
}
