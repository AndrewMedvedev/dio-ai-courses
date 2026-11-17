from uuid import UUID

from sqlalchemy import select

from src.courses.domain.assessment.entities import Assignment
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ..mappers import AssignmentMapper
from ..models import AssignmentOrm


class SqlAssignmentRepository(SqlAlchemyRepository[Assignment, AssignmentOrm]):
    model = AssignmentOrm
    model_mapper = AssignmentMapper()

    async def read_for_update(self, uid: UUID) -> Assignment | None:
        stmt = (
            select(self.model)
            .where(self.model.id == uid, self.model.deleted_at.is_(None))
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)
