from uuid import UUID

from sqlalchemy import select

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import LessonProgress
from ...mappers import LessonProgressMapper
from ...models import CourseProgressOrm, LessonProgressOrm, ModuleProgressOrm


class SqlLessonProgressRepository(SqlAlchemyRepository[LessonProgress, LessonProgressOrm]):
    model = LessonProgressOrm
    model_mapper = LessonProgressMapper

    async def get_id_by_user_and_lesson(
        self,
        user_id: UUID,
        lesson_id: UUID,
    ) -> UUID | None:
        stmt = (
            select(self.model.id)
            .join(
                ModuleProgressOrm,
                self.model.module_progress_id == ModuleProgressOrm.id,
            )
            .join(
                CourseProgressOrm,
                ModuleProgressOrm.course_progress_id == CourseProgressOrm.id,
            )
            .where(
                CourseProgressOrm.user_id == user_id,
                self.model.lesson_id == lesson_id,
            )
        )
        return await self._session.scalar(stmt)
