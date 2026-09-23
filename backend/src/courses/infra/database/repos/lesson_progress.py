from sqlalchemy import update

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import LessonProgress
from ....domain.events import LessonProgressUpdated
from ...mappers import LessonProgressMapper
from ...models import LessonProgressOrm, ModuleProgressOrm


class SqlLessonProgressRepository(SqlAlchemyRepository[LessonProgress, LessonProgressOrm]):
    model = LessonProgressOrm
    model_mapper = LessonProgressMapper

    async def update_from_event(self, event: LessonProgressUpdated) -> None:
        """Обновляет прогресс урока по событию."""
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
        await self._session.execute(stmt)
