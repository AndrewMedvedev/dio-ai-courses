from __future__ import annotations

from typing import Any, Literal, TypeVar

from collections.abc import Callable

from openai.types.responses import ToolParam
from pydantic import BaseModel, Field, NonNegativeInt, PositiveInt

R = TypeVar("R", bound=BaseModel)


class PageParams(BaseModel):
    """Параметры пагинации, которые приходят от клиента (query params)"""

    page: PositiveInt = Field(default=1, ge=1, description="Номер страницы, начинается с 1")
    size: PositiveInt = Field(
        default=10, ge=1, le=100, description="Размер страницы (количество элементов на странице"
    )

    @property
    def offset(self) -> int:
        """Смещение пагинации"""

        return (self.page - 1) * self.size


class Page[T: Any](BaseModel):
    """Полный ответ с пагинацией"""

    page: PositiveInt = Field(..., description="Текущая страница")
    size: PositiveInt = Field(..., description="Количество элементов на странице")
    total_items: NonNegativeInt = Field(..., description="Всего элементов на сервере")
    total_pages: NonNegativeInt = Field(..., description="Всего страниц")
    has_next: bool = Field(..., description="Есть ли следующая страница")
    has_prev: bool = Field(..., description="Есть ли предыдущая страница")
    items: list[T] = Field(default_factory=list, description="Полученные элементы")

    @classmethod
    def create(cls, items: list[T], total_items: int, page: int, size: int) -> Page[T]:
        return Page(
            page=page,
            size=size,
            total_items=total_items,
            total_pages=(total_items + size - 1) // size,
            has_next=page * size < total_items,
            has_prev=page > 1,
            items=items,
        )

    def to_response(self, mapper: Callable[[T], R]) -> Page[R]:
        """Преобразование страницы к API схеме ответа"""

        return Page(
            page=self.page,
            size=self.size,
            total_items=self.total_items,
            total_pages=self.total_pages,
            has_next=self.has_next,
            has_prev=self.has_prev,
            items=[mapper(item) for item in self.items],
        )


class InvokeLLM(BaseModel):
    input: str | list[dict]
    tools: list[ToolParam] | None = None
    instructions: str | None = None
    reasoning: Literal["low", "medium", "high"] | None = None
    temperature: float | None = None


class ToolCallParsed(BaseModel):
    call_id: str
    name: str
    arguments: dict[str, Any]


class LLMResponse(BaseModel):
    """Структурированный результат парсинга ответа от Responses API"""

    output_text: dict | None = Field(None, description="Финальный текст ответа модели")
    tool_calls: list[ToolCallParsed] = Field(
        default_factory=list, description="Вызовы инструментов"
    )
    reasoning: dict[str, Any] | None = Field(
        None, description="Цепочка рассуждений модели (если есть)"
    )
    messages: list[dict[str, Any]] = Field(default_factory=list, description="Сообщения от модели")
