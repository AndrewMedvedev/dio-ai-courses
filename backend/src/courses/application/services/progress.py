from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.domain.exceptions import AlreadyExistsError, NotFoundError

from ...application.repos import (
    CourseProgressRepository,
    LessonProgressRepository,
    ModuleProgressRepository,
)
from ...domain.entities import CourseProgress, LessonProgress, ModuleProgress


class LearningProgressService:
    """Создаёт, читает и обновляет прогресс текущего ученика."""

    def __init__(
        self,
        progress_repo: LessonProgressRepository,
        course_progress_repo: CourseProgressRepository,
        module_progress_repo: ModuleProgressRepository,
        session: AsyncSession,
    ) -> None:
        self._progress_repo = progress_repo
        self._course_progress_repo = course_progress_repo
        self._module_progress_repo = module_progress_repo
        self._session = session

    async def create_course_progress(self, user_id: UUID, course_id: UUID) -> CourseProgress:
        """Создаёт прогресс курса для записанного на него пользователя."""
        if await self._course_progress_repo.exists_by(user_id=user_id, course_id=course_id):
            raise AlreadyExistsError(f"Course progress for user {user_id} already exists")
        progress = await self._course_progress_repo.create(CourseProgress(user_id=user_id, course_id=course_id))
        await self._session.commit()
        return progress

    async def read_course_progress(self, user_id: UUID, course_id: UUID) -> CourseProgress:
        """Возвращает прогресс курса или сообщает, что запись не найдена."""
        progress = await self._course_progress_repo.read_by(user_id=user_id, course_id=course_id)
        if progress is None:
            raise NotFoundError("Course progress was not found")
        return progress

    async def update_course_progress(self, user_id: UUID, course_id: UUID, total_lessons: int) -> CourseProgress:
        progress = await self.read_course_progress(user_id, course_id)
        completed_lessons = await self._course_progress_repo.count_completed_lessons(progress.id)
        progress_percent = round(completed_lessons * 100 / total_lessons, 2) if total_lessons else 0
        progress = await self._course_progress_repo.update(progress.id, progress_percent=progress_percent)
        await self._session.commit()
        return progress

    async def create_module_progress(self, user_id: UUID, course_id: UUID, module_id: UUID) -> ModuleProgress:
        """Создаёт запись прогресса модуля внутри существующего прогресса курса."""
        if not await self._course_progress_repo.exists_by(user_id=user_id, course_id=course_id):
            raise NotFoundError("Course progress was not found")
        course_progress = await self._course_progress_repo.read_by(user_id=user_id, course_id=course_id)
        if course_progress is None:
            raise NotFoundError("Course progress was not found")
        progress = await self._module_progress_repo.create(
            ModuleProgress(course_progress_id=course_progress.id, module_id=module_id)
        )
        await self._session.commit()
        return progress

    async def create_lesson_progress(self, user_id: UUID, module_id: UUID, lesson_id: UUID) -> LessonProgress:
        """Создаёт запись прогресса урока внутри существующего прогресса модуля."""
        module_progress = await self._module_progress_repo.read_by(module_id=module_id, course_progress__user_id=user_id)
        if module_progress is None:
            raise NotFoundError("Module progress was not found")
        if await self._progress_repo.exists_by(module_progress_id=module_progress.id, lesson_id=lesson_id):
            raise AlreadyExistsError(f"Lesson progress for lesson {lesson_id} already exists")
        progress = await self._progress_repo.create(
            LessonProgress(module_progress_id=module_progress.id, lesson_id=lesson_id)
        )
        await self._session.commit()
        return progress

    async def read_lesson_progress(self, user_id: UUID, lesson_id: UUID) -> LessonProgress:
        """Возвращает прогресс урока или сообщает, что запись не найдена."""
        if not await self._progress_repo.exists_by(lesson_id=lesson_id, module_progress__course_progress__user_id=user_id):
            raise NotFoundError("Lesson progress was not found")
        progress = await self._progress_repo.read_by(lesson_id=lesson_id, module_progress__course_progress__user_id=user_id)
        if progress is None:
            raise NotFoundError("Lesson progress was not found")
        return progress

    async def update(self, user_id: UUID, lesson_id: UUID, theory_completed_at: datetime) -> LessonProgress:
        progress = await self.read_lesson_progress(user_id, lesson_id)
        progress = await self._progress_repo.update(progress.id, theory_completed_at=theory_completed_at)
        await self._session.commit()
        return progress
