from typing import Any

import logging
from uuid import UUID

from ddgs import DDGS
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...llm_service import Runtime, tool
from ..infra.repository import SqlDocumentRepository
from ..utils.browser_automation import get_page_text

logger = logging.getLogger(__name__)


class SearchInput(BaseModel):
    """Входные аргументы для поиска видео в RuTube"""

    search_query: str = Field(description="Запрос для поиска")


class BrowsePageInput(BaseModel):
    link: str = Field(description="Ссылка на страницу с которой нужно получить контент")


@tool(  # pyright: ignore[reportCallIssue]
    name="browse_page",
    description="Открывает WEB-страницу и получает её контент в формате Markdown",
)
async def browse_page(schema: BrowsePageInput) -> str:
    return await get_page_text(schema.link)


@tool(  # pyright: ignore[reportCallIssue]
    name="web_search",
    description="""\
    Выполняет поиск в интернете.
    Возвращает список найденных страниц с заголовками, URL и кратким описанием.
    Подходит для получения актуальной информации из интернета.
    Используй этот инструмент экономно.
    """,
)
async def web_search(schema: SearchInput) -> list[dict[str, Any]]:  # ruff:ignore[unused-async]
    return DDGS().text(schema.search_query, region="ru-ru", max_results=10)


class DocumentContext(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    session: AsyncSession
    owner_id: UUID


@tool(  # pyright: ignore[reportCallIssue]
    name="get_table_of_contents",
    description="Достает все оглавления загруженных документов пользователя по id пользователя",
)
async def get_table_of_contents(
    runtime: Runtime[DocumentContext, dict[str, Any]],
) -> str | list[dict]:
    answer = await SqlDocumentRepository(session=runtime.state["sql_session"]).get_tocs(  # pyright: ignore[reportOptionalSubscript]
        owner_id=runtime.context.owner_id
    )
    if answer is None:
        return "У пользователя нету документов"
    return [{"toc_id": model.id, "toc": model.title} for model in answer]  # type: ignore  # ruff:ignore[blanket-type-ignore]


@tool(  # pyright: ignore[reportCallIssue]
    name="get_titles",
    description="Достает все заголовки документа по id оглавления",
)
async def get_titles(
    runtime: Runtime[DocumentContext, dict[str, Any]],
    toc_id: UUID,
) -> str | list[dict]:
    answer = await SqlDocumentRepository(session=runtime.state["sql_session"]).get_headings(  # pyright: ignore[reportOptionalSubscript]
        toc_id=toc_id
    )
    if answer is None:
        return "У пользователя нету документов"
    return [{"heading_id": model.id, "toc": model.title} for model in answer]  # type: ignore  # ruff:ignore[blanket-type-ignore]


@tool(  # pyright: ignore[reportCallIssue]
    name="get_content",
    description="Достает текст документа по id заголовка",
)
async def get_content(runtime: Runtime[DocumentContext, dict[str, Any]], heading_id: UUID) -> str:
    answer = await SqlDocumentRepository(session=runtime.state["sql_session"]).get_texts(  # pyright: ignore[reportOptionalSubscript]
        heading_id=heading_id
    )
    if answer is None:
        return "У пользователя нету документов"
    return answer.content  # type: ignore  # ruff:ignore[blanket-type-ignore]
