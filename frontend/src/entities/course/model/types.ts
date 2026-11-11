import type { PageParams, RawApiRecord } from "@/shared/api";

export type { PageParams, RawApiRecord };

export type ContentType =
  | "text"
  | "video"
  | "image"
  | "program_code"
  | "mermaid"
  | "quiz"
  | "math_formula"
  | "chemical_formula"
  | "musical_notation";

export interface QuizQuestion {
  question: string;
  options?: unknown[];
  answer: unknown;
  explanation?: string;
}

/** Контент-блок урока (формат бэкенда, snake_case). */
export interface ContentBlock {
  content_type: ContentType | string;
  ai_generated?: boolean;
  md_content?: string;
  image_id?: string;
  url?: string;
  description?: string;
  language?: string;
  code?: string;
  explanation?: string;
  title?: string;
  questions?: unknown[];
  formula?: string;
  sources?: unknown[];
  [key: string]: unknown;
}

export interface LearningLesson {
  id: string;
  title: string;
  duration: string;
  summary: string;
  description: string;
  content: string;
  markdown: string;
  contentBlocks: ContentBlock[];
  content_blocks: ContentBlock[];
  order: number;
  learningObjectives: string[];
  learning_objectives: string[];
  [key: string]: unknown;
}

/** Практическое задание модуля (с backend пока не приходит, список пустой). */
export interface LearningPractice {
  id: string;
  title?: string;
  [key: string]: unknown;
}

/** Модуль курса. В интерфейсе исторически называется «блок». */
export interface LearningBlock {
  id: string;
  title: string;
  description: string;
  order: number;
  duration: string;
  learningObjectives: string[];
  learning_objectives: string[];
  lessons: LearningLesson[];
  practice: LearningPractice[];
  [key: string]: unknown;
}

export interface LearningCourse {
  id: string;
  title: string;
  category: string;
  description: string;
  duration: string;
  level: string;
  difficulty: string;
  format: string;
  tags: string[];
  learningObjectives: string[];
  learning_objectives: string[];
  blocks: LearningBlock[];
  modules: LearningBlock[];
  [key: string]: unknown;
}

export interface CoursesPage {
  items: LearningCourse[];
  page: number;
  size: number;
  total: number;
  total_pages: number;
  pages: number;
  has_next: boolean;
  has_prev: boolean;
  [key: string]: unknown;
}

export interface CourseStatusResult {
  raw: unknown;
  status: string;
}
