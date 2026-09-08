from uuid import UUID

from sqlalchemy import select

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import CourseProgress
from ...mappers import CourseProgressMapper
from ...models import CourseProgressOrm


class SqlCourseProgressRepository(
    SqlAlchemyRepository[CourseProgress, CourseProgressOrm]
):
    model = CourseProgressOrm
    model_mapper = CourseProgressMapper

    async def get_by_user_and_course(
        self,
        user_id: UUID,
        course_id: UUID,
    ) -> CourseProgress | None:
        stmt = select(self.model).where(
            self.model.user_id == user_id,
            self.model.course_id == course_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def find_by_course(self, course_id: UUID) -> list[CourseProgress]:
        stmt = select(self.model).where(self.model.course_id == course_id)
        result = await self._session.execute(stmt)
        return [self.model_mapper.from_model(model) for model in result.scalars().all()]
