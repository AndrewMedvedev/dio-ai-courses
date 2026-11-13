import { Chevron } from '@/shared/ui/chevron';

export function CollapsedCourseContents({
  onExpand,
}: {
  onExpand: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onExpand}
      aria-label="Развернуть содержание"
      aria-expanded="false"
      title="Развернуть содержание курса"
      className="course-contents-toggle tw:sticky tw:top-[90px] tw:grid tw:w-[40px] tw:h-[84px] tw:box-border tw:shrink-0 tw:grid-rows-[32px_22px] tw:justify-items-center tw:content-center tw:gap-[6px] tw:rounded-[20px] tw:border tw:border-solid tw:border-(--glass-border) tw:bg-(--panel-bg) tw:p-0 tw:text-(--muted) tw:cursor-pointer tw:hover:border-(--contrast) tw:focus-visible:outline-2 tw:focus-visible:outline-(--contrast)"
    >
      <span className="tw:grid tw:box-border tw:size-[32px] tw:place-items-center tw:rounded-full tw:border tw:border-solid tw:border-(--line)">
        <Chevron direction="right" />
      </span>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="tw:block tw:text-(--eyebrow)"
      >
        <path d="M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Zm0 0v16" />
      </svg>
    </button>
  );
}
