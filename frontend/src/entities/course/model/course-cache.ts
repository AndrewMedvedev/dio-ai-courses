// Кеш курсов, модулей и уроков на время сессии и запись на курс.
import {
  fetchCourses,
  getCourseBasicInfo as fetchCourseBasicInfo,
  getLessonBasicInfo,
  getLessonTheory,
  getModuleBasicInfo,
} from '../api/course-api';
import { getMyCourses, signCourse } from '../api/members-api';
import type {
  ContentBlock,
  LearningBlock,
  LearningCourse,
  LearningLesson,
} from './types';

const ENROLLMENT_PAGE_SIZE = 100;
const courseCache = new Map<string, LearningCourse>();
const moduleCache = new Map<string, LearningBlock>();
const lessonCache = new Map<string, LearningLesson>();
const lessonTheoryCache = new Map<string, ContentBlock[]>();
const courseRequests = new Map<string, Promise<LearningCourse>>();
const moduleRequests = new Map<string, Promise<LearningBlock>>();
const lessonRequests = new Map<string, Promise<LearningLesson>>();
const theoryRequests = new Map<string, Promise<ContentBlock[]>>();

// StrictMode and different page consumers can request the same resource together.
// Share only an active request; a later explicit refresh still fetches new data.
function loadCached<T>(
  cache: Map<string, T>,
  requests: Map<string, Promise<T>>,
  id: string,
  refresh: boolean,
  load: () => Promise<T>,
  onLoad?: (value: T) => void,
): Promise<T> {
  const pending = requests.get(id);
  if (pending) return pending;
  if (!refresh && cache.has(id)) return Promise.resolve(cache.get(id)!);
  const request = load()
    .then((value) => {
      // An invalidation or a newer request must not be overwritten by this one.
      if (requests.get(id) === request) {
        cache.set(id, value);
        onLoad?.(value);
      }
      return value;
    })
    .finally(() => {
      if (requests.get(id) === request) requests.delete(id);
    });
  requests.set(id, request);
  return request;
}

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
    throw new Error('Курс не найден');
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
  if (courseId) {
    courseCache.delete(courseId);
    courseRequests.delete(courseId);
  }
  moduleIds.forEach((moduleId) => {
    moduleCache.delete(moduleId);
    moduleRequests.delete(moduleId);
  });
  lessonIds.forEach((lessonId) => {
    lessonCache.delete(lessonId);
    lessonTheoryCache.delete(lessonId);
    lessonRequests.delete(lessonId);
    theoryRequests.delete(lessonId);
  });
}

export function forgetLessonTheory(lessonId?: string | null): void {
  if (!lessonId) return;
  lessonCache.delete(lessonId);
  lessonTheoryCache.delete(lessonId);
  lessonRequests.delete(lessonId);
  theoryRequests.delete(lessonId);
}

export async function getCachedCourseBasicInfo(
  courseId?: string | null,
  refresh = false,
): Promise<LearningCourse> {
  if (!courseId) {
    return getCachedCourse();
  }
  return loadCached(courseCache, courseRequests, courseId, refresh, () =>
    fetchCourseBasicInfo(courseId, refresh ? { cache: 'no-store' } : {}),
  );
}

export async function getCourseLearningStructure(
  courseId?: string | null,
  refresh = false,
): Promise<LearningCourse> {
  let course = await getCachedCourseBasicInfo(courseId, refresh);
  const moduleRefs = course.blocks || [];
  const modules = new Array<LearningBlock>(moduleRefs.length);
  let next = 0;
  // Avoid a request waterfall, while keeping large courses bounded.
  await Promise.all(
    Array.from({ length: Math.min(6, moduleRefs.length) }, async () => {
      while (next < moduleRefs.length) {
        const index = next++;
        modules[index] = await getModuleById(moduleRefs[index].id, refresh);
      }
    }),
  );
  for (const module of modules) course = replaceModule(course, module);
  return rememberCourse(course);
}

export async function getModuleById(
  moduleId: string,
  refresh = false,
): Promise<LearningBlock> {
  return loadCached(
    moduleCache,
    moduleRequests,
    moduleId,
    refresh,
    () => getModuleBasicInfo(moduleId, refresh ? { cache: 'no-store' } : {}),
    (module) => {
      for (const [courseId, course] of courseCache.entries()) {
        if ((course.blocks || []).some((block) => block.id === moduleId)) {
          courseCache.set(courseId, replaceModule(course, module));
        }
      }
    },
  );
}

export async function getLessonById(
  lessonId: string,
  refresh = false,
): Promise<LearningLesson> {
  return loadCached(
    lessonCache,
    lessonRequests,
    lessonId,
    refresh,
    () => getLessonBasicInfo(lessonId, refresh ? { cache: 'no-store' } : {}),
    (lesson) => {
      for (const [courseId, course] of courseCache.entries()) {
        courseCache.set(courseId, replaceLessonInCourse(course, lesson));
      }
    },
  );
}

export async function getLessonContentBlocks(
  lessonId?: string | null,
  refresh = false,
): Promise<ContentBlock[]> {
  if (!lessonId) {
    return [];
  }

  return loadCached(
    lessonTheoryCache,
    theoryRequests,
    lessonId,
    refresh,
    () => getLessonTheory(lessonId, refresh ? { cache: 'no-store' } : {}),
    (contentBlocks) => {
      const lesson = lessonCache.get(lessonId);
      if (lesson) {
        lessonCache.set(lessonId, {
          ...lesson,
          contentBlocks,
        });
      }
    },
  );
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
    throw new Error('Невозможно записаться: идентификатор курса отсутствует');
  }

  return signCourse(courseId);
}
