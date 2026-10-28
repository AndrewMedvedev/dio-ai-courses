import type {
  BlockNode,
  CourseNode,
  LessonNode,
  PracticeNode,
} from "../model/tree";

export interface RouteSelection {
  courseId: string | null | undefined;
  blockId: string | null | undefined;
  lessonId: string | null | undefined;
  practiceId: string | null;
}

/** По адресу страницы определяет выбранные курс, модуль, урок и практику. */
export function getRouteState(
  pathname: string,
  courseList: CourseNode[] = [],
): RouteSelection {
  const segments = pathname.split("/").filter(Boolean);
  const defaultCourse: CourseNode = courseList[0] || {
    id: null,
    blocks: [],
  };
  let selectedCourse: CourseNode = defaultCourse;
  let selectedBlock: BlockNode = defaultCourse.blocks?.[0] || {
    id: null,
    lessons: [],
    practice: [],
  };
  let selectedLesson: LessonNode = selectedBlock.lessons?.[0] || { id: null };
  let selectedPractice: PracticeNode | null =
    selectedBlock.practice?.[0] ?? null;

  if (segments[0] === "course") {
    const courseId = segments[1];
    const course = courseList.find((item) => item.id === courseId);
    selectedCourse = course || { id: courseId || null, blocks: [] };
    selectedBlock = selectedCourse.blocks?.[0] || {
      id: null,
      lessons: [],
      practice: [],
    };
    selectedLesson = selectedBlock.lessons?.[0] || { id: null };
    selectedPractice = selectedBlock.practice?.[0] ?? null;

    if (course) {
      const routeModeOffset =
        segments[2] === "edit" || segments[2] === "metrics" ? 1 : 0;
      const contentTypeIndex = 2 + routeModeOffset;
      const contentIdIndex = 3 + routeModeOffset;

      if (segments[contentTypeIndex] === "block" && segments[contentIdIndex]) {
        const blockId = segments[contentIdIndex];
        const block = course.blocks!.find((item) => item.id === blockId);
        selectedBlock = block || {
          id: blockId,
          title: "Модуль не выбран",
          lessons: [],
          practice: [],
        };
        selectedLesson = selectedBlock.lessons?.[0] || { id: null };
        selectedPractice = selectedBlock.practice?.[0] ?? null;
      }

      if (
        (segments[contentTypeIndex] === "lesson" ||
          segments[contentTypeIndex] === "lessons") &&
        segments[contentIdIndex]
      ) {
        const lessonId = segments[contentIdIndex];
        const block = course.blocks!.find((item) =>
          item.lessons!.some((lesson) => lesson.id === lessonId),
        );
        if (block) {
          selectedBlock = block;
          selectedLesson =
            block.lessons!.find((lesson) => lesson.id === lessonId) ||
            block.lessons![0];
          selectedPractice = block.practice?.[0] ?? null;
        } else {
          selectedLesson = { id: lessonId };
        }
      }

      if (
        segments[contentTypeIndex] === "practice" &&
        segments[contentIdIndex]
      ) {
        const practiceId = segments[contentIdIndex];
        const block = course.blocks!.find((item) =>
          (item.practice || []).some((practice) => practice.id === practiceId),
        );
        if (block) {
          selectedBlock = block;
          selectedPractice =
            (block.practice || []).find(
              (practice) => practiceId === practice.id,
            ) ||
            block.practice?.[0] ||
            null;
          selectedLesson = block.lessons?.[0] || { id: null };
        } else {
          selectedPractice = { id: practiceId };
        }
      }
    }
  }

  return {
    courseId: selectedCourse.id,
    blockId: selectedBlock.id,
    lessonId: selectedLesson.id,
    practiceId: selectedPractice?.id ?? null,
  };
}
