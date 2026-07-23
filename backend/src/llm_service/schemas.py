from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal, Protocol, TypeVar

if TYPE_CHECKING:
    from .middleware import BaseAgentMiddleware
from asyncio import Semaphore
from collections.abc import Sequence

from aiohttp import ClientSession
from openai.lib._pydantic import to_strict_json_schema  # ruff:ignore[import-private-name]
from openai.types.responses import ToolParam
from pydantic import Base64Str, BaseModel, ConfigDict, Field, TypeAdapter

from .dataclasses import StructuredTool

T = TypeVar("T")
B = TypeVar("B", bound=BaseModel)


class ToolCallParsed(BaseModel):
    call_id: str
    name: str
    arguments: dict[str, Any]


class LLMTextRequest(BaseModel):
    input: list[dict[str, Any]]
    tools: list[ToolParam] | None = None
    instructions: str | None = None
    reasoning: Literal["low", "medium", "high"] | None = None
    temperature: float | None = None
    text: dict[str, Any] | None = None

    def format_schema(self, schema: type[BaseModel]) -> None:
        self.text = {
            "format": {
                "type": "json_schema",
                "name": schema.__name__,
                "schema": to_strict_json_schema(TypeAdapter(schema)),
                "strict": True,
            }
        }


class LLMImageRequest(BaseModel):
    image: list[str] | None = Field(default=None, min_length=1, max_length=5)
    prompt: str
    quality: Literal["standard", "hd", "low", "medium", "high", "auto"] = "high"
    size: Literal["1024x1024", "1024x1536", "1536x1024"] | None = None
    output_format: str = "png"


class LLMTextResponse(BaseModel):
    """Структурированный результат парсинга ответа от Responses API"""

    output: dict[str, Any] | None = Field(None, description="Текст ответа модели в dict формате")
    raw_text: str | None = Field(
        None, description="Сырой текстовый ответ модели, если JSON не ожидался"
    )
    tool_calls: list[ToolCallParsed] = Field(
        default_factory=list, description="Вызовы инструментов"
    )

    messages: list[dict[str, Any]] = Field(default_factory=list, description="Сообщения от модели")
    model: str = Field(description="Идентификатор модели")
    total_tokens: int = Field(description="Количество токенов")


class LLMImageResponse(BaseModel):
    """Структурированный результат парсинга ответа от Responses API"""

    size: str
    image: Base64Str = Field(description="Изображение в формате base64")
    model: str = Field(description="Идентификатор модели")
    total_tokens: int = Field(description="Количество токенов")


class Runtime[B: BaseModel, T](BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    context: B
    state: T | None = None
    messages: list[dict[str, Any]] = Field(default_factory=list)


class LLMServiceProtocol(Protocol):
    session: ClientSession
    runtime: Runtime | None

    async def _send_request(
        self, schema: LLMImageRequest | LLMTextRequest
    ) -> LLMImageResponse | LLMTextResponse: ...

    async def invoke(self, *args, **kwargs) -> LLMImageResponse | LLMTextResponse: ...


class LLMTextServiceProtocol(LLMServiceProtocol):
    system_prompt: str | None
    tools: dict[str, StructuredTool] | None
    middlewares: Sequence[BaseAgentMiddleware] | None
    reasoning: Literal["low", "medium", "high"] | None
    temperature: float | None
    semaphore: Semaphore

    async def _process_tool(self, tool: ToolCallParsed) -> dict: ...

    async def _process_response(
        self,
        response: LLMTextResponse,
        schema: type[BaseModel] | None = None,
    ) -> LLMTextResponse: ...


class LLMImageServiceProtocol(LLMServiceProtocol): ...
