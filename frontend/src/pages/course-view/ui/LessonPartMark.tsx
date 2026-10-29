/** Отметка «пройдено» у вкладки урока. */
export function LessonPartMark({ done }: { done: boolean }) {
  return (
    <span
      className={`lesson-mode-progress ${done ? "is-done" : ""}`}
      title={done ? "Пройдено" : "Ещё не пройдено"}
      aria-label={done ? "Пройдено" : "Ещё не пройдено"}
    />
  );
}
