import { toText } from '@/shared/lib/text';
import { type ComponentPropsWithoutRef } from 'react';
import { getCodeLanguage, highlight } from './highlight-code';

export interface SyntaxHighlightedCodeProps extends ComponentPropsWithoutRef<'code'> {
  /** Узел AST от react-markdown — не пробрасываем в DOM. */
  node?: unknown;
}

export function SyntaxHighlightedCode({
  className = '',
  children,
  node: _node,
  ...props
}: SyntaxHighlightedCodeProps) {
  const language = getCodeLanguage(className);
  const source = toText(children).replace(/\n$/, '');

  if (!language) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <code
      className={`tw:[.page.is-inner-page_.lesson-markdown_pre_&]:text-[#d8dee9] tw:[.generated-course-learning-grid_.lesson-markdown_pre_&]:text-[inherit] tw:[.page.is-inner-page_.lesson-markdown_pre_&]:text-[clamp(0.9rem,_1.05vw,_0.98rem)] tw:[.lesson-markdown_&]:text-[0.84rem] tw:[.page.is-inner-page_.lesson-markdown_pre_&]:block tw:[.page.is-inner-page_.lesson-markdown_pre_&]:min-w-[max-content] tw:[.page.is-inner-page_.lesson-markdown_pre_&]:leading-[1.72] tw:[.page.is-inner-page_.lesson-markdown_pre_&]:tracking-[0.005em] tw:[.lesson-markdown_&]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace] tw:[&::before]:block tw:[&::before]:w-[fit-content] tw:[&::before]:m-[-8px_0_13px] tw:[&::before]:rounded-[999px] tw:[&::before]:text-[#8f9baa] tw:[&::before]:p-[3px_9px] tw:[&::before]:text-[0.68rem] tw:[&::before]:font-[800] tw:[&::before]:leading-[1.3] tw:[&::before]:tracking-[0.1em] tw:[&::before]:uppercase tw:[&::before]:[content:attr(data-language)] tw:[&::before]:[border:1px_solid_rgba(171,_178,_191,_0.2)] tw:[&::before]:[background:rgba(255,_255,_255,_0.055)] tw:[&::before]:[font-family:'Manrope',_sans-serif] ${className} syntax-highlighted-code`}
      data-language={language}
      {...props}
    >
      {highlight(source, language)}
    </code>
  );
}
