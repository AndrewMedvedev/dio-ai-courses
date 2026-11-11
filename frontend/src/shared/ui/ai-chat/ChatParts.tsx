import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { ChatMarkdown } from "./ChatMarkdown";
import { chatScrollbarClass } from "./scrollbar";
import { IconCheck, IconCopy, IconSparkle } from "./icons";

/* Сброс стилей браузера для кнопок: Tailwind подключён без preflight. */
const buttonBase =
  "tw:inline-flex tw:items-center tw:justify-center tw:gap-[6px] tw:border-0 tw:m-0 tw:[font:inherit] tw:cursor-pointer tw:transition-[background-color,border-color,color,box-shadow,opacity] tw:duration-150 tw:disabled:cursor-not-allowed tw:disabled:opacity-50 tw:focus-visible:outline-[2px] tw:focus-visible:outline-solid tw:focus-visible:outline-(--cta) tw:focus-visible:outline-offset-[2px]";

type ChatButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variantClass: Record<ChatButtonVariant, string> = {
  primary:
    "tw:bg-(--cta) tw:text-[#2b2b2b] tw:hover:enabled:brightness-[1.04] tw:hover:enabled:shadow-[0_6px_16px_rgba(203,170,203,0.35)]",
  secondary:
    "tw:bg-transparent tw:text-(--text) tw:[border:1px_solid_var(--line)] tw:hover:enabled:[border-color:var(--cta)]",
  ghost:
    "tw:bg-transparent tw:text-(--muted) tw:hover:enabled:text-(--text) tw:hover:enabled:bg-[rgba(203,170,203,0.16)]",
  danger:
    "tw:bg-transparent tw:text-[#93392f] tw:dark:text-[#f0bdb5] tw:[border:1px_solid_currentColor] tw:hover:enabled:bg-[rgba(147,57,47,0.08)]",
};

export interface ChatButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ChatButtonVariant;
  size?: "sm" | "md";
}

