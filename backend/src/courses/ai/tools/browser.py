from typing import Any

import logging

from ddgs import DDGS
from pydantic import BaseModel, Field

from src.courses.infra.browser_automation import (
    get_page_text,
)
from src.llm_service import tool

logger = logging.getLogger(__name__)


class BrowsePageInput(BaseModel):
    link: str = Field(description="Ссылка на страницу с которой нужно получить контент")


@tool(
    name="browse_page",
    description="Открывает WEB-страницу и возвращает текст вместе с URL источника",
)
async def browse_page(schema: BrowsePageInput) -> dict[str, str]:
    page_text = await get_page_text(schema.link)
    return {"source": schema.link, "text": page_text}


class SearchInput(BaseModel):
    search_query: str = Field(description="Запрос для поиска")


@tool(
    name="web_search",
    description="""\
    Выполняет поиск в интернете.
    Возвращает список найденных страниц с заголовками, URL и кратким описанием.
    Подходит для получения актуальной информации из интернета.
    Используй этот инструмент экономно.
    """,
)
async def web_search(schema: SearchInput) -> list[dict[str, Any]]:
    return DDGS().text(schema.search_query, region="ru-ru", max_results=10)
