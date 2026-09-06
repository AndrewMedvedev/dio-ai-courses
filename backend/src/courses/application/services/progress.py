from uuid import UUID

from src.shared.application.dtos import Page, Pagination
from src.shared.application.uow import UnitOfWork
from src.shared.domain.exceptions import ForbiddenError, NotFoundError

from ...application.dtos import (
    CourseProgressResponse,
    LessonProgressResponse,
    LessonProgressUpdateSchema,
    ModuleProgressResponse,
    StudentCourseProgressResponse,
)
from ...application.repos import (
    CourseRepository,
    CourseProgressRepository,
    LessonProgressRepository,
    LessonRepository,
    ModuleRepository,
    ModuleProgressRepository,
    StudentRepository,
)
from ...domain.entities import CourseProgress, LessonProgress, ModuleProgress


class LearningProgressService:
    """Управляет завершением уроков и формирует прогресс курса."""

    def __init__(
        self,
        progress_repo: LessonProgressRepository,
        course_progress_repo: CourseProgressRepository,
        course_repo: CourseRepository,
        module_repo: ModuleRepository,
        module_progress_repo: ModuleProgressRepository,
        lesson_repo: LessonRepository,
        student_repo: StudentRepository,
        uow: UnitOfWork,
    ) -> None:
        self._progress_repo = progress_repo
        self._course_progress_repo = course_progress_repo
        self._course_repo = course_repo
        self._module_repo = module_repo
        self._module_progress_repo = module_progress_repo
        self._lesson_repo = lesson_repo
        self._student_repo = student_repo
        self._uow = uow

    async def update_lesson_progress(
        self,
        user_id: UUID,
        course_id: UUID,
        lesson_id: UUID,
        schema: LessonProgressUpdateSchema,
    ) -> LessonProgress:
        """Сохраняет статусы частей урока, рассчитанные фронтендом."""
        progress, module_progress, course_progress = await self._get_or_create(
            user_id,
            course_id,
            lesson_id,
        )
        if schema.theory_completed and progress.theory_completed_at is None:
            progress = self._require_progress(
                await self._progress_repo.mark_theory_completed(module_progress.id, lesson_id)
            )
        if schema.practice_completed and progress.practice_completed_at is None:
            progress = self._require_progress(
                await self._progress_repo.mark_practice_completed(module_progress.id, lesson_id)
            )
        if schema.test_completed and progress.test_completed_at is None:
            progress = self._require_progress(
                await self._progress_repo.mark_test_completed(module_progress.id, lesson_id)
            )

        if self._all_lesson_parts_completed(progress):
            await self._complete_module_if_ready(module_progress)
            await self._complete_course_if_ready(course_progress)
        await self._uow.commit()
        return progress

    async def get_course_progress(
        self,
        user_id: UUID,
        course_id: UUID,
    ) -> CourseProgressResponse:
        """Возвращает прогресс пользователя по курсу."""
        course = await self._course_repo.get_by_id_basic_info(course_id)
        if course is None:
            raise NotFoundError(f"Course with id {course_id} not found")

        modules: list[ModuleProgressResponse] = []
        total_lessons = 0
        completed_lessons = 0
        course_progress = await self._course_progress_repo.read(user_id, course_id)
        for module_info in course.modules:
            module = await self._module_repo.get_by_id_basic_info(module_info.id)
            if module is None:
                continue

            lessons: list[LessonProgressResponse] = []
            module_progress = None
            if course_progress is not None:
                module_progress = await self._module_progress_repo.read(
                    course_progress.id,
                    module.id,
                )
            for lesson_info in module.lessons:
                progress = None
                if module_progress is not None:
                    progress = await self._progress_repo.read(module_progress.id, lesson_info.id)
                if progress is None:
                    lessons.append(
                        LessonProgressResponse(
                            lesson_id=lesson_info.id,
                            is_completed=False,
                        )
                    )
                    total_lessons += 1
                    continue

                total_lessons += 1
                if self._all_lesson_parts_completed(progress):
                    completed_lessons += 1
                lessons.append(self._to_lesson_response(progress))

            modules.append(
                ModuleProgressResponse(
                    module_id=module.id,
                    completed_at=None if module_progress is None else module_progress.completed_at,
                    is_completed=(
                        module_progress is not None
                        and module_progress.completed_at is not None
                    ),
                    lessons=lessons,
                )
            )

        progress_percent = round(completed_lessons * 100 / total_lessons) if total_lessons else 0
        return CourseProgressResponse(
            course_id=course_id,
            total_lessons=total_lessons,
            completed_lessons=completed_lessons,
            progress_percent=progress_percent,
            is_completed=(
                course_progress is not None and course_progress.completed_at is not None
            ),
            modules=modules,
        )

    async def get_course_students_progress(
        self,
        teacher_id: UUID,
        course_id: UUID,
        pagination: Pagination,
    ) -> Page[StudentCourseProgressResponse]:
        """Возвращает преподавателю прогресс учеников его курса."""
        course = await self._course_repo.read(course_id)
        if course is None:
            raise NotFoundError(f"Course with id {course_id} not found")
        if course.creator_id != teacher_id:
            raise ForbiddenError("Only the course creator can view students progress")

        students = await self._student_repo.find_by_course(course_id, pagination)
        items: list[StudentCourseProgressResponse] = []
        for student in students.items:
            progress = await self.get_course_progress(
                user_id=student.user_id,
                course_id=course_id,
            )
            items.append(
                StudentCourseProgressResponse(
                    user_id=student.user_id,
                    course_id=course_id,
                    total_lessons=progress.total_lessons,
                    completed_lessons=progress.completed_lessons,
                    progress_percent=progress.progress_percent,
                )
            )

        return Page.create(items, students.total, students.page, students.size)

    async def _complete_module_if_ready(
        self,
        module_progress: ModuleProgress,
    ) -> None:
        module = await self._module_repo.get_by_id_basic_info(module_progress.module_id)
        if module is None or not module.lessons:
            return

        for lesson in module.lessons:
            progress = await self._progress_repo.read(module_progress.id, lesson.id)
            if progress is None or not self._all_lesson_parts_completed(progress):
                return

        if module_progress.completed_at is None:
            await self._module_progress_repo.mark_completed(module_progress.id)

    async def _complete_course_if_ready(
        self,
        course_progress: CourseProgress,
    ) -> None:
        course = await self._course_repo.get_by_id_basic_info(course_progress.course_id)
        if course is None or not course.modules:
            return

        for module in course.modules:
            module_progress = await self._module_progress_repo.read(
                course_progress.id,
                module.id,
            )
            if module_progress is None or module_progress.completed_at is None:
                return

        if course_progress.completed_at is None:
            await self._course_progress_repo.mark_completed(course_progress.id)

    async def _get_or_create(
        self,
        user_id: UUID,
        course_id: UUID,
        lesson_id: UUID,
    ) -> tuple[LessonProgress, ModuleProgress, CourseProgress]:
        student = await self._student_repo.read(user_id, course_id)
        if student is None:
            raise ForbiddenError("Only enrolled students can update course progress")

        lesson = await self._lesson_repo.read(lesson_id)
        if lesson is None or lesson.module_id is None:
            raise NotFoundError(f"Lesson with id {lesson_id} not found")
        module = await self._module_repo.read(lesson.module_id)
        if module is None or module.course_id is None:
            raise NotFoundError(f"Module for lesson with id {lesson_id} not found")
        if module.course_id != course_id:
            raise NotFoundError(f"Lesson with id {lesson_id} does not belong to course {course_id}")

        course_progress = await self._course_progress_repo.read(user_id, course_id)
        if course_progress is None:
            course_progress = await self._course_progress_repo.create(user_id, course_id)

        module_progress = await self._module_progress_repo.read(course_progress.id, module.id)
        if module_progress is None:
            module_progress = await self._module_progress_repo.create(
                course_progress_id=course_progress.id,
                module_id=module.id,
            )

        progress = await self._progress_repo.read(module_progress.id, lesson_id)
        if progress is None:
            progress = await self._progress_repo.create(
                module_progress_id=module_progress.id,
                lesson_id=lesson_id,
            )
        return progress, module_progress, course_progress

    @staticmethod
    def _all_lesson_parts_completed(progress: LessonProgress) -> bool:
        return all(
            completed_at is not None
            for completed_at in (
                progress.theory_completed_at,
                progress.practice_completed_at,
                progress.test_completed_at,
            )
        )

    @staticmethod
    def _to_lesson_response(progress: LessonProgress) -> LessonProgressResponse:
        return LessonProgressResponse(
            lesson_id=progress.lesson_id,
            theory_completed_at=progress.theory_completed_at,
            practice_completed_at=progress.practice_completed_at,
            test_completed_at=progress.test_completed_at,
            is_completed=LearningProgressService._all_lesson_parts_completed(progress),
        )

    @staticmethod
    def _require_progress(result: LessonProgress | None) -> LessonProgress:
        if result is None:
            raise RuntimeError("Lesson progress was not found after creation")
        return result
