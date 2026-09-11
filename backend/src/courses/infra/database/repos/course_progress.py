from uuid import UUID

from sqlalchemy import select

from src.shared.application.dtos import Page, Pagination
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository, paginate

from ....domain.entities import CourseProgress
from ...mappers import CourseProgressMapper
from ...models import CourseProgressOrm


class SqlCourseProgressRepository(
    SqlAlchemyRepository[CourseProgress, CourseProgressOrm]
):
    model = CourseProgressOrm
    model_mapper = CourseProgressMapper

    async def find_by_course(self, course_id: UUID, pagination: Pagination) -> Page[CourseProgress]:
        """Возвращает progress всех учеников курса для teacher endpoint."""
        stmt = select(self.model).where(self.model.course_id == course_id)
        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            mapper=self.model_mapper.from_model,
            sort="created_at:desc",
        )
