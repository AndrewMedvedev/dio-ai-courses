from datetime import datetime
from uuid import UUID

from src.shared.application.uow import UnitOfWork
from src.shared.domain.exceptions import ForbiddenError, NotFoundError
from src.shared.utils.time import current_datetime

from ...application.repos import (
    CourseRepository,
    CourseProgressRepository,
    LessonProgressRepository,
    LessonRepository,
    ModuleProgressRepository,
    ModuleRepository,
    StudentRepository,
)
from ...domain.entities import CourseProgress, LessonProgress, ModuleProgress


class LearningProgressService:
    """Создаёт, читает и обновляет прогресс текущего ученика."""

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

    async def create_course_progress(
        self,
        user_id: UUID,
        course_id: UUID,
    ) -> CourseProgress:
        await self._require_student(user_id, course_id)
        progress = await self._course_progress_repo.create(
            CourseProgress(user_id=user_id, course_id=course_id)
        )
        await self._uow.commit()
        return progress

    async def read_course_progress(
        self,
        course_progress_id: UUID,
    ) -> CourseProgress:
        progress = await self._course_progress_repo.read(course_progress_id)
        if progress is None:
            raise NotFoundError("Course progress was not found")
        return progress

    async def get_course_students_progress(
        self,
        teacher_id: UUID,
        course_id: UUID,
    ) -> list[CourseProgress]:
        course = await self._course_repo.read(course_id)
        if course is None:
            raise NotFoundError(f"Course with id {course_id} not found")
        if course.creator_id != teacher_id:
            raise ForbiddenError("Only the course creator can view students progress")
        return await self._course_progress_repo.find_by_course(course_id)

    async def create_module_progress(
        self,
        course_progress_id: UUID,
        module_id: UUID,
    ) -> ModuleProgress:
        course_progress = await self.read_course_progress(course_progress_id)
        module = await self._module_repo.read(module_id)
        if module is None:
            raise NotFoundError(f"Module with id {module_id} not found")
        if module.course_id != course_progress.course_id:
            raise ValueError("Module does not belong to the course progress")

        progress = await self._module_progress_repo.create(
            ModuleProgress(
                course_progress_id=course_progress.id,
                module_id=module_id,
            )
        )
        await self._uow.commit()
        return progress

    async def read_module_progress(
        self,
        module_progress_id: UUID,
    ) -> ModuleProgress:
        progress = await self._module_progress_repo.read(module_progress_id)
        if progress is None:
            raise NotFoundError("Module progress was not found")
        return progress

    async def create_lesson_progress(
        self,
        module_progress_id: UUID,
        lesson_id: UUID,
    ) -> LessonProgress:
        module_progress = await self.read_module_progress(module_progress_id)
        lesson = await self._lesson_repo.read(lesson_id)
        if lesson is None:
            raise NotFoundError(f"Lesson with id {lesson_id} not found")
        if lesson.module_id != module_progress.module_id:
            raise ValueError("Lesson does not belong to the module progress")

        progress = await self._progress_repo.create(
            LessonProgress(
                module_progress_id=module_progress.id,
                lesson_id=lesson_id,
            )
        )
        await self._uow.commit()
        return progress

    async def read_lesson_progress(
        self,
        lesson_progress_id: UUID,
    ) -> LessonProgress:
        progress = await self._progress_repo.read(lesson_progress_id)
        if progress is None:
            raise NotFoundError("Lesson progress was not found")
        return progress

    async def mark_lesson_theory_completed(
        self,
        lesson_progress_id: UUID,
    ) -> LessonProgress:
        progress = await self.read_lesson_progress(lesson_progress_id)
        if progress.theory_completed_at is None:
            progress = self._require_progress(
                await self._progress_repo.update(
                    progress.id,
                    theory_completed_at=current_datetime(),
                )
            )
            await self._uow.commit()
        return progress

    async def mark_lesson_assessments_completed(
        self,
        lesson_progress_id: UUID,
        practice_completed_at: datetime | None = None,
        test_completed_at: datetime | None = None,
    ) -> None:
        updates = {
            field: completed_at
            for field, completed_at in {
                "practice_completed_at": practice_completed_at,
                "test_completed_at": test_completed_at,
            }.items()
            if completed_at is not None
        }
        if not updates:
            return

        progress = await self._progress_repo.update(lesson_progress_id, **updates)
        if progress is None:
            raise NotFoundError("Lesson progress was not found")
        await self._uow.commit()

    async def _require_student(self, user_id: UUID, course_id: UUID) -> None:
        if await self._student_repo.read(user_id, course_id) is None:
            raise ForbiddenError("Only enrolled students can manage course progress")

    @staticmethod
    def _require_progress(progress: LessonProgress | None) -> LessonProgress:
        if progress is None:
            raise RuntimeError("Lesson progress was not found after update")
        return progress
