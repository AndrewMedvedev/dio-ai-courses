from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.application.learning.dtos.progress import ModuleProgressResponse
from src.courses.application.learning.repos import (
    CourseProgressRepository,
    ModuleProgressRepository,
)
from src.courses.domain.learning.entities import ModuleProgress
from src.shared.domain.exceptions import AlreadyExistsError, NotFoundError


async def create(
    repo: ModuleProgressRepository,
    course_progress_repo: CourseProgressRepository,
    session: AsyncSession,
    user_id: UUID,
    course_id: UUID,
    module_id: UUID,
) -> ModuleProgressResponse:
    course_progress = await course_progress_repo.get_by_user(
        user_id,
        course_id,
    )
    if course_progress is None:
        raise NotFoundError("Course progress was not found")

    if await repo.exist_by_user(user_id, module_id):
        raise AlreadyExistsError(f"Module progress for module {module_id} already exists")

    progress = ModuleProgress(
        course_progress_id=course_progress.id,
        module_id=module_id,
    )
    await repo.create(progress)
    await session.commit()

    return map_to_response(progress)


def map_to_response(progress: ModuleProgress) -> ModuleProgressResponse:
    return ModuleProgressResponse.model_validate(
        progress,
        from_attributes=True,
    )
