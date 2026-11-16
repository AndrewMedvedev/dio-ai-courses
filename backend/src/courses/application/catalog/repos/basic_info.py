from typing import Protocol

from uuid import UUID

from src.shared.application.repos import Repository
from src.shared.domain.entities import Entity


class BasicInfoProtocol[EntityT: Entity, BasicInfoT](Repository[EntityT], Protocol):
    async def get_by_id_basic_info(self, uid: UUID) -> BasicInfoT | None:
        """Возвращает краткую информацию о сущности без загрузки всех данных."""

    async def read_course_ownership(
        self,
        uid: UUID,
    ) -> tuple[UUID, UUID] | None: ...
