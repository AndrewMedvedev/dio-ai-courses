// Страница деталей выбранного курса с описанием, блоками и лидербордом
import { Fragment, useState } from 'react';
import { SectionTop } from '@/shared/ui/section-top';
import {
  CourseNavigationTree,
  COURSE_LEVELS,
  formatCourseLevel,
  type BlockNode,
  type CourseNode,
} from '@/entities/course';
import { CourseInviteDialog } from '@/features/invite';
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
import { useSessionStore } from '@/entities/session';
import { isUuid } from '@/shared/lib/uuid';

// На странице курса в дереве не выделен ни один модуль.
const NO_SELECTED_BLOCK = { id: '' };

type CompletedMap = Record<string, boolean | undefined>;

/** Смена статуса курса: публикация, только по приглашению, архив. */
export type CourseStatusAction = 'publish' | 'invite_only' | 'archive';

export interface LeaderboardStudent {
  id: string;
  name: string;
  pace?: string;
  progress: number;
}

interface PendingDelete {
  type: 'module' | 'course';
  id: string;
  title?: string;
}

export interface CoursePageProps {
  selectedCourse: CourseNode;
  selectedCourseLeaderboard: LeaderboardStudent[];
  completedLessons: CompletedMap;
  completedPractices: CompletedMap;
  openCourses?: () => void;
  openBlock: (blockId: string) => void;
  openLesson: (lessonId: string) => void;
  openPractice: (practiceId: string) => void;
  isCourseEditMode: boolean;
  setIsCourseEditMode: (isEditMode: boolean) => void;
  canReadCourse: boolean;
  canUpdateCourse: boolean;
  canDeleteCourse: boolean;
  deleteCourse: (courseId: string) => Promise<unknown>;
  updateCourseStatus?: (
    courseId: string,
    action: CourseStatusAction,
  ) => Promise<unknown>;
  updateCourse: (changes: Partial<CourseNode>) => void;
  updateCourseBlock: (blockId: string, changes: Partial<BlockNode>) => void;
  insertCourseBlock: (index: number) => Promise<string | null | undefined>;
  moveBlock: (blockId: string, direction: number) => void;
  deleteBlock: (blockId: string) => Promise<boolean | void>;
}

