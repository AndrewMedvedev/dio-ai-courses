from typing import Any, Protocol

from uuid import UUID

from src.courses.application.catalog.dtos import LessonBasicInfoDTO
from src.courses.application.catalog.repos import BasicInfoProtocol
from src.courses.domain.catalog.entities import Lesson
from src.courses.domain.catalog.vo import AnyContentBlock


class LessonRepository(BasicInfoProtocol[Lesson, LessonBasicInfoDTO], Protocol):
    async def get_content_blocks_by_id(self, lesson_id: UUID) -> list[AnyContentBlock] | None:
        """Получает контент-блоки урока для отображения или редактирования."""

    async def replace_content_block(
        self,
        lesson_id: UUID,
        block_index: int,
        new_block: dict[str, Any],
    ) -> None:
        """Заменяет контент-блок урока, чтобы сохранить результат редактирования."""

    async def lock_modules(
        self,
        module_ids: set[UUID],
    ) -> None: ...

    async def find_rank_bounds(
        self,
        module_id: UUID,
        *,
        before_id: UUID | None = None,
        after_id: UUID | None = None,
        exclude_id: UUID | None = None,
    ) -> tuple[str | None, str | None]: ...
