import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from './Canvas';
import { FinishDialog, MaterialPickerDialog, ModuleDialog } from './Dialogs';
import { Celebration, Onboarding } from './Extras';
import { countLabel, parseNodeId, WORDS } from '../lib/helpers';
import { Inspector } from './Inspector';
import { ListView } from './ListView';
import { Palette } from './Palette';
import { StartScreen } from './StartScreen';
import { useDndCourseStore } from '../model/store';
import { TopBar } from './TopBar';
import { DndTooltipLayer } from './Tooltip';
import { ConfirmDialog, LiveRegion, Toasts } from './common';
import { DndActionsContext, type PickFilesOptions } from './dnd-actions';

function useMedia(query: string): boolean {
  const get = () =>
    typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    media.addEventListener('change', onChange);
    onChange();
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function DragAndDropCoursePage() {
  const navigate = useNavigate();
  const openPreview = useCallback(
    async ({ courseId }: { courseId: string }) =>
      navigate(`/drag-and-drop-course/${courseId}/preview`),
    [navigate],
  );
  const hydrate = useDndCourseStore((state) => state.hydrate);
  const hydrated = useDndCourseStore((state) => state.hydrated);
  const hasCourse = useDndCourseStore((state) => Boolean(state.course?.id));
  const paletteOpen = useDndCourseStore((state) => state.paletteOpen);
  const inspectorOpen = useDndCourseStore(
    (state) => state.inspector.open && Boolean(state.activeNodeId),
  );
  const inspectorWide = useDndCourseStore(
    (state) =>
      state.inspector.open &&
      state.inspector.tab === 'content' &&
      String(state.activeNodeId || '').startsWith('lesson:'),
  );
  const viewMode = useDndCourseStore((state) => state.viewMode);
  const setPaletteOpen = useDndCourseStore((state) => state.setPaletteOpen);
  const closeInspector = useDndCourseStore((state) => state.closeInspector);
  const isMobile = useMedia('(max-width: 767px)');
  const isCompact = useMedia('(max-width: 1279px)');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const inspectorWidths = useDndCourseStore((state) => state.inspectorWidths);
  const setInspectorWidth = useDndCourseStore(
    (state) => state.setInspectorWidth,
  );
  const fullscreen = useDndCourseStore((state) => state.fullscreen);
  const toggleFullscreen = useDndCourseStore((state) => state.toggleFullscreen);
  const courseIdForPreview = useDndCourseStore((state) => state.course?.id);
  const pickOptionsRef = useRef<PickFilesOptions>({});
  const rootRef = useRef<HTMLElement>(null);
  const [top, setTop] = useState(160);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isCompact) setPaletteOpen(false);
  }, [isCompact, setPaletteOpen]);

  useLayoutEffect(() => {
    const measure = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) setTop(Math.max(0, Math.round(rect.top + window.scrollY)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [hasCourse]);

  const pickFiles = useCallback((options: PickFilesOptions = {}) => {
    pickOptionsRef.current = options;
    const input = fileInputRef.current;
    if (!input) return;
    input.multiple = !options.replaceMaterialId;
    input.click();
  }, []);

  const requestDelete = useCallback((id: string) => {
    const state = useDndCourseStore.getState();
    const { type, entityId } = parseNodeId(id);
    if (!entityId) return;
    if (type === 'material') {
      const material = state.materials.find((item) => item.id === entityId);
      if (!material || material.lessonId) return;
      state.openConfirm({
        title: `Удалить материал «${material.fileName}»?`,
        message: 'Материал исчезнет с холста.',
        consequences: [
          'Распознанный текст документа будет потерян — файл придётся загрузить заново.',
          'На сервере материал не хранится, поэтому больше ничего не изменится.',
        ],
        onConfirm: () => state.deleteMaterial(entityId),
      });
    }
    if (type === 'lesson') {
      const lesson = state.lessons.find((item) => item.id === entityId);
      if (!lesson) return;
      const module = state.modules.find((item) =>
        item.lessonIds.includes(entityId),
      );
      state.openConfirm({
        title: `Удалить урок «${lesson.title}»?`,
        message:
          'Урок будет удалён на сервере вместе с контентом. Отменить это нельзя.',
        consequences: [
          'Материалы урока снова станут свободными и останутся на холсте.',
          ...(module && module.lessonIds.length === 1
            ? [
                `Модуль «${module.title}» станет пустым — сам модуль не удалится.`,
              ]
            : []),
        ],
        onConfirm: () => useDndCourseStore.getState().deleteLesson(entityId),
      });
    }
    if (type === 'module') {
      const module = state.modules.find((item) => item.id === entityId);
      if (!module) return;
      state.openConfirm({
        title: `Удалить модуль «${module.title}»?`,
        message: 'Модуль будет удалён на сервере. Отменить это нельзя.',
        consequences: module.lessonIds.length
          ? [
              `Вместе с модулем сервер удалит ${countLabel(module.lessonIds.length, WORDS.lesson)} внутри него.`,
              'Материалы этих уроков вернутся на холст как свободные.',
            ]
          : ['Модуль пустой — уроки не затронуты.'],
        onConfirm: () => useDndCourseStore.getState().deleteModule(entityId),
      });
    }
  }, []);

  const previewLesson = useCallback(
    (lessonId: string) => {
      if (!courseIdForPreview) return;
      void navigate(
        `/drag-and-drop-course/${courseIdForPreview}/preview?lesson=${encodeURIComponent(lessonId)}`,
      );
    },
    [courseIdForPreview, navigate],
  );
  const actions = useMemo(
    () => ({ pickFiles, requestDelete, previewLesson }),
    [pickFiles, requestDelete, previewLesson],
  );

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.dnd-modal'))
        toggleFullscreen();
    };
    document.body.classList.add('is-dnd-fullscreen', 'tw:overflow-hidden');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('is-dnd-fullscreen', 'tw:overflow-hidden');
      window.removeEventListener('keydown', onKey);
    };
  }, [fullscreen, toggleFullscreen]);

  const widthKind = inspectorWide ? 'wide' : 'normal';
  const inspectorWidth =
    (inspectorWidths || {})[widthKind] || (inspectorWide ? 660 : 440);
  const clampWidth = (value: number) => {
    const total =
      workspaceRef.current?.getBoundingClientRect().width || window.innerWidth;
    return Math.max(340, Math.min(value, Math.min(980, total - 380)));
  };
  const startResize = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const right = workspace.getBoundingClientRect().right;
    let next = inspectorWidth;
    const move = (moveEvent: PointerEvent) => {
      next = clampWidth(right - moveEvent.clientX);
      workspace.style.setProperty('--dnd-inspector-w', `${next}px`);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      document.body.classList.remove(
        'is-dnd-resizing',
        'tw:[cursor:col-resize]!',
        'tw:[user-select:none]!',
        'tw:[&_*]:[cursor:col-resize]!',
        'tw:[&_*]:[user-select:none]!',
      );
      setInspectorWidth(widthKind, next);
    };
    document.body.classList.add(
      'is-dnd-resizing',
      'tw:[cursor:col-resize]!',
      'tw:[user-select:none]!',
      'tw:[&_*]:[cursor:col-resize]!',
      'tw:[&_*]:[user-select:none]!',
    );
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };
  const resizeHandle = (
    <div
      className="dnd-inspector-resizer tw:absolute tw:top-[0] tw:bottom-[0] tw:left-[-6px] tw:z-[6] tw:w-[12px] tw:[cursor:col-resize] tw:[touch-action:none] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-inspector:has(.lesson-editor-block-row.has-ai)_&]:hidden tw:[&::after]:absolute tw:[&::after]:top-[50%] tw:[&::after]:left-[4px] tw:[&::after]:w-[4px] tw:[&::after]:h-[56px] tw:[&::after]:rounded-[999px] tw:[&::after]:opacity-[0.6] tw:[&::after]:[transition:opacity_0.15s,_background_0.15s,_height_0.15s] tw:[&::after]:[content:''] tw:hover:[&::after]:h-[96px] tw:focus-visible:[&::after]:h-[96px] tw:[body.is-dnd-resizing_.page_.dnd-builder_&]:[&::after]:h-[96px] tw:[&::after]:[background:var(--dnd-border-strong)] tw:[&::after]:[transform:translateY(-50%)] tw:hover:[&::after]:opacity-[1] tw:focus-visible:[&::after]:opacity-[1] tw:[body.is-dnd-resizing_.page_.dnd-builder_&]:[&::after]:opacity-[1] tw:hover:[&::after]:[background:var(--dnd-accent)] tw:focus-visible:[&::after]:[background:var(--dnd-accent)] tw:[body.is-dnd-resizing_.page_.dnd-builder_&]:[&::after]:[background:var(--dnd-accent)]"
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина правой панели"
      aria-valuenow={inspectorWidth}
      aria-valuemin={340}
      aria-valuemax={980}
      tabIndex={0}
      title="Потяните, чтобы изменить ширину. Двойной клик — вернуть по умолчанию"
      onPointerDown={startResize}
      onDoubleClick={() =>
        setInspectorWidth(widthKind, inspectorWide ? 660 : 440)
      }
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          setInspectorWidth(
            widthKind,
            clampWidth(inspectorWidth + (event.key === 'ArrowLeft' ? 40 : -40)),
          );
        }
      }}
    />
  );
  const mode = viewMode || (isMobile ? 'list' : 'canvas');
  const paletteVariant = isCompact ? 'sheet' : 'side';
  const inspectorVariant = isMobile ? 'sheet' : isCompact ? 'drawer' : 'side';

  if (!hydrated) return null;

  return (
    <DndActionsContext.Provider value={actions}>
      <section
        ref={rootRef}
        className={String.raw`dnd-builder tw:relative tw:z-[1] tw:w-[calc(100%_-_24px)] tw:m-[0_auto_12px] tw:text-(--dnd-text) tw:text-[0.9rem] tw:leading-[1.4] tw:[--dnd-panel:#fbf8f2] tw:[--dnd-panel-2:#f4efe6] tw:[--dnd-canvas:#efe9de] tw:[--dnd-dot:rgba(43,_43,_43,_0.22)] tw:[--dnd-node:#ffffff] tw:[--dnd-node-2:#faf7f2] tw:[--dnd-border:#d9cfbf] tw:[--dnd-border-strong:#b9ab97] tw:[--dnd-text:#2b2b2b] tw:[--dnd-muted:#5f574b] tw:[--dnd-heading:#26231f] tw:[--dnd-accent:#cbaacb] tw:[--dnd-accent-ink:#5e4d5e] tw:[--dnd-accent-soft:rgba(203,_170,_203,_0.22)] tw:[--dnd-blue:#a0c4ff] tw:[--dnd-blue-ink:#2f4f80] tw:[--dnd-focus:#3b6fd8] tw:[--dnd-focus-ring:rgba(59,_111,_216,_0.28)] tw:[--dnd-ok:#2f7d4f] tw:[--dnd-ok-bg:rgba(47,_125,_79,_0.12)] tw:[--dnd-warn:#8a5a00] tw:[--dnd-warn-bg:rgba(212,_150,_30,_0.16)] tw:[--dnd-error:#b42318] tw:[--dnd-error-bg:rgba(180,_35,_24,_0.1)] tw:[--dnd-info:#3b5b8c] tw:[--dnd-info-bg:rgba(59,_91,_140,_0.1)] tw:[--dnd-edge:#a99c88] tw:[--dnd-shadow:0_1px_2px_rgba(60,_48,_30,_0.08),_0_8px_22px_rgba(60,_48,_30,_0.08)] tw:[--dnd-shadow-lg:0_18px_48px_rgba(40,_30,_20,_0.2)] tw:[--dnd-radius:14px] tw:[--dnd-ease:cubic-bezier(0.2,_0.8,_0.2,_1)] tw:[&.is-fullscreen]:fixed tw:[&.is-fullscreen]:z-[950] tw:max-767:w-[calc(100%_-_16px)] tw:[&.is-fullscreen]:w-[auto] tw:[&.is-fullscreen]:m-[0] tw:[font-family:'Manrope',_sans-serif] tw:[--dnd-grid-major:rgba(43,_43,_43,_0.07)] tw:[.page_&.has-course]:flex tw:[.page_&.has-course]:flex-col tw:[.page_&.has-course]:h-[max(600px,_calc(100dvh_-_var(--dnd-top,_160px)_-_16px))] tw:[&.is-fullscreen]:h-[auto]! tw:[.page_&.has-course]:rounded-[18px] tw:[.page_&.has-course]:overflow-hidden tw:[&.is-fullscreen]:inset-[10px] tw:dark:[--dnd-panel:#262626] tw:dark:[--dnd-panel-2:#2d2d2d] tw:dark:[--dnd-canvas:#1d1d1d] tw:dark:[--dnd-dot:rgba(233,_222,_203,_0.16)] tw:dark:[--dnd-node:#2f2f2f] tw:dark:[--dnd-node-2:#343434] tw:dark:[--dnd-border:#4a4a4a] tw:dark:[--dnd-border-strong:#626262] tw:dark:[--dnd-text:#e9decb] tw:dark:[--dnd-muted:#c4b9a7] tw:dark:[--dnd-heading:#f2e7d4] tw:dark:[--dnd-accent-ink:#e6cfe6] tw:dark:[--dnd-accent-soft:rgba(203,_170,_203,_0.16)] tw:dark:[--dnd-blue-ink:#bcd4ff] tw:dark:[--dnd-focus:#8fb4ff] tw:dark:[--dnd-focus-ring:rgba(143,_180,_255,_0.3)] tw:dark:[--dnd-ok:#7fd19b] tw:dark:[--dnd-ok-bg:rgba(127,_209,_155,_0.14)] tw:dark:[--dnd-warn:#f0c060] tw:dark:[--dnd-warn-bg:rgba(240,_192,_96,_0.14)] tw:dark:[--dnd-error:#ff9a8f] tw:dark:[--dnd-error-bg:rgba(255,_154,_143,_0.12)] tw:dark:[--dnd-info:#a9c6ff] tw:dark:[--dnd-info-bg:rgba(169,_198,_255,_0.12)] tw:dark:[--dnd-edge:#7c7466] tw:dark:[--dnd-shadow:0_1px_2px_rgba(0,_0,_0,_0.3),_0_8px_22px_rgba(0,_0,_0,_0.32)] tw:dark:[--dnd-shadow-lg:0_18px_48px_rgba(0,_0,_0,_0.5)] tw:dark:[--dnd-grid-major:rgba(233,_222,_203,_0.06)] tw:max-767:[.page_&.has-course]:h-[max(560px,_calc(100dvh_-_var(--dnd-top,_120px)_-_8px))] tw:[.page_&.has-course]:[background:transparent] tw:[&.is-fullscreen]:[background:linear-gradient(rgba(var(--grid-line-rgb),_calc(var(--grid-line-alpha-y)_*_0.8))_1px,_transparent_1px)_0_0/56px_56px,_linear-gradient(90deg,_rgba(var(--grid-line-rgb),_calc(var(--grid-line-alpha-x)_*_0.8))_1px,_transparent_1px)_0_0/56px_56px,_var(--grid-overlay),_linear-gradient(180deg,_var(--bg)_0%,_var(--bg-dark)_100%)]! tw:[.page_&.has-course]:[border:1px_solid_var(--dnd-border)] tw:max-767:[.page_&.has-course]:rounded-[14px] tw:[.page_&.has-course]:[box-shadow:var(--dnd-shadow)] tw:[.page_&_.dnd-btn--solid:hover:not(:disabled)]:border-(--dnd-text) tw:[.page_&_.dnd-btn:disabled]:cursor-not-allowed tw:[.page_&_.dnd-btn:disabled]:opacity-[0.55] tw:[.page_&_.dnd-btn:active:not(:disabled)]:[transform:translateY(1px)] tw:[.page_&_.dnd-btn--solid:hover:not(:disabled)]:[box-shadow:0_4px_12px_rgba(0,_0,_0,_0.16)] tw:[.page_&_.dnd-muted]:m-[0] tw:[.page_&_.dnd-muted]:text-(--dnd-muted) tw:[.page_&_.dnd-muted]:text-[0.84rem] tw:[.page_&_.dnd-muted]:flex tw:[.page_&_.dnd-muted]:gap-[6px] tw:[.page_&_.dnd-muted]:items-start tw:[.page_&_.dnd-btn]:inline-flex tw:[.page_&_.dnd-btn]:items-center tw:[.page_&_.dnd-btn]:justify-center tw:[.page_&_.dnd-btn]:gap-[8px] tw:[.page_&_.dnd-btn--sm]:min-h-[32px] tw:[.page_&_.dnd-btn--sm]:p-[0_12px] tw:[.page_&_.dnd-btn--sm]:rounded-[9px] tw:[.page_&_.dnd-btn]:[border-width:1px] tw:[.page_&_.dnd-btn]:border-solid tw:[.page_&_.dnd-btn]:border-(--dnd-border) tw:[.page_&_.dnd-btn:hover:not(:disabled)]:border-(--dnd-border-strong) tw:[.page_&_.dnd-btn--ghost]:[background:transparent] tw:[.page_&_.dnd-btn--ghost:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[.page_&_.dnd-btn]:text-(--dnd-text) tw:[.page_&_.dnd-btn]:font-[650] tw:[.page_&_.dnd-btn--sm]:text-[0.82rem] tw:[.page_&_.dnd-btn]:cursor-pointer tw:[.page_&_.dnd-btn]:whitespace-nowrap tw:[.page_&_.dnd-btn]:[transition:background_0.15s,_border-color_0.15s,_transform_0.15s,_box-shadow_0.15s] tw:[.page_&_.dnd-btn--solid]:border-(--dnd-text) tw:[.page_&_.dnd-btn--solid]:[background:var(--dnd-text)] tw:[.page_&_.dnd-btn--solid]:text-(--dnd-panel) tw:[.page_&_.dnd-inline-error]:m-[0] tw:[.page_&_.dnd-inline-error]:flex tw:[.page_&_.dnd-inline-error]:items-start tw:[.page_&_.dnd-inline-error]:flex-wrap tw:[.page_&_.dnd-inline-error]:gap-[8px] tw:[.page_&_.dnd-inline-error]:p-[10px_12px] tw:[.page_&_.dnd-inline-error]:rounded-[10px] tw:[.page_&_.dnd-inline-error]:[background:var(--dnd-error-bg)] tw:[.page_&_.dnd-inline-error]:text-(--dnd-error) tw:[.page_&_.dnd-inline-error]:text-[0.84rem] tw:[.page_&_.dnd-inline-error]:font-[600] tw:[.page_&_.dnd-visually-hidden]:absolute! tw:[.page_&_.dnd-visually-hidden]:w-[1px]! tw:[.page_&_.dnd-visually-hidden]:h-[1px]! tw:[.page_&_.dnd-visually-hidden]:p-[0]! tw:[.page_&_.dnd-visually-hidden]:m-[-1px]! tw:[.page_&_.dnd-visually-hidden]:overflow-hidden! tw:[.page_&_.dnd-visually-hidden]:[clip:rect(0_0_0_0)]! tw:[.page_&_.dnd-visually-hidden]:whitespace-nowrap! tw:[.page_&_.dnd-visually-hidden]:[border:0]! tw:[.page_&_.dnd-field-hint]:text-(--dnd-muted) tw:[.page_&_.dnd-field-hint]:text-[0.76rem] tw:[.page_&_.dnd-stack]:grid tw:[.page_&_.dnd-stack]:gap-[14px] tw:[.page_&_.dnd-stack]:min-w-[0] tw:[.page_&_.dnd-icon-btn:hover:not(:disabled)]:border-(--dnd-border) tw:[.page_&_.dnd-icon-btn:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[.page_&_.dnd-icon-btn:disabled]:cursor-not-allowed tw:[.page_&_.dnd-icon-btn:disabled]:opacity-[0.4] tw:[.page_&_.dnd-node-error]:m-[0] tw:[.page_&_.dnd-node-error]:text-[1.1rem] tw:[.page_&_.dnd-node-error]:leading-[1.38] tw:[.page_&_.dnd-node-error]:text-(--dnd-error) tw:[.page_&_.dnd-node-error]:[display:-webkit-box] tw:[.page_&_.dnd-node-error]:[-webkit-line-clamp:2] tw:[.page_&_.dnd-node-error]:[-webkit-box-orient:vertical] tw:[.page_&_.dnd-node-error]:overflow-hidden tw:[.page_&_.dnd-node-error]:wrap-anywhere tw:[.page_&_.dnd-node-error]:font-[600] tw:[.page_&_.dnd-icon-btn]:inline-grid tw:[.page_&_.dnd-icon-btn]:[place-items:center] tw:[.page_&_.dnd-icon-btn--sm]:w-[30px] tw:[.page_&_.dnd-icon-btn--sm]:h-[30px] tw:[.page_&_.dnd-icon-btn]:flex-[none] tw:[.page_&_.dnd-icon-btn--sm]:rounded-[8px] tw:[.page_&_.dnd-icon-btn]:[border-width:1px] tw:[.page_&_.dnd-icon-btn]:border-solid tw:[.page_&_.dnd-icon-btn]:border-[transparent] tw:[.page_&_.dnd-icon-btn]:[background:transparent] tw:[.page_&_.dnd-icon-btn]:text-(--dnd-text) tw:[.page_&_.dnd-icon-btn]:cursor-pointer tw:[.page_&_.dnd-icon-btn]:[transition:background_0.15s,_border-color_0.15s,_color_0.15s] tw:[.page_&_.dnd-btn]:min-h-[38px] tw:[.page_&_.dnd-btn]:p-[0_16px] tw:[.page_&_.dnd-btn]:rounded-[10px] tw:[.page_&_.dnd-btn]:text-[0.875rem] tw:[.page_&_.dnd-order-num]:inline-grid tw:[.page_&_.dnd-order-num]:[place-items:center] tw:[.page_&_.dnd-order-num]:min-w-[24px] tw:[.page_&_.dnd-order-num]:h-[24px] tw:[.page_&_.dnd-order-num]:p-[0_4px] tw:[.page_&_.dnd-order-num]:rounded-[7px] tw:[.page_&_.dnd-order-num]:[background:var(--dnd-panel-2)] tw:[.page_&_.dnd-order-num]:text-(--dnd-muted) tw:[.page_&_.dnd-order-num]:text-[0.74rem] tw:[.page_&_.dnd-order-num]:font-[800] tw:[.page_&_.dnd-order-num]:[font-variant-numeric:tabular-nums] tw:[.page_&_.dnd-btn--accent]:border-(--dnd-accent) tw:[.page_&_.dnd-btn--accent:hover:not(:disabled)]:border-(--dnd-accent-ink) tw:[.page_&_.dnd-btn--accent]:[background:var(--dnd-accent)] tw:[.page_&_.dnd-btn--accent]:text-[#241c24] tw:[.page_&_.dnd-btn--accent:hover:not(:disabled)]:[box-shadow:0_6px_18px_rgba(203,_170,_203,_0.45)] tw:[.page_&_.dnd-stats]:grid tw:[.page_&_.dnd-stats]:gap-[8px] tw:[.page_&_.dnd-stats]:m-[0] tw:[.page_&_.dnd-link]:[border:0] tw:[.page_&_.dnd-link]:[background:none] tw:[.page_&_.dnd-link]:p-[0] tw:[.page_&_.dnd-link]:text-(--dnd-blue-ink) tw:[.page_&_.dnd-link]:font-[650] tw:[.page_&_.dnd-link]:[text-decoration:underline] tw:[.page_&_.dnd-link]:[text-underline-offset:3px] tw:[.page_&_.dnd-link]:cursor-pointer tw:[.page_&_.dnd-link]:text-left tw:[.page_&_.dnd-link]:min-w-[0] tw:[.page_&_.dnd-link]:overflow-hidden tw:[.page_&_.dnd-link]:text-ellipsis tw:[.page_&_.dnd-link]:whitespace-nowrap tw:[.page_&_.dnd-node-btn:hover:not(:disabled)]:border-(--dnd-border) tw:[.page_&_.dnd-node-btn.is-danger:hover:not(:disabled)]:border-[transparent] tw:[.page_&_.dnd-node-btn:hover:not(:disabled)]:[background:var(--dnd-panel-2)] tw:[.page_&_.dnd-node-btn.is-danger:hover:not(:disabled)]:[background:var(--dnd-error-bg)] tw:[.page_&_.dnd-node-btn:hover:not(:disabled)]:text-(--dnd-text) tw:[.page_&_.dnd-node-btn.is-danger:hover:not(:disabled)]:text-(--dnd-error) tw:[.page_&_.dnd-node-btn:disabled]:cursor-not-allowed tw:[.page_&_.dnd-node-btn:disabled]:opacity-[0.35] tw:[.page_&_.dnd-segmented]:inline-flex tw:[.page_&_.dnd-segmented]:p-[3px] tw:[.page_&_.dnd-segmented]:gap-[2px] tw:[.page_&_.dnd-segmented]:rounded-[10px] tw:[.page_&_.dnd-segmented]:[background:var(--dnd-panel-2)] tw:[.page_&_.dnd-segmented]:[border:1px_solid_var(--dnd-border)] tw:[.page_&_.dnd-icon-btn]:w-[36px] tw:[.page_&_.dnd-icon-btn]:h-[36px] tw:[.page_&_.dnd-icon-btn]:rounded-[9px] tw:[.page_&_:focus-visible]:[outline:2px_solid_var(--dnd-focus)] tw:[.page_&_:focus-visible]:[outline-offset:2px] tw:motion-reduce:[.page_&_*]:[animation-duration:0.001ms]! tw:motion-reduce:[.page_&_*]:[animation-iteration-count:1]! tw:motion-reduce:[.page_&_*]:[transition-duration:0.001ms]! tw:motion-reduce:[.page_&_*::before]:[animation-duration:0.001ms]! tw:motion-reduce:[.page_&_*::before]:[animation-iteration-count:1]! tw:motion-reduce:[.page_&_*::before]:[transition-duration:0.001ms]! tw:motion-reduce:[.page_&_*::after]:[animation-duration:0.001ms]! tw:motion-reduce:[.page_&_*::after]:[animation-iteration-count:1]! tw:motion-reduce:[.page_&_*::after]:[transition-duration:0.001ms]! tw:[.page_&_.dnd-edge_.react-flow\_\_edge-path]:stroke-(--dnd-edge) tw:[.page_&_.dnd-edge_.react-flow\_\_edge-path]:[stroke-width:1.8] tw:[.page_&_.dnd-edge_.react-flow\_\_edge-path]:[transition:stroke_0.15s,_stroke-width_0.15s] tw:[.page_&_.dnd-edge--module_.react-flow\_\_edge-path]:[stroke-dasharray:6_5] tw:[.page_&_.dnd-edge:hover_.react-flow\_\_edge-path]:stroke-(--dnd-accent-ink) tw:[.page_&_.dnd-edge:hover_.react-flow\_\_edge-path]:[stroke-width:2.6] tw:[.page_&_.react-flow\_\_node:not(.react-flow\_\_node-module):hover]:z-[1000]! tw:[.page_&_.react-flow\_\_node:not(.react-flow\_\_node-module):focus-within]:z-[1000]! tw:[.page_&_.react-flow\_\_node-upload]:cursor-default tw:[.page_&_.dnd-minimap-node.is-module]:fill-(--dnd-border) tw:[.page_&_.dnd-minimap-node.is-lesson]:fill-(--dnd-accent) tw:[.page_&_.dnd-minimap-node.is-course]:fill-(--dnd-accent-ink) tw:[.page_&_.dnd-minimap-node.is-material]:fill-(--dnd-blue) tw:[.page_&_.react-flow\_\_node:not(.react-flow\_\_node-module).selected]:z-[1000]! tw:[.page.is-inner-page_&_:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[.page.is-inner-page_&_:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[.page.is-inner-page_&_:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:[.page.is-inner-page_&_:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit] tw:[.page_&_.dnd-edge.is-related_.react-flow\_\_edge-path]:stroke-(--dnd-accent-ink) tw:[.page_&_.dnd-edge.is-related_.react-flow\_\_edge-path]:[stroke-width:2.6] tw:[.page_&_.dnd-edge.selected_.react-flow\_\_edge-path]:stroke-(--dnd-focus) tw:[.page_&_.dnd-edge.selected_.react-flow\_\_edge-path]:[stroke-width:3] tw:[.page_&_.dnd-edge.is-new_.react-flow\_\_edge-path]:stroke-(--dnd-ok) tw:[.page_&_.dnd-edge.is-new_.react-flow\_\_edge-path]:[stroke-width:2.8] tw:[.page_&_.dnd-edge.is-new_.react-flow\_\_edge-path]:[stroke-dasharray:8_6] tw:[.page_&_.dnd-edge.is-new_.react-flow\_\_edge-path]:animate-dnd-dash tw:[.page_&.is-compact_.react-flow\_\_minimap]:hidden tw:[.page_&_.dnd-menu-list--start]:left-[0] tw:[.page_&_.dnd-menu-list--end]:right-[0] tw:[.page_&_.react-flow\_\_node:hover_.dnd-node-toolbar]:opacity-[1] tw:[.page_&_.react-flow\_\_node:hover_.dnd-node-toolbar]:pointer-events-auto tw:[.page_&_.react-flow\_\_node:hover_.dnd-node-toolbar]:[transform:translate(-50%,_0)] tw:[.page_&_.react-flow\_\_node:focus-within_.dnd-node-toolbar]:opacity-[1] tw:[.page_&_.react-flow\_\_node:focus-within_.dnd-node-toolbar]:pointer-events-auto tw:[.page_&_.react-flow\_\_node:focus-within_.dnd-node-toolbar]:[transform:translate(-50%,_0)] tw:[.page_&_.react-flow\_\_node:focus-visible_.dnd-node-toolbar]:opacity-[1] tw:[.page_&_.react-flow\_\_node:focus-visible_.dnd-node-toolbar]:pointer-events-auto tw:[.page_&_.react-flow\_\_node:focus-visible_.dnd-node-toolbar]:[transform:translate(-50%,_0)] tw:[.page_&_.react-flow\_\_node.dragging_.dnd-node-toolbar]:opacity-[0] tw:[.page_&_.react-flow\_\_node.dragging_.dnd-node-toolbar]:pointer-events-none tw:[.page_&_.react-flow\_\_node:hover_.dnd-module-buttons]:opacity-[1] tw:[.page_&_.react-flow\_\_node:hover_.dnd-module-buttons]:pointer-events-auto tw:[.page_&_.react-flow\_\_node:focus-within_.dnd-module-buttons]:opacity-[1] tw:[.page_&_.react-flow\_\_node:focus-within_.dnd-module-buttons]:pointer-events-auto tw:[.page_&_.react-flow\_\_node.is-bouncing]:[transition:transform_0.38s_cubic-bezier(0.34,_1.56,_0.64,_1)] tw:motion-reduce:[.page_&_.react-flow\_\_node.is-bouncing]:[transition:none] ${hasCourse ? 'has-course' : 'is-start'} is-mode-${mode} ${isCompact ? 'is-compact' : ''} ${isMobile ? 'is-mobile' : ''} ${fullscreen && hasCourse ? 'is-fullscreen' : ''}`}
        style={{ '--dnd-top': `${top}px` } as CSSProperties}
      >
        {hasCourse ? (
          <>
            <TopBar isMobile={isMobile} onPreview={openPreview} />
            <div
              ref={workspaceRef}
              style={
                { '--dnd-inspector-w': `${inspectorWidth}px` } as CSSProperties
              }
              className={`dnd-workspace tw:relative tw:flex-[1] tw:min-h-[0] tw:grid tw:grid-cols-[minmax(0,_1fr)] tw:[.page_.dnd-builder_&.has-palette]:grid-cols-[264px_minmax(0,_1fr)] tw:[.page_.dnd-builder_&.has-palette.has-inspector]:grid-cols-[264px_minmax(0,_1fr)_var(--dnd-inspector-w,_440px)] tw:[.page_.dnd-builder_&.has-palette.has-inspector.has-wide-inspector]:grid-cols-[264px_minmax(0,_1fr)_var(--dnd-inspector-w,_440px)] tw:[.page_.dnd-builder_&.has-inspector]:grid-cols-[minmax(0,_1fr)_var(--dnd-inspector-w,_440px)] tw:[.page_.dnd-builder_&.has-inspector.has-wide-inspector]:grid-cols-[minmax(0,_1fr)_var(--dnd-inspector-w,_440px)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] ${paletteOpen && paletteVariant === 'side' && mode === 'canvas' ? 'has-palette' : ''} ${inspectorOpen && inspectorVariant === 'side' ? 'has-inspector' : ''} ${inspectorWide ? 'has-wide-inspector' : ''}`}
            >
              {mode === 'canvas' && paletteOpen ? (
                <>
                  {paletteVariant === 'sheet' ? (
                    <button
                      type="button"
                      className="dnd-scrim tw:[.page_.dnd-builder_&]:absolute tw:[.page_.dnd-builder.is-mobile_&]:fixed tw:[.page_.dnd-builder_&]:inset-[0] tw:[.page_.dnd-builder_&]:z-[25] tw:[.page_.dnd-builder.is-mobile_&]:z-[899] tw:[.page_.dnd-builder_&]:p-[0] tw:[.page_.dnd-builder_&]:cursor-pointer tw:[.page_.dnd-builder_&]:[border:0] tw:[.page_.dnd-builder_&]:[background:rgba(20,_16,_12,_0.32)] tw:[.page_.dnd-builder_&]:animate-dnd-fade"
                      aria-label="Закрыть палитру"
                      onClick={() => setPaletteOpen(false)}
                    />
                  ) : null}
                  <Palette variant={paletteVariant} />
                </>
              ) : null}
              <main className="dnd-main tw:relative tw:min-w-[0] tw:min-h-[0] tw:overflow-hidden tw:text-[1.04rem] tw:tracking-[0.008em] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]">
                {mode === 'canvas' ? (
                  <>
                    <Canvas />
                    <Onboarding />
                  </>
                ) : (
                  <ListView />
                )}
              </main>
              {inspectorOpen ? (
                <>
                  {inspectorVariant !== 'side' ? (
                    <button
                      type="button"
                      className="dnd-scrim tw:[.page_.dnd-builder_&]:absolute tw:[.page_.dnd-builder.is-mobile_&]:fixed tw:[.page_.dnd-builder_&]:inset-[0] tw:[.page_.dnd-builder_&]:z-[25] tw:[.page_.dnd-builder.is-mobile_&]:z-[899] tw:[.page_.dnd-builder_&]:p-[0] tw:[.page_.dnd-builder_&]:cursor-pointer tw:[.page_.dnd-builder_&]:[border:0] tw:[.page_.dnd-builder_&]:[background:rgba(20,_16,_12,_0.32)] tw:[.page_.dnd-builder_&]:animate-dnd-fade"
                      aria-label="Закрыть инспектор"
                      onClick={closeInspector}
                    />
                  ) : null}
                  <Inspector
                    variant={inspectorVariant}
                    resizeHandle={resizeHandle}
                  />
                </>
              ) : null}
            </div>
          </>
        ) : (
          <StartScreen />
        )}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="dnd-visually-hidden tw:text-[0.96rem] tw:leading-[1.45] tw:absolute! tw:w-[1px]! tw:h-[1px]! tw:p-[0]! tw:m-[-1px]! tw:overflow-hidden! tw:whitespace-nowrap! tw:[clip:rect(0_0_0_0)]! tw:[border:0]! tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:leading-[inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:tracking-[normal] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:text-[length:inherit] tw:[&:where(p,li,h1,h2,h3,h4,button,input,textarea,select,small,dt,dd,label,legend)]:[font-family:inherit]"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            const options = pickOptionsRef.current || {};
            const store = useDndCourseStore.getState();
            if (files.length) {
              if (options.replaceMaterialId)
                store.retryMaterial(options.replaceMaterialId, files[0]);
              else
                store.addFiles(files, {
                  position: options.position || null,
                  attachToLessonId: options.attachToLessonId || null,
                });
            }
            pickOptionsRef.current = {};
            event.target.value = '';
          }}
        />

        <ModuleDialog />
        <MaterialPickerDialog />
        <FinishDialog onCreateCourse={openPreview} />
        <ConfirmDialog />
        <Toasts />
        <LiveRegion />
        <DndTooltipLayer />
        <Celebration />
      </section>
    </DndActionsContext.Provider>
  );
}
