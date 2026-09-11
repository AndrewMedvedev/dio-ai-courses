from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import LessonProgress
from ....domain.events import LessonProgressUpdated
from ...mappers import LessonProgressMapper
from ...models import LessonProgressOrm, ModuleProgressOrm


class SqlLessonProgressRepository(SqlAlchemyRepository[LessonProgress, LessonProgressOrm]):
    model = LessonProgressOrm
    model_mapper = LessonProgressMapper


async def handle_lesson_progress_updated(
    event: LessonProgressUpdated,
    session: AsyncSession,
) -> None:
    stmt = (
        update(LessonProgressOrm)
        .where(
            LessonProgressOrm.lesson_id == event.lesson_id,
            LessonProgressOrm.module_progress.has(
                ModuleProgressOrm.course_progress.has(user_id=event.user_id)
            ),
        )
        .values(**event.progress.model_dump(exclude_none=True))
    )
    await session.execute(stmt)
    await session.commit()
