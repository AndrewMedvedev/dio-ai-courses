from typing import NotRequired, TypedDict

import logging
import time
from asyncio import TaskGroup
from uuid import UUID

from langgraph.graph import END, START, StateGraph
from langgraph.runtime import Runtime
from sqlalchemy.exc import IntegrityError

from src.core.infrastructure import qdrant_client
from src.llm_service import LLMTextService

from ....application.domain_dtos import LessonDict
from ....application.mappers import dict_to_lesson, lesson_to_dict
from ....domain.entities import AnyContentBlock, ContentType, Lesson
from ....infra.database.repos.lesson import SqlLessonRepository
from ....infra.vector_repo import VectorRepository
from ....utils.formatting import get_content_blocks_context, get_lesson_context
from ...schemas import Context, RuntimeContext
from ..serializer import checkpointer
from .prompts import ContentSpecification, LessonStructure
from .theorist import call_theory_agent

logger = logging.getLogger(__name__)


class AgentState(TypedDict):
    """Состояние агента для создания модулей"""

    generation_context: Context
    module_id: UUID
    audience_description: str  # Описание целевой аудитории курса
    learning_objectives: list[str]  # Цели обучения курса
    order: int  # Порядковый номер урока
    lesson_description: str  # Описание урока из структуры модуля
    lesson_structure: NotRequired[LessonStructure]  # Структура/сценарий урока
    lesson: NotRequired[LessonDict]  # Сгенерированный урок


async def plan_lesson_structure(
    state: AgentState,
) -> dict[str, LessonStructure | LessonDict]:
    """Планирование структуры урока"""
    lesson_structure_planner = LLMTextService(
        system_prompt="""\
    Ты опытный методист и разработчик образовательных курсов.
    Твоя задача — спланировать детальную структуру одного урока: разбить материал
    на логичные контент-блоки и составить для каждого исчерпывающий промпт,
    по которому другой агент сможет самостоятельно сгенерировать качественный контент.

    Принципы работы:
    - Каждый промпт должен быть самодостаточным: агент-генератор не будет видеть
      описание урока, только твой промпт.
    - Выбирай тип контент-блока строго по смыслу: не используй musical_notation
      для чего-либо кроме нотных записей; не используй mermaid для формул.
    - Соблюдай дидактическую последовательность: от теории к практике,
      от простого к сложному.

    """,
        temperature=0.2,
    )

    prompt_template = f"""\
        Спланируй структуру урока на основе следующих данных:
        **Целевая аудитория:** {state["audience_description"]}
        **Цели обучения курса:** {", ".join(state["learning_objectives"])}
        **Порядковый номер урока в модуле:** {state["order"]}
        **Описание урока:** {state["lesson_description"]}
        Требования к результату:
        1. Сформируй 4–5 контент-блоков, покрывающих тему урока от введения до закрепления.
        2. Для каждого блока напиши подробный промпт (минимум 4–5 предложений),
           учитывающий уровень аудитории и цели урока.
        3. Выбери тип каждого блока исходя из содержания (text, program_code, mermaid,
           quiz, math_formula, chemical_formula, musical_notation, image).
        4. Блок типа image используй только если визуальная иллюстрация действительно
           необходима для понимания материала. В одном уроке может быть строго
           максимум одно изображение (один блок типа image).

        """
    logger.info(
        "Planning %s - module structure by description: '%s ...'",
        state["order"],
        state["lesson_description"][:100],
    )
    result = await lesson_structure_planner.invoke(
        schema=LessonStructure, messages=[{"role": "user", "content": prompt_template}]
    )

    lesson_structure = LessonStructure.model_validate(result.output)
    logger.info(
        "Module structure is done, start filling `title`, `description`, `learning_objectives` ..."
    )
    lesson = Lesson(
        module_id=state["module_id"],
        title=lesson_structure.title,
        description=lesson_structure.description,
        learning_objectives=lesson_structure.learning_objectives,
        order=state["order"],
    )
    return {"lesson_structure": lesson_structure, "lesson": lesson_to_dict(lesson)}


