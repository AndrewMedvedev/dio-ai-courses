import { toText } from '@/shared/lib/text';
// Markdown в превью редактора: Mermaid-схемы и подсветка кода.
import type { Components } from 'react-markdown';
import { MermaidDiagram } from '@/shared/ui/mermaid-diagram';
import { SyntaxHighlightedCode } from '@/shared/ui/syntax-highlighted-code';

export const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '');
    const language = match?.[1]?.toLowerCase();
    const code = toText(children).replace(/\n$/, '');

    if (language === 'mermaid') {
      return <MermaidDiagram chart={code} />;
    }

    return (
      <SyntaxHighlightedCode className={className} {...props}>
        {children}
      </SyntaxHighlightedCode>
    );
  },
};
