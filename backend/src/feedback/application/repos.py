from typing import Literal, Protocol

from datetime import datetime
from uuid import UUID

from src.shared.application.dtos import Page, Pagination

from ..domain.entities import Feedback


class FeedbackRepository(Protocol):
    """Операции хранения, необходимые для отзывов о платформе."""

    async def create(self, feedback: Feedback) -> Feedback: ...

    async def lock_user(self, user_id: UUID) -> None: ...

    async def count_recent_feedback(self, user_id: UUID, since: datetime) -> int: ...

    async def find(
        self,
        pagination: Pagination,
        rating: int | None = None,
        order: Literal["asc", "desc"] = "desc",
    ) -> Page[Feedback]: ...
