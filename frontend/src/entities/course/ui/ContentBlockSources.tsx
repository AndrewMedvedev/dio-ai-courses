import {} from '@/shared/lib/text';
import { Fragment } from 'react';
import { normalizeSources } from './content-block-sources';

export function ContentBlockSources({
  sources,
  className = '',
}: {
  sources: unknown;
  className?: string;
}) {
  const items = normalizeSources(sources);
  if (items.length === 0) return null;

  return (
    <aside
      className={`content-block-sources tw:grid tw:gap-[6px] tw:p-[10px_14px] tw:border-dashed tw:border-[rgba(var(--accent-rgb),_0.38)] tw:rounded-[14px] tw:text-(--muted) tw:text-[0.86rem] tw:[border-width:1px] tw:dark:border-[rgba(233,_222,_203,_0.22)] tw:[background:rgba(var(--accent-rgb),_0.05)] tw:dark:[background:rgba(255,_255,_255,_0.04)] ${className}`.trim()}
      aria-label="Источники"
    >
      <span className="content-block-sources-title tw:text-[var(--ink-accent,_var(--muted))] tw:text-[0.74rem] tw:font-[800] tw:tracking-[0.06em] tw:uppercase">
        Источники
      </span>
      <ol className="tw:grid tw:gap-[4px] tw:m-[0] tw:pl-[20px]">
        {items.map((item, index) => (
          <li
            className="tw:wrap-anywhere tw:text-[1rem] tw:leading-[1.72] tw:tracking-[0.012em]"
            key={`${item.href || item.label}-${index}`}
          >
            {item.href ? (
              <a
                className="tw:text-[var(--eyebrow,_var(--text))] tw:font-[700] tw:hover:text-[var(--heading,_var(--text))] tw:focus-visible:text-[var(--heading,_var(--text))] tw:[text-decoration:underline] tw:[text-underline-offset:2px]"
                href={item.href}
                target="_blank"
                rel="noopener noreferrer nofollow"
                referrerPolicy="no-referrer"
                title={item.href}
              >
                {item.label}
              </a>
            ) : (
              <Fragment>{item.label}</Fragment>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
