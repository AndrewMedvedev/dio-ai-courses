from typing import Any, Literal

import logging

from pydantic import BaseModel, Field, NonNegativeFloat

from ....core.infrastructure import qdrant_client
from ....llm_service import Runtime, tool
from ...infra.repository import VectorRepository
from ..schemas import CourseContext

INDEX_NAME = "main-index"

logger = logging.getLogger(__name__)


class SaveKnowledgeInput(BaseModel):
    """Аргументы для сохранения знаний"""

    category: Literal["data", "web_research", "theory"] = Field(
        default="web_research",
        description="""\
            Тип знаний:
             - data - информация полученная из материалов преподавателя
             - web_research - информация полученная в ходе изучения предметной области
             - theory - сгенерированный теоретический материал уже созданного курса
            """,
    )
    source: str = Field(
        ...,
        description="Источник полученных знаний, например имя файла, URL адрес, название ресурса",
    )
    text: str = Field(..., description="Полезная информация, которую необходимо запомнить")
    score: NonNegativeFloat = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Насколько полезна информация, где 1 максимально релевантная информация",
    )


@tool(  # pyright: ignore[reportCallIssue]
    name="save_knowledge",
    description="Сохраняет информацию в базу знаний курса",
)
async def save_knowledge(
    runtime: Runtime[CourseContext, list[dict[str, Any]]],
    schema: SaveKnowledgeInput,
) -> str:
    logger.info(
        "Saving `%s` knowledge from %s, score %s%%, text: '%s ...'",
        schema.category,
        schema.source,
        schema.score,
        schema.text[:150],
    )

    await VectorRepository(client=qdrant_client).index_document(
        text=schema.text,
        metadata={
            "course_id": str(runtime.context.course_id),
            "source": schema.source,
            "category": schema.category,
            "score": schema.score,
        },
    )
    return "Данные успешно сохранены в базу знаний курса"


class KnowledgeSearchInput(BaseModel):
    search_query: str = Field(description="Запрос для поиска информации")
    category: Literal["data", "web_research", "theory"] | None = Field(
        default=None, description="Тип информации, который нужно найти"
    )


@tool(  # pyright: ignore[reportCallIssue]
    "knowledge_search",
    description="Поиск информации в базе знаний курса",
)
async def knowledge_search(
    runtime: Runtime[CourseContext, list[dict[str, Any]]],
    schema: KnowledgeSearchInput,
) -> str:
    meta_filter = {"tenant_id": str(runtime.context.course_id)}
    if schema.category is not None:
        logger.info(
            "Searching knowledge by category - `%s` and query: '%s ...'",
            schema.category,
            schema.search_query[:100],
        )
        meta_filter["category"] = schema.category
    else:
        logger.info("Searching knowledge by query `%s`", schema.search_query[:100])

    docs = await VectorRepository(client=qdrant_client).retrieve_documents(
        query=schema.search_query, metadata_filters=meta_filter
    )
    if docs == []:
        return (
            f"По запросу '{schema.search_query}' (категория: {schema.category or 'любая'}) "
            "в базе знаний ничего не найдено. Не повторяй этот запрос с похожей "
            "формулировкой — либо измени категорию, либо переходи к следующему "
            "шагу плана без этой информации."
        )
    return "\n\n".join(docs)
