import type { LessonProgress } from '@/entities/progress';

interface CourseLessons {
  blocks?: Array<{ lessons?: Array<{ id: string }> }>;
}

/** Use activity timestamps only when there is no valid saved visit. */
export function getResumeLessonId(
  course: CourseLessons | null | undefined,
  progress: Record<string, LessonProgress | null>,
  lastLessonId: string | null,
): string | null {
  const ids = (course?.blocks || []).flatMap((block) =>
    (block.lessons || []).map((lesson) => lesson.id),
  );
  if (lastLessonId && ids.includes(lastLessonId)) return lastLessonId;

  let latestLessonId: string | null = null;
  let latestTime = -Infinity;
  for (const id of ids) {
    const record = progress[id];
    if (!record) continue;
    const time = Math.max(
      0,
      ...[
        record.updatedAt,
        record.theoryCompletedAt,
        record.testCompletedAt,
        record.practiceCompletedAt,
      ].map((date) => Date.parse(date || '') || 0),
    );
    if (time >= latestTime) {
      latestLessonId = id;
      latestTime = time;
    }
  }
  return latestLessonId;
}
