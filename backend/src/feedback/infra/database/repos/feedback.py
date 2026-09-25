from typing import Literal

from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select, text

from src.shared.application.dtos import Page, Pagination
from src.shared.infra.database.repos.sqlalchemy import SqlAlchemyRepository, paginate

from ....domain.entities import Feedback
from ..mappers import FeedbackMapper
from ..models import FeedbackOrm


class SqlFeedbackRepository(SqlAlchemyRepository[Feedback, FeedbackOrm]):
    model = FeedbackOrm
    model_mapper = FeedbackMapper

    async def lock_user(self, user_id: UUID) -> None:
        """Блокирует создание отзывов пользователя до завершения транзакции."""
        lock_key = int.from_bytes(user_id.bytes[8:], "big", signed=True)
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(:key)"),
            {"key": lock_key},
        )

    async def count_recent_feedback(self, user_id: UUID, since: datetime) -> int:
        """Считает отзывы пользователя за указанный период."""
        stmt = select(func.count()).select_from(self.model).where(
            self.model.user_id == user_id,
            self.model.created_at >= since,
        )
        return int(await self._session.scalar(stmt) or 0)

    async def find(
        self,
        pagination: Pagination,
        rating: int | None = None,
        order: Literal["asc", "desc"] = "desc",
    ) -> Page[Feedback]:
        """Возвращает активные отзывы в заданном порядке по дате создания."""
        stmt = select(self.model).where(self.model.deleted_at.is_(None))
        if rating is not None:
            stmt = stmt.where(self.model.rating == rating)

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            mapper=self.model_mapper.from_model,
            sort=f"created_at:{order}",
        )
