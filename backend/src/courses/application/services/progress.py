from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.domain.exceptions import NotFoundError

from ...application.repos import (
    CourseProgressRepository,
    LessonProgressRepository,
    ModuleProgressRepository,
)
from ...domain.entities import CourseProgress, LessonProgress, ModuleProgress
from ...domain.events import LessonProgressUpdated


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
        progress = await self._course_progress_repo.create(CourseProgress(user_id=user_id, course_id=course_id))
        await self._session.commit()
        return progress

    async def read_course_progress(self, user_id: UUID, course_id: UUID) -> CourseProgress:
        """Возвращает прогресс курса или сообщает, что запись не найдена."""
        progress = await self._course_progress_repo.read_by_user_and_course(user_id, course_id)
        if progress is None:
            raise NotFoundError("Course progress was not found")
        return progress

    async def update_course_progress(self, user_id: UUID, course_id: UUID, total_lessons: int) -> CourseProgress:
        progress = await self.read_course_progress(user_id, course_id)
        progress_percent = await self._course_progress_repo.calculate_progress(progress.id, total_lessons)
        progress = await self._course_progress_repo.update(progress.id, progress_percent=progress_percent)
        await self._session.commit()
        return progress

    async def create_module_progress(self,user_id: UUID,course_id: UUID,module_id: UUID,) -> ModuleProgress:
        """Создаёт запись прогресса модуля внутри существующего прогресса курса."""
        course_progress = await self._course_progress_repo.read_by_user_and_course(user_id, course_id)
        if course_progress is None:
            raise NotFoundError("Course progress was not found")
        progress = await self._module_progress_repo.create(
            ModuleProgress(course_progress_id=course_progress.id, module_id=module_id)
        )
        await self._session.commit()
        return progress

    async def create_lesson_progress(self,user_id: UUID, module_id: UUID, lesson_id: UUID) -> LessonProgress:
        """Создаёт запись прогресса урока внутри существующего прогресса модуля."""
        module_progress = await self._module_progress_repo.read_by_user_and_module(user_id, module_id)
        if module_progress is None:
            raise NotFoundError("Module progress was not found")
        progress = await self._progress_repo.create(
            LessonProgress(module_progress_id=module_progress.id, lesson_id=lesson_id)
        )
        await self._session.commit()
        return progress

    async def read_lesson_progress(self, user_id: UUID, lesson_id: UUID) -> LessonProgress:
        """Возвращает прогресс урока или сообщает, что запись не найдена."""
        progress = await self._progress_repo.read_by_user_and_lesson(user_id, lesson_id)
        if progress is None:
            raise NotFoundError("Lesson progress was not found")
        return progress

    async def update(self, user_id: UUID, lesson_id: UUID, theory_completed_at: datetime) -> LessonProgress:
        progress = await self.read_lesson_progress(user_id, lesson_id)
        progress = await self._progress_repo.update(
            progress.id,
            theory_completed_at=theory_completed_at,
        )
        await self._session.commit()
        return progress

    async def handle_lesson_progress_updated(self, event: LessonProgressUpdated) -> None:
        """Обновляет прогресс урока и сохраняет процент курса после его полного прохождения."""
        await self._progress_repo.update_from_event(event)
        await self._session.commit()
