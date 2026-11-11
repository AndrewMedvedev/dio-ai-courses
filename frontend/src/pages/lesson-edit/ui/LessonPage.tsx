// Страница отдельного урока с навигацией по курсу и блочным редактором контента
import { useEffect, useRef, useState } from "react";
import {
  CourseNavigationTree,
  ContentBlocks,
  getLessonContentBlocks,
  printLessonSummary,
  type BlockNode,
  type CourseNode,
  type LessonNode,
} from "@/entities/course";
import {
  LessonPracticeAgent,
  LessonTestAgent,
} from "@/features/lesson-assessment";
import { LessonChatWorkspace } from "@/widgets/lesson-chat-workspace";
import {
  LessonContentEditor,
  type LessonContentChange,
} from "@/features/edit-lesson-content";
import type { RawApiRecord } from "@/shared/api";
import { SectionTop } from "@/shared/ui/section-top";
import { useGoBack, useUiLayoutStore } from "@/shared/lib/ui-layout";
import { useTheorySessionTracker } from "@/features/track-theory-time";
import { draftKey, useEditorDraftStore } from "@/features/edit-course-draft";

type CompletedMap = Record<string, boolean | undefined>;

/** Изменение урока: поля из формы или содержимое из редактора блоков. */
export type LessonChanges = Partial<LessonNode> | LessonContentChange;

export interface UpdateLessonOptions {
  /** Блоки до правки: с ними сравнивается черновик при сохранении. */
  originalContentBlocks?: unknown[];
}

export interface LessonPageProps {
  selectedCourse: CourseNode;
  selectedBlock: BlockNode;
  selectedLesson: LessonNode;
  completedLessons: CompletedMap;
  completedPractices: CompletedMap;
  openBlock: (blockId: string) => void;
  openBlockPage?: (blockId: string) => void;
  openLesson: (lessonId: string) => void;
  openPractice: (practiceId: string) => void;
  isCourseEditMode: boolean;
  updateLesson: (
    lessonId: string,
    changes: LessonChanges,
    options?: UpdateLessonOptions,
  ) => void;
}

