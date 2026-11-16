import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipLayerProps {
  scope: string;
  placement?: 'right' | 'vertical';
  className?: string;
}
interface Tip {
  text: string;
  x: number;
  y: number;
  place: 'right' | 'top' | 'bottom';
}

/** Крупные подсказки поверх интерфейса: наведение, клавиатура, Escape. */
export function TooltipLayer({
  scope,
  placement = 'right',
  className = '',
}: TooltipLayerProps) {
  const id = useId();
  const [tip, setTip] = useState<Tip | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const timerRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    function clearDescription() {
      const target = targetRef.current;
      if (!target) return;
      const descriptions = (target.getAttribute('aria-describedby') || '')
        .split(' ')
        .filter((value) => value && value !== id);
      if (descriptions.length)
        target.setAttribute('aria-describedby', descriptions.join(' '));
      else target.removeAttribute('aria-describedby');
    }
    function hide() {
      window.clearTimeout(timerRef.current);
      clearDescription();
      targetRef.current = null;
      setTip(null);
    }
    function findTarget(element: Element | EventTarget | null) {
      const target = (element as Element | null)?.closest?.<HTMLElement>(
        '[data-tip]',
      );
      return target?.closest(scope) && target.getAttribute('data-tip')
        ? target
        : null;
    }
    function show(target: HTMLElement) {
      if (!target.isConnected) return hide();
      const text = target.getAttribute('data-tip');
      if (!text) return;
      const rect = target.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      const right = rect.right + 12;
      const canPlaceRight =
        placement === 'right' && right + width <= window.innerWidth - 12;
      const descriptions = target.getAttribute('aria-describedby') || '';
      target.setAttribute('aria-describedby', `${descriptions} ${id}`.trim());
      setTip({
        text,
        x: canPlaceRight
          ? right
          : Math.max(
              12,
              Math.min(
                rect.left + rect.width / 2 - width / 2,
                window.innerWidth - width - 12,
              ),
            ),
        y: canPlaceRight
          ? Math.max(
              80,
              Math.min(rect.top + rect.height / 2, window.innerHeight - 80),
            )
          : rect.top > 130
            ? rect.top - 10
            : rect.bottom + 10,
        place: canPlaceRight ? 'right' : rect.top > 130 ? 'top' : 'bottom',
      });
    }
    function update(target: HTMLElement | null) {
      if (target === targetRef.current) return;
      hide();
      targetRef.current = target;
      if (target)
        timerRef.current = window.setTimeout(() => {
          if (target === targetRef.current) show(target);
        }, 350);
    }
    function onPointerMove(event: PointerEvent) {
      if (event.pointerType === 'touch') return;
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = window.requestAnimationFrame(() =>
        update(
          findTarget(document.elementFromPoint(event.clientX, event.clientY)),
        ),
      );
    }
    function onFocus(event: FocusEvent) {
      const target = findTarget(event.target);
      if (!target?.matches(':focus-visible')) return;
      hide();
      targetRef.current = target;
      show(target);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') hide();
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('wheel', hide, { passive: true });
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timerRef.current);
      window.cancelAnimationFrame(frameRef.current);
      clearDescription();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('wheel', hide);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', onKey);
    };
  }, [id, placement, scope]);

  if (!tip) return null;
  return createPortal(
    <div
      id={id}
      role="tooltip"
      className={`app-tooltip tw:pointer-events-none tw:fixed tw:z-[3000] tw:box-border tw:w-[min(360px,calc(100vw_-_24px))] tw:rounded-[14px] tw:bg-(--tooltip-bg) tw:p-[14px_18px] tw:text-[16px] tw:font-semibold tw:leading-[1.5] tw:text-(--tooltip-text) tw:whitespace-normal tw:wrap-anywhere tw:shadow-[0_12px_32px_rgba(0,0,0,0.28)] ${tip.place === 'top' ? 'tw:-translate-y-full' : tip.place === 'right' ? 'tw:-translate-y-1/2' : ''} ${className}`}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>,
    document.querySelector('.page') || document.body,
  );
}
