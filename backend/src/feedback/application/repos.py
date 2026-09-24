from typing import Protocol

from datetime import datetime
from uuid import UUID

from src.shared.application.dtos import Page, Pagination

from ..domain.entities import Feedback


class FeedbackRepository(Protocol):
    """Операции хранения, необходимые для отзывов о платформе."""

    async def create(self, feedback: Feedback) -> Feedback: ...

    async def lock_user(self, user_id: UUID) -> None: ...

    async def has_recent_feedback(self, user_id: UUID, since: datetime) -> bool: ...

    async def find(self, pagination: Pagination, rating: int | None = None) -> Page[Feedback]: ...
