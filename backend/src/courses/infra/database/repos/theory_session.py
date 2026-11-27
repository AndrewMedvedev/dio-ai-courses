import logging
from uuid import UUID

from ddf.application.dtos.sorting import Sort, parse_sort_query_param
from ddf.infra.database.sqlalchemy import SqlAlchemyRepository
from ddf.infra.database.sqlalchemy.utils import apply_sorting
from sqlalchemy import select

from src.courses.application.learning.dtos.theory_session import LessonTheorySessionFilters
from src.courses.domain.learning.entities import (
    LessonTheorySession,
)

from ..mappers import LessonTheorySessionMapper
from ..models import LessonTheorySessionOrm

logger = logging.getLogger(__name__)


class SqlLessonTheorySessionRepository(
    SqlAlchemyRepository[LessonTheorySession, LessonTheorySessionOrm]
):
    model = LessonTheorySessionOrm
    data_mapper = LessonTheorySessionMapper

    async def find(
        self,
        *,
        lesson_id: UUID,
        user_id: UUID,
        filters: LessonTheorySessionFilters | None = None,
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

        sort = (
            parse_sort_query_param(filters.sort)
            if filters and filters.sort
            else Sort(field="created_at", direction="asc")
        )
        stmt = apply_sorting(stmt, self.model, sort)

        result = await self._session.execute(stmt)

        return [self.data_mapper.from_model(model) for model in result.scalars().all()]
