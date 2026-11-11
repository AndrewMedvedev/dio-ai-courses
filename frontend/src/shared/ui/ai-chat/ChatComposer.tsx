import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { autosizeTextarea } from "@/shared/lib/dom";
import { ChatIconButton } from "./ChatParts";
import { chatScrollbarClass } from "./scrollbar";
import { IconArrowUp, IconClose, IconFile, IconPlus, IconStop } from "./icons";

export interface ChatComposerFile {
  id: string;
  name: string;
  meta?: string;
  previewUrl?: string;
}

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  /** Поле недоступно (нет прав, материал не готов). */
  disabled?: boolean;
  /** Ответ ещё готовится: отправка недоступна, при onStop — кнопка «Стоп». */
  busy?: boolean;
  onStop?: () => void;
  /** Можно ли отправить (по умолчанию — есть текст). */
  canSubmit?: boolean;
  maxLength?: number;
  maxHeight?: number;
  /** Кнопка «+» для файлов: показывается, если передан обработчик. */
  onAttach?: () => void;
  attachLabel?: string;
  attachDisabled?: boolean;
  files?: ChatComposerFile[];
  onRemoveFile?: (id: string) => void;
  /** Подсказка под полем; false — без подсказки. */
  hint?: ReactNode | false;
  /** Дополнительные элементы слева от кнопки отправки. */
  extra?: ReactNode;
  textareaRef?: MutableRefObject<HTMLTextAreaElement | null>;
  ariaLabel?: string;
  sendLabel?: string;
  id?: string;
  className?: string;
}

/** Поле ввода чата: растущий textarea, «+» для файлов, отправка по Enter. */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  placeholder = "Напишите сообщение…",
  disabled = false,
  busy = false,
  onStop,
  canSubmit,
  maxLength = 10_000,
  maxHeight = 180,
  onAttach,
  attachLabel = "Прикрепить файл",
  attachDisabled = false,
  files = [],
  onRemoveFile,
  hint = "Enter — отправить · Shift + Enter — новая строка",
  extra,
  textareaRef,
  ariaLabel = "Сообщение",
  sendLabel = "Отправить сообщение",
  id,
  className = "",
}: ChatComposerProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const allowed = canSubmit ?? Boolean(value.trim());
  const sendDisabled = disabled || busy || !allowed;

  useEffect(() => {
    autosizeTextarea(localRef.current, maxHeight);
  }, [value, maxHeight]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!sendDisabled) onSubmit();
    }
  };

  return (
    <div
      className={`ai-chat-composer tw:shrink-0 tw:flex tw:flex-col tw:gap-[6px] tw:px-[16px] tw:pt-[8px] tw:pb-[12px] ${className}`}
    >
      <div className="tw:flex tw:flex-col tw:gap-[8px] tw:rounded-[18px] tw:[border:1px_solid_var(--line)] tw:bg-[#fbf9f5] tw:dark:bg-[#2b2b2b] tw:pt-[10px] tw:pr-[10px] tw:pb-[8px] tw:pl-[14px] tw:transition-[border-color,box-shadow] tw:duration-150 tw:focus-within:[border-color:var(--cta)] tw:focus-within:shadow-[0_0_0_3px_rgba(203,170,203,0.25)]">
        {files.length > 0 ? (
          <ul className="ai-chat-files tw:m-0 tw:p-0 tw:list-none tw:flex tw:flex-wrap tw:gap-[6px]">
            {files.map((file) => (
              <li
                key={file.id}
                className="tw:inline-flex tw:items-center tw:gap-[6px] tw:max-w-full tw:rounded-[10px] tw:bg-[#e4dccf] tw:dark:bg-[#3b3b3b] tw:py-[4px] tw:pl-[8px] tw:pr-[4px] tw:text-[12px] tw:font-medium tw:text-(--text)"
              >
                {file.previewUrl ? (
                  <img
                    src={file.previewUrl}
                    alt=""
                    className="tw:size-[22px] tw:rounded-[6px] tw:object-cover"
                  />
                ) : (
                  <IconFile
                    size={14}
                    className="tw:shrink-0 tw:text-(--muted)"
                  />
                )}
                <span className="tw:truncate tw:max-w-[220px]">
                  {file.name}
                </span>
                {file.meta ? (
                  <span className="tw:text-(--muted)">{file.meta}</span>
                ) : null}
                {onRemoveFile ? (
                  <ChatIconButton
                    label={`Убрать ${file.name}`}
                    className="tw:size-[20px]! tw:rounded-[6px]"
                    onClick={() => onRemoveFile(file.id)}
                  >
                    <IconClose size={12} />
                  </ChatIconButton>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          id={id}
          ref={(element) => {
            localRef.current = element;
            if (textareaRef) textareaRef.current = element;
            autosizeTextarea(element, maxHeight);
          }}
          className={`ai-chat-input ${chatScrollbarClass} tw:block tw:w-full tw:min-h-[22px] tw:resize-none tw:border-0 tw:outline-none tw:bg-transparent tw:p-0 tw:m-0 tw:[font:inherit] tw:text-[14px] tw:leading-[1.5] tw:text-(--text) tw:placeholder:text-(--muted) tw:disabled:cursor-not-allowed`}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          aria-label={ariaLabel}
        />
        <div className="tw:flex tw:items-center tw:justify-between tw:gap-[8px]">
          <div className="tw:flex tw:items-center tw:gap-[4px] tw:min-w-0">
            {onAttach ? (
              <ChatIconButton
                label={attachLabel}
                onClick={onAttach}
                disabled={attachDisabled || disabled}
              >
                <IconPlus size={18} />
              </ChatIconButton>
            ) : null}
            {extra}
          </div>
          {busy && onStop ? (
            <button
              type="button"
              className="ai-chat-send is-stop tw:inline-flex tw:items-center tw:justify-center tw:size-[34px] tw:shrink-0 tw:rounded-full tw:border-0 tw:m-0 tw:p-0 tw:cursor-pointer tw:bg-(--cta) tw:text-[#2b2b2b]"
              onClick={onStop}
              aria-label="Остановить ответ"
              title="Остановить"
            >
              <IconStop size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="ai-chat-send tw:inline-flex tw:items-center tw:justify-center tw:size-[34px] tw:shrink-0 tw:rounded-full tw:border-0 tw:m-0 tw:p-0 tw:cursor-pointer tw:bg-(--cta) tw:text-[#2b2b2b] tw:transition-opacity tw:disabled:opacity-45 tw:disabled:cursor-not-allowed tw:focus-visible:outline-[2px] tw:focus-visible:outline-solid tw:focus-visible:outline-(--cta) tw:focus-visible:outline-offset-[2px]"
              onClick={onSubmit}
              disabled={sendDisabled}
              aria-label={busy ? "ИИ готовит ответ" : sendLabel}
              title="Отправить"
            >
              <IconArrowUp size={17} />
            </button>
          )}
        </div>
      </div>
      {hint !== false && hint ? (
        <p className="tw:m-0! tw:text-center tw:text-[11px]! tw:leading-[1.4]! tw:text-(--muted)">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
