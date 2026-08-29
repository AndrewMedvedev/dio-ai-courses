from typing import Any

import logging
from uuid import UUID

from sqlalchemy import select, update

from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository

from ....domain.entities import (
    Student,
)
from ...mappers import (
    StudentMapper,
)
from ...models import StudentOrm

logger = logging.getLogger(__name__)


class SqlStudentRepository(SqlAlchemyRepository[Student, StudentOrm]):
    model = StudentOrm
    model_mapper = StudentMapper  # pyright: ignore[reportAssignmentType]

    async def read(self, user_id: UUID, course_id: UUID) -> Student | None:
        """Получает существующую запись по идентификатору или заданным параметрам."""
        stmt = select(self.model).where(
            self.model.user_id == user_id,
            self.model.course_id == course_id,
        )
        result = await self._session.execute(stmt)
        model = result.scalar_one_or_none()
        return None if model is None else self.model_mapper.from_model(model)