/** Кнопка в общем стиле чатов: акцентная, контурная, тихая или опасная. */
export function ChatButton({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ChatButtonProps) {
  return (
    <button
      type={type}
      className={`ai-chat-btn ${buttonBase} tw:rounded-full tw:font-semibold tw:whitespace-nowrap ${size === "sm" ? "tw:min-h-[30px] tw:px-[12px] tw:text-[12.5px]" : "tw:min-h-[36px] tw:px-[16px] tw:text-[13.5px]"} ${variantClass[variant]} ${className}`}
      {...props}
    />
  );
}

export interface ChatIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

/** Квадратная кнопка-иконка для шапки и поля ввода. */
export const ChatIconButton = forwardRef<
  HTMLButtonElement,
  ChatIconButtonProps
>(function ChatIconButton(
  {
    label,
    active = false,
    className = "",
    type = "button",
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`ai-chat-icon-btn ${buttonBase} tw:size-[32px] tw:shrink-0 tw:rounded-[10px] tw:p-0 ${active ? "tw:bg-[rgba(203,170,203,0.22)] tw:text-(--text)" : "tw:bg-transparent tw:text-(--muted)"} tw:hover:enabled:bg-[rgba(203,170,203,0.18)] tw:hover:enabled:text-(--text) ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});

export interface ChatThreadHandle {
  scrollToBottom: (smooth?: boolean) => void;
  element: HTMLDivElement | null;
}

export interface ChatThreadProps {
  children?: ReactNode;
  busy?: boolean;
  /** При изменении лента прокручивается вниз. */
  scrollKey?: unknown;
  className?: string;
  /** Пустая лента: содержимое по центру. */
  centered?: boolean;
  label?: string;
}

/** Прокручиваемая лента сообщений; новые сообщения появляются внизу. */
export const ChatThread = forwardRef<ChatThreadHandle, ChatThreadProps>(
  function ChatThread(
    {
      children,
      busy = false,
      scrollKey,
      className = "",
      centered = false,
      label,
    },
    ref,
  ) {
    const elementRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => ({
      scrollToBottom: (smooth = true) =>
        elementRef.current?.scrollTo({
          top: elementRef.current.scrollHeight,
          behavior: smooth ? "smooth" : "auto",
        }),
      get element() {
        return elementRef.current;
      },
    }));
    useEffect(() => {
      const element = elementRef.current;
      if (!element) return;
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }, [scrollKey]);
    return (
      <div
        ref={elementRef}
        className={`ai-chat-thread ${chatScrollbarClass} tw:flex-1 tw:min-h-0 tw:overflow-y-auto tw:overscroll-contain tw:px-[16px] tw:py-[16px] tw:flex tw:flex-col tw:gap-[14px] ${centered ? "tw:justify-center" : ""} ${className}`}
        aria-live="polite"
        aria-busy={busy}
        aria-label={label}
      >
        {children}
      </div>
    );
  },
);

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <ChatIconButton
      label={copied ? "Скопировано" : "Скопировать ответ"}
      className="tw:size-[26px] tw:rounded-[8px]"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          // Буфер обмена недоступен (нет разрешения) — молча игнорируем.
        }
      }}
    >
      {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
    </ChatIconButton>
  );
}

export interface ChatMessageProps {
  role: "user" | "assistant";
  /** Текст сообщения. У ассистента рендерится как markdown. */
  text?: string;
  /** Произвольное содержимое вместо текста (карточки, файлы). */
  children?: ReactNode;
  /** Под пузырём: кнопки действий. У ассистента по умолчанию — «Скопировать». */
  actions?: ReactNode;
  copyable?: boolean;
  className?: string;
}

/** Сообщение в стиле «пузыри»: пользователь справа акцентом, ИИ слева светлым пузырём. */
export function ChatMessage({
  role,
  text,
  children,
  actions,
  copyable = role === "assistant",
  className = "",
}: ChatMessageProps) {
  const isUser = role === "user";
  const body =
    children ??
    (isUser ? (
      <span className="tw:whitespace-pre-wrap tw:[overflow-wrap:anywhere]">
        {text}
      </span>
    ) : (
      <ChatMarkdown>{text}</ChatMarkdown>
    ));
  const footer =
    actions ??
    (!isUser && copyable && text ? <CopyButton text={text} /> : null);
  return (
    <div
      className={`ai-chat-message ${isUser ? "is-user tw:self-end tw:items-end" : "is-assistant tw:self-start tw:items-start"} tw:flex tw:flex-col tw:gap-[4px] tw:max-w-[88%] tw:min-w-0 ${className}`}
    >
      <div
        className={`ai-chat-bubble tw:min-w-0 tw:max-w-full tw:text-[14px] tw:leading-[1.55] ${
          isUser
            ? "tw:bg-(--cta) tw:text-[#2b2b2b] tw:rounded-[18px] tw:rounded-br-[6px] tw:px-[14px] tw:py-[9px]"
            : "tw:bg-[rgba(255,255,255,0.86)] tw:dark:bg-[#3b3b3b] tw:text-(--text) tw:[border:1px_solid_var(--line)] tw:rounded-[18px] tw:rounded-bl-[6px] tw:px-[14px] tw:py-[11px]"
        }`}
      >
        {body}
      </div>
      {footer ? (
        <div className="tw:flex tw:items-center tw:gap-[2px] tw:px-[2px]">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** «ИИ думает…» — три точки и подпись. */
export function ChatTyping({ label = "Думаю…" }: { label?: string }) {
  return (
    <div
      className="ai-chat-typing tw:self-start tw:flex tw:items-center tw:gap-[10px] tw:rounded-[18px] tw:rounded-bl-[6px] tw:px-[14px] tw:py-[10px] tw:bg-[rgba(255,255,255,0.86)] tw:dark:bg-[#3b3b3b] tw:[border:1px_solid_var(--line)] tw:text-[13px] tw:text-(--muted)"
      role="status"
    >
      <span
        className="tw:inline-flex tw:items-center tw:gap-[4px]"
        aria-hidden="true"
      >
        {[0, 150, 300].map((delay) => (
          <i
            key={delay}
            className="tw:block tw:size-[6px] tw:rounded-full tw:bg-(--muted) tw:animate-chat-thinking-pulse tw:motion-reduce:animate-none"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}

export interface ChatQuickRepliesProps {
  options: string[];
  onPick: (option: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/** Быстрые ответы-чипы. */
export function ChatQuickReplies({
  options,
  onPick,
  disabled = false,
  label = "Быстрые ответы",
  className = "",
}: ChatQuickRepliesProps) {
  if (!options.length) return null;
  return (
    <div
      className={`ai-chat-quick tw:flex tw:flex-wrap tw:gap-[8px] ${className}`}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`${buttonBase} tw:rounded-full tw:px-[13px] tw:py-[7px] tw:text-[13px] tw:font-medium tw:text-(--text) tw:bg-[#fbf9f5] tw:dark:bg-[#2b2b2b] tw:[border:1px_solid_var(--line)] tw:hover:enabled:[border-color:var(--cta)] tw:hover:enabled:bg-[rgba(203,170,203,0.16)]`}
          onClick={() => onPick(option)}
          disabled={disabled}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Пустой диалог: значок, заголовок, пояснение и подсказки. */
export function ChatEmpty({
  title,
  text,
  children,
}: {
  title: ReactNode;
  text?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="ai-chat-empty tw:flex tw:flex-col tw:items-center tw:text-center tw:gap-[10px] tw:py-[12px] tw:px-[8px] tw:m-auto tw:max-w-[440px]">
      <span
        className="tw:inline-flex tw:items-center tw:justify-center tw:size-[44px] tw:rounded-[14px] tw:bg-(--cta) tw:text-[#2b2b2b]"
        aria-hidden="true"
      >
        <IconSparkle size={22} />
      </span>
      <p className="tw:m-0! tw:text-[17px]! tw:leading-[1.35]! tw:font-bold tw:text-(--heading)">
        {title}
      </p>
      {text ? (
        <p className="tw:m-0! tw:text-[13.5px]! tw:leading-[1.55]! tw:text-(--muted)">
          {text}
        </p>
      ) : null}
      {children ? (
        <div className="tw:mt-[6px] tw:flex tw:justify-center">{children}</div>
      ) : null}
    </div>
  );
}

type NoticeTone = "info" | "error" | "success";

const noticeTone: Record<NoticeTone, string> = {
  info: "tw:bg-[#ecdfe8] tw:text-[#5e4d5e] tw:dark:bg-[#4a424a] tw:dark:text-[#ead9ea]",
  error:
    "tw:bg-[#f4e2df] tw:text-[#93392f] tw:dark:bg-[#4a3734] tw:dark:text-[#f0bdb5]",
  success:
    "tw:bg-[#e2eee1] tw:text-[#2f6b3c] tw:dark:bg-[#35463a] tw:dark:text-[#bfe3c8]",
};

/** Служебное сообщение в ленте: ошибка, статус, демо-режим. */
export function ChatNotice({
  tone = "info",
  children,
  actions,
  className = "",
}: {
  tone?: NoticeTone;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`ai-chat-notice is-${tone} tw:flex tw:flex-col tw:gap-[8px] tw:rounded-[14px] tw:px-[14px] tw:py-[11px] tw:text-[13px] tw:leading-[1.5] ${noticeTone[tone]} ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div className="tw:flex tw:flex-col tw:gap-[2px]">{children}</div>
      {actions ? (
        <div className="tw:flex tw:flex-wrap tw:gap-[8px]">{actions}</div>
      ) : null}
    </div>
  );
}

/** Карточка действия в ленте: подтверждение, прогресс, результат. */
export function ChatCard({
  title,
  children,
  actions,
  className = "",
  role,
}: {
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
  role?: string;
}) {
  return (
    <section
      className={`ai-chat-card tw:self-stretch tw:flex tw:flex-col tw:gap-[10px] tw:rounded-[16px] tw:[border:1px_solid_var(--line)] tw:bg-[#fbf9f5] tw:dark:bg-[#2b2b2b] tw:px-[16px] tw:py-[14px] tw:text-[13.5px] tw:leading-[1.55] tw:text-(--text) ${className}`}
      role={role}
    >
      {title ? (
        <strong className="tw:text-[14px] tw:font-bold tw:text-(--heading)">
          {title}
        </strong>
      ) : null}
      {children}
      {actions ? (
        <div className="tw:flex tw:flex-wrap tw:gap-[8px] tw:pt-[2px]">
          {actions}
        </div>
      ) : null}
    </section>
  );
}

/** Полоса прогресса в стиле чата. */
export function ChatProgress({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="ai-chat-progress tw:flex tw:flex-col tw:gap-[6px]"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <div className="tw:h-[6px] tw:rounded-full tw:bg-[#e4dccf] tw:dark:bg-[#4f4f4f] tw:overflow-hidden">
        <div
          className="tw:h-full tw:rounded-full tw:bg-(--cta) tw:transition-[width] tw:duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