/** Урок: теория, тесты и практика для ученика, редактор контента для автора. */
export function LessonPage({
  selectedCourse,
  selectedBlock,
  selectedLesson,
  completedLessons,
  completedPractices,
  openBlock,
  openLesson,
  openPractice,
  isCourseEditMode,
  updateLesson,
}: LessonPageProps) {
  const hasContent = Boolean(selectedLesson.markdown || selectedLesson.content);
  const persistedActiveTab = useUiLayoutStore((state) =>
    state.getLessonActiveTab(selectedLesson.id),
  );
  const setLessonActiveTab = useUiLayoutStore(
    (state) => state.setLessonActiveTab,
  );
  const [contentBlocks, setContentBlocks] = useState<RawApiRecord[]>([]);
  const [contentBlocksLessonId, setContentBlocksLessonId] = useState("");
  const [isLoadingTheory, setIsLoadingTheory] = useState(false);
  const [theoryError, setTheoryError] = useState("");
  const theoryContainerRef = useRef<HTMLElement>(null);
  const theoryContentRef = useRef<HTMLElement>(null);
  // Несохранённая версия содержимого урока (ждёт подтверждения сохранения).
  const pendingContentBlocks = useEditorDraftStore(
    (state) =>
      state.edits[draftKey("lesson", selectedLesson.id)]?.changes
        ?.contentBlocks,
  );
  const draftRevision = useEditorDraftStore((state) => state.revision);
  const showStudentTabs = !isCourseEditMode;
  const activeTab = showStudentTabs ? persistedActiveTab : "theory";
  const isChatAvailable = !isCourseEditMode && activeTab === "theory";
  const lessonContentBlocks: RawApiRecord[] = Array.isArray(
    selectedLesson.contentBlocks,
  )
    ? selectedLesson.contentBlocks
    : Array.isArray(selectedLesson.content_blocks)
      ? selectedLesson.content_blocks
      : [];
  const visibleContentBlocks = contentBlocks.length
    ? contentBlocks
    : lessonContentBlocks.length
      ? lessonContentBlocks
      : hasContent
        ? [
            {
              content_type: "text",
              ai_generated: false,
              md_content: selectedLesson.markdown || selectedLesson.content,
            },
          ]
        : [];
  const editorContentBlocks = Array.isArray(pendingContentBlocks)
    ? pendingContentBlocks
    : visibleContentBlocks;
  const editorLesson = isCourseEditMode
    ? {
        ...selectedLesson,
        contentBlocks: editorContentBlocks,
        content_blocks: editorContentBlocks,
      }
    : selectedLesson;
  const isEditorWaitingForTheory =
    isCourseEditMode &&
    isLoadingTheory &&
    contentBlocksLessonId !== selectedLesson.id &&
    lessonContentBlocks.length === 0 &&
    !hasContent;

  const shouldTrackTheorySession = !isCourseEditMode && activeTab === "theory";
  const goBack = useGoBack({
    fallbackPath: isCourseEditMode
      ? `/course/${selectedCourse.id}/edit/block/${selectedBlock.id}`
      : `/course/${selectedCourse.id}/block/${selectedBlock.id}`,
  });

  useTheorySessionTracker(selectedLesson.id, {
    enabled: shouldTrackTheorySession,
    scrollContainerRef: theoryContainerRef,
    contentRef: theoryContentRef,
    isContentReady: !isLoadingTheory && !theoryError,
  });

  useEffect(() => {
    if (!selectedLesson.id) {
      setContentBlocks([]);
      setContentBlocksLessonId("");
      setTheoryError("");
      return;
    }

    let isMounted = true;
    setContentBlocks([]);
    setContentBlocksLessonId("");
    setIsLoadingTheory(true);
    setTheoryError("");

    getLessonContentBlocks(selectedLesson.id)
      .then((blocks) => {
        if (isMounted) {
          setContentBlocks(blocks);
          setContentBlocksLessonId(selectedLesson.id);
        }
      })
      .catch((rawError) => {
        const error = rawError as { userMessage?: string; message?: string };
        if (isMounted) {
          setTheoryError(
            error.userMessage ||
              error.message ||
              "Не удалось загрузить теорию урока.",
          );
          setContentBlocks([]);
          setContentBlocksLessonId(selectedLesson.id);
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
  }, [selectedLesson.id]);

  return (
    <section
      className={`container section lesson-view tw:relative tw:z-[1] tw:w-[min(1360px,_96vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:[&.is-course-edit-layout]:w-[min(1720px,_98vw)] tw:[&.is-learning-layout]:w-[min(1600px,_98vw)] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:[--glass-fallback-bg:rgba(243,_239,_231,_0.94)] tw:dark:[--muted:#c4b9a7] tw:dark:[--eyebrow:#a0c4ff] tw:dark:[--ink-accent:#dfd2bf] tw:dark:[--info-text:#b7ab99] tw:dark:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:dark:[--glass-bg-strong:rgba(44,_44,_44,_0.92)] tw:dark:[--glass-fallback-bg:rgba(31,_31,_31,_0.96)] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:[&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg)] tw:no-backdrop-filter:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[&_.glass-card]:[background:var(--glass-fallback-bg)] tw:[&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&_.glass-card::after]:[content:none] ${
        isCourseEditMode ? "is-course-edit-layout" : "is-learning-layout"
      }`}
    >
      <SectionTop label="Урок" title={selectedLesson.title} />
      <button
        type="button"
        className="btn btn-outline back-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[0] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:m-[0] tw:w-[44px] tw:h-[44px] tw:text-[0.96rem] tw:leading-[1.45] tw:absolute tw:top-[18px] tw:right-[0] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
        onClick={goBack}
        aria-label="Назад к блоку"
        title="Назад к блоку"
      >
        &lt;
      </button>
      <LessonChatWorkspace
        className={
          isCourseEditMode ? "is-course-edit-layout" : "is-learning-layout"
        }
        chatEnabled={!isCourseEditMode}
        chatAvailable={isChatAvailable}
        chatKey={selectedLesson.id}
        chatProps={{
          courseId: selectedCourse.id,
          lessonId: selectedLesson.id,
          lessonTitle: selectedLesson.title,
          contentBlocks: visibleContentBlocks,
          onDownloadSummary: () =>
            printLessonSummary({
              course: selectedCourse,
              block: selectedBlock,
              lesson: selectedLesson,
            }),
        }}
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
          ref={theoryContainerRef}
          className={`glass-card lesson-main-card tw:border-none tw:border-[currentcolor] tw:rounded-[0] tw:sticky tw:overflow-hidden tw:overflow-y-auto tw:isolation-auto tw:p-[6px] tw:top-[16px] tw:max-h-[calc(100vh_-_32px)] tw:[border-width:0] tw:hover:border-(--glass-glow) tw:[background:transparent] tw:[box-shadow:none] tw:[&.is-editing]:static tw:max-1100:static tw:[&.is-editing]:overflow-visible tw:max-1100:overflow-y-visible tw:[backdrop-filter:none] tw:[-webkit-backdrop-filter:none] tw:[.generated-course-learning-grid_&]:min-w-[0] tw:[.generated-course-learning-grid_&]:w-[100%] tw:[&.is-editing]:max-h-[none] tw:max-1100:max-h-[none] tw:[overscroll-behavior-y:contain] tw:[scrollbar-width:thin] tw:[scrollbar-color:rgba(var(--accent-rgb),_0.55)_transparent] tw:max-1100:min-h-[auto] tw:no-backdrop-filter:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[background:var(--glass-fallback-bg)] tw:[&:not(.lesson-main-card)]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[&:not(.lesson-main-card)]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[&:not(.lesson-main-card)]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:sticky tw:[&::before]:top-[-6px] tw:[&::before]:inset-[auto] tw:[&::before]:z-[20] tw:[&::before]:rounded-[20px_20px_0_0] tw:[&::before]:block tw:[&::before]:w-[calc(100%_+_12px)] tw:[&::before]:h-[52px] tw:[&::before]:ml-[-6px] tw:[&::before]:mb-[-52px] tw:[&::before]:pointer-events-none tw:[&::before]:opacity-[0] tw:[&::before]:[content:''] tw:[&::before]:[background:linear-gradient(_180deg,_rgba(245,_241,_232,_0.98)_0%,_rgba(245,_241,_232,_0.98)_30%,_rgba(245,_241,_232,_0.84)_58%,_rgba(245,_241,_232,_0)_100%_)] tw:[&::before]:[box-shadow:none] tw:[&::before]:[backdrop-filter:blur(12px)] tw:[&::before]:[-webkit-backdrop-filter:blur(12px)] tw:[&.is-scrolled]:[&::before]:opacity-[1] tw:[&::before]:[transform:translateY(-8px)] tw:[&::before]:[transition:opacity_160ms_ease,_transform_160ms_ease] tw:[&::after]:[content:none] tw:dark:[&::before]:[background:linear-gradient(_180deg,_rgba(31,_31,_31,_0.98)_0%,_rgba(31,_31,_31,_0.98)_30%,_rgba(31,_31,_31,_0.86)_58%,_rgba(31,_31,_31,_0)_100%_)] tw:[&.is-scrolled]:[&::before]:[transform:translateY(0)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] ${isCourseEditMode ? "is-editing" : ""}`}
          onScroll={(event) => {
            event.currentTarget.classList.toggle(
              "is-scrolled",
              event.currentTarget.scrollTop > 8,
            );
          }}
        >
          <div className="lesson-scroll-frame tw:relative tw:isolate tw:overflow-visible tw:w-[100%] tw:min-w-[0] tw:p-[clamp(28px,_3vw,_42px)] tw:border-solid tw:border-(--glass-border) tw:rounded-[24px] tw:[border-width:1px] tw:dark:border-[rgba(233,_222,_203,_0.24)] tw:[background:var(--glass-bg-strong)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[-webkit-backdrop-filter:none] tw:[backdrop-filter:none] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:pointer-events-none tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[&::after]:[content:none] tw:[&_.glass-card]:[background:var(--glass-bg-strong)] tw:[&_.glass-card]:[backdrop-filter:none] tw:[&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
            <div
              className="lesson-mode-switch tw:inline-flex tw:items-center tw:gap-[4px] tw:mb-[14px] tw:p-[4px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[10px] tw:[.generated-course-learning-grid_&]:mb-[0] tw:[border-width:1px] tw:dark:border-[rgba(var(--accent-rgb),_0.42)] tw:[background:var(--glass-bg-strong)] tw:[.generated-course-learning-grid_&]:[justify-self:start]"
              role="tablist"
              aria-label="Тип материала"
            >
              <button
                type="button"
                className={`tw:min-w-[106px] tw:min-h-[34px] tw:rounded-[7px] tw:text-(--muted) tw:cursor-pointer tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:[border:0] tw:[background:transparent] tw:[&.is-active]:text-(--heading) tw:dark:text-[#cfc2ad] tw:disabled:cursor-not-allowed tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:disabled:opacity-[0.5] tw:[&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[&.is-active]:text-[#ffffff] tw:dark:[&.is-active]:[background:rgba(255,_255,_255,_0.09)] tw:[&:hover:not(:disabled)]:text-(--heading) tw:[&:hover:not(:disabled)]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[&:hover:not(:disabled)]:text-[#ffffff] tw:dark:[&:hover:not(:disabled)]:[background:rgba(255,_255,_255,_0.09)] ${activeTab === "theory" ? "is-active" : ""}`}
                aria-selected={activeTab === "theory"}
                onClick={() => setLessonActiveTab(selectedLesson.id, "theory")}
              >
                Теория
              </button>
              {showStudentTabs && (
                <>
                  <button
                    type="button"
                    className={`tw:[.lesson-mode-switch_&.is-active]:text-(--heading) tw:[.lesson-mode-switch_&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page_.lesson-mode-switch_&.is-active]:text-[#ffffff] tw:dark:[.page_.lesson-mode-switch_&.is-active]:[background:rgba(255,_255,_255,_0.09)] ${activeTab === "questions" ? "is-active" : ""}`}
                    aria-selected={activeTab === "questions"}
                    onClick={() =>
                      setLessonActiveTab(selectedLesson.id, "questions")
                    }
                  >
                    Проверочные вопросы
                  </button>
                  <button
                    type="button"
                    className={`tw:[.lesson-mode-switch_&.is-active]:text-(--heading) tw:[.lesson-mode-switch_&.is-active]:[background:rgba(var(--accent-rgb),_0.16)] tw:dark:[.page_.lesson-mode-switch_&.is-active]:text-[#ffffff] tw:dark:[.page_.lesson-mode-switch_&.is-active]:[background:rgba(255,_255,_255,_0.09)] ${activeTab === "practice" ? "is-active" : ""}`}
                    aria-selected={activeTab === "practice"}
                    onClick={() =>
                      setLessonActiveTab(selectedLesson.id, "practice")
                    }
                    disabled={!selectedBlock.id || !selectedLesson.id}
                  >
                    Практика
                  </button>
                </>
              )}
            </div>
            {showStudentTabs && activeTab === "questions" ? (
              <LessonTestAgent
                key={`${selectedBlock.id}:${selectedLesson.id}:test`}
                moduleId={selectedBlock.id}
                lessonId={selectedLesson.id}
              />
            ) : showStudentTabs && activeTab === "practice" ? (
              <LessonPracticeAgent
                key={`${selectedBlock.id}:${selectedLesson.id}:practice`}
                moduleId={selectedBlock.id}
                lessonId={selectedLesson.id}
              />
            ) : (
              <>
                {isCourseEditMode && (
                  <div className="course-editor-panel lesson-editor-panel tw:mt-[16px] tw:rounded-[14px] tw:p-[12px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)]">
                    <div className="course-editor-grid tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:w-[100%] tw:min-w-[0] tw:max-760:grid-cols-[1fr]">
                      <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                        <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                          Название урока
                        </span>
                        <input
                          className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:max-w-[100%] tw:min-h-[46px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                          value={selectedLesson.title}
                          onChange={(event) =>
                            updateLesson(selectedLesson.id, {
                              title: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                        <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                          Длительность
                        </span>
                        <input
                          className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:max-w-[100%] tw:min-h-[46px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                          value={selectedLesson.duration}
                          onChange={(event) =>
                            updateLesson(selectedLesson.id, {
                              duration: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="course-editor-field course-editor-field-wide tw:grid tw:gap-[7px] tw:col-[1_/_-1] tw:min-w-[0] tw:max-700:col-[auto]">
                        <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                          Краткое описание
                        </span>
                        <textarea
                          className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:min-h-[105px] tw:resize-y tw:max-w-[100%] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                          value={selectedLesson.summary || ""}
                          onChange={(event) =>
                            updateLesson(selectedLesson.id, {
                              summary: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    {isEditorWaitingForTheory ? (
                      <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.72] tw:m-[10px_0_0] tw:text-[1rem] tw:tracking-[0.012em]">
                        Загружаем теорию урока...
                      </p>
                    ) : theoryError ? (
                      <article
                        className="glass-card course-viewer-error tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[.lesson-scroll-frame_&]:[background:var(--glass-bg-strong)] tw:[.lesson-scroll-frame_&]:[backdrop-filter:none] tw:[.lesson-scroll-frame_&]:[-webkit-backdrop-filter:none] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:[.lesson-view_&:not(.lesson-main-card)]:[background:var(--glass-bg)] tw:[.lesson-view_.glass-card_&:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:no-backdrop-filter:[.lesson-view_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.lesson-view_&]:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_.glass-card_&]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&:not(.lesson-main-card)]:[backdrop-filter:var(--glass-backdrop)] tw:[.lesson-view_.glass-card_&:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_.glass-card_&]:[backdrop-filter:none] tw:[.lesson-view_&:not(.lesson-main-card)]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[.lesson-view_.glass-card_&:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_.glass-card_&]:[-webkit-backdrop-filter:none] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[.lesson-view_&]:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
                        role="alert"
                      >
                        {theoryError}
                      </article>
                    ) : (
                      <LessonContentEditor
                        key={`${selectedLesson.id}:${contentBlocksLessonId}:${draftRevision}`}
                        courseId={selectedCourse.id}
                        lesson={editorLesson}
                        floatingAiEditor
                        onChange={(changes) =>
                          updateLesson(selectedLesson.id, changes, {
                            originalContentBlocks: visibleContentBlocks,
                          })
                        }
                      />
                    )}
                  </div>
                )}

                {!isCourseEditMode && isLoadingTheory ? (
                  <p className="course-viewer-muted tw:text-(--muted) tw:leading-[1.6] tw:m-[10px_0_0]">
                    Загружаем теорию урока...
                  </p>
                ) : !isCourseEditMode && theoryError ? (
                  <article
                    className="glass-card course-viewer-error tw:border-(--glass-border) tw:border-solid tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[border-width:1px] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:[.lesson-scroll-frame_&]:[background:var(--glass-bg-strong)] tw:[.lesson-scroll-frame_&]:[backdrop-filter:none] tw:[.lesson-scroll-frame_&]:[-webkit-backdrop-filter:none] tw:dark:[*_&]:[background:rgba(89,_56,_16,_0.36)] tw:[.lesson-view_&:not(.lesson-main-card)]:[background:var(--glass-bg)] tw:[.lesson-view_.glass-card_&:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:no-backdrop-filter:[.lesson-view_&]:[background:var(--glass-fallback-bg)] tw:transparency-reduce:[.lesson-view_&]:[background:var(--glass-fallback-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_.glass-card_&]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&:not(.lesson-main-card)]:[backdrop-filter:var(--glass-backdrop)] tw:[.lesson-view_.glass-card_&:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_.glass-card_&]:[backdrop-filter:none] tw:[.lesson-view_&:not(.lesson-main-card)]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[.lesson-view_.glass-card_&:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_.glass-card_&]:[-webkit-backdrop-filter:none] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[.lesson-view_&]:[&::after]:[content:none] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]"
                    role="alert"
                  >
                    {theoryError}
                  </article>
                ) : !isCourseEditMode ? (
                  <div className="lesson-theory-content">
                    <p className="course-category tw:m-[0] tw:text-[0.8rem] tw:uppercase tw:tracking-[0.08em] tw:text-(--accent) tw:font-[700]">
                      {selectedCourse.title}
                    </p>
                    <p className="lesson-summary tw:m-[12px_0_0] tw:text-(--ink-accent) tw:font-[700] tw:[.page.is-inner-page_&]:mt-[16px] tw:[.page.is-inner-page_&]:text-[1.08rem] tw:[.page.is-inner-page_&]:leading-[1.68] tw:[.page.is-inner-page_&]:tracking-[0.01em]">
                      {selectedLesson.summary}
                    </p>
                    <ContentBlocks
                      ref={theoryContentRef}
                      blocks={visibleContentBlocks}
                      lessonId={selectedLesson.id}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </article>
      </LessonChatWorkspace>
    </section>
  );
}
