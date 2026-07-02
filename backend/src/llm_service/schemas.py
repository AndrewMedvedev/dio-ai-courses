from __future__ import annotations

from typing import Any, Literal

from openai.types.responses import ToolParam
from pydantic import BaseModel, Field


class ToolCallParsed(BaseModel):
    call_id: str
    name: str
    arguments: dict[str, Any]


class ParsedLLMResponse(BaseModel):
    """Полный парсинг ответа + вся история сообщений"""

    # Полная история для передачи дальше в модель
    messages: list[dict[str, Any]] = Field(
        default_factory=list,
        description="ПОЛНАЯ история: входные сообщения + ответы модели. Готово для следующего запроса.",  # noqa: E501
    )

    # Удобные поля для работы
    output_text: str | None = Field(None, description="Финальный текст ответа модели")
    tool_calls: list[ToolCallParsed] = Field(
        default_factory=list, description="Вызовы инструментов"
    )
    reasoning: dict[str, Any] | None = Field(None, description="Рассуждения модели")


class LLMRequest(BaseModel):
    input: str | list[dict]
    tools: list[ToolParam] | None = None
    instructions: str | None = None
    reasoning: Literal["low", "medium", "high"] | None = None
    temperature: float | None = None
    text: dict[str, Any] | None = None


class LLMResponse(BaseModel):
    """Структурированный результат парсинга ответа от Responses API"""

    output_text: dict | None = Field(None, description="Финальный текст ответа модели")
    tool_calls: list[ToolCallParsed] = Field(
        default_factory=list, description="Вызовы инструментов"
    )

    messages: list[dict[str, Any]] = Field(default_factory=list, description="Сообщения от модели")
