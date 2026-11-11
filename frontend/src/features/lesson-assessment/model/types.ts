// Тест и практическое задание урока в том виде, в каком их возвращает ИИ-агент.

export interface TestQuestion {
  id?: string;
  text?: string;
  options?: string[];
  points?: number;
  hint?: string;
}

export interface LessonTest {
  title?: string;
  test_type?: string;
  estimated_time_minutes?: number;
  questions?: TestQuestion[];
}

export interface PracticeAssignment {
  title?: string;
  description?: string;
  evaluation_criteria?: string[];
  passing_score?: number;
  allowed_extensions?: string[];
  submission_instructions?: string;
}

/** Результат проверки теста или практики. */
export interface AssessmentResult {
  score?: number | string;
  ai_feedback?: string;
  [key: string]: unknown;
}

/** Ответы на вопросы теста: индекс вопроса → выбранный вариант или текст. */
export type TestAnswers = Record<number, string | number>;
