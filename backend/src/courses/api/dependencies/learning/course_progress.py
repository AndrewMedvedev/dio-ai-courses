from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.application.learning.dtos.progress import CourseProgressResponse
from src.courses.application.learning.repos import CourseProgressRepository
from src.courses.domain.learning.entities import CourseProgress
from src.shared.domain.exceptions import AlreadyExistsError


async def create(
    repo: CourseProgressRepository,
    user_id: UUID,
    course_id: UUID,
    session: AsyncSession,
) -> CourseProgressResponse:
    if await repo.exist_by_user(user_id, course_id):
        raise AlreadyExistsError(f"Course progress for user {user_id} already exists")

    progress = CourseProgress(
        user_id=user_id,
        course_id=course_id,
        progress_percent=0,
    )
    await repo.create(progress)
    await session.commit()

    return map_to_response(progress)


async def update(
    repo: CourseProgressRepository,
    session: AsyncSession,
    progress: CourseProgress,
    total_lessons: int,
) -> CourseProgressResponse:
    completed_lessons = await repo.count_completed_lessons(progress.id)
    progress.progress_percent = (
        round(completed_lessons * 100 / total_lessons, 2) if total_lessons else 0
    )

    await repo.update(progress)
    await session.commit()

    return map_to_response(progress)


def map_to_response(progress: CourseProgress) -> CourseProgressResponse:
    return CourseProgressResponse.model_validate(
        progress,
        from_attributes=True,
    )
