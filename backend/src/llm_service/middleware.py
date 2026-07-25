# middleware.py
from __future__ import annotations

from typing import Any

from abc import ABC
from collections.abc import Awaitable, Callable

from .schemas import (
    LLMImageResponse,
    LLMServiceProtocol,
    LLMTextResponse,
    LLMTextServiceProtocol,
    ToolCallParsed,
)

Response = LLMTextResponse | LLMImageResponse
Messages = list[dict[str, Any]] | str


class BaseAgentMiddleware(ABC):  # ruff:ignore[abstract-base-class-without-abstract-method]
    """
    Базовый класс миддлвари для LLMService.
    Переопределяйте только нужные хуки — остальные по умолчанию
    просто пропускают данные дальше без изменений (pass-through).
    """

    # --- срабатывает РОВНО ОДИН РАЗ за весь запуск invoke() ---
    async def before_agent(  # ruff: ignore[no-self-use]
        self,
        service: LLMServiceProtocol,  # ruff: ignore[unused-method-argument]
        messages: Messages,
    ) -> Messages:
        return messages

    async def after_agent(  # ruff: ignore[no-self-use]
        self,
        service: LLMServiceProtocol,  # ruff: ignore[unused-method-argument]
        response: Response,
    ) -> Response:
        return response

    # --- срабатывает перед/после КАЖДОГО вызова модели ---
    async def before_model(  # ruff: ignore[no-self-use]
        self,
        service: LLMServiceProtocol,  # ruff: ignore[unused-method-argument]
        messages: Messages,
    ) -> Messages:
        return messages

    async def after_model(  # ruff: ignore[no-self-use]
        self,
        service: LLMServiceProtocol,  # ruff: ignore[unused-method-argument]
        response: Response,
    ) -> Response:
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
