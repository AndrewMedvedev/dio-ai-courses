import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { Icon, Spinner } from './icons';
import {
  canFinish,
  getGlobalSaveState,
  getNextTask,
  getProgress,
} from '../model/selectors';
import { useDndCourseStore } from '../model/store';
import { ActionMenu, type MenuItem } from './common';

const SAVE_TEXT = {
  saving: 'Сохраняем…',
  error: 'Есть ошибки сохранения',
  dirty: 'Есть несохранённые изменения',
  saved: 'Все изменения сохранены',
};

export function TopBar({
  isMobile,
  onPreview,
}: {
  isMobile: boolean;
  onPreview?: (params: { courseId: string }) => void;
}) {
  const navigate = useNavigate();
  const course = useDndCourseStore((state) => state.course);
  const progress = useDndCourseStore(
    useShallow((state) => {
      const value = getProgress(state);
      return {
        percent: value.percent,
        currentStep: value.currentStep,
        doneCount: value.doneCount,
      };
    }),
  );
  const nextTask = useDndCourseStore(getNextTask);
  const saveState = useDndCourseStore(getGlobalSaveState);
  const finishable = useDndCourseStore(canFinish);
  const finishing = useDndCourseStore((state) => Boolean(state.pending.finish));
  const paletteOpen = useDndCourseStore((state) => state.paletteOpen);
  const inspectorOpen = useDndCourseStore(
    (state) => state.inspector.open && Boolean(state.activeNodeId),
  );
  const viewMode = useDndCourseStore((state) => state.viewMode);
  const setPaletteOpen = useDndCourseStore((state) => state.setPaletteOpen);
  const setViewMode = useDndCourseStore((state) => state.setViewMode);
  const openInspector = useDndCourseStore((state) => state.openInspector);
  const openFinish = useDndCourseStore((state) => state.openFinish);
  const openConfirm = useDndCourseStore((state) => state.openConfirm);
  const resetAll = useDndCourseStore((state) => state.resetAll);
  const restartOnboarding = useDndCourseStore(
    (state) => state.restartOnboarding,
  );
  const activeNodeId = useDndCourseStore((state) => state.activeNodeId);
  const fullscreen = useDndCourseStore((state) => state.fullscreen);
  const toggleFullscreen = useDndCourseStore((state) => state.toggleFullscreen);
  const effectiveMode = viewMode || (isMobile ? 'list' : 'canvas');
  const stepText =
    progress.doneCount >= 4
      ? 'Все шаги пройдены'
      : `Шаг ${progress.currentStep} из 4`;

  const menuItems: MenuItem[] = [
    ...(isMobile
      ? [
          {
            key: 'settings',
            icon: 'settings',
            label: 'Настройки курса',
            onSelect: () => openInspector('course', 'main'),
          },
        ]
      : []),
    {
      key: 'mode',
      icon: effectiveMode === 'canvas' ? 'list' : 'canvas',
      label: effectiveMode === 'canvas' ? 'Режим списка' : 'Режим холста',
      onSelect: () =>
        setViewMode(effectiveMode === 'canvas' ? 'list' : 'canvas'),
    },
    ...(isMobile && course?.id
      ? [
          {
            key: 'preview',
            icon: 'eye',
            label: 'Просмотр курса',
            onSelect: () => onPreview?.({ courseId: course.id }),
          },
        ]
      : []),
    {
      key: 'help',
      icon: 'help',
      label: 'Показать обучение',
      onSelect: restartOnboarding,
    },
    { key: 'sep', type: 'separator' as const },
    {
      key: 'reset',
      icon: 'restart',
      label: 'Начать заново',
      danger: true,
      onSelect: () =>
        openConfirm({
          title: 'Начать заново?',
          message:
            'Черновик конструктора будет очищен: материалы, раскладка и несохранённые формы пропадут.',
          consequences: [
            'Уже созданный курс, уроки и модули на сервере не удаляются.',
            'Загруженные документы придётся добавить повторно.',
          ],
          confirmLabel: 'Очистить черновик',
          onConfirm: () => resetAll(),
        }),
    },
  ];

  return (
    <header className="dnd-topbar tw:flex tw:items-center tw:gap-[16px] tw:p-[12px_18px] tw:min-h-[72px] tw:max-1024:gap-y-[8px] tw:max-767:gap-[8px] tw:max-767:p-[10px_12px] tw:[border-bottom:1px_solid_var(--dnd-border)] tw:[background:var(--dnd-panel)] tw:max-1024:flex-wrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_&_.dnd-icon-btn]:w-[42px] tw:[.page_.dnd-builder_&_.dnd-icon-btn]:h-[42px] tw:[.page_.dnd-builder_&_.dnd-btn]:min-h-[42px] tw:[.page_.dnd-builder_&_.dnd-btn]:text-[0.94rem]">
      <div className="dnd-topbar-left tw:flex tw:items-center tw:gap-[8px] tw:min-w-[0] tw:flex-[0_1_auto] tw:max-1024:flex-[1_1_auto] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
        <button
          type="button"
          className="dnd-icon-btn tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[42px] tw:h-[42px] tw:flex-[none] tw:rounded-[9px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)]"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate('/')
          }
          aria-label="Вернуться назад"
          title="Назад"
        >
          <Icon name="arrowLeft" />
        </button>
        {effectiveMode === 'canvas' ? (
          <button
            type="button"
            className={`dnd-icon-btn dnd-topbar-palette tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[42px] tw:h-[42px] tw:flex-[none] tw:rounded-[9px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[&.is-on]:border-(--dnd-border) tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.is-on]:[&&]:border-(--dnd-border) tw:[&.is-on]:[&&&]:border-(--dnd-border) tw:[&.is-on]:[&&&&]:border-(--dnd-border) tw:[&.is-on]:[background:var(--dnd-panel-2)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&.is-on]:[&&]:[background:var(--dnd-panel-2)] tw:[&.is-on]:[&&&]:[background:var(--dnd-panel-2)] tw:[&.is-on]:[&&&&]:[background:var(--dnd-panel-2)] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] ${paletteOpen ? 'is-on' : ''}`}
            onClick={() => setPaletteOpen(!paletteOpen)}
            aria-pressed={paletteOpen}
            aria-label={paletteOpen ? 'Скрыть палитру' : 'Показать палитру'}
            title="Палитра"
          >
            <Icon name="panel" />
          </button>
        ) : null}
        <div className="dnd-topbar-title tw:grid tw:min-w-[0] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
          <h1 className="tw:tracking-[-0.025em] tw:font-[600] tw:text-(--dnd-heading) tw:whitespace-nowrap tw:[&&&&]:text-[1.08rem] tw:[&&&]:leading-[1.2] tw:[font-family:'Unbounded',_sans-serif] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:leading-[1.2] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:[font-family:'Unbounded',_sans-serif]">
            Drag &amp; Drop курс
          </h1>
          <span
            className="tw:text-(--dnd-muted) tw:text-[0.92rem] tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
            title={course?.title}
          >
            {course?.title}
          </span>
        </div>
      </div>

      <div className="dnd-topbar-center tw:flex-[1_1_260px] tw:min-w-[0] tw:grid tw:grid-cols-[auto_minmax(0,_1fr)] tw:grid-rows-[auto_auto] tw:gap-x-[12px] tw:gap-y-[2px] tw:items-center tw:max-w-[520px] tw:m-[0_auto] tw:max-1024:max-w-[none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:max-1024:[order:3] tw:max-767:[order:2]">
        <div
          className="dnd-progress tw:row-[1_/_span_2] tw:grid tw:grid-cols-[repeat(4,_28px)] tw:gap-[4px] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-valuetext={`${progress.percent}%. ${stepText}. ${nextTask}`}
          aria-label="Прогресс создания курса"
        >
          {[0, 1, 2, 3].map((index) => (
            <i
              key={index}
              className={`tw:h-[6px] tw:rounded-[999px] tw:[background:var(--dnd-border)] tw:[transition:background_0.3s_var(--dnd-ease)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.is-done]:[background:var(--dnd-accent)] tw:[&.is-current]:[background:linear-gradient(90deg,_var(--dnd-blue)_0_50%,_var(--dnd-border)_50%)] tw:[&.is-done]:animate-dnd-fill ${index < progress.doneCount ? 'is-done' : index === progress.doneCount ? 'is-current' : ''}`}
            />
          ))}
        </div>
        <p className="dnd-topbar-task tw:leading-[1.72] tw:tracking-[0.012em] tw:m-[0] tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis tw:[&&&]:text-[0.95rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[&&&&]:text-[0.95rem] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]">
          <strong className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {stepText}
          </strong>
          <span
            className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
            aria-hidden="true"
          >
            {' '}
            ·{' '}
          </span>
          <span className="tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {nextTask}
          </span>
        </p>
        <span
          className={`dnd-topbar-save tw:inline-flex tw:items-center tw:gap-[5px] tw:text-[0.82rem] tw:text-(--dnd-muted) tw:min-w-[0] tw:[.page_.dnd-builder_&.is-saved]:text-(--dnd-ok) tw:[&.is-error]:text-(--dnd-error) tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] is-${saveState}`}
          role="status"
          title={SAVE_TEXT[saveState]}
        >
          {saveState === 'saving' ? (
            <Spinner size={12} />
          ) : (
            <Icon
              name={
                saveState === 'saved'
                  ? 'check'
                  : saveState === 'error'
                    ? 'alert'
                    : 'edit'
              }
              size={13}
            />
          )}
          <span className="dnd-topbar-save-text tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:max-767:hidden tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
            {SAVE_TEXT[saveState]}
          </span>
        </span>
      </div>

      <div className="dnd-topbar-right tw:flex tw:items-center tw:gap-[8px] tw:min-w-[0] tw:flex-[0_0_auto] tw:justify-end tw:max-767:justify-start tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:max-767:[order:3]">
        {isMobile ? (
          <div
            className="dnd-segmented dnd-segmented--sm tw:max-767:[.page_.dnd-builder_&_button]:p-[0_8px]"
            role="group"
            aria-label="Режим отображения"
          >
            <button
              type="button"
              aria-pressed={effectiveMode === 'canvas'}
              className={effectiveMode === 'canvas' ? 'is-on' : ''}
              onClick={() => setViewMode('canvas')}
            >
              <Icon name="canvas" size={15} /> Холст
            </button>
            <button
              type="button"
              aria-pressed={effectiveMode === 'list'}
              className={effectiveMode === 'list' ? 'is-on' : ''}
              onClick={() => setViewMode('list')}
            >
              <Icon name="list" size={15} /> Список
            </button>
          </div>
        ) : null}
        {!isMobile ? (
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost dnd-topbar-settings tw:text-[0.94rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[42px] tw:p-[0_16px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:max-1599:w-[38px] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:max-1599:[&&&&]:p-[0] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
            onClick={() => openInspector('course', 'main')}
            aria-label="Настройки курса"
            title="Настройки курса"
          >
            <Icon name="settings" size={16} />
            <span className="tw:max-1599:hidden tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
              Настройки курса
            </span>
          </button>
        ) : null}
        {!isMobile &&
        !inspectorOpen &&
        activeNodeId &&
        effectiveMode === 'canvas' ? (
          <button
            type="button"
            className="dnd-icon-btn tw:[.page_.dnd-builder_.dnd-topbar_&]:w-[42px] tw:[.page_.dnd-builder_.dnd-topbar_&]:h-[42px]"
            onClick={() => openInspector(activeNodeId)}
            aria-label="Показать инспектор"
            title="Показать инспектор"
          >
            <Icon name="panelRight" />
          </button>
        ) : null}
        {!isMobile && course?.id ? (
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost dnd-topbar-settings tw:text-[0.94rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[42px] tw:p-[0_16px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-border) tw:text-(--dnd-text) tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:max-1599:w-[38px] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:max-1599:[&&&&]:p-[0] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[&:active:not(:disabled)]:[transform:translateY(1px)]"
            onClick={() => onPreview?.({ courseId: course.id })}
            title="Посмотреть, как курс выглядит для студента"
            aria-label="Просмотр курса"
          >
            <Icon name="eye" size={16} />
            <span className="tw:max-1599:hidden tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
              Просмотр курса
            </span>
          </button>
        ) : null}
        <button
          type="button"
          className="dnd-btn dnd-btn--accent tw:text-[0.94rem] tw:leading-[1.45] tw:inline-flex tw:items-center tw:justify-center tw:gap-[8px] tw:min-h-[42px] tw:p-[0_16px] tw:rounded-[10px] tw:border-solid tw:border-(--dnd-accent) tw:text-[#241c24] tw:font-[650] tw:cursor-pointer tw:whitespace-nowrap tw:[border-width:1px] tw:[background:var(--dnd-accent)] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:max-767:ml-[auto] tw:disabled:opacity-[0.55] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:max-767:[&&&&]:p-[0_12px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&&]:border-(--dnd-accent-ink) tw:[&:hover:not(:disabled)]:[&&&&]:border-(--dnd-accent-ink) tw:[&:active:not(:disabled)]:[transform:translateY(1px)] tw:[&:hover:not(:disabled)]:[box-shadow:0_6px_18px_rgba(203,_170,_203,_0.45)]"
          onClick={openFinish}
          disabled={!finishable || finishing}
          aria-busy={finishing}
          title={
            finishable
              ? 'Проверить структуру и посмотреть курс'
              : 'Нужен хотя бы один модуль с уроком и завершённые операции'
          }
        >
          {finishing ? <Spinner size={14} /> : <Icon name="flag" size={16} />}
          {finishing ? 'Открываем курс…' : 'Завершить'}
        </button>
        {!isMobile ? (
          <button
            type="button"
            className={`dnd-icon-btn tw:text-[0.96rem] tw:leading-[1.45] tw:inline-grid tw:w-[42px] tw:h-[42px] tw:flex-[none] tw:rounded-[9px] tw:border-solid tw:border-[transparent] tw:text-(--dnd-text) tw:cursor-pointer tw:[place-items:center] tw:[border-width:1px] tw:[&.is-on]:border-(--dnd-border) tw:[background:transparent] tw:disabled:cursor-not-allowed tw:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:disabled:opacity-[0.4] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&.is-on]:[background:var(--dnd-panel-2)] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[&:hover:not(:disabled)]:border-(--dnd-border) tw:[&:hover:not(:disabled)]:[background:var(--dnd-panel-2)] ${fullscreen ? 'is-on' : ''}`}
            onClick={toggleFullscreen}
            aria-pressed={fullscreen}
            aria-label={
              fullscreen
                ? 'Выйти из полноэкранного режима (Esc)'
                : 'Развернуть конструктор на весь экран'
            }
            title={fullscreen ? 'Свернуть (Esc)' : 'На весь экран'}
          >
            <Icon name={fullscreen ? 'minimize' : 'maximize'} />
          </button>
        ) : null}
        <ActionMenu
          label="Дополнительные действия"
          items={menuItems}
          buttonClassName="dnd-icon-btn"
          align="end"
        />
      </div>
    </header>
  );
}
