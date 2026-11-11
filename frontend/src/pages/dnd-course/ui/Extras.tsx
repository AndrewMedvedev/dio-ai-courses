import { useEffect, useState, type CSSProperties } from 'react';
import { prefersReducedMotion } from '../lib/helpers';
import { Icon } from './icons';
import { getProgress } from '../model/selectors';
import { useDndCourseStore } from '../model/store';
import { useDndActions } from './dnd-actions';

export function Onboarding() {
  const dismissed = useDndCourseStore((state) => state.onboardingDismissed);
  const hasMaterials = useDndCourseStore((state) => state.materials.length > 0);
  const dismiss = useDndCourseStore((state) => state.dismissOnboarding);
  const { pickFiles } = useDndActions();
  if (dismissed) return null;
  return (
    <aside
      className="dnd-onboarding tw:[.page_.dnd-builder_&]:absolute tw:[.page_.dnd-builder_&]:top-[14px] tw:[.page_.dnd-builder_&]:left-[14px] tw:[.page_.dnd-builder_&]:z-[6] tw:[.page_.dnd-builder_&]:flex tw:[.page_.dnd-builder_&]:gap-[12px] tw:[.page_.dnd-builder_&]:max-w-[min(380px,_calc(100%_-_28px))] tw:[.page_.dnd-builder_&]:p-[14px] tw:[.page_.dnd-builder_&]:rounded-[14px] tw:max-767:[.page_.dnd-builder_&]:top-[8px] tw:max-767:[.page_.dnd-builder_&]:left-[8px] tw:max-767:[.page_.dnd-builder_&]:max-w-[none] tw:[.page_.dnd-builder_&]:[background:var(--dnd-panel)] tw:[.page_.dnd-builder_&]:[border:1px_solid_var(--dnd-border)] tw:[.page_.dnd-builder_&]:[box-shadow:var(--dnd-shadow-lg)] tw:[.page_.dnd-builder_&]:animate-dnd-pop tw:max-767:[.page_.dnd-builder_&]:right-[8px] tw:[.page_.dnd-builder_&_strong]:block tw:[.page_.dnd-builder_&_strong]:text-[0.88rem] tw:[.page_.dnd-builder_&_strong]:leading-[1.35] tw:[.page_.dnd-builder_&_ul]:m-[8px_0_10px] tw:[.page_.dnd-builder_&_ul]:pl-[18px] tw:[.page_.dnd-builder_&_ul]:grid tw:[.page_.dnd-builder_&_ul]:gap-[3px] tw:[.page_.dnd-builder_&_li]:text-(--dnd-muted) tw:[.page_.dnd-builder_&_li]:text-[0.78rem]"
      aria-label="Подсказка по началу работы"
    >
      <div className="dnd-onboarding-icon tw:[.page_.dnd-builder_&]:flex-[none] tw:[.page_.dnd-builder_&]:grid tw:[.page_.dnd-builder_&]:w-[38px] tw:[.page_.dnd-builder_&]:h-[38px] tw:[.page_.dnd-builder_&]:rounded-[10px] tw:[.page_.dnd-builder_&]:text-(--dnd-info) tw:[.page_.dnd-builder_&]:[place-items:center] tw:[.page_.dnd-builder_&]:[background:var(--dnd-info-bg)]">
        <Icon name="upload" size={20} />
      </div>
      <div>
        <strong>
          {hasMaterials
            ? 'Соберите первый урок'
            : 'Перетащите документы на холст, чтобы начать собирать курс.'}
        </strong>
        <ul>
          <li>Материалы → перетащите в зону «Новый урок» внизу холста.</li>
          <li>
            Уроки → перетащите на модуль, в «Новый модуль» или на другой урок —
            получится новый модуль.
          </li>
          <li>Клик по карточке открывает инспектор справа.</li>
        </ul>
        <div className="dnd-onboarding-actions tw:[.page_.dnd-builder_&]:flex tw:[.page_.dnd-builder_&]:gap-[8px] tw:[.page_.dnd-builder_&]:flex-wrap">
          {!hasMaterials ? (
            <button
              type="button"
              className="dnd-btn dnd-btn--solid dnd-btn--sm tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&]:border-(--dnd-text) tw:[.page_.dnd-builder_&:hover:not(:disabled)]:[&&&&]:border-(--dnd-text)"
              onClick={() => pickFiles()}
            >
              <Icon name="upload" size={15} /> Выбрать файлы
            </button>
          ) : null}
          <button
            type="button"
            className="dnd-btn dnd-btn--ghost dnd-btn--sm"
            onClick={dismiss}
          >
            Понятно
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Лёгкий праздничный эффект один раз за курс, когда прогресс дошёл до 100%. */
export function Celebration() {
  const percent = useDndCourseStore((state) => getProgress(state).percent);
  const celebrated = useDndCourseStore((state) => state.celebrated);
  const markCelebrated = useDndCourseStore((state) => state.markCelebrated);
  const toast = useDndCourseStore((state) => state.toast);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (percent < 100 || celebrated) return undefined;
    markCelebrated();
    toast('success', 'Структура курса собрана — можно проверить и завершить.');
    if (prefersReducedMotion()) return undefined;
    setBurst(true);
    const timer = window.setTimeout(() => setBurst(false), 1600);
    return () => window.clearTimeout(timer);
  }, [percent, celebrated, markCelebrated, toast]);

  if (!burst) return null;
  return (
    <div
      className="dnd-confetti tw:fixed tw:left-[50%] tw:top-[30%] tw:z-[1200] tw:pointer-events-none tw:motion-reduce:hidden tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px]"
      aria-hidden="true"
    >
      {Array.from({ length: 18 }, (_, index) => (
        <i
          className="tw:absolute tw:w-[8px] tw:h-[12px] tw:rounded-[2px] tw:[background:var(--dnd-accent)] tw:animate-dnd-confetti tw:[--angle:calc(var(--i)_*_20deg)] tw:focus-visible:[outline:2px_solid_var(--dnd-focus)] tw:focus-visible:[outline-offset:2px] tw:[.page_.dnd-builder_.dnd-confetti_&:nth-child(3n_+_1)]:[background:var(--dnd-ok)] tw:[.page_.dnd-builder_.dnd-confetti_&:nth-child(3n)]:[background:var(--dnd-blue)]"
          key={index}
          style={{ '--i': index } as CSSProperties}
        />
      ))}
    </div>
  );
}
