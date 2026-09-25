from typing import Protocol

from datetime import datetime
from uuid import UUID

from src.shared.application.dtos import Page, Pagination

from ..domain.entities import Feedback
from .dtos import FeedbackFilters


class FeedbackRepository(Protocol):
    """Операции хранения, необходимые для отзывов о платформе."""

    async def create(self, feedback: Feedback) -> Feedback: ...

    async def find(
        self,
        pagination: Pagination,
        filters: FeedbackFilters | None = None,
    ) -> Page[Feedback]: ...
