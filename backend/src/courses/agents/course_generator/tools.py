from typing import Any, Literal

import logging

from ddgs import DDGS
from pydantic import BaseModel, Field, NonNegativeFloat

from src.core.qdrant import qdrant_client
from src.courses.agents.course_generator.few_shots import (
    COURSE_STRUCTURE_FEW_SHOT,
    LESSON_STRUCTURE_FEW_SHOT,
    MODULE_STRUCTURE_FEW_SHOT,
)
from src.courses.agents.course_generator.subagents.prompts import (
    COURSE_STRUCTURE_PROMPT,
    LESSON_STRUCTURE_PROMPT,
    MODULE_STRUCTURE_PROMPT,
    CourseStructure,
    LessonStructure,
    ModuleStructure,
)
from src.courses.agents.tools import State
from src.courses.dependencies.base import splitter
from src.courses.infra.database.repos.vector_repo import QdrantRepository
from src.courses.utils.browser_automation import get_page_text
from src.llm_service import Runtime, tool
from src.llm_service.services import LLMTextService

from ..schemas import CourseContext

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


@tool(
    name="save_knowledge",
    description="Сохраняет информацию в базу знаний курса",
)
async def save_knowledge(
    runtime: Runtime[CourseContext, list[dict[str, Any]]],
    schema: SaveKnowledgeInput,
) -> str:
    """Сохраняет знания курса, чтобы результат был доступен после завершения операции."""
    logger.info(
        "Saving `%s` knowledge from %s, score %s%%, text: '%s ...'",
        schema.category,
        schema.source,
        schema.score,
        schema.text[:150],
    )

    await QdrantRepository(client=qdrant_client, splitter=splitter).create(
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


@tool(
    name="knowledge_search",
    description="Поиск информации в базе знаний курса",
)
async def knowledge_search(
    runtime: Runtime[CourseContext, list[dict[str, Any]]],
    schema: KnowledgeSearchInput,
) -> str:
    """Выполняет действие `knowledge_search`, чтобы поддержать основной сценарий модуля."""
    meta_filter = {"course_id": str(runtime.context.course_id)}
    if schema.category is not None:
        logger.info(
            "Searching knowledge by category - `%s` and query: '%s ...'",
            schema.category,
            schema.search_query[:100],
        )
        meta_filter["category"] = schema.category
    else:
        logger.info("Searching knowledge by query `%s`", schema.search_query[:100])

    docs = await QdrantRepository(client=qdrant_client, splitter=splitter).read(
        query=schema.search_query, metadata_filters=meta_filter
    )
    if not docs:
        return (
            f"По запросу '{schema.search_query}' (категория: {schema.category or 'любая'}) "
            "в базе знаний ничего не найдено. Не повторяй этот запрос с похожей "
            "формулировкой — либо измени категорию, либо переходи к следующему "
            "шагу плана без этой информации."
        )
    return "\n\n".join(docs)


class SearchInput(BaseModel):
    """Входные аргументы для поиска видео в RuTube"""

    search_query: str = Field(description="Запрос для поиска")


class BrowsePageInput(BaseModel):
    link: str = Field(description="Ссылка на страницу с которой нужно получить контент")


@tool(
    name="browse_page",
    description="Открывает WEB-страницу и возвращает текст вместе с URL источника",
)
async def browse_page(schema: BrowsePageInput) -> dict[str, str]:
    page_text = await get_page_text(schema.link)
    return {"source": schema.link, "text": page_text}


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


class MaterialsInput(BaseModel):
    materials: str = Field(description="Собранные данные в ходе интервью с пользователем")


@tool(
    name="course_structure",
    description="""\
    Создает структуру курса с примерной стоимостью.
    """,
)
async def course_structure(
    schema: MaterialsInput,
    runtime: Runtime[CourseContext, State],
) -> dict[str, dict[str, Any] | int]:
    agent = LLMTextService(client=runtime.state.client, system_prompt=COURSE_STRUCTURE_PROMPT)  # pyright: ignore[reportOptionalMemberAccess]
    request = await agent.invoke(
        messages=[
            *COURSE_STRUCTURE_FEW_SHOT,
            {
                "role": "user",
                "content": schema.materials,
            },
        ],
        schema=CourseStructure,
    )
    result = CourseStructure.model_validate(request.output)
    cost = len(result.module_descriptions) * 10 * 10 * 100

    return {
        "plan": result.model_dump(mode="json"),
        "cost": cost,
    }


@tool(
    name="module_structure",
    description="""\
    Создает структуру модуля с примерной стоимостью
    """,
)
async def module_structure(
    schema: MaterialsInput,
    runtime: Runtime[CourseContext, State],
) -> dict[str, dict[str, Any] | int]:
    agent = LLMTextService(client=runtime.state.client, system_prompt=MODULE_STRUCTURE_PROMPT)  # pyright: ignore[reportOptionalMemberAccess]
    request = await agent.invoke(
        messages=[
            *MODULE_STRUCTURE_FEW_SHOT,
            {
                "role": "user",
                "content": schema.materials,
            },
        ],
        schema=ModuleStructure,
    )
    result = ModuleStructure.model_validate(request.output)
    cost = len(result.lessons_descriptions) * 10 * 100

    return {
        "plan": result.model_dump(mode="json"),
        "cost": cost,
    }


@tool(
    name="lesson_structure",
    description="""\
    Создает структуру урока с примерной стоимостью
    """,
)
async def lesson_structure(
    schema: MaterialsInput,
    runtime: Runtime[CourseContext, State],
) -> dict[str, dict[str, Any] | int]:
    agent = LLMTextService(client=runtime.state.client, system_prompt=LESSON_STRUCTURE_PROMPT)  # pyright: ignore[reportOptionalMemberAccess]
    request = await agent.invoke(
        messages=[
            *LESSON_STRUCTURE_FEW_SHOT,
            {
                "role": "user",
                "content": schema.materials,
            },
        ],
        schema=LessonStructure,
    )
    result = LessonStructure.model_validate(request.output)
    cost = len(result.content_plan) * 100

    return {
        "plan": result.model_dump(mode="json"),
        "cost": cost,
    }
