from typing import Any, Protocol

from uuid import UUID

from src.courses.domain.conversations.entities import Chat
from src.shared.application.repos import Repository


class ChatRepository(Repository[Chat], Protocol):
    async def read(self, user_id: UUID, course_id: UUID, chat_id: UUID) -> Chat | None:
        """Получает чат по составному ключу пользователя, курса и диалога."""

    async def update(
        self,
        chat_id: UUID,
        user_id: UUID,
        course_id: UUID,
        **kwargs: Any,
    ) -> Chat | None:
        """Обновляет чат пользователя внутри курса и возвращает актуальное состояние."""
