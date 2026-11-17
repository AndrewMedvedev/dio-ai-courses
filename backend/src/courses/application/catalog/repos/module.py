from typing import Protocol

from uuid import UUID

from src.courses.application.catalog.dtos import BasicInfoDTO, ModuleBasicInfoDTO
from src.courses.application.catalog.repos import BasicInfoProtocol
from src.courses.domain.catalog.entities import Module


class ModuleRepository(BasicInfoProtocol[Module, ModuleBasicInfoDTO], Protocol):
    async def select_lessons_by_id_module(self, module_id: UUID) -> list[BasicInfoDTO]:
        """Выбирает краткие данные уроков, входящих в указанный модуль."""
        ...

    async def lock_courses(
        self,
        course_ids: set[UUID],
    ) -> None: ...

    async def find_rank_bounds(
        self,
        course_id: UUID,
        *,
        before_id: UUID | None = None,
        after_id: UUID | None = None,
        exclude_id: UUID | None = None,
    ) -> tuple[str | None, str | None]: ...
