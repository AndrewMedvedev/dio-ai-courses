const coursePath =
  'M12 5C9 3 6 3 3 4v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15';
const organizationPath =
  'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 20v-2a5 5 0 0 1 5-4h4a5 5 0 0 1 5 4v2m2-15a3 3 0 0 1 0 6m0 3a4 4 0 0 1 4 4v2';
const bellPath = 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4';

export function NotificationIcon({
  size = 22,
  type,
}: {
  size?: number;
  type?: string;
}) {
  const path =
    type === 'course_invited'
      ? coursePath
      : type === 'organization_invited'
        ? organizationPath
        : bellPath;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="tw:shrink-0"
    >
      <path d={path} />
    </svg>
  );
}
