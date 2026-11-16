import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { themedScrollbarClass } from '../themed-scrollbar';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

/** Выпадающий список в палитре платформы, с управлением с клавиатуры. */
export function Select({
  label,
  value,
  options,
  onChange,
  className = '',
}: SelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = options.findIndex((option) => option.value === value);
  const current = Math.max(0, selected);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [active, id, open]);

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active);
      else {
        setActive(current);
        setOpen(true);
      }
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? options.length - 1
            : !open
              ? current
              : (active +
                  (event.key === 'ArrowDown' ? 1 : -1) +
                  options.length) %
                options.length;
      setActive(Math.max(0, next));
      setOpen(true);
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const next = options.findIndex(
        (option, index) =>
          index > active &&
          option.label
            .toLocaleLowerCase()
            .startsWith(event.key.toLocaleLowerCase()),
      );
      const match =
        next >= 0
          ? next
          : options.findIndex((option) =>
              option.label
                .toLocaleLowerCase()
                .startsWith(event.key.toLocaleLowerCase()),
            );
      if (match >= 0) {
        event.preventDefault();
        setActive(match);
        setOpen(true);
      }
    }
  }

  return (
    <div
      ref={rootRef}
      className={`platform-select tw:relative tw:min-w-0 ${open ? 'tw:z-20' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? id : undefined}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        className={`tw:flex tw:w-full tw:items-center tw:justify-between tw:gap-[12px] tw:text-left tw:cursor-pointer tw:focus-visible:outline-2 tw:focus-visible:outline-(--eyebrow) ${className}`}
        onKeyDown={onKeyDown}
        onClick={() => {
          setActive(current);
          setOpen((previous) => !previous);
        }}
      >
        <span className="tw:min-w-0 tw:truncate">
          {options[selected]?.label || value || options[0]?.label || label}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`tw:shrink-0 tw:transition-transform ${open ? 'tw:rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          id={id}
          role="listbox"
          aria-label={label}
          className={`${themedScrollbarClass} platform-select-options tw:absolute tw:inset-x-0 tw:top-full tw:mt-[6px] tw:max-h-[min(280px,40dvh)] tw:overflow-y-auto tw:overscroll-contain tw:rounded-[16px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--surface) tw:p-[5px] tw:shadow-xl`}
        >
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={`tw:rounded-[11px] tw:px-[14px] tw:py-[10px] tw:text-[14px] tw:leading-[1.4] tw:wrap-anywhere tw:cursor-pointer tw:text-(--text) ${active === index ? 'tw:bg-(--navigation-active) tw:shadow-[inset_0_0_0_1px_var(--navigation-active-border)]' : ''}`}
              onPointerMove={() => setActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
