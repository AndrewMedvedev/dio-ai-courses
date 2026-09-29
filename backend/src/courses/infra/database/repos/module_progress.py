from uuid import UUID

from sqlalchemy import exists, select

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import ModuleProgress
from ...mappers import ModuleProgressMapper
from ...models import CourseProgressOrm, ModuleProgressOrm


class SqlModuleProgressRepository(SqlAlchemyRepository[ModuleProgress, ModuleProgressOrm]):
    model = ModuleProgressOrm
    model_mapper = ModuleProgressMapper

    async def read_by_user_and_module(self, user_id: UUID, module_id: UUID) -> ModuleProgress | None:
        stmt = (
            select(self.model)
            .join(self.model.course_progress)
            .where(
                CourseProgressOrm.user_id == user_id,
                self.model.module_id == module_id,
            )
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def exists_by_course_progress_and_module(self, course_progress_id: UUID, module_id: UUID) -> bool:
        stmt = select(
            exists().where(
                self.model.course_progress_id == course_progress_id,
                self.model.module_id == module_id,
            )
        )
        return bool(await self._session.scalar(stmt))
