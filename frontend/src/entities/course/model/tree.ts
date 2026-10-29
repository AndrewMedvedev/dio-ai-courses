// Курс в состоянии приложения: дерево «курс → модули (blocks) → уроки».
// Объекты часто заполнены частично (заглушки, ответы разных ручек),
// поэтому все поля, кроме id и вложенности, необязательны.
import type { RawApiRecord } from "@/shared/api";

export interface LessonNode {
  id: string;
  title?: string;
  order?: number;
  duration?: string;
  summary?: string;
  description?: string;
  content?: string;
  markdown?: string;
  contentBlocks?: RawApiRecord[];
  content_blocks?: RawApiRecord[];
  learningObjectives?: string[];
  learning_objectives?: string[];
  [key: string]: unknown;
}

export interface PracticeNode {
  id: string;
  title?: string;
  markdown?: string;
  result?: string;
  duration?: string;
  [key: string]: unknown;
}

export interface BlockNode {
  id: string;
  title?: string;
  order?: number;
  description?: string;
  duration?: string;
  learningObjectives?: string[];
  learning_objectives?: string[];
  lessons: LessonNode[];
  practice: PracticeNode[];
  [key: string]: unknown;
}

export interface CourseNode {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  duration?: string;
  level?: string;
  difficulty?: string;
  format?: string;
  status?: string;
  tags?: string[];
  learningObjectives?: string[];
  learning_objectives?: string[];
  blocks: BlockNode[];
  [key: string]: unknown;
}
