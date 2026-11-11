import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatScrollbarClass } from './scrollbar';

import {
  safeChatUrl,
  components,
  chatMarkdownClass,
} from './chat-markdown-config';

/** Markdown ответа ИИ: без HTML и картинок, ссылки только безопасные, код с подсветкой. */
export function ChatMarkdown({
  children,
  className = '',
}: {
  children?: string | null;
  className?: string;
}) {
  return (
    <div className={`${chatMarkdownClass} ${chatScrollbarClass} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={safeChatUrl}
      >
        {String(children || '')}
      </ReactMarkdown>
    </div>
  );
}
