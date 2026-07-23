# middleware.py
from __future__ import annotations

from typing import TypeVar

from abc import ABC
from collections.abc import Awaitable, Callable

from .schemas import (
    LLMImageResponse,
    LLMServiceProtocol,
    LLMTextResponse,
    LLMTextServiceProtocol,
    ToolCallParsed,
)

ResponseT = TypeVar("ResponseT", bound=LLMTextResponse | LLMImageResponse)


class BaseAgentMiddleware(ABC):  # ruff:ignore[abstract-base-class-without-abstract-method]
    """
    Базовый класс миддлвари для LLMService.
    Переопределяйте только нужные хуки — остальные по умолчанию
    просто пропускают данные дальше без изменений (pass-through).
    """

    # --- срабатывает РОВНО ОДИН РАЗ за весь запуск invoke() ---
    async def before_agent(self, service: LLMServiceProtocol, messages: list[dict]) -> list[dict]:  # ruff:ignore[no-self-use, unused-method-argument]
        return messages

    async def after_agent(self, service: LLMServiceProtocol, response: ResponseT) -> ResponseT:  # ruff:ignore[no-self-use, unused-method-argument]
        return response

    # --- срабатывает перед/после КАЖДОГО вызова модели ---
    async def before_model(self, service: LLMServiceProtocol, messages: list[dict]) -> list[dict]:  # ruff:ignore[no-self-use, unused-method-argument]
        return messages

    async def after_model(self, service: LLMServiceProtocol, response: ResponseT) -> ResponseT:  # ruff:ignore[no-self-use, unused-method-argument]
        return response

    # --- оборачивает КАЖДЫЙ вызов инструмента ---
    async def wrap_tool_call(  # ruff:ignore[no-self-use]
        self,
        service: LLMTextServiceProtocol,  # ruff:ignore[unused-method-argument]
        tool: ToolCallParsed,
        handler: Callable[[ToolCallParsed], Awaitable[dict]],
    ) -> dict:
        # по умолчанию просто вызываем следующий слой цепочки
        return await handler(tool)
