import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useSessionStore } from '@/entities/session';
import { getLocalStorage } from '@/shared/lib/storage';
import { getHelpPanelArea } from '../lib/panel-area';
import {
  guideForPath,
  helpGuides,
  type HelpGuideId,
  type HelpStep,
} from '../model/guides';

interface Tour {
  id: HelpGuideId;
  step: number;
  owner: string;
}
interface Position {
  left: number;
  top: number;
  width: number;
  height: number;
}
const button =
  'tw:min-h-[44px] tw:rounded-full tw:border tw:border-solid tw:border-(--line-strong) tw:bg-transparent tw:px-[18px] tw:py-[10px] tw:text-[16px] tw:font-bold tw:text-(--text) tw:cursor-pointer tw:disabled:cursor-default tw:disabled:opacity-50 tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-(--ink-info)';
const seenThisSession = new Set<string>();

function storageKey(owner: string, id: HelpGuideId) {
  return `aicolab-help:v1:${owner}:${id}`;
}
function remember(tour: Tour) {
  seenThisSession.add(storageKey(tour.owner, tour.id));
  try {
    getLocalStorage()?.setItem(storageKey(tour.owner, tour.id), 'seen');
  } catch {
    /* Подсказки доступны и без localStorage. */
  }
}
function hasSeen(owner: string, id: HelpGuideId) {
  if (seenThisSession.has(storageKey(owner, id))) return true;
  try {
    return getLocalStorage()?.getItem(storageKey(owner, id)) === 'seen';
  } catch {
    return false;
  }
}

