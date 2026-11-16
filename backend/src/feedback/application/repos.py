from uuid import UUID

from src.feedback.domain.entities import Feedback
from src.shared.application.dtos import Page, Pagination
from src.shared.application.repos import Repository

from .dtos import FeedbackFilters


class FeedbackRepository(Repository[Feedback]):
    """Операции хранения, необходимые для отзывов о платформе."""

    async def find(
        self,
        pagination: Pagination,
        filters: FeedbackFilters | None = None,
        *,
        user_id: UUID | None = None,
    ) -> Page[Feedback]: ...