async def build_content_block(
    order: int,
    content_type: ContentType,
    generation_context: Context,
    content_plan: list[ContentSpecification],
    prompt: str,
    lesson: Lesson,
) -> tuple[int, AnyContentBlock]:
    """Собирает контент-блок из входных данных для следующего шага сценария."""
    start_time = time.monotonic()
    progress_percent = round((order / len(content_plan)) * 100, 2)
    logger.info(
        "%s%% Generating `%s` content block for current plan: '%s'",
        progress_percent,
        content_type.value,
        prompt[:100],
    )

    prompt_template = (
        "# Контекст текущего урока:\n"
        f"{get_lesson_context(lesson, include_content_blocks=False)}\n\n"
        f"# Сгенерируй контент блок с заданным типом - '{content_type.value}':\n"
        f"**Промпт**: {prompt}"
    )
    content_block = await call_theory_agent(
        content_type=content_type,
        context=generation_context,
        prompt=prompt_template,
    )
    elapsed_time = time.monotonic() - start_time
    logger.info(
        "Added `%s` content block in module, generation time - %s seconds",
        content_type.value,
        round(elapsed_time, 2),
    )
    return order, content_block


async def generate_content_blocks(state: AgentState) -> dict[str, LessonDict]:
    """Генерация контент блоков с помощью субагента - теоретика,
    используя сгенерированный план
    """

    lesson_structure, lesson = state["lesson_structure"], dict_to_lesson(state["lesson"])  # type: ignore  # ruff:ignore[blanket-type-ignore]
    logger.info("Starting generate %s content blocks ...", len(lesson_structure.content_plan))

    async with TaskGroup() as tg:
        tasks = [
            tg.create_task(
                build_content_block(
                    order=order,
                    generation_context=state["generation_context"],
                    content_type=content.content_type,
                    content_plan=lesson_structure.content_plan,
                    prompt=content.prompt,
                    lesson=lesson,
                )
            )
            for order, content in enumerate(lesson_structure.content_plan, start=1)
        ]
    content_by_order = sorted(task.result() for task in tasks)
    for _, content in content_by_order:
        lesson.append_content_block(content)
    logger.info(
        "Saving generated content blocks of `%s` module to knowledge base ...",
        lesson.title,
    )

    return {"lesson": lesson_to_dict(lesson)}


async def save_lesson(state: AgentState, runtime: Runtime[RuntimeContext]) -> None:
    """Сохраняет урок, чтобы результат был доступен после завершения операции."""
    lesson = dict_to_lesson(state["lesson"])  # type: ignore  # ruff:ignore[blanket-type-ignore]

    await VectorRepository(client=qdrant_client).index_document(
        text=get_content_blocks_context(lesson.content_blocks),
        metadata={
            "course_id": state["generation_context"].course_id,
            "lesson_id": f"{lesson.id}",
            "source": f"{lesson.title}",
            "category": "theory",
        },
    )

    logger.info("Saving lesson '%s' to database ...", lesson.title)
    try:
        await SqlLessonRepository(runtime.context.db_session).create(lesson)  # pyright: ignore[reportArgumentType]
        await runtime.context.db_session.commit()  # pyright: ignore[reportOptionalMemberAccess]
    except IntegrityError:
        logger.info("Lesson %s alredy exsists", lesson.title)


graph = StateGraph(AgentState, context_schema=RuntimeContext)

graph.add_node("plan_lesson_structure", plan_lesson_structure)
graph.add_node("generate_content_blocks", generate_content_blocks)
graph.add_node("save_lesson", save_lesson)
graph.add_edge(START, "plan_lesson_structure")
graph.add_edge("plan_lesson_structure", "generate_content_blocks")
graph.add_edge("generate_content_blocks", "save_lesson")
graph.add_edge("save_lesson", END)

lesson_builder_agent = graph.compile(checkpointer=checkpointer)
