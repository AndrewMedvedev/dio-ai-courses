/** Отметка «пройдено» у вкладки урока. */
export function LessonPartMark({ done }: { done: boolean }) {
  return (
    <span
      className={`lesson-mode-progress tw:inline-block tw:w-[7px] tw:h-[7px] tw:ml-[7px] tw:rounded-[50%] tw:align-middle tw:[background:var(--progress-idle)] tw:[&.is-done]:[background:var(--progress-done)] ${done ? 'is-done' : ''}`}
      title={done ? 'Пройдено' : 'Ещё не пройдено'}
      aria-label={done ? 'Пройдено' : 'Ещё не пройдено'}
    />
  );
}
