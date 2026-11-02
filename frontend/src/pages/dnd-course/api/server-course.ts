import {
  fetchCourseStatus,
  getCourseBasicInfo,
  getLessonTheory,
  getModuleBasicInfo,
} from "@/entities/course";
import type { RawApiRecord } from "@/shared/api";

function parseMinutes(duration: unknown): number | null {
  const match = /(\d+)/.exec(String(duration || ""));
  return match ? Number(match[1]) : null;
}

export type CourseStructure = Awaited<ReturnType<typeof fetchCourseStructure>>;

/** Курс с модулями и уроками так, как он лежит на сервере. */
export async function fetchCourseStructure(courseId: string) {
  const course = await getCourseBasicInfo(courseId);
  const modules = await Promise.all(
    (course.blocks || []).map(async (block, index) => {
      const full = await getModuleBasicInfo(block.id).catch(() => block);
      const lessons = [...(full.lessons || [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description || lesson.summary || "",
          order: lesson.order,
          learningObjectives: lesson.learningObjectives || lesson.learning_objectives || [],
          estimatedTimeMinutes: parseMinutes(lesson.duration),
        }));
      return {
        id: block.id,
        title: full.title || block.title,
        description: full.description || block.description || "",
        order: Number.isFinite(full.order) ? full.order : Number.isFinite(block.order) ? block.order : index + 1,
        learningObjectives: full.learningObjectives || [],
        lessons,
      };
    }),
  );
  modules.sort((a, b) => a.order - b.order);
  let status: string | null =
    typeof course.status === "string" && course.status ? course.status : null;
  try {
    status = (await fetchCourseStatus(courseId)).status || status;
  } catch {
    // статус виден только создателю курса — без него просто не показываем плашку
  }
  return { course, modules, status };
}

export async function fetchLessonBlocks(
  lessonId: string,
): Promise<RawApiRecord[]> {
  const blocks = await getLessonTheory(lessonId);
  return Array.isArray(blocks) ? blocks : [];
}
