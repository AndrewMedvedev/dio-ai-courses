from typing import Any

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from json import dumps
from uuid import UUID

from pymorphy3 import MorphAnalyzer
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.infrastructure import thread_executor, tokens_encoder
from ...llm_service import (
    BaseAgentMiddleware,
    LLMServiceProtocol,
    LLMTextResponse,
    LLMTextService,
    LLMTextServiceProtocol,
    Messages,
)
from ...llm_service.schemas import ToolCallParsed
from ..domain.entities import Chat
from ..infra.repository import SqlChatRepository

# Инициализация один раз

logger = logging.getLogger(__name__)

morph = MorphAnalyzer()


class SummarizationMiddleware(BaseAgentMiddleware):
    def __init__(self, system_prompt: str, number_of_tokens: int) -> None:
        self.number_of_tokens = number_of_tokens
        self.router = LLMTextService(system_prompt=system_prompt)

    async def before_model(
        self,
        service: LLMServiceProtocol,  # ruff:ignore[unused-method-argument]
        messages: list[dict],
    ) -> list[dict]:
        str_messages = dumps(messages)
        count_tokens = len(tokens_encoder.encode(text=str_messages))
        if count_tokens >= self.number_of_tokens:
            result = await self.router.invoke(messages=messages)
            return [{"role": "assistant", "content": result.raw_text}]
        return messages


class ToolCallLimitMiddleware(BaseAgentMiddleware):
    def __init__(self, tool_limits: dict[str, int]) -> None:
        self.tool_limits = tool_limits

    async def wrap_tool_call(
        self,
        service: LLMTextServiceProtocol,
        tool: ToolCallParsed,
        handler: Callable[[ToolCallParsed], Awaitable[dict]],
    ) -> dict:
        if tool.name in self.tool_limits:
            if self.tool_limits[tool.name] > 0:
                self.tool_limits[tool.name] -= 1
                return await super().wrap_tool_call(service, tool, handler)
            callable_func = service.tools[tool.name]  # pyright: ignore[reportOptionalSubscript]
            logger.info("The tool %s call has reached the limit", tool.name)
            return callable_func.to_tool_result(
                call_id=tool.call_id,
                result=f"The tool's call limit is exhausted, do not call again {tool.name}.",
            )
        return await super().wrap_tool_call(service, tool, handler)


class LemmatizationMiddleware(BaseAgentMiddleware):
    @staticmethod
    def normalize_text(text: str) -> str:
        if not text or not isinstance(text, str):
            return text

        # Быстрое извлечение слов
        words = re.findall(r"\w+", text.lower())

        lemmas = []
        for word in words:
            if len(word) <= 2:  # ruff:ignore[magic-value-comparison]
                lemmas.append(word)
                continue
            parsed = morph.parse(word)[0]
            lemmas.append(parsed.normal_form)

        return " ".join(lemmas)

    async def normalize_text_async(self, text: str) -> str:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            thread_executor,
            self.normalize_text,
            text,
        )

    async def process_conversation(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Основная функция"""
        processed = []
        texts = []

        for msg in messages:
            new_msg = msg.copy()

            if msg.get("role") in {"user", "assistant"} and isinstance(msg.get("content"), str):
                task = await self.normalize_text_async(msg["content"])
                texts.append((task, new_msg))
            else:
                processed.append(new_msg)

        if texts:
            for (new_msg, _), result in texts:
                new_msg["content"] = result
                processed.append(new_msg)

        return processed

    async def before_model(
        self,
        service: LLMTextServiceProtocol,  # ruff: ignore[unused-method-argument]
        messages: list[dict],
    ) -> list[dict]:
        return await self.process_conversation(messages)


class CheckpointMiddleware(BaseAgentMiddleware):
    def __init__(
        self,
        repo: SqlChatRepository,
        session: AsyncSession,
    ) -> None:
        self.repo = repo
        self.session = session

    async def _get_messages(self, user_id: UUID, course_id: UUID) -> list[dict] | None:
        chat = await self.repo.read(user_id=user_id, course_id=course_id)
        if chat is not None:
            return chat.messages
        return None

    async def _create_chat(self, chat: Chat) -> None:
        await self.repo.create(chat)
        await self.session.commit()

    async def _update_chat(self, chat: Chat) -> None:
        await self.repo.update(
            user_id=chat.user_id, course_id=chat.course_id, messages=chat.messages
        )
        await self.session.commit()

    async def before_model(
        self,
        service: LLMServiceProtocol,
        messages: Messages,
    ) -> list[dict[str, Any]]:
        messages = (
            [{"role": "user", "content": messages}] if isinstance(messages, str) else messages
        )
        schema = Chat(
            user_id=service.runtime.context.user_id,  # pyright: ignore[reportOptionalMemberAccess]
            course_id=service.runtime.context.course_id,  # pyright: ignore[reportOptionalMemberAccess]
            messages=messages,
        )
        saved_messages = await self._get_messages(
            user_id=schema.user_id,
            course_id=schema.course_id,
        )
        if saved_messages is not None:
            schema.replace_messages(saved_messages + messages)
            await self._update_chat(schema)
            return saved_messages + messages
        await self._create_chat(schema)
        return messages

    async def after_model(
        self,
        service: LLMServiceProtocol,
        response: LLMTextResponse,
    ) -> LLMTextResponse:
        chat = Chat(
            user_id=service.runtime.context.user_id,  # pyright: ignore[reportOptionalMemberAccess]
            course_id=service.runtime.context.course_id,  # pyright: ignore[reportOptionalMemberAccess]
            messages=service.runtime.messages,  # pyright: ignore[reportArgumentType, reportOptionalMemberAccess]
        )
        await self._update_chat(chat)
        return response
