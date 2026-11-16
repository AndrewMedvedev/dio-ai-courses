import { useState } from 'react';

export function CodeEditor({
  value,
  onChange,
  language = 'TEXT',
  id,
  label = 'Ваше решение',
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  id?: string;
  label?: string;
  disabled?: boolean;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );
  return (
    <div className="tw:overflow-hidden tw:rounded-[18px] tw:border tw:border-solid tw:border-(--line) tw:bg-(--code-bg)">
      <div className="tw:mx-[20px] tw:flex tw:items-center tw:justify-between tw:gap-[12px] tw:border-0 tw:border-b tw:border-solid tw:border-(--line) tw:py-[18px]">
        <span className="tw:text-[11px] tw:font-bold tw:text-(--eyebrow)">
          {language.toUpperCase()}
        </span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopyState('copied');
            } catch {
              setCopyState('error');
            }
          }}
          className="tw:border-0 tw:bg-transparent tw:text-[12px] tw:text-(--muted) tw:cursor-pointer"
        >
          {copyState === 'error'
            ? 'Не удалось скопировать'
            : copyState === 'copied'
              ? 'Скопировано'
              : 'Копировать'}
        </button>
      </div>
      <textarea
        id={id}
        aria-label={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setCopyState('idle');
        }}
        disabled={disabled}
        spellCheck={false}
        className="tw:block tw:min-h-[200px] tw:w-full tw:resize-y tw:border-0 tw:bg-transparent tw:p-[20px] tw:font-mono tw:text-[14px] tw:leading-[1.7] tw:text-(--text) tw:disabled:opacity-60 tw:focus-visible:outline-2 tw:focus-visible:outline-(--contrast)"
      />
    </div>
  );
}
