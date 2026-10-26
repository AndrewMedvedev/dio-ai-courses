import logging
from uuid import UUID

from ddf.application.dtos import Sort
from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from ddf.infra.database.sqlalchemy.utils import apply_sorting
from sqlalchemy import select

from src.courses.application.dtos import LessonTheorySessionFilters
from src.courses.domain.entities import (
    LessonTheorySession,
)

from ..mappers import LessonTheorySessionMapper
from ..models import LessonTheorySessionOrm

logger = logging.getLogger(__name__)


class SqlLessonTheorySessionRepository(
    SqlAlchemyRepository[LessonTheorySession, LessonTheorySessionOrm]
):
    model = LessonTheorySessionOrm
    data_mapper = LessonTheorySessionMapper()

    async def find_sessions(
        self,
        *,
        lesson_id: UUID,
        user_id: UUID,
        filters: LessonTheorySessionFilters | None = None,
        sort: Sort | None = None,
    ) -> list[LessonTheorySession]:
        stmt = select(self.model).where(
            self.model.lesson_id == lesson_id,
            self.model.user_id == user_id,
        )

        if filters:
            if filters.created_from:
                stmt = stmt.where(
                    self.model.created_at >= filters.created_from,
                )

            if filters.created_to:
                stmt = stmt.where(
                    self.model.created_at < filters.created_to,
                )

        stmt = apply_sorting(
            stmt,
            self.model,
            sort or Sort(field="created_at", direction="asc"),
        )

        result = await self._session.execute(stmt)

        return [self.data_mapper.from_model(model) for model in result.scalars().all()]
