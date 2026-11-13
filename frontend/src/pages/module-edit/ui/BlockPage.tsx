// Страница выбранного блока курса с уроками и практикой
import { Fragment, useEffect, useState } from 'react';
import { SectionTop } from '@/shared/ui/section-top';
import {
  CourseNavigationTree,
  type BlockNode,
  type CourseNode,
  type LessonNode,
} from '@/entities/course';
import {
  AgentInterviewDialog,
  resetAgentInterview,
} from '@/features/agent-interview';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { useGoBack } from '@/shared/lib/ui-layout';
import {
  generationJobKey,
  useGenerationJobsStore,
} from '@/entities/generation-job';
import { isUuid } from '@/shared/lib/uuid';

type CompletedMap = Record<string, boolean | undefined>;

export interface BlockPageProps {
  selectedCourse: CourseNode;
  selectedBlock: BlockNode;
  completedLessons: CompletedMap;
  completedPractices: CompletedMap;
  openCourse?: (courseId?: string) => void;
  openBlock?: (blockId: string) => void;
  openLesson: (lessonId: string) => void;
  openPractice: (practiceId: string) => void;
  isCourseEditMode: boolean;
  updateCourseBlock: (blockId: string, changes: Partial<BlockNode>) => void;
  addLessonToBlock?: (blockId: string) => Promise<string | null | undefined>;
  updateLesson: (lessonId: string, changes: Partial<LessonNode>) => void;
  updatePractice?: (
    practiceId: string,
    changes: Record<string, unknown>,
  ) => void;
  moveLesson: (blockId: string, lessonId: string, direction: number) => void;
  movePractice?: (
    blockId: string,
    practiceId: string,
    direction: number,
  ) => void;
  deleteLesson: (blockId: string, lessonId: string) => unknown;
  deletePractice?: (blockId: string, practiceId: string) => void;
}

