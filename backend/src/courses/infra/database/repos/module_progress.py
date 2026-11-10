from uuid import UUID

from sqlalchemy import exists, select

from src.courses.domain.learning.entities import ModuleProgress
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ..mappers import ModuleProgressMapper
from ..models import CourseOrm, CourseProgressOrm, ModuleProgressOrm


class SqlModuleProgressRepository(SqlAlchemyRepository[ModuleProgress, ModuleProgressOrm]):
    model = ModuleProgressOrm
    model_mapper = ModuleProgressMapper  # pyright: ignore[reportAssignmentType]

    async def get_by_user(self, user_id: UUID, resource_id: UUID) -> ModuleProgress | None:
        stmt = (
            select(self.model)
            .join(self.model.course_progress)
            .where(
                CourseProgressOrm.user_id == user_id,
                self.model.module_id == resource_id,
            )
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def exist_by_user(self, user_id: UUID, resource_id: UUID) -> bool:
        stmt = select(
            exists().where(
                self.model.course_progress.has(user_id=user_id),
                self.model.module_id == resource_id,
            )
        )
        return bool(await self._session.scalar(stmt))

    async def read_course_ownership(
        self,
        uid: UUID,
    ) -> tuple[UUID, UUID] | None:
        stmt = (
            select(
                CourseOrm.id.label("course_id"),
                CourseOrm.creator_id,
            )
            .select_from(self.model)
            .join(CourseProgressOrm, CourseProgressOrm.id == self.model.course_progress_id)
            .join(CourseOrm, CourseOrm.id == CourseProgressOrm.course_id)
            .where(self.model.id == uid)
        )

        row = (await self._session.execute(stmt)).one_or_none()

        return (row.course_id, row.creator_id) if row is not None else None
