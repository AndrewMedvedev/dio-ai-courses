from datetime import datetime
from uuid import UUID

from sqlalchemy import exists, select, text

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

    async def has_recent_feedback(self, user_id: UUID, since: datetime) -> bool:
        """Проверяет, оставлял ли пользователь отзыв после указанного времени."""
        stmt = select(
            exists().where(
                self.model.user_id == user_id,
                self.model.created_at >= since,
            )
        )
        return bool(await self._session.scalar(stmt))

    async def find(self, pagination: Pagination, rating: int | None = None) -> Page[Feedback]:
        """Возвращает активные отзывы по дате создания, новые первыми."""
        stmt = select(self.model).where(self.model.deleted_at.is_(None))
        if rating is not None:
            stmt = stmt.where(self.model.rating == rating)

        return await paginate(
            session=self._session,
            model=self.model,
            stmt=stmt,
            pagination=pagination,
            mapper=self.model_mapper.from_model,
            sort="created_at:desc",
        )
