from datetime import timedelta
from uuid import UUID

from src.iam.domain.vo import Email
from src.shared.application.dtos import Page, Pagination
from src.shared.application.transaction import Transaction
from src.shared.domain.exceptions import RateLimitExceededError
from src.shared.utils.time import current_datetime

from ..domain.constants import DAILY_FEEDBACK_LIMIT
from ..domain.entities import Feedback
from .dtos import FeedbackFilters
from .repos import FeedbackRepository


class FeedbackService:
    """Создаёт отзывы о платформе и выдаёт их администраторам."""

    def __init__(
        self,
        feedback_repo: FeedbackRepository,
        transaction: Transaction,
    ) -> None:
        self._feedback_repo = feedback_repo
        self._transaction = transaction

    async def create_feedback(
        self,
        *,
        user_id: UUID,
        email: Email,
        rating: int,
        comment: str,
    ) -> Feedback:
        filters = FeedbackFilters(
            user_id=user_id,
            created_after=current_datetime() - timedelta(days=1),
        )

        recent_feedbacks = await self._feedback_repo.find(
            Pagination(page=1, size=1),
            filters,
        )

        if recent_feedbacks.total >= DAILY_FEEDBACK_LIMIT:
            raise RateLimitExceededError(
                f"Можно оставить не более {DAILY_FEEDBACK_LIMIT} отзывов за сутки"
            )

        feedback = Feedback.create(
            user_id=user_id,
            email=email,
            rating=rating,
            comment=comment,
        )

        await self._feedback_repo.create(feedback)
        await self._transaction(feedback)

        return feedback

    async def get_feedbacks(
        self,
        *,
        pagination: Pagination,
        filters: FeedbackFilters | None = None,
    ) -> Page[Feedback]:
        """Возвращает список отзывов с фильтрацией и пагинацией."""

        return await self._feedback_repo.find(
            pagination,
            filters,
        )
