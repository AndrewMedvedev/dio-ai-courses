
from uuid import UUID

from ddf.application.dtos import Page, Pagination
from ddf.application.repositories import Repository

from ..domain.entities import Feedback
from .dtos import FeedbackFilters


class FeedbackRepository(Repository[Feedback]):
    """Операции хранения, необходимые для отзывов о платформе."""

    async def find_feedbacks(
        self,
        pagination: Pagination,
        filters: FeedbackFilters | None = None,
        *,
        user_id: UUID | None = None,
    ) -> Page[Feedback]: ...
