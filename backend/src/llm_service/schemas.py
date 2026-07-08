from __future__ import annotations

from typing import Any, Literal, TypeVar

from openai.types.responses import ToolParam
from pydantic import Base64Str, BaseModel, Field

T = TypeVar("T")
B = TypeVar("B", bound=BaseModel)


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


class LLMTextRequest(BaseModel):
    input: list[dict]
    tools: list[ToolParam] | None = None
    instructions: str | None = None
    reasoning: Literal["low", "medium", "high"] | None = None
    temperature: float | None = None
    text: dict[str, Any] | None = None

    @property
    def input_with_instructions(self) -> list[dict]:
        messages = self.input.copy()
        messages.append({"role": "system", "content": self.instructions})
        return messages


class LLMTextResponse(BaseModel):
    """Структурированный результат парсинга ответа от Responses API"""

    output_text: dict | None = Field(None, description="Финальный текст ответа модели")
    tool_calls: list[ToolCallParsed] = Field(
        default_factory=list, description="Вызовы инструментов"
    )

    messages: list[dict[str, Any]] = Field(default_factory=list, description="Сообщения от модели")
    model: str = Field(description="Идентификатор модели")
    total_tokens: int = Field(description="Количество токенов")


class LLMImageRequest(BaseModel):
    prompt: str
    quality: Literal["standard", "hd", "low", "medium", "high", "auto"] = "high"
    size: str
    output_format: str = "png"
    n: int = 1
    model: str = Field(description="Идентификатор модели")
    total_tokens: int = Field(description="Количество токенов")


class LLMImageResponse(BaseModel):
    """Структурированный результат парсинга ответа от Responses API"""

    size: str
    image: Base64Str = Field(description="Изображение в формате base64")
    model: str = Field(description="Идентификатор модели")
    total_tokens: int = Field(description="Количество токенов")


class Runtime[B: BaseModel, T](BaseModel):
    context: B
    state: T | None = None
    messages: list[dict[str, Any]] = Field(default_factory=list)
