from datetime import timedelta
from uuid import UUID

from src.iam.domain.exceptions import PermissionDeniedError
from src.shared.application.dtos import Page, Pagination
from src.shared.application.transaction import Transaction
from src.shared.domain.exceptions import RateLimitExceededError
from src.shared.utils.time import current_datetime

from .application.repos import FeedbackRepository
from .domain.entities import Feedback


class FeedbackService:
    """Создаёт отзывы о платформе и выдаёт их администраторам."""

    def __init__(self, feedback_repo: FeedbackRepository, transaction: Transaction) -> None:
        self._feedback_repo = feedback_repo
        self._transaction = transaction

    async def create_feedback(
        self,
        *,
        user_id: UUID,
        email: str,
        rating: int,
        comment: str,
    ) -> Feedback:
        """Создаёт не более одного отзыва пользователя за сутки."""
        await self._feedback_repo.lock_user(user_id)
        since = current_datetime() - timedelta(days=1)
        if await self._feedback_repo.has_recent_feedback(user_id, since):
            raise RateLimitExceededError("Отзыв можно оставлять не чаще одного раза в сутки")

        feedback = Feedback.create(
            user_id=str(user_id),
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
        requester_roles: frozenset[str],
        rating: int | None = None,
    ) -> Page[Feedback]:
        """Возвращает список отзывов только администратору платформы."""
        if "admin" not in requester_roles:
            raise PermissionDeniedError("Список отзывов доступен только администратору")

        return await self._feedback_repo.find(pagination, rating=rating)
