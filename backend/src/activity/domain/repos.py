from typing import Protocol

from uuid import UUID

from src.shared.schemas import Page, Pagination

from .dtos import ActivityLogFilters
from .models import ActivityLog


class ActivityLogRepository(Protocol):

    async def create_one(self, activity: ActivityLog) -> None: ...

    async def create_many(self, activities: list[ActivityLog]) -> None: ...

    async def get_for_aggregate(
            self,
            aggregate_type: str,
            aggregate_id: UUID,
            *,
            pagination: Pagination,
            filters: ActivityLogFilters | None = None,
    ) -> Page[ActivityLog]: ...
