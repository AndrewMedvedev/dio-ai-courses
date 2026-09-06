from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository
from src.shared.utils.time import current_datetime

from ....domain.entities import CourseProgress
from ...mappers import CourseProgressMapper
from ...models import CourseProgressOrm


class SqlCourseProgressRepository(
    SqlAlchemyRepository[CourseProgress, CourseProgressOrm]
):
    model = CourseProgressOrm
    model_mapper = CourseProgressMapper

    async def read(self, user_id: UUID, course_id: UUID) -> CourseProgress | None:
        stmt = select(self.model).where(
            self.model.user_id == user_id,
            self.model.course_id == course_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def create(self, user_id: UUID, course_id: UUID) -> CourseProgress:
        stmt = (
            insert(self.model)
            .values(user_id=user_id, course_id=course_id)
            .on_conflict_do_nothing(constraint="uq_course_progress_user_course")
            .returning(self.model)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is not None:
            return self.model_mapper.from_model(model)

        progress = await self.read(user_id, course_id)
        if progress is None:
            raise RuntimeError("Course progress was not found after creation")
        return progress

    async def mark_completed(self, progress_id: UUID) -> CourseProgress | None:
        stmt = (
            update(self.model)
            .where(
                self.model.id == progress_id,
                self.model.completed_at.is_(None),
            )
            .values(completed_at=current_datetime())
            .returning(self.model)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is not None:
            return self.model_mapper.from_model(model)

        model = await self._session.get(self.model, progress_id)
        return None if model is None else self.model_mapper.from_model(model)
