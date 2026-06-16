from typing import Any

import logging

from ddgs import DDGS
from langchain.tools import tool
from pydantic import BaseModel, Field

from ..integrations import rutube, yandex_web_search
from ..utils.browser_automation import get_page_text

logger = logging.getLogger(__name__)


class SearchInput(BaseModel):
    """Входные аргументы для поиска видео в RuTube"""

    search_query: str = Field(description="Запрос для поиска")


@tool(
    "rutube_search",
    description="Выполняет поиск видео на платформе RuTube",
    args_schema=SearchInput,
)
async def rutube_search(search_query: str) -> list[dict[str, Any]]:
    return await rutube.search_videos(search_query)


@tool(
    "yandex_search",
    description="""\
    Выполняет поиск в Яндекс.
    Возвращает список найденных страниц с заголовками, URL и кратким описанием.
    Подходит для получения актуальной информации из интернета.
    Используй этот инструмент экономно.
    """,
    args_schema=SearchInput,
)
async def yandex_search(search_query: str) -> list[dict[str, Any]]:
    return await yandex_web_search.search_async(search_query)


class BrowsePageInput(BaseModel):
    link: str = Field(description="Ссылка на страницу с которой нужно получить контент")


@tool(
    "browse_page",
    description="Открывает WEB-страницу и получает её контент в формате Markdown",
    args_schema=BrowsePageInput,
)
async def browse_page(link: str) -> str:
    return await get_page_text(link)


@tool(
    "search_videos",
    description="Выполняет поиск видео в интернете с разных платформ",
    args_schema=SearchInput,
)
def search_videos(search_query: str) -> list[dict[str, Any]]:
    return DDGS().videos(search_query, region="ru-ru", max_results=10)


@tool(
    "web_search",
    description="""\
    Выполняет поиск в интернете.
    Возвращает список найденных страниц с заголовками, URL и кратким описанием.
    Подходит для получения актуальной информации из интернета.
    Используй этот инструмент экономно.
    """,
    args_schema=SearchInput,
)
def web_search(search_query: str) -> list[dict[str, Any]]:
    return DDGS().text(search_query, region="ru-ru", max_results=10)


@tool(
    "search_books",
    description="Выполняет поиск книг в интернете",
    args_schema=SearchInput,
)
def search_books(search_query: str) -> list[dict[str, Any]]:
    return DDGS().books(search_query, region="ru-ru", max_results=10)
