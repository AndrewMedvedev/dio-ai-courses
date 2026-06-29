from typing import Any

import logging
from uuid import UUID

from ddgs import DDGS
from langchain.tools import ToolRuntime, tool
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ..infra.repository import SqlDocumentRepository
from ..utils.browser_automation import get_page_text

logger = logging.getLogger(__name__)


class SearchInput(BaseModel):
    """Входные аргументы для поиска видео в RuTube"""

    search_query: str = Field(description="Запрос для поиска")


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


class DocumentContext(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    session: AsyncSession
    owner_id: UUID


@tool(
    "get_table_of_contents",
    description="Достает все оглавления загруженных документов пользователя по id пользователя",
)
async def get_table_of_contents(
    runtime: ToolRuntime[DocumentContext],
) -> str | list[dict]:
    answer = await SqlDocumentRepository(session=runtime.context.session).get_tocs(
        owner_id=runtime.context.owner_id
    )
    if answer is None:
        return "У пользователя нету документов"
    return [{"toc_id": model.id, "toc": model.title} for model in answer]  # type: ignore  # noqa: PGH003


@tool(
    "get_titles",
    description="Достает все заголовки документа по id оглавления",
)
async def get_titles(runtime: ToolRuntime[DocumentContext], toc_id: UUID) -> str | list[dict]:
    answer = await SqlDocumentRepository(session=runtime.context.session).get_headings(
        toc_id=toc_id
    )
    if answer is None:
        return "У пользователя нету документов"
    return [{"heading_id": model.id, "toc": model.title} for model in answer]  # type: ignore  # noqa: PGH003


@tool(
    "get_content",
    description="Достает текст документа по id заголовка",
)
async def get_content(runtime: ToolRuntime[DocumentContext], heading_id: UUID) -> str:
    answer = await SqlDocumentRepository(session=runtime.context.session).get_texts(
        heading_id=heading_id
    )
    if answer is None:
        return "У пользователя нету документов"
    return answer.content  # type: ignore  # noqa: PGH003
