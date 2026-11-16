from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.application.learning.dtos.progress import LessonProgressResponse
from src.courses.application.learning.repos import (
    LessonProgressRepository,
    ModuleProgressRepository,
)
from src.courses.domain.learning.entities import LessonProgress
from src.shared.domain.exceptions import AlreadyExistsError, NotFoundError


async def create(
    repo: LessonProgressRepository,
    module_progress_repo: ModuleProgressRepository,
    session: AsyncSession,
    user_id: UUID,
    module_id: UUID,
    lesson_id: UUID,
) -> LessonProgressResponse:
    module_progress = await module_progress_repo.get_by_user(
        user_id,
        module_id,
    )
    if module_progress is None:
        raise NotFoundError("Module progress was not found")

    if await repo.exist_by_user(user_id, lesson_id):
        raise AlreadyExistsError(f"Lesson progress for lesson {lesson_id} already exists")

    progress = LessonProgress(
        module_progress_id=module_progress.id,
        lesson_id=lesson_id,
    )
    await repo.create(progress)
    await session.commit()

    return map_to_response(progress)


async def update(
    session: AsyncSession,
    repo: LessonProgressRepository,
    progress: LessonProgress,
    theory_completed_at: datetime,
) -> LessonProgressResponse:
    progress.theory_completed_at = theory_completed_at

    await repo.update(progress)
    await session.commit()

    return map_to_response(progress)


def map_to_response(progress: LessonProgress) -> LessonProgressResponse:
    return LessonProgressResponse.model_validate(
        progress,
        from_attributes=True,
    )
