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

    async def find_by_course(self, course_id: UUID) -> list[CourseProgress]:
        """Возвращает progress всех учеников курса для teacher endpoint."""
        stmt = select(self.model).where(self.model.course_id == course_id)
        result = await self._session.execute(stmt)
        return [self.model_mapper.from_model(model) for model in result.scalars().all()]
