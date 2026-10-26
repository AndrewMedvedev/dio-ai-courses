from uuid import UUID

from ddf.application.dtos import Page, Pagination, Sort
from ddf.infra.database.sqlalchemy.repository import SqlAlchemyRepository
from ddf.infra.database.sqlalchemy.utils import paginate
from sqlalchemy import select

from ....application.dtos import FeedbackFilters
from ....domain.entities import Feedback
from ..mappers import FeedbackMapper
from ..models import FeedbackOrm


class SqlFeedbackRepository(SqlAlchemyRepository[Feedback, FeedbackOrm]):
    model = FeedbackOrm
    data_mapper = FeedbackMapper()

    async def find_feedbacks(
        self,
        pagination: Pagination,
        filters: FeedbackFilters | None = None,
        *,
        user_id: UUID | None = None,
    ) -> Page[Feedback]:
        """Возвращает отзывы с применением фильтров."""

        stmt = select(self.model).where(self.model.deleted_at.is_(None))

        if user_id is not None:
            stmt = stmt.where(self.model.user_id == user_id)

        if filters:
            if filters.rating is not None:
                stmt = stmt.where(self.model.rating == filters.rating)

            if filters.created_after is not None:
                stmt = stmt.where(self.model.created_at >= filters.created_after)

            if filters.created_before is not None:
                stmt = stmt.where(self.model.created_at <= filters.created_before)

        sort = Sort(
            field="created_at",
            direction="asc" if filters and filters.sort == "created_at:asc" else "desc",
        )

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            from_model=self.data_mapper.from_model,
            sort=sort,
        )
