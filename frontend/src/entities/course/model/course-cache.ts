// Кеш курсов, модулей и уроков на время сессии и запись на курс.
import {
  fetchCourses,
  getCourseBasicInfo as fetchCourseBasicInfo,
  getLessonBasicInfo,
  getLessonTheory,
  getModuleBasicInfo,
} from "../api/course-api";
import { getMyCourses, signCourse } from "../api/members-api";
import type {
  ContentBlock,
  LearningBlock,
  LearningCourse,
  LearningLesson,
} from "./types";

const ENROLLMENT_PAGE_SIZE = 100;
const courseCache = new Map<string, LearningCourse>();
const moduleCache = new Map<string, LearningBlock>();
const lessonCache = new Map<string, LearningLesson>();
const lessonTheoryCache = new Map<string, ContentBlock[]>();

function replaceModule(
  course: LearningCourse,
  module: LearningBlock,
): LearningCourse {
  return {
    ...course,
    blocks: (course.blocks || []).map((block) =>
      block.id === module.id ? { ...block, ...module } : block,
    ),
  };
}

function replaceLessonInCourse(
  course: LearningCourse,
  lesson: LearningLesson,
): LearningCourse {
  return {
    ...course,
    blocks: (course.blocks || []).map((block) => ({
      ...block,
      lessons: (block.lessons || []).map((item) =>
        item.id === lesson.id ? { ...item, ...lesson } : item,
      ),
    })),
  };
}

function rememberCourse(course: LearningCourse): LearningCourse {
  if (course?.id) {
    courseCache.set(course.id, course);
  }
  return course;
}

export async function getCachedCourse(
  courseId?: string | null,
): Promise<LearningCourse> {
  if (courseId && courseCache.has(courseId)) {
    return courseCache.get(courseId) as LearningCourse;
  }

  const courses = await fetchCourses({ page: 1, size: 20 });
  courses.forEach(rememberCourse);
  const course = courseId
    ? courses.find((item) => item.id === courseId)
    : courses[0];

  if (!course) {
    throw new Error("Курс не найден");
  }

  return course;
}

// Сбрасывает кеш, чтобы после генерации или сохранения страницы курса
// загрузили свежие данные с backend.
export function forgetCourseCache(
  courseId?: string | null,
  moduleIds: string[] = [],
  lessonIds: string[] = [],
): void {
  if (courseId) courseCache.delete(courseId);
  moduleIds.forEach((moduleId) => moduleCache.delete(moduleId));
  lessonIds.forEach((lessonId) => {
    lessonCache.delete(lessonId);
    lessonTheoryCache.delete(lessonId);
  });
}

export function forgetLessonTheory(lessonId?: string | null): void {
  if (!lessonId) return;
  lessonCache.delete(lessonId);
  lessonTheoryCache.delete(lessonId);
}

export async function getCachedCourseBasicInfo(
  courseId?: string | null,
): Promise<LearningCourse> {
  if (!courseId) {
    return getCachedCourse();
  }
  if (courseCache.has(courseId)) {
    return courseCache.get(courseId) as LearningCourse;
  }
  return rememberCourse(await fetchCourseBasicInfo(courseId));
}

export async function getCourseLearningStructure(
  courseId?: string | null,
): Promise<LearningCourse> {
  const course = await getCachedCourseBasicInfo(courseId);
  for (const moduleRef of course.blocks || []) {
    if (!moduleCache.has(moduleRef.id)) {
      const module = await getModuleById(moduleRef.id);
      rememberCourse(
        replaceModule(courseCache.get(course.id) || course, module),
      );
    }
  }
  return courseCache.get(course.id) || course;
}

export async function getModuleById(moduleId: string): Promise<LearningBlock> {
  if (moduleCache.has(moduleId)) {
    return moduleCache.get(moduleId) as LearningBlock;
  }

  const module = await getModuleBasicInfo(moduleId);
  moduleCache.set(moduleId, module);
  for (const [courseId, course] of courseCache.entries()) {
    if ((course.blocks || []).some((block) => block.id === moduleId)) {
      courseCache.set(courseId, replaceModule(course, module));
    }
  }
  return module;
}

export async function getLessonById(lessonId: string): Promise<LearningLesson> {
  if (lessonCache.has(lessonId)) {
    return lessonCache.get(lessonId) as LearningLesson;
  }

  const lesson = await getLessonBasicInfo(lessonId);
  lessonCache.set(lessonId, lesson);
  for (const [courseId, course] of courseCache.entries()) {
    courseCache.set(courseId, replaceLessonInCourse(course, lesson));
  }
  return lesson;
}

export async function getLessonContentBlocks(
  lessonId?: string | null,
): Promise<ContentBlock[]> {
  if (!lessonId) {
    return [];
  }

  if (lessonTheoryCache.has(lessonId)) {
    return lessonTheoryCache.get(lessonId) as ContentBlock[];
  }

  const contentBlocks = await getLessonTheory(lessonId);
  lessonTheoryCache.set(lessonId, contentBlocks);

  const lesson = lessonCache.get(lessonId);
  if (lesson) {
    lessonCache.set(lessonId, {
      ...lesson,
      contentBlocks,
    });
  }

  return contentBlocks;
}

export async function isUserEnrolled(
  courseId?: string | null,
): Promise<boolean> {
  if (!courseId) {
    return false;
  }

  const courses = await getMyCourses({ page: 1, size: ENROLLMENT_PAGE_SIZE });
  return courses.items.some((course) => course.id === courseId);
}

export async function enrollUserToCourse(courseId?: string | null) {
  if (!courseId) {
    throw new Error("Невозможно записаться: идентификатор курса отсутствует");
  }

  return signCourse(courseId);
}
