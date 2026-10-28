// Уровни сложности курса — те же названия, что в конструкторе drag-and-drop.
export const COURSE_LEVELS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "beginner", label: "Начальный" },
  { value: "intermediate", label: "Средний" },
  { value: "advanced", label: "Продвинутый" },
  { value: "expert", label: "Экспертный" },
];

const DIFFICULTY_TO_LEVEL: Record<string, string> = Object.fromEntries(
  COURSE_LEVELS.map((item) => [item.value, item.label]),
);

const LEVEL_TO_DIFFICULTY: Record<string, string> = {
  ...Object.fromEntries(COURSE_LEVELS.map((item) => [item.label, item.value])),
  // Старые названия, которые могли остаться в сохранённых данных.
  Новичок: "beginner",
  Эксперт: "expert",
};

export function courseLevelToDifficulty(level: unknown): string {
  return LEVEL_TO_DIFFICULTY[String(level)] || "beginner";
}

export function difficultyToCourseLevel(difficulty: unknown): string {
  return DIFFICULTY_TO_LEVEL[String(difficulty)] || COURSE_LEVELS[0].label;
}

/** Уровень курса по-русски: принимает значение бэкенда (beginner…) или уже готовое название. */
export function formatCourseLevel(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "Не указан";
  if (DIFFICULTY_TO_LEVEL[text.toLowerCase()]) {
    return DIFFICULTY_TO_LEVEL[text.toLowerCase()];
  }
  const difficulty = LEVEL_TO_DIFFICULTY[text];
  return difficulty ? DIFFICULTY_TO_LEVEL[difficulty] : text;
}
