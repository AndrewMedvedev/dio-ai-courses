from typing import Protocol

from uuid import UUID

from src.shared.application.repos import Repository
from src.shared.domain.entities import Entity


class ProgressRepository[ProgressT: Entity](Repository[ProgressT], Protocol):
    async def get_by_user(self, user_id: UUID, resource_id: UUID) -> ProgressT | None: ...

    async def exist_by_user(self, user_id: UUID, resource_id: UUID) -> bool: ...
