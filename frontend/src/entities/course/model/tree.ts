// Курс в состоянии приложения: дерево «курс → модули (blocks) → уроки».
// Объекты часто заполнены частично (заглушки, ответы разных ручек),
// поэтому все поля, кроме вложенности, необязательны.

export interface LessonNode {
  id?: string | null;
  title?: string;
  order?: number;
  [key: string]: unknown;
}

export interface PracticeNode {
  id?: string | null;
  title?: string;
  [key: string]: unknown;
}

export interface BlockNode {
  id?: string | null;
  title?: string;
  order?: number;
  lessons?: LessonNode[];
  practice?: PracticeNode[];
  [key: string]: unknown;
}

export interface CourseNode {
  id?: string | null;
  title?: string;
  blocks?: BlockNode[];
  [key: string]: unknown;
}
