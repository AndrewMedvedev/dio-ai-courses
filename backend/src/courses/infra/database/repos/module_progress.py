from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository
from src.shared.utils.time import current_datetime

from ....domain.entities import ModuleProgress
from ...mappers import ModuleProgressMapper
from ...models import ModuleProgressOrm


class SqlModuleProgressRepository(SqlAlchemyRepository[ModuleProgress, ModuleProgressOrm]):
    model = ModuleProgressOrm
    model_mapper = ModuleProgressMapper

    async def read(
        self,
        course_progress_id: UUID,
        module_id: UUID,
    ) -> ModuleProgress | None:
        stmt = select(self.model).where(
            self.model.course_progress_id == course_progress_id,
            self.model.module_id == module_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)

    async def create(
        self,
        course_progress_id: UUID,
        module_id: UUID,
    ) -> ModuleProgress:
        stmt = (
            insert(self.model)
            .values(course_progress_id=course_progress_id, module_id=module_id)
            .on_conflict_do_nothing(constraint="uq_module_progress_course_module")
            .returning(self.model)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        if model is not None:
            return self.model_mapper.from_model(model)

        progress = await self.read(course_progress_id, module_id)
        if progress is None:
            raise RuntimeError("Module progress was not found after creation")
        return progress

    async def mark_completed(self, progress_id: UUID) -> ModuleProgress | None:
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