/** Курс в режиме автора: описание, цели, модули, статус и генерация модуля с ИИ. */
export function CoursePage({
  selectedCourse,
  selectedCourseLeaderboard,
  completedLessons,
  completedPractices,
  openBlock,
  openLesson,
  openPractice,
  isCourseEditMode,
  setIsCourseEditMode,
  canReadCourse,
  canUpdateCourse,
  canDeleteCourse,
  deleteCourse,
  updateCourseStatus,
  updateCourse,
  updateCourseBlock,
  insertCourseBlock,
  moveBlock,
  deleteBlock,
}: CoursePageProps) {
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [statusAction, setStatusAction] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  // Позиция в списке модулей, где открыт чат генерации модуля (null — закрыт).
  const [moduleAgentIndex, setModuleAgentIndex] = useState<number | null>(null);
  const [isModuleChatVisible, setIsModuleChatVisible] = useState(true);
  // { type: "module" | "course", id, title } — что пользователь хочет удалить.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const currentUserId = useSessionStore(
    (state) => state.identity?.id || state.user?.id || '',
  );
  const moduleJob = useGenerationJobsStore(
    (state) =>
      state.jobs[generationJobKey('module', selectedCourse.id, '')] || null,
  );
  const goBack = useGoBack({ fallbackPath: '/courses' });

  if (!canReadCourse) {
    return (
      <section className="container section course-details-view tw:relative tw:z-[1] tw:w-[min(1600px,_98vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)] tw:dark:[.page_&]:[--muted:#c4b9a7] tw:dark:[.page_&]:[--eyebrow:#a0c4ff] tw:dark:[.page_&]:[--ink-accent:#dfd2bf] tw:dark:[.page_&]:[--info-text:#b7ab99] tw:dark:[.page_&]:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:dark:[.page_&]:[--glass-bg-strong:rgba(44,_44,_44,_0.92)]">
        <SectionTop label="Курс" title="Доступ ограничен" />
        <article className="glass-card course-details-main tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[order:2] tw:[.course-edit-main_&]:[order:1] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
          <p className="course-details-text tw:m-[12px_0_0] tw:text-(--muted)">
            Курс недоступен для вашего аккаунта. Обратитесь к администратору
            организации, чтобы получить доступ.
          </p>
          <button
            type="button"
            className="btn btn-outline tw:p-[12px_20px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
            onClick={goBack}
          >
            Вернуться к каталогу
          </button>
        </article>
      </section>
    );
  }

  const totalLessonsInCourse = selectedCourse.blocks.reduce(
    (total, block) => total + block.lessons.length,
    0,
  );

  const learningObjectives = selectedCourse.learningObjectives || [];

  const updateObjective = (index: number, value: string) => {
    const next = [...learningObjectives];
    next[index] = value;
    updateCourse({ learningObjectives: next });
  };

  const addObjective = () => {
    updateCourse({ learningObjectives: [...learningObjectives, ''] });
  };

  const removeObjective = (index: number) => {
    updateCourse({
      learningObjectives: learningObjectives.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    });
  };

  const insertBlock = async (index: number) => {
    const blockId = await insertCourseBlock(index);
    if (blockId) {
      setActiveBlockId(blockId);
    }
  };

  const changeStatus = async (action: CourseStatusAction) => {
    if (!updateCourseStatus || statusAction) return;
    setStatusAction(action);
    try {
      await updateCourseStatus(selectedCourse.id, action);
    } finally {
      setStatusAction('');
    }
  };

  const canGenerateModule = isCourseEditMode && isUuid(selectedCourse.id);
  // Пока идёт генерация, чат держим в месте, куда вставится модуль.
  const moduleAgentAt =
    moduleJob && Number.isFinite(Number(moduleJob.order))
      ? Number(moduleJob.order) - 1
      : moduleAgentIndex;

  const describeModulePosition = (index: number) => {
    const blocks = selectedCourse.blocks;
    if (!blocks.length) return 'Модуль станет первым в курсе.';
    if (index <= 0)
      return `Модуль встанет в начало, перед «${blocks[0].title}».`;
    if (index >= blocks.length) {
      return `Модуль встанет в конец, после «${blocks[blocks.length - 1].title}».`;
    }
    return `Модуль встанет между «${blocks[index - 1].title}» и «${blocks[index].title}».`;
  };

  const isModuleJobRunning = moduleJob?.status === 'running';

  // Открывает чат у выбранного места или переносит туда уже открытый чат — окно не
  // закрывается. Пока генерация идёт, место менять нельзя: модуль уже ставится в очередь
  // именно сюда. После готового или упавшего запуска начинаем новый диалог.
  const openModuleAgent = (index: number) => {
    const currentJob =
      useGenerationJobsStore.getState().jobs[
        generationJobKey('module', selectedCourse.id, '')
      ];
    if (currentJob?.status === 'running') return;
    if (currentJob) {
      resetAgentInterview({ kind: 'module', courseId: selectedCourse.id });
    }
    setModuleAgentIndex(index);
    setIsModuleChatVisible(true);
  };

  // Пока генерация идёт, окно только прячется: метка в списке остаётся.
  // Готовую или упавшую генерацию закрытие завершает — метка пропадает.
  const closeModuleAgent = () => {
    const currentJob =
      useGenerationJobsStore.getState().jobs[
        generationJobKey('module', selectedCourse.id, '')
      ];
    if (currentJob?.status === 'running') {
      setIsModuleChatVisible(false);
      return;
    }
    if (currentJob) {
      resetAgentInterview({ kind: 'module', courseId: selectedCourse.id });
    }
    setModuleAgentIndex(null);
  };

  const renderInsertControl = (index: number) => {
    if (!isCourseEditMode) return null;
    if (canGenerateModule && moduleAgentAt === index) {
      // Кнопки стоят на месте, а сюда встанет модуль из плавающего окна чата.
      return (
        <li
          className="course-agent-marker tw:flex tw:flex-wrap tw:items-center tw:justify-between tw:gap-[8px] tw:m-[2px_0] tw:mb-[10px] tw:p-[8px_12px] tw:border-dashed tw:border-[rgba(47,_125,_79,_0.55)] tw:rounded-[14px] tw:text-(--muted) tw:text-[1rem] tw:font-[800] tw:leading-[1.72] tw:tracking-[0.012em] tw:[border-width:1.5px] tw:dark:border-[rgba(127,_209,_155,_0.5)] tw:[background:rgba(47,_125,_79,_0.08)] tw:dark:text-[#7fd19b] tw:[list-style:none] tw:dark:[background:rgba(127,_209,_155,_0.08)]"
          key={`insert-${index}`}
        >
          <span>
            {moduleJob?.status === 'running'
              ? moduleJob.resultId
                ? `✦ Модуль «${moduleJob.resultTitle || 'без названия'}» генерируется — ниже`
                : '✦ Здесь появится модуль — генерация идёт'
              : moduleJob?.status === 'done'
                ? '✦ Модуль сгенерирован — ниже'
                : '✦ Сюда встанет модуль из чата с ИИ'}
          </span>
          <div className="tw:flex tw:gap-[6px]">
            {!isModuleChatVisible && (
              <button
                type="button"
                onClick={() => setIsModuleChatVisible(true)}
              >
                Показать чат
              </button>
            )}
            {!moduleJob && (
              <button
                className="tw:rounded-[999px] tw:text-[inherit] tw:p-[4px_12px] tw:leading-[1.45] tw:text-[0.96rem] tw:cursor-pointer tw:[border:1px_solid_rgba(47,_125,_79,_0.45)] tw:[background:transparent] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:hover:[background:rgba(47,_125,_79,_0.12)]"
                type="button"
                onClick={() => setModuleAgentIndex(null)}
              >
                Отменить
              </button>
            )}
          </div>
        </li>
      );
    }
    return (
      <li
        className="course-block-insert tw:mb-[10px] tw:leading-[1.72] tw:text-(--muted) tw:text-[1rem] tw:tracking-[0.012em] tw:[.course-blocks-list_li_+_&]:mt-[8px]"
        key={`insert-${index}`}
      >
        <div className="course-insert-actions tw:flex tw:flex-wrap tw:gap-[8px]">
          <button
            className="tw:flex-[1_1_180px] tw:w-[100%] tw:border-dashed tw:border-[rgba(var(--accent-rgb),_0.4)] tw:rounded-[999px] tw:text-(--muted) tw:p-[6px_10px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:cursor-pointer tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.74)] tw:[background:transparent] tw:hover:text-(--ink-accent) tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:hover:[background:rgba(var(--accent-rgb),_0.1)]"
            type="button"
            onClick={() => insertBlock(index)}
          >
            Вставить пустой модуль
          </button>
          {canGenerateModule && (
            <button
              type="button"
              className="is-ai tw:flex-[1_1_180px] tw:border-[rgba(47,_125,_79,_0.45)] tw:text-[#2f7d4f] tw:w-[100%] tw:border-dashed tw:rounded-[999px] tw:p-[6px_10px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[800] tw:cursor-pointer tw:hover:border-[rgba(var(--accent-rgb),_0.74)] tw:dark:border-[rgba(127,_209,_155,_0.45)] tw:hover:text-(--ink-accent) tw:dark:text-[#7fd19b] tw:[border-width:1px] tw:[background:transparent] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:dark:hover:border-[rgba(127,_209,_155,_0.45)] tw:dark:hover:text-[#7fd19b] tw:hover:[background:rgba(var(--accent-rgb),_0.1)] tw:[.course-block-insert_&:disabled]:cursor-not-allowed tw:[.course-block-insert_&:disabled]:opacity-[0.5]"
              onClick={() => openModuleAgent(index)}
              disabled={isModuleJobRunning}
              title={
                isModuleJobRunning
                  ? 'Дождитесь окончания текущей генерации модуля'
                  : undefined
              }
            >
              {moduleAgentAt === null
                ? '✦ Сгенерировать модуль с ИИ'
                : '✦ Сгенерировать модуль здесь'}
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <section className="container section course-details-view is-course-edit-layout tw:relative tw:z-[1] tw:w-[min(1720px,_98vw)] tw:max-w-[100%] tw:mt-[8px] tw:m-[0_auto] tw:[--muted:#4f493f] tw:[--eyebrow:#3d4a61] tw:[--ink-accent:#564556] tw:[--info-text:#3d4a61] tw:[--glass-bg:rgba(250,_247,_241,_0.74)] tw:[--glass-bg-strong:rgba(252,_250,_246,_0.92)] tw:[--glass-blur:18px] tw:[--glass-backdrop:blur(var(--glass-blur))_saturate(140%)] tw:dark:[--muted:#c4b9a7] tw:dark:[--eyebrow:#a0c4ff] tw:dark:[--ink-accent:#dfd2bf] tw:dark:[--info-text:#b7ab99] tw:dark:[--glass-bg:rgba(34,_34,_34,_0.74)] tw:dark:[--glass-bg-strong:rgba(44,_44,_44,_0.92)] tw:min-1180:[&:has(.lesson-editor-block-row.has-ai)]:w-[min(1760px,_99vw)]">
      <SectionTop label="Курс" title={selectedCourse.title} />
      {canUpdateCourse ? (
        <CourseInviteDialog
          open={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          courseId={selectedCourse.id}
          courseTitle={selectedCourse.title}
          canViewMembers
          currentUserId={currentUserId}
        />
      ) : null}
      <button
        type="button"
        className="btn btn-outline back-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[0] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:m-[0] tw:w-[44px] tw:h-[44px] tw:text-[0.96rem] tw:leading-[1.45] tw:absolute tw:top-[18px] tw:right-[0] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
        onClick={goBack}
        aria-label="Назад к каталогу"
        title="Назад к каталогу"
      >
        &lt;
      </button>
      {/* Та же сетка, что в режиме обучения: дерево курса слева, содержимое справа. */}
      <div className="course-edit-grid tw:grid-cols-[300px_minmax(0,_1fr)_68px] tw:gap-[18px] tw:mt-[16px] tw:grid tw:between-1101-1300:grid-cols-[280px_minmax(0,_1fr)] tw:max-1100:grid-cols-[1fr] tw:[align-items:start] tw:[&_>_*]:min-w-[0]">
        <CourseNavigationTree
          selectedCourse={selectedCourse}
          selectedBlock={NO_SELECTED_BLOCK}
          selectedLessonId=""
          selectedPracticeId=""
          completedLessons={completedLessons}
          completedPractices={completedPractices}
          openBlock={openBlock}
          openLesson={openLesson}
          openPractice={openPractice}
          mode="theory"
        />
        <div className="course-edit-main tw:grid tw:gap-[14px] tw:[align-content:start]">
          <div className="course-page-actions tw:mt-[0] tw:flex tw:flex-wrap tw:items-center tw:gap-[10px]">
            {canUpdateCourse && selectedCourse.status !== 'archived' && (
              <button
                type="button"
                className="btn btn-outline course-invite-toggle tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                onClick={() => setIsInviteOpen(true)}
              >
                Пригласить
              </button>
            )}
            {canUpdateCourse && !isCourseEditMode && (
              <button
                type="button"
                className="btn btn-outline course-edit-toggle tw:p-[12px_20px] tw:min-h-[44px] tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                onClick={() => setIsCourseEditMode(true)}
              >
                Редактировать курс
              </button>
            )}
            {isCourseEditMode &&
              canUpdateCourse &&
              selectedCourse.status !== 'archived' && (
                <>
                  {selectedCourse.status !== 'published' && (
                    <button
                      type="button"
                      className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                      onClick={() => changeStatus('publish')}
                      disabled={statusAction === 'publish'}
                    >
                      {statusAction === 'publish'
                        ? 'Публикуем...'
                        : 'Опубликовать'}
                    </button>
                  )}
                  {selectedCourse.status !== 'invite_only' && (
                    <button
                      type="button"
                      className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                      onClick={() => changeStatus('invite_only')}
                      disabled={statusAction === 'invite_only'}
                    >
                      {statusAction === 'invite_only'
                        ? 'Сохраняем...'
                        : 'Только для приглашённых'}
                    </button>
                  )}
                </>
              )}
            {isCourseEditMode &&
              canDeleteCourse &&
              selectedCourse.status !== 'archived' && (
                <button
                  type="button"
                  className="btn btn-outline course-delete-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[12px_20px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:text-[0.96rem] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:hover:[transform:translateY(-1px)]"
                  onClick={() =>
                    setPendingDelete({
                      type: 'course',
                      id: selectedCourse.id,
                      title: selectedCourse.title,
                    })
                  }
                  disabled={statusAction === 'archive'}
                >
                  {statusAction === 'archive' ? 'Удаляем...' : 'Удалить курс'}
                </button>
              )}
          </div>
          <div className="course-details-grid tw:mt-[0] tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:gap-[14px]">
            <article className="glass-card course-details-main tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[order:1] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
              {isCourseEditMode && (
                <div className="course-editor-panel course-meta-editor-panel tw:mt-[10px] tw:rounded-[14px] tw:p-[12px] tw:mb-[16px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[background:rgba(var(--accent-rgb),_0.08)]">
                  <div className="course-editor-grid tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:w-[100%] tw:min-w-[0] tw:max-760:grid-cols-[1fr]">
                    <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                      <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                        Название курса
                      </span>
                      <input
                        className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:max-w-[100%] tw:min-h-[46px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                        value={selectedCourse.title}
                        onChange={(event) =>
                          updateCourse({ title: event.target.value })
                        }
                      />
                    </label>
                    <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                      <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                        Категория
                      </span>
                      <input
                        className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:max-w-[100%] tw:min-h-[46px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                        value={selectedCourse.category || ''}
                        onChange={(event) =>
                          updateCourse({ category: event.target.value })
                        }
                      />
                    </label>
                    <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                      <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                        Длительность
                      </span>
                      <input
                        className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:max-w-[100%] tw:min-h-[46px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                        value={selectedCourse.duration || ''}
                        onChange={(event) =>
                          updateCourse({ duration: event.target.value })
                        }
                      />
                    </label>
                    <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                      <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                        Уровень
                      </span>
                      <select
                        className="tw:w-[100%] tw:max-w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:leading-[1.45] tw:text-[0.96rem] tw:min-h-[46px] tw:p-[11px_13px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:[appearance:none] tw:[-webkit-appearance:none] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                        value={formatCourseLevel(selectedCourse.level)}
                        onChange={(event) =>
                          updateCourse({ level: event.target.value })
                        }
                      >
                        {COURSE_LEVELS.map((item) => (
                          <option key={item.value} value={item.label}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                      <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                        Формат
                      </span>
                      <input
                        className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:max-w-[100%] tw:min-h-[46px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                        value={selectedCourse.format || ''}
                        onChange={(event) =>
                          updateCourse({ format: event.target.value })
                        }
                      />
                    </label>
                    <label className="course-editor-field course-editor-field-wide tw:grid tw:gap-[7px] tw:col-[1_/_-1] tw:min-w-[0] tw:max-700:col-[auto]">
                      <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                        Описание
                      </span>
                      <textarea
                        className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:min-h-[105px] tw:resize-y tw:max-w-[100%] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                        value={selectedCourse.description || ''}
                        onChange={(event) =>
                          updateCourse({ description: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  <div className="course-objectives-editor tw:mt-[14px] tw:pt-[12px] tw:grid tw:gap-[8px] tw:[border-top:1px_solid_rgba(var(--accent-rgb),_0.24)]">
                    <div className="course-objectives-editor-head tw:flex tw:items-center tw:justify-between tw:gap-[10px] tw:[&_.btn]:p-[7px_12px] tw:[&_.btn]:text-[0.8rem]">
                      <span className="tw:text-[0.76rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.04em] tw:uppercase">
                        Цели курса
                      </span>
                      <button
                        type="button"
                        className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[7px_12px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)]"
                        onClick={addObjective}
                      >
                        Добавить цель
                      </button>
                    </div>
                    {learningObjectives.map((objective, index) => (
                      <div
                        className="course-objective-row tw:grid tw:grid-cols-[minmax(0,_1fr)_auto] tw:gap-[8px] tw:items-center"
                        key={index}
                      >
                        <input
                          className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.36)] tw:rounded-[12px] tw:text-(--text) tw:p-[10px_12px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.68)] tw:dark:border-[rgba(var(--accent-rgb),_0.52)] tw:[background:rgba(255,_255,_255,_0.34)] tw:dark:text-(--heading) tw:[font:inherit] tw:[&&]:text-[0.96rem] tw:[&&]:leading-[1.45] tw:[outline:none] tw:dark:focus:border-[rgba(var(--accent-rgb),_0.52)] tw:dark:[background:rgba(24,_24,_24,_0.75)] tw:focus:[box-shadow:0_0_0_2px_rgba(var(--accent-rgb),_0.16)]"
                          value={objective}
                          placeholder={`Цель ${index + 1}`}
                          onChange={(event) =>
                            updateObjective(index, event.target.value)
                          }
                        />
                        <button
                          className="tw:rounded-[999px] tw:text-[#b53945] tw:p-[8px_12px] tw:leading-[1.45] tw:text-[0.96rem] tw:font-[700] tw:cursor-pointer tw:[border:1px_solid_rgba(220,_53,_69,_0.36)] tw:[background:rgba(220,_53,_69,_0.08)] tw:dark:text-[#ff7d8b] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:hover:[background:rgba(220,_53,_69,_0.16)] tw:dark:[background:rgba(220,_53,_69,_0.16)]"
                          type="button"
                          onClick={() => removeObjective(index)}
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                    {learningObjectives.length === 0 && (
                      <p className="course-objectives-empty tw:m-[0] tw:text-(--muted) tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]">
                        Пока нет целей. Добавьте первую цель курса.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!isCourseEditMode && (
                <>
                  <p className="course-category tw:m-[0] tw:text-[0.8rem] tw:uppercase tw:tracking-[0.08em] tw:text-(--accent) tw:font-[700]">
                    {selectedCourse.category}
                  </p>
                  <p className="course-details-text tw:m-[12px_0_0] tw:text-(--muted)">
                    {selectedCourse.description}
                  </p>
                  {(selectedCourse.learningObjectives?.length ?? 0) > 0 && (
                    <div className="course-objectives-block tw:mt-[16px] tw:p-[14px] tw:rounded-[14px] tw:[border:1px_solid_rgba(var(--accent-rgb),_0.26)] tw:[background:rgba(var(--accent-rgb),_0.07)] tw:[&_h3]:m-[0_0_10px] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[0.92rem] tw:[&_ul]:m-[0] tw:[&_ul]:pl-[18px] tw:[&_ul]:grid tw:[&_ul]:gap-[7px] tw:[&_ul]:text-(--muted) tw:[&_ul]:text-[0.9rem] tw:[&_ul]:leading-[1.45]">
                      <h3>Цели курса</h3>
                      <ul>
                        {selectedCourse.learningObjectives?.map(
                          (objective, index) => (
                            <li key={`${selectedCourse.id}-objective-${index}`}>
                              {objective}
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  )}
                  <div className="course-stats-grid tw:mt-[18px] tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[10px] tw:max-760:grid-cols-[1fr] tw:[&_div]:[border:1px_solid_rgba(var(--accent-rgb),_0.28)] tw:[&_div]:rounded-[14px] tw:[&_div]:p-[12px] tw:[&_div]:[background:rgba(var(--accent-rgb),_0.08)] tw:[&_span]:block tw:[&_span]:text-[0.78rem] tw:[&_span]:text-(--muted) tw:[&_strong]:block tw:[&_strong]:mt-[5px] tw:[&_strong]:text-[0.96rem] tw:[&_strong]:text-(--text)">
                    <div>
                      <span>Длительность</span>
                      <strong>{selectedCourse.duration}</strong>
                    </div>
                    <div>
                      <span>Объем</span>
                      <strong>{totalLessonsInCourse} уроков</strong>
                    </div>
                    <div>
                      <span>Уровень</span>
                      <strong>{formatCourseLevel(selectedCourse.level)}</strong>
                    </div>
                    <div>
                      <span>Формат</span>
                      <strong>{selectedCourse.format}</strong>
                    </div>
                  </div>
                </>
              )}
            </article>

            <article className="glass-card course-details-modules tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-760:p-[18px] tw:[order:2] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1] tw:[&_ol]:m-[12px_0_0] tw:[&_ol]:pl-[18px] tw:[&_ol]:text-(--text)">
              <h3 className="tw:text-[clamp(1.08rem,_1.8vw,_1.35rem)] tw:leading-[1.38] tw:tracking-[-0.008em] tw:[font-family:'Unbounded',_sans-serif]">
                Модули
              </h3>
              <ul className="course-blocks-list tw:m-[12px_0_0] tw:p-[0] tw:[list-style:none]">
                {renderInsertControl(0)}
                {selectedCourse.blocks.map((block, index) => {
                  const isActive = activeBlockId === block.id;
                  const doneLessons = block.lessons.filter(
                    (lesson) => completedLessons[lesson.id],
                  ).length;
                  const donePractices = block.practice.filter(
                    (practice) => completedPractices[practice.id],
                  ).length;
                  const doneItems = doneLessons + donePractices;
                  const totalItems =
                    block.lessons.length + block.practice.length;

                  return (
                    <Fragment key={block.id}>
                      <li className="tw:mb-[10px] tw:leading-[1.72] tw:text-(--muted) tw:text-[1rem] tw:tracking-[0.012em] tw:[.course-blocks-list_li_+_&]:mt-[8px]">
                        {isCourseEditMode ? (
                          <article className="course-block-item course-block-editor is-editing tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:rounded-[12px] tw:p-[14px] tw:cursor-pointer tw:text-left tw:grid tw:gap-[4px] tw:[border-width:1px] tw:[background:rgba(var(--accent-rgb),_0.08)] tw:[font:inherit] tw:[box-shadow:0_0_0_2px_rgba(var(--accent-rgb),_0.12)]">
                            <span className="course-block-index tw:text-(--ink-accent) tw:text-[0.74rem] tw:font-[700] tw:uppercase tw:tracking-[0.06em]">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <div className="course-editor-grid tw:grid tw:grid-cols-[repeat(2,_minmax(0,_1fr))] tw:gap-[14px] tw:w-[100%] tw:min-w-[0] tw:max-760:grid-cols-[1fr]">
                              <label className="course-editor-field tw:grid tw:gap-[7px] tw:min-w-[0]">
                                <span className="tw:text-[0.72rem] tw:text-(--muted) tw:font-[700] tw:tracking-[0.05em] tw:uppercase tw:wrap-anywhere tw:dark:text-[#cfc2ad]">
                                  Название модуля
                                </span>
                                <input
                                  className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[11px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:max-w-[100%] tw:min-h-[46px] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                                  value={block.title}
                                  onChange={(event) =>
                                    updateCourseBlock(block.id, {
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
                                  value={block.duration}
                                  onChange={(event) =>
                                    updateCourseBlock(block.id, {
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
                                  className="tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.28)] tw:rounded-[12px] tw:text-(--text) tw:p-[12px_13px] tw:text-[0.96rem] tw:leading-[1.45] tw:min-h-[160px] tw:resize-y tw:max-w-[100%] tw:[border-width:1px] tw:focus:border-[rgba(var(--accent-rgb),_0.72)] tw:dark:border-[rgba(255,_255,_255,_0.18)] tw:[background:rgba(var(--accent-soft-rgb),_0.07)] tw:dark:text-[#f2e7d4] tw:[font-style:inherit] tw:[font-variant:inherit] tw:[font-weight:inherit] tw:[font-stretch:inherit] tw:[font-family:inherit] tw:[outline:none] tw:[transition:border-color_0.2s_ease,_background_0.2s_ease,_box-shadow_0.2s_ease] tw:placeholder:text-(--muted) tw:placeholder:opacity-[0.78] tw:dark:focus:border-[rgba(203,_170,_203,_0.72)] tw:dark:[background:rgba(255,_255,_255,_0.035)] tw:focus:[background:rgba(var(--accent-rgb),_0.09)] tw:focus:[box-shadow:0_0_0_3px_rgba(var(--accent-rgb),_0.08)] tw:dark:focus:[background:rgba(255,_255,_255,_0.07)] tw:dark:focus:[box-shadow:0_0_0_3px_rgba(203,_170,_203,_0.1)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:var(--glass-bg-strong)] tw:dark:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[background:rgba(255,_255,_255,_0.035)] tw:dark:focus:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&:is(.course-editor-field_input,.course-editor-field_textarea,.course-editor-field_select)]:[&&&&]:[background:rgba(255,_255,_255,_0.07)]"
                                  value={block.description || ''}
                                  onChange={(event) =>
                                    updateCourseBlock(block.id, {
                                      description: event.target.value,
                                    })
                                  }
                                />
                              </label>
                            </div>
                            <div className="course-editor-actions tw:mt-[10px] tw:flex tw:flex-wrap tw:gap-[8px] tw:[&_.btn]:p-[8px_13px] tw:[&_.btn:disabled]:[transform:none] tw:[&_.btn:disabled]:opacity-[0.5] tw:[&_.btn:disabled]:cursor-not-allowed tw:[&_.btn]:text-[0.84rem]">
                              <button
                                type="button"
                                className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[8px_13px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)] tw:[.course-editor-actions_&:disabled]:opacity-[0.5] tw:[.course-editor-actions_&:disabled]:cursor-not-allowed tw:[.course-editor-actions_&:disabled]:[transform:none]"
                                onClick={() => moveBlock(block.id, -1)}
                                disabled={index === 0}
                              >
                                Выше
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[8px_13px] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.78)] tw:font-[700] tw:tracking-[0.01em] tw:text-(--ink-accent) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:rgba(var(--accent-rgb),_0.14)] tw:[backdrop-filter:blur(24px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(24px)_saturate(145%)] tw:[box-shadow:var(--glass-inset),_0_8px_18px_rgba(79,_67,_48,_0.06)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)] tw:[.course-editor-actions_&:disabled]:opacity-[0.5] tw:[.course-editor-actions_&:disabled]:cursor-not-allowed tw:[.course-editor-actions_&:disabled]:[transform:none]"
                                onClick={() => moveBlock(block.id, 1)}
                                disabled={
                                  index === selectedCourse.blocks.length - 1
                                }
                              >
                                Ниже
                              </button>
                              <button
                                type="button"
                                className="btn btn-solid tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[8px_13px] tw:border-solid tw:border-(--cta) tw:font-[700] tw:tracking-[0.01em] tw:text-(--text-solid) tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:[background:var(--cta)] tw:[&&]:text-[0.96rem] tw:disabled:opacity-[0.5] tw:disabled:cursor-not-allowed tw:hover:[transform:translateY(-1px)] tw:disabled:[transform:none]"
                                onClick={() => openBlock(block.id)}
                              >
                                Перейти в модуль
                              </button>

                              <button
                                type="button"
                                className="btn btn-flat editor-danger-btn tw:inline-flex tw:items-center tw:justify-center tw:rounded-[999px] tw:p-[8px_13px] tw:border-solid tw:border-[rgba(220,_53,_69,_0.36)] tw:font-[700] tw:tracking-[0.01em] tw:text-[#b53945] tw:leading-[1.45] tw:[text-decoration:none] tw:[border-width:1px] tw:[transition:transform_0.18s_ease,_background_0.18s_ease] tw:dark:text-[#ff7d8b] tw:[background:rgba(220,_53,_69,_0.08)] tw:[backdrop-filter:blur(22px)_saturate(145%)] tw:[-webkit-backdrop-filter:blur(22px)_saturate(145%)] tw:[&&]:text-[0.96rem] tw:hover:[transform:translateY(-1px)] tw:dark:[background:rgba(220,_53,_69,_0.16)] tw:[.course-editor-actions_&:disabled]:opacity-[0.5] tw:[.course-editor-actions_&:disabled]:cursor-not-allowed tw:[.course-editor-actions_&:disabled]:[transform:none]"
                                onClick={() =>
                                  setPendingDelete({
                                    type: 'module',
                                    id: block.id,
                                    title: block.title,
                                  })
                                }
                                disabled={selectedCourse.blocks.length <= 1}
                              >
                                Удалить
                              </button>
                            </div>
                          </article>
                        ) : (
                          <button
                            type="button"
                            className={`course-block-item tw:w-[100%] tw:border-solid tw:border-[rgba(var(--accent-rgb),_0.36)] tw:rounded-[12px] tw:p-[10px_12px] tw:cursor-pointer tw:text-left tw:grid tw:gap-[4px] tw:[border-width:1px] tw:hover:border-[rgba(var(--accent-rgb),_0.72)] tw:[&.is-editing]:border-[rgba(var(--accent-rgb),_0.78)] tw:[background:rgba(var(--accent-rgb),_0.1)] tw:[font:inherit] tw:[&.is-editing]:[box-shadow:0_0_0_2px_rgba(var(--accent-rgb),_0.12)] ${isActive ? 'is-editing' : ''}`}
                            onClick={() =>
                              isCourseEditMode
                                ? setActiveBlockId((current) =>
                                    current === block.id ? null : block.id,
                                  )
                                : openBlock(block.id)
                            }
                          >
                            <span className="course-block-index tw:text-(--ink-accent) tw:text-[0.74rem] tw:font-[700] tw:uppercase tw:tracking-[0.06em]">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="course-block-title tw:text-(--text) tw:font-[700] tw:text-[0.92rem]">
                              {block.title}
                            </span>
                            {block.description && (
                              <span className="course-block-description tw:text-(--muted) tw:text-[0.8rem] tw:leading-[1.38] tw:overflow-hidden tw:[display:-webkit-box] tw:[line-clamp:3] tw:[-webkit-line-clamp:3] tw:[-webkit-box-orient:vertical]">
                                {block.description}
                              </span>
                            )}
                            <span className="course-block-meta tw:text-(--muted) tw:text-[0.82rem]">
                              {block.duration} • {block.lessons.length} урока •{' '}
                              {block.practice.length} практики
                            </span>
                            <span className="course-block-progress tw:text-(--ink-accent) tw:text-[0.8rem]">
                              Пройдено: {doneItems}/{totalItems}
                            </span>
                          </button>
                        )}
                      </li>
                      {renderInsertControl(index + 1)}
                    </Fragment>
                  );
                })}
              </ul>
            </article>

            {!isCourseEditMode && (
              <article className="glass-card course-leaderboard-card tw:border-solid tw:border-(--glass-border) tw:rounded-[22px] tw:relative tw:overflow-hidden tw:isolate tw:col-[2] tw:p-[22px] tw:[border-width:1px] tw:hover:border-(--glass-glow) tw:[background:var(--glass-tint)] tw:[box-shadow:var(--glass-shadow),_var(--glass-inset)] tw:[backdrop-filter:blur(var(--glass-blur))] tw:[-webkit-backdrop-filter:blur(var(--glass-blur))] tw:max-1100:col-[1_/_-1] tw:[order:3] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[background:var(--glass-bg)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[backdrop-filter:var(--glass-backdrop)] tw:[:is(.course-details-view,.block-view,.practice-view)_&]:[-webkit-backdrop-filter:var(--glass-backdrop)] tw:[&::before]:absolute tw:[&::before]:inset-[0] tw:[&::before]:z-[0] tw:[&::before]:rounded-[inherit] tw:[&::before]:bg-(--glass-highlight) tw:[&::before]:[content:''] tw:[&::before]:[box-shadow:inset_0_0_20px_-5px_var(--glass-glow),_inset_0_1px_0_var(--glass-top-shine)] tw:[:is(.course-details-view,.block-view,.practice-view,.lesson-view)_&]:[&::after]:[content:none] tw:[.course-viewer_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[background:var(--glass-bg-strong)] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[background:var(--glass-bg-strong)] tw:[.course-viewer_&_.glass-card]:[backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[backdrop-filter:none] tw:[.course-viewer_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[.lesson-view_&_.glass-card:not(.lesson-main-card)]:[-webkit-backdrop-filter:none] tw:[:is(.course-details-view,.block-view,.practice-view)_&_.glass-card]:[-webkit-backdrop-filter:none] tw:[&_>_*]:relative tw:[&_>_*]:z-[1]">
                <div className="course-leaderboard-head tw:flex tw:justify-between tw:items-center tw:gap-[10px] tw:[&_h3]:[font-family:'Unbounded',_sans-serif] tw:[&_h3]:text-[1rem] tw:[&_span]:text-[0.8rem] tw:[&_span]:text-(--muted)">
                  <h3>Лидерборд курса</h3>
                </div>
                <ol className="course-leaderboard-list tw:m-[12px_0_0] tw:p-[0] tw:grid tw:gap-[8px] tw:[list-style:none] tw:[&_li]:grid tw:[&_li]:grid-cols-[auto_1fr_auto] tw:[&_li]:items-center tw:[&_li]:gap-[10px] tw:[&_li]:[border:1px_solid_rgba(var(--accent-rgb),_0.34)] tw:[&_li]:rounded-[12px] tw:[&_li]:[background:rgba(var(--accent-rgb),_0.09)] tw:[&_li]:p-[10px_12px]">
                  {selectedCourseLeaderboard.map((student, index) => (
                    <li key={student.id}>
                      <span className="course-leaderboard-rank tw:w-[28px] tw:h-[28px] tw:rounded-[50%] tw:inline-flex tw:items-center tw:justify-center tw:font-[700] tw:text-[0.82rem] tw:text-(--ink-accent) tw:[background:rgba(var(--accent-rgb),_0.24)]">
                        {index + 1}
                      </span>
                      <div className="course-leaderboard-main tw:[&_strong]:block tw:[&_strong]:text-[0.9rem] tw:[&_small]:block tw:[&_small]:mt-[2px] tw:[&_small]:text-(--muted) tw:[&_small]:text-[0.78rem]">
                        <strong>{student.name}</strong>
                        <small>{student.pace}</small>
                      </div>
                      <span className="course-leaderboard-score tw:font-[700] tw:text-(--ink-muted-strong)">
                        {student.progress}%
                      </span>
                    </li>
                  ))}
                </ol>
              </article>
            )}
          </div>
        </div>
      </div>

      {canGenerateModule && moduleAgentAt !== null && (
        <AgentInterviewDialog
          variant="floating"
          open={isModuleChatVisible}
          kind="module"
          courseId={selectedCourse.id}
          order={moduleAgentAt + 1}
          knownIds={selectedCourse.blocks.map((block) => block.id)}
          contextTitle={
            moduleJob?.resultId
              ? `Модуль «${moduleJob.resultTitle || 'без названия'}» уже в списке.`
              : describeModulePosition(moduleAgentAt)
          }
          onClose={closeModuleAgent}
          onOpenResult={(job) => {
            setModuleAgentIndex(null);
            if (job.resultId) openBlock(job.resultId);
          }}
          onStartAnother={(job) => {
            // Следующий модуль — сразу после готового (order у job с единицы).
            const order = Number(job?.order);
            setModuleAgentIndex(
              Number.isFinite(order)
                ? Math.min(Math.max(order, 0), selectedCourse.blocks.length)
                : selectedCourse.blocks.length,
            );
            setIsModuleChatVisible(true);
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        eyebrow="Необратимое действие"
        title={
          pendingDelete?.type === 'course' ? 'Удалить курс?' : 'Удалить модуль?'
        }
        description={
          pendingDelete?.type === 'course'
            ? `Курс «${pendingDelete?.title || ''}» будет перенесён в архив и пропадёт из каталога.`
            : `Модуль «${pendingDelete?.title || ''}» и все его уроки будут удалены. Отменить удаление нельзя.`
        }
        confirmLabel="Удалить"
        busyLabel="Удаляем..."
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          const target = pendingDelete;
          if (!target) return;
          if (target.type === 'course') {
            setStatusAction('archive');
            try {
              await deleteCourse(target.id);
            } finally {
              setStatusAction('');
            }
          } else {
            const deleted = await deleteBlock(target.id);
            if (deleted === false) return false;
          }
          setPendingDelete(null);
        }}
      />
    </section>
  );
}
