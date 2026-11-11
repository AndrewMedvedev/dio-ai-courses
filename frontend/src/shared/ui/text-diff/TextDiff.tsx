import { diffText, trimContext } from './diff-text';

export function TextDiff({
  before,
  after,
}: {
  before: unknown;
  after: unknown;
}) {
  const segments = diffText(before, after);
  const hasChanges = segments.some((segment) => segment.type !== 'eq');
  if (!hasChanges)
    return (
      <span className="app-text-diff-empty tw:text-(--muted) tw:italic">
        без изменений
      </span>
    );

  return (
    <span className="app-text-diff tw:block tw:text-(--muted) tw:leading-[1.55] tw:whitespace-pre-wrap tw:wrap-anywhere tw:dark:[.page_&_del]:[background:rgba(255,_154,_143,_0.16)] tw:dark:[.page_&_del]:text-[#ffb4ab] tw:dark:[.page_&_ins]:[background:rgba(127,_209,_155,_0.16)] tw:dark:[.page_&_ins]:text-[#9be2b3]">
      {segments.map((segment, index) => {
        if (segment.type === 'del') {
          return (
            <del
              className="tw:p-[0_2px] tw:rounded-[4px] tw:text-[#9b1c12] tw:[background:rgba(180,_35,_24,_0.14)] tw:dark:text-[#ffb4ab] tw:[text-decoration:line-through] tw:dark:[background:rgba(255,_154,_143,_0.16)]"
              key={index}
              title="Удалено"
            >
              {segment.text.trim() ? segment.text : '⏎'}
            </del>
          );
        }
        if (segment.type === 'ins') {
          return (
            <ins
              className="tw:p-[0_2px] tw:rounded-[4px] tw:text-[#1f6b3f] tw:font-[700] tw:[background:rgba(47,_125,_79,_0.16)] tw:dark:text-[#9be2b3] tw:[text-decoration:none] tw:dark:[background:rgba(127,_209,_155,_0.16)]"
              key={index}
              title="Добавлено"
            >
              {segment.text.trim() ? segment.text : '⏎'}
            </ins>
          );
        }
        const position =
          index === 0
            ? 'start'
            : index === segments.length - 1
              ? 'end'
              : 'middle';
        return <span key={index}>{trimContext(segment.text, position)}</span>;
      })}
    </span>
  );
}
