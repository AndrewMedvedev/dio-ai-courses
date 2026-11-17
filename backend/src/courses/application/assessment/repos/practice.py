from typing import Any, Protocol

from uuid import UUID

from src.courses.domain.assessment.entities import Practice
from src.shared.application.repos import Repository


class PracticeRepository(Repository[Practice], Protocol):
    async def read_by_module_lesson(
        self,
        user_id: UUID,
        module_id: UUID,
        lesson_id: UUID,
    ) -> Practice | None:
        """Получает практику по составному ключу пользователя, модуля и урока."""

    async def read_by_module(self, user_id: UUID, module_id: UUID) -> list[dict[str, Any]]:
        """Получает практики пользователя внутри модуля без служебных полей."""
        ...
