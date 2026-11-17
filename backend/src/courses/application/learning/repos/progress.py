from typing import Protocol

from uuid import UUID

from ddf.application.repositories import Repository
from ddf.domain.models import Entity


class ProgressRepository[ProgressT: Entity](Repository[ProgressT], Protocol):
    async def get_by_user(self, user_id: UUID, resource_id: UUID) -> ProgressT | None: ...

    async def exist_by_user(self, user_id: UUID, resource_id: UUID) -> bool: ...
