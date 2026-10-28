import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeLinkHref } from "../lib/agent-chat-utils";

const components: Components = {
  a: ({ href, children }) => {
    const safeHref = safeLinkHref(href);
    if (!safeHref) return <span>{children}</span>;
    return (
      <a href={safeHref} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
  img: () => null,
};

/** Markdown ответа агента без HTML и с безопасными ссылками. */
export function AgentMarkdown({ children }: { children?: ReactNode }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {String(children || "")}
    </ReactMarkdown>
  );
}
