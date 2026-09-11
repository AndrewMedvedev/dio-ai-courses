from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.application.dtos import Page, Pagination
from src.shared.domain.exceptions import ForbiddenError, NotFoundError

from ...application.repos import (
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
        module_repo: ModuleRepository,
        module_progress_repo: ModuleProgressRepository,
        lesson_repo: LessonRepository,
        student_repo: StudentRepository,
        session: AsyncSession,
    ) -> None:
        self._progress_repo = progress_repo
        self._course_progress_repo = course_progress_repo
        self._module_repo = module_repo
        self._module_progress_repo = module_progress_repo
        self._lesson_repo = lesson_repo
        self._student_repo = student_repo
        self._session = session

    async def create_course_progress(self, user_id: UUID, course_id: UUID) -> CourseProgress:
        """Создаёт прогресс курса для записанного на него пользователя."""
        await self._require_student(user_id, course_id)
        progress = await self._course_progress_repo.create(CourseProgress(user_id=user_id, course_id=course_id))
        await self._session.commit()
        return progress

    async def read_course_progress(self, course_progress_id: UUID) -> CourseProgress:
        """Возвращает прогресс курса или сообщает, что запись не найдена."""
        progress = await self._course_progress_repo.read(course_progress_id)
        if progress is None:
            raise NotFoundError("Course progress was not found")
        return progress

    async def get_course_students_progress(self,course_id: UUID,pagination: Pagination) -> Page[CourseProgress]:
        """Возвращает записи прогресса всех учеников указанного курса."""
        return await self._course_progress_repo.find_by_course(course_id, pagination)

    async def create_module_progress(self, course_progress_id: UUID, module_id: UUID) -> ModuleProgress:
        """Создаёт запись прогресса модуля внутри существующего прогресса курса."""
        course_progress = await self.read_course_progress(course_progress_id)
        progress = await self._module_progress_repo.create(ModuleProgress(course_progress_id=course_progress.id, module_id=module_id))
        await self._session.commit()
        return progress

    async def read_module_progress(self, module_progress_id: UUID) -> ModuleProgress:
        """Возвращает прогресс модуля или сообщает, что запись не найдена."""
        progress = await self._module_progress_repo.read(module_progress_id)
        if progress is None:
            raise NotFoundError("Module progress was not found")
        return progress

    async def create_lesson_progress(self, module_progress_id: UUID, lesson_id: UUID) -> LessonProgress:
        """Создаёт запись прогресса урока внутри существующего прогресса модуля."""
        module_progress = await self.read_module_progress(module_progress_id)
        progress = await self._progress_repo.create(LessonProgress(module_progress_id=module_progress.id, lesson_id=lesson_id))
        await self._session.commit()
        return progress

    async def read_lesson_progress(self, lesson_progress_id: UUID) -> LessonProgress:
        """Возвращает прогресс урока или сообщает, что запись не найдена."""
        progress = await self._progress_repo.read(lesson_progress_id)
        if progress is None:
            raise NotFoundError("Lesson progress was not found")
        return progress

    async def update(self, lesson_progress_id: UUID, theory_completed_at: datetime) -> LessonProgress:
        progress = await self._progress_repo.update(lesson_progress_id, theory_completed_at=theory_completed_at)
        await self._session.commit()
        return progress

    async def _require_student(self, user_id: UUID, course_id: UUID) -> None:
        """Проверяет, что пользователь записан на курс перед созданием его прогресса."""
        if await self._student_repo.read(user_id, course_id) is None:
            raise ForbiddenError("Only enrolled students can manage course progress")
