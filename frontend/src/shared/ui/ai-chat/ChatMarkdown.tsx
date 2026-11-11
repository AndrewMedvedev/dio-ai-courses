import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { SyntaxHighlightedCode } from "@/shared/ui/syntax-highlighted-code";

/** Разрешаем только http(s), mailto, tel и относительные ссылки. */
export function safeChatUrl(url: string | null | undefined) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^(\/|\.{1,2}\/|#)/.test(value)) return value;
  return value.includes(":") ? "" : value;
}

const components: Components = {
  a: ({ href, children }) => {
    const safeHref = safeChatUrl(href);
    if (!safeHref) return <span>{children}</span>;
    return (
      <a href={safeHref} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  img: () => null,
  table: ({ children }) => (
    <div className="tw:overflow-x-auto tw:max-w-full">
      <table>{children}</table>
    </div>
  ),
  code: ({ className, children, node: _node, ...props }) =>
    className?.includes("language-") ? (
      <SyntaxHighlightedCode className={className} {...props}>
        {children}
      </SyntaxHighlightedCode>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    ),
};

/*
 * Типографика ответа ИИ. Внутри страницы есть общие правила для main p/li/h2
 * с большей специфичностью, поэтому размеры и отступы — с !important.
 */
export const chatMarkdownClass = [
  "ai-chat-markdown tw:min-w-0 tw:text-[14px] tw:leading-[1.6] tw:text-(--text) tw:[overflow-wrap:anywhere]",
  "tw:[&>*]:m-0! tw:[&>*+*]:mt-[8px]!",
  "tw:[&_p]:text-[14px]! tw:[&_p]:leading-[1.6]! tw:[&_p]:tracking-normal! tw:[&_p]:text-(--text)",
  "tw:[&_li]:text-[14px]! tw:[&_li]:leading-[1.6]! tw:[&_li]:tracking-normal! tw:[&_li+li]:mt-[3px]",
  "tw:[&_:is(ul,ol)]:pl-[20px]! tw:[&_:is(ul,ol)]:my-0! tw:[&_li>:is(ul,ol)]:mt-[3px]! tw:[&_li::marker]:text-(--muted)",
  "tw:[&_:is(h1,h2,h3,h4)]:text-(--heading) tw:[&_:is(h1,h2,h3,h4)]:font-bold tw:[&_:is(h1,h2,h3,h4)]:tracking-normal! tw:[&_:is(h1,h2,h3,h4)]:leading-[1.35]!",
  "tw:[&_h1]:text-[17px]! tw:[&_h2]:text-[16px]! tw:[&_h3]:text-[15px]! tw:[&_h4]:text-[14px]!",
  "tw:[&_strong]:font-bold tw:[&_strong]:text-(--heading)",
  "tw:[&_a]:text-[#5e4d5e] tw:dark:[&_a]:text-[#ead9ea] tw:[&_a]:underline tw:[&_a]:[text-underline-offset:2px]",
  "tw:[&_:not(pre)>code]:[font-family:'JetBrains_Mono',ui-monospace,monospace] tw:[&_:not(pre)>code]:text-[0.88em] tw:[&_:not(pre)>code]:px-[5px] tw:[&_:not(pre)>code]:py-[1px] tw:[&_:not(pre)>code]:rounded-[6px] tw:[&_:not(pre)>code]:bg-[rgba(203,170,203,0.28)] tw:dark:[&_:not(pre)>code]:bg-[rgba(203,170,203,0.2)]",
  "tw:[&_pre]:m-0 tw:[&_pre]:p-[12px_14px] tw:[&_pre]:rounded-[12px] tw:[&_pre]:bg-[#2b2b2b] tw:dark:[&_pre]:bg-[#1f1f1f] tw:[&_pre]:text-[#e9decb] tw:[&_pre]:overflow-x-auto tw:[&_pre]:text-[12.5px] tw:[&_pre]:leading-[1.6] tw:[&_pre]:[font-family:'JetBrains_Mono',ui-monospace,monospace] tw:[&_pre_code]:[font:inherit] tw:[&_pre_code]:text-[12.5px]!",
  "tw:[&_blockquote]:pl-[12px] tw:[&_blockquote]:[border-left:3px_solid_var(--cta)] tw:[&_blockquote]:text-(--muted)",
  "tw:[&_hr]:border-0 tw:[&_hr]:[border-top:1px_solid_var(--line)]",
  "tw:[&_table]:border-collapse tw:[&_table]:text-[13px] tw:[&_:is(th,td)]:[border:1px_solid_var(--line)] tw:[&_:is(th,td)]:p-[6px_8px] tw:[&_th]:text-left tw:[&_th]:font-semibold",
].join(" ");

/** Markdown ответа ИИ: без HTML и картинок, ссылки только безопасные, код с подсветкой. */
export function ChatMarkdown({
  children,
  className = "",
}: {
  children?: string | null;
  className?: string;
}) {
  return (
    <div className={`${chatMarkdownClass} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={safeChatUrl}
      >
        {String(children || "")}
      </ReactMarkdown>
    </div>
  );
}
