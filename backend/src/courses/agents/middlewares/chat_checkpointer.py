# pyright: reportOptionalMemberAccess=false, reportOptionalSubscript=false, reportOptionalMemberAccess=false, reportArgumentType=false


from typing import Any

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.courses.application.dtos import Chat as ChatSchema
from src.courses.application.repos import ChatRepository
from src.courses.domain.entities import Chat
from src.llm_service import (
    LLMServiceProtocol,
    LLMTextResponse,
    Messages,
)

from .base_checkpointer import BaseSqlCheckpointer

logger = logging.getLogger(__name__)


class ChatCheckpointerMiddleware(BaseSqlCheckpointer[Chat, ChatSchema]):
    def __init__(
        self,
        repo: ChatRepository,
        session: AsyncSession,
    ) -> None:
        super().__init__(repo=repo, session=session)

    async def before_agent(
        self,
        service: LLMServiceProtocol,
        messages: Messages,
    ) -> list[dict[str, Any]]:
        """Достает историю чата перед циклом обработки запроса."""
        messages = (
            [{"role": "user", "content": messages}] if isinstance(messages, str) else messages
        )
        schema = Chat(
            id=service.runtime.state.chat_id,
            user_id=service.runtime.context.user_id,
            course_id=service.runtime.context.course_id,
            messages=messages,
        )
        data = await self._read(
            user_id=schema.user_id,
            course_id=schema.course_id,
            chat_id=service.runtime.state.chat_id,
        )
        if data is not None:
            return data.messages + messages
        await self._create(schema)
        return messages

    async def after_model(
        self,
        service: LLMServiceProtocol,
        response: LLMTextResponse,
    ) -> LLMTextResponse:
        """Обновляет сообщения после ответа модели."""
        messages = []

        for message in response.messages:
            role = message.get("role")
            if role in {"user", "assistant"}:
                messages.append(message)

        await self._update(
            chat_id=service.runtime.state.chat_id,
            user_id=service.runtime.context.user_id,
            course_id=service.runtime.context.course_id,
            messages=messages,
        )
        return response