/** Подсказки рядом с элементами реальной страницы; без отправки форм и запуска ИИ. */
export function ContextualHelp() {
  const location = useLocation();
  const [search, setSearch] = useSearchParams();
  const userId = useSessionStore((state) => state.user?.id);
  const [tour, setTour] = useState<Tour | null>(null);
  const [target, setTarget] = useState<Position | null>(null);
  const [panelPosition, setPanelPosition] = useState({
    left: 16,
    top: 16,
    width: 420,
    maxHeight: 'calc(100dvh - 32px)',
  });
  const panelRef = useRef<HTMLElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const dismissedPathRef = useRef<string | null>(null);
  const consumedRequestRef = useRef<string | null>(null);
  const owner = userId
    ? String(userId)
    : location.pathname === '/'
      ? 'guest'
      : null;
  const requested = search.get('help');
  const routeGuide = guideForPath(location.pathname);
  const sourceGuide = tour ? helpGuides[tour.id] : null;
  const guide = sourceGuide
    ? {
        ...sourceGuide,
        steps: sourceGuide.steps.filter(
          (item: HelpStep) =>
            !item.optional || Boolean(document.querySelector(item.target)),
        ),
      }
    : null;
  const step: HelpStep | null = guide && tour ? guide.steps[tour.step] : null;
  const inlineHost = tour
    ? document.querySelector<HTMLElement>(`[data-help-slot~="${tour.id}"]`)
    : null;
  const inChat = Boolean(inlineHost?.closest('.ai-chat-thread'));
  const preferredWidth =
    tour?.id === 'creatorTraining' || tour?.id === 'dnd'
      ? 560
      : tour?.id === 'profile'
        ? 340
        : 420;
  const close = useCallback(() => {
    if (tour) remember(tour);
    dismissedPathRef.current = location.pathname;
    setTour(null);
  }, [tour, location.pathname]);

  useEffect(() => {
    if (tour?.id !== 'dnd') return;
    return () =>
      document.querySelector<HTMLElement>('[data-help-dnd-end]')?.click();
  }, [tour?.id]);

  // Действия шага запускаются кнопкой «Дальше», остальные элементы недоступны.
  useEffect(() => {
    if (!step) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const allowed = (element: EventTarget | null) =>
      element instanceof Element &&
      Boolean(
        panelRef.current?.contains(element) ||
        element.closest('[data-help-exit]') ||
        (step.interactive && element.closest(step.interactive)) ||
        (tour?.id === 'creatorTraining' &&
          element.closest(
            '.creator-training [data-training-input], .creator-training [data-training-next], .app-modal',
          )),
      );
    const block = (event: Event) => {
      if (
        event.isTrusted &&
        event.type === 'click' &&
        event.target instanceof Element &&
        event.target.closest('[data-help-exit]')
      ) {
        close();
        return;
      }
      if (!event.isTrusted || allowed(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (
          allowed(event.target) &&
          event.target instanceof Element &&
          event.target.closest('.app-modal')
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (event.key === 'Tab') {
        const buttons = Array.from(
          document.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
          ),
        ).filter(
          (element) => allowed(element) && element.getClientRects().length,
        );
        if (!buttons.length) return;
        const index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        event.preventDefault();
        event.stopImmediatePropagation();
        buttons[
          (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length
        ]?.focus({ preventScroll: true });
        return;
      }
      block(event);
    };
    const focus = (event: FocusEvent) => {
      if (!allowed(event.target))
        nextRef.current?.focus({ preventScroll: true });
    };
    const events = [
      'pointerdown',
      'mousedown',
      'click',
      'dblclick',
      'contextmenu',
      'touchstart',
      'wheel',
      'keyup',
      'dragstart',
      'drop',
      'paste',
    ];
    events.forEach((name) =>
      window.addEventListener(name, block, { capture: true, passive: false }),
    );
    window.addEventListener('keydown', keyboard, true);
    window.addEventListener('focusin', focus, true);
    if (!allowed(document.activeElement))
      nextRef.current?.focus({ preventScroll: true });
    return () => {
      events.forEach((name) => window.removeEventListener(name, block, true));
      window.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('focusin', focus, true);
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [step, tour?.id, close]);

  useEffect(() => {
    if (!owner) {
      setTour(null);
      return;
    }
    if (search.get('training') === 'creator') {
      return;
    }
    const requestKey = `${owner}:${location.key}:${requested}`;
    if (
      requested &&
      consumedRequestRef.current !== requestKey &&
      Object.prototype.hasOwnProperty.call(helpGuides, requested)
    ) {
      consumedRequestRef.current = requestKey;
      dismissedPathRef.current = null;
      setTour({ id: requested as HelpGuideId, step: 0, owner });
      const next = new URLSearchParams(search);
      next.delete('help');
      setSearch(next, { replace: true });
      return;
    }
    if (tour) {
      const learningJourney =
        tour.id === 'learning' &&
        (location.pathname === '/my-courses' ||
          location.pathname === '/courses' ||
          /^\/course\//.test(location.pathname));
      if (tour.owner === owner && (routeGuide === tour.id || learningJourney))
        return;
      remember(tour);
      setTour(null);
      return;
    }
    if (
      routeGuide &&
      dismissedPathRef.current !== location.pathname &&
      !hasSeen(owner, routeGuide)
    )
      setTour({
        id: routeGuide,
        step: 0,
        owner,
      });
  }, [
    owner,
    routeGuide,
    requested,
    location.pathname,
    location.key,
    search,
    setSearch,
    tour,
  ]);

  // Учебный чат управляет шагом через DOM: переходят и подсказка, и сам чат.
  // Это также позволяет печатать ответы вручную, не нажимая «Далее».
  const training = search.get('training') === 'creator';
  useEffect(() => {
    if (!training || !owner) return;
    dismissedPathRef.current = null;
    let lastStep = '';
    let lastRun: string | null = null;
    const sync = () => {
      const element = document.querySelector<HTMLElement>(
        '.creator-training[data-training-step]',
      );
      const lesson = document.querySelector<HTMLElement>(
        '.training-lesson[data-training-lesson-step]',
      );
      const active = element || lesson;
      const id = element ? 'creatorTraining' : 'learningTraining';
      if (!active) {
        lastStep = '';
        setTour((previous) =>
          previous?.id === 'creatorTraining' ||
          previous?.id === 'learningTraining'
            ? null
            : previous,
        );
        return;
      }
      const run = active.dataset.trainingRun || '0';
      if (lastRun !== null && lastRun !== run) dismissedPathRef.current = null;
      lastRun = run;
      if (dismissedPathRef.current === location.pathname) return;
      const index = Number(
        element
          ? element.dataset.trainingStep
          : lesson?.dataset.trainingLessonStep,
      );
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= helpGuides[id].steps.length
      )
        return;
      const key = `${id}:${run}:${index}`;
      if (lastStep === key) return;
      lastStep = key;
      setTour((previous) =>
        previous?.id === id &&
        previous.step === index &&
        previous.owner === owner
          ? previous
          : { id, step: index, owner },
      );
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.querySelector('main') || document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'data-training-step',
        'data-training-lesson-step',
        'data-training-run',
      ],
    });
    return () => observer.disconnect();
  }, [training, owner, location.pathname, location.key]);

  useLayoutEffect(() => {
    const thread = inlineHost?.closest('.ai-chat-thread');
    if (!thread || !step) return;
    const frame = requestAnimationFrame(() =>
      thread.scrollTo({ top: thread.scrollHeight, behavior: 'auto' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [inlineHost, step]);

  useLayoutEffect(() => {
    if (!step) {
      setTarget(null);
      return;
    }
    if (panelRef.current) panelRef.current.scrollTop = 0;
    const revealed = new Set<string>();
    const measure = () => {
      if (
        step.reveal &&
        (step.revealAlways || !document.querySelector(step.target))
      ) {
        for (const selector of typeof step.reveal === 'string'
          ? [step.reveal]
          : step.reveal) {
          if (revealed.has(selector)) continue;
          const trigger = document.querySelector<HTMLElement>(selector);
          if (trigger) {
            revealed.add(selector);
            trigger.click();
            scheduleMeasure();
            break;
          }
        }
      }
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft || 0;
      const viewportTop = viewport?.offsetTop || 0;
      const viewportWidth = Math.min(
        document.documentElement.clientWidth,
        viewport?.width || window.innerWidth,
      );
      const viewportHeight = Math.min(
        document.documentElement.clientHeight,
        viewport?.height || window.innerHeight,
      );
      const right = viewportLeft + viewportWidth;
      const bottom = viewportTop + viewportHeight;
      const margin = 16;
      const element = document.querySelector<HTMLElement>(step.target);
      const bounds = element?.getBoundingClientRect();
      const visible = bounds && bounds.width > 0 && bounds.height > 0;
      const rect = visible
        ? {
            left: Math.max(viewportLeft + 4, bounds.left - 5),
            top: Math.max(viewportTop + 4, bounds.top - 5),
            width: Math.max(
              0,
              Math.min(right - 4, bounds.right + 5) -
                Math.max(viewportLeft + 4, bounds.left - 5),
            ),
            height: Math.max(
              0,
              Math.min(bottom - 4, bounds.bottom + 5) -
                Math.max(viewportTop + 4, bounds.top - 5),
            ),
          }
        : null;
      const visibleRect =
        rect && rect.width > 0 && rect.height > 0 ? rect : null;
      setTarget((previous) =>
        JSON.stringify(previous) === JSON.stringify(visibleRect)
          ? previous
          : visibleRect,
      );
      if (inlineHost) return;
      const navigation = document
        .querySelector('.main-navigation')
        ?.getBoundingClientRect();
      const { left: panelLeft, width } = getHelpPanelArea(
        viewportLeft,
        viewportWidth,
        navigation?.width ? navigation.right : undefined,
        preferredWidth,
      );
      const maxHeight = Math.max(1, viewportHeight - margin * 2);
      const height = Math.min(
        panelRef.current?.getBoundingClientRect().height || 260,
        maxHeight,
      );
      const positions = visibleRect
        ? [
            {
              left: visibleRect.left + visibleRect.width + 12,
              top: visibleRect.top,
            },
            { left: visibleRect.left - width - 12, top: visibleRect.top },
            {
              left: visibleRect.left,
              top: visibleRect.top + visibleRect.height + 12,
            },
            { left: visibleRect.left, top: visibleRect.top - height - 12 },
          ]
        : [];
      const anchor = step.anchor
        ? document.querySelector(step.anchor)?.getBoundingClientRect()
        : null;
      if (anchor?.width && anchor.height)
        positions.unshift({ left: anchor.left, top: anchor.bottom + 16 });
      const reference = anchor?.width && anchor.height ? anchor : bounds;
      if (reference && step.placement) {
        positions.unshift(
          step.placement === 'below-end'
            ? { left: reference.right - width, top: reference.bottom + 12 }
            : {
                left: reference.right + 12,
                top: Math.max(viewportTop + margin, reference.top),
              },
        );
      }
      let preferred = positions.find(
        (position) =>
          position.left >= panelLeft &&
          position.left + width <= right - margin &&
          position.top >= viewportTop + margin &&
          position.top + height <= bottom - margin,
      ) ||
        positions[0] || {
          left: right - width - margin,
          top: viewportTop + margin,
        };
      if (tour?.id === 'learning' || tour?.id === 'learningTraining') {
        const controls = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.lesson-main-card button, .lesson-main-card input, .lesson-main-card textarea, .training-lesson-content button, .training-lesson-content input, .training-lesson-content textarea',
          ),
        )
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width && rect.height);
        const candidates = [
          ...positions,
          { left: right - width - margin, top: bottom - height - margin },
        ].map((position) => ({
          left: Math.max(
            panelLeft,
            Math.min(position.left, right - width - margin),
          ),
          top: Math.max(
            viewportTop + margin,
            Math.min(position.top, bottom - height - margin),
          ),
        }));
        const overlap = (
          position: { left: number; top: number },
          rect: { left: number; top: number; right: number; bottom: number },
        ) =>
          Math.max(
            0,
            Math.min(position.left + width, rect.right) -
              Math.max(position.left, rect.left),
          ) *
          Math.max(
            0,
            Math.min(position.top + height, rect.bottom) -
              Math.max(position.top, rect.top),
          );
        const score = (position: { left: number; top: number }) =>
          controls.reduce((sum, rect) => sum + overlap(position, rect), 0) +
          (visibleRect
            ? 2 *
              overlap(position, {
                ...visibleRect,
                right: visibleRect.left + visibleRect.width,
                bottom: visibleRect.top + visibleRect.height,
              })
            : 0);
        const besideTarget = visibleRect
          ? candidates.filter(
              (position) =>
                overlap(position, {
                  ...visibleRect,
                  right: visibleRect.left + visibleRect.width,
                  bottom: visibleRect.top + visibleRect.height,
                }) === 0,
            )
          : [];
        preferred = (besideTarget.length ? besideTarget : candidates).reduce(
          (best, candidate) =>
            score(candidate) < score(best) ? candidate : best,
        );
      }
      const left = Math.max(
        panelLeft,
        Math.min(preferred.left, right - width - margin),
      );
      const top = Math.max(
        viewportTop + margin,
        Math.min(preferred.top, bottom - height - margin),
      );
      const maxHeightStyle = `${maxHeight}px`;
      setPanelPosition((previous) =>
        previous.left === left &&
        previous.top === top &&
        previous.width === width &&
        previous.maxHeight === maxHeightStyle
          ? previous
          : { left, top, width, maxHeight: maxHeightStyle },
      );
    };
    const element = document.querySelector<HTMLElement>(step.target);
    const rect = element?.getBoundingClientRect();
    if (rect && (rect.bottom < 80 || rect.top > window.innerHeight - 80))
      element?.scrollIntoView({
        block: 'center',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
    let frame: number | null = null;
    const scheduleMeasure = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    measure();
    const observer = new MutationObserver(scheduleMeasure);
    observer.observe(document.querySelector('main') || document.body, {
      childList: true,
      subtree: true,
    });
    const resize = new ResizeObserver(scheduleMeasure);
    if (panelRef.current) resize.observe(panelRef.current);
    const main = document.querySelector('main');
    if (main) resize.observe(main);
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('scroll', scheduleMeasure);
    return () => {
      observer.disconnect();
      resize.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('scroll', scheduleMeasure);
    };
  }, [step, location.pathname, preferredWidth, tour?.id, inlineHost]);

  useEffect(() => {
    if (!tour) return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('[aria-modal="true"]')
      )
        close();
    };
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('keydown', escape);
    };
  }, [tour, close]);

  if (!tour || !guide || !step) return null;
  const waiting = Boolean(step.waitForTarget && !target);
  const isCreatorTraining = tour.id === 'creatorTraining';
  const isCreatorResult = isCreatorTraining && tour.step >= 7;
  return createPortal(
    <>
      {target && (
        <div
          aria-hidden="true"
          className="contextual-help-target tw:pointer-events-none tw:fixed tw:z-[1300] tw:rounded-[16px] tw:border-2 tw:border-solid tw:border-(--eyebrow) tw:transition-none"
          style={target}
        />
      )}
      {createPortal(
        <aside
          ref={panelRef}
          role="region"
          aria-label={`Обучение: ${guide.label}`}
          aria-live="polite"
          className={`contextual-help ${inlineHost ? 'tw:relative tw:w-full' : 'tw:fixed'} tw:z-[1310] tw:box-border tw:overflow-y-auto tw:overscroll-contain tw:rounded-[22px] tw:border tw:border-solid tw:border-(--ink-info) tw:bg-(--panel-bg) ${inChat ? 'tw:p-[16px] tw:shadow-none' : 'tw:p-[24px] tw:shadow-xl tw:max-480:p-[16px]'} tw:text-(--text) tw:transition-[left,top,width] tw:duration-300 tw:ease-out tw:animate-help-panel-in tw:motion-reduce:transition-none tw:motion-reduce:animate-none`}
          style={inlineHost ? undefined : panelPosition}
        >
          <div className="tw:flex tw:items-start tw:justify-between tw:gap-[8px]">
            <p className="tw:m-0 tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:gap-x-[10px] tw:gap-y-[6px] tw:text-[15px] tw:font-bold tw:leading-[1.4] tw:text-(--heading)">
              <span>{isCreatorResult ? 'Создание' : guide.label}</span>
              <span className="tw:rounded-full tw:bg-(--surface) tw:px-[10px] tw:py-[4px] tw:text-(--ink-info)">
                {isCreatorResult
                  ? tour.step === 7
                    ? 'Подтверждение'
                    : 'Готово'
                  : `Шаг ${tour.step + 1} из ${isCreatorTraining ? 7 : guide.steps.length}`}
              </span>
            </p>
            <button
              type="button"
              onClick={close}
              aria-label="Закрыть обучение"
              className="tw:grid tw:size-[36px] tw:shrink-0 tw:place-items-center tw:rounded-full tw:border-0 tw:bg-transparent tw:p-0 tw:text-[26px] tw:leading-none tw:text-(--heading) tw:cursor-pointer tw:hover:bg-(--surface) tw:focus-visible:outline-2 tw:focus-visible:outline-(--ink-info)"
            >
              ×
            </button>
          </div>
          <div
            role="progressbar"
            aria-label="Прогресс знакомства"
            aria-valuemin={0}
            aria-valuemax={guide.steps.length}
            aria-valuenow={tour.step + 1}
            className="tw:mt-[12px] tw:h-[5px] tw:overflow-hidden tw:rounded-full tw:bg-(--line-strong)"
          >
            <div
              className="tw:h-full tw:rounded-full tw:bg-(--ink-info) tw:transition-[width] tw:duration-300 tw:ease-out tw:motion-reduce:transition-none"
              style={{
                width: `${((tour.step + 1) / guide.steps.length) * 100}%`,
              }}
            />
          </div>
          <div
            key={`${tour.id}:${tour.step}`}
            className="contextual-help-step tw:animate-help-step-in tw:motion-reduce:animate-none"
          >
            <h2 className="tw:mt-[16px] tw:mb-[10px] tw:text-[23px] tw:font-bold tw:leading-[1.3] tw:text-(--heading) tw:max-480:text-[21px]">
              {step.title}
            </h2>
            <p className="tw:m-0 tw:text-[17px] tw:font-medium tw:leading-[1.6] tw:text-(--text) tw:max-480:text-[16px]">
              {step.text}
            </p>
            {waiting && (
              <p className="tw:mt-[14px] tw:mb-0 tw:text-[16px] tw:font-semibold tw:leading-[1.5] tw:text-(--ink-info)">
                Выполните указанное действие, чтобы перейти к следующему шагу.
              </p>
            )}
          </div>
          <div className="tw:mt-[22px] tw:flex tw:flex-wrap tw:items-center tw:justify-end tw:gap-[10px]">
            {tour.step > 0 &&
              tour.id !== 'creatorTraining' &&
              tour.id !== 'learningTraining' && (
                <button
                  type="button"
                  className={button}
                  onClick={() => setTour({ ...tour, step: tour.step - 1 })}
                >
                  Назад
                </button>
              )}
            <button
              ref={nextRef}
              type="button"
              disabled={waiting}
              className={`${button} tw:border-transparent! tw:bg-(--contrast)! tw:text-(--text-solid)!`}
              onClick={() => {
                if (tour.id === 'learningTraining') {
                  if (tour.step === 0) {
                    document
                      .querySelector<HTMLElement>(
                        '.training-lesson [aria-label="Свернуть содержание"]',
                      )
                      ?.click();
                    setTour({ ...tour, step: 1 });
                    return;
                  }
                  if (tour.step === 1) {
                    document
                      .querySelector<HTMLElement>(
                        '.training-lesson [aria-label="Развернуть содержание"]',
                      )
                      ?.click();
                    setTour({ ...tour, step: 2 });
                    return;
                  }
                  if (tour.step === 2) {
                    document
                      .querySelector<HTMLElement>('.ai-chat-close')
                      ?.click();
                    document
                      .querySelector<HTMLElement>(
                        '.training-lesson .course-nav-lesson-part[aria-label="Проверочные вопросы"]',
                      )
                      ?.click();
                    return;
                  }
                  const targets = [
                    '.course-nav-lesson-part[aria-label="Практика"]',
                    '[data-training-check]',
                    '[data-training-finish]',
                  ];
                  document
                    .querySelector<HTMLElement>(
                      `.training-lesson ${targets[tour.step - 3]}`,
                    )
                    ?.click();
                  return;
                }
                if (tour.id === 'creatorTraining') {
                  document
                    .querySelector<HTMLElement>(
                      '.creator-training [data-training-next]',
                    )
                    ?.click();
                  return;
                }
                if (tour.step + 1 === guide.steps.length) {
                  close();
                  return;
                }
                const next = guide.steps[tour.step + 1] as HelpStep;
                if (next.action)
                  document.querySelector<HTMLElement>(next.action)?.click();
                setTour({ ...tour, step: tour.step + 1 });
              }}
            >
              {tour.id === 'creatorTraining' && tour.step === 8
                ? 'Открыть пробный курс'
                : tour.step + 1 === guide.steps.length
                  ? 'Готово'
                  : 'Дальше'}
            </button>
          </div>
        </aside>,
        inlineHost || document.querySelector('.page') || document.body,
      )}
    </>,
    document.querySelector('.page') || document.body,
  );
}