/** Модуль курса: описание, цели, список уроков и генерация урока с ИИ. */
export function BlockPage({
  selectedCourse,
  selectedBlock,
  completedLessons,
  completedPractices,
  openBlock,
  openLesson,
  openPractice,
  isCourseEditMode,
  updateCourseBlock,
  addLessonToBlock,
  updateLesson,
  moveLesson,
  deleteLesson,
}: BlockPageProps) {
  const completedLessonsInBlock = selectedBlock.lessons.filter(
    (lesson) => completedLessons[lesson.id],
  ).length;
  const completedPracticesInBlock = selectedBlock.practice.filter(
    (practice) => completedPractices[practice.id],
  ).length;
  const totalItemsInBlock =
    selectedBlock.lessons.length + selectedBlock.practice.length;
  const completedInBlock = completedLessonsInBlock + completedPracticesInBlock;
  const blockProgressPercent = totalItemsInBlock
    ? Math.round((completedInBlock / totalItemsInBlock) * 100)
    : 0;
  const blockLearningObjectives = selectedBlock.learningObjectives || [];
  const [isAddingLesson, setIsAddingLesson] = useState(false);
  // Позиция в списке уроков, где открыт чат генерации урока (null — закрыт).
  const [lessonAgentIndex, setLessonAgentIndex] = useState<number | null>(null);
  const [isLessonChatVisible, setIsLessonChatVisible] = useState(true);
  const [lessonToDelete, setLessonToDelete] = useState<LessonNode | null>(null);
  const lessonJob = useGenerationJobsStore(
    (state) =>
      state.jobs[
        generationJobKey('lesson', selectedCourse.id, selectedBlock.id)
      ] || null,
  );
  // Перешли в другой модуль — место для урока выбирается заново.
  useEffect(() => {
    setLessonAgentIndex(null);
    setIsLessonChatVisible(true);
  }, [selectedBlock.id]);
  const canGenerateLesson =
    isCourseEditMode && isUuid(selectedCourse.id) && isUuid(selectedBlock.id);
  // Пока идёт генерация, чат остаётся в месте, куда вставится урок.
  const lessonAgentAt =
    lessonJob && Number.isFinite(Number(lessonJob.order))
      ? Number(lessonJob.order) - 1
      : lessonAgentIndex;

  const describeLessonPosition = (index: number) => {
    const lessons = selectedBlock.lessons;
    if (!lessons.length) return 'Урок станет первым в модуле.';
    if (index <= 0)
      return `Урок встанет в начало, перед «${lessons[0].title}».`;
    if (index >= lessons.length) {
      return `Урок встанет в конец, после «${lessons[lessons.length - 1].title}».`;
    }
    return `Урок встанет между «${lessons[index - 1].title}» и «${lessons[index].title}».`;
  };

  const isLessonJobRunning = lessonJob?.status === 'running';

  // Открывает чат у выбранного места или переносит туда уже открытый чат — окно не
  // закрывается. Пока генерация идёт, место менять нельзя. После готового или
  // упавшего запуска начинаем новый диалог.
  const openLessonAgent = (index: number) => {
    const currentJob =
      useGenerationJobsStore.getState().jobs[
        generationJobKey('lesson', selectedCourse.id, selectedBlock.id)
      ];
    if (currentJob?.status === 'running') return;
    if (currentJob) {
      resetAgentInterview({
        kind: 'lesson',
        courseId: selectedCourse.id,
        moduleId: selectedBlock.id,
      });
    }
    setLessonAgentIndex(index);
    setIsLessonChatVisible(true);
  };

  // Пока генерация идёт, окно только прячется: метка в списке остаётся.
  // Готовую или упавшую генерацию закрытие завершает — метка пропадает.
  const closeLessonAgent = () => {
    const currentJob =
      useGenerationJobsStore.getState().jobs[
        generationJobKey('lesson', selectedCourse.id, selectedBlock.id)
      ];
    if (currentJob?.status === 'running') {
      setIsLessonChatVisible(false);
      return;
    }
    if (currentJob) {
      resetAgentInterview({
        kind: 'lesson',
        courseId: selectedCourse.id,
        moduleId: selectedBlock.id,
      });
    }
    setLessonAgentIndex(null);
  };

  const renderLessonSlot = (index: number) => {
    if (!canGenerateLesson) return null;
    if (lessonAgentAt === index) {
      return (
        <li
          className="lesson-agent-marker tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[8px] tw:m-[2px_0] tw:p-[8px_12px] tw:border-dashed tw:border-[rgba(47,_125,_79,_0.55)] tw:rounded-[14px] tw:text-[#2f7d4f] tw:text-[0.84rem] tw:font-[800] tw:[border-width:1.5px] tw:[background:rgba(47,_125,_79,_0.08)] tw:[list-style:none] tw:dark:[.page_&]:border-[rgba(127,_209,_155,_0.5)] tw:dark:[.page_&]:text-[#7fd19b] tw:dark:[.page_&]:[background:rgba(127,_209,_155,_0.08)] tw:[&_>_div]:flex tw:[&_>_div]:gap-[6px] tw:[&_button]:[border:1px_solid_rgba(47,_125,_79,_0.45)] tw:[&_button]:rounded-[999px] tw:[&_button]:[background:transparent] tw:[&_button]:text-[inherit] tw:[&_button]:p-[4px_12px] tw:[&_button]:[font-style:inherit] tw:[&_button]:[font-variant:inherit] tw:[&_button]:[font-weight:inherit] tw:[&_button]:[font-stretch:inherit] tw:[&_button]:leading-[inherit] tw:[&_button]:[font-family:inherit] tw:[&_button]:text-[0.78rem] tw:[&_button]:cursor-pointer tw:[&_button:hover]:[background:rgba(47,_125,_79,_0.12)]"
          key={`lesson-agent-${index}`}
        >
          <span>
            {lessonJob?.status === 'running'
              ? '✦ Здесь появится урок — генерация идёт'
              : lessonJob?.status === 'done'
                ? '✦ Урок сгенерирован — ниже'
                : '✦ Сюда встанет урок из чата с ИИ'}
          </span>
          <div>
            {!isLessonChatVisible && (
              <button
                type="button"
                onClick={() => setIsLessonChatVisible(true)}
              >
                Показать чат
              </button>
            )}
            {!lessonJob && (
              <button type="button" onClick={() => setLessonAgentIndex(null)}>
                Отменить
              </button>
            )}
          </div>
        </li>
      );
    }
    return (
      <li
        className="lesson-insert-slot tw:mb-[10px] tw:text-(--muted) tw:leading-[1.72] tw:text-[1rem] tw:tracking-[0.012em] tw:[list-style:none] tw:[.lessons-progress-list_li_+_&]:mt-[8px]"
        key={`lesson-slot-${index}`}
      >
        <button
          type="button"
          className="is-ai tw:border-[rgba(47,_125,_79,_0.45)] tw:text-[#2f7d4f] tw:w-[100%] tw:border-dashed tw:rounded-[999px] tw:p-[6px_10px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:cursor-pointer tw:dark:border-[rgba(127,_209,_155,_0.45)] tw:dark:text-[#7fd19b] tw:[border-width:1px] tw:[background:transparent] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:disabled:cursor-not-allowed tw:disabled:opacity-[0.5] tw:hover:[background:rgba(47,_125,_79,_0.08)]"
          onClick={() => openLessonAgent(index)}
          disabled={isLessonJobRunning}
          title={
            isLessonJobRunning
              ? 'Дождитесь окончания текущей генерации урока'
              : undefined
          }
        >
          {lessonAgentAt === null
            ? '✦ Сгенерировать урок с ИИ здесь'
            : '✦ Сгенерировать урок здесь'}
        </button>
      </li>
    );
  };
  const goBack = useGoBack({
    fallbackPath: isCourseEditMode
      ? `/course/${selectedCourse.id}/edit`
      : `/course/${selectedCourse.id}`,
  });

  const addLesson = async () => {
    if (!addLessonToBlock || isAddingLesson) return;

    setIsAddingLesson(true);
    try {
      const lessonId = await addLessonToBlock(selectedBlock.id);
      if (lessonId) {
        openLesson(lessonId);
      }
    } finally {
      setIsAddingLesson(false);
    }
  };

  const updateBlockObjective = (index: number, value: string) => {
    const nextObjectives = [...blockLearningObjectives];
    nextObjectives[index] = value;
    updateCourseBlock(selectedBlock.id, { learningObjectives: nextObjectives });
  };

  const addBlockObjective = () => {
    updateCourseBlock(selectedBlock.id, {
      learningObjectives: [...blockLearningObjectives, ''],
    });
  };

  const removeBlockObjective = (index: number) => {
    updateCourseBlock(selectedBlock.id, {
      learningObjectives: blockLearningObjectives.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    });
  };

  return (
    <section
      className={`container section block-view tw:relative tw:z-[1] tw:w-[min(1600px,_98vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:[&.is-course-edit-layout]:w-[min(1720px,_98vw)] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:dark:[--muted:#c4b9a7] tw:dark:[--eyebrow:#a0c4ff] tw:dark:[--ink-accent:#dfd2bf] tw:dark:[--info-text:#b7ab99] tw:dark:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:dark:[--glass-bg-strong:rgba(44,_44,_44,_0.92)] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] ${isCourseEditMode ? 'is-course-edit-layout' : ''}`}
    >
      <SectionTop label="Блок" title={selectedBlock.title} />
      <button
        type="button"
        className="btn btn-outline back-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[0] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:m-[0] tw:w-[44px] tw:h-[44px] tw:text-[0.96rem] tw:leading-[1.45] tw:absolute tw:top-[18px] tw:right-[0] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
        onClick={goBack}
        aria-label="Назад к курсу"
        title="Назад к курсу"
      >
        &lt;
      </button>
      {/* Та же сетка, что в режиме обучения: дерево курса слева, модуль справа. */}
      <div className="course-edit-grid tw:grid-cols-[300px_minmax(0,_1fr)] tw:gap-[18px] tw:mt-[16px] tw:grid tw:between-1101-1300:grid-cols-[280px_minmax(0,_1fr)] tw:max-1100:grid-cols-[1fr] tw:[align-items:start] tw:[&_>_*]:min-w-[0]">
        <CourseNavigationTree
          selectedCourse={selectedCourse}
          selectedBlock={selectedBlock}
          selectedLessonId=""
          selectedPracticeId=""
          completedLessons={completedLessons}
          completedPractices={completedPractices}
          openBlock={openBlock || (() => {})}
          openLesson={openLesson}
          openPractice={openPractice}
          mode="theory"
        />
        <div className="course-edit-main tw:grid tw:gap-[14px] tw:[align-content:start]">
          <div className="block-view-grid tw:mt-[0] tw:grid tw:grid-cols-[1fr_1fr] tw:gap-[14px] tw:max-1100:grid-cols-[1fr]">
            <article className="glass-card block-main-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:col-[1_/_-1] tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
              {!isCourseEditMode && (
                <>
                  <p className="course-category tw:m-[0] tw:text-[0.8rem] tw:uppercase tw:tracking-[0.08em] tw:text-(--accent) tw:font-[700]">
                    {selectedCourse.title}
                  </p>
                  <p className="course-details-text tw:m-[12px_0_0] tw:text-(--muted)">
                    {selectedBlock.description ||
                      'Детальный блок курса с уроками и практикой. Используйте этот экран как тестовые данные для сценариев проваливания в контент.'}
                  </p>
                  {(selectedBlock.learningObjectives?.length ?? 0) > 0 && (
                    <div className="course-objectives-block tw:mt-[16px] tw:p-[14px] tw:rounded-[14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.26)] tw:[background:rgba(var(--accent-rgb),_0.07)] tw:[&_h3]:m-[0_0_10px] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[0.92rem] tw:[&_ul]:m-[0] tw:[&_ul]:pl-[18px] tw:[&_ul]:grid tw:[&_ul]:gap-[7px] tw:[&_ul]:text-(--muted) tw:[&_ul]:text-[0.9rem] tw:[&_ul]:leading-[1.45]">
                      <h3>Цели блока</h3>
                      <ul>
                        {selectedBlock.learningObjectives?.map(
                          (objective, index) => (
                            <li key={`${selectedBlock.id}-objective-${index}`}>
                              {objective}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                  <div className="block-progress-wrap tw:m-[14px_0_0]">
                    <div className="block-progress-head tw:flex tw:justify-between tw:items-center tw:gap-[12px] tw:text-[0.88rem] tw:text-(--muted) tw:[&_strong]:text-(--ink-accent)">
                      <span>Прогресс блока</span>
                      <strong>
                        {completedInBlock}/{totalItemsInBlock} •{' '}
                        {blockProgressPercent}%
                      </strong>
                    </div>
                    <div className="block-progress-bar tw:mt-[8px] tw:w-[100%] tw:h-[10px] tw:rounded-[999px] tw:overflow-hidden tw:[background:rgba(var(--accent-rgb),_0.18)] tw:[&_>_div]:h-[100%] tw:[&_>_div]:[background:linear-gradient(_90deg,_rgba(var(--accent-rgb),_0.95),_rgba(var(--accent-soft-rgb),_0.95)_)]">
                      <div style={{ width: `${blockProgressPercent}%` }} />
                    </div>
                  </div>
                  <div className="course-stats-grid tw:mt-[18px] tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[10px] tw:max-760:grid-cols-[1fr] tw:[&_div]:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[&_div]:rounded-[14px] tw:[&_div]:p-[12px] tw:[&_div]:[background:rgba(var(--accent-rgb),_0.08)] tw:[&_span]:block tw:[&_span]:text-[0.78rem] tw:[&_span]:text-(--muted) tw:[&_strong]:block tw:[&_strong]:mt-[5px] tw:[&_strong]:text-[0.96rem] tw:[&_strong]:text-(--text)">
                    <div>
                      <span>Длительность блока</span>
                      <strong>{selectedBlock.duration}</strong>
                    </div>
                    <div>
                      <span>Уроков</span>
                      <strong>{selectedBlock.lessons.length}</strong>
                    </div>
                    <div>
                      <span>Практик</span>
                      <strong>{selectedBlock.practice.length}</strong>
                    </div>
                    <div>
                      <span>Тип</span>
                      <strong>Теория + практика</strong>
                    </div>
                  </div>
                </>
              )}
              {isCourseEditMode && (
                <div className="course-editor-panel block-editor-panel tw:mt-[16px] tw:rounded-[14px] tw:p-[12px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)]">
                  <div className="course-editor-grid tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:w-[100%] tw:min-w-[0] tw:max-760:grid-cols-[1fr]">
                    <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                      <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                        Название урока
                      </span>
                      <input
                        className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:max-w-[100%] tw:min-h-[46px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                        value={selectedBlock.title || ''}
                        onChange={(event) =>
                          updateCourseBlock(selectedBlock.id, {
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
                        value={selectedBlock.duration || ''}
                        onChange={(event) =>
                          updateCourseBlock(selectedBlock.id, {
                            duration: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="course-editor-field course-editor-field-wide tw:grid tw:gap-[7px] tw:col-[1_/_-1] tw:min-w-[0] tw:max-700:col-[auto]">
                      <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                        Описание
                      </span>
                      <textarea
                        className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:min-h-[105px] tw:resize-y tw:max-w-[100%] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                        value={selectedBlock.description || ''}
                        onChange={(event) =>
                          updateCourseBlock(selectedBlock.id, {
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="course-objectives-editor tw:mt-[14px] tw:pt-[12px] tw:grid tw:gap-[8px] tw:[border-top:1px_solid_rgba(var(--accent-rgb),_0.24)]">
                    <div className="course-objectives-editor-head tw:flex tw:items-center tw:justify-between tw:gap-[10px] tw:[&_.btn]:p-[7px_12px] tw:[&_.btn]:text-[0.8rem]">
                      <span className="tw:text-[0.76rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.04em] tw:uppercase">
                        Цели урока
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[7px_12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)]"
                        onClick={addBlockObjective}
                      >
                        Добавить цель
                      </button>
                    </div>
                    {blockLearningObjectives.map((objective, index) => (
                      <div
                        className="course-objective-row tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:gap-[8px] tw:items-center"
                        key={index}
                      >
                        <input
                          className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.36)] tw:rounded-[12px] tw:text-(--text) tw:p-[10px_12px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.68)] tw:dark:border-[rgba(var(--accent-rgb),_0.52)] tw:[background:rgba(255,_255,_255,_0.34)] tw:dark:text-(--heading) tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[outline:none] tw:dark:focus:border-[rgba(var(--accent-rgb),_0.52)] tw:dark:[background:rgba(24,_24,_24,_0.75)] tw:focus:[box-shadow:0_0_0_2px_rgba(var(--accent-rgb),_0.16)]"
                          value={objective || ''}
                          placeholder={`Цель ${index + 1}`}
                          onChange={(event) =>
                            updateBlockObjective(index, event.target.value)
                          }
                        />
                        <button
                          className="tw:rounded-[999px] tw:text-[#b53945] tw:p-[8px_12px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[700] tw:cursor-pointer tw:[border:1px_solid_rgba(220,_53,_69,_0.36)] tw:[background:rgba(220,_53,_69,_0.08)] tw:dark:text-[#ff7d8b] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:hover:[background:rgba(220,_53,_69,_0.16)] tw:dark:[background:rgba(220,_53,_69,_0.16)]"
                          type="button"
                          onClick={() => removeBlockObjective(index)}
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                    {blockLearningObjectives.length === 0 && (
                      <p className="course-objectives-empty tw:m-[0] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                        Пока нет целей. Добавьте первую цель блока.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </article>

            <article className="glass-card block-lessons-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:col-[1_/_-1] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] tw:[&_ol]:m-[12px_0_0] tw:[&_ol]:pl-[18px]">
              <div className="block-lessons-head tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:flex-wrap tw:[&_.btn]:flex-[0_0_auto]">
                <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em] tw:[font-family:'Unbounded',_sans-serif]">
                  Уроки
                </h3>
                {isCourseEditMode && (
                  <div className="block-lessons-actions tw:flex tw:flex-wrap tw:gap-[8px]">
                    {canGenerateLesson && lessonAgentAt === null && (
                      <button
                        type="button"
                        className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:flex-[0_0_auto] tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                        onClick={() =>
                          openLessonAgent(selectedBlock.lessons.length)
                        }
                      >
                        Сгенерировать урок с ИИ
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:flex-[0_0_auto] tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                      onClick={addLesson}
                      disabled={isAddingLesson}
                    >
                      {isAddingLesson ? 'Создаём урок...' : 'Добавить урок'}
                    </button>
                  </div>
                )}
              </div>
              {selectedBlock.lessons.length === 0 && (
                <div className="course-editor-panel block-empty-lessons tw:mt-[12px] tw:rounded-[14px] tw:p-[12px] tw:grid tw:gap-[10px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[justify-items:start]">
                  <h4 className="tw:m-[0] tw:text-(--heading) tw:text-[0.95rem] tw:[font-family:'Unbounded',_sans-serif]">
                    В этом модуле пока нет уроков
                  </h4>
                  <p className="tw:m-[0] tw:text-(--muted) tw:leading-[1.72] tw:text-[1rem] tw:tracking-[0.012em]">
                    Создайте первый урок, чтобы наполнить модуль теорией и
                    материалами.
                  </p>
                  {isCourseEditMode && (
                    <button
                      type="button"
                      className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:hover:[transform:translateY(-1px)]"
                      onClick={addLesson}
                      disabled={isAddingLesson}
                    >
                      {isAddingLesson
                        ? 'Создаём урок...'
                        : 'Создать первый урок'}
                    </button>
                  )}
                </div>
              )}
              <ul className="lessons-progress-list tw:m-[12px_0_0] tw:p-[0] tw:[list-style:none]">
                {selectedBlock.lessons.map((lesson, index) => (
                  <Fragment key={lesson.id}>
                    {renderLessonSlot(index)}
                    <li className="tw:mb-[10px] tw:text-(--muted) tw:leading-[1.72] tw:text-[1rem] tw:tracking-[0.012em] tw:[.lessons-progress-list_li_+_&]:mt-[8px]">
                      {isCourseEditMode ? (
                        <div className="course-editor-panel content-editor-panel lesson-basic-editor-panel tw:mt-[8px] tw:rounded-[14px] tw:p-[12px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)]">
                          <div className="lesson-content-editor-head tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:gap-[12px] tw:max-760:grid-cols-[1fr] tw:[align-items:start]">
                            <div>
                              <span className="tw:block tw:text-(--muted) tw:text-[0.72rem] tw:font-[800] tw:tracking-[0.07em] tw:uppercase">
                                Урок {index + 1}
                              </span>
                              <strong className="tw:block tw:mt-[4px] tw:text-(--heading)">
                                {lesson.title || 'Урок без названия'}
                              </strong>
                            </div>
                          </div>
                          <div className="course-editor-grid tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:w-[100%] tw:min-w-[0] tw:max-760:grid-cols-[1fr]">
                            <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                              <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                                Название урока
                              </span>
                              <input
                                className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:max-w-[100%] tw:min-h-[46px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                                value={lesson.title || ''}
                                onChange={(event) =>
                                  updateLesson(lesson.id, {
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
                                value={lesson.duration || ''}
                                onChange={(event) =>
                                  updateLesson(lesson.id, {
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
                                value={lesson.summary || ''}
                                onChange={(event) =>
                                  updateLesson(lesson.id, {
                                    summary: event.target.value,
                                  })
                                }
                              />
                            </label>
                          </div>
                          <div className="course-editor-actions tw:mt-[10px] tw:flex tw:flex-wrap tw:gap-[8px] tw:[&_.btn]:p-[8px_13px] tw:[&_.btn:disabled]:[transform:none] tw:[&_.btn:disabled]:opacity-[0.5] tw:[&_.btn:disabled]:cursor-not-allowed tw:[&_.btn]:text-[0.84rem]">
                            <button
                              type="button"
                              className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[8px_13px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:[&&]:text-[0.96rem] tw:disabled:opacity-[0.5] tw:disabled:cursor-not-allowed tw:hover:[transform:translateY(-1px)] tw:disabled:[transform:none]"
                              onClick={() => openLesson(lesson.id)}
                            >
                              Перейти в урок
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[8px_13px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)] tw:[.course-editor-actions_&:disabled]:opacity-[0.5] tw:[.course-editor-actions_&:disabled]:cursor-not-allowed tw:[.course-editor-actions_&:disabled]:[transform:none]"
                              onClick={() =>
                                moveLesson(selectedBlock.id, lesson.id, -1)
                              }
                              disabled={index === 0}
                            >
                              Выше
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[8px_13px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)] tw:[.course-editor-actions_&:disabled]:opacity-[0.5] tw:[.course-editor-actions_&:disabled]:cursor-not-allowed tw:[.course-editor-actions_&:disabled]:[transform:none]"
                              onClick={() =>
                                moveLesson(selectedBlock.id, lesson.id, 1)
                              }
                              disabled={
                                index === selectedBlock.lessons.length - 1
                              }
                            >
                              Ниже
                            </button>
                            <button
                              type="button"
                              className="btn btn-flat editor-danger-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[8px_13px] tw:border-solid tw:border-[rgba(220,_53,_69,_0.36)] tw:font-[700] tw:tracking-[0.01em] tw:text-[#b53945] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:dark:text-[#ff7d8b] tw:[background:rgba(220,_53,_69,_0.08)] tw:[backdrop-filter:blur(22px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(22px)_saturate(145%)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)] tw:dark:[background:rgba(220,_53,_69,_0.16)] tw:[.course-editor-actions_&:disabled]:opacity-[0.5] tw:[.course-editor-actions_&:disabled]:cursor-not-allowed tw:[.course-editor-actions_&:disabled]:[transform:none]"
                              onClick={() => setLessonToDelete(lesson)}
                              disabled={selectedBlock.lessons.length <= 1}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="lesson-progress-item tw:w-[100%] tw:text-left tw:grid tw:gap-[3px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.34)] tw:rounded-[12px] tw:p-[10px_12px] tw:cursor-pointer tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.72)] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[font:inherit]"
                          onClick={() => openLesson(lesson.id)}
                        >
                          <span className="lesson-progress-title tw:text-(--text) tw:text-[0.9rem] tw:font-[700]">
                            {lesson.title}
                          </span>
                          <span className="lesson-progress-meta tw:text-(--muted) tw:text-[0.8rem]">
                            {lesson.duration}
                          </span>
                          <span
                            className={`lesson-status tw:text-[0.78rem] tw:font-[700] tw:[&.is-done]:text-(--success-text) tw:[&.is-pending]:text-(--ink-accent) ${completedLessons[lesson.id] ? 'is-done' : 'is-pending'}`}
                          >
                            {completedLessons[lesson.id]
                              ? 'Пройдено'
                              : 'Не пройден'}
                          </span>
                        </button>
                      )}
                    </li>
                  </Fragment>
                ))}
                {renderLessonSlot(selectedBlock.lessons.length)}
              </ul>
            </article>

            {!isCourseEditMode && (
              <article className="glass-card block-practice-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[0.98rem] tw:[&_li]:mb-[10px] tw:[&_li]:text-(--muted) tw:[&_li]:leading-[1.4]">
                <h3>Практика и задания</h3>
                <ul className="practice-progress-list tw:m-[12px_0_0] tw:p-[0] tw:[.block-practice-card_&]:pl-[0] tw:[list-style:none] tw:[&_li_+_li]:mt-[8px]">
                  {selectedBlock.practice.map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        className="practice-progress-item tw:w-[100%] tw:text-left tw:grid tw:gap-[3px] tw:border-solid tw:border-[rgba(var(--accent-soft-rgb),_0.36)] tw:rounded-[12px] tw:p-[10px_12px] tw:cursor-pointer tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-soft-rgb),_0.76)] tw:[background:rgba(var(--accent-soft-rgb),_0.11)] tw:[font:inherit]"
                        onClick={() => openPractice(task.id)}
                      >
                        <span className="practice-progress-title tw:text-(--text) tw:text-[0.9rem] tw:font-[700]">
                          {task.title}
                        </span>
                        <span className="practice-progress-meta tw:text-(--muted) tw:text-[0.8rem]">
                          {task.duration}
                        </span>
                        <span
                          className={`practice-status tw:text-[0.78rem] tw:font-[700] tw:[&.is-done]:text-(--success-text) tw:[&.is-pending]:text-(--info-text) ${completedPractices[task.id] ? 'is-done' : 'is-pending'}`}
                        >
                          {completedPractices[task.id]
                            ? 'Выполнено'
                            : 'Не выполнено'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            )}
          </div>
        </div>
      </div>

      {canGenerateLesson && lessonAgentAt !== null && (
        <AgentInterviewDialog
          variant="floating"
          open={isLessonChatVisible}
          kind="lesson"
          courseId={selectedCourse.id}
          moduleId={selectedBlock.id}
          order={lessonAgentAt + 1}
          knownIds={selectedBlock.lessons.map((lesson) => lesson.id)}
          contextTitle={
            lessonJob?.resultId
              ? `Урок «${lessonJob.resultTitle || 'без названия'}» уже в списке.`
              : `Модуль «${selectedBlock.title}». ${describeLessonPosition(lessonAgentAt)}`
          }
          onClose={closeLessonAgent}
          onOpenResult={(job) => {
            setLessonAgentIndex(null);
            if (job.resultId) openLesson(job.resultId);
          }}
          onStartAnother={(job) => {
            // Следующий урок — сразу после готового (order у job с единицы).
            const order = Number(job?.order);
            setLessonAgentIndex(
              Number.isFinite(order)
                ? Math.min(Math.max(order, 0), selectedBlock.lessons.length)
                : selectedBlock.lessons.length,
            );
            setIsLessonChatVisible(true);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(lessonToDelete)}
        danger
        eyebrow="Необратимое действие"
        title="Удалить урок?"
        description={`Урок «${lessonToDelete?.title || ''}» и его содержимое будут удалены. Отменить удаление нельзя.`}
        confirmLabel="Удалить"
        busyLabel="Удаляем..."
        onCancel={() => setLessonToDelete(null)}
        onConfirm={async () => {
          if (!lessonToDelete) return;
          await deleteLesson(selectedBlock.id, lessonToDelete.id);
          setLessonToDelete(null);
        }}
      />
    </section>
  );
}
